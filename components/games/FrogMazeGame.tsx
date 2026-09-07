import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useFloatScores,
  ResultModal, GameHeader, GameBoard, BackButton, ScorePill, ComboFlame,
  TypedWord, calcStars,
} from './shared';

// ============ 🐸 小青蛙找妈妈 · 地图大冒险 ============
// 开场就是一整张荷塘迷宫地图（最左起点 → 最右妈妈🐸）：
// 6 层荷叶从左到右排开，白色虚线是路，还藏着死路！
// 每跳用 ⬅ ➡ 选一片荷叶（金框高亮+编号）→ 敲对荷叶上的单词 →
// 青蛙抛物线跳过去（0.6s + 落地涟漪）；跳进死路不扣分（只清连击），
// 按 ⌫ 退回上一片荷叶重新选路——试错本来就是迷宫的一部分！

interface Pad {
  id: number;
  layer: number;      // 0 起点 … 5 妈妈
  row: number;        // 0 上 / 1 中 / 2 下（错落高度）
  x: number;          // 板内百分比
  y: number;          // 板内 px
  item: GameItem;
  nextIds: number[];  // 连向下一层的荷叶
  dead: boolean;      // 死路（走到头没有下一层连接）
}

interface MazeMap {
  pads: Pad[];
  startId: number;
  mamaId: number;
}

const LAYERS = 6;                    // 第0层起点 … 第5层妈妈（金色通路恰好 5 跳）
const ROW_Y = [172, 260, 348];       // 三行荷叶的错落 y
const layerX = (layer: number) => 8 + layer * 16.4;
const MAMA_CHEERS = ['宝贝选条路出发吧！', '小心岔路哦～', '跳得真棒！', '妈妈看到你啦！', '就快到啦！', '抱抱！'];

// ============ 地图生成：保证起点→妈妈有通路，枝杈藏死路 ============
const genMap = (pick: () => GameItem): MazeMap => {
  let idSeq = 0;
  const pads: Pad[] = [];
  const layers: Pad[][] = [];

  for (let l = 0; l < LAYERS; l++) {
    let rows: number[];
    if (l === 0 || l === LAYERS - 1) {
      rows = [1]; // 起点和妈妈都在中间行
    } else {
      rows = Math.random() < 0.45 ? [0, 1, 2]
        : Math.random() < 0.4 ? [0, 1]
        : Math.random() < 0.5 ? [1, 2] : [0, 2];
    }
    layers.push(rows.map(row => {
      const pad: Pad = {
        id: ++idSeq, layer: l, row,
        x: layerX(l),
        y: ROW_Y[row] + Math.round(Math.random() * 16 - 8),
        item: pick(), nextIds: [], dead: false,
      };
      pads.push(pad);
      return pad;
    }));
  }

  const start = layers[0][0];
  const mama = layers[LAYERS - 1][0];
  const link = (from: Pad, to: Pad) => {
    if (from.nextIds.length >= 3 || from.nextIds.includes(to.id)) return;
    from.nextIds.push(to.id);
  };
  // 按行距离远近排序的候选（近的优先连接）
  const nearest = (ref: Pad, pool: Pad[], exclude: number[]) =>
    [...pool]
      .filter(p => !exclude.includes(p.id))
      .sort((a, b) => Math.abs(a.row - ref.row) - Math.abs(b.row - ref.row) || a.id - b.id);

  // ① 金色通路：起点 → … → 妈妈（每局保证一定能到家）
  let cur = start;
  const pathIds = [start.id];
  for (let l = 1; l < LAYERS; l++) {
    const cands = nearest(cur, layers[l], cur.nextIds);
    if (!cands.length) break;
    const next = cands.length > 1 && Math.random() < 0.35 ? cands[1] : cands[0];
    link(cur, next);
    pathIds.push(next.id);
    cur = next;
  }

  // ② 起点多开 1~2 条岔路（开场就有选择）
  for (const t of nearest(start, layers[1], start.nextIds).slice(0, Math.random() < 0.5 ? 2 : 1)) {
    link(start, t);
  }

  // ③ 其余荷叶：一部分是死路，其余接 1~2 条近路
  for (let l = 1; l < LAYERS - 1; l++) {
    for (const p of layers[l]) {
      if (pathIds.includes(p.id)) {
        // 通路荷叶再开一条岔路，让路口有得选
        if (l <= LAYERS - 3 && Math.random() < 0.6) {
          const c = nearest(p, layers[l + 1], p.nextIds);
          if (c.length) link(p, c[0]);
        }
        continue;
      }
      const deadChance = l === LAYERS - 2 ? 0.6 : 0.34; // 第4层岔路大多是死路
      if (Math.random() < deadChance) { p.dead = true; continue; }
      const c = nearest(p, layers[l + 1], p.nextIds);
      const n = Math.min(c.length, Math.random() < 0.45 ? 2 : 1);
      for (let i = 0; i < n; i++) link(p, c[i]);
    }
  }

  // ④ 孤岛修补：没人连进来的荷叶，从上一层最近的荷叶接一条线（地图更完整）
  for (let l = 1; l < LAYERS; l++) {
    for (const p of layers[l]) {
      if (layers[l - 1].some(q => q.nextIds.includes(p.id))) continue;
      const from = nearest(p, layers[l - 1], []).filter(q => !q.dead).find(q => q.nextIds.length < 3);
      if (from) link(from, p);
    }
  }

  return { pads, startId: start.id, mamaId: mama.id };
};

