import React, { useEffect, useRef, useState, useCallback } from 'react';
import { playSoundEffect, speakDirect } from '../../utils';

// ============ 游戏内打完单词 → 语音朗读（英语词读单词，语文词读汉字） ============
export const speakGameWord = (item: GameItem) => {
  try {
    const isChinese = /[\u4e00-\u9fff]/.test(item.display);
    speakDirect(isChinese ? item.display : item.typing, isChinese ? 'zh-CN' : 'en-US');
  } catch { /* 静音失败不阻塞游戏 */ }
};

// ============ 共享类型 ============
export interface GameItem {
  typing: string;   // 要敲的字母串（英文单词或无调拼音）
  display: string;  // 展示的中文/原文
}

export interface BaseGameProps {
  wordList: GameItem[];
  onEarnCoins?: (amount: number) => void;
  onBack: () => void;
  difficulty?: GameDifficulty;
}

// ============ 难度分级（6 档，默认 3 档） ============
export type GameDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

export const DIFFICULTY_LEVELS: Array<{ level: GameDifficulty; label: string; hint: string }> = [
  { level: 1, label: '🐢 龟龟慢速', hint: '超慢超简单，刚上手最合适' },
  { level: 2, label: '🦥 慢慢热身', hint: '节奏放缓，轻松练习' },
  { level: 3, label: '🐻 标准速度', hint: '默认难度，适合大多数小朋友' },
  { level: 4, label: '🐇 小小提速', hint: '原版速度，小有挑战' },
  { level: 5, label: '🐆 高手冲刺', hint: '手速燃烧，反应要快' },
  { level: 6, label: '🚀 极速传说', hint: '极限挑战，你敢来吗' },
];

// 移动物体速度倍率（越大越快越难）
export const DIFF_SPEED: Record<GameDifficulty, number> = {
  1: 0.55, 2: 0.75, 3: 0.9, 4: 1.0, 5: 1.18, 6: 1.4,
};

// 时间窗口倍率（越大等待越久越简单；同时拉长生成间隔）
export const DIFF_TIME: Record<GameDifficulty, number> = {
  1: 1.6, 2: 1.3, 3: 1.12, 4: 1.0, 5: 0.85, 6: 0.72,
};

// 游戏内统一取难度参数（未传时默认 3 档）
export const useDifficulty = (difficulty?: GameDifficulty): { level: GameDifficulty; speedMul: number; timeMul: number } => {
  const level = (difficulty && difficulty >= 1 && difficulty <= 6 ? difficulty : 3) as GameDifficulty;
  return { level, speedMul: DIFF_SPEED[level], timeMul: DIFF_TIME[level] };
};

// ============ 词池抽取（避免连续重复） ============
export const useWordPool = (wordList: GameItem[]) => {
  const pool = wordList.length > 0 ? wordList : [
    { typing: 'sun', display: '太阳' },
    { typing: 'cat', display: '猫咪' },
    { typing: 'fish', display: '小鱼' },
    { typing: 'tree', display: '大树' },
    { typing: 'star', display: '星星' },
    { typing: 'frog', display: '青蛙' },
    { typing: 'duck', display: '小鸭' },
    { typing: 'cake', display: '蛋糕' }
  ];
  const lastIdx = useRef(-1);
  const pick = useCallback((): GameItem => {
    if (pool.length === 1) return pool[0];
    let idx = Math.floor(Math.random() * pool.length);
    let guard = 0;
    while (idx === lastIdx.current && guard < 6) {
      idx = Math.floor(Math.random() * pool.length);
      guard++;
    }
    lastIdx.current = idx;
    return pool[idx];
  }, [pool]);
  return pick;
};

// ============ 键盘监听 ============
export const useKeyDown = (handler: (e: KeyboardEvent) => void, deps: React.DependencyList = []) => {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => ref.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, deps);
};

// ============ 游戏主循环（标准化 tick） ============
export const useGameLoop = (callback: () => void, active: boolean, intervalMs = 100) => {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
};

// ============ 高帧率循环（requestAnimationFrame，60fps，用于需要流畅动画的游戏） ============
// callback(dt) 收到距上一帧的毫秒数，做时间步进；组件卸载/active=false 自动停止
export const useRafLoop = (callback: (dt: number) => void, active: boolean) => {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const fn = (now: number) => {
      const dt = Math.min(50, now - last);  // 防切后台回来 dt 巨大
      last = now;
      ref.current(dt);
      raf = requestAnimationFrame(fn);
    };
    raf = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(raf);
  }, [active]);
};

