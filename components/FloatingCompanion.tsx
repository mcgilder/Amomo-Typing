import React, { useState, useEffect } from 'react';
import { PetItem, PetAccessory } from '../types';
import { playSoundEffect } from '../utils';

interface FloatingCompanionProps {
  pet?: PetItem;
  accessory?: PetAccessory;
  combo: number;
  lastAction: 'correct' | 'error' | 'idle' | 'level_up' | 'victory' | null;
  customMessage?: string;
}

export const FloatingCompanion: React.FC<FloatingCompanionProps> = ({
  pet,
  accessory,
  combo,
  lastAction,
  customMessage
}) => {
  const [bubble, setBubble] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [motionAction, setMotionAction] = useState<string>('');

  const evoStage = pet?.evolutionStage || (pet && pet.level >= 5 ? 3 : pet && pet.level >= 3 ? 2 : 1);
  const avg = pet ? (pet.hunger + pet.happiness + (pet.cleanliness ?? 80) + (pet.energy ?? 80)) / 4 : 60;
  const mood = avg >= 80 ? '🥰' : avg >= 60 ? '😊' : avg >= 40 ? '😐' : '🥺';

  useEffect(() => {
    if (!pet) return;
    if (customMessage) {
      setBubble(customMessage);
      setMotionAction('animate-bounce');
      const timer = setTimeout(() => { setBubble(''); setMotionAction(''); }, 3500);
      return () => clearTimeout(timer);
    }

    if (lastAction === 'correct') {
      if (combo > 0 && combo % 5 === 0) {
        setMotionAction('animate-pet-spinjoy');
        const cheers = [
          `🔥 连击 x${combo}！太神速啦！`,
          `🌟 连击 x${combo}！手指起飞！`,
          `✨ 连击 x${combo}！太厉害啦！`
        ];
        setBubble(cheers[Math.floor(Math.random() * cheers.length)]);
        const timer = setTimeout(() => { setBubble(''); setMotionAction(''); }, 2400);
        return () => clearTimeout(timer);
      }
    } else if (lastAction === 'error') {
      setMotionAction('animate-shake-screen');
      const mistake = pet.mistakePhrases[Math.floor(Math.random() * pet.mistakePhrases.length)] || '看准键位，再来一次！';
      setBubble(mistake);
      const timer = setTimeout(() => { setBubble(''); setMotionAction(''); }, 2500);
      return () => clearTimeout(timer);
    } else if (lastAction === 'level_up' || lastAction === 'victory') {
      setMotionAction('animate-pet-spinjoy');
      setBubble('🎉 恭喜通关！神兽之力升级啦！');
      const timer = setTimeout(() => { setBubble(''); setMotionAction(''); }, 3500);
      return () => clearTimeout(timer);
    }
  }, [lastAction, combo, customMessage, pet]);

  const handleClick = () => {
    if (!pet) return;
    playSoundEffect('pop');
    setMotionAction('animate-pet-happyhop');
    const cheer = pet.cheerPhrases[Math.floor(Math.random() * pet.cheerPhrases.length)] || '主人加油！';
    setBubble(cheer);
    setTimeout(() => { setBubble(''); setMotionAction(''); }, 3000);
  };

  if (!pet) return null;

  if (isMinimized) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
        <div className="relative h-0 max-w-[1800px] mx-auto">
          <div
            onClick={() => setIsMinimized(false)}
            className="absolute left-8 bottom-8 bg-white p-2.5 rounded-full shadow-lg border-3 border-[#FFC94D] cursor-pointer hover:scale-110 transition-transform flex items-center gap-1.5 backdrop-blur-md pointer-events-auto"
            title="点击展开桌面宠物伙伴"
          >
            <span className="text-2xl">{pet.avatarEmoji}</span>
            <span className="text-xs font-black text-[#8A5F00] pr-1">伙伴</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    /* 跟踪容器几何原理：与 main 同构的 max-w-[1800px] mx-auto 定心容器，
       使宠物左缘在任何视口宽度下都精确贴合内容卡片左缘（宽屏 >1800px 时卡片
       居中内收，fixed left-N 会脱卡）；再叠加 32px 对角内移，
       恰好收进卡片 28px 圆角弧线之内（弧心在卡片角+(28,28)，宠物角
       距弧心 √(16²+16²)=22.6 < 28，留 5.4px 余量） */
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none select-none">
      <div className="relative h-0 max-w-[1800px] mx-auto">
        <div className="absolute left-8 bottom-8 flex flex-col items-start">
      {/* Speech Bubble */}
      {bubble && (
        <div className="bg-white px-4 py-2.5 rounded-2xl shadow-lg border-3 border-[#FFC94D] text-[#5B4636] font-black text-xs md:text-sm max-w-[240px] text-center mb-2 animate-fade-in pointer-events-auto relative">
          {bubble}
          <div className="absolute -bottom-2 left-8 w-0 h-0 border-x-6 border-x-transparent border-t-6 border-t-white"></div>
        </div>
      )}

      {/* Floating Pet Card */}
      <div
        className="pointer-events-auto story-card px-3 py-2.5 flex items-center gap-2.5 backdrop-blur-md transition-all hover:-translate-y-1"
      >
        <div
          onClick={handleClick}
          className={`relative cursor-pointer transition-transform duration-150 ${motionAction || 'animate-pet-breathe'}`}
        >
          <div className={`w-14 h-14 bg-[#FFF8EE] rounded-full flex items-center justify-center text-3xl shadow-md border-3 transition-all ${
            evoStage === 3 ? 'border-[#FFC94D] ring-4 ring-[#FFE3A3]' : evoStage === 2 ? 'border-[#4FB8E7] ring-2 ring-[#BBE2F2]' : 'border-[#FFE8C8]'
          }`}>
            {pet.avatarEmoji}
            <span className="absolute -top-2 -right-2 text-sm">{mood}</span>
          </div>
          {evoStage === 3 && <div className="absolute -top-3 -left-1 text-sm animate-float-y">👑</div>}
          {accessory && accessory.id !== 'none' && (
            <div className={`absolute filter drop-shadow pointer-events-none ${
              accessory.type === 'glasses'
                ? 'top-6 left-1/2 -translate-x-1/2 text-sm z-10'
                : accessory.type === 'wand'
                ? '-right-2 bottom-0 text-base rotate-12 z-10'
                : accessory.type === 'badge'
                ? '-bottom-1 left-1/2 -translate-x-1/2 text-sm z-10'
                : '-top-3.5 left-1/2 -translate-x-1/2 text-xl z-10'
            }`}>
              {accessory.emoji}
            </div>
          )}
        </div>

        <div className="flex flex-col pr-1 cursor-pointer" onClick={handleClick}>
          <div className="flex items-center gap-1">
            <span className="text-[15px] font-black text-[#5B4636] font-kids">{pet.name}</span>
            <span className="text-xs bg-[#FF8A5C] text-white px-1.5 py-0.5 rounded-md font-black shadow-[0_2px_0_#E0633A]">
              Lv.{pet.level}
            </span>
            {evoStage >= 2 && (
              <span className="text-[11px] bg-[#A57DE0] text-white px-1 py-0.5 rounded font-bold">
                {evoStage === 3 ? '神兽' : '进阶'}
              </span>
            )}
          </div>
          <div className="text-[13px] text-[#8A6F5C] font-bold">
            {combo > 1 ? `🔥 Combo x${combo}` : '陪你一起快乐打字'}
          </div>
        </div>

        {/* Minimize Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(true);
          }}
          className="text-[#C4AE97] hover:text-[#8A6F5C] p-1 text-xs font-black"
          title="最小化伙伴"
        >
          ✕
        </button>
      </div>
    </div>
      </div>
    </div>
  );
};

export default FloatingCompanion;
