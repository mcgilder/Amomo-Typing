import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useRafLoop, useFloatScores, useDifficulty, speakGameWord,
  ResultModal, GameHeader, GameBoard, BackButton, ScorePill, ComboFlame, TypedWord, calcStars,
} from './shared';

// ============ 🎣 猫咪钓鱼记 · 悠闲池塘（鱼儿左右往返游版） ============
// 单词小牌（白底蓝边圆角）挂在鱼身上；鱼从左右两侧随机入场，
// 游到对侧转身游回（往返 2~3 次后离场）——有的往左、有的往右！
// 游动带上下浮动 + 尾摆（CSS）；目标鱼（锁定 / 最靠近浮标）高亮金框。
// 小鱼🐠 1 分（快）· 胖鱼🐟 1.5 分（慢）· 金锦鲤🎏 3 分（稀有闪光）
// 旧靴🥾 是垃圾：敲了只会臭气熏天清连击——忍住不敲等它游走还有自制力奖励！
// 连击达 8 触发「鱼群涌来」：一次从右侧游来 3 条鱼！
// 运动方案：鱼的游动状态存 fishRef，rAF 每帧按 dt 步进（60fps 丝滑），帧快照驱动渲染。

const DURATION = 90;      // 一局 90 秒
const WATER_Y = 150;      // 水面高度
const CAT_TOP = 88;       // 猫咪头顶
const HOOK_X = 33;        // 闲置浮标水平位置（%），目标鱼判定基准

type FishKind = 'small' | 'fat' | 'koi' | 'boot' | 'trash';

interface Fish {
  id: number;
  item: GameItem;
  typed: string;
  kind: FishKind;
  x: number;              // 水平位置（百分比）
  y: number;              // 距顶部像素
  dir: 1 | -1;            // 游动方向：1 往右 / -1 往左
  speed: number;          // 游速（%/ms）
  leftB: number;          // 左折返点（%）
  rightB: number;         // 右折返点（%）
  ageMs: number;          // 已游时间
  lifeMs: number;         // 到点后下一次触边就离场
  turns: number;          // 已转身次数
  wantLeave: boolean;     // 寿命到了，游到边界就离场
  leaving: boolean;       // 正在游出屏幕
  state: 'swim' | 'hooked' | 'struggle' | 'fly';
  flyTx?: number;         // 飞向猫咪的位移
  flyTy?: number;
}

interface Splash { id: number; x: number; y: number; }
// 每帧快照（渲染只读它）
interface Snap { fish: Fish[]; elapsedMs: number; }

const KIND_META: Record<FishKind, { emoji: string; size: string; base: number; label: string }> = {
  small: { emoji: '🐠', size: 'text-3xl', base: 10, label: '小鱼' },
  fat: { emoji: '🐟', size: 'text-5xl', base: 15, label: '胖鱼' },
  koi: { emoji: '🎏', size: 'text-4xl', base: 30, label: '金锦鲤' },
  boot: { emoji: '🥾', size: 'text-4xl', base: 0, label: '旧靴' },
  trash: { emoji: '🗑️', size: 'text-4xl', base: 0, label: '垃圾' },
};

