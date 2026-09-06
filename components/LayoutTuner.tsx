import React from 'react';
import { playSoundEffect } from '../utils';

// ============ 🎛 排版调试面板（打字页） ============
// 用途：直接拖滑块实时调整打字页框体与元素的位置/字号，免去文字描述。
// 用法：左下角 🎛 按钮或 Ctrl+Shift+L 开关；调好后点「复制参数」把 JSON
// 发给开发即可固化进代码；「恢复默认」清空本机覆盖。
// 参数存 localStorage（amomo_typing_layout_tune_v1），仅本机生效。

export interface LayoutTune {
  offset: number;    // 单词组水平微调（叠加在 G 键对齐之上）
  phonetic: number;  // 音标字号
  trans: number;     // 单词中文翻译字号
  exEn: number;      // 例句英文字号
  exZh: number;      // 例句中文字号
  exCol: number;     // 例句区宽（12 列制中的列数）
  leftGap: number;   // 左栏纵向间距
  exGap: number;     // 例句区纵向间距
  cardMinH: number;  // 单词卡最小高度
}

export const TUNE_DEFAULTS: LayoutTune = {
  offset: 0,
  phonetic: 45,
  trans: 45,
  exEn: 57,
  exZh: 45,
  exCol: 5,
  leftGap: 6,
  exGap: 10,
  cardMinH: 228,
};

export const TUNE_LS_KEY = 'amomo_typing_layout_tune_v1';

export const loadTune = (): LayoutTune => {
  try {
    const raw = localStorage.getItem(TUNE_LS_KEY);
    if (raw) return { ...TUNE_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...TUNE_DEFAULTS };
};

export const saveTune = (t: LayoutTune) => {
  try { localStorage.setItem(TUNE_LS_KEY, JSON.stringify(t)); } catch { /* ignore */ }
};

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, value, min, max, step = 1, unit = 'px', onChange }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-black text-[#5B4636]">{label}</span>
      <span className="text-[11px] font-black text-[#8258C7] bg-[#F3E9FA] px-1.5 rounded">{value}{unit}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full accent-[#8258C7] cursor-pointer"
    />
  </div>
);

interface LayoutTunerProps {
  tune: LayoutTune;
  onChange: (t: LayoutTune) => void;
  onClose: () => void;
}

export const LayoutTuner: React.FC<LayoutTunerProps> = ({ tune, onChange, onClose }) => {
  const set = (patch: Partial<LayoutTune>) => onChange({ ...tune, ...patch });

  const copyConfig = async () => {
    const json = JSON.stringify(tune, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      playSoundEffect('victory', 0.2);
      window.alert('参数已复制到剪贴板！\n\n把它发给开发即可永久固化。\n（本机也已即时生效并保存）');
    } catch {
      window.prompt('复制下面这段参数发给开发：', json);
    }
  };

  const reset = () => {
    onChange({ ...TUNE_DEFAULTS });
    try { localStorage.removeItem(TUNE_LS_KEY); } catch { /* ignore */ }
    playSoundEffect('click', 0.15);
  };

  return (
    <div className="fixed bottom-20 left-3 z-[90] w-[268px] bg-white/97 rounded-2xl border-3 border-[#A57DE0] shadow-[0_10px_30px_rgba(90,50,150,0.25)] p-3 flex flex-col gap-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-[#8258C7] font-kids flex items-center gap-1.5">🎛 排版调试</span>
        <button onClick={onClose} className="w-6 h-6 rounded-lg bg-[#F3E9FA] text-[#8258C7] text-xs font-black flex items-center justify-center active:scale-90" title="关闭面板（Ctrl+Shift+L）">✕</button>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[52vh] overflow-y-auto pr-1">
        <SliderRow label="单词水平微调" value={tune.offset} min={-120} max={120} onChange={v => set({ offset: v })} />
        <SliderRow label="音标字号" value={tune.phonetic} min={28} max={64} onChange={v => set({ phonetic: v })} />
        <SliderRow label="单词中文字号" value={tune.trans} min={28} max={64} onChange={v => set({ trans: v })} />
        <SliderRow label="例句英文字号" value={tune.exEn} min={36} max={84} onChange={v => set({ exEn: v })} />
        <SliderRow label="例句中文字号" value={tune.exZh} min={28} max={64} onChange={v => set({ exZh: v })} />
        <SliderRow label="例句区宽度（列）" value={tune.exCol} min={3} max={8} onChange={v => set({ exCol: v })} unit="列" />
        <SliderRow label="左栏纵向间距" value={tune.leftGap} min={0} max={24} onChange={v => set({ leftGap: v })} />
        <SliderRow label="例句区间距" value={tune.exGap} min={0} max={24} onChange={v => set({ exGap: v })} />
        <SliderRow label="卡片最小高度" value={tune.cardMinH} min={180} max={320} onChange={v => set({ cardMinH: v })} />
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t-2 border-[#F3E9FA]">
        <button onClick={copyConfig} className="btn-candy btn-grape flex-1 py-1.5 text-xs">📋 复制参数</button>
        <button onClick={reset} className="btn-candy bg-white text-[#8A6F5C] shadow-[0_3px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-2.5 py-1.5 text-xs border-2 border-[#F0E4D2]">↺ 默认</button>
      </div>
      <p className="text-[9px] text-[#C4AE97] font-bold leading-snug">调好后把参数发给开发固化；参数只在本机即时生效。</p>
    </div>
  );
};

export default LayoutTuner;
