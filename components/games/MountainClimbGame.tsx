import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useGameLoop, useFloatScores,
  TypedWord, ResultModal, GameHeader, GameBoard, BackButton, ScorePill, ComboFlame, calcStars, speakGameWord,
} from './shared';

// ============ ⛰️ 登山小勇士 · 超级跳跃登顶 ============
// 12 个台阶从山脚跳到峰顶，敲完单词小人就超级玛丽式弧线跳跃！
// 跳跃三段式（heroJump keyframes）：
//   0~19%  蹲下蓄力 0.15s（squash 压扁）
//   19~84% 弧线飞跃 0.5s（x 线性 + y 抛物线插值，前倾15°→后仰→回正）
//   84~100% 落地 0.12s（压扁→回弹拉伸 + 灰尘两侧溅起 + 微震屏）
// 海拔带天气渐变：阳光草甸 → 云雾 → 飞雪 → 星空；25%/50%/75% 是篝火营地（额外金币）。
// 连击 ≥ 6 触发「山羊冲刺」：跳跃整体提速 1.5 倍。全程无失败，只计用时和连击！
// 登顶插旗 🚩 + 日出光芒 + 胜利结算！
// 坑洞机制：12 阶中随机 4 阶（1/3）是坑洞——到坑洞前会弹红色警示，
// 忍住不打字 3 秒坑洞自动填好；没忍住打字 = 掉回山脚重新出发！

const TOTAL_STEPS = 12;
const CAMP_CLIMBS = [3, 6, 9];   // 第几次跳跃到达营地（25% / 50% / 75%）
const SUMMIT_BONUS = 60;
const HOLE_COUNT = Math.round(TOTAL_STEPS / 3); // 坑洞数量（1/3 ≈ 4 个）

// 每局随机生成坑洞位置（第 2~12 阶，避开营地和峰顶）
const genHoles = (): Set<number> => {
  const cands = Array.from({ length: TOTAL_STEPS - 1 }, (_, i) => i + 2)
    .filter(n => !CAMP_CLIMBS.includes(n) && n < TOTAL_STEPS);
  const holes = new Set<number>();
  let guard = 0;
  while (holes.size < HOLE_COUNT && holes.size < cands.length && guard++ < 50) {
    holes.add(cands[Math.floor(Math.random() * cands.length)]);
  }
  return holes;
};

// 台阶折线坐标（百分比）：山脚左下 → 峰顶右上
const posOf = (i: number): { x: number; y: number } =>
  i < 0 ? { x: 6, y: 84 } : { x: 13 + i * 6.4, y: 74 - i * 5.5 };

// ---------- 颜色插值：天空 4 带实时渐变 ----------
const SKY_STOPS = [
  { a: 0.0, top: '#7EC8F2', bot: '#D9F2C8' },   // 阳光草甸
  { a: 0.28, top: '#A8C4DC', bot: '#EDF3EC' },  // 云雾
  { a: 0.55, top: '#8FA6C4', bot: '#E4EBF2' },  // 飞雪
  { a: 0.82, top: '#12245A', bot: '#2A3E7A' },  // 星空
  { a: 1.0, top: '#0A1638', bot: '#1B2E66' },
];