// ============ 统一打字词显示（所有游戏共用，保证视觉一致性） ============
// typedLen 之前的字母显示为已完成（绿色），当前字母橙色脉冲，其余灰色
export const TypedWord: React.FC<{
  word: string;
  typedLen: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ word, typedLen, size = 'md', className = '' }) => {
  // 大字号：7岁孩子在动态中也要看得清（比初版大约一倍）
  const sizeCls = size === 'lg' ? 'text-4xl md:text-6xl' : size === 'sm' ? 'text-2xl md:text-3xl' : 'text-3xl md:text-5xl';
  return (
    <div className={`flex font-mono font-black justify-center ${sizeCls} ${className}`}>
      {word.split('').map((ch, i) => (
        <span
          key={i}
          className={`px-1 rounded-md transition-colors duration-100 ${
            i < typedLen
              ? 'bg-[#6BCB77] text-white'
              : i === typedLen
              ? 'bg-[#FF8A5C] text-white animate-pulse'
              : 'text-[#8A6F5C]'
          }`}
        >
          {ch === ' ' ? '␣' : ch}
        </span>
      ))}
    </div>
  );
};

// ============ HUD 药丸 ============
export const ScorePill: React.FC<{ icon: string; label: string; value: React.ReactNode; color?: string }> = ({ icon, label, value, color = 'bg-white text-[#5B4636] border-[#FFE8C8]' }) => (
  <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border-3 font-black text-sm shadow-[0_3px_0_rgba(0,0,0,0.08)] ${color}`}>
    <span className="text-lg">{icon}</span>
    <span className="text-[11px] opacity-70">{label}</span>
    <span className="text-base">{value}</span>
  </div>
);

export const ComboFlame: React.FC<{ combo: number }> = ({ combo }) => {
  if (combo < 2) return null;
  const hot = combo >= 10;
  return (
    <div className={`flex items-center gap-1 px-3.5 py-1.5 rounded-2xl border-3 font-black text-sm shadow-[0_3px_0_rgba(0,0,0,0.08)] ${
      hot ? 'bg-[#FFE3E3] text-[#E0633A] border-[#FFC1B1] animate-wiggle' : 'bg-[#FFF3D6] text-[#B8860B] border-[#FFE3A3]'
    }`}>
      <span className="text-lg">{hot ? '🔥' : '✨'}</span>
      <span>连击 x{combo}</span>
    </div>
  );
};

// ============ 飘分动画 ============
export interface FloatScore {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

export const useFloatScores = () => {
  const [scores, setScores] = useState<FloatScore[]>([]);
  const addScore = useCallback((x: number, y: number, text: string, color = '#E0633A') => {
    const id = Date.now() + Math.random();
    setScores(prev => [...prev, { id, x, y, text, color }]);
    setTimeout(() => setScores(prev => prev.filter(s => s.id !== id)), 950);
  }, []);
  const Layer: React.FC = () => (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
      {scores.map(s => (
        <span
          key={s.id}
          className="absolute font-black text-xl animate-float-score drop-shadow"
          style={{ left: s.x, top: s.y, color: s.color }}
        >
          {s.text}
        </span>
      ))}
    </div>
  );
  return { addScore, Layer };
};

// ============ 结算弹窗 ============
export interface GameResult {
  title: string;
  emoji: string;
  score: number;
  coins: number;
  combo: number;
  stars: 1 | 2 | 3;
  replay: () => void;
  onBack?: () => void;   // 返回游戏列表（修复：此前返回按钮从不生效）
}

export const ResultModal: React.FC<GameResult> = ({ title, emoji, score, coins, combo, stars, replay, onBack }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#5B4636]/55 backdrop-blur-[2px] rounded-[1.75rem] animate-fade-in p-4">
    <div className="story-card w-full max-w-md p-8 flex flex-col items-center text-center relative overflow-hidden">
      {/* 五彩纸屑 */}
      {['🎉', '⭐', '🎊', '✨', '🍬', '🎈', '⭐', '🎉'].map((c, i) => (
        <span
          key={i}
          className="absolute animate-confetti text-xl select-none"
          style={{ left: `${8 + i * 11}%`, animationDelay: `${i * 0.12}s` }}
        >
          {c}
        </span>
      ))}
      <span className="text-7xl mb-2 animate-float-y">{emoji}</span>
      <h3 className="text-2xl font-black text-[#5B4636] font-kids">{title}</h3>

      <div className="flex items-center gap-1.5 my-3">
        {[1, 2, 3].map(i => (
          <span key={i} className={`text-4xl ${i <= stars ? 'animate-star-spin' : 'opacity-25 grayscale'}`} style={{ animationDelay: `${i * 0.15}s` }}>
            ⭐
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full my-2">
        <div className="bg-[#FFF3D6] rounded-2xl py-3 border-2 border-[#FFE3A3]">
          <div className="text-[10px] font-bold text-[#B8860B]">得分</div>
          <div className="text-xl font-black text-[#8A5F00]">{score}</div>
        </div>
        <div className="bg-[#FFE9F0] rounded-2xl py-3 border-2 border-[#FFD3E0]">
          <div className="text-[10px] font-bold text-[#E0678A]">金币</div>
          <div className="text-xl font-black text-[#D14D72]">+{coins}</div>
        </div>
        <div className="bg-[#E5F6EC] rounded-2xl py-3 border-2 border-[#C8EED4]">
          <div className="text-[10px] font-bold text-[#48A757]">最高连击</div>
          <div className="text-xl font-black text-[#357F43]">x{combo}</div>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={replay} className="btn-candy btn-grass px-7 py-3 text-sm">
          🔄 再玩一次
        </button>
        <button
          onClick={() => { playSoundEffect('click'); onBack?.(); }}
          className="btn-candy bg-white text-[#8A6F5C] shadow-[0_5px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-7 py-3 text-sm border-2 border-[#F0E4D2]"
        >
          返回
        </button>
      </div>
    </div>
  </div>
);

// ============ 单字母大字显示（字母雨/气球派对这类"打字母"游戏用） ============
// state: normal 棕色 / typed 绿底白字（敲对瞬间）
export const BigLetter: React.FC<{
  ch: string;
  state?: 'normal' | 'typed';
  size?: 'md' | 'lg';
}> = ({ ch, state = 'normal', size = 'lg' }) => (
  <span
    className={`inline-flex items-center justify-center rounded-xl transition-all duration-150 ${
      size === 'lg' ? 'w-16 h-16 text-5xl md:w-20 md:h-20 md:text-6xl' : 'w-12 h-12 text-4xl'
    } font-mono font-black ${
      state === 'typed'
        ? 'bg-[#6BCB77] text-white scale-110'
        : 'bg-white/90 text-[#5B4636] border-3 border-[#FFE8C8] shadow-[0_3px_0_rgba(0,0,0,0.12)]'
    }`}
  >
    {ch}
  </span>
);

// ============ 游戏头部横幅 ============
export const GameHeader: React.FC<{
  emoji: string;
  title: string;
  tag: string;
  tagColor: string;
  children?: React.ReactNode;
}> = ({ emoji, title, tag, tagColor, children }) => (
  <div className="w-full story-card px-5 py-4 flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <span className="text-4xl animate-float-y select-none">{emoji}</span>
      <div>
        <h3 className="font-black text-lg text-[#5B4636] font-kids leading-tight flex items-center gap-2 flex-wrap">
          {title}
          <span className={`text-[10px] px-2.5 py-0.5 rounded-full border-2 font-black ${tagColor}`}>{tag}</span>
        </h3>
        <span className="text-xs text-[#8A6F5C] font-bold">用键盘打字赢金币 🪙</span>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-wrap">{children}</div>
  </div>
);

// ============ 背板 ============
export const GameBoard: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode; shake?: boolean }> = ({ className = '', style, children, shake }) => (
  <div
    className={`relative w-full rounded-[1.75rem] border-4 border-white shadow-[0_8px_0_rgba(0,0,0,0.10)] overflow-hidden select-none ${shake ? 'animate-shake-screen' : ''} ${className}`}
    style={style}
  >
    {children}
  </div>
);

// ============ 返回按钮 ============
export const BackButton: React.FC<{ onBack: () => void; label?: string }> = ({ onBack, label = '返回' }) => (
  <button
    onClick={() => { playSoundEffect('click'); onBack(); }}
    className="btn-candy bg-white text-[#8A6F5C] shadow-[0_5px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-5 py-2.5 text-xs border-2 border-[#F0E4D2]"
  >
    ⬅ {label}
  </button>
);

// 星级计算：按得分比例
export const calcStars = (score: number, best: number): 1 | 2 | 3 => {
  if (score >= best) return 3;
  if (score >= best * 0.6) return 2;
  return 1;
};
