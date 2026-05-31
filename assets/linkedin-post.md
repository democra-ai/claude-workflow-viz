# LinkedIn launch post · claude-workflow-viz

## How to set the GitHub link-preview image (so shares show the hero, not the default card)

LinkedIn pulls a repo's **Open Graph image**. GitHub uses an auto-generated repo
card by default — to make it the branded hero, upload a custom **Social preview**:

1. Open: https://github.com/democra-ai/claude-workflow-viz/settings
2. Scroll to **Social preview** → **Edit** → **Upload an image…**
3. Choose **`~/Desktop/github-social-preview.png`** (1280×640) — also in the repo at `assets/social-preview.png`
4. Save. Done.

Then, before posting on LinkedIn, refresh the cache so it picks up the new image:
- Paste the URL into **https://www.linkedin.com/post-inspector/** and click *Inspect*
  (this forces LinkedIn to re-scrape and shows you the exact preview that will render).

> Note: LinkedIn's preview is a static image — it won't animate. The animated
> hero still plays for anyone who opens the README on GitHub.

---

## Post (English — recommended)

I kept running Claude Code's dynamic workflows — one prompt fanning out into dozens of AI agents running in parallel — and realised I was flying blind. Which agents are running? Where's the barrier? How many tokens did that just burn?

So I built **claude-workflow-viz**: a tiny, zero-dependency tool that makes a workflow run *visible*.

→ Install it as a Claude Code plugin and a live dashboard **opens by itself the moment a workflow starts** — agents light up as they queue → run → finish, with the gantt, the parallel() barriers, and live concurrency all updating in real time.
→ Export any run as a single self-contained HTML report you can share.
→ Replay a finished run like a video, scrubbing from 0:00 to done.

It reads only local files, ships zero runtime dependencies, and it's open source (MIT).

The fun part: I built and tested it *using* the very feature it visualizes — multi-agent workflows did the research, the design, the QA, and the docs.

👉 github.com/democra-ai/claude-workflow-viz
Live demo (no install): democra-ai.github.io/claude-workflow-viz

If you're building with Claude Code or thinking about multi-agent orchestration, I'd love your feedback.

#ClaudeCode #AI #DeveloperTools #OpenSource #AIAgents #Anthropic #SoftwareEngineering #LLM #DevTools

---

## Post (shorter variant)

Claude Code can fan a single task out across dozens of AI agents — but once the run starts, it's a black box.

I built **claude-workflow-viz** to fix that: install it as a Claude Code plugin and a live visualization auto-opens the moment a workflow starts — fan-out → barrier → reduce, a gantt, live concurrency, and a shareable HTML report. Zero dependencies, open source (MIT).

👉 github.com/democra-ai/claude-workflow-viz
Demo: democra-ai.github.io/claude-workflow-viz

#ClaudeCode #AI #DeveloperTools #OpenSource #AIAgents

---

## Post (中英混合 / for a bilingual network)

用 Claude Code 跑 dynamic workflow 时,一个 prompt 会展开成几十个 AI agent 并行干活——但全程是个黑箱。

所以我做了 **claude-workflow-viz**:装成 Claude Code 插件后,**workflow 一启动就自动弹出实时面板**——agent 逐个亮起、barrier 卡点、并发曲线实时更新,还能导出单文件 HTML 报告分享。纯本地、零依赖、开源 MIT。

最有意思的是:这个工具是我用「它所可视化的那个功能」做出来的——多 agent workflow 完成了调研、设计、QA 和文档。

👉 github.com/democra-ai/claude-workflow-viz
在线 Demo:democra-ai.github.io/claude-workflow-viz

#ClaudeCode #AI #开源 #开发者工具 #AIagent
