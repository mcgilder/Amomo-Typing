import React, { useState, useMemo } from 'react';
import { TEXTBOOK_RESOURCES } from '../../constants';
import { ExerciseItem, Mode } from '../../types';
import { playSoundEffect } from '../../utils';
import { GameItem, DIFFICULTY_LEVELS, GameDifficulty } from './shared';
import { FrogMazeGame } from './FrogMazeGame';
import { WhackMoleGame } from './WhackMoleGame';
import { RacingGame } from './RacingGame';
import { LetterRainGame } from './LetterRainGame';
import { BalloonPartyGame } from './BalloonPartyGame';
import { SpaceShipGame } from './SpaceShipGame';
import { FishingGame } from './FishingGame';
import { MountainClimbGame } from './MountainClimbGame';

export interface GameHubProps {
  customWordList?: ExerciseItem[];
  customTitle?: string;
  onEarnCoins?: (amount: number) => void;
  onRecordGameStat?: (gameName: string, score: number, accuracy: number) => void;
}

type GameId = 'FROG' | 'MOLE' | 'RACE' | 'RAIN' | 'BALLOON' | 'SPACE' | 'FISH' | 'CLIMB';

interface GameCard {
  id: GameId;
  emoji: string;
  name: string;
  desc: string;
  tag: string;
  btnClass: string;
  iconBg: string;
}

const GAME_CARDS: GameCard[] = [
  {
    id: 'RAIN', emoji: '🌧️', name: '字母雨·小猫打伞',
    desc: '雨滴掉下来啦！敲对字母给小猫撑伞，听小猫开心喵喵笑～',
    tag: '入门·打字母', btnClass: 'btn-grape', iconBg: 'bg-[#F3E9FA] border-[#E2D0F2]'
  },
  {
    id: 'FROG', emoji: '🐸', name: '小青蛙找妈妈',
    desc: '看着地图选路线，敲对单词跳荷叶，找到青蛙妈妈！',
    tag: '迷宫探索', btnClass: 'btn-grass', iconBg: 'bg-[#E5F6EC] border-[#C8EED4]'
  },
  {
    id: 'MOLE', emoji: '🔨', name: '打地鼠·极速',
    desc: '贱萌地鼠举着单词钻出来！连击越高冒得越快，金地鼠双倍分！',
    tag: '速度反应', btnClass: 'btn-honey', iconBg: 'bg-[#FFF3D6] border-[#FFE3A3]'
  },
  {
    id: 'RACE', emoji: '🏎️', name: '闪避赛车',
    desc: '敲对单词点燃氮气！换道躲开油桶，追上蓝色对手车冲过终点！',
    tag: '竞速闪避', btnClass: 'btn-coral', iconBg: 'bg-[#FFE9E0] border-[#FFD1BE]'
  },
  {
    id: 'BALLOON', emoji: '🎈', name: '气球派对',
    desc: '气球带着字母飞上天！敲对字母把气球砰砰炸开，小心炸弹！',
    tag: '限时挑战', btnClass: 'btn-berry', iconBg: 'bg-[#FFE9F0] border-[#FFD3E0]'
  },
  {
    id: 'SPACE', emoji: '🚀', name: '星际飞船',
    desc: '陨石驮着单词砸下来！敲单词发射激光，还有巨型BOSS陨石！',
    tag: '太空射击', btnClass: 'btn-sky', iconBg: 'bg-[#E3F2FA] border-[#BBE2F2]'
  },
  {
    id: 'FISH', emoji: '🎣', name: '小猫钓鱼',
    desc: '鱼儿驮着单词游来游去，敲单词下钩钓上来！金色锦鲤三倍分～',
    tag: '悠闲专注', btnClass: 'btn-sky', iconBg: 'bg-[#E3F2FA] border-[#BBE2F2]'
  },
  {
    id: 'CLIMB', emoji: '⛰️', name: '登山小勇士',
    desc: '敲完一个词跳一阶！穿过云海星空登顶看日出，营地有篝火～',
    tag: '勇攀高峰', btnClass: 'btn-coral', iconBg: 'bg-[#FFE9E0] border-[#FFD1BE]'
  },
];

