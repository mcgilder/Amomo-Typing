import React, { useState, useEffect } from 'react';
import { PetItem, PetAccessory, PetTool } from '../types';
import { playSoundEffect } from '../utils';

// ============ 宠物数据 ============
export const INITIAL_PETS: PetItem[] = [
  {
    id: 'cat',
    name: '阿墨小猫',
    species: '橘猫',
    avatarEmoji: '🐱',
    pixelArt: '🐱',
    level: 1,
    exp: 0,
    enchantLevel: 0,
    evolutionStage: 1,
    hunger: 80,
    happiness: 90,
    cleanliness: 85,
    energy: 80,
    unlocked: true,
    cost: 0,
    accessory: 'none',
    cheerPhrases: [
      '喵呜！打得真准，手指像飞一样！',
      '太棒啦！小猫为你转圈圈庆祝喵！',
      '喵~ 连击好厉害，继续保持！',
      '神速小达人，喵！'
    ],
    mistakePhrases: [
      '喵~ 别急，深呼吸再看一眼键位！',
      '没关系，按错也是成长的一步喵！',
      '喵呜~ 慢慢来，找准位置！'
    ],
    chatPhrases: [
      '喵~ 今天想先玩什么游戏呀？',
      '小猫的肚子有点饿了喵……',
      '陪我说说话嘛，喵呜～',
      '喵！你打字的时候最帅啦！'
    ]
  },
  {
    id: 'dog',
    name: '汪汪队长',
    species: '柴犬',
    avatarEmoji: '🐶',
    pixelArt: '🐶',
    level: 1,
    exp: 0,
    enchantLevel: 0,
    evolutionStage: 1,
    hunger: 70,
    happiness: 85,
    cleanliness: 75,
    energy: 90,
    unlocked: true,
    cost: 0,
    accessory: 'none',
    cheerPhrases: [
      '汪汪！太厉害啦！',
      '主人冲呀！速度破纪录啦！',
      '汪！手速快如闪电！'
    ],
    mistakePhrases: [
      '汪呜~ 稳住手型，再试一次！',
      '不气馁，小队长永远支持你！'
    ],
    chatPhrases: [
      '汪！今天也要元气满满哦！',
      '想一起去公园玩飞盘吗？汪！',
      '汪汪~ 我最喜欢和你在一起！'
    ]
  },
  {
    id: 'dino',
    name: '萌萌小恐龙',
    species: '暴龙宝宝',
    avatarEmoji: '🦖',
    pixelArt: '🦖',
    level: 1,
    exp: 0,
    enchantLevel: 0,
    evolutionStage: 1,
    hunger: 60,
    happiness: 80,
    cleanliness: 70,
    energy: 85,
    unlocked: false,
    cost: 60,
    accessory: 'none',
    cheerPhrases: [
      '嗷呜！恐龙之力爆发！',
      '踩碎所有难打的单词，嗷！',
      '太快啦！霸王龙都追不上你！'
    ],
    mistakePhrases: [
      '嗷~ 调整一下呼吸，大步向前！',
      '恐龙宝宝给你加油，再来！'
    ],
    chatPhrases: [
      '嗷呜~ 想去侏罗纪公园玩吗？',
      '恐龙也要每天洗澡才帅！',
      '嗷！你是我最好的驯龙师！'
    ]
  },
  {
    id: 'penguin',
    name: '探险企鹅',
    species: '极地企鹅',
    avatarEmoji: '🐧',
    pixelArt: '🐧',
    level: 1,
    exp: 0,
    enchantLevel: 0,
    evolutionStage: 1,
    hunger: 75,
    happiness: 80,
    cleanliness: 90,
    energy: 70,
    unlocked: false,
    cost: 100,
    accessory: 'none',
    cheerPhrases: [
      '嘎嘎！冰爽超快连击！',
      '在键盘上滑雪喽！',
      '极速冲刺，太酷啦！'
    ],
    mistakePhrases: [
      '嘎！稳住脚蹼，慢慢滑！',
      '看准字母再按，加油！'
    ],
    chatPhrases: [
      '嘎~ 南极今天也下雪了呢！',
      '一起去滑冰吗？嘎嘎！',
      '企鹅最喜欢凉凉的冰淇淋～'
    ]
  },
  {
    id: 'unicorn',
    name: '幻彩独角兽',
    species: '魔法独角兽',
    avatarEmoji: '🦄',
    pixelArt: '🦄',
    level: 1,
    exp: 0,
    enchantLevel: 0,
    evolutionStage: 1,
    hunger: 90,
    happiness: 95,
    cleanliness: 95,
    energy: 75,
    unlocked: false,
    cost: 150,
    accessory: 'none',
    cheerPhrases: [
      '✨ 魔法光芒！全对通关！',
      '🌟 你的手指散发着奇迹光芒！',
      '💫 完美敲击，太优雅啦！'
    ],
    mistakePhrases: [
      '✨ 挥动魔杖，消除错误，再来一次！',
      '魔法正在充能中，慢慢看哦！'
    ],
    chatPhrases: [
      '✨ 想不想去云朵上散步？',
      '魔法需要的不是咒语，是练习哦～',
      '✨ 你笑起来像星星一样亮！'
    ]
  },
  {
    id: 'robot',
    name: '像素小机甲',
    species: '智能管家',
    avatarEmoji: '🤖',
    pixelArt: '🤖',
    level: 1,
    exp: 0,
    enchantLevel: 0,
    evolutionStage: 1,
    hunger: 100,
    happiness: 90,
    cleanliness: 80,
    energy: 100,
    unlocked: false,
    cost: 200,
    accessory: 'none',
    cheerPhrases: [
      '哔哔！检测到超高准确率！',
      '系统提示：速度超越99%的小朋友！',
      '能量全满，极速运转！'
    ],
    mistakePhrases: [
      '哔... 重新校准键位坐标中！',
      '保持正确指法，重新输入！'
    ],
    chatPhrases: [
      '哔~ 今天已陪伴你 xx 分钟啦！',
      '系统提示：休息一下眼睛吧！',
      '哔哔！友谊协议持续运行中～'
    ]
  }
];

