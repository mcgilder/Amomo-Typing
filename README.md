# 阿墨墨打字通 (Amomo Typing)

专为 6~7 岁低龄儿童设计的趣味打字软件。奶油绘本视觉系统，护眼易读，让孩子在玩中同步学好校内语文与英语。

> 本仓库为**公开版 v1.0.0**（正式发布版）。代码不含任何密钥，AI 能力通过运行环境安全注入。

---

## ✨ 功能全景

- **教材零缝隙同步**：内置人教版 PEP 英语 12 册（1151 词）与部编版语文 12 册（1263 词）师生同步词库，含音标、翻译、拼音与例句
- **低认知负荷交互**：超大字号、音节拆解彩色标注、实时光标弹跳指示
- **规范十指指法**：全键盘实时渲染双手十指色彩区域，动态高亮目标指法与手势提示
- **八大沉浸式打字游戏**：小青蛙迷宫、极速打地鼠、彩虹赛车、字母雨、气球派对、星际飞船、小猫钓鱼、登山勇士
- **四维状态桌面宠物小屋**：九种互动道具，每种独特动作反馈
- **AI 兴趣故事分级学习**：按词库自动生成双语科幻/童话故事 + 成长统计曲线
- **多感官闭环**：发音输入反馈，构建"发音—拼写—释义—例句"立体认知

## 🖥️ 技术栈

React 19 · TypeScript · Vite · Tailwind CSS · Recharts · pinyin-pro · @google/genai · Web Audio API / Web Speech API

## 🚀 本地运行

```bash
npm install
npm run dev
# 访问 http://localhost:5173
```

## 🌐 部署到 AI Studio（推荐，朋友零配置可用）

1. 在 [AI Studio](https://aistudio.google.com) 新建 Web App，选择本仓库的 `main` 分支导入
2. AI 平台会自动注入 **Gemini API 密钥**（`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`），**无需手动填写任何 key**
3. 部署完成后，朋友打开链接即可使用完整功能

### AI 与语音能力说明

| 能力 | 实现方式 | 公开版行为 |
|------|----------|-----------|
| AI 生词库 / 生成故事 | Gemini（AI Studio 注入密钥） | ✅ 打开即用，零配置 |
| 声音朗读 | Edge 神经音色（本地 `/api/tts`）→ 浏览器原生语音回退 | ✅ 自动回退，始终可发声 |
| 游戏音效 | Web Audio 纯前端合成 | ✅ 无需后端 |

**安全说明**：本仓库不内嵌任何 API 密钥。Gemini 密钥仅在部署平台侧注入，代码公开也不会泄露。如需自行部署并接入其他模型（如智谱 GLM），请复制 `.env.example` 为 `.env` 并填入你的密钥（`.env` 已被 git 忽略，不会入库）。

## 📄 文档

- [DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md)：完整开发纪实、踩坑复盘与架构说明
- [DICTIONARY_AUDIT.md](DICTIONARY_AUDIT.md)：词库审计
- [TEXTBOOK_AUDIT.md](TEXTBOOK_AUDIT.md)：教材同步审计

## 📦 构建

```bash
npx tsc --noEmit   # 类型检查
npm run build      # 生产构建（输出 dist/）
npm run preview    # 本地预览构建产物
```

## 📝 License

[MIT](LICENSE) © 2026 mcgilder