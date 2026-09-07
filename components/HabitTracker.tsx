import React, { useState, useMemo, useCallback } from 'react';
import { HabitItem } from '../types';
import { playSoundEffect } from '../utils';

// ============ 每日好习惯奖励登记（桌面三栏版） ============
// 设计原则（尊重孩子意愿）：
// 1. 目标和奖励由孩子自己定（心愿、想要的奖励），家长只负责标定分值与价格；
// 2. 三栏桌面布局：左「目标契约+每日曲线」· 中「今日打卡」· 右「奖励兑换+积分流水」，
//    一屏聚焦当日行动，不再纵向堆 5 张通栏卡；
// 3. 本周期回顾：近 7 天成就统计（打卡次数/全达成天数/连续天数）+ 近 4 周热力图 +
//    兑换记录，让一个周期里完成了什么、换了什么奖品看得见、可回顾；
// 4. 数据存 localStorage（amomo_typing_habits_v2 / amomo_typing_habit_rewards_v2），结构不变向后兼容。

const LS_KEY = 'amomo_typing_habits_v2';
const LS_KEY_REWARDS = 'amomo_typing_habit_rewards_v2';
const DAY_MS = 86400000;

const DEFAULT_HABITS: HabitItem[] = [
  { id: 'exercise', name: '体育锻炼', emoji: '🏃', targetPerDay: 1, pointsPerTime: 3, records: {} },
  { id: 'express', name: '清晰表达自己想法', emoji: '🗣️', targetPerDay: 1, pointsPerTime: 3, records: {} },
  { id: 'polite', name: '礼貌对待师长', emoji: '🙏', targetPerDay: 2, pointsPerTime: 2, records: {} },
  { id: 'idea', name: '小脑袋冒出新点子', emoji: '💡', targetPerDay: 1, pointsPerTime: 3, records: {} },
  { id: 'eyes', name: '爱护眼睛', emoji: '👀', targetPerDay: 3, pointsPerTime: 1, records: {} },
  { id: 'water', name: '好好喝水', emoji: '💧', targetPerDay: 3, pointsPerTime: 1, records: {} },
  { id: 'poop', name: '拉臭臭', emoji: '🚽', targetPerDay: 1, pointsPerTime: 3, records: {} },
];

export interface RewardItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;      // 兑换所需积分（0 = 待家长定价，孩子加入的奖励默认待定价）
  redeemed: number;  // 已兑换次数
  byChild?: boolean; // 孩子自己添加的
}

interface LedgerEntry {
  id: string;
  ts: number;                 // 时间戳
  type: 'earn' | 'redeem';    // 获得 / 兑换
  amount: number;             // 积分变动（earn 正 / redeem 负）
  note: string;               // 说明（习惯名 / 奖励名）
}

interface RewardStore {
  points: number;             // 积分余额
  goal: string;               // 孩子自己定的心愿目标
  rewards: RewardItem[];
  ledger: LedgerEntry[];      // 积分流水（新在前，最多留 300 条）
}

const DEFAULT_REWARDS: RewardItem[] = [
  { id: 'rw_icecream', name: '冰淇淋一个', emoji: '🍦', cost: 20, redeemed: 0 },
  { id: 'rw_cartoon', name: '动画片 30 分钟', emoji: '📺', cost: 30, redeemed: 0 },
  { id: 'rw_game', name: '亲子游戏 1 局', emoji: '🎲', cost: 40, redeemed: 0 },
  { id: 'rw_book', name: '新绘本一本', emoji: '📚', cost: 60, redeemed: 0 },
  { id: 'rw_park', name: '游乐园半天', emoji: '🎡', cost: 200, redeemed: 0 },
];

const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dateStrOf = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

const loadHabits = (): HabitItem[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_HABITS;
    const parsed = JSON.parse(raw) as HabitItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_HABITS;
    const ids = new Set(parsed.map(h => h.id));
    const merged = [...parsed, ...DEFAULT_HABITS.filter(d => !ids.has(d.id))];
    return merged.map(h => ({ ...h, records: h.records || {} }));
  } catch {
    return DEFAULT_HABITS;
  }
};

const loadRewardStore = (): RewardStore => {
  try {
    const raw = localStorage.getItem(LS_KEY_REWARDS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RewardStore>;
      return {
        points: typeof parsed.points === 'number' ? parsed.points : 0,
        goal: typeof parsed.goal === 'string' ? parsed.goal : '',
        rewards: Array.isArray(parsed.rewards) && parsed.rewards.length > 0 ? parsed.rewards : DEFAULT_REWARDS,
        ledger: Array.isArray(parsed.ledger) ? parsed.ledger.slice(0, 300) : []
      };
    }
  } catch { /* ignore */ }
  return { points: 0, goal: '', rewards: DEFAULT_REWARDS, ledger: [] };
};

const fmtTime = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDay = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

