import React, { useEffect, useState } from 'react';
import { playSoundEffect } from '../utils';

// ============ 🎛 排版调试面板 v2（打字页） ============
// 直接在页面上点选要调整的元素（可多选），再用滑块批量调整字号/位置。
// 开关：左下角 🎛 按钮或 Ctrl+Shift+L；「复制参数」导出 JSON 发开发固化。
// 参数存 localStorage（amomo_typing_layout_tune_v2）。

export interface TargetTune {
  fs?: number;   // 字号（px）
  dx?: number;   // 水平偏移
  dy?: number;   // 垂直偏移
  gap?: number;  // 框体内间距（容器类）
  pad?: number;  // 内边距（卡片）
  minH?: number; // 最小高度（卡片）
}
export interface LayoutTune {
  exCol: number;                    // 例句区宽（12 列制中的列数）
  t: Record<string, TargetTune>;    // 各元素的自定义
}

export const TUNE_LS_KEY = 'amomo_typing_layout_tune_v2';

// 可调元素清单（id → 名称 / 基准字号 / 基准间距）
export const TUNE_TARGETS: Record<string, { name: string; baseFs?: number; baseGap?: number }> = {
  word:     { name: '要打的单词', baseFs: 96 },
  phonetic: { name: '音标', baseFs: 45 },
  trans:    { name: '单词中文', baseFs: 45 },
  exEn:     { name: '例句英文', baseFs: 57 },
  exZh:     { name: '例句中文', baseFs: 45 },
  pill:     { name: '空格提示条' },
  leftCol:  { name: '左栏框体', baseGap: 6 },
  exArea:   { name: '例句区框体', baseGap: 10 },
  card:     { name: '单词卡框体' },
};

export const loadTune = (): LayoutTune => {
  try {
    const raw = localStorage.getItem(TUNE_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { exCol: p.exCol ?? 5, t: p.t || {} };
    }
  } catch { /* ignore */ }
  return { exCol: 5, t: {} };
};

export const saveTune = (t: LayoutTune) => {
  try { localStorage.setItem(TUNE_LS_KEY, JSON.stringify(t)); } catch { /* ignore */ }
};

interface LayoutTunerProps {
  tune: LayoutTune;
  setTune: (t: LayoutTune) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  onClose: () => void;
}