export const GameHub: React.FC<GameHubProps> = ({ customWordList, customTitle, onEarnCoins }) => {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [selectedMode, setSelectedMode] = useState<Mode>(Mode.ENGLISH);
  const [selectedBook, setSelectedBook] = useState<string>('GRADE 1-Fall');
  const [difficulty, setDifficulty] = useState<GameDifficulty>(() => {
    const saved = Number(localStorage.getItem('amomo_typing_difficulty_v2'));
    return saved >= 1 && saved <= 6 ? (saved as GameDifficulty) : 3;
  });

  const changeDifficulty = (d: GameDifficulty) => {
    playSoundEffect('click');
    setDifficulty(d);
    localStorage.setItem('amomo_typing_difficulty_v2', String(d));
  };

  const wordList: GameItem[] = useMemo(() => {
    if (customWordList && customWordList.length > 0) {
      return customWordList.map(item => ({
        typing: item.text,
        display: item.chinese || item.text
      }));
    }
    const langKey = selectedMode === Mode.ENGLISH ? '英语' : '语文';
    const items = TEXTBOOK_RESOURCES[langKey]?.[selectedBook] || [];
    // 默认乱序随机出词：每次切换课本/模式重新洗牌，玩起来不枯燥
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map(item => ({
      typing: item.text,
      display: selectedMode === Mode.ENGLISH ? item.text : (item.chinese || item.text)
    }));
  }, [selectedBook, selectedMode, customWordList]);

  const launch = (id: GameId) => {
    playSoundEffect('click');
    setActiveGame(id);
  };

  const commonProps = { wordList, onEarnCoins, onBack: () => setActiveGame(null), difficulty };

  if (activeGame === 'FROG') return <FrogMazeGame {...commonProps} />;
  if (activeGame === 'MOLE') return <WhackMoleGame {...commonProps} />;
  if (activeGame === 'RACE') return <RacingGame {...commonProps} />;
  if (activeGame === 'RAIN') return <LetterRainGame {...commonProps} />;
  if (activeGame === 'BALLOON') return <BalloonPartyGame {...commonProps} />;
  if (activeGame === 'SPACE') return <SpaceShipGame {...commonProps} />;
  if (activeGame === 'FISH') return <FishingGame {...commonProps} />;
  if (activeGame === 'CLIMB') return <MountainClimbGame {...commonProps} />;

  return (
    <div className="w-full max-w-6xl flex flex-col gap-6 animate-fade-in mx-auto px-4">
      {/* 顶部横幅 */}
      <div className="story-card p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-4xl animate-float-y select-none">🎮</span>
            <h2 className="text-2xl md:text-3xl font-black text-[#5B4636] font-kids">趣味游戏乐园</h2>

            {/* 难度调节（移到标题右侧）：6 档，默认 3 档（乌龟最慢 → 火箭最快） */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-black text-[#8A6F5C]">⚡ 游戏难度</span>
              <div className="flex items-center gap-1 bg-[#FFF8EE] p-1 rounded-2xl border-3 border-[#FFE8C8]">
                {DIFFICULTY_LEVELS.map(d => (
                  <button
                    key={d.level}
                    onClick={() => changeDifficulty(d.level)}
                    title={d.hint}
                    className={`w-8 h-8 rounded-xl text-sm font-black transition-all ${
                      difficulty === d.level
                        ? 'bg-[#FF8A5C] text-white shadow-[0_3px_0_#E0633A] scale-110'
                        : 'text-[#8A6F5C] hover:bg-white'
                    }`}
                  >
                    {d.level}
                  </button>
                ))}
              </div>
              <span className="text-[13px] font-black text-[#E0633A] bg-[#FFE9E0] px-2.5 py-1 rounded-full border-2 border-[#FFD1BE]">
                {DIFFICULTY_LEVELS[difficulty - 1].label}
              </span>
            </div>
          </div>
          <p className="text-xs md:text-sm text-[#8A6F5C] font-bold mt-1.5">
            {customTitle ? `正在使用专属词库：${customTitle}` : '八大游戏边玩边练，每个游戏都赚金币养宠物！'}
          </p>
        </div>

        {/* 词库来源选择 */}
        {!customWordList && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 bg-[#FFF8EE] p-1.5 rounded-2xl border-3 border-[#FFE8C8]">
              <button
                onClick={() => { setSelectedMode(Mode.ENGLISH); setSelectedBook('GRADE 1-Fall'); }}
                className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${
                  selectedMode === Mode.ENGLISH ? 'bg-[#FF8A5C] text-white shadow-[0_3px_0_#E0633A]' : 'text-[#8A6F5C] hover:bg-white'
                }`}
              >
                🔤 英语单词
              </button>
              <button
                onClick={() => { setSelectedMode(Mode.CHINESE); setSelectedBook('语文一年级上册'); }}
                className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${
                  selectedMode === Mode.CHINESE ? 'bg-[#6BCB77] text-white shadow-[0_3px_0_#48A757]' : 'text-[#8A6F5C] hover:bg-white'
                }`}
              >
                🇨🇳 语文拼音
              </button>
            </div>
            <select
              className="bg-white border-3 border-[#FFE8C8] px-4 py-2 rounded-2xl text-xs font-black outline-none text-[#5B4636] shadow-[0_3px_0_rgba(222,184,135,0.25)] min-w-[240px]"
              value={selectedBook}
              onChange={(e) => setSelectedBook(e.target.value)}
            >
              {Object.keys(TEXTBOOK_RESOURCES[selectedMode === Mode.ENGLISH ? '英语' : '语文']).map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <span className="text-[10px] text-[#8A6F5C] font-bold text-center">
              乱序随机出词 · 人教版同步
            </span>
          </div>
        )}
      </div>

      {/* 8 个游戏卡片：图标居左，名称+类型居右利用横向空间 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {GAME_CARDS.map(card => (
          <div
            key={card.id}
            onClick={() => launch(card.id)}
            className="story-card p-5 flex flex-col justify-between gap-3 cursor-pointer hover:-translate-y-1.5 hover:shadow-[0_10px_0_rgba(222,184,135,0.3)] transition-all duration-200 group"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-14 h-14 rounded-2xl border-3 flex items-center justify-center text-3xl shrink-0 group-hover:animate-wiggle shadow-[0_4px_0_rgba(0,0,0,0.07)] ${card.iconBg}`}>
                  {card.emoji}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-base font-black text-[#5B4636] font-kids leading-tight">{card.name}</h3>
                  <span className="self-start mt-1 text-[10px] font-black text-[#8A6F5C] bg-[#FFF8EE] border-2 border-[#FFE8C8] px-2 py-0.5 rounded-full">{card.tag}</span>
                </div>
              </div>
              <p className="text-[15px] md:text-[16px] text-[#8A6F5C] font-bold leading-snug line-clamp-2 min-h-[44px]">{card.desc}</p>
            </div>
            <button className={`btn-candy ${card.btnClass} w-full py-2.5 text-xs`}>
              开始冒险 →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameHub;