interface HabitTrackerProps {
  onEarnCoins?: (amount: number) => void;
}

export const HabitTracker: React.FC<HabitTrackerProps> = ({ onEarnCoins }) => {
  const [habits, setHabits] = useState<HabitItem[]>(loadHabits);
  const [store, setStore] = useState<RewardStore>(loadRewardStore);
  const [parentMode, setParentMode] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [celebrateReward, setCelebrateReward] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  // 孩子自助添加奖励（非家长模式也可用；价格由家长标定）
  const [addingReward, setAddingReward] = useState(false);
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardEmoji, setNewRewardEmoji] = useState('🌟');
  // 家长新增奖励的临时输入
  const [newRewardCost, setNewRewardCost] = useState(30);
  const [newParentRewardName, setNewParentRewardName] = useState('');
  const [newParentRewardEmoji, setNewParentRewardEmoji] = useState('🎁');
  const today = todayStr();

  const persist = (next: HabitItem[]) => {
    setHabits(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  };

  // 家长模式状态上报到 main（矮视口 CSS 钩子：设置视图单独缩放保证不滚动）
  React.useEffect(() => {
    const main = document.querySelector('main');
    if (main) main.setAttribute('data-parent-mode', parentMode ? '1' : '0');
    return () => { main?.removeAttribute('data-parent-mode'); };
  }, [parentMode]);

  const persistStore = (next: RewardStore) => {
    const trimmed = { ...next, ledger: next.ledger.slice(0, 300) };
    setStore(trimmed);
    localStorage.setItem(LS_KEY_REWARDS, JSON.stringify(trimmed));
  };

  const todayCount = useCallback((h: HabitItem) => h.records[today] || 0, [today]);

  // 今日总得分 / 总目标
  const { todayPoints, todayDone, todayTotal } = useMemo(() => {
    let pts = 0, done = 0, total = 0;
    for (const h of habits) {
      const c = h.records[today] || 0;
      const eff = Math.min(c, h.targetPerDay);
      done += eff;
      total += h.targetPerDay;
      pts += eff * h.pointsPerTime;
    }
    return { todayPoints: pts, todayDone: done, todayTotal: total };
  }, [habits, today]);

  // 最近 7 天（含今天）每日达成数 —— 本周期 = 近 7 天滚动窗口
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const ds = dateStrOf(i - 6);
      const d = new Date(ds + 'T00:00:00');
      let done = 0, total = 0;
      for (const h of habits) {
        const c = Math.min(h.records[ds] || 0, h.targetPerDay);
        done += c;
        total += h.targetPerDay;
      }
      return { ds, label: WEEKDAY_ZH[d.getDay()], done, total, isToday: ds === today };
    });
  }, [habits, today]);

  const weekSummary = useMemo(() => {
    const done = last7.reduce((a, d) => a + d.done, 0);
    const total = last7.reduce((a, d) => a + d.total, 0);
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [last7]);

  // 本周期成就统计：打卡次数 / 全达成天数 / 连续天数 / 本周期获得积分
  const cycleStats = useMemo(() => {
    let checkins = 0, fullDays = 0;
    for (const d of last7) {
      checkins += d.done;
      if (d.total > 0 && d.done >= d.total) fullDays++;
    }
    let streak = 0;
    for (let i = last7.length - 1; i >= 0; i--) {
      if (last7[i].done > 0) streak++;
      else if (last7[i].isToday) continue; // 今天还没打卡不算中断
      else break;
    }
    const now = Date.now();
    const earnPts = store.ledger
      .filter(l => l.type === 'earn' && now - l.ts < 7 * DAY_MS)
      .reduce((a, l) => a + l.amount, 0);
    return { checkins, fullDays, streak, earnPts };
  }, [last7, store.ledger]);

  // 本周期兑换记录（回顾"换了什么奖品"）
  const cycleRedeems = useMemo(() => {
    const now = Date.now();
    return store.ledger.filter(l => l.type === 'redeem' && now - l.ts < 7 * DAY_MS);
  }, [store.ledger]);

  // 近 4 周热力图：以"本周周日"为起点回推 3 周，28 格按周对齐列
  const heat28 = useMemo(() => {
    const dow = new Date().getDay();          // 0=周日
    const startOff = -dow - 21;               // 三周前的周日
    return Array.from({ length: 28 }, (_, i) => {
      const off = startOff + i;
      const ds = dateStrOf(off);
      const d = new Date(ds + 'T00:00:00');
      let done = 0, total = 0;
      for (const h of habits) {
        done += Math.min(h.records[ds] || 0, h.targetPerDay);
        total += h.targetPerDay;
      }
      const future = off > 0;
      return { ds, day: d.getDate(), done, total, pct: total > 0 ? done / total : 0, future, isToday: off === 0 };
    });
  }, [habits]);

  // 积分余额最接近且买得起的奖励（目标进度条用）
  const nextAffordable = useMemo(() => {
    const priced = store.rewards.filter(r => r.cost > 0);
    const sorted = [...priced].sort((a, b) => a.cost - b.cost);
    return sorted.find(r => r.cost > store.points) || sorted[sorted.length - 1];
  }, [store.rewards, store.points]);

  const pushLedger = (s: RewardStore, entry: Omit<LedgerEntry, 'id' | 'ts'>): RewardStore => ({
    ...s,
    ledger: [{ ...entry, id: `lg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ts: Date.now() }, ...s.ledger]
  });

  const handleCheckIn = (h: HabitItem) => {
    const cur = h.records[today] || 0;
    if (cur >= h.targetPerDay) {
      playSoundEffect('pop', 0.14);
      return;
    }
    const next = cur + 1;
    persist(habits.map(x => x.id === h.id ? { ...x, records: { ...x.records, [today]: next } } : x));
    onEarnCoins?.(h.pointsPerTime);
    persistStore(pushLedger({ ...store, points: store.points + h.pointsPerTime }, { type: 'earn', amount: h.pointsPerTime, note: `${h.emoji} ${h.name}` }));
    if (next >= h.targetPerDay) {
      playSoundEffect('victory', 0.28);
      playSoundEffect('sparkle', 0.2);
      setCelebrate(h.id);
      setTimeout(() => setCelebrate(null), 1800);
    } else {
      playSoundEffect('coin', 0.2);
    }
  };

  const handleUndo = (h: HabitItem) => {
    const cur = h.records[today] || 0;
    if (cur <= 0) return;
    const next = cur - 1;
    const records = { ...h.records };
    if (next <= 0) delete records[today]; else records[today] = next;
    persist(habits.map(x => x.id === h.id ? { ...x, records } : x));
    playSoundEffect('click', 0.12);
    // 撤销不退积分/金币（防刷分）
  };

  const updateHabit = (id: string, patch: Partial<Pick<HabitItem, 'targetPerDay' | 'pointsPerTime'>>) => {
    persist(habits.map(h => h.id === id ? { ...h, ...patch } : h));
    playSoundEffect('click', 0.12);
  };

  // ===== 孩子目标 =====
  const startEditGoal = () => {
    setGoalDraft(store.goal);
    setEditingGoal(true);
    playSoundEffect('click', 0.12);
  };
  const confirmGoal = () => {
    persistStore({ ...store, goal: goalDraft.trim().slice(0, 30) });
    setEditingGoal(false);
    playSoundEffect('victory', 0.2);
  };

  // ===== 奖励兑换 =====
  const handleRedeem = (r: RewardItem) => {
    if (r.cost <= 0 || store.points < r.cost) {
      playSoundEffect('error', 0.15);
      return;
    }
    persistStore(pushLedger({
      ...store,
      points: store.points - r.cost,
      rewards: store.rewards.map(x => x.id === r.id ? { ...x, redeemed: x.redeemed + 1 } : x)
    }, { type: 'redeem', amount: -r.cost, note: `${r.emoji} ${r.name}` }));
    playSoundEffect('victory', 0.3);
    playSoundEffect('sparkle', 0.25);
    setCelebrateReward(r.id);
    setTimeout(() => setCelebrateReward(null), 2200);
  };

  // ===== 添加奖励（孩子 / 家长通用；孩子添加的默认待家长定价） =====
  const addReward = (emoji: string, name: string, cost: number, byChild: boolean) => {
    const n = name.trim();
    if (!n) return;
    persistStore({
      ...store,
      rewards: [...store.rewards, {
        id: `rw_${Date.now()}`,
        name: n.slice(0, 20),
        emoji: emoji || '🎁',
        cost: byChild ? 0 : Math.max(1, Math.min(9999, cost || 1)),
        redeemed: 0,
        byChild
      }]
    });
    playSoundEffect('victory', 0.18);
  };
  const updateReward = (id: string, patch: Partial<Pick<RewardItem, 'name' | 'cost' | 'emoji'>>) => {
    persistStore({ ...store, rewards: store.rewards.map(r => r.id === id ? { ...r, ...patch } : r) });
    playSoundEffect('click', 0.12);
  };
  const removeReward = (id: string) => {
    persistStore({ ...store, rewards: store.rewards.filter(r => r.id !== id) });
    playSoundEffect('click', 0.12);
  };

  return (
    <div className="w-full max-w-7xl flex flex-col gap-4 animate-fade-in mx-auto px-2">
      {/* 顶部横幅：标题 + 今日概览 + 家长设置 */}
      <div className="story-card px-5 py-3.5 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-4xl animate-float-y select-none">🌟</span>
          <div>
            <h2 className="text-2xl font-black text-[#5B4636] font-kids leading-tight">好习惯打卡</h2>
            <p className="text-[11px] text-[#8A6F5C] font-bold mt-0.5">
              {today.replace(/-/g, ' / ')} · 自己定目标，攒分换心愿
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-[#FFF3D6] px-3.5 py-1.5 rounded-2xl border-3 border-[#FFE3A3] shadow-[0_3px_0_rgba(232,163,23,0.3)] flex items-center gap-2">
            <span className="text-xl">🪙</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-black text-[#8A5F00]">今日已得</span>
              <span className="text-lg font-black text-[#8A5F00]">{todayPoints} 分</span>
            </div>
          </div>

          <div className="bg-[#E5F6EC] px-3.5 py-1.5 rounded-2xl border-3 border-[#B8E8C6] shadow-[0_3px_0_rgba(72,167,87,0.25)] flex items-center gap-2">
            <span className="text-xl">💎</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-black text-[#357F43]">积分余额</span>
              <span className="text-lg font-black text-[#357F43]">{store.points} 分</span>
            </div>
          </div>

          <div className="bg-[#FFE9E0] px-3.5 py-1.5 rounded-2xl border-3 border-[#FFD1BE] shadow-[0_3px_0_rgba(224,99,58,0.2)] flex items-center gap-2">
            <span className="text-xl">✅</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-black text-[#E0633A]">今日进度</span>
              <span className="text-lg font-black text-[#E0633A]">{todayDone}/{todayTotal}</span>
            </div>
          </div>

          <button
            onClick={() => { playSoundEffect('click'); setParentMode(p => !p); }}
            className={`px-4 py-2 rounded-2xl text-xs font-black border-3 transition-all ${
              parentMode
                ? 'bg-[#8258C7] text-white border-[#6A3FB0] shadow-[0_3px_0_#6A3FB0]'
                : 'bg-white text-[#8A6F5C] border-[#FFE8C8] hover:border-[#FFC94D]'
            }`}
            title="家长设置每个习惯的目标与分值、为奖励标价"
          >
            {parentMode ? '✅ 家长模式中' : '🔒 家长设置'}
          </button>
        </div>
      </div>

      {/* 主体三栏：左「目标契约+每日曲线」· 中「今日打卡」· 右「奖励+流水」 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ============ 左栏 ============ */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* 我们的心愿约定（孩子自己改） */}
          <div className="story-card p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl select-none">🎯</span>
                <span className="text-sm font-black text-[#E0633A] font-kids">我们的心愿约定</span>
              </div>
              {!editingGoal && (
                <button
                  onClick={startEditGoal}
                  className="w-6 h-6 rounded-lg bg-[#FFE9E0] hover:bg-[#FFD1BE] text-[#E0633A] text-xs flex items-center justify-center border border-[#FFD1BE] transition-all active:scale-90"
                  title="修改我的心愿"
                >
                  ✏️
                </button>
              )}
            </div>
            {editingGoal ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={goalDraft}
                  onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); confirmGoal(); }
                    if (e.key === 'Escape') setEditingGoal(false);
                  }}
                  maxLength={30}
                  placeholder="例如：攒够积分去动物园！"
                  className="flex-1 px-3 py-2 rounded-xl border-3 border-[#FFC94D] bg-white font-black text-sm text-[#5B4636] focus:outline-none focus:ring-4 focus:ring-[#FFC94D]/40"
                />
                <button onClick={confirmGoal} className="btn-candy btn-grass px-3 py-2 text-xs" title="保存（回车）">✓</button>
                <button onClick={() => setEditingGoal(false)} className="px-2.5 py-2 rounded-xl bg-[#F5EBDA] text-[#8A6F5C] text-xs font-black" title="取消（Esc）">✕</button>
              </div>
            ) : (
              <p className={`text-lg font-black font-kids leading-snug min-h-[3.2em] flex items-center ${store.goal ? 'text-[#5B4636]' : 'text-[#C4AE97]'}`}>
                {store.goal || '点 ✏️ 和爸爸妈妈一起写下小心愿吧！'}
              </p>
            )}
            {nextAffordable && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-[#357F43]">下一个心愿：{nextAffordable.emoji}{nextAffordable.name}</span>
                  <span className="text-[11px] font-black text-[#357F43] whitespace-nowrap">
                    {Math.max(0, nextAffordable.cost - store.points)} 分
                  </span>
                </div>
                <div className="h-2.5 bg-[#F5EBDA] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#6BCB77] to-[#48A757] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (store.points / nextAffordable.cost) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 每日完成曲线（追踪每天的变化） */}
          <div className="story-card p-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-[#5B4636] font-kids flex items-center gap-1.5">📈 每日完成曲线</span>
              <span className="text-[10px] font-black text-[#357F43] bg-[#E5F6EC] px-2 py-0.5 rounded-full border border-[#B8E8C6]">
                本周期 {weekSummary.done}/{weekSummary.total} 项
              </span>
            </div>
            <svg viewBox="0 0 320 96" className="w-full h-[96px] select-none">
              <line x1="16" y1="84" x2="312" y2="84" stroke="#F0E4D2" strokeWidth="1.5" />
              <line x1="16" y1="52" x2="312" y2="52" stroke="#F7EFE2" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="16" y1="20" x2="312" y2="20" stroke="#F7EFE2" strokeWidth="1" strokeDasharray="3 3" />
              {(() => {
                const pts = last7.map((d, i) => {
                  const pct = d.total > 0 ? d.done / d.total : 0;
                  return { x: 32 + i * 44, y: Math.round(84 - pct * 62), pct };
                });
                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                return (
                  <>
                    <path d={path} fill="none" stroke="#48A757" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={last7[i].isToday ? 5 : 3.5}
                          fill={last7[i].isToday ? '#FF8A5C' : p.pct >= 1 ? '#6BCB77' : '#FFF'}
                          stroke={p.pct >= 1 || last7[i].isToday ? '#fff' : '#48A757'} strokeWidth="2" />
                        <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="8.5" fontWeight="900" fill={p.pct >= 1 ? '#48A757' : '#8A6F5C'}>
                          {Math.round(p.pct * 100)}%
                        </text>
                        <text x={p.x} y="95" textAnchor="middle" fontSize="9" fontWeight="900" fill={last7[i].isToday ? '#E0633A' : '#8A6F5C'}>
                          {last7[i].isToday ? '今天' : `周${last7[i].label}`}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* ============ 中栏：今日打卡（主行动区） ============ */}
        <div className="lg:col-span-5 story-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-[#5B4636] font-kids flex items-center gap-1.5">✅ 今日打卡</span>
            <span className="text-[11px] font-bold text-[#8A6F5C]">
              {parentMode ? '家长模式：调整目标与分值' : '完成一项点一下，得分自动记账'}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {habits.map(h => {
              const cur = todayCount(h);
              const done = cur >= h.targetPerDay;
              const pct = Math.min(100, (cur / h.targetPerDay) * 100);
              return (
                <div
                  key={h.id}
                  className={`relative overflow-hidden flex items-center gap-3 rounded-2xl border-3 px-3 py-2 transition-all ${
                    done ? 'border-[#8FDCAB] bg-[#F2FBF4]' : 'border-[#FFE8C8] bg-[#FFF8EE]'
                  }`}
                >
                  {celebrate === h.id && (
                    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
                      {['🎉', '⭐', '🎊', '✨', '🌟'].map((e, i) => (
                        <span key={i} className="absolute text-2xl animate-confetti select-none"
                          style={{ left: `${10 + i * 20}%`, animationDelay: `${i * 0.1}s` }}>{e}</span>
                      ))}
                      <span className="bg-[#6BCB77] text-white font-black text-sm px-4 py-1.5 rounded-full border-3 border-white shadow-lg animate-bounce select-none z-10">
                        达成目标！+{h.pointsPerTime} 分 🎉
                      </span>
                    </div>
                  )}

                  <span className={`text-3xl select-none shrink-0 ${done ? 'animate-breathe' : ''}`}>{h.emoji}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-[#5B4636] truncate">{h.name}</span>
                      <span className="text-[10px] font-black text-[#8A6F5C] shrink-0">+{h.pointsPerTime}分/次</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1 shrink-0">
                        {Array.from({ length: h.targetPerDay }, (_, i) => (
                          <span
                            key={i}
                            className={`w-3 h-3 rounded-full border-2 transition-all ${
                              i < cur ? 'bg-[#6BCB77] border-[#48A757] scale-110' : 'bg-white border-[#FFE8C8]'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex-1 h-2 bg-[#F5EBDA] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-gradient-to-r from-[#6BCB77] to-[#48A757]' : 'bg-gradient-to-r from-[#FFC94D] to-[#E8A317]'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-[#8A6F5C] shrink-0 w-8 text-right">{cur}/{h.targetPerDay}</span>
                    </div>
                  </div>

                  {/* 打卡按钮 / 家长模式：编辑目标与分值 */}
                  {parentMode ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="flex items-center gap-0.5 text-[9px] font-black text-[#8A6F5C]" title="每日目标次数">
                        目标
                        <input
                          type="number" min={1} max={9}
                          value={h.targetPerDay}
                          onChange={e => updateHabit(h.id, { targetPerDay: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })}
                          className="w-10 px-1 py-1 rounded-lg border-2 border-[#E2D0F2] bg-[#F3E9FA] text-center font-black text-[#8258C7] outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-0.5 text-[9px] font-black text-[#8A6F5C]" title="每次得分">
                        分值
                        <input
                          type="number" min={1} max={20}
                          value={h.pointsPerTime}
                          onChange={e => updateHabit(h.id, { pointsPerTime: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                          className="w-10 px-1 py-1 rounded-lg border-2 border-[#E2D0F2] bg-[#F3E9FA] text-center font-black text-[#8258C7] outline-none"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleUndo(h)}
                        disabled={cur <= 0}
                        className="w-8 h-8 rounded-xl bg-white text-[#8A6F5C] border-2 border-[#FFE8C8] font-black text-sm disabled:opacity-30 hover:border-[#FF8A5C] transition-all active:scale-90"
                        title="撤销一次（误点用）"
                      >
                        −1
                      </button>
                      <button
                        onClick={() => handleCheckIn(h)}
                        disabled={done}
                        className={`btn-candy px-4 py-1.5 text-sm whitespace-nowrap ${done ? 'btn-grass opacity-70' : 'btn-grass'}`}
                      >
                        {done ? '已完成 ✨' : '打卡 +1'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ 右栏 ============ */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* 奖励兑换（孩子可自助添加想要的奖励；家长模式为奖励标价） */}
          <div className="story-card p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl select-none">🎁</span>
                <span className="text-sm font-black text-[#8258C7] font-kids">奖励兑换</span>
              </div>
              <div className="flex items-center gap-2">
                {!parentMode && !addingReward && (
                  <button
                    onClick={() => { setNewRewardName(''); setAddingReward(true); playSoundEffect('click', 0.12); }}
                    className="text-[11px] font-black text-[#8258C7] bg-[#F3E9FA] hover:bg-[#E2D0F2] px-2.5 py-1 rounded-full border-2 border-[#E2D0F2] transition-all active:scale-95"
                  >
                    ➕ 我想要的
                  </button>
                )}
                <span className="text-[11px] font-black text-[#357F43] bg-[#E5F6EC] px-2.5 py-1 rounded-full border-2 border-[#B8E8C6] whitespace-nowrap">
                  💎 {store.points} 分
                </span>
              </div>
            </div>

            {/* 孩子添加奖励的输入行 */}
            {addingReward && !parentMode && (
              <div className="flex items-center gap-1.5 flex-wrap bg-[#FAF5FF] rounded-xl px-2.5 py-2 border-2 border-[#E2D0F2] animate-fade-in">
                <span className="text-[11px] font-black text-[#8258C7]">✨ 我想要：</span>
                <input
                  value={newRewardEmoji}
                  onChange={e => setNewRewardEmoji(e.target.value.slice(0, 2))}
                  className="w-8 text-center text-sm rounded-lg border-2 border-[#E2D0F2] bg-white py-1 outline-none focus:border-[#8258C7]"
                  title="选个图标"
                />
                <input
                  autoFocus
                  value={newRewardName}
                  onChange={e => setNewRewardName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addReward(newRewardEmoji, newRewardName, 0, true);
                      setAddingReward(false);
                    }
                  }}
                  placeholder="写下奖励（如：周末吃火锅）"
                  maxLength={20}
                  className="flex-1 min-w-[120px] px-2 py-1 rounded-lg border-2 border-[#E2D0F2] bg-white text-xs font-bold text-[#5B4636] outline-none focus:border-[#8258C7]"
                />
                <button onClick={() => { addReward(newRewardEmoji, newRewardName, 0, true); setAddingReward(false); }} className="btn-candy btn-grape px-3 py-1 text-xs">加入</button>
                <button onClick={() => setAddingReward(false)} className="px-2.5 py-1 rounded-lg bg-[#F5EBDA] text-[#8A6F5C] text-xs font-black">取消</button>
                <span className="text-[10px] text-[#8A6F5C] font-bold w-full">💡 加入后先「待定价」，请爸爸妈妈标好需要的积分就能兑换啦</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {store.rewards.map(r => {
                const priced = r.cost > 0;
                const affordable = priced && store.points >= r.cost;
                const celebrating = celebrateReward === r.id;
                return (
                  <div
                    key={r.id}
                    className={`relative rounded-2xl border-3 p-2 flex flex-col items-center gap-1 transition-all ${
                      celebrating
                        ? 'border-[#FFC94D] bg-[#FFF3D6] scale-105 shadow-lg'
                        : affordable
                        ? 'border-[#B8E8C6] bg-white hover:border-[#6BCB77] hover:shadow-md'
                        : 'border-[#F5EBDA] bg-[#FFFBF5] opacity-80'
                    }`}
                  >
                    {celebrating && (
                      <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center rounded-2xl bg-[#FFF3D6]/95">
                        {['🎉', '✨', '🎊', '⭐'].map((e, i) => (
                          <span key={i} className="absolute text-xl animate-confetti select-none"
                            style={{ left: `${12 + i * 22}%`, animationDelay: `${i * 0.1}s` }}>{e}</span>
                        ))}
                        <span className="text-[11px] font-black text-[#8A5F00] text-center leading-tight px-1">
                          兑换成功！<br />找爸妈兑现 🎉
                        </span>
                      </div>
                    )}
                    <span className="text-2xl select-none">{r.emoji}</span>
                    <span className="text-[11px] font-black text-[#5B4636] text-center leading-tight min-h-[2em] flex items-center">
                      {r.name}
                      {r.byChild && <span className="ml-0.5 text-[9px] font-black text-[#8258C7] bg-[#F3E9FA] rounded px-1" title="我想要的">我</span>}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${priced ? 'text-[#8258C7] bg-[#F3E9FA]' : 'text-[#B8860B] bg-[#FFF3D6]'}`}>
                      {priced ? `💎 ${r.cost} 分` : '⏳ 待定价'}{r.redeemed > 0 ? ` · 已换${r.redeemed}次` : ''}
                    </span>
                    <button
                      onClick={() => handleRedeem(r)}
                      disabled={!affordable}
                      className={`w-full py-1 rounded-xl text-xs font-black transition-all active:scale-95 ${
                        affordable
                          ? 'btn-candy btn-grass'
                          : 'bg-[#F5EBDA] text-[#C4AE97] cursor-not-allowed'
                      }`}
                      title={priced ? (affordable ? '用积分兑换' : `还差 ${r.cost - store.points} 分`) : '等爸爸妈妈定价'}
                    >
                      {priced ? (affordable ? '兑换 🎉' : `差 ${r.cost - store.points} 分`) : '待定价'}
                    </button>
                    {/* 家长模式：标价/删除 */}
                    {parentMode && (
                      <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 z-10">
                        <button
                          onClick={() => {
                            const v = window.prompt('为该奖励标定积分（1-9999）：', String(r.cost || 10));
                            if (v !== null) updateReward(r.id, { cost: Math.max(1, Math.min(9999, Number(v) || 1)) });
                          }}
                          className="w-5 h-5 rounded-md bg-white text-[#8258C7] text-[10px] font-black flex items-center justify-center border border-[#E2D0F2] hover:bg-[#F3E9FA] transition-all active:scale-90"
                          title="标价（所需积分）"
                        >
                          💎
                        </button>
                        <button
                          onClick={() => removeReward(r.id)}
                          className="w-5 h-5 rounded-md bg-white text-[#E0678A] text-[10px] font-black flex items-center justify-center border border-[#FFD3E0] hover:bg-[#FFE9F0] transition-all active:scale-90"
                          title="删除该奖励"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 家长模式：批量说明 + 新增奖励 */}
            {parentMode && (
              <div className="pt-2.5 border-t-2 border-[#F5EBDA] flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-black text-[#8258C7]">💎 点奖励角上的 💎 标价 · ➕ 新增：</span>
                <input
                  value={newParentRewardEmoji}
                  onChange={e => setNewParentRewardEmoji(e.target.value.slice(0, 2))}
                  className="w-8 text-center text-sm rounded-lg border-2 border-[#E2D0F2] bg-white py-1 outline-none focus:border-[#8258C7]"
                  title="图标"
                />
                <input
                  value={newParentRewardName}
                  onChange={e => setNewParentRewardName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addReward(newParentRewardEmoji, newParentRewardName, newRewardCost, false);
                      setNewParentRewardName('');
                    }
                  }}
                  placeholder="奖励名称"
                  maxLength={20}
                  className="w-32 px-2 py-1 rounded-lg border-2 border-[#E2D0F2] bg-white text-xs font-bold text-[#5B4636] outline-none focus:border-[#8258C7]"
                />
                <input
                  type="number" min={1} max={9999}
                  value={newRewardCost}
                  onChange={e => setNewRewardCost(Number(e.target.value))}
                  className="w-14 px-1 py-1 rounded-lg border-2 border-[#E2D0F2] bg-white text-xs font-black text-[#8258C7] text-center outline-none focus:border-[#8258C7]"
                  title="所需积分"
                />
                <span className="text-[11px] text-[#8A6F5C] font-bold">分</span>
                <button onClick={() => { addReward(newParentRewardEmoji, newParentRewardName, newRewardCost, false); setNewParentRewardName(''); }} className="btn-candy btn-grape px-3 py-1 text-xs">添加</button>
              </div>
            )}
          </div>

          {/* 积分流水 */}
          <div className="story-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-[#5B4636] font-kids flex items-center gap-1.5">📜 积分明细</span>
              <span className="text-[10px] font-bold text-[#8A6F5C]">最近 {Math.min(8, store.ledger.length)} 条</span>
            </div>
            {store.ledger.length === 0 ? (
              <p className="text-xs text-[#C4AE97] font-bold py-3 text-center">还没有记录，快去打卡赚积分吧！💪</p>
            ) : (
              <div className="flex flex-col gap-1">
                {store.ledger.slice(0, 8).map(l => (
                  <div key={l.id} className="flex items-center justify-between bg-[#FFFBF5] rounded-xl px-2.5 py-1.5 border-2 border-[#F5EBDA]">
                    <span className="text-[11px] font-bold text-[#5B4636] truncate">{l.note}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-black ${l.type === 'earn' ? 'text-[#48A757]' : 'text-[#E0678A]'}`}>
                        {l.type === 'earn' ? '+' : ''}{l.amount}
                      </span>
                      <span className="text-[9px] font-bold text-[#C4AE97]">{fmtTime(l.ts)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ 本周期回顾：成就统计 + 近4周热力图 + 兑换记录 ============ */}
      <div className="story-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-black text-[#5B4636] font-kids flex items-center gap-1.5">🏆 本周期回顾（近 7 天）</span>
          <span className="text-[11px] font-bold text-[#8A6F5C]">
            每个周期结束和孩子一起看看：完成了什么、兑换了什么
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* 成就统计 */}
          <div className="md:col-span-3 grid grid-cols-2 gap-2 content-start">
            {[
              { icon: '✅', label: '累计打卡', value: `${cycleStats.checkins} 次`, cls: 'bg-[#E5F6EC] border-[#B8E8C6] text-[#357F43]' },
              { icon: '🌟', label: '全达成天数', value: `${cycleStats.fullDays} 天`, cls: 'bg-[#FFF3D6] border-[#FFE3A3] text-[#8A5F00]' },
              { icon: '🔥', label: '连续打卡', value: `${cycleStats.streak} 天`, cls: 'bg-[#FFE9E0] border-[#FFD1BE] text-[#E0633A]' },
              { icon: '🪙', label: '本周期获得', value: `${cycleStats.earnPts} 分`, cls: 'bg-[#F3E9FA] border-[#E2D0F2] text-[#8258C7]' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl border-3 px-2.5 py-2 flex flex-col items-center gap-0.5 ${s.cls}`}>
                <span className="text-xl leading-none">{s.icon}</span>
                <span className="text-[10px] font-black opacity-80">{s.label}</span>
                <span className="text-base font-black leading-tight">{s.value}</span>
              </div>
            ))}
          </div>

          {/* 近 4 周热力图（进步可视化） */}
          <div className="md:col-span-5 flex flex-col gap-1.5">
            <span className="text-[11px] font-black text-[#8A6F5C]">📅 近 4 周每日完成度</span>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ZH.map(w => (
                <span key={w} className="text-center text-[9px] font-black text-[#C4AE97]">{w}</span>
              ))}
              {heat28.map((c, i) => {
                const cls = c.future
                  ? 'bg-[#FFFBF5] border-[#F5EBDA] text-[#E5D9C8]'
                  : c.isToday
                  ? 'bg-[#FF8A5C] border-[#E0633A] text-white shadow-[0_2px_0_#E0633A]'
                  : c.pct >= 1
                  ? 'bg-[#6BCB77] border-[#48A757] text-white'
                  : c.pct >= 0.6
                  ? 'bg-[#A7E3B8] border-[#6BCB77] text-[#2C7A3B]'
                  : c.pct > 0
                  ? 'bg-[#DFF3E4] border-[#B8E8C6] text-[#357F43]'
                  : 'bg-[#FFF8EE] border-[#FFE8C8] text-[#C4AE97]';
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-lg border-2 flex items-center justify-center text-[10px] font-black select-none ${cls}`}
                    title={c.future ? '' : `${c.ds} 周${WEEKDAY_ZH[new Date(c.ds + 'T00:00:00').getDay()]}：${c.done}/${c.total} 项`}
                  >
                    {c.day}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-[9px] font-black text-[#C4AE97]">
              <span>少</span>
              <span className="w-4 h-3 rounded border-2 bg-[#FFF8EE] border-[#FFE8C8] inline-block" />
              <span className="w-4 h-3 rounded border-2 bg-[#DFF3E4] border-[#B8E8C6] inline-block" />
              <span className="w-4 h-3 rounded border-2 bg-[#A7E3B8] border-[#6BCB77] inline-block" />
              <span className="w-4 h-3 rounded border-2 bg-[#6BCB77] border-[#48A757] inline-block" />
              <span>全达成</span>
            </div>
          </div>

          {/* 兑换记录 */}
          <div className="md:col-span-4 flex flex-col gap-1.5">
            <span className="text-[11px] font-black text-[#8A6F5C]">🎁 本周期兑换的奖品</span>
            {cycleRedeems.length === 0 ? (
              <p className="text-xs text-[#C4AE97] font-bold py-3 text-center bg-[#FFFBF5] rounded-xl border-2 border-[#F5EBDA]">
                本周期还没兑换奖品，继续攒积分吧！💪
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {cycleRedeems.map(l => (
                  <div key={l.id} className="flex items-center justify-between bg-[#FAF5FF] rounded-xl px-2.5 py-1.5 border-2 border-[#E2D0F2]">
                    <span className="text-[11px] font-black text-[#5B4636] truncate">{l.note}</span>
                    <span className="text-[10px] font-black text-[#8258C7] shrink-0">{fmtDay(l.ts)} · {l.amount} 分</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HabitTracker;
