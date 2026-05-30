# Launch copy

Ready-to-post announcements for `claude-workflow-viz`. Nothing here is posted
automatically — copy/paste what you want, where you want.

- **Repo:** https://github.com/democra-ai/claude-workflow-viz
- **Live demo:** https://democra-ai.github.io/claude-workflow-viz/
- **Try instantly:** `npx github:democra-ai/claude-workflow-viz list`

---

## X / Twitter (short)

Claude Code can fan a task out across hundreds of subagents — but once a
dynamic workflow finishes, all that structure is locked in JSON on disk.

claude-workflow-viz reads it back: a fan-out→barrier→reduce DAG, a gantt
timeline, and a one-file interactive HTML report.

npx github:democra-ai/claude-workflow-viz
▶ live demo: https://democra-ai.github.io/claude-workflow-viz/

## X / Twitter (thread opener)

I kept running Claude Code "dynamic workflows" (dozens of subagents in
parallel) and wishing I could *see* what happened after the run ended.

So I built a tiny zero-dependency CLI that reconstructs the whole run from the
files Claude Code leaves on disk. 🧵

## Reddit (r/ClaudeAI / r/Anthropic) — title + body

**Title:** I built a CLI to visualize Claude Code dynamic workflows (DAG + gantt + interactive HTML report)

**Body:**
Dynamic workflows are great, but `/workflows` only helps *during* the session.
Afterwards the run is just JSON under `~/.claude/projects/.../workflows/`.

`claude-workflow-viz` parses that and gives you:
- a terminal view: telemetry, a gantt with per-agent bars, and the `parallel()`
  barriers drawn in;
- `watch` to follow a run live;
- `export` to a single self-contained HTML report with a replay scrubber.

Zero runtime deps, reads local files only, MIT. Try it:
`npx github:democra-ai/claude-workflow-viz list`

Live demo (interactive report, opens in the browser):
https://democra-ai.github.io/claude-workflow-viz/

It's an independent project and reads the research-preview format best-effort —
feedback and PRs welcome.

## Hacker News — Show HN

**Show HN: Visualize Claude Code dynamic workflows (DAG, gantt, HTML report)**

Claude Code's dynamic workflows orchestrate many subagents from a script it
writes; each run is journaled to disk. This CLI turns that journal into a
fan-out→barrier→reduce DAG, a gantt timeline with a live concurrency curve, and
a self-contained interactive HTML report you can open offline. Node, zero
runtime deps, MIT. Demo + repo linked.

## One-liner (for a README badge / directory listing)

> Visualize Claude Code dynamic workflows from your terminal — live progress, a
> DAG, a gantt timeline, and a self-contained interactive HTML report.
