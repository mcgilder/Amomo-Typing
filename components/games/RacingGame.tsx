import React, { useState, useRef, useCallback, useEffect } from 'react';
import { playSoundEffect } from '../../utils';
import {
  BaseGameProps, GameItem, useWordPool, useKeyDown, useRafLoop, useDifficulty,
  TypedWord, ScorePill, ComboFlame, useFloatScores,
  ResultModal, GameHeader, GameBoard, BackButton, calcStars, speakGameWord
} from './shared';

// ============ 🏎️ 闪避赛车 · 横版竞速打字（60fps rAF 版） ============
// 玩法：侧视横版赛道，单词热气球飞进来悬在上空，敲完单词点燃氮气狂飙！
// ↑↓ 键换道躲油桶（每 1~2 词一个油桶），1000 米终点前追上蓝色对手车！
// 对手会"动态追逐"：你打字快它就放慢等你追，你停手它就渐渐提速甩开你。
// （铁律：方向键只管移动，字母键只管打字）
//
// 帧率方案（10fps → 60fps）：
// 1. 位置/速度/对手/油桶等运动状态全部存 worldRef（不进 state）；
// 2. useRafLoop 每帧按 dt 毫秒步进物理（km/h → m/ms：speed*dt/3600）；
// 3. 每帧 setState 一个轻量"帧快照"（位置/对手/速度/油桶）触发渲染；
// 4. 车辆/油桶/终点线全部 transform: translate3d 定位（GPU 合成、零重排）；
// 5. 云/远山/路边/路面虚线四层视差滚动改为 rAF 直写 DOM transform，
//    彻底消灭 CSS animation-duration 实时改值造成的跳帧。

const RACE_LENGTH = 1000;    // 终点里程（米）
const BASE_SPEED = 42;        // 基础巡航 km/h（不敲字会输给对手！）
const NITRO_SPEED = 115;      // 氮气狂飙 km/h
const OPP_BASE = 50;          // 对手蓝车基准速度（实际按橡皮筋动态调整）
const CAR_X = 25;             // 玩家固定屏幕横向位置（%）
const METER_PCT = 0.35;       // 世界比例：每米 = 屏幕宽的 0.35%
const OPP_HEAD_START = 35;    // 对手发车领先优势（米）：开局就在前，你追我赶

// 三条泳道纵向位置（马路容器内 %，中心点）：上 / 中 / 下
// 上道从 16% 下移到 19%：避免贴近马路上沿被路肩/圆角裁切遮挡
const LANE_IN = [19, 50, 81];
// 近大远小：下道最近最大，上道最远最小
const LANE_SCALE = [0.82, 1, 1.14];

// 视差滚动速率（px / ms / km/h）：云最慢 → 路面虚线最快
const SCROLL_PX = { cloud: 0.000167, mountain: 0.00062, roadside: 0.00368, dash: 0.00311 };
// 各层单组内容宽度（px），位移取模无缝循环
const SET_W = { cloud: 900, mountain: 1300, roadside: 1104, dash: 84 };

interface Barrel {
  id: number;
  lane: 0 | 1 | 2;
  x: number; // 屏幕横向位置（%），从右侧 110 滚向左侧
}

interface RoadSign {
  id: number;
  item: GameItem;
  typed: string;
}

interface World {
  position: number;    // 玩家里程（米）
  oppPos: number;      // 对手里程（米）
  speed: number;       // 当前速度
  targetSpeed: number; // 目标速度
  oppSpeed: number;    // 对手当前速度（动态追逐）
  oppT: number;        // 对手速度波动时钟（原 100ms tick 数）
  barrels: Barrel[];
  wordsDone: number;   // 已敲完单词数
  nextBarrelAt: number;// 下次生成油桶的词数阈值（1~2 词一个）
  signX: number;       // 单词热气球横向位置（%）：从右侧飞入悬停
}