type Phase = 'choosing' | 'typing' | 'jumping' | 'blocked' | 'hug' | 'over';

export const FrogMazeGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack }) => {
  const pickWord = useWordPool(wordList);
  const [map, setMap] = useState<MazeMap | null>(null);
  const [phase, setPhase] = useState<Phase>('choosing');
  const [currentId, setCurrentId] = useState(0);
  const [stack, setStack] = useState<number[]>([]);          // 走过的荷叶（退回用）
  const [selId, setSelId] = useState<number | null>(null);
  const [typedLen, setTypedLen] = useState(0);
  const [jump, setJump] = useState<{ dx: number; dy: number } | null>(null);
  const [frogPos, setFrogPos] = useState({ x: layerX(0), y: ROW_Y[1] });
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [walkedEdges, setWalkedEdges] = useState<Set<string>>(new Set());
  const [jumpsDone, setJumpsDone] = useState(0);
  const [roundNum, setRoundNum] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [wordsDone, setWordsDone] = useState(0);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [scareKey, setScareKey] = useState(0);

  const { addScore, Layer: ScoreLayer } = useFloatScores();
  const boardRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef(0);

  // 换局后作废旧的 setTimeout（防止旧跳跃落在新地图上）
  const later = useCallback((fn: () => void, ms: number) => {
    const r = roundRef.current;
    setTimeout(() => { if (roundRef.current === r) fn(); }, ms);
  }, []);

  const addRipple = useCallback((x: number, y: number) => {
    const id = Date.now() + Math.random();
    setRipples(prev => [...prev, { id, x, y }]);
    later(() => setRipples(prev => prev.filter(r2 => r2.id !== id)), 950);
  }, [later]);

  const boardDxDy = (from: Pad, to: Pad) => {
    const br = boardRef.current?.getBoundingClientRect();
    const dx = br ? ((to.x - from.x) / 100) * br.width : 200;
    const dy = to.y - from.y;
    return { dx, dy };
  };

  const newRound = useCallback(() => {
    roundRef.current += 1;
    const m = genMap(pickWord);
    const sp = m.pads.find(p => p.id === m.startId)!;
    setMap(m);
    setCurrentId(m.startId);
    setStack([]);
    setVisited(new Set([m.startId]));
    setWalkedEdges(new Set());
    setSelId(null);
    setTypedLen(0);
    setJump(null);
    setFrogPos({ x: sp.x, y: sp.y });
    setJumpsDone(0);
    setRoundNum(n => n + 1);
    setScore(0); setCombo(0); setMaxCombo(0); setWordsDone(0);
    setRipples([]); setHearts([]);
    // 起点只有一条路时直接进入打字
    if (sp.nextIds.length === 1) {
      setSelId(sp.nextIds[0]);
      setPhase('typing');
    } else {
      setPhase('choosing');
    }
  }, [pickWord]);

  useEffect(() => { newRound(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPad = map?.pads.find(p => p.id === currentId) || null;
  const targets = useMemo(() => {
    if (!currentPad || !map) return [] as Pad[];
    return currentPad.nextIds
      .map(id => map.pads.find(p => p.id === id))
      .filter((p): p is Pad => !!p)
      .sort((a, b) => a.row - b.row);
  }, [currentPad, map]);
  const selPad = targets.find(t => t.id === selId) || null;
  const mamaPad = map?.pads.find(p => p.id === map.mamaId) || null;

  // ============ 选荷叶 ============
  const selectTarget = useCallback((pad: Pad) => {
    if (phase === 'jumping' || phase === 'hug' || phase === 'over') return;
    if (!targets.some(t => t.id === pad.id)) return;
    if (selId === pad.id && phase === 'typing') return;
    playSoundEffect('whoosh', 0.15);
    setSelId(pad.id);
    setTypedLen(0);
    setPhase('typing');
  }, [phase, targets, selId]);

  const cycleSel = useCallback((dir: 1 | -1) => {
    if (!targets.length) return;
    const idx = targets.findIndex(t => t.id === selId);
    const ni = idx < 0 ? (dir === 1 ? 0 : targets.length - 1) : (idx + dir + targets.length) % targets.length;
    selectTarget(targets[ni]);
  }, [targets, selId, selectTarget]);

  // ============ 敲完单词 → 抛物线跳跃 ============
  const finishWord = useCallback((target: Pad) => {
    if (!currentPad || !map) return;
    const gained = 30 + combo * 5;
    setScore(s => s + gained);
    const nc = combo + 1;
    setCombo(nc);
    setMaxCombo(m => Math.max(m, nc));
    setWordsDone(w => w + 1);
    onEarnCoins?.(3);
    playSoundEffect('correct', 0.2);
    playSoundEffect('frog_jump');

    const from = currentPad;
    setWalkedEdges(prev => new Set(prev).add(`${from.id}>${target.id}`));
    const { dx, dy } = boardDxDy(from, target);
    setPhase('jumping');
    setJump({ dx, dy });

    later(() => {
      setJump(null);
      setFrogPos({ x: target.x, y: target.y });
      playSoundEffect('frog_splash', 0.22);
      addRipple(target.x, target.y);
      setJumpsDone(j => j + 1);
      setVisited(prev => new Set(prev).add(target.id));
      const bw = boardRef.current?.getBoundingClientRect().width ?? 800;
      addScore((target.x / 100) * bw, target.y - 44, `+${gained}`, '#8CE79F');

      if (target.id === map.mamaId) {
        // ===== 扑进妈妈怀抱 =====
        playSoundEffect('victory');
        setScore(s => s + 100);
        setPhase('hug');
        setHearts(Array.from({ length: 9 }, (_, i) => ({
          id: Date.now() + i,
          x: target.x + (Math.random() * 24 - 12),
          y: target.y - 30 + (Math.random() * 90 - 45),
        })));
        later(() => setPhase('over'), 2000);
      } else if (target.dead || target.nextIds.length === 0) {
        // ===== 死路！不扣分，清连击，按 ⌫ 退回 =====
        setCombo(0);
        setPhase('blocked');
        playSoundEffect('wind', 0.22);
      } else {
        setStack(s => [...s, from.id]);
        setCurrentId(target.id);
        setSelId(null);
        setTypedLen(0);
        if (target.nextIds.length === 1) {
          setSelId(target.nextIds[0]);
          setPhase('typing');
        } else {
          setPhase('choosing');
        }
      }
    }, 640);
  }, [currentPad, map, combo, onEarnCoins, later, addScore, addRipple]);

  // ============ 死路退回（不用重新敲词）============
  const retreat = useCallback(() => {
    if (!currentPad || !map) return;
    const prevId = stack[stack.length - 1];
    if (!prevId) return;
    const prev = map.pads.find(p => p.id === prevId);
    if (!prev) return;
    playSoundEffect('whoosh', 0.2);
    const { dx, dy } = boardDxDy(currentPad, prev);
    setPhase('jumping');
    setJump({ dx, dy });

    later(() => {
      setJump(null);
      setFrogPos({ x: prev.x, y: prev.y });
      playSoundEffect('frog_splash', 0.15);
      addRipple(prev.x, prev.y);
      setStack(s => s.slice(0, -1));
      setCurrentId(prevId);
      setSelId(null);
      setTypedLen(0);
      if (prev.nextIds.length === 1) {
        setSelId(prev.nextIds[0]);
        setPhase('typing');
      } else {
        setPhase('choosing');
      }
    }, 520);
  }, [currentPad, map, stack, later, addRipple]);

  // ============ 打字（打错只清连击）============
  const handleChar = useCallback((ch: string) => {
    if (!selPad) return;
    const word = selPad.item.typing.toLowerCase();
    if (ch === word[typedLen]) {
      playSoundEffect('click', 0.15);
      const nt = typedLen + 1;
      if (nt >= word.length) finishWord(selPad);
      else setTypedLen(nt);
    } else {
      playSoundEffect('error', 0.12);
      setCombo(0);
      setScareKey(k => k + 1);
    }
  }, [selPad, typedLen, finishWord]);

  // ============ 键盘：方向键选择 / 字母键打字 / ⌫ 退回 ============
  useKeyDown((e) => {
    if (!map || phase === 'jumping' || phase === 'hug' || phase === 'over') return;

    if (phase === 'blocked') {
      if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        e.preventDefault();
        retreat();
      }
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      cycleSel(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (e.key === 'Backspace') {
      if (stack.length) { e.preventDefault(); retreat(); }
      return;
    }

    if (phase === 'typing' && e.key.length === 1 && (/([a-zA-Z])/.test(e.key) || e.key === ' ')) {
      handleChar(e.key.toLowerCase());
    }
  }, [map, phase, cycleSel, retreat, stack, handleChar]);

  // ============ 背景：星星 / 萤火虫 ============
  const bgStars = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    id: i, left: 2 + Math.random() * 94, top: 2 + Math.random() * 34,
    size: 3 + Math.random() * 4, delay: Math.random() * 2.5,
  })), []);
  const fireflies = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    id: i, left: 10 + Math.random() * 80, top: 130 + Math.random() * 200, delay: Math.random() * 2,
  })), []);

  // ============ SVG 连线（viewBox 0 0 1000 430，x=百分比×10）============
  const edgeLines = useMemo(() => {
    if (!map) return [];
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number; walked: boolean; live: boolean }[] = [];
    for (const p of map.pads) {
      for (const nid of p.nextIds) {
        const q = map.pads.find(t => t.id === nid);
        if (!q) continue;
        lines.push({
          key: `${p.id}>${nid}`,
          x1: p.x * 10, y1: p.y, x2: q.x * 10, y2: q.y,
          walked: walkedEdges.has(`${p.id}>${nid}`),
          live: p.id === currentId,
        });
      }
    }
    return lines;
  }, [map, walkedEdges, currentId]);

  const tilt = selPad && !jump
    ? Math.max(-14, Math.min(14, (selPad.y - frogPos.y) / 3.5))
    : 0;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-5xl animate-fade-in mx-auto px-2">
      <style>{`
        @keyframes frogHop {
          0%   { transform: translate(0, 0) scale(1, 1); }
          14%  { transform: translate(calc(var(--jx) * 0.08), calc(var(--jy) * 0.1 - 5px)) scale(1.16, 0.82); }
          52%  { transform: translate(calc(var(--jx) * 0.52), calc(var(--jy) * 0.5 - 66px)) scale(1.06, 1.12); }
          86%  { transform: translate(calc(var(--jx) * 0.96), calc(var(--jy) * 0.98)) scale(1.12, 0.9); }
          100% { transform: translate(var(--jx), var(--jy)) scale(1, 1); }
        }
        .frog-hop { animation: frogHop .62s cubic-bezier(0.32, 0.62, 0.42, 1) forwards; }
        @keyframes frogScare { 0%{transform:translateY(0) rotate(0)} 25%{transform:translateY(-12px) rotate(-10deg)} 55%{transform:translateY(-4px) rotate(8deg)} 100%{transform:translateY(0) rotate(0)} }
        .animate-frog-scare { animation: frogScare .45s ease; }
        @keyframes targetBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .animate-target-bob { animation: targetBob .95s ease-in-out infinite; }
        @keyframes bounceSoft { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        .animate-bounce-soft { animation: bounceSoft 1.1s ease-in-out infinite; }
        @keyframes hugPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.16)} }
        @keyframes padIn { from{opacity:0} to{opacity:1} }
        .pad-in { animation: padIn .45s ease-out backwards; }
        @keyframes fireflyGlow { 0%,100%{opacity:0.25;transform:scale(0.8) translateY(0)} 50%{opacity:1;transform:scale(1.25) translateY(-9px)} }
      `}</style>

      <GameHeader emoji="🐸" title="小青蛙找妈妈" tag="地图大冒险 · 5 跳到家" tagColor="bg-[#E5F6EC] text-[#357F43] border-[#C8EED4]">
        <ScorePill icon="⭐" label="积分" value={score} />
        <ScorePill icon="🗺️" label="离妈妈" value={phase === 'hug' || phase === 'over' ? '到家啦' : `还差${Math.max(0, 5 - (currentPad?.layer ?? 0))}跳`} color="bg-[#E5F6EC] text-[#357F43] border-[#C8EED4]" />
        <ComboFlame combo={combo} />
      </GameHeader>

      <GameBoard className="h-[430px]" style={{ background: 'linear-gradient(180deg, #2C4A6E 0%, #3E5B8A 60%, #4A6B9C 100%)' }}>
        <div ref={boardRef} className="absolute inset-0" key={roundNum}>

          {/* 月亮 + 星星 */}
          <div className="absolute top-4 left-5 select-none pointer-events-none z-[7]">
            <div className="relative">
              <div className="absolute -inset-5 rounded-full bg-[#FFF3D6]/25 blur-md" />
              <span className="relative text-4xl animate-float-y">🌙</span>
            </div>
          </div>
          {bgStars.map(s => (
            <span key={s.id} className="absolute rounded-full bg-[#FFF3D6] animate-twinkle pointer-events-none z-[7]"
              style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }} />
          ))}
          {fireflies.map(f => (
            <span key={f.id} className="absolute text-sm pointer-events-none z-[7]"
              style={{ left: `${f.left}%`, top: f.top, animation: `fireflyGlow 2.6s ease-in-out ${f.delay}s infinite` }}>✨</span>
          ))}

          {/* 水面（底部波纹） */}
          <div className="absolute bottom-0 inset-x-0 h-[100px] pointer-events-none z-[7]" style={{ background: 'linear-gradient(180deg, rgba(20,44,74,0) 0%, rgba(18,40,68,0.85) 34%, #122A45 100%)' }}>
            <div className="absolute top-2 left-0 w-[200%] h-1.5 bg-[#7FB4D8]/35 rounded-full" style={{ animation: 'waterWave 4.2s ease-in-out infinite' }} />
            <div className="absolute top-7 left-0 w-[200%] h-1 bg-[#9FC8E8]/25 rounded-full" style={{ animation: 'waterWave2 5.4s ease-in-out infinite' }} />
            <div className="absolute bottom-2 inset-x-0 flex justify-around text-lg opacity-50 select-none">
              <span>🪷</span><span>🌿</span><span>🪷</span><span>✨</span><span>🪷</span><span>🌿</span>
            </div>
          </div>

          {/* 迷宫连线（半透明白虚线 / 走过变金色实线） */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[5]" viewBox="0 0 1000 430" preserveAspectRatio="none">
            {edgeLines.map(l => (
              <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke={l.walked ? '#FFC94D' : l.live ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.28)'}
                strokeWidth={l.walked ? 5 : l.live ? 4 : 3}
                strokeDasharray={l.walked ? undefined : '10 9'}
                strokeLinecap="round" />
            ))}
          </svg>

          {/* 走过路线上的小脚印 */}
          {edgeLines.filter(l => l.walked).map(l => (
            <span key={`paw-${l.key}`} className="absolute z-[6] text-[10px] opacity-80 select-none pointer-events-none"
              style={{ left: `${(l.x1 + l.x2) / 2 / 10}%`, top: (l.y1 + l.y2) / 2 - 5 }}>
              🐾
            </span>
          ))}

          {/* 全部荷叶节点 */}
          {map?.pads.map(pad => {
            const isMama = pad.id === map.mamaId;
            const isCurrent = pad.id === currentId;
            const tIdx = targets.findIndex(t => t.id === pad.id);
            const isCand = tIdx >= 0;
            const isSel = pad.id === selId;
            const visitedHere = visited.has(pad.id);
            const isDead = pad.dead || pad.nextIds.length === 0;
            const deadSeen = isDead && visitedHere;

            let padCls = 'w-[76px] h-[62px] bg-gradient-to-b from-[#8FE398] to-[#4CAF6D] border-[#CFF5D8]';
            if (isMama) padCls = 'w-[84px] h-[68px] bg-gradient-to-b from-[#FFC1D0] to-[#E87FA0] border-[#FFE3EC]';
            if (visitedHere && !isCurrent && !deadSeen) padCls = 'w-[76px] h-[62px] bg-gradient-to-b from-[#5FBF7A] to-[#2E7D4A] border-[#8FD8A8]'; // 走过的深绿
            if (deadSeen) padCls = 'w-[76px] h-[62px] bg-gradient-to-b from-[#93B49B] to-[#5F8268] border-[#B7D3C0]'; // 死路灰绿
            if (isCand && !isSel) padCls = 'w-[76px] h-[62px] bg-gradient-to-b from-[#D6F8DB] to-[#9BE8A8] border-[#F0FFF2]'; // 可选浅绿
            if (isCurrent) padCls = 'w-[82px] h-[66px] bg-gradient-to-b from-[#A5F0AD] to-[#3FA866] border-[#FFF3C9] shadow-[0_0_18px_rgba(255,224,130,0.8)]'; // 当前亮绿

            return (
              <div key={pad.id}
                className="absolute z-10 pad-in"
                style={{ left: `${pad.x}%`, top: pad.y, transform: 'translate(-50%, -50%)', animationDelay: `${pad.layer * 0.09}s` }}>
                <div
                  onClick={() => { if (isCand) selectTarget(pad); }}
                  className={`relative flex items-center justify-center rounded-[50%] border-3 transition-all duration-300 select-none ${
                    isCand && !isSel ? 'cursor-pointer animate-target-bob' : ''
                  } ${isSel ? 'scale-110 ring-4 ring-[#FFC94D] border-[#FFC94D] shadow-[0_0_22px_rgba(255,201,77,0.75)]' : ''} ${padCls}`}
                >
                  {/* 荷叶高光 */}
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-2/3 h-1.5 rounded-full bg-white/40 blur-[1px]" />
                  {/* 候选编号 */}
                  {isCand && !isSel && (
                    <span className="absolute -top-2.5 -left-2 w-6 h-6 rounded-full bg-[#FFC94D] text-[#5B4636] border-2 border-white text-[13px] font-black flex items-center justify-center shadow-md select-none">
                      {tIdx + 1}
                    </span>
                  )}
                  {isSel && (
                    <span className="absolute -top-[70px] left-1/2 -translate-x-1/2 text-[#FFC94D] text-lg animate-bounce-soft select-none">▼</span>
                  )}
                  {/* 死路标志 */}
                  {deadSeen && !isCurrent && (
                    <span className="absolute -top-2.5 -right-2 text-sm select-none">🚫</span>
                  )}
                  {isCurrent && phase === 'blocked' && (
                    <span className="absolute -top-4 text-xl animate-wiggle select-none">🚫</span>
                  )}
                  {/* 足迹 / 妈妈的荷叶 */}
                  {visitedHere && !isCurrent && !deadSeen && !isMama && (
                    <span className="absolute -bottom-1 -right-1 text-[9px] opacity-80 select-none">🐾</span>
                  )}
                  {isMama && <span className="absolute -top-3 text-sm select-none">🌸</span>}
                  {pad.id === map.startId && (
                    <span className="absolute -bottom-4 text-[9px] font-black text-white/75 whitespace-nowrap select-none">起点</span>
                  )}
                  {isMama && (
                    <span className="absolute -bottom-4 text-[9px] font-black text-white/75 whitespace-nowrap select-none">妈妈在这里</span>
                  )}
                  {/* 荷叶单词牌：白底深色字托底（不再让半透明绿字直接浮在水面上），选中金边放大 */}
                  {!isCurrent && (
                    <span className={`absolute -top-10 left-1/2 -translate-x-1/2 font-mono font-black text-[22px] leading-none whitespace-nowrap select-none px-2 py-1.5 rounded-xl border-3 shadow-md ${
                      isSel
                        ? 'bg-white text-[#1E5B33] border-[#FFC94D] scale-110'
                        : isCand
                        ? 'bg-white text-[#1E5B33] border-[#9BE8A8]'
                        : isMama
                        ? 'bg-white/90 text-[#C2447C] border-[#FFD3E0]'
                        : deadSeen
                        ? 'bg-white/70 text-[#5F8268] border-[#B7D3C0]'
                        : 'bg-white/85 text-[#2E7D4A] border-[#8FD8A8]'
                    }`}>
                      {pad.item.typing.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* 妈妈青蛙 + 加油气泡（更大只 + 荷叶花帽 + 妈妈徽章，一眼与小青蛙区分） */}
          {mamaPad && (
            <>
              <div className="absolute z-20 select-none pointer-events-none"
                style={{ left: `${mamaPad.x}%`, top: mamaPad.y, transform: 'translate(-50%, -132%)' }}>
                <div className="relative animate-float-y">
                  <div className="relative" style={{ transform: 'scale(1.32)', transformOrigin: 'bottom center' }}>
                    <span className="text-4xl drop-shadow-[0_3px_5px_rgba(0,0,0,0.4)]">🐸</span>
                    {/* 荷叶小花帽（歪着戴更亲切） */}
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl select-none" style={{ transform: 'rotate(-14deg)' }}>🪷</span>
                    {/* 长睫毛 */}
                    <span className="absolute top-[30%] left-[17%] w-[11px] h-[6px] border-t-[2.5px] border-[#2F5D2A] rounded-t-full" />
                    <span className="absolute top-[30%] right-[17%] w-[11px] h-[6px] border-t-[2.5px] border-[#2F5D2A] rounded-t-full" />
                    {/* 害羞腮红 */}
                    <span className="absolute top-[48%] left-[8%] w-[9px] h-[5px] rounded-full bg-[#FF9FB2]/85" />
                    <span className="absolute top-[48%] right-[8%] w-[9px] h-[5px] rounded-full bg-[#FF9FB2]/85" />
                  </div>
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#FF8FAB] text-white text-[10px] font-black px-2 py-[1px] rounded-full border-2 border-white shadow whitespace-nowrap select-none">
                    妈妈
                  </div>
                </div>
              </div>
              <div className="absolute z-20 pointer-events-none"
                style={{ left: `${mamaPad.x}%`, top: mamaPad.y - 96, transform: 'translateX(-50%)' }}>
                <div className="bg-white/95 px-2 py-0.5 rounded-xl border-2 border-[#FF8FAB] text-[10px] font-black text-[#D14D72] whitespace-nowrap animate-float-y">
                  {phase === 'hug' || phase === 'over' ? '我的宝贝！💕' : MAMA_CHEERS[Math.min(currentPad?.layer ?? 0, MAMA_CHEERS.length - 1)]}
                </div>
              </div>
            </>
          )}

          {/* 小青蛙主角（站在当前荷叶上，抛物线跳跃） */}
          <div className="absolute z-30 select-none pointer-events-none"
            style={{ left: `${frogPos.x}%`, top: frogPos.y, transform: 'translate(-50%, -70%)' }}>
            <div
              className={jump ? 'frog-hop' : 'animate-float-y'}
              style={jump
                ? ({ '--jx': `${jump.dx}px`, '--jy': `${jump.dy}px` } as React.CSSProperties)
                : phase === 'hug' || phase === 'over'
                ? { animation: 'hugPulse .7s ease-in-out infinite' }
                : undefined}
            >
              <span
                key={`scare-${scareKey}`}
                className={`inline-block text-4xl md:text-[42px] drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)] ${scareKey > 0 && !jump ? 'animate-frog-scare' : ''}`}
                style={{ transform: `rotate(${tilt}deg)` }}
              >
                {phase === 'blocked' ? '😳' : '🐸'}
              </span>
            </div>
            {phase === 'choosing' && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#FFF8EC]/95 text-[#5B4636] text-[10px] font-black px-2.5 py-1 rounded-xl border-2 border-[#FFC94D] shadow animate-bounce-soft">
                按 ⬅ ➡ 选荷叶
              </div>
            )}
            {phase === 'blocked' && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#FFE3E3] text-[#E0633A] text-[10px] font-black px-2.5 py-1 rounded-xl border-2 border-[#FFC1B1] shadow animate-bounce-soft">
                😳 此路不通！按 ⌫ 退回
              </div>
            )}
          </div>

          {/* 落地涟漪 */}
          {ripples.map(r => (
            <div key={r.id} className="absolute z-40 pointer-events-none" style={{ left: `${r.x}%`, top: r.y }}>
              {[0, 0.16, 0.32].map((delay, i) => (
                <span key={i} className="absolute rounded-full border-4 border-[#BFE3F7]/90"
                  style={{ width: 58, height: 20, left: -29, top: -10, animation: `splashRing .85s ease-out ${delay}s forwards` }} />
              ))}
              <span className="absolute text-xl" style={{ left: -9, top: -32, animation: 'splashRing .85s ease-out forwards' }}>💦</span>
            </div>
          ))}

          {/* 拥抱爱心 */}
          {hearts.map(h => (
            <span key={h.id} className="absolute text-3xl z-40 animate-heart-pop select-none pointer-events-none" style={{ left: `${h.x}%`, top: h.y }}>
              {['❤️', '💗', '💖'][Math.floor(h.x) % 3]}
            </span>
          ))}

          {/* 顶部目标词区域（半透明底板 + TypedWord lg + 中文 + 第X跳） */}
          <div className="absolute top-2 inset-x-0 flex justify-center z-40 pointer-events-none px-14">
            <div className="bg-[#FFF8EC]/95 rounded-2xl border-3 border-[#FFC94D] shadow-[0_4px_0_rgba(40,30,10,0.4)] px-4 py-1.5 flex flex-col items-center min-w-[240px]">
              {phase === 'blocked' ? (
                <>
                  <span className="text-[11px] font-black text-[#E0633A]">🚫 这片荷叶没有去路啦</span>
                  <span className="text-xs font-black text-[#5B4636] font-kids mt-0.5">按 ⌫ 或 ⬅ 退回去，换个方向再出发！</span>
                </>
              ) : phase === 'hug' || phase === 'over' ? (
                <>
                  <span className="text-[11px] font-black text-[#E0678A]">找到妈妈啦</span>
                  <span className="text-sm font-black text-[#5B4636] font-kids mt-0.5">青蛙妈妈给了宝宝一个大大的拥抱 💕</span>
                </>
              ) : selPad && (phase === 'typing' || phase === 'jumping') ? (
                <>
                  <span className="text-[11px] font-black text-[#8A6F5C]">
                    第{jumpsDone + 1}跳 · {selPad.item.display}{selPad.id === map?.mamaId ? ' 🌸 抱抱妈妈!' : ''}
                  </span>
                  <TypedWord word={selPad.item.typing.toLowerCase()} typedLen={typedLen} size="lg" className="mt-0.5" />
                </>
              ) : (
                <>
                  <span className="text-[11px] font-black text-[#8A6F5C]">第{jumpsDone + 1}跳 · 前面有 {targets.length} 条路</span>
                  <span className="text-sm font-black text-[#5B4636] font-kids mt-0.5">按 ⬅ ➡ 选一片荷叶出发！</span>
                </>
              )}
            </div>
          </div>

          <ScoreLayer />

          {phase === 'over' && (
            <ResultModal
              title="太棒啦！小青蛙找到妈妈了！"
              emoji="🐸💕🐸"
              score={score}
              coins={wordsDone * 3}
              combo={maxCombo}
              stars={calcStars(score, 330)}
              replay={newRound}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>

      <div className="w-full story-card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#8A6F5C] font-bold flex items-center gap-1.5">
          <span>💡</span> 开场就能看到整张地图：虚线是路，走到妈妈🐸要 5 跳！⬅ ➡ 选荷叶 → 敲对单词跳过去；遇到 🚫 死路别灰心，按 ⌫ 退回去换条路，勇敢探索吧！
        </div>
        <div className="flex items-center gap-3">
          <button onClick={newRound} className="btn-candy btn-grass px-5 py-2.5 text-xs">🗺️ 换一张地图</button>
          <BackButton onBack={onBack} label="返回选择" />
        </div>
      </div>
    </div>
  );
};

export default FrogMazeGame;
