import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mode, Tab, TypingStats, ExerciseItem, PetItem, PetAccessory, PetTool, Achievement } from './types';
import { TEXTBOOK_RESOURCES, KEYBOARD_LAYOUT } from './constants';
import { EN_EXAMPLE_ZH } from './enExampleZh';
import LayoutTuner, { loadTune, saveTune, LayoutTune, TargetTune } from './components/LayoutTuner';
import {
  speakDirect,
  prewarmSpeech,
  playPraiseAndExample,
  playPraiseVoice,
  splitSyllables,
  getSyllableColor,
  playSoundEffect,
  getPinyinWithTones
} from './utils';
import Keyboard from './components/Keyboard';
import Statistics, { INITIAL_ACHIEVEMENTS } from './components/Statistics';
import TypingGame from './components/TypingGame';
import StoryGenerator from './components/StoryGenerator';
import DesktopPet, { INITIAL_PETS, ACCESSORIES } from './components/DesktopPet';
import FloatingCompanion from './components/FloatingCompanion';
import HabitTracker from './components/HabitTracker';

const LOCAL_STORAGE_KEY_STATS = 'amomo_typing_stats_v2';
const LOCAL_STORAGE_KEY_PETS = 'amomo_typing_pets_v2';
const LOCAL_STORAGE_KEY_COINS = 'amomo_typing_coins_v2';
const LOCAL_STORAGE_KEY_ACC = 'amomo_typing_accessories_v2';
const LOCAL_STORAGE_KEY_ACHIEVEMENTS = 'amomo_typing_achievements_v2';
// 应用名称（首页标题可自定义，存档在 localStorage）
const LOCAL_STORAGE_KEY_APP_NAME = 'amomo_typing_appname_v2';
const DEFAULT_APP_NAME = '阿墨墨打字通';

// 旧版存档升级：补齐新字段
const normalizePets = (pets: PetItem[]): PetItem[] =>
  pets.map(p => ({
    ...p,
    cleanliness: p.cleanliness ?? 80,
    energy: p.energy ?? 80
  }));