export const ACCESSORIES: PetAccessory[] = [
  { id: 'none', name: '默认', emoji: '✖️', type: 'hat', cost: 0, unlocked: true },
  { id: 'crown', name: '金色皇冠', emoji: '👑', type: 'hat', cost: 30, unlocked: false },
  { id: 'glasses', name: '酷炫墨镜', emoji: '🕶️', type: 'glasses', cost: 40, unlocked: false },
  { id: 'party_hat', name: '派对彩帽', emoji: '🥳', type: 'hat', cost: 25, unlocked: false },
  { id: 'magic_wand', name: '星星魔法棒', emoji: '🪄', type: 'wand', cost: 50, unlocked: false },
  { id: 'ribbon', name: '粉红蝴蝶结', emoji: '🎀', type: 'hat', cost: 20, unlocked: false },
  { id: 'medal', name: '冠军勋章', emoji: '🥇', type: 'badge', cost: 60, unlocked: false },
  { id: 'cape', name: '王者披风', emoji: '🦸', type: 'badge', cost: 80, unlocked: false },
  { id: 'halo', name: '神圣光环', emoji: '😇', type: 'hat', cost: 120, unlocked: false }
];

// ============ 互动道具：每种都有独特的宠物动作！ ============
export const PET_TOOLS: PetTool[] = [
  // —— 美食（投喂） ——
  {
    id: 'cookie', name: '能量小饼干', emoji: '🍪', category: 'food', cost: 5,
    hungerAdd: 15, happyAdd: 10, cleanAdd: 0, energyAdd: 5,
    animClass: 'animate-pet-cookie', particles: '🍪 ✨ 😋',
    desc: '嘎吱嘎吱，吃得耳朵都抖起来'
  },
  {
    id: 'fish', name: '香脆小鱼干', emoji: '🐟', category: 'food', cost: 10,
    hungerAdd: 25, happyAdd: 20, cleanAdd: 0, energyAdd: 5,
    animClass: 'animate-pet-fish', particles: '🐟 💫 🌊',
    desc: '开心到跳起来一口吞掉'
  },
  {
    id: 'icecream', name: '甜蜜冰淇淋', emoji: '🍦', category: 'food', cost: 12,
    hungerAdd: 20, happyAdd: 30, cleanAdd: -5, energyAdd: 8,
    animClass: 'animate-pet-icecream', particles: '🍦 ❄️ 🍧',
    desc: '仰起头舔呀舔，甜到眯眼睛'
  },
  // —— 玩具（玩耍） ——
  {
    id: 'ball', name: '弹力毛绒球', emoji: '🧶', category: 'toy', cost: 8,
    hungerAdd: 0, happyAdd: 25, cleanAdd: -5, energyAdd: -10,
    animClass: 'animate-pet-ball', particles: '🧶 💨 💫',
    desc: '追着毛绒球满屋子打滚'
  },
  {
    id: 'musicbox', name: '悦动音乐盒', emoji: '🎵', category: 'toy', cost: 15,
    hungerAdd: 0, happyAdd: 20, cleanAdd: 0, energyAdd: -5,
    animClass: 'animate-pet-dance', particles: '🎵 🎶 ✨',
    desc: '跟着音乐手舞足蹈'
  },
  // —— 照料（清洁） ——
  {
    id: 'bath', name: '香香泡泡浴', emoji: '🛁', category: 'care', cost: 10,
    hungerAdd: 0, happyAdd: 10, cleanAdd: 40, energyAdd: 0,
    animClass: 'animate-pet-bath', particles: '🫧 🛁 💦',
    desc: '泡泡浴里打个滚，甩甩水珠香喷喷'
  },
  {
    id: 'brush', name: '柔软梳毛刷', emoji: '🖌️', category: 'care', cost: 5,
    hungerAdd: 0, happyAdd: 15, cleanAdd: 20, energyAdd: 3,
    animClass: 'animate-pet-brush', particles: '🖌️ 💖 ✨',
    desc: '被梳得全身软乎乎'
  },
  // —— 休息（精力） ——
  {
    id: 'storybook', name: '睡前故事书', emoji: '📖', category: 'sleep', cost: 8,
    hungerAdd: 0, happyAdd: 15, cleanAdd: 0, energyAdd: 20,
    animClass: 'animate-pet-read', particles: '📖 🌙 ⭐',
    desc: '读得入迷，轻轻点头晃脑'
  },
  {
    id: 'bed', name: '温馨小窝觉觉', emoji: '🛏️', category: 'sleep', cost: 12,
    hungerAdd: 5, happyAdd: 10, cleanAdd: 0, energyAdd: 45,
    animClass: 'animate-pet-sleep', particles: '💤 🛏️ 🌙',
    desc: '呼噜呼噜睡个好觉'
  }
];

