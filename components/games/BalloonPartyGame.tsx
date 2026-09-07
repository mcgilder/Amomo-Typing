import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, useKeyDown, useRafLoop, useFloatScores, useDifficulty,
  ResultModal, GameHeader, GameBoard, BackButton, ComboFlame,
  ScorePill, calcStars,
} from './shared';

// ============ 🎈 气球派对（字母雨的对偶版：一个往下掉、一个往上飘） ============
// 派对房里字母气球从底部摇摇摆摆升上来（4-5 秒飘到顶），
// 敲对气球上的字母 → "砰!"炸开：pop + confetti + 气球皮碎片！
// 敲错（没有气球挂这个字母）→ 最上面的气球被吓到、加速上升一下下 + 清连击。
// 气球飘到天花板没打破 → 飘走消散，孩子角色叹气（不重罚，只清连击）。
// 金色气球 15% 双倍分；黑色炸弹球 10% 绝对不能敲（-15 分 + 黑烟），
// 忍住等它飘走还有小奖励！连击 ≥8 触发派对时刻 5 秒：全金 + 变慢 + 双倍分！

type BalloonKind = 'normal' | 'gold' | 'bomb';
type KidMood = 'idle' | 'happy' | 'sad' | 'shock';

interface Balloon {
  id: number;
  letter: string;
  x: number;          // 板内百分比
  y: number;          // 板内 px（向上减小）
  speed: number;      // px/秒（向上）
  kind: BalloonKind;
  color: string;
  swayDur: number;
  swayDelay: number;
  scaredUntil: number; // 被吓到加速的时间戳(ms)
  state: 'rising' | 'escaped';
  escapedAt: number;
}

interface Burst {
  id: number;
  x: number;   // 板内 px
  y: number;   // 板内 px
  color: string;
  smoke?: boolean;
}

const GAME_TIME = 60;     // 一局 60 秒
const CEIL_Y = 44;        // 天花板：气球中心到此就"飘走"
const SPAWN_Y = 486;      // 板底下方出生
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const BALLOON_COLORS = ['#FF8A5C', '#4FB8E7', '#6BCB77', '#A57DE0', '#FF8FAB', '#5FD0C8'];
const CONFETTI_COLORS = ['#FF8A5C', '#FFC94D', '#6BCB77', '#A57DE0', '#4FB8E7', '#FF8FAB'];
const FLAG_COLORS = ['#FF8A5C', '#FFC94D', '#6BCB77', '#A57DE0', '#4FB8E7', '#FF8FAB'];

const uid = () => Date.now() + Math.random();