const freshWorld = (): World => ({
  position: 0, oppPos: OPP_HEAD_START, speed: BASE_SPEED, targetSpeed: BASE_SPEED,
  oppSpeed: OPP_BASE, oppT: 0, barrels: [], wordsDone: 0,
  nextBarrelAt: 1 + Math.floor(Math.random() * 2), signX: 112,
});

// 每帧推给 React 的轻量快照（渲染只读它，物理只写 worldRef）
interface FrameView {
  position: number;
  oppPos: number;
  speed: number;
  oppSpeed: number;
  barrels: Barrel[];
  signX: number;
}

// 远景山峦（慢层）
const MOUNTAINS = ['⛰️', '🏔️', '⛰️', '🏔️', '⛰️', '⛰️', '🏔️', '⛰️', '⛰️', '🏔️'];
// 中景路边：树 + 路灯
const ROADSIDE = ['🌳', '🏮', '🌳', '🌳', '🏡', '🌳', '🌻', '🏮', '🌳', '🏫', '🌳', '🌷'];
// 云朵（最慢层）
const CLOUDS = ['☁️', '☁️', '🌤️', '☁️', '☁️'];
// 速度线固定点位（避免每次渲染随机抖动）
const SPEED_STREAKS = [
  { top: '5%', w: 110, dur: 0.4, delay: 0 },
  { top: '12%', w: 70, dur: 0.34, delay: 0.18 },
  { top: '20%', w: 90, dur: 0.45, delay: 0.05 },
  { top: '30%', w: 60, dur: 0.38, delay: 0.26 },
  { top: '62%', w: 80, dur: 0.42, delay: 0.12 },
  { top: '72%', w: 100, dur: 0.36, delay: 0.3 },
  { top: '82%', w: 65, dur: 0.44, delay: 0.08 },
  { top: '92%', w: 95, dur: 0.37, delay: 0.22 },
];
const RIBBONS = [6, 18, 30, 42, 54, 66, 78, 90];

