import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useRafLoop, useFloatScores, useDifficulty, speakGameWord,
  ResultModal, GameHeader, GameBoard, BackButton, ScorePill, ComboFlame, TypedWord, calcStars,
} from './shared';

// ============ 🚀 星际护卫队 · 太空射击（陨石真·下坠版） ============
// 敲陨石单词 → 激光粉碎陨石！守住 3 格护盾坚持到终局即通关。
//
// 下坠感方案（60fps rAF）：
// 1. 陨石运动状态存 meteorsRef，每帧 y += vy*dt（约 45~75 px/s，6~9 秒坠到底线），
//    左右轻微正弦摆动 + meteorSpin 自转，速度随连击提升；
// 2. 近大远小：scale 随下落进度从 0.8 长到 1.55（BOSS 1→1.18），越近越有压迫感；
// 3. 接近底线（>55% 进度）渐显红色警示光晕 + 头顶热度尾焰；
// 4. 只有触底（DEAD_LINE）才扣护盾 + 爆炸 + 红闪 + 震屏。
// 其余机制保留：激光、锁定打字、BOSS 双单词、护盾、曲速 ×2。

const SURVIVE_SEC = 150;   // 坚持到最后即通关
const SHIELD_MAX = 3;      // 护盾格数
const BOSS_EVERY = 8;      // 每完成 8 个单词来一个 BOSS
const BOARD_H = 560;       // 竖版战场高度（纵向视野更长，反应时间更充裕）
const DEAD_LINE = 460;     // 陨石越过此高度 = 撞上防线（护盾-1）
const SHIP_NOSE = 452;     // 飞船炮口高度（激光起点）

interface Meteor {
  id: number;
  item: GameItem;          // 普通陨石单词
  bossItems?: GameItem[];  // BOSS 双单词
  wordIndex: number;       // BOSS 当前第几个单词（0/1）
  typed: string;
  baseX: number;           // 水平基准位置（%）
  xPct: number;            // 当前水平位置（% = baseX + 摆动）
  y: number;               // 距顶部像素
  vy: number;              // 下落速度（px/ms）
  swayAmp: number;         // 左右摆动幅度（%）
  swayPhase: number;       // 摆动相位
  swaySpeed: number;       // 摆动角速度（rad/ms）
  isBoss: boolean;
}

interface Laser { id: number; x: number; fromY: number; toY: number; }
interface Frag { dx: number; dy: number; }
interface Explosion { id: number; x: number; y: number; frags: Frag[]; big: boolean; }
interface StarDrop { id: number; x: number; delay: number; }

// 每帧推给 React 的轻量快照
interface MeteorView {
  id: number; xPct: number; y: number; scale: number; danger: number;
  isBoss: boolean; wordIndex: number; typed: string; word: GameItem;
}
interface Snap { meteors: MeteorView[]; elapsedMs: number; warp: boolean; bossWarn: boolean; }

const wordOf = (m: Meteor): GameItem => (m.isBoss && m.bossItems ? m.bossItems[m.wordIndex] : m.item);

// 星空（三层视差 + 曲速拉丝）
interface StarDot { x: number; y: number; size: number; dur: number; delay: number; }

