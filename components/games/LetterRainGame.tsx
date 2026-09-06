import React, { useState, useEffect, useRef, useCallback } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useRafLoop, useFloatScores,
  ResultModal, GameHeader, GameBoard, BackButton, ScorePill, ComboFlame,
  TypedWord, BigLetter, calcStars, useDifficulty, speakGameWord,
} from './shared';

// ============ 🌧️ 字母雨·小猫打伞（入门游戏，难度最低） ============
// 乌云掉下一朵"字母雨滴"（= 当前单词的下一个字母），敲对雨滴上的字母，
// 小猫就立刻撑开彩虹伞跑到雨滴正下方，雨滴"嗒"地被伞面弹开、小猫开心喵喵！
// 没敲对就落地 → 小猫被淋湿 1.5 秒（可怜喵…）。
// 敲完一整个单词 → 彩虹横贯 + 翻倍奖励。60 秒或接满 12 个字母结束。

type Phase = 'falling' | 'caught' | 'missed';

interface Drop {
  id: number;
  letter: string;
  x: number;      // 板内百分比
  y: number;      // 板内 px
  speed: number;  // px/秒
}

interface SplashFX { id: number; x: number; y: number; big: boolean; }
interface BounceFX { id: number; x: number; y: number; dir: 1 | -1; letter: string; }

const GAME_TIME = 60;      // 一局 60 秒
const LETTERS_GOAL = 12;   // 接满 12 个字母提前通关
const SPAWN_Y = 20;        // 雨滴出生高度
const UMBRELLA_Y = 205;    // 伞面接住高度（雨滴中心）
const GROUND_Y = 368;      // 草地落地高度
const UMB_COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const uid = () => Date.now() + Math.random();

// 背景雨丝（细线循环下落）
const RAIN_STREAKS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 53 + 7) % 100,
  dur: 0.9 + (i % 5) * 0.18,
  delay: -((i * 0.31) % 1.4),
  h: 12 + (i % 4) * 5,
}));