export const RacingGame: React.FC<BaseGameProps> = ({ wordList, onEarnCoins, onBack, difficulty }) => {
  const { speedMul } = useDifficulty(difficulty); // 难度：对手动态速度基准
  const pickWord = useWordPool(wordList);
  const [sign, setSign] = useState<RoadSign | null>(null);
  const [lane, setLane] = useState<0 | 1 | 2>(1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [nitro, setNitro] = useState(false);
  const [nitroKey, setNitroKey] = useState(0);
  const [crashKey, setCrashKey] = useState(0);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [view, setView] = useState<FrameView>({ position: 0, oppPos: 0, speed: BASE_SPEED, oppSpeed: OPP_BASE, barrels: [], signX: 112 });
  const [roadSize, setRoadSize] = useState({ w: 880, h: 232 });

  const { addScore, Layer: ScoreLayer } = useFloatScores();
  const boardRef = useRef<HTMLDivElement>(null);
  const roadRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<0 | 1 | 2>(1);
  const finishedRef = useRef(false);
  const nitroTokenRef = useRef(0);
  const worldRef = useRef<World>(freshWorld());
  // 视差滚动累计位移（px）
  const scrollRef = useRef({ cloud: 0, mountain: 0, roadside: 0, dash: 0 });
  // 四个滚动层的 DOM 直写句柄
  const cloudLayerRef = useRef<HTMLDivElement>(null);
  const mountainLayerRef = useRef<HTMLDivElement>(null);
  const roadsideLayerRef = useRef<HTMLDivElement>(null);
  const dashTopRef = useRef<HTMLDivElement>(null);
  const dashBottomRef = useRef<HTMLDivElement>(null);

  // 初始路牌
  useEffect(() => {
    setSign({ id: Date.now(), item: pickWord(), typed: '' });
  }, [pickWord]);

  // 赛道尺寸测量（translate3d 像素定位用；crashKey 重挂载后 ref 自动指向新节点）
  useEffect(() => {
    const update = () => {
      const el = roadRef.current;
      if (el && el.clientWidth > 0) setRoadSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const finishGame = useCallback((didWin: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    setWon(didWin);
    setNitro(false);
    worldRef.current.targetSpeed = BASE_SPEED;
    playSoundEffect(didWin ? 'victory' : 'car_horn', 0.3);
  }, []);

  // ====== 物理主循环（60fps rAF，dt 毫秒步进）======
  useRafLoop((dt) => {
    const w = worldRef.current;
    w.oppT += dt / 100;
    // 速度平滑趋近目标（等效原 0.22/100ms）
    w.speed += (w.targetSpeed - w.speed) * Math.min(1, dt * 0.0022);
    // 玩家前进：km/h → m/ms
    w.position += (w.speed * dt) / 3600;

    // ===== 对手橡皮筋追逐（你追我赶核心）=====
    // 以玩家实时速度为基准 + 距离差修正：对手领先越多开得越快、落后越多自动放慢，
    // 全程贴身缠斗——孩子必须持续敲词触发氮气才能完成超越，一停手就被反超
    const gapM = w.oppPos - w.position;
    const rubber = Math.max(-0.3, Math.min(0.26, gapM / 900));
    const baseNow = OPP_BASE * speedMul;
    let oppTarget = w.speed * (1 + rubber) * 0.985;  // 紧咬玩家同速：需要持续敲词拉开差距
    oppTarget = Math.max(baseNow * 0.72, Math.min(baseNow * 1.55, oppTarget));
    w.oppSpeed += (oppTarget - w.oppSpeed) * Math.min(1, dt * 0.0012);
    // 对手前进（速度轻微起伏，像真人开车）
    w.oppPos += (w.oppSpeed * (0.94 + Math.sin(w.oppT / 4) * 0.1) * dt) / 3600;

    // 单词热气球：从右侧飞入，悬停在赛道上空
    if (w.signX > 68) w.signX = Math.max(68, w.signX - dt * 0.03);

    // 油桶逼近 + 碰撞（等效原 0.028%/100ms）
    for (let i = w.barrels.length - 1; i >= 0; i--) {
      const b = w.barrels[i];
      b.x -= w.speed * 0.00028 * dt;
      if (b.x < -12) { w.barrels.splice(i, 1); continue; }
      if (b.lane === laneRef.current && b.x < 27 && b.x > 17) {
        w.barrels.splice(i, 1);
        // 撞油桶：减速 + 震屏
        w.speed = 26;
        w.targetSpeed = 26;
        setNitro(false);
        setCrashKey(k => k + 1);
        playSoundEffect('error', 0.32);
        setTimeout(() => playSoundEffect('pop', 0.16), 130);
        const board = boardRef.current?.getBoundingClientRect();
        if (board) addScore(board.width * 0.3, board.height * 0.5, '咚！减速', '#E0633A');
        setTimeout(() => {
          const ww = worldRef.current;
          if (ww.targetSpeed <= 26) ww.targetSpeed = BASE_SPEED;
        }, 1100);
      }
    }

    // 四层视差滚动：按当前速度累计位移，直写 DOM（零重排、零 animation 跳变）
    const sc = scrollRef.current;
    const v = Math.max(w.speed, 18);
    sc.cloud = (sc.cloud + v * SCROLL_PX.cloud * dt) % SET_W.cloud;
    sc.mountain = (sc.mountain + v * SCROLL_PX.mountain * dt) % SET_W.mountain;
    sc.roadside = (sc.roadside + v * SCROLL_PX.roadside * dt) % SET_W.roadside;
    sc.dash = (sc.dash + v * SCROLL_PX.dash * dt) % SET_W.dash;
    if (cloudLayerRef.current) cloudLayerRef.current.style.transform = `translate3d(${-sc.cloud}px,0,0)`;
    if (mountainLayerRef.current) mountainLayerRef.current.style.transform = `translate3d(${-sc.mountain}px,0,0)`;
    if (roadsideLayerRef.current) roadsideLayerRef.current.style.transform = `translate3d(${-sc.roadside}px,0,0)`;
    if (dashTopRef.current) dashTopRef.current.style.transform = `translate3d(${-sc.dash}px,0,0)`;
    if (dashBottomRef.current) dashBottomRef.current.style.transform = `translate3d(${-sc.dash}px,0,0)`;

    // 终点判定
    if (w.position >= RACE_LENGTH) { finishGame(true); return; }
    if (w.oppPos >= RACE_LENGTH) { finishGame(false); return; }

    // 轻量帧快照 → 触发渲染
    setView({ position: w.position, oppPos: w.oppPos, speed: w.speed, oppSpeed: w.oppSpeed, barrels: w.barrels.slice(), signX: w.signX });
  }, !finished);

  // ====== 敲完一个单词 → 氮气狂飙 ======
  const completeWord = useCallback(() => {
    const gained = 35 + combo * 6;
    setScore(s => s + gained);
    const nc = combo + 1;
    setCombo(nc);
    setMaxCombo(m => Math.max(m, nc));
    onEarnCoins?.(3);
    playSoundEffect('car_engine', 0.32);
    speakGameWord(sign?.item || { typing: '', display: '' }); // 打完单词语音朗读

    const w = worldRef.current;
    w.wordsDone += 1;

    // 氮气：速度115 + 火焰 + 镜头脉冲，持续 1.4 秒
    const token = ++nitroTokenRef.current;
    setNitro(true);
    setNitroKey(k => k + 1);
    w.targetSpeed = NITRO_SPEED;
    setTimeout(() => {
      if (nitroTokenRef.current !== token) return;
      setNitro(false);
      const ww = worldRef.current;
      if (ww.targetSpeed > BASE_SPEED) ww.targetSpeed = BASE_SPEED;
    }, 1400);

    // 飘分
    const board = boardRef.current?.getBoundingClientRect();
    if (board) addScore(board.width * 0.55, board.height * 0.2, `+${gained} ⚡`, '#2E93C4');

    // 障碍再翻倍：每完成 1 个单词就滚出油桶（强迫换道闪避）
    if (w.wordsDone >= w.nextBarrelAt) {
      w.nextBarrelAt = w.wordsDone + 1;
      const bl = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      w.barrels.push({ id: Date.now() + Math.random(), lane: bl, x: 110 });
      // 高概率再来第二个不同车道的油桶（连环闪避，封住"躺赢道"）
      if (Math.random() < 0.8) {
        const bl2 = (bl + 1 + Math.floor(Math.random() * 2)) % 3 as 0 | 1 | 2;
        w.barrels.push({ id: Date.now() + Math.random() + 1, lane: bl2, x: 118 });
      }
      playSoundEffect('whoosh', 0.14);
    }

    // 新单词：热气球从右侧重新飞入
    w.signX = 112;
    setSign({ id: Date.now(), item: pickWord(), typed: '' });
  }, [combo, addScore, onEarnCoins, pickWord, sign]);

  // ====== 换道：事件期直接由 laneRef 计算目标道并同步（updater 内赋 ref 是渲染期副作用，
  // ====== React 18 并发模式下可能延迟执行，导致真实键盘偶发"按了没反应"） ======
  const switchLane = useCallback((dir: -1 | 1) => {
    const nl = Math.max(0, Math.min(2, laneRef.current + dir)) as 0 | 1 | 2;
    if (nl === laneRef.current) return;
    laneRef.current = nl;
    setLane(nl);
    playSoundEffect('whoosh', 0.15);
  }, []);

  // ====== 键盘：↑↓/W/S 换道，字母只管打字 ======
  useKeyDown((e) => {
    if (finishedRef.current) return;
    const k = e.key;
    // ⚠️ 只用方向键换道：W/S 属于打字字母，会误触换道导致单词打不完
    if (k === 'ArrowUp') {
      e.preventDefault();
      switchLane(-1);
      return;
    }
    if (k === 'ArrowDown') {
      e.preventDefault();
      switchLane(1);
      return;
    }
    if (k.length === 1 && /[a-z]/i.test(k) && sign) {
      const c = k.toLowerCase();
      const target = sign.item.typing[sign.typed.length]?.toLowerCase();
      if (!target) return;
      if (c === target) {
        playSoundEffect('click', 0.16);
        const nt = sign.typed + c;
        if (nt.length >= sign.item.typing.length) {
          completeWord();
        } else {
          setSign(s => (s ? { ...s, typed: nt } : s));
        }
      } else {
        // 错字只清连击，不重罚
        playSoundEffect('error', 0.12);
        setCombo(0);
      }
    }
  }, [sign, completeWord, switchLane]);

  const restart = () => {
    worldRef.current = freshWorld();
    scrollRef.current = { cloud: 0, mountain: 0, roadside: 0, dash: 0 };
    nitroTokenRef.current++;
    finishedRef.current = false;
    laneRef.current = 1;
    setLane(1);
    setScore(0); setCombo(0); setMaxCombo(0);
    setNitro(false); setFinished(false); setWon(false); setCrashKey(0);
    setView({ position: 0, oppPos: 0, speed: BASE_SPEED, oppSpeed: OPP_BASE, barrels: [], signX: 112 });
    setSign({ id: Date.now(), item: pickWord(), typed: '' });
  };

  // ====== 渲染数据 ======
  const world = worldRef.current;
  const gap = view.oppPos - view.position;       // 正 = 兔子在前（屏幕右侧）
  const oppX = CAR_X + gap * METER_PCT;          // 对手屏幕横向位置（%）
  const oppVisible = oppX > -12 && oppX < 102;
  const finishX = CAR_X + (RACE_LENGTH - view.position) * METER_PCT; // 终点线位置（%）
  const progressPct = Math.min(100, (view.position / RACE_LENGTH) * 100);
  const oppPct = Math.min(100, (view.oppPos / RACE_LENGTH) * 100);

  // 赛道内像素坐标（translate3d 用）
  const laneY = (l: number) => (LANE_IN[l] / 100) * roadSize.h;
  const carXpx = (CAR_X / 100) * roadSize.w;
  const oppXpx = (oppX / 100) * roadSize.w;
  const finishXpx = (finishX / 100) * roadSize.w;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-5xl animate-fade-in mx-auto px-2">
      <style>{`
        @keyframes zoomPulse {
          0% { transform: scale(1); }
          28% { transform: scale(1.02); }
          60% { transform: scale(1.015); }
          100% { transform: scale(1); }
        }
        @keyframes barrelRoll {
          0%, 100% { transform: translateY(0) rotate(-7deg); }
          50% { transform: translateY(-5px) rotate(7deg); }
        }
      `}</style>

      <GameHeader emoji="🏎️" title="闪避赛车" tag="速度竞速" tagColor="bg-[#E3F2FA] text-[#2E93C4] border-[#BBE2F2]">
        <ScorePill icon="🛣️" label="里程" value={`${Math.floor(view.position)}m`} color="bg-[#E3F2FA] text-[#2E93C4] border-[#BBE2F2]" />
        <ScorePill icon="⚡" label="时速" value={`${Math.round(view.speed)}`} color="bg-[#FFF3D6] text-[#8A5F00] border-[#FFE3A3]" />
        <ScorePill icon="⭐" label="积分" value={score} />
        <ComboFlame combo={combo} />
      </GameHeader>

      {/* 里程进度条：双方位置一目了然 */}
      <div className="w-full story-card px-5 py-2.5">
        <div className="flex justify-between text-[11px] font-black text-[#8A6F5C] mb-1">
          <span>🏁 终点 1000m</span>
          <span>🏎️ {Math.floor(view.position)}m · 🚙 {Math.floor(view.oppPos)}m · {gap >= 0 ? `落后 ${Math.floor(gap)}m` : `领先 ${Math.floor(-gap)}m`}</span>
        </div>
        <div className="relative h-7 bg-[#F5EBDA] rounded-full border-2 border-[#EADBC2] overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,#FFF_0px,#FFF_14px,#FFD9E0_14px,#FFD9E0_28px)] opacity-50 w-full" />
          <div
            className="absolute -top-0.5 text-xl z-10 select-none"
            style={{ left: `calc(${oppPct}% - 12px)`, transform: 'scaleX(-1)' }}
            title="对手蓝车"
          >
            🚙
          </div>
          <div
            className="absolute -top-0.5 text-xl z-20 select-none"
            style={{ left: `calc(${progressPct}% - 12px)`, transform: 'scaleX(-1)' }}
            title="你"
          >
            🏎️
          </div>
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-0.5 text-sm z-30">🏁</div>
        </div>
      </div>

      <GameBoard
        key={crashKey}
        shake={crashKey > 0}
        className="h-[430px] bg-gradient-to-b from-[#7CC6EA] via-[#B4E1F5] to-[#C9E29B]"
      >
        <div ref={boardRef} className="absolute inset-0 overflow-hidden">
          {/* ===== 氮气镜头脉冲层：世界内容整体 zoom ===== */}
          <div
            key={`zoom-${nitroKey}`}
            className="absolute inset-0"
            style={nitro ? { animation: 'zoomPulse 1.4s ease-in-out' } : undefined}
          >
            {/* ---- 最慢层：云朵（rAF 直写位移） ---- */}
            <div className="absolute inset-x-0 top-0 h-[26%] overflow-hidden">
              <div ref={cloudLayerRef} className="absolute flex items-start will-change-transform">
                {[...CLOUDS, ...CLOUDS].map((c, i) => (
                  <span key={i} className="w-[180px] text-center text-3xl select-none opacity-80">{c}</span>
                ))}
              </div>
            </div>
            <span className="absolute left-[7%] top-[5%] text-4xl select-none animate-twinkle">☀️</span>
            <span className="absolute right-[16%] top-[10%] text-3xl select-none animate-twinkle" style={{ animationDelay: '.9s' }}>🌤️</span>

            {/* ---- 慢层：远山（rAF 直写位移） ---- */}
            <div className="absolute inset-x-0 top-[22%] h-[22%] overflow-hidden">
              <div ref={mountainLayerRef} className="absolute flex items-end will-change-transform">
                {[...MOUNTAINS, ...MOUNTAINS].map((m, i) => (
                  <span key={i} className="w-[130px] text-center text-5xl select-none opacity-60">{m}</span>
                ))}
              </div>
            </div>

            {/* ---- 中景草地 + 路边树 / 路灯（rAF 直写位移） ---- */}
            <div className="absolute inset-x-0 top-[36%] h-[12%] bg-gradient-to-b from-[#8ED66A] to-[#6FBF58]" />
            <div className="absolute inset-x-0 top-[27%] h-[12%] overflow-hidden">
              <div ref={roadsideLayerRef} className="absolute flex items-end will-change-transform">
                {[...ROADSIDE, ...ROADSIDE].map((t, i) => (
                  <span key={i} className="w-[92px] text-center text-3xl select-none">{t}</span>
                ))}
              </div>
            </div>

            {/* ---- 快层：马路（三泳道）---- */}
            <div ref={roadRef} className="absolute inset-x-0 top-[42%] bottom-[2.5%] mx-4 rounded-[1.4rem] border-4 border-[#8B7355]/50 overflow-hidden bg-[#64707A]">
              {/* 车道虚线：rAF 直写位移 = 速度感核心（宽度加长 168px 供滚动） */}
              <div
                ref={dashTopRef}
                className="absolute left-0 top-[33%] h-1.5 rounded-full will-change-transform"
                style={{ width: 'calc(100% + 168px)', background: 'repeating-linear-gradient(90deg, #FFD966 0 42px, transparent 42px 84px)' }}
              />
              <div
                ref={dashBottomRef}
                className="absolute left-0 top-[66%] h-1.5 rounded-full will-change-transform"
                style={{ width: 'calc(100% + 168px)', background: 'repeating-linear-gradient(90deg, #FFD966 0 42px, transparent 42px 84px)' }}
              />
              {/* 路肩高光 */}
              <div className="absolute inset-x-0 top-0 h-2 bg-white/15" />
              {/* 换道提示（铁律：↑↓ 换道，不是 A/S/D！） */}
              <div className="absolute left-3 top-1.5 text-[10px] font-black text-white/70 bg-black/25 px-2 py-0.5 rounded-lg">
                ↑↓ 换道
              </div>

              {/* 油桶障碍：从右侧滚来，近大远小（translate3d 定位） */}
              {view.barrels.map(b => (
                <div
                  key={b.id}
                  className="absolute z-20 left-0 top-0 will-change-transform"
                  style={{
                    transform: `translate3d(${(b.x / 100) * roadSize.w}px, ${laneY(b.lane)}px, 0) translate(-50%, -50%) scale(${LANE_SCALE[b.lane] * Math.max(0.55, 1.28 - b.x / 160)})`,
                    opacity: Math.min(1, (112 - b.x) / 16),
                  }}
                >
                  <div style={{ animation: 'barrelRoll 0.5s infinite ease-in-out' }}>
                    <span className="text-4xl select-none drop-shadow">🛢️</span>
                    <div className="w-10 h-1.5 bg-black/30 rounded-full mx-auto blur-[2px]" />
                  </div>
                </div>
              ))}

              {/* 终点线：接近时从右侧滑入（translate3d 定位） */}
              {finishX < 104 && (
                <div
                  className="absolute z-20 top-0 bottom-0 left-0 flex flex-col items-center will-change-transform"
                  style={{ transform: `translate3d(${finishXpx}px, 0, 0) translateX(-50%)` }}
                >
                  <span className="text-3xl select-none -mt-1">🏁</span>
                  <div
                    className="flex-1 w-3 rounded-b-lg"
                    style={{ background: 'repeating-linear-gradient(0deg,#3A3A3A 0 8px,#FFF 8px 16px)' }}
                  />
                </div>
              )}

              {/* 对手蓝车：按真实进度在赛道上移动，超车时从右侧掉到左后方 */}
              {oppVisible && (
                <div
                  className="absolute z-20 left-0 top-0 will-change-transform"
                  style={{ transform: `translate3d(${oppXpx}px, ${laneY(1)}px, 0) translate(-50%, -50%)` }}
                >
                  <div className="relative animate-float-y">
                    {/* 对手头顶名牌 */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[11px] font-black text-white bg-[#4FB8E7]/90 px-2 py-0.5 rounded-lg border border-white/60 whitespace-nowrap select-none">
                      蓝车 · {Math.round(view.oppSpeed)}km/h
                    </div>
                    <div className="text-4xl select-none drop-shadow-lg" style={{ transform: 'scaleX(-1)', filter: 'hue-rotate(175deg) saturate(1.35)' }}>🚙</div>
                    <div className="w-12 h-1.5 bg-black/25 rounded-full mx-auto blur-[2px] -mt-1" />
                    {Math.abs(gap) < 70 && (
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black text-white bg-[#A57DE0]/90 px-1.5 py-0.5 rounded-lg border border-white/50">
                        {gap > 0 ? `领先你 ${Math.floor(gap)}m` : `落后你 ${Math.floor(-gap)}m`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 玩家赛车：固定屏幕左侧 25%，车头朝右（emoji 默认朝左，必须翻转） */}
              <div
                className="absolute z-30 left-0 top-0 will-change-transform"
                style={{
                  transform: `translate3d(${carXpx}px, ${laneY(lane)}px, 0) translate(-50%, -50%) scale(${LANE_SCALE[lane]})`,
                  transition: 'transform 0.18s ease-out',
                }}
              >
                <div className="relative animate-car-rumble">
                  {/* 氮气火焰：从车尾喷出 */}
                  {nitro && (
                    <div className="absolute -left-16 top-3 flex items-center select-none">
                      <span className="text-3xl animate-nitro">🔥</span>
                      <span className="text-2xl animate-nitro">💨</span>
                      <span className="text-xl animate-nitro opacity-70">💨</span>
                    </div>
                  )}
                  <div className="text-5xl select-none drop-shadow-lg" style={{ transform: 'scaleX(-1)' }}>🏎️</div>
                  <div className="w-14 h-1.5 bg-black/30 rounded-full mx-auto blur-[2px] -mt-1" />
                </div>
                {nitro && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-black text-[#E0633A] bg-[#FFF3D6] px-2 py-0.5 rounded-lg border-2 border-[#FFC94D] animate-wiggle whitespace-nowrap select-none">
                    💥 氮气狂飙!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- 速度线：高速时屏幕边缘白色流光 ---- */}
          {view.speed > 80 && (
            <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
              {SPEED_STREAKS.map((s, i) => (
                <div
                  key={i}
                  className="absolute h-1 rounded-full bg-white/70"
                  style={{
                    width: s.w,
                    top: s.top,
                    left: '72%',
                    animation: `speedLines ${s.dur}s linear infinite`,
                    animationDelay: `${s.delay}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* ---- 单词热气球（打字目标）：从右侧飞入赛道上空悬停 ---- */}
          {sign && (
            <div
              className="absolute z-40 top-[5%] will-change-transform"
              style={{ left: `${view.signX}%`, transform: 'translateX(-50%)' }}
            >
              <div className="flex flex-col items-center animate-float-y">
                {/* 气球本体 */}
                <span className="text-3xl select-none drop-shadow-md">🎈</span>
                {/* 吊篮 = 单词牌 */}
                <div className="bg-white rounded-2xl border-4 border-[#4FB8E7] shadow-[0_5px_0_#2E93C4] px-4 py-1.5 flex flex-col items-center gap-0.5 -mt-1">
                  <span className="text-[11px] font-black text-[#8A6F5C] truncate max-w-[130px]">{sign.item.display}</span>
                  <TypedWord word={sign.item.typing} typedLen={sign.typed.length} size="md" />
                </div>
              </div>
            </div>
          )}

          <ScoreLayer />

          {/* 冲线彩带 */}
          {finished && won && (
            <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
              {RIBBONS.map((r, i) => (
                <span
                  key={i}
                  className="absolute text-2xl animate-confetti select-none"
                  style={{ left: `${r}%`, animationDelay: `${i * 0.09}s` }}
                >
                  {['🎉', '🎊', '🎀', '✨'][i % 4]}
                </span>
              ))}
            </div>
          )}

          {finished && (
            <ResultModal
              title={won ? '冠军冲线！彩虹车神！' : '兔子抢先冲线啦！再战！'}
              emoji={won ? '🏆' : '🐰'}
              score={score}
              coins={Math.max(3, world.wordsDone * 3)}
              combo={maxCombo}
              stars={calcStars(score, 900)}
              replay={restart}
              onBack={onBack}
            />
          )}
        </div>
      </GameBoard>

      <div className="w-full story-card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#8A6F5C] font-bold flex items-center gap-1.5">
          <span>💡</span> 敲对路牌单词点燃氮气狂飙！↑↓ 方向键换道躲油桶，1000 米内超越蓝车车手！
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => switchLane(-1)}
            className="btn-candy bg-white text-[#8A6F5C] shadow-[0_5px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-5 py-2.5 text-xs border-2 border-[#F0E4D2]"
          >
            ⬆ 上道
          </button>
          <button
            onClick={() => switchLane(1)}
            className="btn-candy bg-white text-[#8A6F5C] shadow-[0_5px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-5 py-2.5 text-xs border-2 border-[#F0E4D2]"
          >
            ⬇ 下道
          </button>
          <BackButton onBack={onBack} label="返回选择" />
        </div>
      </div>
    </div>
  );
};

export default RacingGame;