export const FishingGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack, difficulty }) => {
  const { speedMul, timeMul } = useDifficulty(difficulty); // 难度：鱼儿游速与鱼群密度
  const pickWord = useWordPool(wordList);
  const boardRef = useRef<HTMLDivElement>(null);

  const [lockedId, setLockedId] = useState<number | null>(null);
  const [catching, setCatching] = useState<number | null>(null);
  const [caught, setCaught] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [finished, setFinished] = useState(false);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [stinkTick, setStinkTick] = useState(0);
  const [catSick, setCatSick] = useState(false);   // 小猫闻到臭味：眼睛变XX + 绿脸
  const [catJumpTick, setCatJumpTick] = useState(0);
  const [basketTick, setBasketTick] = useState(0);
  const [rushTick, setRushTick] = useState(0);
  const [boardW, setBoardW] = useState(900);
  const [snap, setSnap] = useState<Snap>({ fish: [], elapsedMs: 0 });
  const { addScore, Layer: ScoreLayer } = useFloatScores();

  // 运动状态（rAF 直改）
  const fishRef = useRef<Fish[]>([]);
  const elapsedMsRef = useRef(0);
  const spawnCdRef = useRef(1200);
  const initedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const t = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // ---------- 板宽测量 ----------
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => setBoardW(el.clientWidth || 900);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 卸载清定时器
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; }, []);

  // ---------- 环境泡泡 / 云朵 ----------
  const bubbles = useMemo(() => Array.from({ length: 7 }, () => ({
    x: 30 + Math.random() * 62, dur: 2.4 + Math.random() * 2.4, delay: Math.random() * 2.5, size: 4 + Math.random() * 7,
  })), []);

  const catLeft = Math.max(26, boardW * 0.035);
  const rodTip = { x: catLeft + 110, y: 44 };

  // ---------- 生成：左右两侧随机入场 ----------
  const spawnFish = useCallback((forceKind?: FishKind, side?: 'left' | 'right', xOff = 0) => {
    const roll = Math.random();
    const kind: FishKind = forceKind ?? (roll < 0.10 ? 'boot' : roll < 0.18 ? 'trash' : roll < 0.27 ? 'koi' : roll < 0.55 ? 'fat' : 'small');
    // 往右游的从左边进（鱼头朝右，emoji 翻转）；往左游的从右边进（鱼头朝左，默认朝向）
    const dir: 1 | -1 = side === 'left' ? 1 : side === 'right' ? -1 : (Math.random() < 0.5 ? 1 : -1);
    const speed = (kind === 'small' ? 8.5 + Math.random() * 2.5
      : kind === 'fat' ? 4.8 + Math.random() * 1.2
      : kind === 'koi' ? 6.5 + Math.random() * 1.7
      : 5.5 + Math.random() * 1.5) * speedMul / 1000;   // %/ms → 难度越低游得越慢
    const lifeMs = (kind === 'boot' || kind === 'trash') ? 13000 + Math.random() * 4000 : 16000 + Math.random() * 6000;
    const id = Date.now() + Math.random();
    const y = 200 + Math.random() * 150;
    const x = dir > 0 ? -12 - xOff : 112 + xOff;
    const item = pickWord();
    fishRef.current.push({
      id, item, typed: '', kind, x, y, dir, speed,
      leftB: 27 + Math.random() * 5, rightB: 82 + Math.random() * 8,
      ageMs: 0, lifeMs, turns: 0, wantLeave: false, leaving: false, state: 'swim',
    });
    playSoundEffect('bubble', 0.06);
  }, [pickWord]);

  // 开局两条鱼（StrictMode 防重）
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    spawnFish('small', 'right');
    spawnFish('fat', 'right', 22);
  }, [spawnFish]);

  const addSplash = useCallback((x: number, y: number) => {
    const id = Date.now() + Math.random();
    setSplashes(prev => [...prev, { id, x, y }]);
    setTimeout(() => setSplashes(prev => prev.filter(s => s.id !== id)), 700);
  }, []);

  // ---------- 鱼群涌来 ----------
  const [rushShow, setRushShow] = useState(false);
  const fishRush = useCallback(() => {
    (['small', 'fat', 'koi'] as FishKind[]).forEach((k, i) => spawnFish(k, 'right', i * 17));
    setRushTick(tk => tk + 1);
    setRushShow(true);
    addSplash(97, WATER_Y);
    playSoundEffect('splash', 0.3);
    playSoundEffect('bubble', 0.25);
    setTimeout(() => setRushShow(false), 1800);
  }, [spawnFish, addSplash]);

  // ---------- 结束 ----------
  const finishGame = useCallback(() => {
    setFinished(true);
    setCatching(null);
    playSoundEffect('victory', 0.35);
  }, []);

  // ---------- 完成一个单词 → 钓鱼序列（四段动画） ----------
  const completeFish = useCallback((f: Fish) => {
    const isJunk = f.kind === 'boot' || f.kind === 'trash';
    const nc = combo + 1;
    const gained = KIND_META[f.kind].base + nc * 2;

    if (lockedId === f.id) setLockedId(null);
    setCatching(f.id);
    f.state = 'hooked';

    if (isJunk) {
      setCombo(0); // 臭靴/垃圾清连击
      playSoundEffect('error', 0.18);
    } else {
      setScore(s => s + gained);
      setCombo(nc);
      setMaxCombo(mx => Math.max(mx, nc));
      if (nc >= 8 && nc % 8 === 0) fishRush();
      onEarnCoins?.(3);
      addScore((boardW * f.x) / 100, f.y, `+${gained}`, f.kind === 'koi' ? '#E8A317' : '#4FB8E7');
    }

    // 0.2s 后：钩住左右挣扎
    t(220, () => {
      const tf = fishRef.current.find(x => x.id === f.id);
      if (tf) tf.state = 'struggle';
      playSoundEffect('bubble', 0.18);
    });
    // 再 0.4s 后：飞出水面弧线飞向猫
    t(620, () => {
      const tf = fishRef.current.find(x => x.id === f.id);
      if (!tf) return;
      tf.state = 'fly';
      const fishPx = (boardW * tf.x) / 100;
      tf.flyTx = catLeft + 52 - fishPx;
      tf.flyTy = CAT_TOP + 6 - tf.y;
      addSplash(tf.x, WATER_Y);
      playSoundEffect('splash', 0.25);
      setCatching(null);
    });
    // 再 0.4s 后：入篓 / 臭气
    t(1040, () => {
      fishRef.current = fishRef.current.filter(x => x.id !== f.id);
      if (isJunk) {
        setStinkTick(k => k + 1);
        setCatSick(true);
        t(2200, () => setCatSick(false));
        playSoundEffect('frog_splash', 0.3);
        addScore(catLeft + 40, 240, f.kind === 'trash' ? '垃圾好臭! 🤢' : '好臭呀! 🤢', '#7A9A3A');
      } else {
        setCaught(c => c + 1);
        setCatJumpTick(k => k + 1);
        setBasketTick(k => k + 1);
        playSoundEffect('coin', 0.2);
        playSoundEffect('sparkle', 0.15);
      }
    });
  }, [combo, lockedId, boardW, catLeft, onEarnCoins, fishRush, addSplash, addScore, t]);

  // ---------- 主循环（60fps rAF：鱼儿左右往返游） ----------
  useRafLoop((dt) => {
    elapsedMsRef.current += dt;
    if (elapsedMsRef.current >= DURATION * 1000) { finishGame(); return; }

    const list = fishRef.current;
    const gone: Fish[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      if (f.state !== 'swim') continue; // 钓鱼序列中的鱼不动
      f.ageMs += dt;
      f.x += f.dir * f.speed * dt;
      if (!f.leaving) {
        // 游到对侧折返点 → 转身游回（往返 2~3 次后离场）
        if (f.dir > 0 && f.x >= f.rightB) {
          f.turns++;
          if (f.wantLeave || f.turns >= 6) f.leaving = true; else f.dir = -1;
        } else if (f.dir < 0 && f.x <= f.leftB) {
          f.turns++;
          if (f.wantLeave || f.turns >= 6) f.leaving = true; else f.dir = 1;
        }
        if (!f.wantLeave && f.ageMs >= f.lifeMs) f.wantLeave = true; // 寿命到，下次触边离场
      }
      if (f.leaving && (f.x > 114 || f.x < -14)) {
        list.splice(i, 1);
        gone.push(f);
      }
    }
    if (gone.length) {
      gone.forEach(g => {
        if ((g.kind === 'boot' || g.kind === 'trash') && g.typed.length === 0) {
          // 自制力训练：忍住没钓垃圾，奖励！
          setScore(s => s + 5);
          addScore(boardW * 0.14, 205, '忍住了 +5', '#48A757');
          playSoundEffect('sparkle', 0.2);
        }
      });
    }

    spawnCdRef.current -= dt;
    const swimming = list.filter(f => f.state === 'swim').length;
    if (swimming < 4 && spawnCdRef.current <= 0) {
      spawnFish();
      spawnCdRef.current = (1700 + Math.random() * 1400) * timeMul;
    }

    setSnap({ fish: list.map(f => ({ ...f })), elapsedMs: elapsedMsRef.current });
  }, !finished);

  // ---------- 打字输入 ----------
  useKeyDown((e) => {
    if (finished || e.repeat) return;
    const key = e.key.toLowerCase();
    if (!/^[a-z]$/.test(key) && key !== ' ') return; // 字母与空格键只用于打字（词组含空格）
    const swimmers = fishRef.current.filter(f => f.state === 'swim');
    if (!swimmers.length) return;

    const locked = lockedId != null ? swimmers.find(f => f.id === lockedId) : undefined;
    if (locked) {
      if (key === locked.item.typing[locked.typed.length]) {
        advance(locked, key);
      } else {
        const cand = swimmers.filter(f => f.id !== locked.id && f.typed.length === 0 && f.item.typing[0] === key);
        if (cand.length) {
          locked.typed = '';
          const target = cand.reduce((a, b) => (Math.abs(a.x - HOOK_X) <= Math.abs(b.x - HOOK_X) ? a : b));
          setLockedId(target.id);
          playSoundEffect('whoosh', 0.1);
          speakGameWord(target.item); // 目标一出现就读
          advance(target, key);
        } else {
          playSoundEffect('error', 0.12);
          setCombo(0); // 错字只清连击
        }
      }
    } else {
      const cand = swimmers.filter(f => f.item.typing[0] === key);
      if (cand.length) {
        const target = cand.reduce((a, b) => (Math.abs(a.x - HOOK_X) <= Math.abs(b.x - HOOK_X) ? a : b));
        setLockedId(target.id);
        speakGameWord(target.item); // 目标一出现就读
        advance(target, key);
      } else {
        playSoundEffect('error', 0.12);
        setCombo(0);
      }
    }
  });

  const advance = (f: Fish, key: string) => {
    f.typed += key;
    playSoundEffect('click', 0.12);
    if (f.typed.length >= f.item.typing.length) {
      completeFish(f);
    }
    // 高亮进度由下一帧快照同步（≤16ms，无感知）
  };

  // ---------- 派生 ----------
  const target = useMemo(() => {
    const locked = lockedId != null ? snap.fish.find(f => f.id === lockedId && f.state === 'swim') : undefined;
    if (locked) return locked;
    const swimmers = snap.fish.filter(f => f.state === 'swim');
    if (!swimmers.length) return null;
    // 自动高亮：最靠近浮标（钩子）的鱼
    return swimmers.reduce((a, b) => (Math.abs(a.x - HOOK_X) <= Math.abs(b.x - HOOK_X) ? a : b));
  }, [snap, lockedId]);

  const timeLeft = Math.max(0, DURATION - Math.floor(snap.elapsedMs / 1000));
  const timePct = Math.max(0, Math.min(100, (timeLeft / DURATION) * 100));
  const catchingFish = catching != null ? snap.fish.find(f => f.id === catching) : undefined;
  const hook = catchingFish
    ? { x: (boardW * catchingFish.x) / 100, y: Math.max(WATER_Y + 8, catchingFish.y - 30) }
    : { x: boardW * 0.33, y: WATER_Y + 8 };
  const lineDx = hook.x - rodTip.x;
  const lineDy = hook.y - rodTip.y;
  const lineLen = Math.hypot(lineDx, lineDy);
  const lineAng = (Math.atan2(lineDy, lineDx) * 180) / Math.PI;
  const junkOnField = snap.fish.some(f => (f.kind === 'boot' || f.kind === 'trash') && f.state === 'swim');

  // ---------- 重开 ----------
  const resetGame = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    fishRef.current = [];
    elapsedMsRef.current = 0;
    spawnCdRef.current = 1200;
    setLockedId(null); setCatching(null); setCaught(0);
    setScore(0); setCombo(0); setMaxCombo(0);
    setFinished(false); setSplashes([]); setStinkTick(0);
    setCatJumpTick(0); setBasketTick(0); setRushTick(0); setRushShow(false);
    setSnap({ fish: [], elapsedMs: 0 });
    spawnFish('small', 'right');
    spawnFish('fat', 'right', 22);
    playSoundEffect('click');
  }, [spawnFish]);

  // 篓里的小鱼图标（最多展示 8 条）
  const basketIcons = useMemo(() => [
    { dx: -26, dy: -14 }, { dx: 6, dy: -20 }, { dx: -8, dy: -34 }, { dx: 24, dy: -10 },
    { dx: -30, dy: 2 }, { dx: 12, dy: -38 }, { dx: -2, dy: -6 }, { dx: 28, dy: -26 },
  ], []);

  return (
    <div className="flex flex-col gap-3 w-full max-w-5xl mx-auto animate-fade-in">
      <style>{`
        @keyframes flyToCat {
          0% { transform: translate(0, 0) rotate(0deg) scale(1); }
          45% { transform: translate(calc(var(--tx) * 0.45), calc(var(--ty) * 0.5 - 80px)) rotate(-24deg) scale(1.2); }
          100% { transform: translate(var(--tx), var(--ty)) rotate(0deg) scale(0.7); }
        }
        @keyframes fishStruggle { 0%, 100% { transform: translateX(-5px) rotate(-8deg); } 50% { transform: translateX(5px) rotate(8deg); } }
        @keyframes fishBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes catJump { 0% { transform: translateY(0) scale(1); } 35% { transform: translateY(-22px) scale(1.12) rotate(-6deg); } 70% { transform: translateY(1px) scale(0.96); } 100% { transform: translateY(0) scale(1); } }
        @keyframes basketPop { 0% { transform: scale(1); } 45% { transform: scale(1.2) rotate(4deg); } 100% { transform: scale(1); } }
        @keyframes stinkPuff { 0% { opacity: 0; transform: scale(0.4) translateY(0); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: scale(1.6) translateY(-46px); } }
        @keyframes stinkSpin { 0% { opacity: 0; transform: scale(0.3) rotate(0deg) translateY(0); } 30% { opacity: 0.95; } 100% { opacity: 0; transform: scale(1.9) rotate(300deg) translateY(-44px); } }
        @keyframes stinkSpinRev { 0% { opacity: 0; transform: scale(0.3) rotate(0deg) translateY(0); } 30% { opacity: 0.9; } 100% { opacity: 0; transform: scale(1.7) rotate(-300deg) translateY(-38px); } }
        @keyframes catGross { 0%,100% { transform: rotate(0deg) translateX(0); } 25% { transform: rotate(-7deg) translateX(-2px); } 75% { transform: rotate(7deg) translateX(2px); } }
        @keyframes flyBuzz { 0% { transform: translate(0,0) rotate(0deg); } 25% { transform: translate(7px,-6px) rotate(12deg); } 50% { transform: translate(12px,3px) rotate(-8deg); } 75% { transform: translate(4px,8px) rotate(10deg); } 100% { transform: translate(0,0) rotate(0deg); } }
        @keyframes bobberBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      `}</style>

      <GameHeader emoji="🎣" title="猫咪钓鱼记" tag="90秒悠闲钓趣" tagColor="bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]">
        {/* 浮标样式时间条 */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border-3 bg-white text-[#5B4636] border-[#FFE8C8] font-black text-sm shadow-[0_3px_0_rgba(0,0,0,0.08)]">
          <span className="text-lg">⏱</span>
          <div className="relative w-28 h-3.5">
            <div className="absolute inset-0 rounded-full bg-[#E8F1FA]" />
            <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#6BCB77] to-[#4FB8E7]" style={{ width: `${timePct}%` }} />
            <span className="absolute -top-2 text-sm select-none" style={{ left: `calc(${timePct}% - 9px)`, animation: 'bobberBob 1.6s ease-in-out infinite' }}>🟠</span>
          </div>
          <span className="text-base">{timeLeft}s</span>
        </div>
        <ScorePill icon="🧺" label="鱼篓" value={`${caught}条`} />
        <ScorePill icon="⭐" label="得分" value={score} />
        <ComboFlame combo={combo} />
        <BackButton onBack={onBack} />
      </GameHeader>

      <GameBoard
        className="h-[430px]"
        style={{ background: 'linear-gradient(180deg, #BEE9FF 0%, #E8F7FF 28%, #79C9A6 35%, #2E7D5B 78%, #17493A 100%)' }}
      >
        <div ref={boardRef} className="absolute inset-0">
          {/* ---------- 天空 ---------- */}
          <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: WATER_Y }}>
            <span className="absolute right-10 top-3 text-4xl select-none">☀️</span>
            <span className="absolute left-[34%] top-4 text-3xl select-none opacity-90" style={{ animation: 'cloudDrift 26s linear infinite' }}>☁️</span>
            <span className="absolute left-[8%] top-8 text-2xl select-none opacity-70" style={{ animation: 'cloudDrift 38s linear infinite', animationDelay: '-12s' }}>☁️</span>
            {/* 远山 */}
            <svg className="absolute bottom-0 inset-x-0" width="100%" height="46" viewBox="0 0 100 20" preserveAspectRatio="none" style={{ opacity: 0.6 }}>
              <polygon points="0,20 0,14 12,4 24,16 36,7 50,18 64,8 80,17 100,10 100,20" fill="#7FB8A0" />
            </svg>
          </div>

          {/* ---------- 岸边（z 高于鱼群，鱼游走时消失在山坡后） ---------- */}
          <div className="absolute left-0 z-20 pointer-events-none" style={{ top: 104, bottom: 0, width: '26%', background: 'linear-gradient(180deg, #9CD87E 0%, #6FB35F 40%, #4E8F4A 100%)', borderRadius: '0 60% 0 0' }}>
            <span className="absolute right-1 -top-1 text-lg select-none">🌿</span>
            <span className="absolute right-5 top-6 text-sm select-none">🌼</span>
            <span className="absolute right-2 top-12 text-sm select-none">🌸</span>
            <span className="absolute left-3 bottom-24 text-base select-none animate-sway">🌿</span>
          </div>

          {/* ---------- 水面波纹 + 倒影 ---------- */}
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: WATER_Y - 6, height: 16, background: 'repeating-radial-gradient(circle at 20px 22px, rgba(255,255,255,0.5) 0 5px, transparent 6px 40px)', backgroundSize: '80px 16px', animation: 'waterWave 3.2s ease-in-out infinite', opacity: 0.7 }} />
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: WATER_Y + 4, height: 12, background: 'repeating-radial-gradient(circle at 30px 18px, rgba(255,255,255,0.35) 0 4px, transparent 5px 52px)', backgroundSize: '104px 12px', animation: 'waterWave2 4s ease-in-out infinite', opacity: 0.5 }} />
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: WATER_Y, height: 22, background: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))' }} />

          {/* ---------- 水下光柱 ---------- */}
          <div className="absolute pointer-events-none" style={{ left: '38%', top: WATER_Y, bottom: 0, width: 46, background: 'linear-gradient(180deg, rgba(255,255,255,0.16), transparent 80%)', transform: 'skewX(-14deg)', animation: 'sway 5s ease-in-out infinite' }} />
          <div className="absolute pointer-events-none" style={{ left: '58%', top: WATER_Y, bottom: 0, width: 30, background: 'linear-gradient(180deg, rgba(255,255,255,0.12), transparent 75%)', transform: 'skewX(-10deg)', animation: 'sway 6s ease-in-out infinite' }} />

          {/* ---------- 环境气泡 ---------- */}
          {bubbles.map((b, i) => (
            <span key={i} className="absolute rounded-full bg-white/45 border border-white/60 pointer-events-none animate-bubble-rise"
              style={{ left: `${b.x}%`, top: 340, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />
          ))}

          {/* ---------- 水草 ---------- */}
          {[
            { x: '46%', s: 'text-2xl' }, { x: '62%', s: 'text-xl' }, { x: '84%', s: 'text-3xl' },
          ].map((w, i) => (
            <span key={i} className={`absolute bottom-1 select-none animate-sway ${w.s}`} style={{ left: w.x, animationDuration: `${3 + i * 0.8}s` }}>🌿</span>
          ))}

          {/* ---------- 猫咪 + 鱼竿 + 鱼线（闻到臭味时眼睛变XX + 嫌弃扭头） ---------- */}
          <div className="absolute z-20" style={{ left: catLeft, top: CAT_TOP }}>
            <div key={catJumpTick} className="relative" style={{ animation: catJumpTick > 0 ? 'catJump 0.55s ease-out' : catSick ? 'catGross 0.5s ease-in-out infinite' : undefined }}>
              <span className="block text-5xl select-none" style={catSick ? { filter: 'hue-rotate(60deg) saturate(1.6) brightness(1.05)' } : undefined}>🐱</span>
              {catSick && (
                <>
                  <span className="absolute top-[9px] left-[9px] text-[15px] font-black leading-none select-none" style={{ color: '#3F3F46', textShadow: '0 0 3px #fff' }}>✕</span>
                  <span className="absolute top-[9px] left-[26px] text-[15px] font-black leading-none select-none" style={{ color: '#3F3F46', textShadow: '0 0 3px #fff' }}>✕</span>
                  <span className="absolute -top-4 -right-3 text-base select-none">😖</span>
                </>
              )}
            </div>
          </div>
          {/* 鱼竿 */}
          <div className="absolute z-20 origin-left rounded-full pointer-events-none"
            style={{ left: catLeft + 36, top: CAT_TOP + 12, width: 96, height: 4, background: 'linear-gradient(90deg, #8A5A2B, #B07B45)', transform: 'rotate(-42deg)' }} />
          {/* 鱼线（钓到时垂到鱼上方） */}
          <div className="absolute z-20 origin-left pointer-events-none"
            style={{ left: rodTip.x, top: rodTip.y, width: lineLen, height: 2, background: 'rgba(255,255,255,0.8)', transform: `rotate(${lineAng}deg)`, transition: 'all 0.22s ease-out' }} />
          {/* 浮标 / 鱼钩 */}
          {catchingFish ? (
            <span className="absolute z-20 text-lg select-none pointer-events-none" style={{ left: hook.x - 8, top: hook.y - 6, transition: 'all 0.22s ease-out' }}>🪝</span>
          ) : (
            <span className="absolute z-20 text-base select-none pointer-events-none" style={{ left: hook.x - 8, top: hook.y - 6, animation: 'bobberBob 1.6s ease-in-out infinite' }}>🟠</span>
          )}

          {/* ---------- 鱼群（translate3d 定位 + 转身翻转 + 上下浮动 + 尾摆） ---------- */}
          {snap.fish.map((f, idx) => {
            const meta = KIND_META[f.kind];
            const isTarget = target?.id === f.id;
            const fishPx = (boardW * f.x) / 100;
            const flyStyle: React.CSSProperties | undefined = f.state === 'fly' && f.flyTx !== undefined && f.flyTy !== undefined
              ? { animation: `flyToCat 0.42s cubic-bezier(0.35, 0.7, 0.6, 1) forwards`, '--tx': `${f.flyTx}px`, '--ty': `${f.flyTy}px` } as React.CSSProperties
              : undefined;
            return (
              <div key={f.id} className={`absolute left-0 top-0 will-change-transform ${isTarget ? 'z-30' : 'z-10'}`}
                style={{ transform: `translate3d(${fishPx}px, ${f.y}px, 0)` }}>
                {/* 上下轻微浮动（整组带着牌子一起浮动） */}
                <div className="relative" style={{ animation: f.state === 'swim' ? `fishBob 2.6s ease-in-out ${idx * 0.35}s infinite` : undefined }}>
                  {/* 单词大字牌：白底蓝边圆角，紧贴鱼身下方（字号加大，水中也看得清） */}
                  {f.state === 'swim' && (
                    <div className={`absolute left-1/2 -translate-x-1/2 top-full -mt-1.5 rounded-xl px-2.5 py-1 shadow-md whitespace-nowrap ${isTarget ? 'border-3 border-[#FFC94D] scale-110 bg-white' : (f.kind === 'boot' || f.kind === 'trash') ? 'bg-[#F0EBE0] border-2 border-[#B8AE9C]' : 'bg-white border-2 border-[#4FB8E7]'}`}>
                      <TypedWord word={f.item.typing} typedLen={f.typed.length} size="md" />
                      {(f.kind === 'boot' || f.kind === 'trash') && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-black text-[#8A6F5C] bg-[#FFF3D6] rounded-full px-1.5 border border-[#FFE3A3]">别钓!</span>}
                    </div>
                  )}
                  {/* 鱼身：转身翻转（鱼头始终朝游动方向）+ 尾摆 */}
                  <div style={flyStyle}>
                    <div style={{ transform: `scaleX(${f.dir > 0 ? -1 : 1})`, transition: 'transform 0.28s ease-in-out' }}>
                      <span className={`block select-none ${meta.size} ${f.kind === 'koi' ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.9)]' : ''}`}
                        style={f.state === 'swim' ? { animation: 'sway 0.9s ease-in-out infinite' } : f.state === 'struggle' ? { animation: 'fishStruggle 0.22s ease-in-out infinite' } : undefined}>
                        {meta.emoji}
                      </span>
                    </div>
                    {f.kind === 'koi' && f.state === 'swim' && (
                      <span className="absolute -right-2 -top-2 text-xs select-none animate-twinkle">✨</span>
                    )}
                  </div>
                  {f.state === 'struggle' && <span className="absolute -left-4 -top-2 text-sm select-none">💦</span>}
                </div>
              </div>
            );
          })}

          {/* ---------- 水花 ---------- */}
          {splashes.map(s => (
            <div key={s.id} className="absolute z-20 pointer-events-none" style={{ left: `${s.x}%`, top: s.y }}>
              <div className="absolute rounded-full border-4 border-white/80" style={{ width: 30, height: 30, left: -15, top: -15, animation: 'splashRing 0.6s ease-out forwards' }} />
              <span className="absolute text-xl animate-pop-burst" style={{ left: -10, top: -22 }}>💦</span>
            </div>
          ))}

          {/* ---------- 鱼篓（钓到的鱼可见增多） ---------- */}
          <div className="absolute z-20" style={{ left: catLeft - 6, top: 235 }}>
            <div key={basketTick} className="relative" style={{ animation: basketTick > 0 ? 'basketPop 0.45s ease-out' : undefined }}>
              <span className="block text-5xl select-none">🧺</span>
              {caught > 0 && (
                <span className="absolute -top-2 -right-3 bg-[#FF8A5C] text-white text-xs font-black rounded-full min-w-6 h-6 flex items-center justify-center px-1 border-2 border-white select-none">
                  {caught}
                </span>
              )}
              {basketIcons.slice(0, Math.min(caught, 8)).map((p, i) => (
                <span key={i} className="absolute text-lg select-none animate-float-y" style={{ left: 24 + p.dx, top: -18 + p.dy, animationDelay: `${i * 0.3}s` }}>
                  {i % 3 === 0 ? '🐟' : '🐠'}
                </span>
              ))}
            </div>
            {/* 臭臭特效：紫色旋转扩散臭烟（钓到靴子/垃圾时触发） */}
            {stinkTick > 0 && (
              <div key={stinkTick} className="absolute -top-12 -left-8 pointer-events-none w-[150px] h-[120px]">
                {/* 三层紫烟：扩散 + 旋转（正反交替），臭味盘旋而上 */}
                <span className="absolute left-8 top-6 w-10 h-10 rounded-[45%] blur-[3px]" style={{ background: 'rgba(167,125,224,0.55)', animation: 'stinkSpin 1.4s ease-out forwards' }} />
                <span className="absolute left-2 top-10 w-8 h-8 rounded-[45%] blur-[3px]" style={{ background: 'rgba(147,102,214,0.5)', animation: 'stinkSpinRev 1.5s ease-out 0.12s forwards' }} />
                <span className="absolute left-16 top-2 w-9 h-9 rounded-[45%] blur-[3px]" style={{ background: 'rgba(196,155,255,0.5)', animation: 'stinkSpin 1.6s ease-out 0.24s forwards' }} />
                <span className="absolute left-10 top-0 w-6 h-6 rounded-full blur-[2px]" style={{ background: 'rgba(196,155,255,0.45)', animation: 'stinkSpinRev 1.4s ease-out 0.4s forwards' }} />
                {/* 苍蝇嗡嗡绕圈 */}
                <span className="absolute left-4 top-6 text-sm" style={{ animation: 'flyBuzz 0.9s ease-in-out infinite' }}>🪰</span>
                <span className="absolute left-16 top-9 text-xs" style={{ animation: 'flyBuzz 0.7s ease-in-out 0.2s infinite' }}>🪰</span>
              </div>
            )}
          </div>

          {/* ---------- 鱼群涌来横幅 ---------- */}
          {rushShow && (
            <div key={rushTick} className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <span className="bg-[#4FB8E7] text-white font-black text-sm px-4 py-1.5 rounded-full border-3 border-white shadow-lg" style={{ animation: 'wiggle 0.5s ease-in-out infinite' }}>🐟 鱼群涌来！快钓！</span>
            </div>
          )}

          {/* ---------- 旧靴警示 ---------- */}
          {junkOnField && (
            <div className="absolute top-2 right-3 z-30 pointer-events-none">
              <span className="bg-[#FFF3D6] text-[#B8860B] font-black text-xs px-3 py-1 rounded-full border-2 border-[#FFE3A3] animate-wiggle">🥾🗑️ 别钓靴子和垃圾！</span>
            </div>
          )}

          <ScoreLayer />

          {finished && (
            <ResultModal
              title={`收竿啦！钓到 ${caught} 条鱼`}
              emoji="🎣"
              score={score}
              coins={caught * 3}
              combo={maxCombo}
              stars={calcStars(score, 320)}
              replay={resetGame}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>
    </div>
  );
};
