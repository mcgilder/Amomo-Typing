import React, { useEffect, useState } from 'react';
import { playSoundEffect } from '../utils';

// ============ 🎛 排版调试面板 v3（打字页） ============
// 两层能力：
// 1) 预设目标：点选 9 个常用元素（可多选），滑块批量调字号/位置
// 2) 任意元素：开启"选取元素"后，页面上任何框体/字符/图案都能点选，
//    单独调字号/水平/垂直/文字颜色；每处调整生成一条持久 CSS 规则
// 「复制参数」导出全部 JSON 发开发固化；参数存 localStorage v3。

export interface TargetTune {
  fs?: number;
  dx?: number;
  dy?: number;
  gap?: number;
  pad?: number;
  minH?: number;
}
export interface PickRule {
  id: string;
  sel: string;
  name: string;
  css: Record<string, string>;   // 属性 → 值（不含 !important，注入时统一加）
}
export interface LayoutTune {
  exCol: number;
  t: Record<string, TargetTune>;
  picks: PickRule[];
}

export const TUNE_LS_KEY = 'amomo_typing_layout_tune_v3';

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
      return { exCol: p.exCol ?? 5, t: p.t || {}, picks: Array.isArray(p.picks) ? p.picks : [] };
    }
  } catch { /* ignore */ }
  return { exCol: 5, t: {}, picks: [] };
};

export const saveTune = (t: LayoutTune) => {
  try { localStorage.setItem(TUNE_LS_KEY, JSON.stringify(t)); } catch { /* ignore */ }
};

interface LayoutTunerProps {
  tune: LayoutTune;
  setTune: (t: LayoutTune) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  pickMode: boolean;
  onTogglePickMode: () => void;
  activePickId: string | null;
  onRemovePick: (id: string) => void;
  onClose: () => void;
}

