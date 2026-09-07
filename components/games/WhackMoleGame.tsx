import React, { useState, useRef, useCallback } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useGameLoop,
  TypedWord, ScorePill, ComboFlame, useFloatScores,
  ResultModal, GameHeader, GameBoard, BackButton, calcStars, useDifficulty, speakGameWord
} from './shared';

// ============ 🔨 打地鼠 · 疯狂60秒 ============
// 贱兮兮的地鼠举着单词牌从洞里钻出来挑衅你！敲完整个单词，
// 锤子自动飞过去把它砸扁！连击越高地鼠缩得越快——越打越爽！
// 金色墨镜地鼠😎双倍分；黑炸弹💣别敲，等它自己缩回去！

const GAME_TIME = 60;           // 基础时长（秒）
const BASE_WINDOW = 4000;        // 地鼠窗口期基数（毫秒）
const MIN_WINDOW = 1200;        // 窗口期下限
const COMBO_STEP = 150;         // 连击每 +1 窗口缩短（毫秒）
const FRENZY_AT = 8;            // 疾风时刻门槛

type MoleKind = 'normal' | 'golden' | 'bomb';
type MoleState = 'up' | 'hit' | 'retract' | 'gone';
type MoleFaceState = MoleKind | 'hit';

interface Mole {
  id: number;
  seq: number;        // 出场顺序（越大越新，目标词优先取最新）
  hole: number;       // 0~8
  item: GameItem;
  typed: string;
  spawnAt: number;   // ms 时间戳
  duration: number;  // 窗口期（毫秒）
  kind: MoleKind;
  state: MoleState;
}

interface GState {
  moles: Mole[];
  time: number;        // 剩余时间（秒，0.1 精度）
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;        // 敲中数（结算金币展示）
  frenzy: boolean;    // 疾风时刻
  over: boolean;
  nextSpawnAt: number; // 下次生成时间戳
}

const freshState = (): GState => ({
  moles: [], time: GAME_TIME, score: 0, combo: 0, maxCombo: 0,
  hits: 0, frenzy: false, over: false, nextSpawnAt: Date.now() + 600,
});

// 星星四溅的 6 个方向（像素）
const STAR_DIRS = [
  { sx: 0, sy: -52 }, { sx: 48, sy: -30 }, { sx: 52, sy: 24 },
  { sx: 0, sy: 46 }, { sx: -48, sy: -28 }, { sx: -52, sy: 22 },
];
// 疾风时刻背景速度线
const FRENZY_STREAKS = [
  { top: '8%', w: 90, dur: 0.38, delay: 0 },
  { top: '26%', w: 70, dur: 0.44, delay: 0.15 },
  { top: '48%', w: 100, dur: 0.36, delay: 0.28 },
  { top: '68%', w: 65, dur: 0.42, delay: 0.08 },
  { top: '86%', w: 85, dur: 0.4, delay: 0.2 },
];

// 当前目标：最后出现的「up」地鼠（7 岁孩子一次专注一只）
const activeTargetOf = (g: GState): Mole | null => {
  let best: Mole | null = null;
  for (const m of g.moles) {
    if (m.state !== 'up') continue;
    if (!best || m.seq > best.seq) best = m;
  }
  return best;
};