// 进化数据（保留）
export const EVOLUTION_DATA: Record<string, {
  stage1: { title: string; aura: string; bonus: string };
  stage2: { title: string; aura: string; bonus: string };
  stage3: { title: string; aura: string; bonus: string };
}> = {
  cat: {
    stage1: { title: '萌萌幼橘猫', aura: 'border-[#FFE8C8]', bonus: '打字金币 +5%' },
    stage2: { title: '疾风灵纹飞猫', aura: 'border-[#FF8A5C] ring-4 ring-[#FFD1BE]', bonus: '打字金币 +20% & 连击保护' },
    stage3: { title: '✨ 墨金星穹神虎猫', aura: 'border-[#FFC94D] ring-8 ring-[#FFE3A3]', bonus: '打字金币 +50% & 全屏庆祝光芒' }
  },
  dog: {
    stage1: { title: '活泼小柴犬', aura: 'border-[#FFE8C8]', bonus: '打字金币 +5%' },
    stage2: { title: '风暴斗篷先锋犬', aura: 'border-[#4FB8E7] ring-4 ring-[#BBE2F2]', bonus: '打字金币 +20% & 速度加成' },
    stage3: { title: '⚡ 雷霆战神天狼柴', aura: 'border-[#FFC94D] ring-8 ring-[#BBE2F2]', bonus: '打字金币 +50% & 专属雷光轨迹' }
  },
  dino: {
    stage1: { title: '幼年绿恐龙', aura: 'border-[#FFE8C8]', bonus: '打字金币 +5%' },
    stage2: { title: '熔岩烈焰重甲龙', aura: 'border-[#FF8A5C] ring-4 ring-[#FFD1BE]', bonus: '打字金币 +25% & 力量暴击' },
    stage3: { title: '🔥 远古创世金翼神龙', aura: 'border-[#FFC94D] ring-8 ring-[#FFD1BE]', bonus: '打字金币 +55% & 咆哮震屏动效' }
  },
  penguin: {
    stage1: { title: '极地小企鹅', aura: 'border-[#FFE8C8]', bonus: '打字金币 +5%' },
    stage2: { title: '破冰滑雪酷企鹅', aura: 'border-[#4FB8E7] ring-4 ring-[#BBE2F2]', bonus: '打字金币 +20% & 冰爽节奏' },
    stage3: { title: '❄️ 极光寒霜领主帝企鹅', aura: 'border-[#A57DE0] ring-8 ring-[#E2D0F2]', bonus: '打字金币 +50% & 极光漫天' }
  },
  unicorn: {
    stage1: { title: '幻彩小独角兽', aura: 'border-[#FFE8C8]', bonus: '打字金币 +8%' },
    stage2: { title: '灵光星耀圣角兽', aura: 'border-[#A57DE0] ring-4 ring-[#E2D0F2]', bonus: '打字金币 +25% & 魔法消除' },
    stage3: { title: '🦄 永恒星穹梦幻天角兽', aura: 'border-[#FF8FAB] ring-8 ring-[#FFD3E0]', bonus: '打字金币 +60% & 彩虹神迹' }
  },
  robot: {
    stage1: { title: '微型智控小机甲', aura: 'border-[#FFE8C8]', bonus: '打字金币 +8%' },
    stage2: { title: '超能激光巡航机兵', aura: 'border-[#4FB8E7] ring-4 ring-[#BBE2F2]', bonus: '打字金币 +25% & 辅助瞄准' },
    stage3: { title: '🌌 未来量子创世神机', aura: 'border-[#A57DE0] ring-8 ring-[#BBE2F2]', bonus: '打字金币 +60% & 矩阵护盾' }
  }
};

// 兼容旧导出
export type { PetTool as FoodItem } from '../types';

// ============ 主组件 ============
interface DesktopPetProps {
  pets: PetItem[];
  currentPetId: string;
  coins: number;
  accessories: PetAccessory[];
  onSelectPet: (id: string) => void;
  onUnlockPet: (id: string, cost: number) => void;
  onUseTool: (tool: PetTool) => void;
  onPetPet: () => void;
  onEquipAccessory: (accId: string) => void;
  onUnlockAccessory: (accId: string, cost: number) => void;
  onEnchantPet?: (petId: string, cost: number) => void;
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  food: { label: '美味投喂', icon: '🍽️', color: 'text-[#E0633A]' },
  toy: { label: '快乐玩具', icon: '🧸', color: 'text-[#2E93C4]' },
  care: { label: '悉心照料', icon: '🫧', color: 'text-[#48A757]' },
  sleep: { label: '安心休息', icon: '🌙', color: 'text-[#8258C7]' }
};