export const LayoutTuner: React.FC<LayoutTunerProps> = ({
  tune, setTune, selected, setSelected, pickMode, onTogglePickMode, activePickId, onRemovePick, onClose
}) => {
  const [fsDelta, setFsDelta] = useState(0);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [gapDelta, setGapDelta] = useState(0);
  const [padDelta, setPadDelta] = useState(0);
  const [minH, setMinH] = useState<number>(tune.t.card?.minH ?? 228);
  // 任意元素编辑滑块（初始化自该元素的规则值）
  const [pickFs, setPickFs] = useState(16);
  const [pickMl, setPickMl] = useState(0);
  const [pickMt, setPickMt] = useState(0);
  const [pickColor, setPickColor] = useState<string | null>(null);

  useEffect(() => {
    setFsDelta(0); setPosX(0); setPosY(0); setGapDelta(0); setPadDelta(0);
    setMinH(tune.t.card?.minH ?? 228);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join('|')]);

  // 切换正在编辑的任意元素时，滑块初始化为该元素当前规则值
  const activePick = tune.picks.find(r => r.id === activePickId) || null;
  useEffect(() => {
    if (activePick) {
      setPickFs(activePick.css['font-size'] ? parseFloat(activePick.css['font-size']) : 16);
      setPickMl(activePick.css['margin-left'] ? parseFloat(activePick.css['margin-left']) : 0);
      setPickMt(activePick.css['margin-top'] ? parseFloat(activePick.css['margin-top']) : 0);
      setPickColor(activePick.css['color'] || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePickId]);

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

  // ===== 任意元素的规则编辑 =====
  const updatePickCss = (patch: Record<string, string | null>) => {
    if (!activePick) return;
    const picks = tune.picks.map(r => {
      if (r.id !== activePick.id) return r;
      const css = { ...r.css };
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null) delete css[k]; else css[k] = v;
      });
      return { ...r, css };
    });
    setTune({ ...tune, picks });
  };

  const row = (label: string, node: React.ReactNode, dim = false) => (
    <div className={`flex flex-col gap-0.5 ${dim ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-[#5B4636]">{label}</span>
      </div>
      {node}
    </div>
  );

  const slider = (min: number, max: number, value: number, onChange: (v: number) => void, unit = 'px') => (
    <div className="flex items-center gap-1.5">
      <input type="range" min={min} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-[#8258C7] cursor-pointer" />
      <span className="text-[11px] font-black text-[#8258C7] w-11 text-right">{value}{unit}</span>
    </div>
  );

  return (
    <div className="fixed bottom-20 left-3 z-[90] w-[280px] bg-white/97 rounded-2xl border-3 border-[#A57DE0] shadow-[0_10px_30px_rgba(90,50,150,0.25)] p-3 flex flex-col gap-2 animate-fade-in" id="tune-panel">
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-[#8258C7] font-kids flex items-center gap-1.5">🎛 排版调试</span>
        <button onClick={onClose} className="w-6 h-6 rounded-lg bg-[#F3E9FA] text-[#8258C7] text-xs font-black flex items-center justify-center active:scale-90" title="关闭面板（Ctrl+Shift+L）">✕</button>
      </div>

      <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto pr-1">
        {/* ===== 任意元素选取 ===== */}
        <div className={`rounded-xl p-2 border-2 transition-all ${pickMode ? 'border-[#FF8A5C] bg-[#FFF3ED]' : 'border-[#EADBC2] bg-[#FFFBF5]'}`}>
          <button
            onClick={() => { onTogglePickMode(); playSoundEffect('click', 0.12); }}
            className={`w-full py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
              pickMode ? 'bg-[#FF8A5C] text-white shadow-[0_2px_0_#E0633A]' : 'bg-white text-[#8A6F5C] border-2 border-[#FFE8C8] hover:border-[#FF8A5C]'
            }`}
          >
            {pickMode ? '🎯 选取中——点页面任意元素' : '🎯 选取元素（任何框体/字符/图案）'}
          </button>
          {pickMode && (
            <p className="text-[10px] font-bold text-[#E0633A] mt-1 leading-snug">点页面上的元素即可选中并调整；再点别处切换。</p>
          )}

          {activePick && (
            <div className="mt-2 flex flex-col gap-1.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-[#E0633A]">✏️ {activePick.name}</span>
                <button onClick={() => onRemovePick(activePick.id)} className="text-[10px] font-black text-[#E0678A] hover:underline">删除调整</button>
              </div>
              {row('字号', slider(10, 120, pickFs, v => { setPickFs(v); updatePickCss({ 'font-size': v + 'px' }); }))}
              {row('水平位置', slider(-80, 80, pickMl, v => { setPickMl(v); updatePickCss({ 'margin-left': v + 'px' }); }))}
              {row('垂直位置', slider(-80, 80, pickMt, v => { setPickMt(v); updatePickCss({ 'margin-top': v + 'px' }); }))}
              {row('文字颜色',
                <div className="flex items-center gap-1">
                  {['#5B4636', '#2E93C4', '#48A757', '#E0633A', '#8258C7', '#E0678A'].map(c => (
                    <button key={c} onClick={() => { setPickColor(c); updatePickCss({ 'color': c }); }}
                      className={`w-5 h-5 rounded-full border-2 transition-all active:scale-90 ${pickColor === c ? 'border-[#5B4636] scale-110' : 'border-white'}`}
                      style={{ background: c }} title={c} />
                  ))}
                  <button onClick={() => { setPickColor(null); updatePickCss({ 'color': null }); }}
                    className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-lg border-2 ${pickColor ? 'bg-white text-[#8A6F5C] border-[#EADBC2]' : 'bg-[#5B4636] text-white border-[#5B4636]'}`}>默认</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== 预设目标批量调整 ===== */}
        <div className="bg-[#FAF5FF] rounded-xl p-2 border-2 border-[#E2D0F2]">
          <p className="text-[10px] font-black text-[#8258C7] leading-snug">
            常用元素（点标签多选，滑块批量调；也可直接点页面元素）
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
            <span className="text-[10px] font-black text-[#357F43]">已选 {selected.length} 个</span>
            {selected.length > 0 && (
              <button onClick={clearSelected} className="text-[10px] font-black text-[#E0678A] hover:underline">清除所选调整</button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {row(
            `字号增减${hasFs ? '' : '（所选无可调字号的元素）'}`,
            <input type="range" min={-24} max={40} step={1} value={fsDelta}
              onChange={e => { const v = Number(e.target.value); setFsDelta(v); applyFs(v); }}
              className={`w-full accent-[#8258C7] cursor-pointer ${!hasFs ? 'opacity-30 pointer-events-none' : ''}`} />,
            !hasFs
          )}
          {row('水平位置',
            <input type="range" min={-80} max={80} step={1} value={posX}
              onChange={e => { const v = Number(e.target.value); setPosX(v); applyPos(v, posY); }}
              className={`w-full accent-[#8258C7] cursor-pointer ${!hasText ? 'opacity-30 pointer-events-none' : ''}`} />,
            !hasText
          )}
          {row('垂直位置',
            <input type="range" min={-60} max={60} step={1} value={posY}
              onChange={e => { const v = Number(e.target.value); setPosY(v); applyPos(posX, v); }}
              className={`w-full accent-[#8258C7] cursor-pointer ${!hasText ? 'opacity-30 pointer-events-none' : ''}`} />,
            !hasText
          )}
          {row(
            `框体内间距${hasGap ? '' : '（所选无可调间距的框体）'}`,
            <input type="range" min={-6} max={16} step={1} value={gapDelta}
              onChange={e => { const v = Number(e.target.value); setGapDelta(v); applyGap(v); }}
              className={`w-full accent-[#8258C7] cursor-pointer ${!hasGap ? 'opacity-30 pointer-events-none' : ''}`} />,
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
          onClick={() => { setTune({ exCol: 5, t: {}, picks: [] }); try { localStorage.removeItem(TUNE_LS_KEY); } catch {} playSoundEffect('click', 0.15); }}
          className="btn-candy bg-white text-[#8A6F5C] shadow-[0_3px_0_#E5D9C8] active:shadow-[0_1px_0_#E5D9C8] px-2.5 py-1.5 text-xs border-2 border-[#F0E4D2]"
        >↺ 全部默认</button>
      </div>
    </div>
  );
};

export default LayoutTuner;