// ═══════════════ 🦔 纯 CSS 手绘地鼠脸（贱兮兮讨打款，约 90px 宽）═══════════════
// 结构：两颗小圆耳(粉内耳) → 棕色椭圆大头(#8B6141→#A0744E 渐变) →
//   左眉抬高(不对称贱感) + 眯眼坏笑斜线(眼尾上挑) + 粉色大椭圆鼻头(带鼻孔) +
//   坏笑咧嘴弧线 + 两颗白色大门牙(梯形龅牙) + 腮红 + 胡须点
// 变体：golden 整体金色滤镜+CSS墨镜 / bomb 黑球+火花引信 / hit XX眼+吐舌+头顶星星
const MoleFace: React.FC<{ state: MoleFaceState }> = ({ state }) => {
  // 💣 炸弹：黑球 + 火花引信
  if (state === 'bomb') {
    return (
      <div className="relative w-[76px] h-[76px] select-none">
        {/* 引信 */}
        <div className="absolute -top-[8px] right-[16px] w-[9px] h-[15px] rounded-full bg-[#8B6141] rotate-[24deg] border-2 border-[#6E4B30]" />
        <span className="absolute -top-[18px] right-[2px] text-[15px] leading-none animate-fuse-spark select-none">🔥</span>
        {/* 黑球本体 */}
        <div className="relative w-full h-full rounded-full bg-gradient-to-br from-[#565656] via-[#2B2B2B] to-[#0D0D0D] border-[3px] border-[#151515] shadow-[inset_-7px_-9px_12px_rgba(0,0,0,0.65),0_4px_7px_rgba(0,0,0,0.35)]">
          <div className="absolute top-[11px] left-[12px] w-[16px] h-[10px] rounded-full bg-white/25 blur-[2px] rotate-[-18deg]" />
          {/* 生气红眼 + 嘴 */}
          <div className="absolute top-[30px] left-[15px] w-[13px] h-[4px] rounded-full bg-[#FF6B5B] rotate-[16deg]" />
          <div className="absolute top-[30px] right-[15px] w-[13px] h-[4px] rounded-full bg-[#FF6B5B] -rotate-[16deg]" />
          <div className="absolute bottom-[15px] left-1/2 -translate-x-1/2 w-[22px] h-[9px] rounded-b-full border-b-[4px] border-[#FF6B5B]" />
        </div>
      </div>
    );
  }

  const golden = state === 'golden';
  const hit = state === 'hit';

  return (
    <div className={`relative w-[88px] h-[72px] select-none ${golden ? 'mole-golden' : ''}`}>
      {/* 头顶冒星星（被砸晕） */}
      {hit && (
        <>
          <span className="absolute -top-[16px] left-[5px] text-[13px] animate-twinkle select-none">⭐</span>
          <span className="absolute -top-[21px] left-[36px] text-[16px] animate-twinkle select-none" style={{ animationDelay: '0.25s' }}>🌟</span>
          <span className="absolute -top-[15px] right-[7px] text-[13px] animate-twinkle select-none" style={{ animationDelay: '0.5s' }}>⭐</span>
        </>
      )}

      {/* 小圆耳朵（内耳粉色） */}
      <div className="absolute -top-[7px] left-[6px] w-[21px] h-[21px] rounded-full bg-gradient-to-b from-[#A0744E] to-[#8B6141] border-[3px] border-[#6E4B30]">
        <div className="absolute inset-[4px] rounded-full bg-[#E8A0B0]" />
      </div>
      <div className="absolute -top-[7px] right-[6px] w-[21px] h-[21px] rounded-full bg-gradient-to-b from-[#A0744E] to-[#8B6141] border-[3px] border-[#6E4B30]">
        <div className="absolute inset-[4px] rounded-full bg-[#E8A0B0]" />
      </div>

      {/* 大头：棕色椭圆渐变 */}
      <div className="absolute inset-0 rounded-[48%] bg-gradient-to-b from-[#A0744E] via-[#8B6141] to-[#75503A] border-[3px] border-[#6E4B30] shadow-[inset_0_-7px_10px_rgba(0,0,0,0.2),0_4px_6px_rgba(0,0,0,0.3)]">
        {/* 腮红 */}
        <div className="absolute top-[36px] left-[3px] w-[13px] h-[9px] rounded-full bg-[#E8A0B0]/70" />
        <div className="absolute top-[36px] right-[3px] w-[13px] h-[9px] rounded-full bg-[#E8A0B0]/70" />
        {/* 胡须点 */}
        <div className="absolute top-[45px] left-[7px] flex flex-col gap-[3px]">
          <span className="w-[3px] h-[3px] rounded-full bg-[#4A2F1B]" />
          <span className="w-[3px] h-[3px] rounded-full bg-[#4A2F1B]" />
        </div>
        <div className="absolute top-[45px] right-[7px] flex flex-col gap-[3px]">
          <span className="w-[3px] h-[3px] rounded-full bg-[#4A2F1B]" />
          <span className="w-[3px] h-[3px] rounded-full bg-[#4A2F1B]" />
        </div>

        {/* 挑眉：左眉高高抬起（不对称 = 贱感来源） */}
        {!hit ? (
          <>
            <div className="absolute top-[10px] left-[13px] w-[17px] h-[5px] rounded-full bg-[#3A2415] -rotate-[12deg]" />
            <div className="absolute top-[15px] right-[13px] w-[17px] h-[5px] rounded-full bg-[#3A2415] rotate-[10deg]" />
          </>
        ) : (
          <>
            <div className="absolute top-[12px] left-[13px] w-[17px] h-[5px] rounded-full bg-[#3A2415] rotate-[14deg]" />
            <div className="absolute top-[12px] right-[13px] w-[17px] h-[5px] rounded-full bg-[#3A2415] -rotate-[14deg]" />
          </>
        )}

        {/* 眼睛：眯成坏笑斜线（眼尾上挑）/ 金鼠墨镜 / 被砸 XX */}
        {hit ? (
          <>
            <div className="absolute top-[22px] left-[10px] w-[19px] h-[14px]">
              <span className="absolute top-1/2 left-0 w-[19px] h-[4px] rounded-full bg-[#2A1A10] rotate-45" />
              <span className="absolute top-1/2 left-0 w-[19px] h-[4px] rounded-full bg-[#2A1A10] -rotate-45" />
            </div>
            <div className="absolute top-[22px] right-[10px] w-[19px] h-[14px]">
              <span className="absolute top-1/2 left-0 w-[19px] h-[4px] rounded-full bg-[#2A1A10] rotate-45" />
              <span className="absolute top-1/2 left-0 w-[19px] h-[4px] rounded-full bg-[#2A1A10] -rotate-45" />
            </div>
          </>
        ) : golden ? (
          /* 😎 CSS 墨镜 */
          <div className="absolute top-[21px] left-1/2 -translate-x-1/2 flex items-center gap-[3px]">
            <div className="relative w-[27px] h-[15px] rounded-[7px] bg-[#161D2B] border-2 border-[#0A0F18]">
              <span className="absolute top-[3px] left-[5px] w-[10px] h-[3px] rounded-full bg-white/40 rotate-[-15deg]" />
            </div>
            <div className="w-[8px] h-[3px] bg-[#161D2B]" />
            <div className="relative w-[27px] h-[15px] rounded-[7px] bg-[#161D2B] border-2 border-[#0A0F18]">
              <span className="absolute top-[3px] left-[5px] w-[10px] h-[3px] rounded-full bg-white/40 rotate-[-15deg]" />
            </div>
          </div>
        ) : (
          <>
            <div className="absolute top-[24px] left-[10px] w-[19px] h-[6px] rounded-full bg-[#2A1A10] rotate-[10deg]" />
            <div className="absolute top-[24px] right-[10px] w-[19px] h-[6px] rounded-full bg-[#2A1A10] -rotate-[10deg]" />
          </>
        )}

        {/* 鼻子：小巧圆鼻头（地鼠款，不是猪大鼻） */}
        <div className="absolute top-[33px] left-1/2 -translate-x-1/2 w-[12px] h-[9px] rounded-full bg-gradient-to-b from-[#F5A8BC] to-[#E489A2] border-2 border-[#C86F8C]" />

        {/* 嘴：坏笑咧嘴弧线 + 白色大门牙（梯形龅牙）/ 被砸张嘴吐舌 */}
        {!hit ? (
          <>
            <div className="absolute top-[46px] left-1/2 -translate-x-1/2 w-[36px] h-[13px] rounded-b-[100%] border-b-[4px] border-[#3A2415] rotate-[4deg]" />
            <div className="absolute top-[49px] left-1/2 -translate-x-1/2 w-[23px] h-[12px] bg-gradient-to-b from-white to-[#EFE3D2] rounded-b-[5px] border-2 border-[#D9C9B8]"
              style={{ clipPath: 'polygon(14% 0, 86% 0, 100% 100%, 0% 100%)' }}>
              <span className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-[#D9C9B8]" />
            </div>
          </>
        ) : (
          <>
            <div className="absolute top-[45px] left-1/2 -translate-x-1/2 w-[28px] h-[13px] rounded-b-[100%] bg-[#3A2415] border-b-[3px] border-[#2A1A10]" />
            <div className="absolute top-[52px] left-1/2 -translate-x-1/2 w-[14px] h-[12px] rounded-b-full rounded-t-[3px] bg-[#F0788F] border-2 border-[#D45F7B]" />
          </>
        )}
      </div>
    </div>
  );
};

export const WhackMoleGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack, difficulty }) => {
  const { timeMul } = useDifficulty(difficulty); // 难度：地鼠窗口期与冒出节奏
  const pickWord = useWordPool(wordList);
  const [over, setOver] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [hammer, setHammer] = useState<{ id: number; tx: number; ty: number; cx: number; cy: number } | null>(null);
  const [bonuses, setBonuses] = useState<{ id: number; text: string; color: string }[]>([]);
  const [, setFrame] = useState(0);

  const { addScore, Layer: ScoreLayer } = useFloatScores();
  const boardRef = useRef<HTMLDivElement>(null);
  const holeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gRef = useRef<GState>(freshState());
  const idSeq = useRef(0);

  const rerender = useCallback(() => setFrame(f => f + 1), []);

  // 中央弹跳大字（+2秒 / -2秒）
  const pushBonus = useCallback((text: string, color: string) => {
    const b = { id: Date.now() + Math.random(), text, color };
    setBonuses(prev => [...prev, b]);
    setTimeout(() => setBonuses(prev => prev.filter(x => x.id !== b.id)), 950);
  }, []);

  // 测量洞位的像素中心（相对游戏板）
  const holePx = useCallback((hole: number): { x: number; y: number } | null => {
    const cell = holeRefs.current[hole];
    const board = boardRef.current;
    if (!cell || !board) return null;
    const cr = cell.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    return { x: cr.left - br.left + cr.width / 2, y: cr.top - br.top + cr.height * 0.4 };
  }, []);

  // 锤子从屏幕中心飞向洞位
  const flyHammer = useCallback((hole: number) => {
    const cell = holeRefs.current[hole];
    const board = boardRef.current;
    if (!cell || !board) return;
    const cr = cell.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    setHammer({
      id: Date.now(),
      tx: cr.left - br.left + cr.width / 2,
      ty: cr.top - br.top + cr.height / 2,
      cx: br.width / 2,
      cy: br.height / 2,
    });
    setTimeout(() => setHammer(null), 300);
  }, []);

  const endGame = useCallback(() => {
    const g = gRef.current;
    if (g.over) return;
    g.over = true;
    setOver(true);
    playSoundEffect('victory', 0.3);
  }, []);

  // ====== 主循环：倒计时 / 缩回 / 生成（100ms tick）======
  useGameLoop(() => {
    const g = gRef.current;
    if (g.over) return;
    const now = Date.now();

    g.time = Math.max(0, g.time - 0.1);
    if (g.time <= 0) { endGame(); return; }

    // 窗口期结束 → 缩回
    for (const m of g.moles) {
      if (m.state === 'up' && now - m.spawnAt > m.duration) {
        m.state = 'retract';
        if (m.kind === 'bomb') {
          // 炸弹自己缩回 = 正确做法（克制力！），不清连击
          playSoundEffect('pop', 0.14);
        } else {
          // 普通地鼠漏掉 = 清连击
          if (g.combo > 0) g.combo = 0;
          if (g.frenzy) g.frenzy = false;
          playSoundEffect('wind', 0.14);
        }
        setTimeout(() => { m.state = 'gone'; }, 220);
      }
    }
    g.moles = g.moles.filter(m => m.state !== 'gone');

    // 生成新地鼠：常速 1 只，疾风时刻 2 只
    const alive = g.moles.filter(m => m.state === 'up');
    const cap = g.frenzy ? 2 : 1;
    if (alive.length < cap && now >= g.nextSpawnAt) {
      const count = g.frenzy ? cap - alive.length : 1;
      const occupied = new Set(alive.map(m => m.hole));
      for (let i = 0; i < count; i++) {
        const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(h => !occupied.has(h));
        if (!free.length) break;
        const hole = free[Math.floor(Math.random() * free.length)];
        occupied.add(hole);
        const r = Math.random();
        const kind: MoleKind = r < 0.08 ? 'bomb' : r < 0.18 ? 'golden' : 'normal';
        const word = pickWord();
        // 窗口期：base 4s，连击每 +1 缩 0.15s，最低 1.2s（越打越快！）
        const dur = Math.max(MIN_WINDOW * timeMul, (BASE_WINDOW - g.combo * COMBO_STEP) * timeMul);
        g.moles.push({
          id: ++idSeq.current,
          seq: idSeq.current,
          hole,
          item: word,
          typed: '',
          spawnAt: now,
          duration: kind === 'bomb' ? Math.min(dur, 2400) : dur, // 炸弹是快引线
          kind,
          state: 'up',
        });
        playSoundEffect(kind === 'golden' ? 'bell' : 'bubble', 0.14);
        // 语音"出现即读"：只有这只地鼠是当前唯一在场的才读，疾风双鼠只读先出现的，避免语音重叠
        if (alive.length === 0 && kind !== 'bomb') speakGameWord(word);
      }
      // 生成节奏：连击越高越快
      g.nextSpawnAt = now + (g.frenzy ? 1100 : Math.max(650, 1500 - g.combo * 70)) * timeMul;
    }

    rerender();
  }, !over, 100);

  // ====== 敲完单词 → 锤子飞过去砸！ ======
  const resolveMole = useCallback((mole: Mole) => {
    flyHammer(mole.hole);

    if (mole.kind === 'bomb') {
      // 敲了炸弹：扣 2 秒 + 清连击 + 爆炸震屏
      setTimeout(() => {
        const g = gRef.current;
        if (g.over || mole.state !== 'up') return;
        mole.state = 'gone';
        g.time = Math.max(0, g.time - 2);
        if (g.combo > 0) g.combo = 0;
        g.frenzy = false;
        setShakeKey(k => k + 1);
        playSoundEffect('error', 0.35);
        setTimeout(() => playSoundEffect('pop', 0.2), 120);
        pushBonus('-2秒 💥', '#E0633A');
        rerender();
      }, 170);
      return;
    }

    setTimeout(() => {
      const g = gRef.current;
      if (g.over || mole.state !== 'up') return;
      mole.state = 'hit';
      const golden = mole.kind === 'golden';
      const gained = (25 + g.combo * 5) * (golden ? 2 : 1);
      g.score += gained;
      g.hits += 1;
      g.combo += 1;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      onEarnCoins?.(3); // 铁律：每完成单词 3 金币
      playSoundEffect('mole_hit', 0.3);
      if (golden) playSoundEffect('sparkle', 0.2);
      if (g.combo % 5 === 0) playSoundEffect('combo', 0.25);

      // 疾风时刻：金背景 + 双鼠 + 每只 +2 秒
      if (g.combo >= FRENZY_AT && !g.frenzy) {
        g.frenzy = true;
        playSoundEffect('sparkle', 0.3);
      }
      if (g.frenzy) {
        g.time += 2;
        pushBonus('+2秒 ⏰', '#48A757');
        playSoundEffect('bell', 0.25);
      }

      // 飘分（洞位像素）
      const pos = holePx(mole.hole);
      if (pos) addScore(pos.x, pos.y, `+${gained}${golden ? ' 🌟' : ''}`, golden ? '#B8860B' : '#E0633A');

      setTimeout(() => { mole.state = 'gone'; }, 400);
      rerender();
    }, 170);
  }, [flyHammer, pushBonus, holePx, addScore, onEarnCoins, rerender]);

  // ====== 键盘：字母键只管打字 ======
  useKeyDown((e) => {
    const g = gRef.current;
    if (g.over) return;
    if (e.key.length !== 1 || (!/[a-z]/i.test(e.key) && e.key !== ' ')) return; // 空格：词组单词需要
    const k = e.key.toLowerCase();
    // 疾风时刻会有两只地鼠同时冒头：字母匹配任意一只"正需要这个字母"的地鼠，
    // 否则孩子打旧地鼠上的单词会毫无反应（体感 = 加速期没法打字）
    const primary = activeTargetOf(g);
    const hit =
      primary && primary.kind !== 'bomb' && primary.item.typing[primary.typed.length]?.toLowerCase() === k
        ? primary
        : g.moles.find(m => m.state === 'up' && m.kind !== 'bomb' && m.item.typing[m.typed.length]?.toLowerCase() === k);
    if (!hit) {
      // 错字只清连击，不重罚（炸弹上的字母打了也不算，炸弹等它自己缩回）
      playSoundEffect('error', 0.12);
      if (g.combo > 0) g.combo = 0;
      if (g.frenzy) g.frenzy = false;
      rerender();
      return;
    }
    playSoundEffect('click', 0.15);
    hit.typed += k;
    if (hit.typed.length >= hit.item.typing.length) {
      resolveMole(hit);
    }
    rerender();
  }, [resolveMole]);

  const restart = () => {
    gRef.current = freshState();
    idSeq.current = 0;
    setOver(false);
    setShakeKey(0);
    setHammer(null);
    setBonuses([]);
  };

  // ====== 渲染数据 ======
  const g = gRef.current;
  const active = activeTargetOf(g);
  const timePct = Math.min(100, (g.time / GAME_TIME) * 100);

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-5xl animate-fade-in mx-auto px-2">
      <style>{`
        @keyframes molePopIn {
          0% { transform: translateY(56%) scale(0.2, 0.1); }
          60% { transform: translateY(-8%) scale(1.06, 1.16); }
          100% { transform: translateY(0) scale(1, 1); }
        }
        .animate-mole-pop { animation: molePopIn 0.34s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes moleSway {
          0%, 100% { transform: rotate(-3.5deg); }
          50% { transform: rotate(3.5deg); }
        }
        .animate-mole-sway { animation: moleSway 1.5s ease-in-out infinite; transform-origin: 50% 90%; }
        @keyframes fuseSpark {
          0%, 100% { transform: scale(0.8) rotate(-8deg); opacity: 0.85; }
          50% { transform: scale(1.3) rotate(8deg); opacity: 1; }
        }
        .animate-fuse-spark { animation: fuseSpark 0.32s ease-in-out infinite; }
        .mole-golden { filter: sepia(0.55) saturate(2.4) hue-rotate(-16deg) brightness(1.12) contrast(1.02) drop-shadow(0 0 6px rgba(255,201,49,0.8)); }
        @keyframes hammerStrike {
          0% { transform: translate(var(--dx), var(--dy)) rotate(-150deg) scale(2); opacity: 0.65; }
          75% { transform: translate(6%, 6%) rotate(32deg) scale(1); opacity: 1; }
          100% { transform: translate(0, 0) rotate(18deg) scale(1); opacity: 1; }
        }
        @keyframes starScatter {
          0% { transform: translate(0, 0) scale(0.3) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--sx), var(--sy)) scale(1.25) rotate(170deg); opacity: 0; }
        }
        @keyframes bonusPop {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          30% { transform: translate(-50%, -62%) scale(1.35); opacity: 1; }
          65% { transform: translate(-50%, -54%) scale(1.05); opacity: 1; }
          100% { transform: translate(-50%, -95%) scale(0.85); opacity: 0; }
        }
        @keyframes carrotWiggle {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      `}</style>

      <GameHeader emoji="🔨" title="打地鼠·疯狂60秒" tag="速度反应" tagColor="bg-[#FFF3D6] text-[#8A6F00] border-[#FFE3A3]">
        <ScorePill icon="⏳" label="倒计时" value={<span className={g.time <= 10 ? 'text-[#E0633A] animate-pulse' : ''}>{Math.ceil(g.time)}s</span>} />
        <ScorePill icon="⭐" label="得分" value={g.score} />
        <ScorePill icon="🎯" label="敲中" value={g.hits} color="bg-[#E5F6EC] text-[#357F43] border-[#C8EED4]" />
        <ComboFlame combo={g.combo} />
      </GameHeader>

      {/* 胡萝卜时间条：被兔子啃 */}
      <div className="w-full story-card px-5 py-2.5 flex items-center gap-3">
        <span className="text-2xl select-none" style={{ animation: 'carrotWiggle 1.6s ease-in-out infinite' }}>🥕</span>
        <div className="relative flex-1 h-8 bg-[#EADFCA] rounded-full border-2 border-[#D9C9A8] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
            style={{
              width: `${timePct}%`,
              background: 'linear-gradient(180deg, #FFA96B 0%, #FF8A50 55%, #E0633A 100%)',
            }}
          >
            {/* 胡萝卜纹理 */}
            <div className="absolute inset-0 opacity-30" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 14px, rgba(255,255,255,0.7) 14px 18px)' }} />
          </div>
          {/* 兔子啃在剩余胡萝卜的边缘 */}
          <div
            className="absolute top-1/2 -translate-y-1/2 text-2xl select-none z-10 transition-all duration-200"
            style={{ left: `calc(${timePct}% - 13px)` }}
          >
            🐰
          </div>
        </div>
        {g.frenzy && (
          <div className="text-xs font-black text-[#7A4A00] bg-[#FFC94D] px-3 py-1 rounded-xl border-2 border-[#E8A317] animate-wiggle whitespace-nowrap">
            ⚡ 疾风时刻
          </div>
        )}
      </div>

      <GameBoard
        key={shakeKey}
        shake={shakeKey > 0}
        className={`h-[430px] transition-colors duration-500 ${g.frenzy
          ? 'bg-gradient-to-b from-[#FFE9A8] via-[#FFD966] to-[#F0B429]'
          : 'bg-gradient-to-b from-[#A8E063] via-[#7DC95E] to-[#4CAF50]'}`}
      >
        <div ref={boardRef} className="absolute inset-0">
          {/* 游戏中常显的返回按钮 */}
          <div className="absolute top-2 left-2 z-50">
            <BackButton onBack={onBack} label="返回" />
          </div>

          {/* 疾风时刻：呼啸速度线 */}
          {g.frenzy && (
            <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
              {FRENZY_STREAKS.map((s, i) => (
                <div
                  key={i}
                  className="absolute h-1.5 rounded-full bg-white/75"
                  style={{
                    width: s.w,
                    top: s.top,
                    left: '80%',
                    animation: `speedLines ${s.dur}s linear infinite`,
                    animationDelay: `${s.delay}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* 中央顶部提示（仅炸弹警示；单词都举在地鼠手上，不重复占位） */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center pointer-events-none">
            {active && active.kind === 'bomb' ? (
              <div className="bg-[#4A4038]/95 px-4 py-2 rounded-2xl border-3 border-[#E0633A] shadow-lg animate-wiggle">
                <div className="text-sm font-black text-[#FF9B8A] flex items-center gap-1.5">
                  💣 别敲炸弹！等它缩回去
                </div>
              </div>
            ) : !active ? (
              <div className="bg-white/80 px-4 py-1.5 rounded-2xl border-2 border-white/60 text-xs font-black text-[#8A6F5C]">
                👀 地鼠马上钻出来…
              </div>
            ) : null}
          </div>

          {/* 3x3 草地洞口 */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-2 p-3 pt-16 pb-2">
            {Array.from({ length: 9 }).map((_, idx) => {
              const mole = g.moles.find(m => m.hole === idx && m.state !== 'gone') || null;
              return (
                <div
                  key={idx}
                  ref={el => { holeRefs.current[idx] = el; }}
                  className="relative flex items-end justify-center"
                >
                  {/* 洞口椭圆（加深） */}
                  <div className="absolute bottom-2 w-[78%] h-[24%] rounded-[50%] bg-[#4A2F1B] border-4 border-[#7E5430] shadow-[inset_0_10px_14px_rgba(0,0,0,0.5)]" />

                  {/* 地鼠 + 头顶单词牌 */}
                  {mole && (
                    <div
                      className={`relative z-10 flex flex-col items-center mb-2 ${mole.state === 'up' ? 'animate-mole-pop' : ''}`}
                      style={{
                        transformOrigin: 'bottom center',
                        ...(mole.state === 'hit'
                          ? { transform: 'scaleY(0.34) scaleX(1.12) translateY(58%)', transition: 'transform 0.12s ease-out' }
                          : mole.state === 'retract'
                          ? { transform: 'scaleY(0.08) translateY(78%)', transition: 'transform 0.2s ease-in' }
                          : {}),
                      }}
                    >
                      {/* 单词牌（举在头顶：白底蓝边圆角牌） */}
                      {mole.state === 'up' && (
                        <div
                          className={`relative z-10 px-2.5 py-[3px] rounded-2xl border-3 shadow-md flex flex-col items-center ${
                            mole.kind === 'bomb'
                              ? 'bg-[#3A322C] border-[#E0633A] animate-pulse'
                              : mole.kind === 'golden'
                              ? 'bg-white border-[#FFC94D] ring-2 ring-[#FFC94D]/70'
                              : 'bg-white border-[#4FB8E7]'
                          }`}
                        >
                          <TypedWord word={mole.item.typing} typedLen={mole.typed.length} size="md" />
                          <div className={`text-[9px] font-bold -mt-0.5 ${mole.kind === 'bomb' ? 'text-[#FF9B8A]' : 'text-[#8A6F5C]'}`}>
                            {mole.kind === 'bomb' ? '⚠ 别敲炸弹!' : mole.item.display}
                          </div>
                          {/* 举牌的小爪子 */}
                          {mole.kind !== 'bomb' && (
                            <>
                              <span className="absolute -bottom-[5px] left-[9px] w-[12px] h-[12px] rounded-full bg-[#8B6141] border-2 border-[#6E4B30]" />
                              <span className="absolute -bottom-[5px] right-[9px] w-[12px] h-[12px] rounded-full bg-[#8B6141] border-2 border-[#6E4B30]" />
                            </>
                          )}
                        </div>
                      )}

                      {/* 地鼠本体：normal 挑眉坏笑 / golden 金色墨镜 / bomb 黑球 / hit XX吐舌 */}
                      <div className={mole.state === 'up' && mole.kind !== 'bomb' ? 'animate-mole-sway' : ''}>
                        <MoleFace state={mole.state === 'hit' ? 'hit' : mole.kind} />
                      </div>
                    </div>
                  )}

                  {/* 被砸：星星四溅 + 爆炸 */}
                  {mole?.state === 'hit' && (
                    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
                      <span className="text-4xl animate-pop-burst select-none">💥</span>
                      {STAR_DIRS.map((d, i) => (
                        <span
                          key={i}
                          className="absolute text-lg select-none"
                          style={{
                            animation: 'starScatter 0.55s ease-out forwards',
                            '--sx': `${d.sx}px`,
                            '--sy': `${d.sy}px`,
                          } as React.CSSProperties}
                        >
                          {i % 2 ? '⭐' : '✨'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 飞行锤子：从屏幕中心飞向洞位 */}
          {hammer && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: hammer.tx,
                top: hammer.ty,
                '--dx': `${hammer.cx - hammer.tx}px`,
                '--dy': `${hammer.cy - hammer.ty}px`,
              } as React.CSSProperties}
            >
              <div
                className="text-5xl select-none drop-shadow-lg"
                style={{ animation: 'hammerStrike 0.22s cubic-bezier(0.25, 0.6, 0.3, 1) forwards' }}
              >
                🔨
              </div>
            </div>
          )}

          {/* 中央弹跳大字：+2秒 / -2秒 */}
          {bonuses.map(b => (
            <div
              key={b.id}
              className="absolute left-1/2 top-1/2 z-50 pointer-events-none font-black text-5xl font-kids select-none drop-shadow-lg"
              style={{ color: b.color, animation: 'bonusPop 0.95s ease-out forwards' }}
            >
              {b.text}
            </div>
          ))}

          <ScoreLayer />

          {over && (
            <ResultModal
              title="时间到！打地鼠小达人！"
              emoji="🏆"
              score={g.score}
              coins={g.hits}
              combo={g.maxCombo}
              stars={calcStars(g.score, 1000)}
              replay={restart}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>

      <div className="w-full story-card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#8A6F5C] font-bold flex items-center gap-1.5">
          <span>💡</span> 敲完地鼠头顶举着的单词牌，锤子自动飞过去砸！连击越高地鼠缩得越快；金色墨镜地鼠😎双倍分；黑炸弹💣千万别敲，等它自己缩回去！
        </div>
        <div className="flex items-center gap-3">
          <button onClick={restart} className="btn-candy btn-honey px-5 py-2.5 text-xs">🔄 重新开始</button>
        </div>
      </div>
    </div>
  );
};

export default WhackMoleGame;
