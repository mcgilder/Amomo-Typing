
import React from 'react';
import { KEYBOARD_LAYOUT, FINGER_MAPPING } from '../constants';

interface KeyboardProps {
  targetKey: string;
}

const Keyboard: React.FC<KeyboardProps> = ({ targetKey }) => {
  const normalizedTarget = targetKey.toUpperCase();

  // 马卡龙糖果配色（与全局奶油绘本风统一）
  const getFingerColor = (key: string) => {
    const mapping = FINGER_MAPPING[key.toUpperCase()];
    if (!mapping) return { bg: 'bg-white', border: 'border-[#EADBC2]', text: 'text-[#8A6F5C]', active: 'bg-[#FFC94D] border-[#E8A317]' };

    switch (mapping.finger) {
      case '小指': return { bg: 'bg-[#FFE9F0]', border: 'border-[#FFD3E0]', text: 'text-[#D14D72]', active: 'bg-[#FF8FAB] border-[#E0678A]' };
      case '无名指': return { bg: 'bg-[#FFE9E0]', border: 'border-[#FFD1BE]', text: 'text-[#E0633A]', active: 'bg-[#FF8A5C] border-[#E0633A]' };
      case '中指': return { bg: 'bg-[#E5F6EC]', border: 'border-[#C8EED4]', text: 'text-[#357F43]', active: 'bg-[#6BCB77] border-[#48A757]' };
      case '食指': return { bg: 'bg-[#E3F2FA]', border: 'border-[#BBE2F2]', text: 'text-[#2E93C4]', active: 'bg-[#4FB8E7] border-[#2E93C4]' };
      case '大拇指': return { bg: 'bg-[#F3E9FA]', border: 'border-[#E2D0F2]', text: 'text-[#8258C7]', active: 'bg-[#A57DE0] border-[#8258C7]' };
      default: return { bg: 'bg-white', border: 'border-[#EADBC2]', text: 'text-[#8A6F5C]', active: 'bg-[#FFC94D] border-[#E8A317]' };
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 p-5 story-card select-none">
      {KEYBOARD_LAYOUT.map((row, rowIndex) => (
        <div key={rowIndex} className={`flex gap-2 ${rowIndex === 1 ? 'ml-5' : rowIndex === 2 ? 'ml-10' : ''}`}>
          {row.map((key) => {
            const isTarget = normalizedTarget === key;
            const mapping = FINGER_MAPPING[key];
            const colors = getFingerColor(key);

            return (
              <div
                key={key}
                data-key={key}
                className={`
                  relative w-11 h-10 md:w-14 md:h-12 flex items-center justify-center rounded-xl text-xl md:text-2xl font-bold border-b-[5px] transition-all duration-150
                  ${isTarget ? `${colors.active} scale-110 shadow-lg z-10 text-white -translate-y-1 animate-pulse` : `${colors.bg} ${colors.text} ${colors.border} hover:brightness-97`}
                `}
              >
                {key}
                {isTarget && mapping && (
                  <div className="absolute -top-12 flex flex-col items-center animate-bounce z-20">
                    <span className={`text-white text-xs md:text-sm px-3 py-1 rounded-full shadow-md whitespace-nowrap font-kids ${colors.active}`}>
                      {mapping.hand === 'left' ? '左手' : '右手'} {mapping.finger}
                    </span>
                    <div className={`w-2 h-2 rotate-45 -mt-1 shadow-md ${colors.active}`}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {/* 空格键 + 手指颜色提示（提示词在空格键右侧，水平中线对齐） */}
      <div className="flex items-center gap-4 mt-2">
        <div
          className={`
            w-48 h-10 md:w-72 md:h-12 rounded-xl flex items-center justify-center font-kids text-xl md:text-2xl border-b-[5px] transition-all
            ${normalizedTarget === ' ' ? 'bg-[#A57DE0] border-[#8258C7] scale-105 text-white shadow-lg -translate-y-1' : 'bg-white border-[#EADBC2] text-[#C4AE97]'}
          `}
        >
          空格键 [Space]
        </div>
        <div className="flex items-center gap-3 text-xs text-[#8A6F5C] font-kids">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#FF8FAB]"></div> 小指</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#FF8A5C]"></div> 无名指</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#6BCB77]"></div> 中指</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#4FB8E7]"></div> 食指</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#A57DE0]"></div> 大拇指</div>
        </div>
      </div>
    </div>
  );
};

export default Keyboard;