export const DesktopPet: React.FC<DesktopPetProps> = ({
  pets,
  currentPetId,
  coins,
  accessories,
  onSelectPet,
  onUnlockPet,
  onUseTool,
  onPetPet,
  onEquipAccessory,
  onUnlockAccessory,
  onEnchantPet
}) => {
  const [activeTab, setActiveTab] = useState<'PETS' | 'TOOLS' | 'ENCHANT' | 'SHOP'>('TOOLS');
  const [toolFilter, setToolFilter] = useState<'all' | 'food' | 'toy' | 'care' | 'sleep'>('all');
  const [petAnimation, setPetAnimation] = useState('');
  const [bubbleText, setBubbleText] = useState('');
  const [flyingItem, setFlyingItem] = useState<{ id: string; emoji: string; particles: string } | null>(null);
  const [showEvolution, setShowEvolution] = useState(false);
  const [mood, setMood] = useState('😊');

  const currentPet = pets.find(p => p.id === currentPetId) || pets[0];
  const currentAccessory = accessories.find(a => a.id === currentPet.accessory);

  const hunger = currentPet.hunger;
  const happiness = currentPet.happiness;
  const cleanliness = currentPet.cleanliness ?? 80;
  const energy = currentPet.energy ?? 80;

  const enchantLvl = currentPet.enchantLevel || 0;
  const evoStage = (currentPet.evolutionStage || (currentPet.level >= 5 ? 3 : currentPet.level >= 3 ? 2 : 1)) as 1 | 2 | 3;
  const evoInfo = EVOLUTION_DATA[currentPet.id] || EVOLUTION_DATA.cat;
  const currentEvo = evoStage === 3 ? evoInfo.stage3 : evoStage === 2 ? evoInfo.stage2 : evoInfo.stage1;
  const enchantCost = (enchantLvl + 1) * 35;

  // 心情随四维状态变化
  useEffect(() => {
    const avg = (hunger + happiness + cleanliness + energy) / 4;
    setMood(avg >= 80 ? '🥰' : avg >= 60 ? '😊' : avg >= 40 ? '😐' : '🥺');
  }, [hunger, happiness, cleanliness, energy]);

  // 陪伴感：随机闲聊
  useEffect(() => {
    const chat = currentPet.chatPhrases || [];
    if (!chat.length) return;
    const t = setInterval(() => {
      if (Math.random() < 0.5) {
        setBubbleText(chat[Math.floor(Math.random() * chat.length)]);
        setTimeout(() => setBubbleText(''), 4000);
      }
    }, 15000);
    return () => clearInterval(t);
  }, [currentPet]);

  const handleInteract = () => {
    playSoundEffect('pop');
    setPetAnimation('animate-pet-happyhop');
    const hour = new Date().getHours();
    const greeting = hour < 6 ? '夜深了，我们明天再玩吧～' : hour < 11 ? '早上好呀！新的一天加油！' : hour < 14 ? '中午好～吃完饭休息一下吧！' : hour < 18 ? '下午好！来局游戏怎么样？' : '晚上好～睡前练会儿打字吧！';
    const quotes = [greeting, `${currentPet.name}最喜欢你啦！`, `今天心情${mood}，陪我玩会儿嘛～`];
    setBubbleText(quotes[Math.floor(Math.random() * quotes.length)]);
    onPetPet();
    setTimeout(() => setPetAnimation(''), 1300);
    setTimeout(() => setBubbleText(''), 3800);
  };

  const handleUseTool = (tool: PetTool) => {
    if (coins < tool.cost) {
      playSoundEffect('error');
      setBubbleText('金币不够啦，快去打字赚金币吧！');
      setTimeout(() => setBubbleText(''), 2500);
      return;
    }
    playSoundEffect('coin');
    // 触发独特动作 + 道具飞入动画
    setPetAnimation(tool.animClass);
    setFlyingItem({ id: tool.id, emoji: tool.emoji, particles: tool.particles });
    const feeling: Record<string, string> = {
      cookie: '嘎吱嘎吱！香脆小饼干，手指力量满满！',
      fish: '嗷呜一口吞！鲜美小鱼干，元气满满！',
      icecream: '舔一舔冰淇淋，冰凉爽口！好幸福～',
      ball: '毛绒球最好玩了！追追追！',
      musicbox: '叮叮咚咚～音乐真美妙，忍不住跳起舞来！',
      bath: '泡泡浴真舒服呀，我现在香喷喷的！',
      brush: '梳梳毛，好舒服呀，全身都软乎乎了～',
      storybook: '这个故事真好看，再看一页嘛～',
      bed: '呼噜呼噜……做个好梦……zzZ'
    };
    setBubbleText(feeling[tool.id] || tool.desc);
    onUseTool(tool);
    setTimeout(() => { setPetAnimation(''); setFlyingItem(null); }, 1500);
    setTimeout(() => setBubbleText(''), 3600);
  };

  const handleEnchant = () => {
    if (coins < enchantCost) {
      playSoundEffect('error');
      setBubbleText(`需要 ${enchantCost} 墨墨金币才能附魔哦！`);
      setTimeout(() => setBubbleText(''), 2500);
      return;
    }
    playSoundEffect('victory');
    setPetAnimation('animate-pet-spinjoy');
    setShowEvolution(true);
    setBubbleText(`✨ 附魔成功！${currentPet.name} 获得了远古神力！`);
    onEnchantPet?.(currentPet.id, enchantCost);
    setTimeout(() => { setPetAnimation(''); setShowEvolution(false); }, 2200);
  };

  const expNeeded = currentPet.level * 50;
  const expPercent = Math.min(100, Math.round((currentPet.exp / expNeeded) * 100));
  const scaleClass = evoStage === 3 ? 'scale-125' : evoStage === 2 ? 'scale-110' : 'scale-100';

  const statusBars = [
    { icon: '🍖', label: '饱食', value: hunger, bar: 'from-[#FF8A5C] to-[#E0633A]' },
    { icon: '💖', label: '开心', value: happiness, bar: 'from-[#FF8FAB] to-[#E0678A]' },
    { icon: '🫧', label: '清洁', value: cleanliness, bar: 'from-[#4FB8E7] to-[#2E93C4]' },
    { icon: '⚡', label: '精力', value: energy, bar: 'from-[#FFC94D] to-[#E8A317]' }
  ];

  const filteredTools = toolFilter === 'all' ? PET_TOOLS : PET_TOOLS.filter(t => t.category === toolFilter);

  return (
    <div className="w-full max-w-[1760px] flex flex-col gap-5 animate-fade-in">
      {/* 顶部横幅 */}
      <div className="story-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#FFF8EE] rounded-2xl flex items-center justify-center text-4xl shadow-inner border-3 border-[#FFE8C8] relative">
            {currentPet.avatarEmoji}
            <span className="absolute -top-2 -right-2 text-lg">{mood}</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-black text-[#5B4636] font-kids">{currentPet.name}</h2>
              <span className="bg-[#FF8A5C] text-white text-xs px-3 py-1 rounded-full font-bold shadow-[0_3px_0_#E0633A]">
                Lv.{currentPet.level} {currentEvo.title}
              </span>
              {enchantLvl > 0 && (
                <span className="bg-[#A57DE0] text-white text-xs px-2.5 py-0.5 rounded-full font-black shadow-[0_3px_0_#8258C7]">
                  ⚡ 附魔 +{enchantLvl}
                </span>
              )}
              {currentAccessory && currentAccessory.id !== 'none' && (
                <span className="text-xl" title={currentAccessory.name}>{currentAccessory.emoji}</span>
              )}
            </div>
            <p className="text-xs text-[#8A6F5C] font-bold mt-1">
              当前形态加成：<span className="text-[#8258C7] bg-[#F3E9FA] px-2 py-0.5 rounded-md">{currentEvo.bonus}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-[#FFF8EE] px-5 py-3 rounded-2xl border-3 border-[#FFE8C8] shadow-[0_4px_0_rgba(222,184,135,0.25)]">
          <span className="text-3xl animate-float-y">🪙</span>
          <div className="flex flex-col">
            <span className="text-xs text-[#8A6F5C] font-bold">墨墨金币</span>
            <span className="text-2xl font-black text-[#8A5F00]">{coins}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3.5fr_8.5fr] gap-5">
        {/* 左：宠物小屋 */}
        <div className="story-card p-6 flex flex-col items-center justify-between relative overflow-hidden min-h-[440px]"
             style={{ background: 'linear-gradient(180deg, #FFF8EE 0%, #FDEBD0 60%, #F8E2C4 100%)' }}>
          {/* 房间装饰：窗户（日夜）+ 壁纸 */}
          <div className="absolute top-4 right-5 w-20 h-16 rounded-2xl border-4 border-[#E8A317] bg-gradient-to-b from-[#8FD4EC] to-[#B4E1F5] flex items-center justify-center overflow-hidden">
            <span className="text-2xl">{new Date().getHours() >= 18 || new Date().getHours() < 6 ? '🌙' : '☀️'}</span>
          </div>
          <div className="absolute top-6 left-5 text-2xl opacity-60 animate-float-y select-none">🖼️</div>
          <div className="absolute bottom-3 inset-x-6 h-5 rounded-full bg-[#FFD9E0]/60" /> {/* 地毯 */}
          <div className="absolute bottom-4 left-6 text-2xl select-none animate-sway" style={{ animationDelay: '0.4s' }}>🪴</div>
          <div className="absolute bottom-4 right-8 text-2xl select-none">🧺</div>

          {/* 道具飞入动画 */}
          {flyingItem && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
              <span className="text-5xl animate-pop-burst select-none">{flyingItem.emoji}</span>
              <span className="text-xl font-black mt-1 text-[#E0633A] animate-float-score select-none">{flyingItem.particles}</span>
            </div>
          )}

          {/* 专属环境特效：泡泡浴冒泡泡 / 梳毛冒爱心 / 音乐盒飘音符 */}
          {flyingItem && (
            <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
              {flyingItem.id === 'bath' && [0, 1, 2, 3, 4, 5].map(i => (
                <span key={i} className="absolute text-2xl animate-bubble-rise select-none"
                  style={{ left: `${28 + (i * 17) % 46}%`, top: '60%', animationDelay: `${i * 0.25}s`, animationDuration: '1.5s' }}>
                  {i % 2 ? '🫧' : '💧'}
                </span>
              ))}
              {flyingItem.id === 'brush' && (
                <>
                  {/* 梳毛：刷子贴着猫背左右梳动 */}
                  <span className="absolute text-3xl select-none"
                    style={{ top: '46%', left: '50%', animation: 'brushStroke 1.1s ease-in-out 2' }}>
                    🖌️
                  </span>
                  {/* 梳下来的毛絮飘飘落地 */}
                  {[0, 1, 2, 3, 4].map(i => (
                    <span key={i} className="absolute w-2 h-2 rounded-full"
                      style={{ left: `${32 + i * 9}%`, top: '52%', background: i % 2 ? '#E8D9C4' : '#F3E7D3',
                        animation: `furFall 1.2s ease-in ${(i * 0.14).toFixed(2)}s forwards` }} />
                  ))}
                </>
              )}
              {flyingItem.id === 'musicbox' && ['🎵', '🎶', '🎵', '🎶', '🎵', '🎶'].map((e, i) => (
                <span key={i} className="absolute text-xl animate-float-score select-none"
                  style={{ left: `${26 + i * 10}%`, top: `${34 + (i % 2) * 14}%`, animationDelay: `${i * 0.2}s` }}>
                  {e}
                </span>
              ))}
            </div>
          )}

          {/* 气泡 */}
          <div className="w-full flex justify-center h-14 items-center z-10 mt-1">
            {bubbleText ? (
              <div className="bg-white px-5 py-2.5 rounded-2xl shadow-md border-3 border-[#FFC94D] text-[#5B4636] font-black text-xs md:text-sm max-w-xs text-center animate-fade-in relative">
                {bubbleText}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-white"></div>
              </div>
            ) : (
              <div className="text-xs text-[#8A6F5C] font-bold bg-white/80 px-4 py-1.5 rounded-full border-2 border-[#FFE8C8]">
                👆 点我摸摸头，用右侧道具陪我玩！
              </div>
            )}
          </div>

          {/* 宠物主角 */}
          <div className="flex flex-col items-center my-auto cursor-pointer select-none group" onClick={handleInteract}>
            <div className={`relative transition-transform duration-200 group-hover:scale-105 active:scale-95 ${scaleClass}`}>
              <div
                className={`w-40 h-40 bg-white/95 rounded-full flex items-center justify-center text-8xl shadow-xl border-4 relative ${currentEvo.aura} ${petAnimation || 'animate-pet-breathe'}`}
              >
                {/* 宠物本体（z-10：披风在身后、墨镜帽子在身前） */}
                <span className="relative z-10 select-none">{currentPet.avatarEmoji}</span>

                {/* 披风：盖着肩膀、在身体后面（z-[5]） */}
                {currentAccessory && currentAccessory.id === 'cape' && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[5] w-[118px] h-[58px] pointer-events-none">
                    <div
                      className="w-full h-full"
                      style={{
                        background: 'linear-gradient(180deg, #E0633A 0%, #C4451F 55%, #A33318 100%)',
                        clipPath: 'polygon(0% 0%, 100% 0%, 94% 100%, 80% 76%, 64% 100%, 50% 80%, 36% 100%, 20% 76%, 6% 100%)',
                        borderTopLeftRadius: 42, borderTopRightRadius: 42,
                        boxShadow: '0 3px 6px rgba(0,0,0,0.22)',
                      }}
                    />
                    {/* 披风领口 */}
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-[74px] h-2.5 rounded-full bg-[#FFC94D] shadow" />
                  </div>
                )}

                {/* 勋章：挂在胸前 */}
                {currentAccessory && currentAccessory.id === 'medal' && (
                  <div className="absolute top-[96px] left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
                    <div className="w-[3px] h-4 bg-[#2E93C4]" />
                    <span className="text-2xl" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}>🥇</span>
                  </div>
                )}

                {/* 帽子类：贴在头顶区域，不再飘到头外面 */}
                {currentAccessory && currentAccessory.id === 'crown' && (
                  <span className="absolute top-2.5 left-1/2 -translate-x-1/2 text-2xl z-20 pointer-events-none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))' }}>👑</span>
                )}
                {currentAccessory && currentAccessory.id === 'ribbon' && (
                  <span className="absolute top-11 left-6 text-2xl z-20 pointer-events-none -rotate-[14deg]" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))' }}>🎀</span>
                )}
                {currentAccessory && currentAccessory.id === 'halo' && (
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-[18px] rounded-[50%] border-[5px] border-[#FFD700] z-20 pointer-events-none"
                    style={{ boxShadow: '0 0 12px rgba(255,215,0,0.85), inset 0 0 6px rgba(255,215,0,0.6)' }} />
                )}

                {/* 派对帽：CSS 锥形彩帽（歪着戴更可爱，只有帽子本身） */}
                {currentAccessory && currentAccessory.id === 'party_hat' && (
                  <div className="absolute top-[2px] left-1/2 z-20 pointer-events-none" style={{ transform: 'translateX(-55%) rotate(14deg)' }}>
                    <div className="relative w-0 h-0 border-l-[15px] border-r-[15px] border-b-[36px] border-l-transparent border-r-transparent border-b-[#A57DE0]">
                      {/* 彩条纹 */}
                      <div className="absolute top-[13px] -left-[11px] w-[22px] h-[4px] rounded-full bg-[#FFC94D]" />
                      <div className="absolute top-[22px] -left-[8px] w-[16px] h-[3.5px] rounded-full bg-[#6BCB77]" />
                      {/* 帽顶尖球 */}
                      <div className="absolute -top-[9px] left-1/2 -translate-x-1/2 w-[11px] h-[11px] rounded-full bg-[#FF8FAB] border-2 border-white/70" />
                    </div>
                  </div>
                )}

                {/* 墨镜：加大酷帅盾形镜片，完全盖住双眼（架在脸上无镜腿） */}
                {currentAccessory && currentAccessory.type === 'glasses' && (
                  <div className="absolute top-[58px] left-1/2 z-20 pointer-events-none flex items-center" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.35))', transform: 'translateX(-50%) rotate(-2deg) scale(0.8)' }}>
                    <div className="relative w-[52px] h-[30px] overflow-hidden"
                      style={{ background: 'linear-gradient(160deg, #3A4A66 0%, #161D2B 45%, #060A12 100%)', borderRadius: '14px 20px 22px 20px / 16px 18px 22px 18px', border: '2.5px solid #0A0F18' }}>
                      {/* 蓝紫反光 */}
                      <div className="absolute inset-x-1 top-[3px] h-[8px] rounded-full" style={{ background: 'linear-gradient(90deg, rgba(125,211,252,0.75), rgba(167,125,224,0.45), transparent)' }} />
                      {/* 白色眩光斜条 */}
                      <div className="absolute w-[16px] h-[4px] bg-white/70 rotate-[-24deg]" style={{ left: 7, top: 9 }} />
                      <div className="absolute w-[8px] h-[3px] bg-white/50 rotate-[-24deg]" style={{ left: 27, top: 16 }} />
                    </div>
                    {/* 金属镜桥 */}
                    <div className="w-[12px] h-[4px] rounded-full" style={{ background: 'linear-gradient(180deg, #C0C8D6, #6B7686)' }} />
                    <div className="relative w-[52px] h-[30px] overflow-hidden"
                      style={{ background: 'linear-gradient(200deg, #3A4A66 0%, #161D2B 45%, #060A12 100%)', borderRadius: '20px 14px 20px 22px / 18px 16px 18px 22px', border: '2.5px solid #0A0F18' }}>
                      <div className="absolute inset-x-1 top-[3px] h-[8px] rounded-full" style={{ background: 'linear-gradient(270deg, rgba(125,211,252,0.75), rgba(167,125,224,0.45), transparent)' }} />
                      <div className="absolute w-[16px] h-[4px] bg-white/70 rotate-[24deg]" style={{ right: 7, top: 9 }} />
                      <div className="absolute w-[8px] h-[3px] bg-white/50 rotate-[24deg]" style={{ right: 27, top: 16 }} />
                    </div>
                  </div>
                )}

                {/* 魔法棒：贴在身侧手持 */}
                {currentAccessory && currentAccessory.type === 'wand' && (
                  <span className="absolute -right-3 bottom-4 text-3xl z-20 pointer-events-none rotate-12" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>🪄</span>
                )}

                {/* 3 阶进化皇冠：贴头顶 */}
                {evoStage === 3 && <div className="absolute top-1 left-1/2 -translate-x-1/2 text-2xl animate-float-y z-20 select-none">👑</div>}
                {enchantLvl > 0 && (
                  <div className="absolute -bottom-2 -left-2 bg-[#A57DE0] text-white text-[11px] px-2 py-0.5 rounded-full font-black shadow border-2 border-white">
                    +{enchantLvl}★
                  </div>
                )}
                {/* 睡觉 ZZZ */}
                {(petAnimation === 'animate-pet-sleep' || petAnimation === 'animate-pet-read') && (
                  <span className="absolute -top-4 right-2 text-2xl animate-zzz select-none">💤</span>
                )}
              </div>
              <div className="w-36 h-6 bg-[#5B4636]/15 rounded-full mx-auto mt-3 blur-[3px]" />
            </div>
            <span className="text-xs font-black text-[#8A5F00] bg-[#FFF3D6] px-3.5 py-1 rounded-full mt-2 border-2 border-[#FFE3A3] group-hover:bg-[#FFC94D]">
              {currentEvo.title} · 点我互动
            </span>
          </div>

          {/* 四维状态 */}
          <div className="w-full bg-white/95 p-4 rounded-2xl border-3 border-[#FFE8C8] shadow-sm flex flex-col gap-2 z-10">
            <div>
              <div className="flex justify-between text-xs font-black text-[#5B4636] mb-1">
                <span>⭐ 经验 (Lv.{currentPet.level})</span>
                <span className="text-[#8A6F5C]">{currentPet.exp} / {expNeeded} EXP</span>
              </div>
              <div className="w-full h-3 bg-[#F5EBDA] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#FFC94D] to-[#E8A317] transition-all duration-300 rounded-full" style={{ width: `${expPercent}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {statusBars.map(b => (
                <div key={b.label}>
                  <div className="flex justify-between text-[11px] font-bold text-[#8A6F5C] mb-0.5">
                    <span>{b.icon} {b.label}</span>
                    <span>{Math.round(b.value)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-[#F5EBDA] rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${b.bar} rounded-full transition-all duration-500`} style={{ width: `${b.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右：控制台 */}
        <div className="story-card p-6 flex flex-col gap-5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {([
              { id: 'TOOLS', label: '🧸 互动道具' },
              { id: 'PETS', label: '🐾 宠物乐园' },
              { id: 'ENCHANT', label: '✨ 附魔进化' },
              { id: 'SHOP', label: '👑 饰品装扮' }
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-max py-2.5 px-3 rounded-2xl font-black text-sm md:text-base flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? tab.id === 'TOOLS' ? 'bg-[#6BCB77] text-white shadow-[0_4px_0_#48A757]'
                      : tab.id === 'PETS' ? 'bg-[#FF8A5C] text-white shadow-[0_4px_0_#E0633A]'
                      : tab.id === 'ENCHANT' ? 'bg-[#A57DE0] text-white shadow-[0_4px_0_#8258C7]'
                      : 'bg-[#FF8FAB] text-white shadow-[0_4px_0_#E0678A]'
                    : 'bg-[#FFF8EE] text-[#8A6F5C] border-2 border-[#FFE8C8] hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: 互动道具（右栏 3 列横卡，参照定稿截图） */}
          {activeTab === 'TOOLS' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'food', 'toy', 'care', 'sleep'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setToolFilter(f)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-black transition-all ${
                      toolFilter === f ? 'bg-[#5B4636] text-white' : 'bg-[#FFF8EE] text-[#8A6F5C] border-2 border-[#FFE8C8] hover:bg-white'
                    }`}
                  >
                    {f === 'all' ? '🎁 全部' : `${CATEGORY_META[f].icon} ${CATEGORY_META[f].label}`}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredTools.map(tool => (
                  <div
                    key={tool.id}
                    className="p-2.5 rounded-2xl border-3 border-[#FFE8C8] bg-[#FFF8EE]/60 hover:bg-white hover:border-[#FFC94D] hover:shadow-[0_4px_0_rgba(222,184,135,0.3)] transition-all flex items-center gap-2.5"
                  >
                    <div className="w-14 h-14 rounded-full bg-white border-3 border-[#FFE8C8] flex items-center justify-center text-3xl shrink-0 select-none">
                      {tool.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-[22px] text-[#5B4636] leading-tight">{tool.name}</span>
                        {tool.hungerAdd !== 0 && <span className="text-[15px] font-bold bg-[#FFE9E0] text-[#E0633A] px-1.5 rounded">饱食{tool.hungerAdd > 0 ? '+' : ''}{tool.hungerAdd}</span>}
                        {tool.happyAdd !== 0 && <span className="text-[15px] font-bold bg-[#FFE9F0] text-[#E0678A] px-1.5 rounded">开心+{tool.happyAdd}</span>}
                        {tool.cleanAdd !== 0 && <span className="text-[15px] font-bold bg-[#E3F2FA] text-[#2E93C4] px-1.5 rounded">清洁+{tool.cleanAdd}</span>}
                        {tool.energyAdd !== 0 && <span className="text-[15px] font-bold bg-[#FFF3D6] text-[#8A5F00] px-1.5 rounded">精力{tool.energyAdd > 0 ? '+' : ''}{tool.energyAdd}</span>}
                      </div>
                      <span className="text-[19px] text-[#8A6F5C] font-bold leading-snug line-clamp-2">{tool.desc}</span>
                    </div>
                    <button
                      onClick={() => handleUseTool(tool)}
                      className="btn-candy btn-grass w-14 h-14 rounded-full shrink-0 flex flex-col items-center justify-center leading-none text-[13px] font-black transition-transform active:scale-90"
                      title="使用道具"
                    >
                      <span className="text-[15px]">🪙</span>
                      <span className="mt-0.5">{tool.cost}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: 宠物选择 */}
          {activeTab === 'PETS' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pets.map(p => {
                const isSelected = p.id === currentPetId;
                const pStage = p.evolutionStage || (p.level >= 5 ? 3 : p.level >= 3 ? 2 : 1);
                const info = (EVOLUTION_DATA[p.id] || EVOLUTION_DATA.cat);
                const title = pStage === 3 ? info.stage3.title : pStage === 2 ? info.stage2.title : info.stage1.title;
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-2xl border-3 flex flex-col items-center justify-between text-center transition-all ${
                      isSelected ? 'border-[#FF8A5C] bg-[#FFE9E0] ring-2 ring-[#FFC94D]' : 'border-[#FFE8C8] bg-[#FFF8EE]/60 hover:bg-white'
                    }`}
                  >
                    <div className="text-4xl my-1 relative">
                      {p.avatarEmoji}
                      {pStage >= 2 && <span className="absolute -top-1 -right-2 text-xs">✨</span>}
                    </div>
                    <div className="font-black text-[#5B4636] text-sm">{p.name}</div>
                    <div className="text-[11px] text-[#8258C7] font-bold mb-2 line-clamp-1">{title}</div>
                    {p.unlocked ? (
                      <button
                        onClick={() => { playSoundEffect('click'); onSelectPet(p.id); }}
                        disabled={isSelected}
                        className={`w-full py-1.5 rounded-xl text-xs font-bold transition-all ${
                          isSelected ? 'bg-[#FF8A5C] text-white shadow-[0_3px_0_#E0633A]' : 'bg-white text-[#8A6F5C] border-2 border-[#FFE8C8] hover:bg-[#FFE9E0]'
                        }`}
                      >
                        {isSelected ? '已出战' : '出战'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (coins >= p.cost) { playSoundEffect('coin'); onUnlockPet(p.id, p.cost); }
                          else playSoundEffect('error');
                        }}
                        className="w-full py-1.5 rounded-xl text-xs font-black btn-candy btn-honey"
                      >
                        🪙 {p.cost} 解锁
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 3: 附魔进化 */}
          {activeTab === 'ENCHANT' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl p-5 text-white shadow-md flex flex-col gap-3 relative overflow-hidden bg-gradient-to-br from-[#8258C7] to-[#A57DE0]">
                <div className="absolute -top-4 -right-4 text-7xl opacity-20 animate-twinkle">✨</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/80">神圣附魔台</span>
                    <h3 className="text-xl font-black text-[#FFE3A3] font-kids">{currentPet.name} 的形态进化</h3>
                  </div>
                  <span className="text-xs font-black bg-white/20 px-2.5 py-1 rounded-lg border-2 border-white/30">
                    {evoStage === 3 ? '🌟 觉醒神兽' : evoStage === 2 ? '⚡ 元素进阶' : '🌱 幼年萌态'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {[
                    { icon: '🌱', name: '1阶 幼年萌态', desc: '基础体型' },
                    { icon: '⚡', name: '2阶 元素进阶', desc: '体型+20% & 神光' },
                    { icon: '👑', name: '3阶 觉醒神兽', desc: '体型+40% & 光环' }
                  ].map((s, i) => (
                    <div key={i} className={`p-2.5 rounded-xl border-2 flex flex-col items-center text-center ${evoStage > i ? 'bg-white/15 border-white/50' : 'bg-black/15 border-white/10 opacity-50'}`}>
                      <span className="text-2xl mb-1">{s.icon}</span>
                      <span className="text-xs font-black">{s.name}</span>
                      <span className="text-[10px] text-white/70 mt-0.5">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#F3E9FA] p-4 rounded-2xl border-3 border-[#E2D0F2] flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-[#8258C7]">强化神兽附魔（当前 +{enchantLvl}）</span>
                  <span className="text-xs text-[#8258C7]/80 mt-0.5">提升打字结算金币加成，升级形态！</span>
                </div>
                <button onClick={handleEnchant} className="btn-candy btn-grape px-6 py-3 text-sm whitespace-nowrap">
                  ✨ 附魔 <span className="bg-[#8258C7]/60 px-2 py-0.5 rounded-lg text-xs ml-1">🪙 {enchantCost}</span>
                </button>
              </div>
              {showEvolution && (
                <div className="absolute inset-0 bg-[#F3E9FA]/60 backdrop-blur-sm rounded-3xl flex items-center justify-center animate-fade-in pointer-events-none z-40">
                  <div className="text-center">
                    <span className="text-7xl animate-star-spin block">✨🦄✨</span>
                    <span className="text-lg font-black text-[#8258C7]">神力注入中……</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: 饰品店 */}
          {activeTab === 'SHOP' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {accessories.map(acc => {
                const isEquipped = currentPet.accessory === acc.id;
                return (
                  <div
                    key={acc.id}
                    className={`p-3.5 rounded-2xl border-3 flex flex-col items-center justify-between text-center transition-all ${
                      isEquipped ? 'border-[#FF8FAB] bg-[#FFE9F0] ring-2 ring-[#FFD3E0]' : 'border-[#FFE8C8] bg-[#FFF8EE]/60 hover:bg-white'
                    }`}
                  >
                    <span className="text-4xl my-1">{acc.emoji}</span>
                    <span className="font-black text-[#5B4636] text-sm">{acc.name}</span>
                    <div className="text-[11px] text-[#8A6F5C] my-1">
                      {acc.cost === 0 ? '免费默认' : `🪙 ${acc.cost} 金币`}
                    </div>
                    {acc.unlocked ? (
                      <button
                        onClick={() => { playSoundEffect('click'); onEquipAccessory(acc.id); }}
                        className={`w-full py-1.5 rounded-xl text-xs font-black transition-all ${
                          isEquipped ? 'btn-candy btn-berry' : 'bg-white text-[#8A6F5C] border-2 border-[#FFE8C8] hover:bg-[#FFE9F0]'
                        }`}
                      >
                        {isEquipped ? '已穿戴' : '穿戴'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (coins >= acc.cost) { playSoundEffect('coin'); onUnlockAccessory(acc.id, acc.cost); }
                          else playSoundEffect('error');
                        }}
                        className="btn-candy btn-berry w-full py-1.5 text-xs"
                      >
                        🪙 {acc.cost} 购买
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DesktopPet;