export const SpaceShipGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack, difficulty }) => {
  const { speedMul, timeMul } = useDifficulty(difficulty); // 难度：陨石下坠速度与生成节奏
  const pickWord = useWordPool(wordList);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [lockedId, setLockedId] = useState<number | null>(null);
  const [shield, setShield] = useState(SHIELD_MAX);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);
  const [nextBossAt, setNextBossAt] = useState(BOSS_EVERY);
  const [laser, setLaser] = useState<Laser | null>(null);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [starDrops, setStarDrops] = useState<StarDrop[]>([]);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  const [flashTick, setFlashTick] = useState(0);
  const [boardW, setBoardW] = useState(672);
  const boardElRef = useRef<HTMLDivElement | null>(null);   // 游戏板实测宽度
  const [snap, setSnap] = useState<Snap>({ meteors: [], elapsedMs: 0, warp: false, bossWarn: false });
  const { addScore, Layer: ScoreLayer } = useFloatScores();

  // 运动状态（不进 state，rAF 直改）
  const meteorsRef = useRef<Meteor[]>([]);
  const elapsedMsRef = useRef(0);
  const warpMsRef = useRef(0);
  const spawnCdRef = useRef(1400);
  const bossWarnMsRef = useRef(-1); // -1 = 空闲，>0 = 预警倒计时
  const wordsDoneRef = useRef(0);
  const initedRef = useRef(false);

  // ---------- 板宽测量（飘分/translate3d 坐标用） ----------
  // 注意：必须测游戏板自身（max-w-2xl），不能测外层 max-w-5xl 容器，
  // 否则右侧陨石的 x 坐标会算出板外，出现"看得见生成、看不见陨石"的 bug
  useEffect(() => {
    const el = boardElRef.current;
    if (!el) return;
    const update = () => setBoardW(el.clientWidth || 672);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ---------- 星空数据 ----------
  const stars = useMemo<StarDot[]>(() => {
    const make = (n: number, lo: number, hi: number): StarDot[] =>
      Array.from({ length: n }, () => ({
        x: Math.random() * 100, y: Math.random() * 100,
        size: lo + Math.random() * (hi - lo),
        dur: 1.6 + Math.random() * 2.6, delay: Math.random() * 2.5,
      }));
    return [...make(34, 2, 3), ...make(18, 3, 4.2), ...make(9, 4.2, 6)];
  }, []);
  const streaks = useMemo(() => Array.from({ length: 16 }, () => ({
    x: Math.random() * 100, dur: 0.45 + Math.random() * 0.35, delay: Math.random() * 0.5,
  })), []);

  // ---------- 陨石生成 ----------
  const spawnMeteor = useCallback((isBoss: boolean) => {
    const diff = Math.min(1, wordsDoneRef.current / 24); // 难度随进度爬坡
    const id = Date.now() + Math.random();
    const main = pickWord();
    if (isBoss) {
      meteorsRef.current.push({
        id, item: main, bossItems: [pickWord(), pickWord()], wordIndex: 0, typed: '',
        baseX: 50, xPct: 50, y: -120, vy: 0.034 * speedMul,
        swayAmp: 1.6, swayPhase: Math.random() * Math.PI * 2, swaySpeed: 0.0009, isBoss: true,
      });
      playSoundEffect('bell', 0.3);
    } else {
      let x = 12 + Math.random() * 76;
      const other = meteorsRef.current.find(m => !m.isBoss);
      if (other && Math.abs(other.xPct - x) < 22) x = ((other.xPct + 34) % 80) + 10;
      meteorsRef.current.push({
        id, item: main, wordIndex: 0, typed: '',
        baseX: x, xPct: x, y: -85,
        vy: (0.038 + diff * 0.018 + Math.random() * 0.012) * speedMul, // 难度越低坠得越慢
        swayAmp: 2 + Math.random() * 2.5,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.0012 + Math.random() * 0.0009,
        isBoss: false,
      });
      playSoundEffect('whoosh', 0.08);
      // 单词一出现就读（场上仅此一个带词陨石时才读，避免多词语音重叠）
      if (meteorsRef.current.filter(m => !m.isBoss).length === 1) speakGameWord(main);
    }
  }, [pickWord]);

  // 开局第一颗陨石（StrictMode 双挂载防重）
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    spawnMeteor(false);
  }, [spawnMeteor]);

  // ---------- 结束 ----------
  const finishGame = useCallback((victory: boolean) => {
    setFinished(true);
    setWon(victory);
    meteorsRef.current = [];
    setLaser(null);
    setSnap(s => ({ ...s, meteors: [], bossWarn: false }));
    playSoundEffect(victory ? 'victory' : 'error', 0.35);
  }, []);

  // ---------- 特效 ----------
  const fireLaser = useCallback((x: number, toY: number) => {
    const id = Date.now();
    setLaser({ id, x, fromY: SHIP_NOSE, toY: Math.max(0, toY) });
    setTimeout(() => setLaser(l => (l && l.id === id ? null : l)), 170);
  }, []);

  const explodeAt = useCallback((x: number, y: number, big: boolean) => {
    const n = big ? 7 : 4 + Math.floor(Math.random() * 2);
    const frags: Frag[] = Array.from({ length: n }, () => {
      const ang = Math.random() * Math.PI * 2;
      const dist = (big ? 58 : 32) + Math.random() * (big ? 58 : 28);
      return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - (big ? 12 : 6) };
    });
    const id = Date.now() + Math.random();
    setExplosions(prev => [...prev, { id, x, y, frags, big }]);
    setTimeout(() => setExplosions(prev => prev.filter(e => e.id !== id)), 800);
  }, []);

  const spawnStarRain = useCallback(() => {
    const drops: StarDrop[] = Array.from({ length: 12 }, () => ({
      id: Date.now() + Math.random(), x: 4 + Math.random() * 92, delay: Math.random() * 0.6,
    }));
    setStarDrops(drops);
    setTimeout(() => setStarDrops([]), 2500);
  }, []);

  const triggerWarp = useCallback(() => {
    warpMsRef.current = 5000; // 5 秒
    playSoundEffect('whoosh', 0.3);
    playSoundEffect('combo', 0.25);
  }, []);

  // ---------- 护盾被撞（陨石触底才触发） ----------
  const handleShieldHit = useCallback((m: Meteor) => {
    explodeAt(m.xPct, DEAD_LINE - 18, false); // 触底爆炸
    playSoundEffect('pop', 0.28);
    playSoundEffect('error', 0.32);
    setFlashTick(t => t + 1);
    setShakeTick(t => t + 1);
    setCombo(0);
    addScore((m.xPct / 100) * boardW, DEAD_LINE - 40, '🛡 -1', '#F87171');
    if (lockedId === m.id) setLockedId(null);
    if (shield <= 1) {
      setShield(0);
      setTimeout(() => finishGame(false), 500);
    } else {
      setShield(s => s - 1);
    }
  }, [lockedId, shield, finishGame, addScore, boardW, explodeAt]);

  // ---------- 单词完成 ----------
  const completeWordOn = useCallback((m: Meteor) => {
    const nc = combo + 1;
    let gained = (10 + nc * 2) * (m.isBoss ? 3 : 1);
    if (warpMsRef.current > 0) gained *= 2;
    gained = Math.round(gained);
    setScore(s => s + gained);
    setCombo(nc);
    setMaxCombo(mx => Math.max(mx, nc));
    if (nc >= 10 && nc % 10 === 0) triggerWarp();
    wordsDoneRef.current += 1;
    setWordsDone(wordsDoneRef.current);
    onEarnCoins?.(3);
    addScore((m.xPct / 100) * boardW, Math.max(10, m.y), `+${gained}`, m.isBoss ? '#FFD700' : warpMsRef.current > 0 ? '#7DD3FC' : '#FF8A5C');
    fireLaser(m.xPct, m.y + (m.isBoss ? 34 : 26));
    playSoundEffect('laser', 0.3);

    if (m.isBoss && m.wordIndex === 0) {
      // BOSS 第一层甲壳碎裂，露出第二个单词
      playSoundEffect('mole_hit', 0.3);
      explodeAt(m.xPct, m.y + 34, false);
      m.typed = '';
      m.wordIndex = 1;
    } else {
      playSoundEffect('pop', 0.25);
      explodeAt(m.xPct, m.y + (m.isBoss ? 34 : 26), m.isBoss);
      meteorsRef.current = meteorsRef.current.filter(mm => mm.id !== m.id);
      if (lockedId === m.id) setLockedId(null);
      if (m.isBoss) {
        spawnStarRain();
        playSoundEffect('sparkle', 0.35);
        spawnCdRef.current = 800 * timeMul; // BOSS 战后快点恢复节奏
      }
    }
  }, [combo, onEarnCoins, addScore, fireLaser, explodeAt, spawnStarRain, triggerWarp, lockedId, boardW]);

  // ---------- 主循环（60fps rAF：陨石下坠 + 摆动 + 生成节奏） ----------
  useRafLoop((dt) => {
    const list = meteorsRef.current;
    elapsedMsRef.current += dt;
    if (elapsedMsRef.current >= SURVIVE_SEC * 1000) { finishGame(true); return; }
    if (warpMsRef.current > 0) warpMsRef.current = Math.max(0, warpMsRef.current - dt);

    // 下落速度随连击提升（最多 1.3 倍）
    const mult = 1 + Math.min(combo, 15) * 0.02;
    let hit: Meteor | null = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      m.y += m.vy * mult * dt;                       // 持续明显的向下位移
      m.swayPhase += m.swaySpeed * dt;               // 轻微左右摆动（自转由 CSS meteorSpin 负责）
      m.xPct = m.baseX + Math.sin(m.swayPhase) * m.swayAmp;
      if (m.y >= DEAD_LINE) { list.splice(i, 1); hit = m; } // 触底 → 护盾损失
    }
    if (hit) handleShieldHit(hit);

    // 生成节奏：BOSS 优先且独占场地（登场前先预警 1.2 秒）
    spawnCdRef.current -= dt;
    const bossOnField = list.some(m => m.isBoss);
    const bossDue = wordsDoneRef.current >= nextBossAt;
    if (!bossOnField) {
      if (bossDue && list.length === 0) {
        if (bossWarnMsRef.current < 0) {
          bossWarnMsRef.current = 1200;
        } else {
          bossWarnMsRef.current -= dt;
          if (bossWarnMsRef.current <= 0) {
            bossWarnMsRef.current = -1;
            spawnMeteor(true);
            setNextBossAt(n => n + BOSS_EVERY);
          }
        }
      } else if (!bossDue) {
        const regular = list.filter(m => !m.isBoss).length;
        if (regular < 2 && spawnCdRef.current <= 0) {
          spawnMeteor(false);
          spawnCdRef.current = (2800 + Math.random() * 1600) * timeMul;
        }
      }
    }

    // 帧快照 → 渲染
    setSnap({
      meteors: list.map(m => {
        const fall = Math.max(0, m.y) / DEAD_LINE; // 下落进度 0~1
        return {
          id: m.id, xPct: m.xPct, y: m.y,
          scale: m.isBoss ? 1 + fall * 0.18 : 0.8 + fall * 0.75,      // 近大远小
          danger: Math.max(0, Math.min(1, (m.y - DEAD_LINE * 0.55) / (DEAD_LINE * 0.45))), // 底部红晕
          isBoss: m.isBoss, wordIndex: m.wordIndex, typed: m.typed, word: wordOf(m),
        };
      }),
      elapsedMs: elapsedMsRef.current,
      warp: warpMsRef.current > 0,
      bossWarn: bossWarnMsRef.current > 0,
    });
  }, !finished);

  // ---------- 打字输入 ----------
  useKeyDown((e: KeyboardEvent) => {
    if (finished || e.repeat) return;
    const key = e.key.toLowerCase();
    if (!/^[a-z]$/.test(key) && key !== ' ') return; // 字母与空格键只用于打字（词组含空格）
    const list = meteorsRef.current;
    if (!list.length) return;

    const locked = lockedId != null ? list.find(m => m.id === lockedId) : undefined;
    if (locked) {
      const w = wordOf(locked).typing;
      if (key === w[locked.typed.length]) {
        advanceLetter(locked, key);
      } else {
        // 尝试切换锁定：其它陨石首字母命中（宽容设计，防误伤连击）
        const cand = list.filter(m => m.id !== locked.id && m.typed.length === 0 && wordOf(m).typing[0] === key);
        if (cand.length) {
          locked.typed = '';
          const target = cand.reduce((a, b) => (b.y > a.y ? b : a));
          setLockedId(target.id);
          playSoundEffect('whoosh', 0.1);
          advanceLetter(target, key);
        } else {
          playSoundEffect('error', 0.12);
          setCombo(0); // 错字只清连击
        }
      }
    } else {
      const cand = list.filter(m => wordOf(m).typing[0] === key);
      if (cand.length) {
        const target = cand.reduce((a, b) => (b.y > a.y ? b : a));
        setLockedId(target.id);
        advanceLetter(target, key);
      } else {
        playSoundEffect('error', 0.12);
        setCombo(0);
      }
    }
  });

  const advanceLetter = (m: Meteor, key: string) => {
    const w = wordOf(m).typing;
    m.typed += key;
    playSoundEffect('click', 0.12);
    if (m.typed.length >= w.length) {
      completeWordOn(m);
    }
    // 高亮进度由下一帧快照同步（≤16ms，无感知）
  };

  // ---------- 派生 ----------
  const target = useMemo(() => {
    const locked = lockedId != null ? snap.meteors.find(m => m.id === lockedId) : undefined;
    if (locked) return locked;
    if (!snap.meteors.length) return null;
    return snap.meteors.reduce((a, b) => (b.y > a.y ? b : a));
  }, [snap, lockedId]);

  const timeLeft = Math.max(0, SURVIVE_SEC - Math.floor(snap.elapsedMs / 1000));
  const warp = snap.warp;
  const bossWarnNow = snap.bossWarn;

  // ---------- 重开 ----------
  const resetGame = useCallback(() => {
    meteorsRef.current = [];
    elapsedMsRef.current = 0;
    warpMsRef.current = 0;
    spawnCdRef.current = 1200 * timeMul;
    bossWarnMsRef.current = -1;
    wordsDoneRef.current = 0;
    setLockedId(null); setShield(SHIELD_MAX); setScore(0);
    setCombo(0); setMaxCombo(0); setWordsDone(0); setNextBossAt(BOSS_EVERY);
    setLaser(null); setExplosions([]); setStarDrops([]);
    setFinished(false); setWon(false); setShakeTick(0); setFlashTick(0);
    setSnap({ meteors: [], elapsedMs: 0, warp: false, bossWarn: false });
    initedRef.current = true;
    // 直接生成开局陨石（避免闭包里残留旧难度）
    spawnMeteor(false);
    playSoundEffect('click');
  }, [spawnMeteor]);

  return (
    <div ref={wrapRef} className="flex flex-col gap-3 w-full max-w-5xl mx-auto animate-fade-in">
      <style>{`
        @keyframes fragFly { from { transform: translate(0,0) rotate(0deg) scale(1); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) rotate(220deg) scale(0.25); opacity: 0; } }
        @keyframes laserShot { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes starDrift { 0% { transform: translate(0,-40px); } 100% { transform: translate(0,620px); } }
        @keyframes shipIdle { 0%,100% { transform: translate(0,0) rotate(0deg); } 25% { transform: translate(1.5px,-1px) rotate(1deg); } 50% { transform: translate(-1.5px,1px) rotate(-1deg); } 75% { transform: translate(1px,1.5px) rotate(0.5deg); } }
        @keyframes warpStreak { from { transform: translateY(-90px); } to { transform: translateY(650px); } }
        @keyframes starFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(600px) rotate(420deg); opacity: 0; } }
        @keyframes redFlash { from { opacity: 0.6; } to { opacity: 0; } }
        @keyframes bossWarn { 0%, 100% { opacity: 0.4; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.05); } }
      `}</style>

      <GameHeader emoji="🚀" title="星际护卫队" tag="太空射击" tagColor="bg-[#F3E8FF] text-[#8258C7] border-[#D9C2F5]">
        <ScorePill icon="⭐" label="得分" value={score} />
        <ComboFlame combo={combo} />
        {warp && <ScorePill icon="⚡" label="曲速" value="×2" color="bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD] animate-wiggle" />}
        <BackButton onBack={onBack} />
      </GameHeader>

      <GameBoard
        className="h-[560px] max-w-2xl mx-auto w-full"
        style={{ background: 'linear-gradient(180deg, #0B1026 0%, #141B3C 55%, #1B2447 100%)' }}
        shake={shakeTick > 0}
      >
        {/* 游戏板实测宽度锚点（陨石/激光/飘分坐标基准） */}
        <div ref={boardElRef} className="absolute inset-0 pointer-events-none" />
        {/* 星云色斑 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-64 h-64 rounded-full blur-3xl opacity-25" style={{ background: 'radial-gradient(circle, #A57DE0, transparent 70%)', left: '4%', top: '6%' }} />
          <div className="absolute w-56 h-56 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #4FB8E7, transparent 70%)', right: '6%', top: '34%' }} />
          <div className="absolute w-48 h-48 rounded-full blur-3xl opacity-15" style={{ background: 'radial-gradient(circle, #FF8FAB, transparent 70%)', left: '34%', bottom: '4%' }} />
        </div>

        {/* 星空向下漂移 = 飞船前进感（负延迟打散相位，曲速时变拉丝） */}
        {!warp && stars.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white pointer-events-none"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: 0.35 + s.size / 12,
              animation: `starDrift ${(5.5 + s.size * 0.9).toFixed(1)}s linear infinite`, animationDelay: `-${s.delay}s` }} />
        ))}
        {warp && (
          <>
            {streaks.map((s, i) => (
              <div key={i} className="absolute w-[3px] rounded-full pointer-events-none"
                style={{ left: `${s.x}%`, height: 64, background: 'linear-gradient(to bottom, transparent, rgba(125,211,252,0.9), #fff)', animation: `warpStreak ${s.dur}s linear infinite`, animationDelay: `${s.delay}s` }} />
            ))}
            <div className="absolute inset-x-0 top-14 text-center pointer-events-none z-30">
              <span className="font-black text-lg text-[#7DD3FC] font-kids drop-shadow">⚡ 曲速引擎 · 得分×2 ⚡</span>
            </div>
          </>
        )}

        {/* BOSS 预警（登场前 1.2 秒） */}
        {bossWarnNow && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="bg-[#2B0A0A]/85 border-3 border-[#FF8A5C] rounded-2xl px-6 py-3 font-black text-[#FF8A5C] text-xl font-kids" style={{ animation: 'bossWarn 0.8s ease-in-out infinite' }}>
              ⚠️ 巨型陨石来袭 ⚠️
            </div>
          </div>
        )}

        {/* 陨石群（translate3d 定位 + 近大远小 + 底部红晕警示） */}
        {snap.meteors.map(m => {
          const isTarget = target?.id === m.id;
          const px = (m.xPct / 100) * boardW;
          const glow = m.danger > 0.05;
          return (
            <div key={m.id} className="absolute z-20 left-0 top-0 will-change-transform"
              style={{ transform: `translate3d(${px}px, ${m.y}px, 0) translateX(-50%)` }}>
              {m.isBoss ? (
                <div className="relative flex flex-col items-center">
                  {/* 陨石体+尾焰：近大远小缩放（单词牌不缩，任何距离词都看得清） */}
                  <div className="relative flex flex-col items-center" style={{ transform: `scale(${m.scale})` }}>
                    {/* 下坠热度尾焰 */}
                    <div className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                      style={{ bottom: '100%', marginBottom: 4, width: 46, height: 26 + m.danger * 40, background: 'linear-gradient(to top, rgba(255,138,92,0.45), transparent)', filter: 'blur(5px)' }} />
                    <div className={`relative flex items-center justify-center rounded-[2.2rem] ${m.wordIndex === 1 ? 'animate-wiggle' : ''}`}
                      style={{
                        width: 'min(46vw, 340px)', height: 96,
                        background: 'radial-gradient(circle at 35% 30%, #B497E7 0%, #7A5FB8 48%, #4A3670 100%)',
                        boxShadow: glow
                          ? `0 0 ${16 + m.danger * 34}px ${6 + m.danger * 16}px rgba(239,68,68,${0.28 + m.danger * 0.45}), 0 10px 0 rgba(0,0,0,0.35)`
                          : m.wordIndex === 1 ? '0 0 26px 8px rgba(255,138,92,0.55)' : '0 10px 0 rgba(0,0,0,0.35)',
                      }}>
                      <span className="text-6xl select-none" style={{ animation: 'meteorSpin 14s linear infinite' }}>🪐</span>
                      {m.wordIndex === 1 && <span className="absolute text-4xl opacity-70 select-none">⚡</span>}
                      {isTarget && <div className="absolute -inset-2 rounded-[2.6rem] border-4 border-[#FFC94D] animate-pulse" />}
                    </div>
                  </div>
                  <div className="mt-1.5 bg-white/95 rounded-xl px-3 py-1 shadow-lg">
                    <TypedWord word={m.word.typing} typedLen={m.typed.length} size="md" />
                  </div>
                </div>
              ) : (
                <div className="relative flex flex-col items-center">
                  {/* 陨石体+尾焰：近大远小缩放（单词牌不缩） */}
                  <div className="relative flex flex-col items-center" style={{ transform: `scale(${m.scale})` }}>
                    {/* 下坠热度尾焰（越近底线越长） */}
                    <div className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                      style={{ bottom: '100%', marginBottom: 2, width: 12, height: 20 + m.danger * 34, background: 'linear-gradient(to top, rgba(255,138,92,0.5), transparent)', filter: 'blur(3px)' }} />
                    <div className="relative" style={{ width: 62, height: 62 }}>
                      <div className="absolute inset-0 rounded-full"
                        style={{
                          background: 'radial-gradient(circle at 35% 30%, #D98A5F 0%, #A0522D 55%, #6B3A24 100%)',
                          boxShadow: glow
                            ? `0 0 ${14 + m.danger * 30}px ${4 + m.danger * 12}px rgba(239,68,68,${0.25 + m.danger * 0.5}), 0 5px 0 rgba(0,0,0,0.3)`
                            : '0 5px 0 rgba(0,0,0,0.3)',
                          animation: 'meteorSpin 9s linear infinite',
                        }}>
                        <div className="absolute left-2.5 top-3 w-3.5 h-3.5 rounded-full bg-black/20" />
                        <div className="absolute right-3 top-6 w-2.5 h-2.5 rounded-full bg-black/25" />
                        <div className="absolute left-4 bottom-2.5 w-2 h-2 rounded-full bg-black/15" />
                      </div>
                      {isTarget && <div className="absolute -inset-1.5 rounded-full border-4 border-[#FFC94D] animate-pulse" />}
                    </div>
                  </div>
                  <div className="mt-1 bg-white/95 rounded-xl px-2.5 py-0.5 shadow-lg">
                    <TypedWord word={m.word.typing} typedLen={m.typed.length} size="md" />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 飞船（底部中央 + 引擎喷焰 + 怠速微震） */}
        <div className="absolute left-1/2 z-20" style={{ bottom: 76, transform: 'translateX(-50%)' }}>
          <div className="relative" style={{ animation: 'shipIdle 0.5s ease-in-out infinite' }}>
            <div className="absolute left-1/2 -translate-x-1/2 w-3 h-7 rounded-full pointer-events-none"
              style={{ bottom: -4, background: 'linear-gradient(to top, rgba(255,138,92,0), #FF8A5C 60%, #FFD166)', filter: 'blur(1px)', animation: 'nitroFlame 0.18s infinite ease-in-out' }} />
            <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-10 rounded-full pointer-events-none"
              style={{ bottom: -8, background: 'linear-gradient(to top, rgba(125,211,252,0), #7DD3FC 70%, #fff)', filter: 'blur(2px)', animation: 'nitroFlame 0.14s infinite ease-in-out', transform: `translateX(-50%) scaleY(${warp ? 1.6 : 1})` }} />
            <span className="relative block text-5xl select-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]" style={{ transform: 'rotate(-45deg)' }}>🚀</span>
          </div>
        </div>

        {/* 激光束：从飞船炮口斜射向陨石（青色渐变 + 白芯 + glow） */}
        {laser && (() => {
          const shipXpx = boardW / 2;
          const tx = (laser.x / 100) * boardW;
          const len = Math.max(20, Math.hypot(tx - shipXpx, laser.toY - SHIP_NOSE));
          const ang = (Math.atan2(laser.toY - SHIP_NOSE, tx - shipXpx) * 180) / Math.PI;
          return (
            <div key={laser.id} className="absolute z-30 pointer-events-none origin-left"
              style={{ left: shipXpx, top: SHIP_NOSE, width: len, transform: `rotate(${ang}deg)` }}>
              <div className="h-2 w-full rounded-full" style={{ background: 'linear-gradient(90deg, rgba(125,211,252,0.95), rgba(59,130,246,0.85))', boxShadow: '0 0 14px 4px rgba(56,189,248,0.65)', transformOrigin: 'left', animation: 'laserShot 0.14s ease-out' }}>
                <div className="absolute inset-y-0 left-0 w-full flex items-center">
                  <div className="h-[2.5px] w-full bg-white rounded-full" style={{ boxShadow: '0 0 8px #fff' }} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* 爆炸（橙色碎片 + 冲击环） */}
        {explosions.map(ex => (
          <div key={ex.id} className="absolute z-30 pointer-events-none" style={{ left: `${ex.x}%`, top: ex.y }}>
            <div className="absolute rounded-full border-4"
              style={{
                width: ex.big ? 64 : 28, height: ex.big ? 64 : 28, left: ex.big ? -32 : -14, top: ex.big ? -32 : -14,
                borderColor: ex.big ? 'rgba(255,201,77,0.95)' : 'rgba(255,179,71,0.85)',
                animation: 'splashRing 0.6s ease-out forwards',
              }} />
            {ex.frags.map((f, i) => (
              <div key={i} className="absolute rounded-md"
                style={{
                  width: ex.big ? 16 : 10, height: ex.big ? 16 : 10, left: -5, top: -5,
                  background: 'linear-gradient(135deg, #FFD166, #E0633A)',
                  animation: 'fragFly 0.68s ease-out forwards', animationDelay: `${i * 0.04}s`,
                  '--dx': `${f.dx}px`, '--dy': `${f.dy}px`,
                } as React.CSSProperties} />
            ))}
            {ex.big && <div className="absolute text-4xl animate-pop-burst" style={{ left: -18, top: -22 }}>💥</div>}
          </div>
        ))}

        {/* BOSS 星星雨 */}
        {starDrops.map(s => (
          <span key={s.id} className="absolute z-30 text-2xl select-none pointer-events-none"
            style={{ left: `${s.x}%`, top: -28, animation: `starFall 1.5s ease-in ${s.delay}s forwards` }}>⭐</span>
        ))}

        {/* 板内 HUD：护盾 / 波数 / 倒计时 */}
        <div className="absolute top-2.5 left-3 z-30 flex items-center gap-1.5 bg-[#0B1026]/75 rounded-full pl-2.5 pr-3.5 py-1.5 border-2 border-[#4FB8E7]/50">
          <span className="text-sm select-none">🛡️</span>
          {Array.from({ length: SHIELD_MAX }, (_, i) => (
            <div key={i} className={`h-3 w-8 rounded-full ${i < shield ? 'bg-gradient-to-r from-[#4FB8E7] to-[#7DD3FC] shadow-[0_0_8px_rgba(79,184,231,0.9)]' : 'bg-white/15'}`} />
          ))}
        </div>
        <div className="absolute top-2.5 right-3 z-30 flex items-center gap-3 bg-[#0B1026]/75 rounded-full px-3.5 py-1.5 border-2 border-[#FFC94D]/50 text-white font-black text-xs">
          <span>🌊 第{wordsDone + 1}波</span>
          <span className="text-[#FFC94D]">⏱ {timeLeft}s</span>
        </div>

        {/* 新手提示 */}
        {wordsDone === 0 && snap.elapsedMs < 7000 && (
          <div className="absolute top-12 inset-x-0 text-center z-20 pointer-events-none">
            <span className="text-white/70 text-xs font-bold bg-[#0B1026]/60 rounded-full px-3 py-1">敲陨石上的单词发射激光，守住护盾！</span>
          </div>
        )}

        {/* 破盾红闪 */}
        {flashTick > 0 && (
          <div key={flashTick} className="absolute inset-0 z-40 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(239,68,68,0) 30%, rgba(239,68,68,0.55) 100%)', animation: 'redFlash 0.45s ease-out forwards' }} />
        )}

        <ScoreLayer />

        {finished && (
          <ResultModal
            title={won ? '成功守护地球！' : '护盾耗尽啦，再来一次！'}
            emoji={won ? '🏆' : '💥'}
            score={score}
            coins={wordsDone * 3}
            combo={maxCombo}
            stars={calcStars(score, 650)}
            replay={resetGame}
            onBack={onBack}
          />
        )}
      </GameBoard>
    </div>
  );
};