export const LayoutTuner: React.FC<LayoutTunerProps> = ({ tune, setTune, selected, setSelected, onClose }) => {
  const [fsDelta, setFsDelta] = useState(0);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [gapDelta, setGapDelta] = useState(0);
  const [padDelta, setPadDelta] = useState(0);
  const [minH, setMinH] = useState<number>(tune.t.card?.minH ?? 228);

  // 选择变化时滑块归零（基准切换）
  useEffect(() => {
    setFsDelta(0); setPosX(0); setPosY(0); setGapDelta(0); setPadDelta(0);
    setMinH(tune.t.card?.minH ?? 228);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join('|')]);

  const hasFs = selected.some(id => TUNE_TARGETS[id]?.baseFs != null);
  const hasGap = selected.some(id => TUNE_TARGETS[id]?.baseGap != null);
  const hasCard = selected.includes('card');
  const hasText = selected.length > 0;

  const applyFs = (d: number) => {
    const t = { ...tune.t };
    selected.forEach(id => {
      const base = TUNE_TARGETS[id]?.baseFs;
      if (base == null) return;
      t[id] = { ...t[id], fs: Math.max(20, Math.min(120, base + d)) };
    });
    setTune({ ...tune, t });
  };
  const applyPos = (dx: number, dy: number) => {
    const t = { ...tune.t };
    selected.forEach(id => {
      t[id] = { ...t[id], dx, dy };
    });
    setTune({ ...tune, t });
  };
  const applyGap = (d: number) => {
    const t = { ...tune.t };
    selected.forEach(id => {
      const base = TUNE_TARGETS[id]?.baseGap;
      if (base == null) return;
      t[id] = { ...t[id], gap: Math.max(0, Math.min(32, base + d)) };
    });
    setTune({ ...tune, t });
  };
  const clearSelected = () => {
    const t = { ...tune.t };
    selected.forEach(id => delete t[id]);
    setTune({ ...tune, t });
    playSoundEffect('click', 0.12);
  };

  const toggleChip = (id: string) => {
    playSoundEffect('click', 0.1);
    setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const row = (label: string, node: React.ReactNode, dim = false) => (
    <div className={`flex flex-col gap-0.5 ${dim ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-[#5B4636]">{label}</span>
      </div>
      {node}
    </div>
  );

  return (
    <div className="fixed bottom-20 left-3 z-[90] w-[280px] bg-white/97 rounded-2xl border-3 border-[#A57DE0] shadow-[0_10px_30px_rgba(90,50,150,0.25)] p-3 flex flex-col gap-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-[#8258C7] font-kids flex items-center gap-1.5">🎛 排版调试</span>
        <button onClick={onClose} className="w-6 h-6 rounded-lg bg-[#F3E9FA] text-[#8258C7] text-xs font-black flex items-center justify-center active:scale-90" title="关闭面板（Ctrl+Shift+L）">✕</button>
      </div>

      {/* 选择器：页面点击 或 点下面的标签 */}
      <div className="bg-[#FAF5FF] rounded-xl p-2 border-2 border-[#E2D0F2]">
        <p className="text-[10px] font-black text-[#8258C7] leading-snug">
          👇 直接点页面上的元素选中（再点取消，可多选）
        </p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {Object.entries(TUNE_TARGETS).map(([id, meta]) => (
            <button
              key={id}
              onClick={() => toggleChip(id)}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-black transition-all active:scale-95 ${
                selected.includes(id) ? 'bg-[#FF8A5C] text-white shadow-[0_2px_0_#E0633A]' : 'bg-white text-[#8A6F5C] border border-[#EADBC2] hover:border-[#A57DE0]'
              }`}
            >
              {meta.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] font-black text-[#357F43]">
            已选 {selected.length} 个{selected.length > 0 && `：${selected.map(id => TUNE_TARGETS[id]?.name).join('、')}`}
          </span>
          {selected.length > 0 && (
            <button onClick={clearSelected} className="text-[10px] font-black text-[#E0678A] hover:underline">清除所选调整</button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 max-h-[44vh] overflow-y-auto pr-1">
        {row(
          `字号增减${hasFs ? '' : '（所选无可调字号的元素）'}`,
          <input type="range" min={-24} max={40} step={1} value={fsDelta}
            onChange={e => { const v = Number(e.target.value); setFsDelta(v); applyFs(v); }}
            className="w-full accent-[#8258C7] cursor-pointer" />,
          !hasFs
        )}
        {row('水平位置',
          <input type="range" min={-80} max={80} step={1} value={posX}
            onChange={e => { const v = Number(e.target.value); setPosX(v); applyPos(v, posY); }}
            className="w-full accent-[#8258C7] cursor-pointer" />,
          !hasText
        )}
        {row('垂直位置',
          <input type="range" min={-60} max={60} step={1} value={posY}
            onChange={e => { const v = Number(e.target.value); setPosY(v); applyPos(posX, v); }}
            className="w-full accent-[#8258C7] cursor-pointer" />,
          !hasText
        )}
        {row(
          `框体内间距${hasGap ? '' : '（所选无可调间距的框体）'}`,
          <input type="range" min={-6} max={16} step={1} value={gapDelta}
            onChange={e => { const v = Number(e.target.value); setGapDelta(v); applyGap(v); }}
            className="w-full accent-[#8258C7] cursor-pointer" />,
          !hasGap
        )}
        {row('卡片内边距',
          <input type="range" min={-8} max={16} step={1} value={padDelta}
            onChange={e => {
              const v = Number(e.target.value); setPadDelta(v);
              if (hasCard) {
                const t = { ...tune.t, card: { ...tune.t.card, pad: Math.max(6, Math.min(48, 20 + v)) } };
                setTune(t);
              }
            }}
            className={`w-full accent-[#8258C7] cursor-pointer ${!hasCard ? 'opacity-30 pointer-events-none' : ''}`} />,
          !hasCard
        )}
        {row('卡片最小高度',
          <input type="range" min={180} max={320} step={2} value={minH}
            onChange={e => {
              const v = Number(e.target.value); setMinH(v);
              if (hasCard) {
                const t = { ...tune.t, card: { ...tune.t.card, minH: v } };
                setTune(t);
              }
            }}
            className={`w-full accent-[#8258C7] cursor-pointer ${!hasCard ? 'opacity-30 pointer-events-none' : ''}`} />,
          !hasCard
        )}
        {row('例句区宽度（列）',
          <input type="range" min={3} max={8} step={1} value={tune.exCol}
            onChange={e => setTune({ ...tune, exCol: Number(e.target.value) })}
            className="w-full accent-[#8258C7] cursor-pointer" />
        )}
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t-2 border-[#F3E9FA]">
        <button
          onClick={async () => {
            const json = JSON.stringify(tune, null, 2);
            try {
              await navigator.clipboard.writeText(json);
              playSoundEffect('victory', 0.2);
              window.alert('参数已复制到剪贴板！把它发给开发即可永久固化。\n（本机也已即时生效并保存）');
            } catch {
              window.prompt('复制下面这段参数发给开发：', json);
            }
          }}
          className="btn-candy btn-grape flex-1 py-1.5 text-xs"
        >📋 复制参数</button>
        <button
          onClick={() => { setTune({ exCol: 5, t: {} }); try { localStorage.removeItem(TUNE_LS_KEY); } catch {} playSoundEffect('click', 0.15); }}
          className="btn-candy bg-white text-[#8A6F5C] shadow-[0_3px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-2.5 py-1.5 text-xs border-2 border-[#F0E4D2]"
        >↺ 全部默认</button>
      </div>
    </div>
  );
};

export default LayoutTuner;