// ============ 爆开特效：彩纸四溅 + 气球皮碎片 / 炸弹黑烟 ============
const ConfettiBurst: React.FC<Burst> = ({ x, y, color, smoke }) => {
  const parts = useMemo(
    () => Array.from({ length: 10 }, () => ({
      dx: (Math.random() - 0.5) * 150,
      dy: (Math.random() - 0.5) * 130 - 20,
      size: 5 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      delay: Math.random() * 0.06,
    })),
    []
  );
  if (smoke) {
    return (
      <div className="absolute z-40 pointer-events-none" style={{ left: x, top: y, transform: 'translate(-50%,-50%)' }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="absolute text-3xl select-none"
            style={{ left: (i - 1) * 18, top: -i * 9, animation: `smokeRise .85s ease-out ${i * 0.09}s forwards` }}
          >
            💨
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="absolute z-40 pointer-events-none" style={{ left: x, top: y }}>
      <span className="absolute rounded-full border-[4px] animate-pop-burst" style={{ borderColor: color, width: 58, height: 58, left: -29, top: -29 }} />
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            left: -p.size / 2,
            top: -p.size / 2,
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            animation: `confettiPop .78s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
      {[0, 1].map(i => (
        <span
          key={`scrap-${i}`}
          className="absolute rounded-[40%] border-2"
          style={{ width: 13, height: 9, borderColor: color, background: `${color}55`, left: -6 + i * 15, top: 0, animation: `scrapFall .9s ease-in ${i * 0.1}s forwards` }}
        />
      ))}
      {/* 小丝带条：旋转飘落的彩带庆祝 */}
      {[0, 1, 2].map(i => {
        const ang = ((i * 120 + 40) * Math.PI) / 180;
        const dist = 44 + i * 15;
        return (
          <span
            key={`ribbon-${i}`}
            className="absolute rounded-full"
            style={{
              width: 15, height: 4, background: color, left: -7, top: -2,
              ['--dx' as string]: `${Math.cos(ang) * dist}px`,
              ['--dy' as string]: `${Math.sin(ang) * dist}px`,
              animation: `ribbonFall .95s ease-out ${i * 0.05}s forwards`,
            }}
          />
        );
      })}
    </div>
  );
};

// ============ 小寿星（CSS 手绘，表情随战况变化：开心/叹气/吓到；右手举玩具枪） ============
const Kid: React.FC<{ mood: KidMood; muzzleRef?: React.RefObject<HTMLDivElement | null> }> = ({ mood, muzzleRef }) => (
  <div className="relative flex flex-col items-center select-none">
    {/* 叹气泡泡 */}
    {mood === 'sad' && (
      <div className="absolute -top-[30px] left-1/2 -translate-x-1/2 bg-white/95 border-2 border-[#FFE8C8] rounded-full px-2 py-[1px] text-[10px] font-black text-[#8A6F5C] whitespace-nowrap animate-float-y z-10">
        唉…
      </div>
    )}
    {/* 派对帽 */}
    <div className="absolute -top-[20px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[9px] border-r-[9px] border-b-[21px] border-l-transparent border-r-transparent border-b-[#A57DE0]">
      <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#FFC94D]" />
    </div>
    {/* 头 */}
    <div className="relative w-[36px] h-[36px] rounded-full bg-[#FFE0BD] border-[2.5px] border-[#F3C89E]">
      {/* 眼睛 */}
      {mood === 'happy' ? (
        <>
          <div className="absolute top-[13px] left-[8px] w-[9px] h-[6px] border-t-[2.5px] border-[#4A3628] rounded-t-full" />
          <div className="absolute top-[13px] right-[8px] w-[9px] h-[6px] border-t-[2.5px] border-[#4A3628] rounded-t-full" />
        </>
      ) : mood === 'shock' ? (
        <>
          <div className="absolute top-[12px] left-[8px] w-[8px] h-[8px] rounded-full bg-[#4A3628] ring-2 ring-white" />
          <div className="absolute top-[12px] right-[8px] w-[8px] h-[8px] rounded-full bg-[#4A3628] ring-2 ring-white" />
        </>
      ) : (
        <>
          <div className="absolute top-[13px] left-[9px] w-[7px] h-[7px] rounded-full bg-[#4A3628]" />
          <div className="absolute top-[13px] right-[9px] w-[7px] h-[7px] rounded-full bg-[#4A3628]" />
          {mood === 'sad' && (
            <>
              <div className="absolute top-[9px] left-[7px] w-[9px] h-[2px] bg-[#4A3628] rounded-full rotate-[16deg]" />
              <div className="absolute top-[9px] right-[7px] w-[9px] h-[2px] bg-[#4A3628] rounded-full -rotate-[16deg]" />
            </>
          )}
        </>
      )}
      {/* 嘴 */}
      {mood === 'happy' ? (
        <div className="absolute top-[20px] left-1/2 -translate-x-1/2 w-[13px] h-[8px] border-b-[3px] border-[#4A3628] rounded-b-full" />
      ) : mood === 'shock' ? (
        <div className="absolute top-[21px] left-1/2 -translate-x-1/2 w-[8px] h-[8px] rounded-full border-[2.5px] border-[#4A3628]" />
      ) : mood === 'sad' ? (
        <div className="absolute top-[24px] left-1/2 -translate-x-1/2 w-[12px] h-[6px] border-t-[2.5px] border-[#4A3628] rounded-t-full" />
      ) : (
        <div className="absolute top-[22px] left-1/2 -translate-x-1/2 w-[10px] h-[5px] border-b-[2.5px] border-[#4A3628] rounded-b-full" />
      )}
      {/* 腮红 */}
      <div className="absolute top-[19px] left-[4px] w-[7px] h-[4px] rounded-full bg-[#FF8FAB]/70" />
      <div className="absolute top-[19px] right-[4px] w-[7px] h-[4px] rounded-full bg-[#FF8FAB]/70" />
    </div>
    {/* 身体（小礼服） */}
    <div className="relative w-[38px] h-[27px] rounded-t-[45%] rounded-b-lg bg-[#4FB8E7] border-2 border-white/80 -mt-[3px] overflow-visible">
      <div className="absolute bottom-0 inset-x-0 h-[8px] bg-[#FFC94D]" />
      <div className="absolute top-[6px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-[#FFC94D]/80" />
      {/* 右手举着的玩具枪（斜向上 45° 瞄准气球） */}
      <div className="absolute -right-[15px] top-[2px] w-[30px] h-[15px] origin-bottom-left" style={{ transform: 'rotate(-42deg)' }}>
        {/* 枪管 */}
        <div className="absolute inset-x-0 top-0 h-[9px] rounded-[4px] bg-gradient-to-b from-[#FF8A5C] to-[#E0633A] border-2 border-[#C4451F]" />
        {/* 枪身握把 */}
        <div className="absolute left-[2px] top-[7px] w-[10px] h-[10px] rounded-[3px] bg-[#E0633A] border-2 border-[#C4451F]" />
        {/* 枪口准星（弹道起点：实测此元素坐标） */}
        <div ref={muzzleRef} className="absolute -right-[3px] top-[-4px] w-[7px] h-[4px] rounded-r-full bg-[#4FB8E7] border border-[#2E93C4]" />
        {/* 开火闪光 */}
        {mood === 'happy' && (
          <span className="absolute -right-[12px] -top-[6px] text-[11px] leading-none select-none" style={{ animation: 'fuseSpark 0.2s ease-out' }}>✨</span>
        )}
      </div>
    </div>
  </div>
);

export const BalloonPartyGame: React.FC<BaseGameProps> = ({ onEarnCoins, onBack, difficulty }) => {
  const { speedMul, timeMul } = useDifficulty(difficulty); // 难度：气球上升速度与生成节奏
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [traces, setTraces] = useState<Array<{ id: number; x1: number; y1: number; x2: number; y2: number }>>([]);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [pops, setPops] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [partyActive, setPartyActive] = useState(false);
  const [kidMood, setKidMood] = useState<KidMood>('idle');
  const [shake, setShake] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const { addScore, Layer: ScoreLayer } = useFloatScores();

  const boardRef = useRef<HTMLDivElement>(null);
  const muzzleRef = useRef<HTMLDivElement | null>(null);   // 枪口元素：弹道起点实测用
  const balloonsRef = useRef<Balloon[]>([]);
  const comboRef = useRef(0);
  const popsRef = useRef(0);
  const partyRef = useRef(false);
  const gameOverRef = useRef(false);
  const spawnAcc = useRef(0);
  const partySoundAcc = useRef(0);
  const moodIdRef = useRef(0);

  const syncBalloons = (next: Balloon[]) => {
    balloonsRef.current = next;
    setBalloons(next);
  };

  const px = (xPct: number) => ((boardRef.current?.getBoundingClientRect().width ?? 800) * xPct) / 100;

  // 孩子表情：短暂显示后自动回 idle（moodId 守卫防止旧定时器覆盖新表情）
  const setMood = useCallback((m: KidMood, ms: number) => {
    setKidMood(m);
    const mid = ++moodIdRef.current;
    setTimeout(() => {
      if (mid === moodIdRef.current) setKidMood('idle');
    }, ms);
  }, []);

  const addBurst = useCallback((b: Omit<Burst, 'id'>) => {
    const id = uid();
    setBursts(prev => [...prev, { ...b, id }]);
    setTimeout(() => setBursts(prev => prev.filter(x => x.id !== id)), 950);
  }, []);

  const endGame = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    setGameOver(true);
    playSoundEffect('victory', 0.3);
  }, []);

  // 生成气球：金色 15% 双倍分 / 黑色炸弹 10% / 普通 75%
  const spawnBalloon = useCallback(() => {
    const r = Math.random();
    const kind: BalloonKind = r < 0.1 ? 'bomb' : r < 0.25 ? 'gold' : 'normal';
    const b: Balloon = {
      id: uid(),
      letter: ALPHABET[Math.floor(Math.random() * 26)],
      x: 10 + Math.random() * 80,
      y: SPAWN_Y,
      speed: (88 + Math.random() * 18) * speedMul, // 难度越低飘得越慢（4~5 秒飘到顶）
      kind,
      color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
      swayDur: 2.3 + Math.random() * 1.7,
      swayDelay: -Math.random() * 2,
      scaredUntil: 0,
      state: 'rising',
      escapedAt: 0,
    };
    syncBalloons([...balloonsRef.current, b]);
  }, []);

  // 派对时刻：连击 ≥8 触发，5 秒全金 + 变慢 + 双倍分
  const triggerParty = useCallback(() => {
    partyRef.current = true;
    setPartyActive(true);
    playSoundEffect('combo', 0.3);
    playSoundEffect('sparkle', 0.2);
    setTimeout(() => {
      partyRef.current = false;
      setPartyActive(false);
    }, 5000);
  }, []);

  const removeBalloon = (id: number) => {
    syncBalloons(balloonsRef.current.filter(b => b.id !== id));
  };

  // 敲对！气球炸开（枪口弹道 + 爆开丝带）
  const popBalloon = useCallback((b: Balloon) => {
    // 弹道痕迹：实测枪口坐标射向气球（不再写死起点，杜绝从蛋糕开枪）
    const boardRect = boardRef.current?.getBoundingClientRect();
    const muzRect = muzzleRef.current?.getBoundingClientRect();
    const sx = boardRect && muzRect ? muzRect.right - boardRect.left - 2 : (boardRect?.width ?? 800) / 2 - 56;
    const sy = boardRect && muzRect ? muzRect.top + muzRect.height / 2 - boardRect.top : 352;
    const tid = uid();
    setTraces(prev => [...prev, { id: tid, x1: sx, y1: sy, x2: px(b.x), y2: b.y }]);
    setTimeout(() => setTraces(prev => prev.filter(t => t.id !== tid)), 260);
    removeBalloon(b.id);
    playSoundEffect('pop', 0.3);
    const gold = b.kind === 'gold';
    if (gold) playSoundEffect('coin', 0.14);
    addBurst({ x: px(b.x), y: b.y, color: gold ? '#FFC94D' : b.color });
    const mult = (gold ? 2 : 1) * (partyRef.current ? 2 : 1);
    const gained = (10 + comboRef.current * 2) * mult;
    setScore(s => s + gained);
    const nc = comboRef.current + 1;
    comboRef.current = nc;
    setCombo(nc);
    setMaxCombo(m => Math.max(m, nc));
    popsRef.current += 1;
    setPops(popsRef.current);
    if (popsRef.current % 4 === 0) {
      setCoinsEarned(c => c + 1);
      onEarnCoins?.(1);
    }
    if (nc === 8 && !partyRef.current) triggerParty();
    setMood('happy', 650);
    addScore(px(b.x), b.y - 14, `+${gained}${gold ? ' 🌟' : ''}`, gold ? '#B8860B' : '#E0678A');
  }, [addBurst, addScore, onEarnCoins, setMood, triggerParty]);

  // 手滑敲到炸弹球！-15 分 + 震屏 + 黑烟
  const bombHit = useCallback((b: Balloon) => {
    removeBalloon(b.id);
    playSoundEffect('error', 0.32);
    addBurst({ x: px(b.x), y: b.y, color: '#3A3A48', smoke: true });
    setScore(s => Math.max(0, s - 15));
    comboRef.current = 0;
    setCombo(0);
    setShake(true);
    setTimeout(() => setShake(false), 420);
    setMood('shock', 750);
    addScore(px(b.x), b.y - 12, '💣 -15', '#E0633A');
  }, [addBurst, addScore, setMood]);

  // 敲错（没有气球挂这个字母）：最上面的气球被吓到、加速上升一下下
  const missPress = useCallback(() => {
    playSoundEffect('bubble', 0.12);
    comboRef.current = 0;
    setCombo(0);
    const risings = balloonsRef.current.filter(b => b.state === 'rising' && b.kind !== 'bomb');
    if (risings.length > 0) {
      const top = risings.reduce((a, c) => (a.y < c.y ? a : c));
      const now = performance.now();
      syncBalloons(balloonsRef.current.map(b => (b.id === top.id ? { ...b, scaredUntil: now + 620 } : b)));
    }
  }, []);

  // 气球飘到天花板：飘走消散（炸弹安全飘走还有小奖励）
  const onEscape = useCallback((b: Balloon) => {
    playSoundEffect('whoosh', 0.09);
    setMood('sad', 900);
    if (b.kind === 'bomb') {
      setScore(s => s + 5);
      playSoundEffect('bell', 0.14);
      addScore(px(b.x), CEIL_Y + 26, '忍住了 +5 🛡️', '#48A757');
    } else {
      comboRef.current = 0;
      setCombo(0); // 不重罚，只是连击清零
    }
  }, [addScore, setMood]);

  // 主循环：useRafLoop 每帧推进气球 y（上升）
  useRafLoop((dt) => {
    const now = performance.now();
    const slow = partyRef.current ? 0.55 : 1; // 派对时刻上升变慢
    let escaper: Balloon | null = null;
    const next: Balloon[] = [];
    for (const b of balloonsRef.current) {
      if (b.state === 'escaped') {
        if (now - b.escapedAt < 520) next.push(b); // 0.5s 飘走动画结束后移除
        continue;
      }
      const scared = now < b.scaredUntil ? 3.1 : 1; // 被吓到瞬间加速
      const ny = b.y - (b.speed * dt) / 1000 * slow * scared;
      if (ny <= CEIL_Y) {
        const eb: Balloon = { ...b, y: CEIL_Y, state: 'escaped', escapedAt: now };
        next.push(eb);
        escaper = eb;
      } else {
        next.push({ ...b, y: ny });
      }
    }
    syncBalloons(next);
    if (escaper) onEscape(escaper);

    spawnAcc.current += dt;
    const interval = (partyRef.current ? 1050 : 1550) * timeMul;
    if (spawnAcc.current >= interval && next.filter(b => b.state === 'rising').length < 6) {
      spawnAcc.current = 0;
      spawnBalloon();
    }

    if (partyRef.current) {
      partySoundAcc.current += dt;
      if (partySoundAcc.current >= 640) {
        partySoundAcc.current = 0;
        playSoundEffect('sparkle', 0.09);
      }
    }
  }, !gameOver);

  // 60 秒倒计时
  useEffect(() => {
    if (gameOver) return;
    if (timeLeft <= 0) {
      endGame();
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, gameOver, endGame]);

  // 开局先升一个，稍后再补
  useEffect(() => {
    spawnBalloon();
    spawnAcc.current = 900;
  }, [spawnBalloon]);

  // 键盘：字母匹配
  useKeyDown((e) => {
    if (gameOverRef.current) return;
    if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;
    const k = e.key.toLowerCase();
    const cands = balloonsRef.current.filter(b => b.state === 'rising' && b.letter === k);
    const friendly = cands.filter(b => b.kind !== 'bomb');
    if (friendly.length > 0) {
      // 敲对：炸最上面那个（最接近飘走的）
      const b = friendly.reduce((a, c) => (a.y < c.y ? a : c));
      popBalloon(b);
    } else if (cands.length > 0) {
      // 只有炸弹挂这个字母 → 忍不住敲了炸弹！
      bombHit(cands[0]);
    } else {
      missPress();
    }
  }, []);

  const restart = useCallback(() => {
    playSoundEffect('click', 0.2);
    moodIdRef.current++;
    syncBalloons([]);
    setBursts([]);
    setTimeLeft(GAME_TIME);
    setScore(0);
    setCombo(0);
    comboRef.current = 0;
    setMaxCombo(0);
    popsRef.current = 0;
    setPops(0);
    setCoinsEarned(0);
    partyRef.current = false;
    setPartyActive(false);
    setKidMood('idle');
    setShake(false);
    gameOverRef.current = false;
    setGameOver(false);
    spawnAcc.current = 0;
    spawnBalloon();
  }, [spawnBalloon]);

  const bombOnScreen = balloons.some(b => b.state === 'rising' && b.kind === 'bomb');

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-5xl animate-fade-in mx-auto px-2">
      <style>{`
        @keyframes confettiPop { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(var(--dx),var(--dy)) rotate(540deg);opacity:0} }
        @keyframes scrapFall { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(120px) rotate(220deg);opacity:0} }
        @keyframes ribbonFall { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 35%{transform:translate(calc(var(--dx) * 0.7),calc(var(--dy) * 0.5)) rotate(240deg);opacity:1} 100%{transform:translate(var(--dx),calc(var(--dy) + 74px)) rotate(560deg);opacity:0} }
        @keyframes traceFade { 0%{opacity:0.95; filter:brightness(1.4)} 70%{opacity:0.55} 100%{opacity:0} }
        @keyframes smokeRise { 0%{transform:translateY(0) scale(.6);opacity:1} 100%{transform:translateY(-66px) scale(1.5);opacity:0} }
        @keyframes scareJump { 0%,100%{transform:translate(-50%,-50%)} 20%{transform:translate(calc(-50% - 7px),-50%)} 45%{transform:translate(calc(-50% + 7px),-50%)} 70%{transform:translate(calc(-50% - 4px),-50%)} }
        @keyframes escapeFloat { 0%{transform:translate(-50%,-50%);opacity:1} 100%{transform:translate(-50%,-50%) translateY(-54px) scale(1.12);opacity:0} }
        @keyframes partyFlash { 0%,100%{transform:scale(1);filter:brightness(1)} 50%{transform:scale(1.1);filter:brightness(1.3)} }
        @keyframes partyBanner { 0%,100%{transform:scale(1) rotate(-2deg)} 50%{transform:scale(1.08) rotate(2deg)} }
        .scare-jump { animation: scareJump .45s ease; }
        .escape-float { animation: escapeFloat .5s ease-out forwards; }
        .party-flash { animation: partyFlash .8s ease-in-out infinite; }
      `}</style>

      <GameHeader emoji="🎈" title="气球派对" tag="往上飘 · 快敲别让它跑了" tagColor="bg-[#FFE9F0] text-[#E0678A] border-[#FFD3E0]">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border-[3px] bg-white text-[#5B4636] border-[#FFE8C8] font-black text-sm shadow-[0_3px_0_rgba(0,0,0,0.08)]">
          <span className="text-lg">⏳</span>
          <div className="w-24 h-3.5 rounded-full overflow-hidden bg-[#FFE3C8] border-2 border-[#FFE8C8]">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(timeLeft / GAME_TIME) * 100}%`, background: 'linear-gradient(90deg,#6BCB77,#FFC94D,#FF8A5C)' }}
            />
          </div>
          <span className={`text-base ${timeLeft <= 10 ? 'text-[#E0633A] animate-pulse' : ''}`}>{timeLeft}s</span>
        </div>
        <ScorePill icon="⭐" label="得分" value={score} />
        <ScorePill icon="🎈" label="打爆" value={pops} color="bg-[#FFF3D6] text-[#B8860B] border-[#FFE3A3]" />
        <ComboFlame combo={combo} />
      </GameHeader>

      <GameBoard
        className="h-[430px]"
        shake={shake}
        style={{
          background: partyActive
            ? 'linear-gradient(180deg,#FFF3B0 0%,#FFE3D0 52%,#FFD3E0 100%)'
            : 'linear-gradient(180deg,#FFF3D6 0%,#FFE8CF 55%,#FFE0D2 100%)',
        }}
      >
        <div ref={boardRef} className="absolute inset-0">

          {/* 暖黄墙圆点花纹 */}
          <div
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{ backgroundImage: 'radial-gradient(#F7C98E 2.4px, transparent 2.6px)', backgroundSize: '44px 44px' }}
          />

          {/* 天花板线 */}
          <div className="absolute top-0 inset-x-0 h-[10px] z-20" style={{ background: 'linear-gradient(180deg,#E8B87E,#D9A468)', boxShadow: '0 3px 0 rgba(150,100,50,0.18)' }} />

          {/* 三角彩旗横幅（派对时刻闪烁） */}
          <div className={`absolute top-[10px] inset-x-0 z-20 pointer-events-none flex justify-center gap-[3px] ${partyActive ? 'party-flash' : ''}`}>
            {Array.from({ length: 20 }, (_, i) => (
              <span
                key={i}
                className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[13px] border-l-transparent border-r-transparent"
                style={{ borderTopColor: FLAG_COLORS[i % FLAG_COLORS.length], transform: `translateY(${Math.sin((i / 19) * Math.PI) * 6}px)` }}
              />
            ))}
          </div>

          {/* 炸弹球警示 */}
          <div
            className={`absolute top-[30px] left-1/2 -translate-x-1/2 z-30 px-3 py-0.5 rounded-full border-2 font-black text-[11px] select-none pointer-events-none whitespace-nowrap ${
              bombOnScreen
                ? 'bg-[#FFE0E0] text-[#E0633A] border-[#FFB1B1] animate-wiggle'
                : 'bg-white/80 text-[#8A6F5C] border-[#FFE8C8]'
            }`}
          >
            ⚠️ 黑色炸弹球别敲！等它飘走～
          </div>

          {/* 派对时刻覆盖层 */}
          {partyActive && (
            <>
              <div
                className="absolute inset-0 z-[15] pointer-events-none animate-fade-in"
                style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(255,230,140,0.5) 0%, rgba(255,200,220,0.18) 60%, transparent 80%)' }}
              />
              <div
                className="absolute top-[64px] left-1/2 -translate-x-1/2 z-[35] bg-[#A57DE0] text-white px-4 py-1.5 rounded-full border-[3px] border-white font-black text-sm select-none pointer-events-none whitespace-nowrap"
                style={{ animation: 'partyBanner .8s ease-in-out infinite' }}
              >
                🎉 派对时刻！全金气球 · 双倍分！
              </div>
            </>
          )}

          {/* 气球（sway 摇摆 + 缓慢上升） */}
          {balloons.map(b => {
            const now = performance.now();
            const scared = now < b.scaredUntil;
            const isGold = b.kind === 'gold' || partyActive;
            return (
              <div
                key={b.id}
                className={`absolute z-20 select-none ${scared ? 'scare-jump' : ''} ${b.state === 'escaped' ? 'escape-float' : ''}`}
                style={{ left: `${b.x}%`, top: b.y, transform: 'translate(-50%,-50%)' }}
              >
                <div
                  className="flex flex-col items-center"
                  style={{ animation: scared ? undefined : `sway ${b.swayDur}s ease-in-out ${b.swayDelay}s infinite` }}
                >
                  {/* 炸弹引信（火花闪烁） */}
                  {b.kind === 'bomb' && (
                    <div className="relative -mb-[2px]">
                      <div className="w-[3px] h-[10px] bg-[#5B4636] rounded-full mx-auto" />
                      <span className="absolute -top-[10px] left-1/2 -translate-x-1/2 text-[10px] animate-twinkle">✨</span>
                    </div>
                  )}
                  {/* 球体（大字母在正面中央） */}
                  <div
                    className={`relative w-[62px] h-[72px] md:w-[68px] md:h-[78px] rounded-[50%] flex items-center justify-center border-[3px] ${
                      b.kind === 'bomb'
                        ? 'border-[#55556A] bg-[radial-gradient(circle_at_32%_28%,#6B6B7A,#3A3A48_55%,#1E1E2A)]'
                        : isGold
                        ? 'border-[#FFE9A3] bg-[radial-gradient(circle_at_32%_28%,#FFF6C9,#FFC94D_60%,#F5A623)] shadow-[0_0_14px_rgba(255,201,77,0.7)]'
                        : 'border-white/95'
                    }`}
                    style={b.kind === 'bomb' || isGold ? undefined : { background: `radial-gradient(circle at 32% 28%, #ffffffb3, ${b.color} 62%)` }}
                  >
                    {/* 气球字母：白字+深棕描边——任何糖果色底都清晰可读（浅绿/浅青上纯白字对比度不足的修复） */}
                    <span
                      className={`font-mono font-black text-3xl md:text-4xl ${
                        b.kind === 'bomb' ? 'text-[#FF8787] drop-shadow' : isGold ? 'text-[#7A4A00] drop-shadow' : 'text-white'
                      }`}
                      style={b.kind === 'bomb' || isGold ? undefined : { textShadow: '0 0 5px rgba(61,40,26,0.9), 0 2px 3px rgba(61,40,26,0.65)' }}
                    >
                      {b.letter.toUpperCase()}
                    </span>
                    {b.kind === 'bomb' && <span className="absolute -bottom-1 -right-1 text-xs">💣</span>}
                    {b.kind === 'gold' && !partyActive && <span className="absolute -top-2 -right-1 text-[11px] animate-twinkle">🌟</span>}
                    {/* 高光 */}
                    <span className="absolute top-[7px] left-[10px] w-[10px] h-[15px] bg-white/60 rounded-full blur-[1px] pointer-events-none" />
                  </div>
                  {/* 气球结 */}
                  <div
                    className={`w-[7px] h-[7px] rotate-45 -mt-[2px] ${b.kind === 'bomb' ? 'bg-[#3A3A48]' : isGold ? 'bg-[#F5A623]' : ''}`}
                    style={b.kind === 'bomb' || isGold ? undefined : { background: b.color }}
                  />
                  {/* 弯曲系绳 */}
                  <div className="w-[15px] h-[26px] border-l-2 border-b-2 rounded-bl-[0.8rem]" style={{ borderColor: 'rgba(91,70,54,0.4)' }} />
                </div>
              </div>
            );
          })}

          {/* 枪口弹道痕迹（金白色光线射向气球） */}
          {traces.map(t => {
            const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
            const ang = (Math.atan2(t.y2 - t.y1, t.x2 - t.x1) * 180) / Math.PI;
            return (
              <div key={t.id}
                className="absolute z-40 pointer-events-none origin-left rounded-full"
                style={{
                  left: t.x1, top: t.y1, width: len, height: 3.5,
                  transform: `rotate(${ang}deg)`,
                  background: 'linear-gradient(90deg, rgba(255,201,77,0) 0%, rgba(255,201,77,0.95) 26%, #FFFFFF 100%)',
                  boxShadow: '0 0 6px rgba(255,201,77,0.8)',
                  animation: 'traceFade 0.24s ease-out forwards',
                }}
              />
            );
          })}

          {/* 爆开特效 */}
          {bursts.map(b => (
            <ConfettiBurst key={b.id} {...b} />
          ))}

          {/* 桌面地板 */}
          <div className="absolute bottom-0 inset-x-0 h-[64px] z-10 pointer-events-none" style={{ background: 'linear-gradient(180deg,#F2C087 0%,#E4A96C 100%)' }}>
            <div className="absolute -top-[3px] left-0 w-full h-[6px] bg-[#C98F55]/70 rounded-full" />
          </div>

          {/* 小寿星 + 蛋糕 + 礼物 */}
          <div className="absolute bottom-[10px] inset-x-0 z-20 flex items-end justify-center gap-10 select-none pointer-events-none">
            <Kid mood={kidMood} muzzleRef={muzzleRef} />
            <span className="text-[52px] leading-none animate-float-y">🎂</span>
            <div className="flex items-end gap-1">
              <span className="text-2xl">🎁</span>
              <span className="text-xl">🎈</span>
            </div>
          </div>

          <ScoreLayer />

          {gameOver && (
            <ResultModal
              title="派对时间到！"
              emoji="🎈🎂"
              score={score}
              coins={coinsEarned}
              combo={maxCombo}
              stars={calcStars(score, 700)}
              replay={restart}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>

      <div className="w-full story-card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#8A6F5C] font-bold flex items-center gap-1.5">
          <span>💡</span> 敲气球上的字母就能"砰!"炸开！🌟 金气球双倍分；黑色炸弹球💣 要忍住不按，等它自己飘走才是赢家！
        </div>
        <div className="flex items-center gap-3">
          <button onClick={restart} className="btn-candy btn-berry px-5 py-2.5 text-xs">🔄 再开一场派对</button>
          <BackButton onBack={onBack} label="返回选择" />
        </div>
      </div>
    </div>
  );
};

export default BalloonPartyGame;
