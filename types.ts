
export enum Mode {
  ENGLISH = 'ENGLISH',
  CHINESE = 'CHINESE'
}

export enum Tab {
  PRACTICE = 'PRACTICE',
  GAME = 'GAME',
  STORY = 'STORY',
  PET = 'PET',
  HABIT = 'HABIT',
  STATS = 'STATS',
  ABOUT = 'ABOUT'
}

export interface ExerciseItem {
  text: string;        // 练习目标（英文单词或小写无音调拼音）
  chinese?: string;     // 对应的汉字
  pinyin?: string;      // 带声调的拼音显示（方便孩子看）
  phonetic?: string;    // 音标
  translation?: string; // 翻译
  example: string;      // 例句
  difficultyLevel?: 1 | 2 | 3;
}

export interface TypingStats {
  id?: string;
  date: string;         // YYYY-MM-DD
  timestamp?: number;
  speed: number;        // WPM / 字每分钟
  accuracy: number;     // 准确率 %
  timeSpent: number;    // 用时（秒）
  bookName?: string;
  mode?: Mode;
  correctCount?: number;
  totalCount?: number;
  maxCombo?: number;
  errors: Record<string, number>;
  coinsEarned?: number;
}

// 故事单词分级
export interface StoryWordItem {
  word: string;
  pinyin?: string;
  phonetic?: string;
  translation: string;
  level: 1 | 2 | 3; // 1: 基础萌芽, 2: 进阶成长, 3: 超能挑战
  example: string;
}

// AI生成小故事
export interface StoryData {
  id: string;
  topic: string;
  titleZh: string;
  titleEn: string;
  storyZh: string;
  storyZhHk?: string;   // 地道粤语口语版正文（隐藏字段，仅供粤语朗读，不显示）
  storyEn: string;
  words: StoryWordItem[];
  createdAt: number;
}

// 桌面宠物定义
export interface PetItem {
  id: string;
  name: string;
  species: string;
  avatarEmoji: string;
  pixelArt: string;
  level: number;
  exp: number;
  enchantLevel?: number; // 附魔等级 0-5
  evolutionStage?: 1 | 2 | 3; // 1: 幼崽萌态, 2: 元素进阶, 3: 觉醒神兽
  hunger: number; // 饱食度 0-100
  happiness: number; // 开心值 0-100
  cleanliness?: number; // 清洁度 0-100
  energy?: number; // 精力值 0-100
  unlocked: boolean;
  cost: number;
  accessory?: string;
  cheerPhrases: string[];
  mistakePhrases: string[];
  chatPhrases?: string[]; // 日常闲聊（陪伴感）
}

// 宠物互动道具（每种道具配独特宠物动作）
export interface PetTool {
  id: string;
  name: string;
  emoji: string;
  category: 'food' | 'toy' | 'care' | 'sleep';
  cost: number;
  hungerAdd: number;   // 饱食
  happyAdd: number;    // 开心
  cleanAdd: number;    // 清洁
  energyAdd: number;    // 精力（负数=玩耍消耗）
  animClass: string;   // 宠物独特动作
  particles: string;   // 粒子特效
  desc: string;        // 效果描述
}

// 宠物饰品
export interface PetAccessory {
  id: string;
  name: string;
  emoji: string;
  type: 'hat' | 'glasses' | 'badge' | 'wand';
  cost: number;
  unlocked: boolean;
}

// 成就系统
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  rewardCoins: number;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number;
  maxProgress: number;
}

// 每日好习惯（孩子定目标，家长定分值，按日期登记）
export interface HabitItem {
  id: string;
  name: string;            // 习惯名称
  emoji: string;           // 图标
  targetPerDay: number;    // 每日目标次数
  pointsPerTime: number;   // 每次登记得分（家长设置）
  records: Record<string, number>; // 'YYYY-MM-DD' -> 当日完成次数
}

