import React, { useState, useMemo } from 'react';
import { StoryData, ExerciseItem } from '../types';
import { generateStoryWithVocabulary, PRESET_STORIES, StoryProgress } from '../services/geminiService';
import { speakDirect, playSoundEffect, getPaletteByIndex, stopAllSpeech } from '../utils';

interface StoryGeneratorProps {
  onStartPracticeWithWords: (items: ExerciseItem[], storyTitle: string) => void;
  onStartGameWithWords: (items: ExerciseItem[], storyTitle: string) => void;
}

const TOPIC_CHIPS = [
  { topic: '激战篮球总决赛', icon: '🏀' },
  { topic: '奥特曼打怪兽', icon: '⚡' },
  { topic: '小恐龙森林历险记', icon: '🦖' },
  { topic: '魔法猫咪城堡', icon: '🐱' },
  { topic: '太空宇航员探险', icon: '🚀' },
  { topic: '深海小纵队寻宝', icon: '🐬' },
  { topic: '神奇动物狂欢节', icon: '🦁' },
  { topic: '超级赛车总动员', icon: '🏎️' }
];

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const StoryGenerator: React.FC<StoryGeneratorProps> = ({
  onStartPracticeWithWords,
  onStartGameWithWords
}) => {
  const [customTopic, setCustomTopic] = useState<string>('');
  const [baseStory, setBaseStory] = useState<StoryData>(PRESET_STORIES[0]);
  const [activeTier, setActiveTier] = useState<1 | 2 | 3 | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hoveredWordIndex, setHoveredWordIndex] = useState<number | null>(null);
  const [activeReadingSentence, setActiveReadingSentence] = useState<string | null>(null);
  // 中文朗读方言：国语 / 粤语 二选一（影响整篇朗读与逐句朗读）
  const [zhDialect, setZhDialect] = useState<'mandarin' | 'cantonese'>('mandarin');
  // 流式生成预览：AI 边写边显示（打字机效果）
  const [partialPreview, setPartialPreview] = useState<StoryProgress | null>(null);
  // 生词数量固定为 8 个（更聚焦，减少孩子压力）
  const WORDS_TARGET = 8;

  // Active story with trimmed words
  const currentStory = useMemo(() => {
    return {
      ...baseStory,
      words: baseStory.words.slice(0, WORDS_TARGET)
    };
  }, [baseStory]);

  const handleGenerate = async (topicToUse: string) => {
    if (!topicToUse.trim()) return;
    playSoundEffect('click');
    stopAllSpeech();          // 开始生成前先打断旧朗读
    setActiveReadingSentence(null);
    setPartialPreview(null);
    setIsLoading(true);
    try {
      // 流式生成：边生成边更新预览（打字机效果），新故事内容约 2-3 秒开始出现
      const result = await generateStoryWithVocabulary(topicToUse.trim(), WORDS_TARGET, (p) => {
        setPartialPreview({ ...p });
      });
      if (result) {
        // 新故事登场：打断正在进行的朗读，避免新旧故事声音叠加
        stopAllSpeech();
        setBaseStory(result);
        playSoundEffect('victory');
      } else {
        playSoundEffect('error');
      }
    } catch (e) {
      playSoundEffect('error');
    } finally {
      setIsLoading(false);
      setPartialPreview(null);
    }
  };

  const filteredWords = useMemo(() => {
    return currentStory.words.filter(w => {
      if (activeTier === 'ALL') return true;
      return w.level === activeTier;
    });
  }, [currentStory, activeTier]);

  const handleImportToPractice = () => {
    playSoundEffect('coin');
    const items: ExerciseItem[] = filteredWords.map(w => ({
      text: w.word,
      chinese: w.translation,
      phonetic: w.phonetic,
      translation: w.translation,
      example: w.example,
      difficultyLevel: w.level
    }));
    onStartPracticeWithWords(items, currentStory.titleZh);
  };

  const handleImportToGame = () => {
    playSoundEffect('coin');
    const items: ExerciseItem[] = filteredWords.map(w => ({
      text: w.word,
      chinese: w.translation,
      phonetic: w.phonetic,
      translation: w.translation,
      example: w.example,
      difficultyLevel: w.level
    }));
    onStartGameWithWords(items, currentStory.titleZh);
  };

  // Split Chinese text by sentence enders without forced line breaks
  const splitChineseSentences = (text: string): string[] => {
    const matched = text.match(/[^。！？!?\n]+[。！？!?]?|\n+/g);
    return matched ? matched.filter(s => s.trim().length > 0) : [text];
  };

  // Split English text by sentence enders without forced line breaks
  const splitEnglishSentences = (text: string): string[] => {
    const matched = text.match(/[^.!?\n]+[.!?]?|\n+/g);
    return matched ? matched.filter(s => s.trim().length > 0) : [text];
  };

  // Render tokens within a Chinese sentence (Click to speak ONLY - no auto speak on hover)
  const renderSentenceTokensZh = (sentence: string, sentIdx: number) => {
    if (!sentence || !currentStory.words.length) return sentence;

    // Filter valid translations and sort by length descending to match longer phrases first
    // 变体回退：模型译文与正文偶有"的/了/们"等尾字出入，去尾字再匹配一次，根治中文标识漏标
    const variantsOf = (t: string): string[] => {
      const list = [t];
      const stem = t.replace(/[的了吗呢们]$/, '');
      if (stem && stem !== t && stem.length >= 2) list.push(stem);
      return list;
    };
    const sortedWordsWithIndex = currentStory.words
      .map((w, origIndex) => ({ ...w, origIndex }))
      .filter(w => w.translation && w.translation.trim().length > 0)
      .sort((a, b) => b.translation.length - a.translation.length);

    if (!sortedWordsWithIndex.length) return sentence;

    // Safe regex generation for all vocabulary words（含变体，按长度降序保证长词优先）
    const variantPairs = sortedWordsWithIndex.flatMap(w => variantsOf(w.translation.trim()).map(v => ({ v, w })));
    variantPairs.sort((a, b) => b.v.length - a.v.length);
    const pattern = new RegExp(
      `(${variantPairs.map(p => escapeRegExp(p.v)).join('|')})`,
      'g'
    );

    const parts = sentence.split(pattern);
    return parts.map((part, pIdx) => {
      const match = variantPairs.find(p => p.v === part)?.w;
      if (match) {
        const palette = getPaletteByIndex(match.origIndex);
        const isHovered = hoveredWordIndex === match.origIndex;

        return (
          <span
            key={`w-${sentIdx}-${pIdx}`}
            className={`inline align-baseline font-bold px-1 py-0 mx-0.5 rounded cursor-pointer select-none box-decoration-clone transition-all duration-150 leading-tight ${
              isHovered ? 'flowing-word-box' : palette.pill
            }`}
            onMouseEnter={() => setHoveredWordIndex(match.origIndex)}
            onMouseLeave={() => setHoveredWordIndex(null)}
            title={`点击发音: ${match.word} (${match.phonetic})`}
            onClick={(e) => {
              e.stopPropagation();
              speakDirect(match.word, 'en-US', true);
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={`t-${sentIdx}-${pIdx}`}>{part}</span>;
    });
  };

  // Render tokens within an English sentence (Click to speak ONLY - no auto speak on hover)
  const renderSentenceTokensEn = (sentence: string, sentIdx: number) => {
    if (!sentence || !currentStory.words.length) return sentence;

    const sortedWordsWithIndex = currentStory.words
      .map((w, origIndex) => ({ ...w, origIndex }))
      .filter(w => w.word && w.word.trim().length > 0)
      .sort((a, b) => b.word.length - a.word.length);

    if (!sortedWordsWithIndex.length) return sentence;

    const pattern = new RegExp(
      `\\b(${sortedWordsWithIndex.map(w => escapeRegExp(w.word)).join('|')})\\b`,
      'gi'
    );

    const parts = sentence.split(pattern);
    return parts.map((part, pIdx) => {
      const match = sortedWordsWithIndex.find(
        w => w.word.toLowerCase() === part.toLowerCase()
      );
      if (match) {
        const palette = getPaletteByIndex(match.origIndex);
        const isHovered = hoveredWordIndex === match.origIndex;

        return (
          <span
            key={`w-en-${sentIdx}-${pIdx}`}
            className={`inline align-baseline font-bold px-1 py-0 mx-0.5 rounded cursor-pointer select-none box-decoration-clone transition-all duration-150 leading-tight ${
              isHovered ? 'flowing-word-box' : palette.pill
            }`}
            onMouseEnter={() => setHoveredWordIndex(match.origIndex)}
            onMouseLeave={() => setHoveredWordIndex(null)}
            title={`点击发音: ${match.word}`}
            onClick={(e) => {
              e.stopPropagation();
              speakDirect(match.word, 'en-US', true);
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={`t-en-${sentIdx}-${pIdx}`}>{part}</span>;
    });
  };

  const chineseSentences = useMemo(() => splitChineseSentences(currentStory.storyZh), [currentStory.storyZh]);
  const englishSentences = useMemo(() => splitEnglishSentences(currentStory.storyEn), [currentStory.storyEn]);

  // 流式生成中：优先显示 AI 正在写的内容（打字机效果）
  const isStreamingZh = isLoading && !!partialPreview?.storyZh;
  const isStreamingEn = isLoading && !!partialPreview?.storyEn;
  const displayZhSentences = useMemo(
    () => splitChineseSentences(isStreamingZh ? partialPreview!.storyZh! : currentStory.storyZh),
    [isStreamingZh, partialPreview, currentStory.storyZh]
  );
  const displayEnSentences = useMemo(
    () => splitEnglishSentences(isStreamingEn ? partialPreview!.storyEn! : currentStory.storyEn),
    [isStreamingEn, partialPreview, currentStory.storyEn]
  );

  // 粤语句子列表（storyZhHk 以 || 分隔，与普通话句子逐句对应；数量不匹配时按索引取，越界回退普通话）
  const cantoneseSentences = useMemo(() => {
    const hk = currentStory.storyZhHk?.trim();
    if (!hk) return [];
    return hk.split('||').map(s => s.trim()).filter(s => s.length > 0);
  }, [currentStory.storyZhHk]);

  // 取第 idx 句的朗读文本：粤语模式下优先地道粤语句子
  const getSpokenZh = (idx: number): { text: string; lang: 'zh-CN' | 'zh-HK' } => {
    if (zhDialect === 'cantonese') {
      const hk = cantoneseSentences[idx];
      if (hk) return { text: hk, lang: 'zh-HK' };
      return { text: chineseSentences[idx] || currentStory.storyZh, lang: 'zh-HK' }; // 回退：普通话文本交给转换器
    }
    return { text: chineseSentences[idx] || currentStory.storyZh, lang: 'zh-CN' };
  };

  // 整篇朗读文本（粤语模式优先地道粤语全文，其次普通话全文交由 TTS 转换）
  // 粤语版按句用换行拼接：换行会在 TTS 里转成句间停顿，杜绝生硬连读
  const fullZhSpokenText = useMemo(() => {
    if (zhDialect === 'cantonese') {
      if (cantoneseSentences.length > 0) {
        // 确保每句以结束标点收尾（AI 偶尔漏掉，没有标点 TTS 就不会停顿）
        return cantoneseSentences
          .map(s => {
            const t = s.trim();
            return /[。！？！？.!?…，,、]$/.test(t) ? t : t + '。';
          })
          .join('\n');
      }
      return currentStory.storyZh;
    }
    return currentStory.storyZh;
  }, [zhDialect, cantoneseSentences, currentStory.storyZh]);

  // ===== 生成进度（孩子友好的等待反馈：进度条 + 阶段提示 + 小青蛙领跑）=====
  const { genPct, genStageMsg, genStages } = useMemo(() => {
    if (!isLoading) return { genPct: 0, genStageMsg: '', genStages: [] as { icon: string; label: string; done: boolean }[] };

    // 阶段完成判定（JSON 字段顺序：titleZh → storyEn → words → storyZh → storyZhHk）
    const stages = [
      { icon: '🎨', label: '构思', done: !!partialPreview?.titleZh },
      { icon: '🌍', label: '英文', done: !!partialPreview?.storyEn },
      { icon: '🎯', label: '单词', done: (partialPreview?.wordsFound ?? 0) >= WORDS_TARGET },
      { icon: '📖', label: '中文', done: !!partialPreview?.storyZhHk },
      { icon: '🗣️', label: '粤语', done: false }
    ];

    let pct = 4;
    let msg = '🪄 正在召唤故事精灵…';
    if (partialPreview?.titleZh) { pct = 10; msg = '✨ 想到故事啦，正在动笔！'; }
    const enLen = partialPreview?.storyEn?.length ?? 0;
    if (enLen > 0) {
      pct = Math.max(pct, 10 + Math.min(35, Math.round(enLen / 700 * 35)));
      msg = enLen < 250 ? '🌍 英文故事创作中…' : '🌍 英文主稿完成！';
    }
    const wc = partialPreview?.wordsFound ?? 0;
    if (wc > 0) {
      pct = Math.max(pct, 48 + Math.min(20, Math.round(wc / WORDS_TARGET * 20)));
      msg = `🎯 正在挑选魔法单词 ${wc}/${WORDS_TARGET}…`;
    }
    const zhLen = partialPreview?.storyZh?.length ?? 0;
    if (zhLen > 0) {
      pct = Math.max(pct, 70 + Math.min(20, Math.round(zhLen / 180 * 20)));
      msg = zhLen < 60 ? '📖 翻译成中文故事开写咯…' : zhLen < 130 ? '📖 中文故事越来越精彩…' : '📖 中文故事写好啦！';
    }
    if (partialPreview?.storyZhHk) { pct = Math.max(pct, 92); msg = '🗣️ 变身地道粤语版…'; }
    return { genPct: Math.min(pct, 96), genStageMsg: msg, genStages: stages };
  }, [isLoading, partialPreview]);

  return (
    <div className="w-full max-w-[1760px] px-2 md:px-4 flex flex-col gap-4 animate-fade-in mx-auto">
      {/* 1. Top Story Generator Banner: Widescreen, Extra Large Font & Single-Row Topics */}
      <div className="story-card p-4 md:p-5 flex flex-col gap-3 relative overflow-hidden">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
          {/* Magnified Input Box (+50% Font Size) */}
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customTopic) {
                  handleGenerate(customTopic);
                }
              }}
              placeholder="✨ 输入主题（如：奥特曼打怪兽、恐龙探险、赛车争霸...）"
              className="flex-1 px-5 py-3 rounded-2xl bg-[#FFF8EE] text-[#5B4636] placeholder-[#C4AE97] font-black text-base md:text-xl focus:outline-none focus:ring-4 focus:ring-[#FFC94D] shadow-inner border-3 border-[#FFE8C8]"
            />
            <button
              onClick={() => handleGenerate(customTopic)}
              disabled={isLoading || !customTopic.trim()}
              className="btn-candy btn-grape px-6 py-3 text-base md:text-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isLoading ? (
                <span className="animate-spin text-xl">🪄</span>
              ) : (
                <span>生成故事 🚀</span>
              )}
            </button>
          </div>
        </div>

        {/* Recommended Topics: 1 Single Neat Row Across Full Widescreen */}
        <div className="flex items-center gap-2 overflow-x-auto xl:overflow-visible flex-nowrap scrollbar-none pt-0.5">
          <span className="text-sm text-[#8258C7] font-black flex items-center gap-1 shrink-0">
            <span>🔥</span> 热门:
          </span>
          {TOPIC_CHIPS.map((chip) => (
            <button
              key={chip.topic}
              onClick={() => {
                setCustomTopic(chip.topic);
                handleGenerate(chip.topic);
              }}
              disabled={isLoading}
              className="bg-[#F3E9FA] hover:bg-[#E2D0F2] px-3 py-1.5 rounded-xl text-sm font-bold text-[#5B4636] flex items-center gap-1.5 transition-all border-2 border-[#E2D0F2] active:scale-95 shrink-0 cursor-pointer"
            >
              <span>{chip.icon}</span>
              <span>{chip.topic}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 生成进度条：孩子友好的等待反馈 */}
      {isLoading && (
        <div className="story-card p-4 md:p-5 flex flex-col gap-2.5 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm md:text-base font-black text-[#8258C7] font-kids flex items-center gap-2 truncate">
              <span className="text-2xl animate-wiggle inline-block shrink-0">🪄</span>
              <span className="truncate">{genStageMsg}</span>
            </span>
            <span className="text-xl font-black text-[#E0633A] font-kids shrink-0">{genPct}%</span>
          </div>

          {/* 进度条 + 领跑的小青蛙 */}
          <div className="h-7 bg-[#F5EBDA] rounded-full overflow-hidden relative border-3 border-[#EADBC2]">
            <div
              className="h-full bg-gradient-to-r from-[#FFC94D] via-[#FF8A5C] to-[#A57DE0] rounded-full transition-all duration-500 ease-out relative"
              style={{ width: `${genPct}%` }}
            >
              <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-xl animate-bounce select-none">🐸</span>
            </div>
          </div>

          {/* 五阶段图例 */}
          <div className="flex justify-between text-[10px] md:text-xs font-black px-1">
            {genStages.map((s, i) => (
              <span key={i} className={`flex items-center gap-1 transition-colors ${s.done ? 'text-[#48A757]' : 'text-[#C4AE97]'}`}>
                <span>{s.done ? '✅' : s.icon}</span>
                <span>{s.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 2. Main Synchronized Stage: Story Left (Upper & Lower Stack) & Compact Word Cards Right */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left: Expanded Story Reading Stage (8 cols for 10-words mode, 7 cols for 15-words mode) */}
        <div className="xl:col-span-8 story-card p-4 md:p-5 flex flex-col justify-between">
          {/* Compact Single-Row Header: Single Chinese Title + Compact Inline Voice Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#F5EBDA] pb-2.5 gap-2">
            {/* 1-Line Chinese Title Only */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs md:text-sm font-black text-[#8258C7] bg-[#F3E9FA] px-2.5 py-0.5 rounded-full border border-[#E2D0F2] shrink-0">
                {currentStory.topic}
              </span>
              <h2 className="text-xl md:text-2xl font-black text-[#5B4636] font-kids truncate">
                {isLoading && partialPreview?.titleZh ? partialPreview.titleZh : currentStory.titleZh}
                {isLoading && partialPreview?.titleZh && <span className="inline-block w-[3px] h-[0.9em] align-[-0.1em] bg-[#8258C7] animate-pulse ml-0.5" />}
              </h2>
            </div>

            {/* Compressed Voice Action Buttons Inline with Title */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 国语 / 粤语 二选一切换 */}
              <div className="flex items-center bg-[#FFF8EE] p-1 rounded-xl border-2 border-[#EADBC2]">
                <button
                  onClick={() => { playSoundEffect('click'); if (zhDialect !== 'mandarin') stopAllSpeech(); setZhDialect('mandarin'); }}
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-black transition-all flex items-center gap-1 ${
                    zhDialect === 'mandarin'
                      ? 'bg-[#FFC94D] text-[#7A4A00] shadow-[0_2px_0_#E8A317]'
                      : 'text-[#8A6F5C] hover:bg-white'
                  }`}
                  title="普通话朗读模式"
                >
                  <span>🔊</span> 国语
                </button>
                <button
                  onClick={() => { playSoundEffect('click'); if (zhDialect !== 'cantonese') stopAllSpeech(); setZhDialect('cantonese'); }}
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-black transition-all flex items-center gap-1 ${
                    zhDialect === 'cantonese'
                      ? 'bg-[#6BCB77] text-white shadow-[0_2px_0_#48A757]'
                      : 'text-[#8A6F5C] hover:bg-white'
                  }`}
                  title="粤语口语讲故事模式"
                >
                  <span>🗣️</span> 粤语
                </button>
              </div>

              {/* 整篇朗读按钮（跟随方言模式） */}
              <button
                onClick={() => speakDirect(fullZhSpokenText, zhDialect === 'cantonese' ? 'zh-HK' : 'zh-CN', true)}
                className={`text-xs md:text-sm px-3.5 py-1.5 rounded-xl font-black flex items-center gap-1 transition-transform active:scale-95 cursor-pointer ${
                  zhDialect === 'cantonese'
                    ? 'bg-gradient-to-r from-[#6BCB77] to-[#5FD0C8] text-white shadow-[0_3px_0_#48A757]'
                    : 'bg-[#FFC94D] text-[#7A4A00] shadow-[0_3px_0_#E8A317]'
                }`}
                title={zhDialect === 'cantonese' ? '用地道粤语讲成个故事' : '普通话朗读整篇故事'}
              >
                <span>▶</span> 讲故事
              </button>

              {/* English Voice */}
              <button
                onClick={() => speakDirect(currentStory.storyEn, 'en-US', true, { slow: true })}
                className="text-xs md:text-sm bg-[#E3F2FA] text-[#2E93C4] border-2 border-[#BBE2F2] hover:bg-[#D3EAF6] px-3 py-1.5 rounded-xl font-black flex items-center gap-1 transition-transform active:scale-95 cursor-pointer"
                title="英文朗读"
              >
                <span>🔤</span> 英文
              </button>
            </div>
          </div>

          {/* Bilingual Dual Reading Areas: Side-by-Side (左右关系) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-2.5 flex-1">
            {/* 1. Chinese Story Box (Left) */}
            <div className="bg-[#FFF8EE]/75 p-3.5 md:p-4 rounded-2xl border border-[#FFE3A3]/90 flex flex-col shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-[#7A4A00] bg-[#FFE3A3]/80 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                  <span>📖</span> 中文故事
                </span>
                {isLoading && (
                  <span className="text-xs font-black text-[#8258C7] bg-[#F3E9FA] px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                    <span className="animate-spin inline-block">✨</span> AI 正在创作...
                  </span>
                )}
                {!isLoading && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    zhDialect === 'cantonese' ? 'text-[#357F43] bg-[#E5F6EC]' : 'text-[#B8860B]/80'
                  }`}>
                    {zhDialect === 'cantonese' ? '🗣️ 粤语模式 · 点句用粤语读' : '点句朗读 · 点词发音'}
                  </span>
                )}
              </div>

              {/* Flowing Chinese Paragraph (+10% Font Size) */}
              <p className="text-[#5B4636] text-[1.22rem] md:text-[1.36rem] leading-[1.8] tracking-wide font-sans m-0 flex-1">
                {displayZhSentences.map((sent, sentIdx) => {
                  const isReading = activeReadingSentence === sent;
                  const isContainingHoveredWord = hoveredWordIndex !== null && currentStory.words[hoveredWordIndex] && (
                    Boolean(currentStory.words[hoveredWordIndex].translation && sent.includes(currentStory.words[hoveredWordIndex].translation))
                  );

                  return (
                    <span
                      key={sentIdx}
                      onClick={() => {
                        setActiveReadingSentence(sent);
                        // 逐句朗读：粤语模式读地道粤语句子，国语模式读普通话
                        const spoken = getSpokenZh(sentIdx);
                        speakDirect(spoken.text, spoken.lang, true);
                      }}
                      className={`story-sentence inline cursor-pointer select-none rounded-md px-1 transition-all duration-150 box-decoration-clone ${
                        isReading
                          ? 'text-[#5B4636] font-black ring-2 ring-[#E8A317] rounded-md'
                          : isContainingHoveredWord
                          ? 'bg-[#FFF3D6]/60 text-[#7A4A00]'
                          : ''
                      }`}
                      title={zhDialect === 'cantonese' ? '点击用粤语朗读本句' : '点击朗读本句'}
                    >
                      {renderSentenceTokensZh(sent, sentIdx)}
                    </span>
                  );
                })}
                {isStreamingZh && (
                  <span className="inline-block w-[3px] h-[1.1em] align-[-0.15em] bg-[#8258C7] animate-pulse ml-0.5" />
                )}
              </p>
            </div>

            {/* 2. English Story Box (Right) */}
            <div className="bg-[#E3F2FA]/75 p-3.5 md:p-4 rounded-2xl border border-[#BBE2F2]/90 flex flex-col shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-[#2E93C4] bg-[#BBE2F2]/80 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                  <span>🌟</span> English Story
                </span>
                {isLoading ? (
                  <span className="text-xs font-black text-[#2E93C4] bg-[#E3F2FA] px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                    <span className="animate-spin inline-block">✨</span> Writing...
                  </span>
                ) : (
                  <span className="text-xs text-[#2E93C4]/80 font-bold">Click to Read</span>
                )}
              </div>

              {/* Flowing English Paragraph (+10% Font Size) */}
              <p className="text-[#5B4636] text-[1.22rem] md:text-[1.36rem] leading-[1.8] tracking-wide font-sans m-0 flex-1">
                {displayEnSentences.map((sent, sentIdx) => {
                  const isReading = activeReadingSentence === sent;
                  const isContainingHoveredWord = hoveredWordIndex !== null && currentStory.words[hoveredWordIndex] && (
                    Boolean(currentStory.words[hoveredWordIndex].word && new RegExp(`\\b${escapeRegExp(currentStory.words[hoveredWordIndex].word)}\\b`, 'i').test(sent))
                  );

                  return (
                    <span
                      key={sentIdx}
                      onClick={() => {
                        setActiveReadingSentence(sent);
                        speakDirect(sent, 'en-US', true, { slow: true });
                      }}
                      className={`story-sentence inline cursor-pointer select-none rounded-md px-1 transition-all duration-150 box-decoration-clone ${
                        isReading
                          ? 'text-[#5B4636] font-black ring-2 ring-[#E8A317] rounded-md'
                          : isContainingHoveredWord
                          ? 'bg-[#FFF3D6]/60 text-[#7A4A00]'
                          : ''
                      }`}
                      title="Click to read sentence"
                    >
                      {renderSentenceTokensEn(sent, sentIdx)}
                    </span>
                  );
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Fixed 5-Row Compact Vocabulary Deck (4 cols for 10-words, 5 cols for 15-words) */}
        <div className="xl:col-span-4 story-card p-4 md:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-[#F5EBDA]">
            <h3 className="text-lg md:text-xl font-black text-[#5B4636] flex items-center gap-1.5 font-kids">
              <span>🎯 核心单词</span>
              <span className="text-xs bg-[#F3E9FA] text-[#8258C7] px-2.5 py-0.5 rounded-full font-black">
                {filteredWords.length} 词
              </span>
            </h3>

            {/* Tier Filters */}
            <div className="flex items-center gap-1 bg-[#FFF8EE] p-1 rounded-xl text-xs font-black border-2 border-[#EADBC2]">
              <button
                onClick={() => setActiveTier('ALL')}
                className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                  activeTier === 'ALL'
                    ? 'bg-[#A57DE0] text-white shadow-[0_2px_0_#8258C7]'
                    : 'text-[#8A6F5C] hover:bg-white hover:shadow-2xs'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setActiveTier(1)}
                className={`px-1.5 py-0.5 rounded-lg transition-all flex items-center gap-0.5 cursor-pointer ${
                  activeTier === 1
                    ? 'bg-[#6BCB77] text-white shadow-[0_2px_0_#48A757]'
                    : 'text-[#8A6F5C] hover:bg-white hover:shadow-2xs'
                }`}
              >
                <span>🌱</span> Lv.1
              </button>
              <button
                onClick={() => setActiveTier(2)}
                className={`px-1.5 py-0.5 rounded-lg transition-all flex items-center gap-0.5 cursor-pointer ${
                  activeTier === 2
                    ? 'bg-[#FFC94D] text-[#7A4A00] shadow-[0_2px_0_#E8A317]'
                    : 'text-[#8A6F5C] hover:bg-white hover:shadow-2xs'
                }`}
              >
                <span>🌿</span> Lv.2
              </button>
              <button
                onClick={() => setActiveTier(3)}
                className={`px-1.5 py-0.5 rounded-lg transition-all flex items-center gap-0.5 cursor-pointer ${
                  activeTier === 3
                    ? 'bg-[#FF8FAB] text-white shadow-[0_2px_0_#E0678A]'
                    : 'text-[#8A6F5C] hover:bg-white hover:shadow-2xs'
                }`}
              >
                <span>🌳</span> Lv.3
              </button>
            </div>
          </div>

          {/* Grid Layout: Exactly 5 items per column (2 cols if 10 words, 3 cols if 15 words) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-2 my-2">
            {filteredWords.map((item) => {
              const origIndex = currentStory.words.findIndex(w => w.word === item.word);
              const actualIdx = origIndex >= 0 ? origIndex : 0;
              const palette = getPaletteByIndex(actualIdx);
              const isHovered = hoveredWordIndex === actualIdx;

              return (
                <div
                  key={item.word}
                  onMouseEnter={() => setHoveredWordIndex(actualIdx)}
                  onMouseLeave={() => setHoveredWordIndex(null)}
                  onClick={() => speakDirect(item.word, 'en-US', true)}
                  className={`p-0.5 rounded-2xl transition-all duration-200 group cursor-pointer ${
                    isHovered ? 'flowing-gold-card scale-102 shadow-lg' : 'bg-transparent'
                  }`}
                >
                  <div
                    className={`p-2 rounded-[14px] border flex items-center gap-2 transition-all duration-150 ${
                      isHovered
                        ? `${palette.bgLight} ${palette.borderColor}`
                        : 'bg-[#FFF8EE]/90 border-[#EADBC2] hover:bg-white hover:border-[#A57DE0] hover:shadow-2xs'
                    }`}
                    title="点击朗读发音"
                  >
                    {/* Index Badge */}
                    <span className={`w-5 h-5 rounded-full ${palette.numberTag} text-xs font-black flex items-center justify-center shrink-0 shadow-2xs`}>
                      {actualIdx + 1}
                    </span>

                    {/* 左：英文单词 + 下方音标 */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xl md:text-2xl font-black text-[#5B4636] font-kids tracking-wide truncate leading-tight">
                        {item.word}
                      </span>
                      {item.phonetic && (
                        <span className="text-sm md:text-base text-[#8A6F5C] font-mono font-medium italic truncate leading-tight">
                          {item.phonetic}
                        </span>
                      )}
                    </div>

                    {/* 右：中文翻译（利用右侧空间，垂直居中） */}
                    <span className={`text-base md:text-lg font-black ${palette.textColor} shrink-0 text-right leading-tight max-w-[38%]`}>
                      {item.translation}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Action Launchers */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F5EBDA]">
            <button
              onClick={handleImportToPractice}
              className="btn-candy btn-sky py-2.5 px-3 text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>⌨️</span>
              <span>打字练习</span>
            </button>

            <button
              onClick={handleImportToGame}
              className="btn-candy btn-honey py-2.5 px-3 text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>🎮</span>
              <span>玩小游戏</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryGenerator;
