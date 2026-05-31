# 小红书发帖文案 · claude-workflow-viz

## 海报
assets/poster.png（1080×1440，3:4 竖版）；桌面副本：xhs-poster-claude-workflow-viz.png

---

## 标题（任选其一，建议 A）

A. 我让 Claude Code 几十个 AI 同时干活，终于看得见了👀
B. Claude Code 跑 workflow 像开盲盒？我做了个插件让它可视化
C. 自从给 Claude Code 装了这个，多 Agent 并行一目了然✨

---

## 正文

姐妹们，用 Claude Code 跑 dynamic workflow 的时候，它会一口气派出几十个 AI agent 同时干活🤯 但问题来了——**全程黑箱**，你根本不知道谁在跑、谁卡住、烧了多少 token😮‍💨

于是我做了个小工具 `claude-workflow-viz，` 还顺手做成了 Claude Code 插件👇

✨ **一启动 workflow，浏览器自动弹出实时面板**（零操作，装一次就行）
📊 甘特图 + 并发曲线，真实时间轴还原「谁在并行」
🚧 barrier 卡点看得明明白白（parallel 要等齐所有 agent）
🧩 还能导出单文件 HTML 报告，离线打开、随手分享
🪶 纯本地读取，零依赖，开源免费（MIT）

最爽的是那个**回放功能**：一次跑完的 workflow 能像视频一样拖进度条重播，agent 一个个亮起来→并行→收束，barrier 在中间卡住的瞬间超直观🥹

装它就两行（评论区放了传送门🚪）：
/plugin marketplace add democra-ai/claude-workflow-viz
/plugin install claude-workflow-viz

适合：天天用 Claude Code、喜欢折腾 AI agent、想搞懂多 Agent 编排到底在干嘛的你～

有问题评论区喊我，看到都会回😉

---

## 话题标签

#ClaudeCode #AI编程 #Claude #AIagent #程序员 #开源项目 #效率工具 #vibecoding #AI工具 #独立开发 #cursor平替 #AI编程助手 #程序员日常

---

## 评论区置顶（自己回复一条）

🚪 传送门：github.com/democra-ai/claude-workflow-viz
在线 Demo 直接点开就能玩：democra-ai.github.io/claude-workflow-viz
（需要 Node 18+，装好后跑 workflow 自动弹出～有问题扣我）

---

## 发布小贴士
- 首图用 poster.png；可加第 2、3 张图：assets/replay.gif 截一帧、assets/report.png（报告全貌）、assets/live.png（实时面板）
- 小红书正文外链会被限流，所以把仓库链接放「评论区置顶」而不是正文
- 发布时间建议晚上 8–10 点；标题带 emoji 点击率更高