// 为任意元素生成稳定 CSS 选择器（向上最多 6 层，同级用 nth-of-type 区分）
const genSel = (el: Element): string => {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur !== document.body && depth < 6) {
    let sel = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
      if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
    }
    parts.unshift(sel);
    cur = parent;
    depth++;
  }
  return parts.join(' > ');
};
const hashSel = (sel: string): string =>
  'pick_' + Math.abs(Array.from(sel).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PRACTICE);
  const [mode, setMode] = useState<Mode>(Mode.ENGLISH);
  const [selectedBook, setSelectedBook] = useState<string>('GRADE 1-Fall');
  const [exerciseList, setExerciseList] = useState<ExerciseItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputBuffer, setInputBuffer] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isRandom, setIsRandom] = useState(false);
  const [isWaitingForSpace, setIsWaitingForSpace] = useState(false);
  // 根容器引用：自动聚焦，保证进入练习页后直接敲键盘就能输入（无需先点击页面）
  const rootRef = useRef<HTMLDivElement>(null);

  // 首页应用名称：可点击 ✏️ 修改，存档 localStorage，浏览器标签页标题同步
  const [appName, setAppName] = useState<string>(() => {
    try { return localStorage.getItem(LOCAL_STORAGE_KEY_APP_NAME) || DEFAULT_APP_NAME; } catch { return DEFAULT_APP_NAME; }
  });
  const [editingAppName, setEditingAppName] = useState(false);
  const [appNameDraft, setAppNameDraft] = useState('');

  useEffect(() => {
    document.title = `${appName} - 快乐学打字`;
  }, [appName]);

  const confirmAppName = () => {
    const t = appNameDraft.trim();
    const finalName = t || DEFAULT_APP_NAME;   // 空名回退默认，避免标题消失
    setAppName(finalName);
    try { localStorage.setItem(LOCAL_STORAGE_KEY_APP_NAME, finalName); } catch { /* ignore */ }
    setEditingAppName(false);
    playSoundEffect('victory');
  };
  const startEditAppName = () => {
    setAppNameDraft(appName);
    setEditingAppName(true);
    playSoundEffect('click');
  };

  // Custom Practice/Story title
  const [customPracticeTitle, setCustomPracticeTitle] = useState<string>('');
  const [gameCustomWords, setGameCustomWords] = useState<ExerciseItem[] | undefined>(undefined);
  const [gameCustomTitle, setGameCustomTitle] = useState<string | undefined>(undefined);

  // Praise and Audio Settings
  const [praiseDialect, setPraiseDialect] = useState<'cantonese' | 'mandarin' | 'english'>('cantonese');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Combo and Real-time Action state for Companion
  const [combo, setCombo] = useState<number>(0);
  const [maxComboInSession, setMaxComboInSession] = useState<number>(0);
  const [lastAction, setLastAction] = useState<'correct' | 'error' | 'idle' | 'level_up' | 'victory' | null>(null);

  // Persistent Economy & Pets
  const [coins, setCoins] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_COINS);
      return saved ? parseInt(saved, 10) : 50;
    } catch {
      return 50;
    }
  });

  const [pets, setPets] = useState<PetItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_PETS);
      return saved ? normalizePets(JSON.parse(saved)) : INITIAL_PETS;
    } catch {
      return INITIAL_PETS;
    }
  });

  const [currentPetId, setCurrentPetId] = useState<string>('cat');

  const [accessories, setAccessories] = useState<PetAccessory[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_ACC);
      return saved ? JSON.parse(saved) : ACCESSORIES;
    } catch {
      return ACCESSORIES;
    }
  });

  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_ACHIEVEMENTS);
      return saved ? JSON.parse(saved) : INITIAL_ACHIEVEMENTS;
    } catch {
      return INITIAL_ACHIEVEMENTS;
    }
  });

  // Persistent Stats History
  const [sessionStats, setSessionStats] = useState<TypingStats[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_STATS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentStats, setCurrentStats] = useState({
    correct: 0,
    total: 0,
    startTime: 0,
    errors: {} as Record<string, number>
  });

  // Save to localStorage
  useEffect(() => {
    try { localStorage.setItem(LOCAL_STORAGE_KEY_COINS, coins.toString()); } catch (e) {}
  }, [coins]);

  useEffect(() => {
    try { localStorage.setItem(LOCAL_STORAGE_KEY_PETS, JSON.stringify(pets)); } catch (e) {}
  }, [pets]);

  useEffect(() => {
    try { localStorage.setItem(LOCAL_STORAGE_KEY_ACC, JSON.stringify(accessories)); } catch (e) {}
  }, [accessories]);

  useEffect(() => {
    try { localStorage.setItem(LOCAL_STORAGE_KEY_ACHIEVEMENTS, JSON.stringify(achievements)); } catch (e) {}
  }, [achievements]);

  useEffect(() => {
    try { localStorage.setItem(LOCAL_STORAGE_KEY_STATS, JSON.stringify(sessionStats)); } catch (e) {}
  }, [sessionStats]);

  // Current active pet
  const activePet = useMemo(() => {
    return pets.find(p => p.id === currentPetId) || pets[0];
  }, [pets, currentPetId]);

  // Current equipped accessory
  const activeAccessory = useMemo(() => {
    return accessories.find(a => a.id === activePet?.accessory);
  }, [accessories, activePet]);

  // Handle textbook updates
  useEffect(() => {
    if (customPracticeTitle) return;
    const firstBook = mode === Mode.ENGLISH ? 'GRADE 1-Fall' : '语文一年级上册';
    setSelectedBook(firstBook);
    updateList(firstBook, mode, isRandom);
  }, [mode]);

  useEffect(() => {
    if (selectedBook && !customPracticeTitle) {
      updateList(selectedBook, mode, isRandom);
    }
  }, [isRandom]);

  const updateList = (book: string, currentMode: Mode, random: boolean) => {
    setCustomPracticeTitle('');
    let list = [...(TEXTBOOK_RESOURCES[currentMode === Mode.ENGLISH ? '英语' : '语文']?.[book] || [])];
    if (random) {
      list = list.sort(() => Math.random() - 0.5);
    }
    setExerciseList(list);
    setCurrentIndex(0);
    setInputBuffer('');
    setIsWaitingForSpace(false);
    setIsStarted(false);
    setCombo(0);
  };

  // Prewarm speech whenever target item changes
  useEffect(() => {
    const currentItem = exerciseList[currentIndex];
    if (currentItem && isStarted) {
      const textToRead = mode === Mode.ENGLISH ? currentItem.text : (currentItem.chinese || currentItem.text);
      const lang = mode === Mode.ENGLISH ? 'en-US' : 'zh-CN';
      prewarmSpeech(textToRead, currentItem.example, lang);
    }
  }, [currentIndex, exerciseList, isStarted, mode]);

  const readCurrentItem = (item: ExerciseItem) => {
    if (!item || !soundEnabled) return;
    const textToRead = mode === Mode.ENGLISH ? item.text : (currentItemChineseOrText(item));
    speakDirect(textToRead, mode === Mode.ENGLISH ? 'en-US' : 'zh-CN');
  };

  const currentItemChineseOrText = (item: ExerciseItem) => {
    return item.chinese || item.text;
  };

  // ===== 🎛 排版调试面板 v3：预设目标多选批量调 + 任意元素点选单调 =====
  const [tune, setTune] = useState<LayoutTune>(() => loadTune());
  const [tunerOpen, setTunerOpen] = useState(false);
  const [selTargets, setSelTargets] = useState<string[]>([]);
  const [pickMode, setPickMode] = useState(false);
  const [activePickId, setActivePickId] = useState<string | null>(null);
  useEffect(() => { saveTune(tune); }, [tune]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        setTunerOpen(o => !o);
      }
      if (e.key === 'Escape') setPickMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('pick-mode', pickMode && tunerOpen);
    return () => document.body.classList.remove('pick-mode');
  }, [pickMode, tunerOpen]);
  // 面板开启时：页面元素可点选（捕获阶段拦截，避免误触应用自身的点击）
  useEffect(() => {
    if (!tunerOpen) return;
    document.body.classList.add('tune-on');
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('#tune-panel') || t.closest('[data-no-pick]') || t.closest('button[title*="排版调试面板"]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (pickMode) {
        // 任意元素选取：生成稳定选择器 → 建立该元素的调整规则
        const sel = genSel(t);
        const id = hashSel(sel);
        setTune(prev => {
          const exists = prev.picks.find(r => r.sel === sel);
          const picks = exists ? prev.picks : [...prev.picks, { id, sel, name: (t.textContent || '').trim().slice(0, 8) || t.tagName, css: {} }];
          return { ...prev, picks };
        });
        setActivePickId(id);
        playSoundEffect('click', 0.1);
        return;
      }
      // 预设目标点选
      const el = t.closest?.('[data-tune-target]') as HTMLElement | null;
      if (!el) return;
      const id = el.getAttribute('data-tune-target')!;
      setSelTargets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      playSoundEffect('click', 0.1);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.body.classList.remove('tune-on');
      document.removeEventListener('click', onClick, true);
    };
  }, [tunerOpen, pickMode]);
  // 读取某元素的自定义（无则空对象走默认）
  const tt = (id: string): TargetTune => tune.t[id] || {};
  const selCls = (id: string) => (selTargets.includes(id) ? ' tune-sel' : '');

  // ===== 打字区对齐：单词垂直中线 = 键盘 G 键中线（音标/中文同轴线自然居中） =====
  const wordCardRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const wordRowRef = useRef<HTMLDivElement>(null);
  const [wordShift, setWordShift] = useState(0);      // 单词组整体水平偏移

  const measureAlign = useCallback(() => {
    if (mode !== Mode.ENGLISH || !isStarted) { setWordShift(0); return; }
    const card = wordCardRef.current;
    if (!card || !leftColRef.current) return;
    const cardR = card.getBoundingClientRect();
    const g = document.querySelector('[data-key="G"]');
    if (g && wordRowRef.current) {
      const gR = g.getBoundingClientRect();
      const gCenter = gR.left + gR.width / 2 - cardR.left;
      const wR = wordRowRef.current.getBoundingClientRect();
      const wCenter = wR.left + wR.width / 2 - cardR.left;
      setWordShift(prev => prev + (gCenter - wCenter));
    }
  }, [mode, isStarted]);

  // 换词/词表变化：先归零渲染自然布局，再在下一拍测量对齐（无过渡污染）
  useEffect(() => { setWordShift(0); }, [currentIndex, exerciseList]);
  useEffect(() => {
    // setTimeout 而非 rAF：后台/隐藏标签页 rAF 不执行会导致对齐冻结；提交后下一拍测量即可
    const tid = window.setTimeout(() => measureAlign(), 0);
    return () => clearTimeout(tid);
  }, [measureAlign, inputBuffer, isWaitingForSpace, currentIndex, exerciseList]);
  useEffect(() => {
    window.addEventListener('resize', measureAlign);
    const t1 = setTimeout(measureAlign, 400);
    const t2 = setTimeout(measureAlign, 1200);   // 字体加载后再校一次
    return () => { window.removeEventListener('resize', measureAlign); clearTimeout(t1); clearTimeout(t2); };
  }, [measureAlign]);

  const handleStartStop = () => {
    if (!isStarted) {
      setIsStarted(true);
      setCurrentStats({ correct: 0, total: 0, startTime: Date.now(), errors: {} });
      setCombo(0);
      setMaxComboInSession(0);
      playSoundEffect('click');
      if (exerciseList[0]) {
        readCurrentItem(exerciseList[0]);
      }
    } else {
      finishPracticeSession();
    }
  };

  const finishPracticeSession = () => {
    setIsStarted(false);
    setIsWaitingForSpace(false);
    const durationSeconds = Math.max(1, Math.round((Date.now() - currentStats.startTime) / 1000));
    const durationMinutes = durationSeconds / 60;
    const wpm = Math.round(currentStats.correct / (durationMinutes || 1));
    const accuracy = Math.round((currentStats.correct / (currentStats.total || 1)) * 100);
    const coinsEarned = Math.max(5, Math.round(currentStats.correct * 0.5) + (accuracy > 90 ? 10 : 0));

    // Save stat
    const newStat: TypingStats = {
      id: Date.now().toString(),
      date: new Date().toISOString().slice(0, 10),
      timestamp: Date.now(),
      speed: wpm,
      accuracy: isNaN(accuracy) ? 100 : accuracy,
      timeSpent: durationSeconds,
      bookName: customPracticeTitle || selectedBook || '自由打字练习',
      mode: mode,
      correctCount: currentStats.correct,
      totalCount: currentStats.total,
      maxCombo: maxComboInSession,
      errors: currentStats.errors,
      coinsEarned: coinsEarned
    };

    setSessionStats(prev => [...prev, newStat]);
    setCoins(c => c + coinsEarned);
    playSoundEffect('victory');

    // Experience for pet
    awardPetExp(coinsEarned * 2);

    // Check Achievements
    checkAchievements(wpm, accuracy, maxComboInSession);
  };

  const awardPetExp = (expAmount: number) => {
    setPets(prevPets =>
      prevPets.map(p => {
        if (p.id === currentPetId) {
          const newExp = p.exp + expAmount;
          const expNeeded = p.level * 50;
          if (newExp >= expNeeded) {
            setLastAction('level_up');
            playSoundEffect('victory');
            return {
              ...p,
              level: p.level + 1,
              exp: newExp - expNeeded,
              happiness: Math.min(100, p.happiness + 20)
            };
          }
          return { ...p, exp: newExp };
        }
        return p;
      })
    );
  };

  const checkAchievements = (wpm: number, accuracy: number, topCombo: number) => {
    setAchievements(prev =>
      prev.map(ach => {
        if (ach.unlocked) return ach;
        let shouldUnlock = false;

        if (ach.id === 'speed_demon' && wpm >= 25) shouldUnlock = true;
        if (ach.id === 'perfect_accuracy' && accuracy === 100 && currentStats.total >= 5) shouldUnlock = true;
        if (ach.id === 'combo_master' && topCombo >= 15) shouldUnlock = true;

        if (shouldUnlock) {
          setCoins(c => c + ach.rewardCoins);
          return { ...ach, unlocked: true, unlockedAt: '刚刚', progress: ach.maxProgress };
        }
        return ach;
      })
    );
  };

  const [wordsCompletedSinceLastPraise, setWordsCompletedSinceLastPraise] = useState<number>(0);
  const praiseThreshold = useRef<number>(Math.floor(Math.random() * 4) + 6); // Random 6-9 words

  const handleSuccess = async () => {
    playSoundEffect('correct');
    setIsWaitingForSpace(true);
    setLastAction('correct');
    setCoins(c => c + 1);

    const currentItem = exerciseList[currentIndex];
    if (!currentItem) return;

    // Immediately read current word's example sentence or pronunciation cleanly without delay
    if (soundEnabled && currentItem.example) {
      playPraiseAndExample(
        praiseDialect,
        currentItem.example,
        mode === Mode.ENGLISH ? 'en-US' : 'zh-CN'
      );
    }
  };

  const nextWord = () => {
    const nextIdx = currentIndex + 1;
    const newCount = wordsCompletedSinceLastPraise + 1;
    setWordsCompletedSinceLastPraise(newCount);

    // Random periodic praise every 5-10 words triggered upon appearing next word
    if (newCount >= praiseThreshold.current) {
      setWordsCompletedSinceLastPraise(0);
      praiseThreshold.current = Math.floor(Math.random() * 4) + 6;
      if (soundEnabled) {
        // Trigger lively praise in background as next word appears
        setTimeout(() => {
          playPraiseVoice(praiseDialect);
        }, 150);
      }
    }

    if (nextIdx < exerciseList.length) {
      setCurrentIndex(nextIdx);
      setInputBuffer('');
      setIsWaitingForSpace(false);
      readCurrentItem(exerciseList[nextIdx]);
    } else {
      setLastAction('victory');
      finishPracticeSession();
    }
  };

  // 自动聚焦：页面加载 / 切到练习页 / 开始练习时，让根容器获得键盘焦点
  // 孩子不用先点击页面任意位置，直接敲键盘就能打字
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [activeTab, isStarted]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 输入控件（改名框等）里敲键盘不算打字练习
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!isStarted || activeTab !== Tab.PRACTICE) return;

      if (isWaitingForSpace) {
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          playSoundEffect('click');
          nextWord();
        }
        return;
      }

      const currentTarget = exerciseList[currentIndex]?.text.toLowerCase() || '';
      const char = e.key.toLowerCase();

      if (e.key.length > 1 && e.key !== ' ') return;

      e.preventDefault();
      setCurrentStats(prev => ({ ...prev, total: prev.total + 1 }));

      if (char === currentTarget[inputBuffer.length]) {
        const nextBuffer = inputBuffer + char;
        setInputBuffer(nextBuffer);
        setCurrentStats(prev => ({ ...prev, correct: prev.correct + 1 }));

        const newCombo = combo + 1;
        setCombo(newCombo);
        if (newCombo > maxComboInSession) {
          setMaxComboInSession(newCombo);
        }

        if (newCombo > 0 && newCombo % 5 === 0) {
          playSoundEffect('combo');
        } else {
          playSoundEffect('click');
        }

        if (nextBuffer === currentTarget) {
          handleSuccess();
        }
      } else {
        // Mistake
        playSoundEffect('error');
        setCombo(0);
        setLastAction('error');
        const expectedChar = currentTarget[inputBuffer.length];
        if (expectedChar) {
          const key = expectedChar.toUpperCase();
          setCurrentStats(prev => ({
            ...prev,
            errors: { ...prev.errors, [key]: (prev.errors[key] || 0) + 1 }
          }));
        }
      }
    },
    [isStarted, activeTab, isWaitingForSpace, inputBuffer, currentIndex, exerciseList, combo, maxComboInSession]
  );

  const currentSyllables = useMemo(() => {
    if (mode === Mode.CHINESE || !exerciseList[currentIndex]) return [];
    return splitSyllables(exerciseList[currentIndex].text);
  }, [currentIndex, mode, exerciseList]);

  const progress = Math.round(((currentIndex + (inputBuffer.length / (exerciseList[currentIndex]?.text.length || 1))) / (exerciseList.length || 1)) * 100);

  // Targeted Weak Key Practice Launcher
  const handleStartTargetedPractice = (weakKeys: string[]) => {
    const drillItems: ExerciseItem[] = [];
    const allWords = Object.values(TEXTBOOK_RESOURCES['英语']).flat();

    allWords.forEach(w => {
      const match = weakKeys.some(k => w.text.toLowerCase().includes(k.toLowerCase()));
      if (match && drillItems.length < 15) {
        drillItems.push(w);
      }
    });

    if (drillItems.length === 0) {
      weakKeys.forEach(k => {
        drillItems.push({
          text: `${k.toLowerCase()}${k.toLowerCase()}${k.toLowerCase()}`,
          chinese: `易错键 ${k} 特训`,
          phonetic: `/${k.toLowerCase()}/`,
          translation: `易错键 ${k} 特训`,
          example: `Practice key ${k} carefully!`
        });
      });
    }

    setCustomPracticeTitle(`易错键特训: [${weakKeys.slice(0, 4).join(', ')}]`);
    setExerciseList(drillItems);
    setCurrentIndex(0);
    setInputBuffer('');
    setIsWaitingForSpace(false);
    setIsStarted(false);
    setActiveTab(Tab.PRACTICE);
  };

  // Launch Practice from AI Story
  const handleStartPracticeWithStoryWords = (items: ExerciseItem[], storyTitle: string) => {
    setCustomPracticeTitle(`故事词汇: ${storyTitle}`);
    setExerciseList(items);
    setCurrentIndex(0);
    setInputBuffer('');
    setIsWaitingForSpace(false);
    setIsStarted(false);
    setActiveTab(Tab.PRACTICE);
  };

  // Launch Game from AI Story
  const handleStartGameWithStoryWords = (items: ExerciseItem[], storyTitle: string) => {
    setGameCustomWords(items);
    setGameCustomTitle(storyTitle);
    setActiveTab(Tab.GAME);
  };

  // Pet Actions
  const handleSelectPet = (id: string) => {
    playSoundEffect('pop');
    setCurrentPetId(id);
  };

  const handleUnlockPet = (id: string, cost: number) => {
    if (coins < cost) {
      playSoundEffect('error');
      return;
    }
    playSoundEffect('victory');
    setCoins(c => c - cost);
    setPets(prev => prev.map(p => p.id === id ? { ...p, unlocked: true } : p));
    setCurrentPetId(id);
  };

  // 使用互动道具（四维状态更新 + 附魔台通用入口）
  const handleUseTool = (tool: PetTool) => {
    if (coins < tool.cost) {
      playSoundEffect('error');
      return;
    }
    setCoins(c => c - tool.cost);
    setPets(prev =>
      prev.map(p => {
        if (p.id === currentPetId) {
          return {
            ...p,
            hunger: Math.max(0, Math.min(100, p.hunger + tool.hungerAdd)),
            happiness: Math.max(0, Math.min(100, p.happiness + tool.happyAdd)),
            cleanliness: Math.max(0, Math.min(100, (p.cleanliness ?? 80) + tool.cleanAdd)),
            energy: Math.max(0, Math.min(100, (p.energy ?? 80) + tool.energyAdd))
          };
        }
        return p;
      })
    );
    awardPetExp(15);
  };

  const handlePetPet = () => {
    playSoundEffect('pop');
    setPets(prev =>
      prev.map(p => {
        if (p.id === currentPetId) {
          return { ...p, happiness: Math.min(100, p.happiness + 5) };
        }
        return p;
      })
    );
    awardPetExp(5);
  };

  const handleEquipAccessory = (accId: string) => {
    playSoundEffect('pop');
    setPets(prev =>
      prev.map(p => (p.id === currentPetId ? { ...p, accessory: accId } : p))
    );
  };

  const handleUnlockAccessory = (accId: string, cost: number) => {
    if (coins < cost) {
      playSoundEffect('error');
      return;
    }
    playSoundEffect('victory');
    setCoins(c => c - cost);
    setAccessories(prev =>
      prev.map(a => (a.id === accId ? { ...a, unlocked: true } : a))
    );
    handleEquipAccessory(accId);
  };

  const handleEnchantPet = (petId: string, cost: number) => {
    if (coins < cost) {
      playSoundEffect('error');
      return;
    }
    setCoins(c => c - cost);
    setPets(prev =>
      prev.map(p => {
        if (p.id === petId) {
          const nextEnchant = (p.enchantLevel || 0) + 1;
          const nextStage = nextEnchant >= 3 ? 3 : nextEnchant >= 1 ? 2 : 1;
          return {
            ...p,
            enchantLevel: nextEnchant,
            evolutionStage: Math.max(p.evolutionStage || 1, nextStage) as 1 | 2 | 3,
            happiness: 100,
            hunger: 100,
            cleanliness: 100,
            energy: 100
          };
        }
        return p;
      })
    );
    awardPetExp(40);
  };

  const TAB_ITEMS: { id: Tab; icon: string; label: string; color: string; shadow: string }[] = [
    { id: Tab.PRACTICE, icon: '⌨️', label: '学打字', color: 'bg-[#FF8A5C]', shadow: 'shadow-[0_4px_0_#E0633A]' },
    { id: Tab.STORY, icon: '📖', label: 'AI故事', color: 'bg-[#A57DE0]', shadow: 'shadow-[0_4px_0_#8258C7]' },
    { id: Tab.GAME, icon: '🎮', label: '游戏乐园', color: 'bg-[#6BCB77]', shadow: 'shadow-[0_4px_0_#48A757]' },
    { id: Tab.PET, icon: '🐱', label: '萌宠小屋', color: 'bg-[#FF8FAB]', shadow: 'shadow-[0_4px_0_#E0678A]' },
    { id: Tab.HABIT, icon: '🌟', label: '好习惯', color: 'bg-[#E8A317]', shadow: 'shadow-[0_4px_0_#B8860B]' },
    { id: Tab.STATS, icon: '📊', label: '成长档案', color: 'bg-[#4FB8E7]', shadow: 'shadow-[0_4px_0_#2E93C4]' },
    { id: Tab.ABOUT, icon: 'ℹ️', label: '介绍', color: 'bg-[#8A6F5C]', shadow: 'shadow-[0_4px_0_#6B5844]' }
  ];

  return (
    <div
      ref={rootRef}
      className="min-h-screen flex flex-col font-sans text-[#5B4636] outline-none select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Top Main Navigation */}
      <nav className="flex justify-between items-center px-5 py-3 bg-white/85 backdrop-blur-md border-b-4 border-[#FFE8C8] sticky top-0 z-30 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-[#FF8A5C] via-[#FFC94D] to-[#6BCB77] rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-[0_4px_0_#E8A317] animate-breathe">
            墨
          </div>
          <div>
            <div className="flex items-center gap-2">
              {editingAppName ? (
                <input
                  autoFocus
                  value={appNameDraft}
                  onChange={(e) => setAppNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); confirmAppName(); }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingAppName(false); }
                  }}
                  maxLength={20}
                  placeholder={DEFAULT_APP_NAME}
                  className="text-2xl font-black tracking-tight font-kids bg-white text-[#5B4636] border-3 border-[#FFC94D] focus:outline-none focus:ring-4 focus:ring-[#FFC94D]/50 rounded-xl px-2 py-0 w-[13ch]"
                />
              ) : (
                <h1 className="text-2xl font-black tracking-tight font-kids">{appName}</h1>
              )}
              {editingAppName ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={confirmAppName}
                    className="w-6 h-6 rounded-lg bg-[#6BCB77] text-white text-xs font-black flex items-center justify-center shadow-[0_2px_0_#48A757] transition-transform active:scale-90"
                    title="保存名称（回车）"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingAppName(false)}
                    className="w-6 h-6 rounded-lg bg-[#F5EBDA] text-[#8A6F5C] text-xs font-black flex items-center justify-center transition-transform active:scale-90"
                    title="取消（Esc）"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEditAppName}
                  className="w-6 h-6 rounded-lg bg-[#FFF3D6] hover:bg-[#FFE3A3] text-[#8A5F00] text-xs flex items-center justify-center border border-[#FFE3A3] transition-all active:scale-90"
                  title="修改名称"
                >
                  ✏️
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <div className="flex items-center gap-1.5 bg-[#FFF8EE] p-1.5 rounded-2xl border-3 border-[#FFE8C8]">
          {TAB_ITEMS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { playSoundEffect('click'); setActiveTab(tab.id); }}
              className={`px-4 py-2 rounded-xl text-sm font-black transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? `${tab.color} text-white ${tab.shadow}`
                  : 'text-[#8A6F5C] hover:bg-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Right Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#FFF3D6] border-3 border-[#FFE3A3] px-3.5 py-1.5 rounded-2xl shadow-[0_3px_0_rgba(232,163,23,0.3)]">
            <span className="text-xl animate-float-y">🪙</span>
            <span className="text-base font-black text-[#8A5F00]">{coins}</span>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg border-3 transition-all active:scale-90 ${
              soundEnabled ? 'bg-[#E3F2FA] border-[#BBE2F2] text-[#2E93C4]' : 'bg-[#FFF8EE] border-[#FFE8C8] text-[#C4AE97]'
            }`}
            title={soundEnabled ? '语音音效开启' : '静音模式'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main data-active-tab={activeTab} className="flex-1 p-3 md:p-5 flex flex-col items-center max-w-[1800px] w-full mx-auto">
        {/* TAB 1: PRACTICE */}
        {activeTab === Tab.PRACTICE && (
          <div className="w-full flex flex-col items-center gap-4 animate-fade-in">
            {/* Top Toolbar */}
            <div className="w-full story-card px-4 py-3 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Language Switch */}
                <div className="flex p-1 bg-[#FFF8EE] rounded-2xl border-3 border-[#FFE8C8]">
                  <button
                    onClick={() => { setMode(Mode.ENGLISH); setCustomPracticeTitle(''); }}
                    className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${
                      mode === Mode.ENGLISH && !customPracticeTitle
                        ? 'bg-white shadow-[0_3px_0_rgba(222,184,135,0.3)] text-[#E0633A]'
                        : 'text-[#8A6F5C]'
                    }`}
                  >
                    🔤 英语
                  </button>
                  <button
                    onClick={() => { setMode(Mode.CHINESE); setCustomPracticeTitle(''); }}
                    className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${
                      mode === Mode.CHINESE && !customPracticeTitle
                        ? 'bg-white shadow-[0_3px_0_rgba(222,184,135,0.3)] text-[#48A757]'
                        : 'text-[#8A6F5C]'
                    }`}
                  >
                    🇨🇳 语文拼音
                  </button>
                </div>

                {/* Textbook Selector or Custom Title */}
                {customPracticeTitle ? (
                  <div className="bg-[#F3E9FA] border-3 border-[#E2D0F2] text-[#8258C7] px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2">
                    <span>✨ {customPracticeTitle}</span>
                    <button
                      onClick={() => { setCustomPracticeTitle(''); updateList(selectedBook, mode, isRandom); }}
                      className="text-[#A57DE0] hover:text-[#8258C7] ml-1 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <select
                    className="bg-white border-3 border-[#FFE8C8] px-4 py-2 rounded-2xl text-xs md:text-sm font-black outline-none text-[#5B4636] shadow-[0_3px_0_rgba(222,184,135,0.25)] min-w-[220px]"
                    value={selectedBook}
                    onChange={(e) => {
                      setSelectedBook(e.target.value);
                      updateList(e.target.value, mode, isRandom);
                    }}
                  >
                    {Object.keys(TEXTBOOK_RESOURCES[mode === Mode.ENGLISH ? '英语' : '语文']).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}

                {/* Order Toggle */}
                <button
                  onClick={() => setIsRandom(!isRandom)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border-3 text-xs font-black transition-all active:scale-95 ${
                    isRandom
                      ? 'bg-[#F3E9FA] border-[#E2D0F2] text-[#8258C7]'
                      : 'bg-white border-[#FFE8C8] text-[#8A6F5C] hover:border-[#FFC94D]'
                  }`}
                >
                  <span>{isRandom ? '🔀' : '➡'}</span>
                  <span>{isRandom ? '随机乱序' : '教材顺序'}</span>
                </button>

                {/* Praise Dialect Selector */}
                <div className="flex items-center gap-1 bg-[#FFF8EE] border-3 border-[#FFE8C8] px-3 py-1.5 rounded-2xl text-xs font-bold text-[#8A6F5C]">
                  <span>🗣️ 夸奖音效:</span>
                  <select
                    value={praiseDialect}
                    onChange={(e) => setPraiseDialect(e.target.value as any)}
                    className="bg-transparent font-black text-[#E0633A] outline-none cursor-pointer"
                  >
                    <option value="cantonese">粤语（好叻啊）</option>
                    <option value="mandarin">普通话（太棒了）</option>
                    <option value="english">English</option>
                  </select>
                </div>
              </div>

              {/* Start / Stop Button */}
              <button
                onClick={handleStartStop}
                className={`btn-candy px-8 py-3 text-base md:text-lg ${isStarted ? 'bg-[#FF8FAB] shadow-[0_5px_0_#E0678A] active:shadow-[0_1px_0_#E0678A]' : 'btn-grass animate-pulse'}`}
              >
                <span>{isStarted ? '⏹ 结束练习' : '▶ 开始练习'}</span>
              </button>
            </div>

            {/* 打字主区：行1=全宽单词卡（左7列单词+音标+中文 / 右5列例句+例句中文+空格提示）
                行2=键盘(8列)+统计(4列)；单词水平居中即与键盘的中线对齐 */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
              {/* 行1：目标单词卡（全宽） */}
              <div ref={wordCardRef} data-tune-target="card"
                className={'lg:col-span-12 story-card relative overflow-hidden' + selCls('card')}
                style={{
                  minHeight: tt('card').minH ?? 228,
                  padding: tt('card').pad !== undefined ? tt('card').pad : undefined,
                  transform: 'translate(' + (tt('card').dx || 0) + 'px, ' + (tt('card').dy || 0) + 'px)',
                }}>
                {/* 进度条 */}
                <div className="absolute top-0 left-0 h-2.5 bg-gradient-to-r from-[#FF8A5C] via-[#FFC94D] to-[#6BCB77] rounded-r-full transition-all duration-300" style={{ width: `${progress}%` }} />

                {/* Top Progress & Combo Pill */}
                <div className="absolute top-3 left-5 right-5 flex justify-between items-center text-xs font-bold text-[#8A6F5C]">
                  <span>📖 进度: {currentIndex + 1} / {exerciseList.length || 1} 词</span>
                  {combo > 1 && (
                    <span className="bg-[#FFF3D6] text-[#8A5F00] px-3 py-1 rounded-full font-black text-xs animate-bounce border-2 border-[#FFE3A3]">
                      🔥 连击 x{combo}
                    </span>
                  )}
                </div>

                {!isStarted ? (
                  <div className="text-center flex flex-col items-center gap-2.5 py-5">
                    <div className="text-7xl animate-float-y select-none">🎒</div>
                    <h3 className="text-xl md:text-2xl font-black font-kids">准备好练习打字了吗？</h3>
                    <p className="text-xs md:text-sm text-[#8A6F5C] max-w-md">
                      跟着屏幕提示与键盘指法提示，敲击对应字母，开启快乐打字之旅！
                    </p>
                    <button onClick={handleStartStop} className="btn-candy btn-grass mt-1 px-8 py-2.5 text-sm">
                      立即开始 🚀
                    </button>
                  </div>
                ) : (
                  <div className="w-full flex-1 grid grid-cols-1 md:grid-cols-12 tune-grid gap-x-6 gap-y-3 items-center pt-4">
                   {/* ═ 行1左：要打的单词（中文模式=汉字+拼音行 / 英文模式=音节字母行）——
                       与右格例句英文同处 grid 第 1 行，o 中线共轴线对齐（见行1右注释） ═ */}
                   <div ref={leftColRef} data-tune-target="leftCol"
                     className={'flex flex-col items-center justify-center' + selCls('leftCol')}
                     style={{
                       transform: 'translate(' + (wordShift + (tt('leftCol').dx || 0)) + 'px, ' + (tt('leftCol').dy || 0) + 'px)',
                       gap: tt('leftCol').gap ?? 10,
                     }}>
                    {/* 第一行：要打的单词（语文模式=汉字+拼音行） */}
                    {mode === Mode.CHINESE ? (
                      <div className="flex flex-col items-center">
                        <div className="text-7xl md:text-8xl font-black text-[#E0633A] font-kids leading-none drop-shadow-sm select-none">
                          {exerciseList[currentIndex]?.chinese}
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 md:gap-3 mt-2">
                          {(() => {
                            const plainChars = exerciseList[currentIndex]?.text.split('') || [];
                            const tonedChars = getPinyinWithTones(exerciseList[currentIndex]?.chinese || '').split('');
                            return plainChars.map((char, i) => {
                              const isTyped = i < inputBuffer.length;
                              const isCurrentChar = i === inputBuffer.length && !isWaitingForSpace;
                              return (
                                <div key={i} className="relative flex flex-col items-center">
                                  <span
                                    className={`font-black transition-all font-mono leading-none ${
                                      isTyped ? 'text-[#C4AE97]' : 'text-[#2E93C4]'
                                    }`}
                                    style={{ fontSize: tt('word').fs ? Math.round(tt('word').fs * 0.78) : 60 }}
                                  >
                                    {tonedChars[i] ?? char}
                                  </span>
                                  {isCurrentChar && (
                                    <div className="absolute -bottom-3 w-full h-2.5 bg-[#FFC94D] rounded-full animate-bounce" />
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div ref={wordRowRef} data-tune-target="word"
                        className={'word-row flex flex-wrap justify-center items-end gap-x-2 gap-y-3' + selCls('word')}
                        style={{ transform: 'translate(' + (tt('word').dx || 0) + 'px, ' + (tt('word').dy || 0) + 'px)' }}>
                        {(() => {
                          let charCounter = 0;
                          return currentSyllables.map((syllable, sIndex) => {
                            const syllableColor = getSyllableColor(sIndex);
                            return (
                              <div key={sIndex} className="flex items-center">
                                {syllable.split('').map((char, cIndex) => {
                                  const globalIdx = charCounter++;
                                  const isTyped = globalIdx < inputBuffer.length;
                                  const isCurrent = globalIdx === inputBuffer.length && !isWaitingForSpace;
                                  const isSpace = char === ' ';
                                  if (isSpace) {
                                    return (
                                      <div key={cIndex} className="relative mx-2 flex flex-col items-center">
                                        <div
                                          className={`px-3 py-1.5 rounded-xl border-2 border-dashed flex items-center justify-center font-kids font-bold text-sm md:text-base transition-all ${
                                            isTyped
                                              ? 'bg-[#F5EBDA] text-[#C4AE97] border-[#EADBC2]'
                                              : isCurrent
                                              ? 'bg-[#FFF3D6] text-[#8A5F00] border-[#FFC94D] animate-pulse scale-105'
                                              : 'bg-[#FFF8EE] text-[#C4AE97] border-[#FFE8C8]'
                                          }`}
                                        >
                                          <span>␣ 空格</span>
                                        </div>
                                        {isCurrent && (
                                          <div className="absolute -bottom-3 w-3/4 h-2 bg-[#FFC94D] rounded-full animate-bounce" />
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={cIndex} className="relative">
                                      <span
                                        className={`font-kids font-black transition-all leading-none ${
                                          isTyped ? 'text-[#C4AE97]' : syllableColor
                                        }`}
                                        style={{ fontSize: tt('word').fs ?? 96 }}
                                      >
                                        {char}
                                      </span>
                                      {isCurrent && (
                                        <div className="absolute -bottom-3 w-full h-2.5 bg-[#FFC94D] rounded-full animate-bounce" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>

                  {/* ═ 行1右：例句英文 —— 与单词同处 grid 第 1 行（items-center 行内共轴线居中）
                      几何原理（o 中线对齐恒等式）：同字体(Baloo 2)下，o 的水平中线距行盒顶
                      ≈ 48.1%（word 96px·leading-none）/ 48.5%（exEn 57px·leading-tight），
                      两者相差 <0.4px → 两行盒在同一 grid 行内垂直居中共轴线，o 中线即重合
                      （例句换行为两行时，单词自动对齐两行的垂直中线，居中不变式仍成立）。 ═ */}
                  <div className="min-w-0 max-w-full flex items-center justify-center px-1 md:px-3">
                    {exerciseList[currentIndex]?.example && (
                      <p data-tune-target="exEn"
                        className={'text-[#48A757] font-black font-kids leading-tight select-none max-w-full break-words' + selCls('exEn')}
                        style={{
                          fontSize: tt('exEn').fs ?? 'clamp(28px, 3.4vw, 57px)',
                          transform: 'translate(' + (tt('exEn').dx || 0) + 'px, ' + (tt('exEn').dy || 0) + 'px)',
                        }}>
                        {exerciseList[currentIndex]?.example}
                      </p>
                    )}
                  </div>

                  {/* ═ 行2左：单词中文 + 音标（grid 第 2 行；wordShift 与单词同组右移，保持上下呼应） ═ */}
                  <div className="flex flex-col items-center"
                    style={{
                      transform: 'translate(' + wordShift + 'px, 0px)',
                      gap: 10,
                    }}>
                    {/* 第二行：单词中文（🔊悬挂右侧不挤偏） */}
                    <div className="relative" data-tune-target="trans"
                      style={{
                        fontSize: tt('trans').fs ?? 45,
                        transform: 'translate(' + (tt('trans').dx || 0) + 'px, ' + (tt('trans').dy || 0) + 'px)',
                      }}>
                      <span className={'font-black text-[#2E93C4] font-kids leading-none inline-block' + selCls('trans')}>
                        {exerciseList[currentIndex]?.translation}
                      </span>
                      {mode === Mode.ENGLISH && (
                        <button
                          onClick={() => readCurrentItem(exerciseList[currentIndex])}
                          className="absolute top-1/2 -translate-y-1/2 -right-14 w-9 h-9 bg-[#E3F2FA] hover:bg-[#BBE2F2] text-[#2E93C4] rounded-full flex items-center justify-center text-sm transition-transform active:scale-90 border-2 border-[#BBE2F2]"
                          title="重听单词发音"
                        >
                          🔊
                        </button>
                      )}
                    </div>
                    {/* 第三行：音标 */}
                    {mode === Mode.ENGLISH && exerciseList[currentIndex]?.phonetic && (
                      <span data-tune-target="phonetic"
                        className={'font-mono font-bold text-[#8A6F5C] select-none whitespace-nowrap leading-none' + selCls('phonetic')}
                        style={{
                          fontSize: tt('phonetic').fs ?? 45,
                          transform: 'translate(' + (tt('phonetic').dx || 0) + 'px, ' + (tt('phonetic').dy || 0) + 'px)',
                        }}>
                        {exerciseList[currentIndex]?.phonetic}
                      </span>
                    )}
                    {mode === Mode.CHINESE && (
                      <button
                        onClick={() => readCurrentItem(exerciseList[currentIndex])}
                        className="text-xs bg-[#E5F6EC] hover:bg-[#C8EED4] text-[#357F43] px-3 py-1 rounded-full font-bold transition-all flex items-center gap-1 border-2 border-[#C8EED4]"
                      >
                        <span>🔊 点击朗读读音</span>
                      </button>
                    )}
                   </div>
                   {/* ═ 行2右：例句中文 / 空格提示 —— min-w-0 + clamp 字号防窄屏溢出裁切 ═ */}
                   {/* 注意：不要加 md:col-span-N！tune-grid 已把本网格改写为两列 (12-exCol)fr/exCol fr，
                       任何 col-span>1 都会生成隐式列把例句顶出卡片右缘（截图复现的裁切根因） */}
                   <div data-tune-target="exArea"
                     className={'min-w-0 max-w-full flex flex-col items-center justify-center text-center px-1 md:px-3' + selCls('exArea')}
                     style={{
                       transform: 'translate(' + (tt('exArea').dx || 0) + 'px, ' + (tt('exArea').dy || 0) + 'px)',
                       gap: 10,
                     }}>
                    {/* 例句中文（同防溢出处理） */}
                    {mode === Mode.ENGLISH && EN_EXAMPLE_ZH[exerciseList[currentIndex]?.example || ''] && (
                      <p data-tune-target="exZh"
                        className={'text-[#2E93C4] font-black font-kids leading-none max-w-full break-words' + selCls('exZh')}
                        style={{
                          fontSize: tt('exZh').fs ?? 'clamp(20px, 2.6vw, 45px)',
                          transform: 'translate(' + (tt('exZh').dx || 0) + 'px, ' + (tt('exZh').dy || 0) + 'px)',
                        }}>
                        {EN_EXAMPLE_ZH[exerciseList[currentIndex]!.example]}
                      </p>
                    )}
                    {/* 第三行：空格提示条 */}
                    {isWaitingForSpace && (
                      <div data-tune-target="pill"
                        className={'bg-[#FFF3D6] text-[#8A5F00] border-3 border-[#FFE3A3] px-4 py-1.5 rounded-full text-xs md:text-sm font-black animate-pulse flex items-center gap-2' + selCls('pill')}
                        style={{ transform: 'translate(' + (tt('pill').dx || 0) + 'px, ' + (tt('pill').dy || 0) + 'px)' }}>
                        <span>⌨️</span> 按下 [ 空格键 ] 挑战下一个
                      </div>
                    )}
                   </div>
                  </div>
                )}
              </div>

              {/* 行2-左：虚拟键盘（与单词卡同列，指法提示与单词上下呼应） */}
              <div className="lg:col-span-8">
                <Keyboard
                  targetKey={
                    isStarted && !isWaitingForSpace
                      ? exerciseList[currentIndex]?.text[inputBuffer.length] || ''
                      : isWaitingForSpace
                      ? ' '
                      : ''
                  }
                />
              </div>

              {/* 行2-右：打字数据（单行横排大数字；tabular-nums 等宽数字 + 固定后缀槽 → 三行个位同列、跳变时个位纹丝不动） */}
              <div className="lg:col-span-4 story-card px-5 py-4 flex flex-col justify-center gap-2">
                <div className="flex items-center justify-between bg-[#FFE9E0]/70 rounded-2xl px-4 py-1">
                  <span className="text-base md:text-lg font-black text-[#8A6F5C] font-kids">🎯 精准击键</span>
                  <span className="flex items-baseline gap-1">
                    <span className="text-5xl md:text-6xl font-black text-[#E0633A] font-kids leading-none tabular-nums">{currentStats.correct}</span>
                    <span className="w-[52px] shrink-0" aria-hidden="true" />
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#E3F2FA]/70 rounded-2xl px-4 py-1">
                  <span className="text-base md:text-lg font-black text-[#8A6F5C] font-kids">⚡ 速度</span>
                  <span className="flex items-baseline gap-1">
                    <span className="text-5xl md:text-6xl font-black text-[#48A757] font-kids leading-none tabular-nums">
                      {Math.round(currentStats.correct / (((Date.now() - currentStats.startTime) / 1000 / 60) || 1))}
                    </span>
                    <span className="w-[52px] shrink-0 text-left text-lg md:text-xl font-black text-[#8A6F5C]">字/分</span>
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#FFF3D6]/70 rounded-2xl px-4 py-1">
                  <span className="text-base md:text-lg font-black text-[#8A6F5C] font-kids">💰 本次已赚</span>
                  <span className="flex items-baseline gap-1">
                    <span className="text-5xl md:text-6xl font-black text-[#E8A317] font-kids leading-none tabular-nums">
                      +{Math.max(1, Math.round(currentStats.correct * 0.5))}
                    </span>
                    <span className="w-[52px] shrink-0 text-left text-lg md:text-xl">🪙</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

        )}

        {/* TAB 2: GAMES */}
        {activeTab === Tab.GAME && (
          <TypingGame
            customWordList={gameCustomWords}
            customTitle={gameCustomTitle}
            onEarnCoins={(amount) => {
              setCoins(c => c + amount);
              awardPetExp(amount * 2);
            }}
          />
        )}

        {/* TAB 3: AI STORY GENERATOR */}
        {activeTab === Tab.STORY && (
          <StoryGenerator
            onStartPracticeWithWords={handleStartPracticeWithStoryWords}
            onStartGameWithWords={handleStartGameWithStoryWords}
          />
        )}

        {/* TAB: 每日好习惯奖励登记 */}
        {activeTab === Tab.HABIT && (
          <HabitTracker
            onEarnCoins={(amount) => {
              setCoins(c => c + amount);
              awardPetExp(amount * 2);
            }}
          />
        )}

        {/* TAB 4: PET SANCTUARY */}
        {activeTab === Tab.PET && (
          <DesktopPet
            pets={pets}
            currentPetId={currentPetId}
            coins={coins}
            accessories={accessories}
            onSelectPet={handleSelectPet}
            onUnlockPet={handleUnlockPet}
            onUseTool={handleUseTool}
            onPetPet={handlePetPet}
            onEquipAccessory={handleEquipAccessory}
            onUnlockAccessory={handleUnlockAccessory}
            onEnchantPet={handleEnchantPet}
          />
        )}

        {/* TAB 5: STATS & ACHIEVEMENTS */}
        {activeTab === Tab.STATS && (
          <Statistics
            stats={sessionStats}
            achievements={achievements}
            coins={coins}
            onStartTargetedPractice={handleStartTargetedPractice}
            onClearHistory={() => setSessionStats([])}
          />
        )}

        {/* TAB 6: ABOUT 项目介绍（首页顶部介绍已精简，统一收纳于此） */}
        {activeTab === Tab.ABOUT && (
          <div className="w-full max-w-3xl flex flex-col gap-4 animate-fade-in mx-auto">
            <div className="story-card p-6 flex flex-col items-center gap-2 text-center">
              <div className="w-16 h-16 bg-gradient-to-tr from-[#FF8A5C] via-[#FFC94D] to-[#6BCB77] rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-[0_5px_0_#E8A317] animate-breathe">
                墨
              </div>
              <h2 className="text-2xl font-black font-kids text-[#5B4636]">{appName}</h2>
              <span className="bg-[#FFF3D6] text-[#8A5F00] text-[11px] font-black px-3 py-1 rounded-full border-2 border-[#FFE3A3]">
                儿童护眼专属 · 家庭自学工具
              </span>
              <p className="text-sm text-[#8A6F5C] font-bold leading-relaxed max-w-lg">
                为小学生打造的打字练习工具：教材同步词库 + 拼音英语双模式 +
                AI 分级故事 + 打字游戏 + 萌宠陪伴 + 好习惯打卡，让练习像玩一样自然。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: '🛡️', title: '儿童护眼设计', desc: '大字号净色托底、高对比配色，动态背景上文字始终看得清' },
                { icon: '📚', title: '人教版同步词库', desc: '英语 1-6 年级（新起点/PEP）+ 语文部编版生字组词，跟随课本进度' },
                { icon: '🔤', title: '拼音英语双模式', desc: '英语练单词例句，语文练拼音打字，两种语言一套流程' },
                { icon: '📖', title: 'AI 分级故事', desc: '按孩子水平生成中英双语童话，生词即练即读' },
                { icon: '🎮', title: '8 款打字游戏', desc: '字母雨、赛车、飞船、登山……在游戏里不知不觉练熟键盘' },
                { icon: '🐱', title: '萌宠相伴', desc: '金币养宠、换装、进化，练习成果看得见摸得着' },
                { icon: '🌟', title: '好习惯打卡', desc: '自己定目标攒积分换心愿，进步可视化可回顾' },
                { icon: '📊', title: '成长档案', desc: '速度、正确率、成就徽章，一点一滴记录成长' },
              ].map(f => (
                <div key={f.title} className="story-card p-4 flex items-start gap-3">
                  <span className="text-3xl select-none shrink-0">{f.icon}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-black text-[#5B4636] font-kids">{f.title}</span>
                    <span className="text-xs text-[#8A6F5C] font-bold leading-relaxed">{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-[11px] text-[#C4AE97] font-bold">
              回到「学打字」开始今天的练习吧 💪
            </p>
          </div>
        )}
      </main>

      {/* 用户排版自定义规则（任意元素选取产生，全部 !important 保证生效） */}
      {tune.picks.length > 0 && (
        <style>{tune.picks.map(r => {
          const decls = Object.entries(r.css).map(([k, v]) => k + ': ' + v + ' !important').join('; ');
          const mark = tunerOpen ? ' outline: 2px solid rgba(255,138,92,0.45); outline-offset: 1px;' : '';
          return decls ? (r.sel + ' { ' + decls + ';' + mark + ' }') : (tunerOpen ? (r.sel + ' {' + mark + ' }') : '');
        }).join('\n')}</style>
      )}
      {/* Floating Desktop Pet Companion（萌宠小屋页隐藏：页面本身就有大宠物，避免悬浮卡遮挡道具按钮） */}
      {activeTab !== Tab.PET && (
        <>
          {activeTab === Tab.PRACTICE && (
            <>
              <style>{`@media (min-width:768px){ .tune-grid { grid-template-columns: ${(12 - tune.exCol)}fr ${tune.exCol}fr !important; } }`}</style>
              <button
                onClick={() => setTunerOpen(o => !o)}
                className="fixed bottom-3 left-3 z-[85] w-9 h-9 rounded-xl bg-white/70 hover:bg-white text-base border-2 border-[#EADBC2] shadow-sm transition-all opacity-50 hover:opacity-100 active:scale-90"
                title="排版调试面板（Ctrl+Shift+L）"
              >🎛</button>
              {tunerOpen && (
                <LayoutTuner
                  tune={tune} setTune={setTune}
                  selected={selTargets} setSelected={setSelTargets}
                  pickMode={pickMode} onTogglePickMode={() => setPickMode(m => !m)}
                  activePickId={activePickId}
                  onRemovePick={(id) => {
                    setTune(prev => ({ ...prev, picks: prev.picks.filter(r => r.id !== id) }));
                    if (activePickId === id) setActivePickId(null);
                  }}
                  onClose={() => { setTunerOpen(false); setPickMode(false); setActivePickId(null); }}
                />
              )}
            </>
          )}
          <div data-no-pick="1">
            <FloatingCompanion
              pet={activePet}
              accessory={activeAccessory}
              combo={combo}
              lastAction={lastAction}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default App;