const hexLerp = (h1: string, h2: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(h1);
  const [r2, g2, b2] = p(h2);
  const L = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${L(r1, r2)},${L(g1, g2)},${L(b1, b2)})`;
};

const skyAt = (alt: number): { top: string; bot: string } => {
  let i = 0;
  while (i < SKY_STOPS.length - 2 && alt > SKY_STOPS[i + 1].a) i++;
  const s1 = SKY_STOPS[i];
  const s2 = SKY_STOPS[i + 1];
  const t = Math.max(0, Math.min(1, (alt - s1.a) / (s2.a - s1.a)));
  return { top: hexLerp(s1.top, s2.top, t), bot: hexLerp(s1.bot, s2.bot, t) };
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));

interface ClimbAnim { dx: number; dy: number; arc: number; dur: number; rush: boolean; }

// 登山小帽（CSS 画的毛线帽，戴在 🦸 头上）
const MountainHat: React.FC = () => (
  <div className="absolute left-1/2 z-10 pointer-events-none"
    style={{ top: -8, width: 21, height: 11, background: 'linear-gradient(180deg,#FF8A5C,#F76B3E)', borderRadius: '11px 11px 3px 3px', border: '2px solid #D9693C', transform: 'translateX(-58%) rotate(-7deg)' }}>
    <div className="absolute rounded-full bg-white" style={{ left: '50%', top: -6, width: 8, height: 8, marginLeft: -4, border: '2px solid #D9693C' }} />
  </div>
);

export const MountainClimbGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack }) => {
  const pickWord = useWordPool(wordList);
  const boardRef = useRef<HTMLDivElement>(null);

  const [stepsDone, setStepsDone] = useState(0);
  const [currentWord, setCurrentWord] = useState<GameItem>(() => pickWord());
  const [typed, setTyped] = useState('');
  const [climbing, setClimbing] = useState<ClimbAnim | null>(null);
  // 坑洞机制状态
  const [holeSet, setHoleSet] = useState<Set<number>>(genHoles);   // 本局坑洞位置
  const [holeFilled, setHoleFilled] = useState<Set<number>>(new Set()); // 已忍住填好的坑洞
  const [holePhase, setHolePhase] = useState(false);               // 正在"忍住别打"阶段
  const [falling, setFalling] = useState(false);                   // 掉回山脚动画中
  const [fallPos, setFallPos] = useState<{ x: number; y: number } | null>(null); // 滚落当前位置（顺坡逐阶）
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [summit, setSummit] = useState(false);
  const [finished, setFinished] = useState(false);
  const [campTick, setCampTick] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [boardW, setBoardW] = useState(900);
  const [landTick, setLandTick] = useState(0);                                  // 落地微震（A/B 交替重启动画）
  const [landFx, setLandFx] = useState<{ x: number; y: number; tick: number } | null>(null); // 落地灰尘
  const { addScore, Layer: ScoreLayer } = useFloatScores();

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

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; }, []);

  // ---------- 环境（花 / 树 / 雾 / 雪 / 星） ----------
  const flowers = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    x: 3 + (i % 5) * 8 + Math.random() * 4, y: 68 + Math.floor(i / 5) * 13 + Math.random() * 6,
    e: (['🌼', '🌸', '🌺'] as const)[i % 3], d: 2.4 + Math.random() * 1.6,
  })), []);
  const mists = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    x: 8 + i * 17 + Math.random() * 6, y: 30 + (i % 2) * 12 + Math.random() * 8, d: 5 + Math.random() * 3,
  })), []);
  const snows = useMemo(() => Array.from({ length: 22 }, () => ({
    x: Math.random() * 100, d: 4.2 + Math.random() * 3.2, delay: Math.random() * 4, s: 10 + Math.random() * 8,
  })), []);
  const starDots = useMemo(() => Array.from({ length: 24 }, () => ({
    x: Math.random() * 100, y: Math.random() * 42, size: 2 + Math.random() * 3.5, d: 1.6 + Math.random() * 2.4, delay: Math.random() * 2.5,
  })), []);

  // ---------- 派生 ----------
  const altFrac = stepsDone / TOTAL_STEPS;
  const altMeters = Math.round(altFrac * 8848);
  const goat = combo >= 6;
  const elapsedSec = Math.floor(elapsed / 10);
  const sky = skyAt(altFrac);
  const fallActive = falling || fallPos !== null;   // 滚落中（含顺坡逐阶阶段）
  const sunO = 1 - ramp(altFrac, 0.16, 0.3);
  const flowerO = 1 - ramp(altFrac, 0.18, 0.32);
  const mistO = Math.min(ramp(altFrac, 0.2, 0.3), 1 - ramp(altFrac, 0.5, 0.62));
  const snowO = Math.min(ramp(altFrac, 0.45, 0.56), 1 - ramp(altFrac, 0.72, 0.84));
  const starO = ramp(altFrac, 0.66, 0.8);

  const climberPos = posOf(stepsDone - 1);
  const climberLeft = (climberPos.x / 100) * boardW;
  const climberTop = (climberPos.y / 100) * 430;
  const peakPos = posOf(TOTAL_STEPS - 1);

  // ---------- 超级玛丽式跳跃 ----------
  const startClimb = useCallback(() => {
    const nc = combo + 1;
    const gained = 10 + nc * 2;
    const rush = nc >= 6;
    const dur = rush ? 520 : 780; // 蹲0.15s + 飞0.5s + 落0.12s（山羊冲刺整体提速）
    setScore(s => s + gained);
    setCombo(nc);
    setMaxCombo(mx => Math.max(mx, nc));
    setCoinsEarned(c => c + 3);
    onEarnCoins?.(3);
    if (nc === 6) {
      playSoundEffect('combo', 0.25);
      setBanner('🐐 山羊冲刺！跳得飞快！');
      t(1600, () => setBanner(null));
    }

    const from = posOf(stepsDone - 1);
    const to = posOf(stepsDone);
    const dx = ((to.x - from.x) / 100) * boardW;
    const dy = ((to.y - from.y) / 100) * 430;
    const arc = 78 + Math.min(nc * 4, 40) + Math.random() * 10; // 连击越高跳得越高
    setClimbing({ dx, dy, arc, dur, rush });
    setTyped('');
    playSoundEffect('whoosh', 0.15);

    // 落地瞬间（动画 84% 处）：灰尘两侧溅起 + 微震屏 + 得分
    t(Math.round(dur * 0.84), () => {
      setLandTick(k => k + 1);
      setLandFx({ x: (to.x / 100) * boardW, y: (to.y / 100) * 430 + 10, tick: Date.now() });
      playSoundEffect('pop', 0.2);
      addScore((to.x / 100) * boardW, (to.y / 100) * 430, `+${gained}`, '#48A757');
      t(650, () => setLandFx(null));
    });

    t(dur + 60, () => {
      const k = stepsDone + 1;
      setStepsDone(k);
      setClimbing(null);

      if (k >= TOTAL_STEPS) {
          // ===== 登顶！ =====
          const bonus = SUMMIT_BONUS + Math.max(0, 150 - Math.floor(elapsed / 10));
          setScore(s => s + bonus);
          setSummit(true);
          playSoundEffect('victory', 0.4);
          addScore((peakPos.x / 100) * boardW, (peakPos.y / 100) * 430, `登顶 +${bonus}`, '#E8A317');
          t(2400, () => setFinished(true));
        } else {
          if (CAMP_CLIMBS.includes(k)) {
          // ===== 篝火营地：烤火回血 + 额外金币 =====
          setScore(s => s + 15);
          setCoinsEarned(c => c + 2);
          onEarnCoins?.(2);
          setCampTick(tk => tk + 1);
          setBanner('🔥 营地小歇，烤烤火！金币 +2');
          t(1700, () => setBanner(null));
          playSoundEffect('bell', 0.25);
          playSoundEffect('sparkle', 0.2);
        }
        // ===== 坑洞警示：下一阶是坑洞 → 进入"忍住别打"阶段 =====
        if (holeSet.has(k + 1) && !holeFilled.has(k + 1)) {
          setHolePhase(true);
          playSoundEffect('wind', 0.18);
          t(3000, () => {
            setHolePhase(false);
            setHoleFilled(prev => new Set(prev).add(k + 1));
            setBanner('✅ 忍住了！坑洞填好啦，继续爬！');
            playSoundEffect('sparkle', 0.2);
            setScore(s => s + 5); // 克制力奖励
            t(1300, () => setBanner(null));
            setCurrentWord(pickWord());
          });
        } else {
          setCurrentWord(pickWord());
        }
      }
    });
  }, [combo, stepsDone, boardW, elapsed, onEarnCoins, addScore, peakPos, pickWord, t, holeSet, holeFilled]);

  // ---------- 掉进坑洞：打字了 → 顺着坡道逐阶滚回山脚（带滚动震动感） ----------
  const fallToBase = useCallback(() => {
    playSoundEffect('error', 0.35);
    setTimeout(() => playSoundEffect('pop', 0.22), 160);
    setHolePhase(false);
    setCombo(0);
    setTyped('');
    setBanner('🕳️ 哎呀掉进坑洞啦！滚回山脚重新出发');
    // 逐阶 waypoints：沿山坡台阶往下滚；28ms/阶 + 线性过渡 = 连续滚落（提速300%，不再闪现）
    const startStep = Math.max(0, stepsDone - 1);
    const STEP_MS = 28;
    for (let s = startStep; s >= -1; s--) {
      const p = posOf(s);
      t((startStep - s) * STEP_MS, () => {
        setFallPos({ x: (p.x / 100) * boardW, y: (p.y / 100) * 430 });
        if (s % 2 === 0) playSoundEffect('pop', 0.08); // 每两阶一声闷响，滚动质感
      });
    }
    t((startStep + 2) * STEP_MS + 120, () => {
      setFallPos(null);
      setFalling(false);
      setStepsDone(0);
      setBanner(null);
      setCurrentWord(pickWord());
    });
  }, [t, pickWord, stepsDone, boardW]);

  // ---------- 打字输入 ----------
  useKeyDown((e) => {
    if (finished || climbing || summit || fallActive || e.repeat) return;
    const key = e.key.toLowerCase();
    if (!/^[a-z]$/.test(key) && key !== ' ') return; // 字母与空格键只用于打字（词组含空格）
    // 坑洞警示阶段打字 = 掉进坑洞！
    if (holePhase) { fallToBase(); return; }
    const w = currentWord.typing;
    if (key === w[typed.length]) {
      playSoundEffect('click', 0.12);
      const nt = typed + key;
      if (nt.length >= w.length) {
        speakGameWord(currentWord); // 跳跃前语音朗读单词
        startClimb();
      } else {
        setTyped(nt);
      }
    } else {
      playSoundEffect('error', 0.1);
      setCombo(0); // 错字只清连击
    }
  });

  // ---------- 计时（无失败，只计用时） ----------
  useGameLoop(() => {
    if (finished || summit) return;
    setElapsed(e => e + 1);
  }, !finished, 100);

  // ---------- 重开 ----------
  const resetGame = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setStepsDone(0); setCurrentWord(pickWord()); setTyped('');
    setClimbing(null); setScore(0); setCombo(0); setMaxCombo(0);
    setCoinsEarned(0); setElapsed(0); setSummit(false);
    setFinished(false); setCampTick(0); setBanner(null);
    setLandTick(0); setLandFx(null); setFallPos(null);
    setHoleSet(genHoles()); setHoleFilled(new Set()); setHolePhase(false); setFalling(false);
    playSoundEffect('click');
  }, [pickWord]);

  return (
    <div className="flex flex-col gap-3 w-full max-w-5xl mx-auto animate-fade-in">
      <style>{`
        /* ===== 超级玛丽式跳跃：蓄力 → 抛物线 → 落地 ===== */
        @keyframes heroJump {
          0%   { transform: translate(0, 0) rotate(0deg) scale(1, 1); }
          19%  { transform: translate(0, 4px) rotate(-3deg) scale(1.16, 0.72); }                                                    /* 蹲下蓄力（压扁） */
          23%  { transform: translate(calc(var(--dx) * 0.06), calc(var(--dy) * 0.06 - var(--arc) * 0.20)) rotate(9deg) scale(0.95, 1.1); }   /* 起跳拉伸 */
          38%  { transform: translate(calc(var(--dx) * 0.29), calc(var(--dy) * 0.29 - var(--arc) * 0.83)) rotate(15deg) scale(0.97, 1.06); } /* 上升 · 前倾 */
          52%  { transform: translate(calc(var(--dx) * 0.51), calc(var(--dy) * 0.51 - var(--arc) * 1.0)) rotate(5deg) scale(1, 1); }         /* 弧顶 */
          66%  { transform: translate(calc(var(--dx) * 0.72), calc(var(--dy) * 0.72 - var(--arc) * 0.80)) rotate(-9deg) scale(1.03, 0.95); } /* 下降 · 后仰 */
          84%  { transform: translate(var(--dx), var(--dy)) rotate(0deg) scale(1.24, 0.74); }                                       /* 落地压扁 */
          92%  { transform: translate(var(--dx), var(--dy)) rotate(0deg) scale(0.94, 1.12); }                                       /* 回弹拉伸 */
          100% { transform: translate(var(--dx), var(--dy)) rotate(0deg) scale(1, 1); }
        }
        @keyframes dustL { 0% { opacity: 0.95; transform: translate(0, 0) scale(0.5); } 100% { opacity: 0; transform: translate(-30px, -16px) scale(1.4); } }
        @keyframes dustR { 0% { opacity: 0.95; transform: translate(0, 0) scale(0.5); } 100% { opacity: 0; transform: translate(28px, -12px) scale(1.35); } }
        @keyframes dustUp { 0% { opacity: 0.9; transform: translate(0, 0) scale(0.4); } 100% { opacity: 0; transform: translate(0, -22px) scale(1.1); } }
        @keyframes microQuakeA { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(2px, 3px); } 55% { transform: translate(-2px, 1px); } 80% { transform: translate(1px, -1px); } }
        @keyframes microQuakeB { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-2px, 3px); } 55% { transform: translate(2px, 1px); } 80% { transform: translate(-1px, -1px); } }
        @keyframes idleBounce { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.03); } }
        @keyframes fallSpin { 0% { transform: rotate(0deg) scale(1); } 100% { transform: rotate(-560deg) scale(0.55); opacity: 0.6; } }
        @keyframes monkeyIdle { 0%,100% { transform: rotate(-3deg) translateY(0); } 30% { transform: rotate(4deg) translateY(-3px); } 60% { transform: rotate(-2deg) translateY(0); } }
        @keyframes fallRoll { 0% { transform: rotate(-24deg) translateY(0); } 50% { transform: rotate(16deg) translateY(-5px); } 100% { transform: rotate(-24deg) translateY(0); } }
        @keyframes mistDrift { 0%, 100% { transform: translateX(-26px); } 50% { transform: translateX(26px); } }
        @keyframes snowFall { 0% { transform: translateY(-16px) translateX(0) rotate(0deg); } 50% { transform: translateY(220px) translateX(18px) rotate(180deg); } 100% { transform: translateY(460px) translateX(-10px) rotate(360deg); } }
        @keyframes breathPuff { 0% { opacity: 0; transform: scale(0.5) translate(0, 0); } 30% { opacity: 0.85; } 100% { opacity: 0; transform: scale(1.3) translate(10px, -22px); } }
        @keyframes plantFlag { 0% { transform: scale(0) rotate(-40deg); } 60% { transform: scale(1.25) rotate(6deg); } 100% { transform: scale(1) rotate(0deg); } }
        @keyframes sunRise { 0% { transform: scale(0.2); opacity: 0.95; } 60% { transform: scale(2.2); opacity: 0.75; } 100% { transform: scale(3.2); opacity: 0.35; } }
      `}</style>

      <GameHeader emoji="⛰️" title="登山小勇士" tag="无失败·登顶挑战" tagColor="bg-[#E5F6EC] text-[#48A757] border-[#C8EED4]">
        <ScorePill icon="⛰️" label="海拔" value={`${altMeters}米`} color="bg-[#E5F6EC] text-[#357F43] border-[#C8EED4]" />
        <ScorePill icon="🐒" label="步数" value={`${stepsDone}/${TOTAL_STEPS}`} />
        <ScorePill icon="⏱" label="用时" value={`${elapsedSec}s`} />
        <ComboFlame combo={combo} />
        {goat && <ScorePill icon="🐐" label="山羊冲刺" value="×1.5" color="bg-[#FFF3D6] text-[#B8860B] border-[#FFE3A3] animate-wiggle" />}
        <BackButton onBack={onBack} />
      </GameHeader>

      <GameBoard
        className="h-[430px]"
        style={{
          background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.bot} 72%)`,
          // 落地微震：A/B 两个同名动画交替，保证每次落地都能重新触发
          animation: landTick > 0 ? `${landTick % 2 === 1 ? 'microQuakeA' : 'microQuakeB'} 0.24s ease-out` : undefined,
        }}
      >
        <div ref={boardRef} className="absolute inset-0">
          {/* ---------- 太阳 / 小鸟（草甸带） ---------- */}
          <div className="absolute pointer-events-none z-10" style={{ left: '3%', top: '3%', opacity: sunO }}>
            <span className="block text-6xl select-none" style={{ filter: 'drop-shadow(0 0 18px rgba(255,217,102,0.9))' }}>☀️</span>
          </div>
          <span className="absolute text-lg select-none pointer-events-none z-10" style={{ left: '30%', top: '12%', opacity: sunO * 0.85, animation: 'cloudDrift 20s linear infinite' }}>🐦</span>
          <span className="absolute text-sm select-none pointer-events-none z-10" style={{ left: '5%', top: '20%', opacity: sunO * 0.7, animation: 'cloudDrift 30s linear infinite', animationDelay: '-9s' }}>🐦</span>

          {/* ---------- 星空（顶峰带） ---------- */}
          <div className="absolute inset-0 pointer-events-none z-10" style={{ opacity: starO }}>
            {starDots.map((s, i) => (
              <span key={i} className="absolute rounded-full bg-white animate-twinkle" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDuration: `${s.d}s`, animationDelay: `${s.delay}s` }} />
            ))}
            <span className="absolute right-[8%] top-[5%] text-2xl select-none">🌙</span>
          </div>

          {/* ---------- 云雾带（白雾飘过） ---------- */}
          <div className="absolute inset-0 pointer-events-none z-10" style={{ opacity: mistO }}>
            {mists.map((m, i) => (
              <div key={i} className="absolute rounded-full blur-md" style={{ left: `${m.x}%`, top: `${m.y}%`, width: 150, height: 44, background: 'rgba(255,255,255,0.75)', animation: `mistDrift ${m.d}s ease-in-out infinite` }} />
            ))}
          </div>

          {/* ---------- 飞雪带（雪花 + 呼吸白气） ---------- */}
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden" style={{ opacity: snowO }}>
            {snows.map((s, i) => (
              <span key={i} className="absolute select-none" style={{ left: `${s.x}%`, top: -20, fontSize: s.s, animation: `snowFall ${s.d}s linear infinite`, animationDelay: `${s.delay}s` }}>❄️</span>
            ))}
          </div>
          {snowO > 0.08 && stepsDone < TOTAL_STEPS && (
            <div className="absolute pointer-events-none z-30" style={{ left: climberLeft + 14, top: climberTop - 26 }}>
              <span className="absolute w-3.5 h-3.5 rounded-full bg-white/80" style={{ animation: 'breathPuff 2.2s ease-out infinite' }} />
              <span className="absolute w-2.5 h-2.5 rounded-full bg-white/70" style={{ animation: 'breathPuff 2.2s ease-out 1.1s infinite' }} />
            </div>
          )}

          {/* ---------- 山体（多层多边形：远山青蓝 / 近山深绿） ---------- */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="0,100 0,58 14,32 30,60 46,40 62,66 78,50 100,64 100,100" fill="#9DBFDB" opacity="0.5" />
            <polygon points="0,100 0,70 20,48 40,72 58,52 76,74 100,58 100,100" fill="#7FA8C9" opacity="0.55" />
            <polygon points="0,100 0,82 10,78.5 14,79.5 84,15.5 89,11 100,7 100,100" fill="#57A46C" opacity="0.96" />
            <polygon points="14,79.5 84,15.5 84,20.5 20,84.5" fill="#3B7A52" opacity="0.4" />
            <polygon points="84,15.5 89,11 100,7 100,20 92,21.5 86,19" fill="#F4F9FF" opacity="0.95" />
          </svg>

          {/* ---------- 草甸花与树（低海拔） ---------- */}
          <div className="absolute inset-0 pointer-events-none z-10" style={{ opacity: flowerO }}>
            {flowers.map((f, i) => (
              <span key={i} className="absolute select-none animate-sway" style={{ left: `${f.x}%`, top: `${f.y}%`, animationDuration: `${f.d}s` }}>{f.e}</span>
            ))}
            {[
              { x: 8, y: 62 }, { x: 24, y: 70 }, { x: 33, y: 58 },
            ].map((tr, i) => (
              <span key={`t${i}`} className="absolute select-none text-2xl animate-sway" style={{ left: `${tr.x}%`, top: `${tr.y}%`, animationDuration: `${3 + i}s` }}>🌲</span>
            ))}
          </div>

          {/* ---------- 台阶（石块 + 苔藓；营地有篝火；坑洞是黑洞陷阱） ---------- */}
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const p = posOf(i);
            const isCamp = CAMP_CLIMBS.includes(i + 1);
            const isNext = i === stepsDone && !summit;
            const done = i < stepsDone;
            const isHole = holeSet.has(i + 1) && !holeFilled.has(i + 1);
            return (
              <div key={i} className="absolute z-20" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}>
                <div className={`relative rounded-lg ${isNext ? 'ring-4 ring-[#FFC94D] animate-pulse' : ''}`}
                  style={isHole
                    ? { width: 46, height: 26, background: 'radial-gradient(ellipse at center 60%, #14100A 0%, #33250F 75%)', border: '2px solid #241A0E', boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.75)' }
                    : { width: 44, height: 24, background: done ? 'linear-gradient(180deg, #C6BCB0, #988D80)' : 'linear-gradient(180deg, #B8AEA2, #8D8275)', border: '2px solid #6E655B', boxShadow: '0 3px 0 rgba(0,0,0,0.25)' }}>
                  {isHole ? (
                    <span className="absolute inset-0 flex items-center justify-center text-sm select-none" style={{ filter: 'drop-shadow(0 0 3px #000)' }}>🕳️</span>
                  ) : (
                    <>
                      <div className="absolute -top-1 left-1.5 w-2.5 h-2.5 rounded-full bg-[#6BCB77]" />
                      <div className="absolute -top-0.5 right-2 w-1.5 h-1.5 rounded-full bg-[#6BCB77]/70" />
                    </>
                  )}
                </div>
                {isCamp && (
                  <span className={`absolute -top-8 left-1/2 -translate-x-1/2 text-2xl select-none ${campTick > 0 && i === stepsDone - 1 ? 'animate-breathe' : ''}`}
                    style={{ filter: 'drop-shadow(0 0 8px rgba(255,138,92,0.85))' }}>🔥</span>
                )}
                {/* 下一阶目标词：默认悬浮台阶正上方；高台阶（接近板顶）自动改到台阶下方，避免被窗口上沿裁掉 */}
                {isNext && !finished && (
                  <div className={`absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none ${p.y < 30 ? 'top-full mt-2.5' : 'bottom-full mb-2.5'}`}>
                    {holePhase ? (
                      <div className="bg-[#FFE3E3] rounded-2xl border-3 border-[#E0633A] px-3.5 py-1.5 shadow-lg animate-pulse flex flex-col items-center whitespace-nowrap">
                        <span className="text-base font-black text-[#E0633A] font-kids">🕳️ 坑洞！别打字！</span>
                        <span className="text-[10px] font-bold text-[#8A6F5C]">忍住不敲，等它自动填好 +5分</span>
                      </div>
                    ) : !climbing ? (
                      <div className="bg-white/95 rounded-2xl border-3 border-[#6BCB77] px-3 py-1 shadow-md flex flex-col items-center whitespace-nowrap">
                        <TypedWord word={currentWord.typing} typedLen={typed.length} size="md" />
                        <span className="text-[10px] font-bold text-[#8A6F5C] font-kids">{currentWord.display}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {/* ---------- 跳跃小人（🧗 面朝山坡攀爬 + CSS 登山帽；掉坑顺坡滚落带震动） ---------- */}
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: fallPos ? fallPos.x : climberLeft,
              top: fallPos ? fallPos.y : climberTop,
              transform: 'translate(-50%, -62%)',
              transition: fallPos ? 'left 60ms linear, top 60ms linear' : undefined,
            }}
          >
            {fallPos ? (
              <div style={{ animation: 'fallRoll 0.14s ease-in-out infinite' }}>
                <MountainHat />
                <span className="block text-4xl select-none" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.3))' }}>😵</span>
                <span className="absolute -top-4 -right-3 text-lg animate-twinkle select-none">⭐</span>
              </div>
            ) : falling ? (
              <div style={{ animation: 'fallSpin 0.7s ease-in forwards' }}>
                <MountainHat />
                <span className="block text-4xl select-none" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.3))' }}>😵</span>
                <span className="absolute -top-4 -right-3 text-lg animate-twinkle select-none">⭐</span>
              </div>
            ) : climbing ? (
              <div style={{ animation: `heroJump ${climbing.dur}ms linear forwards`, '--dx': `${climbing.dx}px`, '--dy': `${climbing.dy}px`, '--arc': `${climbing.arc}px` } as React.CSSProperties}>
                <MountainHat />
                <span className="block text-4xl select-none" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.3))' }}>🐒</span>
                {climbing.rush && <span className="absolute -left-6 top-3 text-base select-none">💨</span>}
              </div>
            ) : (
              <div className={`relative ${summit ? 'animate-breathe' : ''}`} style={{ animation: summit ? undefined : 'monkeyIdle 1.4s ease-in-out infinite' }}>
                <MountainHat />
                <span className="block text-4xl select-none" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.3))' }}>🐒</span>
              </div>
            )}
            {/* 营地烤火：爱心回血动画 */}
            {campTick > 0 && !climbing && !falling && stepsDone < TOTAL_STEPS && (
              <span key={campTick} className="absolute -top-7 left-3 text-lg animate-heart-pop">❤️</span>
            )}
          </div>

          {/* ---------- 落地灰尘（两侧溅起 + 上扬） ---------- */}
          {landFx && (
            <div key={landFx.tick} className="absolute z-30 pointer-events-none" style={{ left: landFx.x, top: landFx.y }}>
              <span className="absolute rounded-full bg-[#D9CCB4]" style={{ width: 16, height: 11, left: -26, top: -4, animation: 'dustL 0.55s ease-out forwards' }} />
              <span className="absolute rounded-full bg-[#E6DCC8]" style={{ width: 12, height: 9, left: 12, top: -3, animation: 'dustR 0.6s ease-out forwards' }} />
              <span className="absolute rounded-full bg-[#CFC0A6]" style={{ width: 9, height: 7, left: -4, top: -8, animation: 'dustUp 0.45s ease-out forwards' }} />
            </div>
          )}

          {/* ---------- 登顶：插旗 + 日出光芒 ---------- */}
          {summit && (
            <>
              <div className="absolute z-30 pointer-events-none" style={{ left: `${peakPos.x}%`, top: `${peakPos.y}%`, transform: 'translate(-40%, -110%)' }}>
                <span className="block text-4xl select-none" style={{ animation: 'plantFlag 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>🚩</span>
              </div>
              <div className="absolute z-20 pointer-events-none" style={{ left: `${peakPos.x}%`, top: `${peakPos.y}%`, transform: 'translate(-50%, -50%)' }}>
                <div className="rounded-full" style={{ width: 160, height: 160, marginLeft: -80, marginTop: -80, background: 'radial-gradient(circle, rgba(255,236,150,0.95) 0%, rgba(255,201,77,0.55) 40%, transparent 70%)', animation: 'sunRise 1.8s ease-out forwards' }} />
                <div className="rounded-full" style={{ width: 90, height: 90, marginLeft: -45, marginTop: -45, background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,217,102,0.6) 50%, transparent 72%)', animation: 'sunRise 1.4s ease-out 0.3s forwards' }} />
              </div>
              <div className="absolute inset-x-0 top-3 text-center z-30 pointer-events-none">
                <span className="bg-[#FFF3D6] text-[#8A6F00] font-black text-sm px-4 py-1.5 rounded-full border-3 border-[#FFC94D] shadow-lg animate-float-y">🎉 登顶成功！日出啦！</span>
              </div>
            </>
          )}

          {/* ---------- 左侧海拔尺（指针随高度移动） ---------- */}
          <div className="absolute z-30" style={{ left: 10, top: 62, width: 14, height: 306 }}>
            <div className="absolute inset-0 rounded-full border-2 border-white/80 shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
              style={{ background: 'linear-gradient(0deg, #6BCB77 0%, #6BCB77 25%, #EDF3EC 25%, #EDF3EC 50%, #B9CBE0 50%, #B9CBE0 75%, #1B2E66 75%, #1B2E66 100%)' }} />
            <div className="absolute -left-4 transition-all duration-500" style={{ bottom: `calc(${altFrac * 100}% - 9px)` }}>
              <span className="text-base select-none" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>🐒</span>
            </div>
            <span className="absolute -top-6 -left-3 text-[10px] font-black text-[#5B4636] bg-white/85 rounded-full px-1.5 select-none">8848</span>
          </div>

          {/* ---------- 提示横幅 ---------- */}
          {banner && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
              <span className="bg-white/95 text-[#5B4636] font-black text-sm px-4 py-1.5 rounded-full border-3 border-[#FFC94D] shadow-lg animate-fade-in">{banner}</span>
            </div>
          )}

          <ScoreLayer />

          {/* ---------- 跳跃/掉坑状态横幅（单词已上台阶，不再占底部大框） ---------- */}
          {!finished && (climbing || summit || fallActive) && (
            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-30 rounded-2xl border-3 px-6 py-2.5 shadow-[0_4px_0_rgba(0,0,0,0.15)] flex items-center gap-2 ${
              fallActive ? 'bg-[#FFE3E3] border-[#E0633A]' : 'bg-white/90 border-[#A57DE0]'
            }`}>
              <span className="text-2xl animate-wiggle">{fallActive ? '😵' : '🐒'}</span>
              <span className="font-black text-[#5B4636] font-kids">
                {fallActive ? '哎呀！掉进坑洞…' : summit ? '插旗庆祝中…' : climbing?.rush ? '山羊冲刺！跳得飞快！' : '蓄力 — 超级跳跃！'}
              </span>
            </div>
          )}

          {finished && (
            <ResultModal
              title={`登顶成功！用时 ${elapsedSec} 秒`}
              emoji="🚩"
              score={score}
              coins={coinsEarned}
              combo={maxCombo}
              stars={calcStars(score, 400)}
              replay={resetGame}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>
    </div>
  );
};