// ============ 小猫（CSS 手绘：开心😺 / 淋湿耷拉😿） ============
const Cat: React.FC<{ happy: boolean; wet: boolean }> = ({ happy, wet }) => (
  <div className="relative flex flex-col items-center select-none" style={wet ? { filter: 'saturate(.72) brightness(.97)' } : undefined}>
    {/* 头部（淋湿时低垂） */}
    <div className="relative z-10 transition-transform duration-300"
      style={{ transform: wet ? 'rotate(7deg) translateY(3px)' : 'rotate(0deg)' }}>
      {/* 耳朵（淋湿时耷拉） */}
      <div className="absolute -top-[12px] left-[6px] w-0 h-0 border-l-[9px] border-r-[9px] border-b-[17px] border-l-transparent border-r-transparent border-b-[#F6B26B] transition-transform duration-300"
        style={{ transform: `rotate(${wet ? -32 : -10}deg)` }}>
        <div className="absolute left-[-4px] top-[7px] w-0 h-0 border-l-[4px] border-r-[4px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#FFC1D0]" />
      </div>
      <div className="absolute -top-[12px] right-[6px] w-0 h-0 border-l-[9px] border-r-[9px] border-b-[17px] border-l-transparent border-r-transparent border-b-[#F6B26B] transition-transform duration-300"
        style={{ transform: `rotate(${wet ? 32 : 10}deg)` }}>
        <div className="absolute left-[-4px] top-[7px] w-0 h-0 border-l-[4px] border-r-[4px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#FFC1D0]" />
      </div>
      {/* 脸 */}
      <div className="relative w-[60px] h-[54px] rounded-[46%] bg-[#F6B26B] border-[3px] border-[#E89A4F]/60">
        {/* 眼睛 */}
        {happy ? (
          <>
            <div className="absolute top-[20px] left-[12px] w-[13px] h-[8px] border-t-[3px] border-[#4A3628] rounded-t-full" />
            <div className="absolute top-[20px] right-[12px] w-[13px] h-[8px] border-t-[3px] border-[#4A3628] rounded-t-full" />
          </>
        ) : (
          <>
            <div className="absolute top-[18px] left-[13px] w-[9px] rounded-full bg-[#4A3628] transition-all duration-200" style={{ height: wet ? 5 : 9 }} />
            <div className="absolute top-[18px] right-[13px] w-[9px] rounded-full bg-[#4A3628] transition-all duration-200" style={{ height: wet ? 5 : 9 }} />
            {wet && (
              <>
                <div className="absolute top-[13px] left-[11px] w-[11px] h-[2.5px] bg-[#4A3628] rounded-full rotate-[18deg]" />
                <div className="absolute top-[13px] right-[11px] w-[11px] h-[2.5px] bg-[#4A3628] rounded-full -rotate-[18deg]" />
              </>
            )}
          </>
        )}
        {/* 鼻子 + 嘴 */}
        <div className="absolute top-[26px] left-1/2 -translate-x-1/2 w-[7px] h-[6px] rounded-full bg-[#FF8FAB]" />
        <div
          className={`absolute left-1/2 -translate-x-1/2 border-[#4A3628] transition-all duration-200 ${
            wet
              ? 'top-[37px] w-[15px] h-[7px] border-t-[3px] rounded-t-full'
              : 'top-[33px] w-[17px] h-[8px] border-b-[3px] rounded-b-full'
          }`}
        />
        {/* 腮红（开心时） */}
        {happy && (
          <>
            <div className="absolute top-[28px] left-[6px] w-[10px] h-[6px] rounded-full bg-[#FF8FAB]/80" />
            <div className="absolute top-[28px] right-[6px] w-[10px] h-[6px] rounded-full bg-[#FF8FAB]/80" />
          </>
        )}
        {/* 胡须 */}
        <div className="absolute top-[27px] -left-[13px] w-[13px] h-[2px] bg-[#4A3628]/45 rounded-full rotate-[9deg]" />
        <div className="absolute top-[32px] -left-[13px] w-[13px] h-[2px] bg-[#4A3628]/45 rounded-full -rotate-[6deg]" />
        <div className="absolute top-[27px] -right-[13px] w-[13px] h-[2px] bg-[#4A3628]/45 rounded-full -rotate-[9deg]" />
        <div className="absolute top-[32px] -right-[13px] w-[13px] h-[2px] bg-[#4A3628]/45 rounded-full rotate-[6deg]" />
        {/* 淋湿：蓝色水膜 + 滴水 */}
        {wet && (
          <>
            <div className="absolute inset-0 rounded-[46%] bg-[#4FB8E7]/20 pointer-events-none" />
            <span className="absolute -top-2 left-2 text-[10px] animate-drip">💧</span>
            <span className="absolute top-3 right-1 text-[10px] animate-drip" style={{ animationDelay: '.4s' }}>💧</span>
          </>
        )}
      </div>
    </div>
    {/* 身体 */}
    <div className="relative -mt-[7px] w-[66px] h-[42px] rounded-[46%] bg-[#F6B26B] border-[3px] border-[#E89A4F]/60">
      <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-[32px] h-[26px] rounded-full bg-[#FBD9A8]" />
      {wet && (
        <>
          <div className="absolute inset-0 rounded-[46%] bg-[#4FB8E7]/20 pointer-events-none" />
          <span className="absolute top-1 right-2 text-[10px] animate-drip" style={{ animationDelay: '.8s' }}>💧</span>
        </>
      )}
    </div>
    {/* 前爪 */}
    <div className="flex gap-[14px] -mt-[6px] z-[1]">
      <div className="w-[16px] h-[11px] rounded-full bg-[#F6B26B] border-2 border-[#E89A4F]/50" />
      <div className="w-[16px] h-[11px] rounded-full bg-[#F6B26B] border-2 border-[#E89A4F]/50" />
    </div>
    {/* 尾巴（淋湿时垂下来） */}
    <div className="absolute right-[-15px] bottom-[26px] w-[22px] h-[22px] border-r-[6px] border-b-[6px] border-[#E89A4F] rounded-br-full transition-transform duration-300"
      style={{ transform: wet ? 'rotate(46deg)' : 'rotate(-8deg)', transformOrigin: 'top left' }} />
    {/* 开心：头顶冒两颗爱心 */}
    {happy && (
      <>
        <span className="absolute -top-[30px] left-[2px] text-lg animate-heart-pop z-20">💗</span>
        <span className="absolute -top-[34px] right-[2px] text-lg animate-heart-pop z-20" style={{ animationDelay: '.18s' }}>💗</span>
      </>
    )}
  </div>
);

// ============ 彩虹条雨伞（撑开时 scale 0→1 弹出） ============
const Umbrella: React.FC<{ open: boolean }> = ({ open }) => (
  <div
    className={`absolute left-1/2 bottom-[97px] origin-bottom ${
      open ? 'umbrella-open' : 'scale-0 transition-transform duration-200'
    }`}
    style={{ transform: open ? undefined : 'scale(0)', marginLeft: -62 }}
  >
    <div className="w-[124px] h-[42px] rounded-t-full border-[3px] border-white/95 overflow-hidden flex shadow-[0_4px_10px_rgba(30,50,80,0.32)]">
      {UMB_COLORS.map(c => (
        <div key={c} className="flex-1 h-full" style={{ background: c }} />
      ))}
    </div>
    <div className="w-[5px] h-[22px] bg-[#8A5F3C] mx-auto rounded-full" />
    <div className="w-[13px] h-[9px] border-b-[4px] border-r-[4px] border-[#8A5F3C] rounded-br-full mx-auto" />
  </div>
);

// ============ 拟真水滴字母牌（三圆角方块旋转45°的真水滴形 + 渐变高光 + 下落摆动 + 尾迹水丝） ============
const DropLetter: React.FC<{ ch: string; typed?: boolean; small?: boolean }> = ({ ch, typed, small }) => {
  const size = small ? 54 : 74;
  return (
    <div className="relative select-none" style={{ width: size, height: size * 1.2 }}>
      {/* 尾迹水丝：水滴上方一条渐隐细线，强化"正在下落" */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-[24px] w-[3px] h-[24px] rounded-full bg-gradient-to-b from-transparent to-[#CFEAFB]/85 pointer-events-none" />
      {/* 水滴主体：正方形只圆三个角再旋转45°，顶尖朝上 */}
      <div className="relative w-full h-full" style={{ transform: 'rotate(45deg)' }}>
        <div
          className="absolute inset-0"
          style={{
            borderRadius: '0 50% 50% 50%',
            background: typed
              ? 'radial-gradient(circle at 30% 26%, #DCF7E8 0%, #A8E6C3 36%, #6BCB77 76%, #4FAE5D 100%)'
              : 'radial-gradient(circle at 30% 26%, #E8F6FF 0%, #A8D8F5 36%, #5FA8DD 76%, #3E82B8 100%)',
            boxShadow: typed
              ? 'inset -7px -7px 12px rgba(20,90,40,0.30), inset 5px 7px 10px rgba(255,255,255,0.55), 0 5px 9px rgba(0,30,60,0.28)'
              : 'inset -7px -7px 12px rgba(10,60,110,0.32), inset 5px 7px 10px rgba(255,255,255,0.55), 0 5px 9px rgba(0,30,60,0.28)',
          }}
        >
          {/* 字母反向旋转回正 */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotate(-45deg)' }}>
            <span
              className="font-mono font-black text-white"
              style={{ fontSize: small ? 32 : 42, textShadow: '0 2px 4px rgba(0,40,80,0.45)' }}
            >
              {ch}
            </span>
          </div>
        </div>
      </div>
      {/* 表面高光：左上一道斜椭圆反光，玻璃感 */}
      <span
        className="absolute left-[16%] top-[10%] w-[30%] h-[16%] bg-white/75 rounded-full blur-[2px] pointer-events-none"
        style={{ transform: 'rotate(-32deg)' }}
      />
    </div>
  );
};

export const LetterRainGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack, difficulty }) => {
  const { speedMul } = useDifficulty(difficulty); // 难度：雨滴下落速度
  const pickWord = useWordPool(wordList);
  const [target, setTarget] = useState<GameItem>(() => pickWord());
  const [typedLen, setTypedLen] = useState(0);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [phase, setPhase] = useState<Phase>('falling');
  const [splashes, setSplashes] = useState<SplashFX[]>([]);
  const [bounce, setBounce] = useState<BounceFX | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [lettersDone, setLettersDone] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [catX, setCatX] = useState(50);
  const [umbrellaOpen, setUmbrellaOpen] = useState(false);
  const [happy, setHappy] = useState(false);
  const [wet, setWet] = useState(false);
  const [rainbow, setRainbow] = useState(false);
  const [shake, setShake] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [win, setWin] = useState(false);
  const { addScore, Layer: ScoreLayer } = useFloatScores();

  const boardRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<Drop | null>(null);
  const phaseRef = useRef<Phase>('falling');
  const comboRef = useRef(0);
  const typedLenRef = useRef(0);
  const targetRef = useRef(target);
  const lettersDoneRef = useRef(0);
  const gameOverRef = useRef(false);
  const runIdRef = useRef(0);

  targetRef.current = target;

  // runId 守卫：重新开始后，旧回合的延时回调全部作废
  const later = useCallback((fn: () => void, ms: number) => {
    const rid = runIdRef.current;
    setTimeout(() => {
      if (rid === runIdRef.current) fn();
    }, ms);
  }, []);

  const boardW = () => boardRef.current?.getBoundingClientRect().width ?? 800;

  const addSplash = useCallback((x: number, y: number, big = false) => {
    const id = uid();
    setSplashes(prev => [...prev, { id, x, y, big }]);
    setTimeout(() => setSplashes(prev => prev.filter(s => s.id !== id)), 760);
  }, []);

  const endGame = useCallback((didWin: boolean) => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    setGameOver(true);
    setWin(didWin);
    dropRef.current = null;
    setDrop(null);
    playSoundEffect('victory', 0.3);
  }, []);

  // 生成一朵字母雨滴（字母 = 当前单词的下一个待敲字母）
  const spawnDrop = useCallback(() => {
    const word = targetRef.current.typing.toLowerCase();
    const d: Drop = {
      id: uid(),
      letter: word[typedLenRef.current] || 'a',
      x: 12 + Math.random() * 76,
      y: SPAWN_Y,
      speed: (74 + Math.random() * 14) * speedMul, // 难度越低落得越慢（~4-4.7 秒落地）
    };
    dropRef.current = d;
    setDrop(d);
  }, []);

  const nextRound = useCallback(() => {
    if (gameOverRef.current) return;
    if (lettersDoneRef.current >= LETTERS_GOAL) {
      endGame(true);
      return;
    }
    phaseRef.current = 'falling';
    setPhase('falling');
    setCatX(50);
    setUmbrellaOpen(false);
    spawnDrop();
  }, [endGame, spawnDrop]);

  // 敲完一整个单词：彩虹横贯 + 翻倍奖励 + 语音朗读单词
  const completeWord = useCallback(() => {
    const bonus = targetRef.current.typing.length * 20; // 每字母10分 × 2
    setScore(s => s + bonus);
    setWordsDone(w => w + 1);
    onEarnCoins?.(2);
    playSoundEffect('combo', 0.3);
    playSoundEffect('sparkle', 0.18);
    speakGameWord(targetRef.current);
    setRainbow(true);
    later(() => setRainbow(false), 1600);
    addScore(boardW() / 2, 130, `+${bonus} 🌈`, '#9775FA');
    typedLenRef.current = 0;
    setTypedLen(0);
    setTarget(pickWord());
  }, [onEarnCoins, addScore, pickWord, later]);

  // 雨滴落到伞面上："嗒"一声弹开 + 小猫开心
  const hitCatch = useCallback((d: Drop, fy: number) => {
    dropRef.current = null;
    setDrop(null);
    playSoundEffect('splash', 0.14);
    addSplash(d.x, fy);
    const dir: 1 | -1 = d.x < 50 ? 1 : -1;
    const bid = uid();
    setBounce({ id: bid, x: d.x, y: fy, dir, letter: d.letter.toUpperCase() });
    setTimeout(() => setBounce(b => (b && b.id === bid ? null : b)), 700);
    // 小猫开心：喵喵 + 爱心 + 飘分
    playSoundEffect('cat_happy', 0.32);
    setHappy(true);
    const gained = 10 + comboRef.current * 2;
    setScore(s => s + gained);
    const ncombo = comboRef.current + 1;
    setCombo(ncombo);
    setMaxCombo(m => Math.max(m, ncombo));
    addScore((boardW() * d.x) / 100, fy - 28, `+${gained}`, '#E0633A');
    // 词进度
    const word = targetRef.current.typing.toLowerCase();
    const np = typedLenRef.current + 1;
    typedLenRef.current = np;
    setTypedLen(np);
    lettersDoneRef.current += 1;
    setLettersDone(lettersDoneRef.current);
    if (np >= word.length) completeWord();
    later(() => {
      setHappy(false);
      nextRound();
    }, 650);
  }, [addSplash, addScore, completeWord, later, nextRound]);

  // 雨滴落地没接住：小猫淋湿 1.5 秒
  const missGround = useCallback((d: Drop) => {
    phaseRef.current = 'missed';
    setPhase('missed');
    playSoundEffect('splash', 0.26);
    playSoundEffect('cat_sad', 0.34);
    addSplash(d.x, GROUND_Y - 6, true);
    setWet(true);
    setCombo(0);
    comboRef.current = 0;
    later(() => {
      setWet(false);
      nextRound();
    }, 1500);
  }, [addSplash, later, nextRound]);

  // 主循环：useRafLoop 每帧推进雨滴 y（dt/1000 * speed px）
  useRafLoop((dt) => {
    const d = dropRef.current;
    if (!d) return;
    const p = phaseRef.current;
    if (p !== 'falling' && p !== 'caught') return;
    const ny = d.y + (d.speed * dt) / 1000;
    if (p === 'falling' && ny >= GROUND_Y) {
      dropRef.current = null;
      setDrop(null);
      missGround(d);
      return;
    }
    if (p === 'caught' && ny >= UMBRELLA_Y) {
      hitCatch(d, UMBRELLA_Y);
      return;
    }
    const nd = { ...d, y: ny };
    dropRef.current = nd;
    setDrop(nd);
  }, !gameOver);

  // 60 秒倒计时
  useEffect(() => {
    if (gameOver) return;
    if (timeLeft <= 0) {
      endGame(false);
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, gameOver, endGame]);

  // 开局先掉第一滴
  useEffect(() => {
    spawnDrop();
  }, [spawnDrop]);

  // 键盘：只在 falling 阶段接收字母输入
  useKeyDown((e) => {
    if (gameOverRef.current || phaseRef.current !== 'falling') return;
    if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;
    const d = dropRef.current;
    if (!d) return;
    const k = e.key.toLowerCase();
    if (k === d.letter) {
      // 敲对！撑伞 + 小猫跑到雨滴正下方
      phaseRef.current = 'caught';
      setPhase('caught');
      setCatX(clamp(d.x, 16, 84));
      setUmbrellaOpen(true);
      playSoundEffect('whoosh', 0.15);
      if (d.y >= UMBRELLA_Y) {
        hitCatch(d, Math.min(d.y, GROUND_Y - 10)); // 按晚了也照样接住
      } else {
        // 敲对瞬间雨滴下落速度加倍，冲向伞面（不用干等它慢慢飘下来）
        const fast = { ...d, speed: d.speed * 2 };
        dropRef.current = fast;
        setDrop(fast);
      }
    } else {
      // 敲错：只轻晃 + 音效 + 清连击（无惩罚）
      playSoundEffect('error', 0.15);
      setCombo(0);
      comboRef.current = 0;
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  }, []);

  const restart = useCallback(() => {
    runIdRef.current++;
    playSoundEffect('click', 0.2);
    const t = pickWord();
    targetRef.current = t;
    setTarget(t);
    typedLenRef.current = 0;
    setTypedLen(0);
    dropRef.current = null;
    setDrop(null);
    phaseRef.current = 'falling';
    setPhase('falling');
    setSplashes([]);
    setBounce(null);
    setScore(0);
    setCombo(0);
    comboRef.current = 0;
    setMaxCombo(0);
    lettersDoneRef.current = 0;
    setLettersDone(0);
    setWordsDone(0);
    setTimeLeft(GAME_TIME);
    setCatX(50);
    setUmbrellaOpen(false);
    setHappy(false);
    setWet(false);
    setRainbow(false);
    setShake(false);
    gameOverRef.current = false;
    setGameOver(false);
    setWin(false);
    spawnDrop();
  }, [pickWord, spawnDrop]);

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-5xl animate-fade-in mx-auto px-2">
      <style>{`
        @keyframes rainFall { 0%{transform:translateY(-30px);opacity:0} 12%{opacity:.6} 88%{opacity:.6} 100%{transform:translateY(470px);opacity:0} }
        @keyframes rainbowSweep { 0%{transform:scaleX(.05);opacity:0} 16%{opacity:1} 82%{transform:scaleX(1);opacity:1} 100%{transform:scaleX(1);opacity:0} }
        @keyframes umbrellaPop { 0%{transform:scale(.1) rotate(-14deg)} 62%{transform:scale(1.14) rotate(4deg)} 100%{transform:scale(1) rotate(0deg)} }
        @keyframes dripFall { 0%{transform:translateY(0);opacity:0} 25%{opacity:1} 100%{transform:translateY(13px);opacity:0} }
        @keyframes bounceOff { 0%{transform:translate(-50%,-50%) translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(-50%,-50%) translate(var(--bx),var(--by)) rotate(var(--br));opacity:0} }
        .umbrella-open { animation: umbrellaPop .42s cubic-bezier(.34,1.4,.64,1) both; }
        .animate-drip { animation: dripFall .95s ease-in infinite; }
      `}</style>

      <GameHeader emoji="🌧️" title="字母雨·小猫打伞" tag="入门 · 打单字母" tagColor="bg-[#E3F2FA] text-[#2E93C4] border-[#BBE2F2]">
        <ScorePill icon="⏳" label="时间" value={<span className={timeLeft <= 10 ? 'text-[#E0633A] animate-pulse' : ''}>{timeLeft}s</span>} />
        <ScorePill icon="⭐" label="得分" value={score} />
        <ScorePill icon="💫" label="连击" value={`x${combo}`} color="bg-[#FFF3D6] text-[#B8860B] border-[#FFE3A3]" />
        <ScorePill icon="🔤" label="接字母" value={`${lettersDone}/${LETTERS_GOAL}`} color="bg-[#F3E9FA] text-[#8258C7] border-[#E2D0F2]" />
        <ComboFlame combo={combo} />
      </GameHeader>

      <GameBoard
        className="h-[430px]"
        shake={shake}
        style={{ background: 'linear-gradient(180deg,#7D8FA8 0%,#93A5BB 45%,#A8B8C8 100%)' }}
      >
        <div ref={boardRef} className="absolute inset-0">
          {/* 雨丝背景 */}
          {RAIN_STREAKS.map((r, i) => (
            <div
              key={i}
              className="absolute top-0 w-[2px] rounded-full bg-white/30 pointer-events-none"
              style={{ left: `${r.left}%`, height: r.h, animation: `rainFall ${r.dur}s linear ${r.delay}s infinite` }}
            />
          ))}

          {/* 远处小山剪影 */}
          <div className="absolute left-[-6%] w-[46%] h-[110px] rounded-[50%] bg-[#647E6C]/50 pointer-events-none" style={{ bottom: 62 }} />
          <div className="absolute right-[-8%] w-[52%] h-[130px] rounded-[50%] bg-[#5D7766]/45 pointer-events-none" style={{ bottom: 58 }} />

          {/* 乌云飘动 */}
          {[
            { top: 14, dur: 34, delay: -6, s: 1 },
            { top: 44, dur: 46, delay: -22, s: 0.78 },
            { top: 4, dur: 40, delay: -31, s: 1.18 },
          ].map((c, i) => (
            <div key={i} className="absolute z-[5] pointer-events-none" style={{ top: c.top, animation: `cloudDrift ${c.dur}s linear ${c.delay}s infinite` }}>
              <div className="relative" style={{ transform: `scale(${c.s})` }}>
                <div className="absolute w-14 h-14 bg-[#5E7186]/90 rounded-full -top-5 left-3" />
                <div className="absolute w-11 h-11 bg-[#5E7186]/90 rounded-full -top-3 left-14" />
                <div className="w-24 h-11 bg-[#5E7186]/90 rounded-full" />
              </div>
            </div>
          ))}

          {/* 目标单词进度（角落小徽章：字母本身就在雨滴上，不抢主视野） */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="bg-white/90 rounded-full border-[3px] border-[#4FB8E7] shadow-[0_3px_0_#3D9AC9] px-4 py-1 flex items-center gap-2">
              <span className="text-[11px] font-black text-[#8A6F5C]">{target.display}</span>
              <TypedWord word={target.typing.toLowerCase()} typedLen={typedLen} size="sm" />
            </div>
          </div>

          {/* 字母雨滴（拟真水滴，左右对称、垂直下落不歪斜） */}
          {drop && (
            <div className="absolute z-20" style={{ left: `${drop.x}%`, top: drop.y, transform: 'translate(-50%,-50%)' }}>
              <DropLetter ch={drop.letter.toUpperCase()} />
            </div>
          )}

          {/* 被伞弹飞的雨滴牌 */}
          {bounce && (
            <div
              key={bounce.id}
              className="absolute z-30 pointer-events-none"
              style={{
                left: `${bounce.x}%`,
                top: bounce.y,
                ['--bx' as string]: `${bounce.dir * 76}px`,
                ['--by' as string]: '-86px',
                ['--br' as string]: `${bounce.dir * 200}deg`,
                animation: 'bounceOff .68s ease-out forwards',
              }}
            >
              <DropLetter ch={bounce.letter} typed small />
            </div>
          )}

          {/* 水花溅开 */}
          {splashes.map(s => (
            <div key={s.id} className="absolute z-30 pointer-events-none" style={{ left: `${s.x}%`, top: s.y }}>
              <span
                className="absolute rounded-full border-[3px] border-white/85"
                style={{
                  width: s.big ? 56 : 36,
                  height: s.big ? 18 : 12,
                  left: s.big ? -28 : -18,
                  top: s.big ? -9 : -6,
                  animation: 'splashRing .7s ease-out forwards',
                }}
              />
              <span
                className={`absolute ${s.big ? 'text-2xl' : 'text-lg'}`}
                style={{ left: s.big ? -14 : -10, top: s.big ? -32 : -22, animation: 'splashRing .7s ease-out forwards' }}
              >
                💦
              </span>
            </div>
          ))}

          {/* 彩虹横贯（完成整词） */}
          {rainbow && (
            <div
              className="absolute inset-x-0 z-40 pointer-events-none"
              style={{
                top: 116,
                height: 40,
                background: 'linear-gradient(90deg,#FF6B6B,#FFA94D,#FFD43B,#69DB7C,#4DABF7,#9775FA,#F783AC)',
                borderRadius: 20,
                animation: 'rainbowSweep 1.6s ease-out forwards',
              }}
            />
          )}

          {/* 草地 */}
          <div className="absolute bottom-0 inset-x-0 h-[78px] z-10 pointer-events-none" style={{ background: 'linear-gradient(180deg,#7ED08A 0%,#5DBE6E 60%,#4CAE60 100%)' }}>
            <div className="absolute -top-1 left-0 w-full h-2 bg-[#8FDAA0]/80 rounded-full" />
          </div>
          {/* 水洼倒影 */}
          <div className="absolute z-[11] pointer-events-none" style={{ left: '16%', top: 390 }}>
            <div className="w-16 h-4 rounded-[50%] bg-[#A9D3EE]/60 animate-breathe" />
          </div>
          <div className="absolute z-[11] pointer-events-none" style={{ left: '70%', top: 398 }}>
            <div className="w-12 h-3.5 rounded-[50%] bg-[#A9D3EE]/50 animate-breathe" style={{ animationDelay: '.6s' }} />
          </div>

          {/* 小猫 + 伞（伞跟着雨滴的 x 走） */}
          <div
            className="absolute z-30 select-none pointer-events-none"
            style={{ left: `${catX}%`, bottom: 16, transform: 'translateX(-50%)', transition: 'left .34s ease-out' }}
          >
            {/* 头顶问号泡泡（等输入时） */}
            {phase === 'falling' && !gameOver && (
              <div className="absolute -top-[64px] left-1/2 -translate-x-1/2 animate-float-y z-20">
                <div className="bg-white/95 border-[3px] border-[#FFE8C8] rounded-xl px-2.5 py-0.5 text-xl font-black text-[#8A6F5C] shadow-md font-kids">?</div>
                <div className="w-2.5 h-2.5 bg-white/95 border-b-[3px] border-r-[3px] border-[#FFE8C8] rotate-45 mx-auto -mt-1" />
              </div>
            )}
            <Umbrella open={umbrellaOpen} />
            <Cat happy={happy} wet={wet} />
          </div>

          <ScoreLayer />

          {gameOver && (
            <ResultModal
              title={win ? '接满啦！小猫干干爽爽！' : '雨停啦，下次接得更多！'}
              emoji={win ? '🌂😺' : '🌧️'}
              score={score}
              coins={wordsDone * 2}
              combo={maxCombo}
              stars={calcStars(score, 480)}
              replay={restart}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>

      <div className="w-full story-card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#8A6F5C] font-bold flex items-center gap-1.5">
          <span>💡</span> 敲对雨滴上的字母，小猫就撑伞接住它！敲错没关系只清连击；接住一整个单词还能看到彩虹哦
        </div>
        <div className="flex items-center gap-3">
          <button onClick={restart} className="btn-candy btn-grape px-5 py-2.5 text-xs">🔄 重新开始</button>
          <BackButton onBack={onBack} label="返回选择" />
        </div>
      </div>
    </div>
  );
};

export default LetterRainGame;
