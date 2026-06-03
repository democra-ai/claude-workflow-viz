#!/usr/bin/env node

// src/cli.ts
import { spawn as spawn2 } from "node:child_process";
import fs4 from "node:fs";
import path3 from "node:path";

// src/format.ts
var ANSI = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  italic: "\x1B[3m",
  fg: {
    black: "\x1B[30m",
    red: "\x1B[31m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    blue: "\x1B[34m",
    magenta: "\x1B[35m",
    cyan: "\x1B[36m",
    white: "\x1B[37m",
    gray: "\x1B[90m",
    brightRed: "\x1B[91m",
    brightGreen: "\x1B[92m",
    brightYellow: "\x1B[93m",
    brightBlue: "\x1B[94m",
    brightMagenta: "\x1B[95m",
    brightCyan: "\x1B[96m"
  }
};
function colorEnabled(force) {
  if (force === true) return true;
  if (force === false) return false;
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR != null && process.env.FORCE_COLOR !== "") return true;
  return Boolean(process.stdout && process.stdout.isTTY);
}
function makePainter(enabled) {
  const wrap = (codes, s) => enabled ? codes + s + ANSI.reset : s;
  return {
    enabled,
    fg: (color, s) => wrap(ANSI.fg[color], s),
    bold: (s) => wrap(ANSI.bold, s),
    dim: (s) => wrap(ANSI.dim, s),
    italic: (s) => wrap(ANSI.italic, s)
  };
}
function fmtCount(n) {
  if (!Number.isFinite(n)) return "0";
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return neg ? "-" + out : out;
}
function fmtCompact(n) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1e3) return String(Math.round(n));
  if (abs < 999500) {
    const v2 = n / 1e3;
    return (abs < 1e4 ? v2.toFixed(1) : Math.round(v2).toString()) + "k";
  }
  const v = n / 1e6;
  return (abs < 1e7 ? v.toFixed(1) : Math.round(v).toString()) + "M";
}
function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 1e3) return `${Math.round(ms)} ms`;
  const s = ms / 1e3;
  if (s < 90) return `${s.toFixed(1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return `${h}h ${rem}m`;
}
function fmtClock(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.round(ms / 1e3);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtRelativeTime(epochMs, now = Date.now()) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "unknown";
  const diff = now - epochMs;
  if (diff < 0) return "in the future";
  const sec = diff / 1e3;
  if (sec < 45) return "just now";
  const min = sec / 60;
  if (min < 60) return `${Math.round(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)}h ago`;
  const days = hr / 24;
  if (days < 7) return `${Math.round(days)}d ago`;
  try {
    return new Date(epochMs).toLocaleDateString(void 0, { month: "short", day: "numeric" });
  } catch {
    return `${Math.round(days)}d ago`;
  }
}
function truncate(s, width) {
  if (width <= 0) return "";
  if (s.length <= width) return s;
  if (width === 1) return "\u2026";
  return s.slice(0, width - 1) + "\u2026";
}
function padEnd(s, width) {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
function padStart(s, width) {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}
function stateGlyph(state) {
  switch (state) {
    case "done":
      return "\u2714";
    case "running":
      return "\u25B6";
    case "queued":
      return "\xB7";
    case "error":
      return "\u2718";
    case "skipped":
      return "\u292C";
    default:
      return "?";
  }
}
function stateColor(state) {
  switch (state) {
    case "done":
      return "brightGreen";
    case "running":
      return "brightCyan";
    case "queued":
      return "gray";
    case "error":
      return "brightRed";
    case "skipped":
      return "yellow";
    default:
      return "white";
  }
}
function phaseColor(phaseIndex) {
  const palette = [
    "brightBlue",
    "brightYellow",
    "brightGreen",
    "brightMagenta",
    "brightCyan",
    "red"
  ];
  const i = ((phaseIndex - 1) % palette.length + palette.length) % palette.length;
  return palette[i] ?? "white";
}

// src/discover.ts
import fs2 from "node:fs";
import os from "node:os";
import path2 from "node:path";

// src/parse.ts
import fs from "node:fs";
import path from "node:path";
var WorkflowParseError = class extends Error {
  constructor(message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "WorkflowParseError";
  }
};
var num = (v, d = 0) => typeof v === "number" && Number.isFinite(v) ? v : d;
var str = (v, d = "") => typeof v === "string" ? v : d;
var arr = (v) => Array.isArray(v) ? v : [];
var optNum = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var optStr = (v) => typeof v === "string" && v !== "" ? v : void 0;
function mapState(raw) {
  const s = str(raw).toLowerCase();
  if (["done", "complete", "completed", "success", "succeeded", "ok"].includes(s)) return "done";
  if (["running", "in_progress", "in-progress", "active", "started", "streaming"].includes(s))
    return "running";
  if (["queued", "pending", "waiting", "scheduled"].includes(s)) return "queued";
  if (["error", "failed", "failure", "rejected", "errored"].includes(s)) return "error";
  if (["skipped", "skip", "cancelled", "canceled", "aborted"].includes(s)) return "skipped";
  return "unknown";
}
function normalizeRun(raw, sourcePath) {
  const runId = str(raw.runId) || path.basename(sourcePath).replace(/\.json$/, "");
  const sessionDir = path.dirname(path.dirname(sourcePath));
  const progress = arr(raw.workflowProgress);
  const agentSeeds = [];
  const phaseTitleByIndex = /* @__PURE__ */ new Map();
  for (const entry of progress) {
    const type = str(entry.type);
    if (type === "workflow_agent") {
      agentSeeds.push({ raw: entry, index: num(entry.index, agentSeeds.length + 1) });
    } else if (type === "workflow_phase") {
      const pi = num(entry.index, phaseTitleByIndex.size + 1);
      phaseTitleByIndex.set(pi, str(entry.title, `Phase ${pi}`));
    }
  }
  let earliest = Number.POSITIVE_INFINITY;
  for (const seed of agentSeeds) {
    const q = optNum(seed.raw.queuedAt) ?? optNum(seed.raw.startedAt);
    if (q != null && q < earliest) earliest = q;
  }
  const explicitStart = optNum(raw.startTime);
  const fromTs = raw.timestamp ? Date.parse(str(raw.timestamp)) : NaN;
  const candidate = explicitStart ?? (Number.isFinite(fromTs) ? fromTs : void 0);
  const SANE_STARTUP_GAP_MS = 5 * 60 * 1e3;
  let startTime;
  if (Number.isFinite(earliest)) {
    startTime = candidate != null && candidate <= earliest && earliest - candidate <= SANE_STARTUP_GAP_MS ? candidate : earliest;
  } else {
    startTime = candidate ?? 0;
  }
  let latestEnd = startTime;
  const agents = agentSeeds.sort((a, b) => a.index - b.index).map((seed, i) => {
    const e = seed.raw;
    const startedAt = optNum(e.startedAt);
    const queuedAt = optNum(e.queuedAt);
    const lastProgressAt = optNum(e.lastProgressAt);
    let durationMs2 = num(e.durationMs);
    if (durationMs2 <= 0 && startedAt != null && lastProgressAt != null) {
      durationMs2 = Math.max(0, lastProgressAt - startedAt);
    }
    let endedAt;
    if (startedAt != null && durationMs2 > 0) endedAt = startedAt + durationMs2;
    else if (lastProgressAt != null) endedAt = lastProgressAt;
    else endedAt = startedAt;
    if (endedAt != null && endedAt > latestEnd) latestEnd = endedAt;
    const phaseIndex = num(e.phaseIndex, 1);
    const agent = {
      // Canonical 1-based spawn order. Using the array position (rather than
      // the raw `index` field) guarantees uniqueness even if the source
      // duplicated or zeroed indexes.
      index: i + 1,
      label: str(e.label, `agent ${i + 1}`),
      agentId: optStr(e.agentId),
      model: optStr(e.model),
      state: mapState(e.state),
      phaseIndex,
      phaseTitle: str(e.phaseTitle, phaseTitleByIndex.get(phaseIndex) ?? `Phase ${phaseIndex}`),
      queuedAt,
      startedAt,
      endedAt,
      durationMs: durationMs2,
      startRel: startedAt != null ? Math.max(0, startedAt - startTime) : 0,
      endRel: endedAt != null ? Math.max(0, endedAt - startTime) : startedAt != null ? Math.max(0, startedAt - startTime) : 0,
      attempt: Math.max(1, num(e.attempt, 1)),
      tokens: num(e.tokens),
      toolCalls: num(e.toolCalls),
      lastToolName: optStr(e.lastToolName),
      lastToolSummary: optStr(e.lastToolSummary),
      promptPreview: optStr(e.promptPreview),
      resultPreview: optStr(e.resultPreview)
    };
    if (agent.endRel < agent.startRel) agent.endRel = agent.startRel;
    return agent;
  });
  const durationMs = num(raw.durationMs) || Math.max(0, latestEnd - startTime);
  const rawPhases = arr(raw.phases);
  const phases = [];
  if (rawPhases.length > 0) {
    rawPhases.forEach((p, i) => {
      phases.push(makePhase(i + 1, str(p.title, `Phase ${i + 1}`), optStr(p.detail), agents));
    });
  } else if (phaseTitleByIndex.size > 0) {
    [...phaseTitleByIndex.keys()].sort((a, b) => a - b).forEach((pi) => phases.push(makePhase(pi, phaseTitleByIndex.get(pi), void 0, agents)));
  } else {
    const seen = /* @__PURE__ */ new Map();
    for (const a of agents) if (!seen.has(a.phaseIndex)) seen.set(a.phaseIndex, a.phaseTitle);
    [...seen.keys()].sort((a, b) => a - b).forEach((pi) => phases.push(makePhase(pi, seen.get(pi), void 0, agents)));
  }
  for (const a of agents) {
    if (!phases.some((p) => p.index === a.phaseIndex)) {
      phases.push(makePhase(a.phaseIndex, a.phaseTitle, void 0, agents));
    }
  }
  phases.sort((a, b) => a.index - b.index);
  const logs = arr(raw.logs).filter((l) => typeof l === "string");
  return {
    runId,
    workflowName: str(raw.workflowName, runId),
    status: str(raw.status, "unknown"),
    defaultModel: optStr(raw.defaultModel),
    startTime,
    durationMs,
    endTime: startTime + durationMs,
    timestamp: optStr(raw.timestamp),
    agentCount: num(raw.agentCount) || agents.length,
    totalTokens: num(raw.totalTokens) || agents.reduce((s, a) => s + a.tokens, 0),
    totalToolCalls: num(raw.totalToolCalls) || agents.reduce((s, a) => s + a.toolCalls, 0),
    scriptPath: optStr(raw.scriptPath),
    script: optStr(raw.script),
    summary: optStr(raw.summary),
    logs,
    phases,
    agents,
    result: "result" in raw ? raw.result : void 0,
    sourcePath,
    sessionDir
  };
}
function makePhase(index, title, detail, agents) {
  const members = agents.filter((a) => a.phaseIndex === index);
  const started = members.filter(
    (a) => a.startedAt != null || a.startRel > 0 || a.endRel > 0
  );
  const startRel = started.length ? Math.min(...started.map((a) => a.startRel)) : 0;
  const endRel = started.length ? Math.max(...started.map((a) => a.endRel)) : 0;
  return {
    index,
    title,
    detail,
    agentIndexes: members.map((a) => a.index),
    startRel,
    endRel
  };
}
function parseRunFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new WorkflowParseError(`Cannot read run file: ${file}`, err);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new WorkflowParseError(`Run file is not valid JSON: ${file}`, err);
  }
  if (raw == null || typeof raw !== "object") {
    throw new WorkflowParseError(`Run file does not contain a JSON object: ${file}`);
  }
  return normalizeRun(raw, file);
}

// src/discover.ts
function claudeConfigDir() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env && env.trim() !== "") return env;
  return path2.join(os.homedir(), ".claude");
}
function claudeProjectsDir() {
  return path2.join(claudeConfigDir(), "projects");
}
function encodeProjectSlug(absDir) {
  return absDir.replace(/[/.\\:]/g, "-");
}
function safeReaddir(dir) {
  try {
    return fs2.readdirSync(dir);
  } catch {
    return [];
  }
}
function isDir(p) {
  try {
    return fs2.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function refFromFile(file, projectSlug) {
  let raw;
  try {
    raw = JSON.parse(fs2.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const sessionDir = path2.dirname(path2.dirname(file));
  const num2 = (v, d = 0) => typeof v === "number" && Number.isFinite(v) ? v : d;
  const str2 = (v, d = "") => typeof v === "string" ? v : d;
  const runId = str2(raw.runId) || path2.basename(file).replace(/\.json$/, "");
  return {
    runId,
    workflowName: str2(raw.workflowName, runId),
    status: str2(raw.status, "unknown"),
    startTime: num2(raw.startTime) || Date.parse(str2(raw.timestamp)) || 0,
    durationMs: num2(raw.durationMs),
    agentCount: num2(raw.agentCount),
    sourcePath: file,
    sessionDir,
    projectSlug
  };
}
function discoverRuns(opts = {}) {
  const root = opts.projectsDir ?? claudeProjectsDir();
  const refs = [];
  for (const projectSlug of safeReaddir(root)) {
    if (opts.projectSlug && projectSlug !== opts.projectSlug) continue;
    const projectDir = path2.join(root, projectSlug);
    if (!isDir(projectDir)) continue;
    for (const session of safeReaddir(projectDir)) {
      const workflowsDir = path2.join(projectDir, session, "workflows");
      if (!isDir(workflowsDir)) continue;
      for (const entry of safeReaddir(workflowsDir)) {
        if (!entry.startsWith("wf_") || !entry.endsWith(".json")) continue;
        const file = path2.join(workflowsDir, entry);
        const ref = refFromFile(file, projectSlug);
        if (ref) refs.push(ref);
      }
    }
  }
  refs.sort((a, b) => b.startTime - a.startTime);
  return typeof opts.limit === "number" ? refs.slice(0, opts.limit) : refs;
}
var RunNotFoundError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RunNotFoundError";
  }
};
function resolveRunRef(ref, opts = {}) {
  if (ref.endsWith(".json") || ref.includes(path2.sep)) {
    const abs = path2.resolve(ref);
    if (fs2.existsSync(abs)) {
      const slug = path2.basename(path2.dirname(path2.dirname(path2.dirname(abs))));
      const r = refFromFile(abs, slug);
      if (r) return r;
      parseRunFile(abs);
      throw new RunNotFoundError(`Could not read run file: ${abs}`);
    }
  }
  const runs = discoverRuns(opts);
  if (runs.length === 0) {
    throw new RunNotFoundError(
      `No Claude Code workflow runs found. Run a workflow in Claude Code first, or check ${claudeProjectsDir()} (override with CLAUDE_CONFIG_DIR).`
    );
  }
  if (ref === "latest" || ref === "") return runs[0];
  const byId = runs.find((r) => r.runId === ref);
  if (byId) return byId;
  const byPrefix = runs.filter((r) => r.runId === `wf_${ref}` || r.runId.startsWith(ref));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) {
    throw new RunNotFoundError(
      `Ambiguous run reference "${ref}" matches ${byPrefix.length} runs; use the full run id.`
    );
  }
  throw new RunNotFoundError(
    `No run matching "${ref}". Use \`wfviz list\` to see available runs.`
  );
}

// src/types.ts
var TERMINAL_STATUSES = /* @__PURE__ */ new Set([
  "completed",
  "complete",
  "done",
  "failed",
  "error",
  "aborted",
  "cancelled",
  "canceled"
]);

// src/model.ts
function isRunning(run) {
  return !TERMINAL_STATUSES.has(run.status.toLowerCase());
}
function intervalsOf(agents) {
  return agents.filter((a) => a.startedAt != null || a.startRel > 0 || a.endRel > 0).map((a) => ({ start: a.startRel, end: Math.max(a.endRel, a.startRel + 1) }));
}
function peakConcurrency(run) {
  const events = [];
  for (const iv of intervalsOf(run.agents)) {
    events.push({ t: iv.start, delta: 1 });
    events.push({ t: iv.end, delta: -1 });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}
function concurrencyAt(run, tRel) {
  let n = 0;
  for (const iv of intervalsOf(run.agents)) {
    if (iv.start <= tRel && tRel < iv.end) n++;
  }
  return n;
}
function phaseBarrierAfter(run, phaseIndex) {
  const ordered = [...run.phases].sort((a, b) => a.index - b.index);
  const pos = ordered.findIndex((p) => p.index === phaseIndex);
  if (pos < 0 || pos + 1 >= ordered.length) return false;
  const cur = ordered[pos];
  const next = ordered[pos + 1];
  if (cur.agentIndexes.length === 0 || next.agentIndexes.length === 0) return false;
  return next.startRel >= cur.endRel;
}
function packLanes(agents) {
  const sorted = [...agents].sort((a, b) => a.startRel - b.startRel || a.index - b.index);
  const laneEnds = [];
  const laneOf = /* @__PURE__ */ new Map();
  for (const a of sorted) {
    let placed = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if ((laneEnds[i] ?? 0) <= a.startRel) {
        placed = i;
        break;
      }
    }
    if (placed < 0) {
      placed = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[placed] = Math.max(a.endRel, a.startRel + 1);
    laneOf.set(a.index, placed);
  }
  return { laneOf, laneCount: laneEnds.length };
}
function totalRetries(run) {
  return run.agents.reduce((s, a) => s + Math.max(0, a.attempt - 1), 0);
}
function shortModel(model) {
  if (!model) return "";
  let m = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  m = m.replace(/\[[^\]]*\]/g, "");
  m = m.replace(/^claude-/, "");
  return m.trim();
}
function modelsUsed(run) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const a of run.agents) {
    const s = shortModel(a.model);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (out.length === 0 && run.defaultModel) out.push(shortModel(run.defaultModel));
  return out;
}
function stateCounts(run) {
  const counts = {};
  for (const a of run.agents) counts[a.state] = (counts[a.state] ?? 0) + 1;
  return counts;
}

// src/render-html.ts
var CONCURRENCY_CAP_DEFAULT = 16;
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function describeResult(result) {
  if (result == null) return "";
  if (typeof result === "string") return result.length > 220 ? result.slice(0, 220) + "\u2026" : result;
  if (Array.isArray(result)) return `[ ${result.length} items ]`;
  if (typeof result === "object") {
    const keys = Object.keys(result);
    return `{ ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? ", \u2026" : ""} }`;
  }
  return String(result);
}
function buildHtmlData(run, opts = {}) {
  const cap = opts.concurrencyCap ?? CONCURRENCY_CAP_DEFAULT;
  const maxEnd = run.agents.reduce((m, a) => Math.max(m, a.endRel), 0);
  const windowMs = Math.max(1, run.durationMs, maxEnd);
  const SAMPLES = 160;
  const concurrency = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = Math.min(i / (SAMPLES - 1) * windowMs, Math.max(0, windowMs - 1));
    concurrency.push(concurrencyAt(run, t));
  }
  return {
    run: {
      runId: run.runId,
      workflowName: run.workflowName,
      status: run.status,
      defaultModel: shortModel(run.defaultModel),
      startTime: run.startTime,
      durationMs: run.durationMs,
      timestamp: run.timestamp ?? null,
      agentCount: run.agentCount,
      totalTokens: run.totalTokens,
      totalToolCalls: run.totalToolCalls,
      scriptPath: run.scriptPath ?? null,
      summary: run.summary ?? null,
      logs: run.logs,
      resultDesc: describeResult(run.result)
    },
    phases: run.phases.map((p) => ({
      index: p.index,
      title: p.title,
      detail: p.detail ?? null,
      startRel: p.startRel,
      endRel: p.endRel,
      agentIndexes: p.agentIndexes,
      barrierAfter: phaseBarrierAfter(run, p.index)
    })),
    agents: run.agents.map((a) => ({
      index: a.index,
      label: a.label,
      phaseIndex: a.phaseIndex,
      phaseTitle: a.phaseTitle,
      state: a.state,
      startRel: a.startRel,
      endRel: a.endRel,
      durationMs: a.durationMs,
      tokens: a.tokens,
      toolCalls: a.toolCalls,
      attempt: a.attempt,
      model: shortModel(a.model),
      lastToolName: a.lastToolName ?? null,
      promptPreview: a.promptPreview ?? null,
      resultPreview: a.resultPreview ?? null
    })),
    windowMs,
    peak: peakConcurrency(run),
    cap,
    retries: totalRetries(run),
    concurrency
  };
}
function renderHtml(run, opts = {}) {
  const data = buildHtmlData(run, opts);
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const title = escapeHtml(`${run.workflowName} \xB7 claude-workflow-viz`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="claude-workflow-viz" />
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<main id="app" aria-label="Claude Code workflow visualization"></main>
<footer class="credit">generated by <a href="https://github.com/democra-ai/claude-workflow-viz" rel="noopener noreferrer">claude-workflow-viz</a> \xB7 a visualizer for Claude Code dynamic workflows</footer>
<script>window.__WFVIZ__ = ${json};</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}
var CSS = `
:root{
  --bg:#0a0e13; --panel:#0f151c; --panel2:#131b24; --line:#1f2a36;
  --ink:#cdd6e0; --mut:#7c8895; --dim:#525e6b;
  --teal:#2dd4bf; --teal-dim:#155e57; --amber:#f5b454; --red:#f87171; --green:#34d399;
  --p1:#5aa9ff; --p2:#f5b454; --p3:#34d399; --p4:#c084fc; --p5:#22d3ee; --p6:#fb7185;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
  -webkit-font-smoothing:antialiased;line-height:1.45}
a{color:var(--teal);text-decoration:none}
#app{max-width:1180px;margin:0 auto;padding:28px 22px 8px}
.credit{max-width:1180px;margin:0 auto;padding:14px 22px 40px;color:var(--dim);font-size:12px;font-family:var(--mono)}

.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 14px;margin-bottom:6px}
.head h1{font-size:22px;font-weight:700;margin:0;letter-spacing:.2px}
.pill{font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);
  display:inline-flex;align-items:center;gap:6px;color:var(--mut)}
.pill .dot{width:7px;height:7px;border-radius:50%}
.pill.ok{color:var(--green)} .pill.ok .dot{background:var(--green)}
.pill.run{color:var(--teal)} .pill.run .dot{background:var(--teal);animation:pulse 1.4s infinite}
.pill.err{color:var(--red)} .pill.err .dot{background:var(--red)}
.sub{color:var(--mut);font-family:var(--mono);font-size:12px;margin:2px 0 18px}
.sub span{color:var(--dim)}

.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:18px}
.chip{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 13px;min-width:96px}
.chip b{display:block;font-size:18px;font-family:var(--mono);font-weight:700}
.chip span{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px}
.chip.warn b{color:var(--amber)} .chip.bad b{color:var(--red)}

.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.panel h2{font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);margin:0 0 14px}

.transport{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tbtn{background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:9px;
  width:38px;height:32px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.tbtn:hover{border-color:var(--teal);color:var(--teal)}
.tbtn.primary{background:var(--teal);color:#04231f;border-color:var(--teal);font-weight:700}
.clock{font-family:var(--mono);font-size:13px;color:var(--teal);min-width:92px}
.scrub{flex:1;min-width:160px;accent-color:var(--teal)}
.speeds{display:flex;gap:4px}
.speeds button{background:transparent;border:1px solid var(--line);color:var(--mut);border-radius:7px;
  font-family:var(--mono);font-size:11px;padding:4px 8px;cursor:pointer}
.speeds button.on{border-color:var(--teal);color:var(--teal)}
.liveconc{font-family:var(--mono);font-size:12px;color:var(--mut)}
.liveconc b{color:var(--ink)}

svg{display:block;width:100%;height:auto;overflow:visible}
.bar{cursor:pointer;transition:opacity .12s}
.bar:hover{opacity:.85}
.bar.dim{opacity:.32}
.axis text,.lane text{font-family:var(--mono);font-size:11px;fill:var(--mut)}
.gridline{stroke:var(--line);stroke-width:1}
.barrier-line{stroke:var(--amber);stroke-width:1.4;stroke-dasharray:4 4;opacity:.7}
.barrier-txt{fill:var(--amber);font-family:var(--mono);font-size:10px}
.playhead{stroke:var(--teal);stroke-width:1.4}
.concarea{fill:var(--teal);opacity:.12}
.conctop{stroke:var(--teal);stroke-width:1.2;fill:none;opacity:.5}

.flow{display:flex;flex-direction:column;gap:0}
.band{border-left:2px solid var(--line);padding:10px 0 10px 16px;position:relative}
.band .bt{font-family:var(--mono);font-size:12px;color:var(--mut);margin-bottom:9px}
.band .bt b{color:var(--ink)}
.nodes{display:flex;flex-wrap:wrap;gap:8px}
.node{border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:8px 10px;
  font-family:var(--mono);font-size:11px;cursor:pointer;min-width:120px;transition:border-color .15s,box-shadow .15s,opacity .15s}
.node:hover{border-color:var(--teal)}
.node.active{box-shadow:0 0 0 1px var(--teal),0 0 16px -4px var(--teal)}
.node .nl{color:var(--ink);font-weight:600;display:block;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.node .nm{color:var(--mut);font-size:10px;display:flex;gap:8px;flex-wrap:wrap}
.node[data-state=running]{border-color:var(--teal)}
.node[data-state=error]{border-color:var(--red)}
.barrier-row{display:flex;align-items:center;gap:8px;color:var(--amber);font-family:var(--mono);
  font-size:11px;padding:8px 0 8px 16px;border-left:2px solid var(--amber)}
.ingress,.egress{font-family:var(--mono);font-size:11px;color:var(--mut);padding:8px 0 8px 16px;border-left:2px solid var(--teal-dim)}
.ingress b,.egress b{color:var(--teal)}

.logs{font-family:var(--mono);font-size:12px;color:var(--mut);display:flex;flex-direction:column;gap:6px}
.logs .lg::before{content:"\u25B8 ";color:var(--teal)}

.detail{font-family:var(--mono);font-size:12px;color:var(--mut);min-height:54px}
.detail.empty{color:var(--dim)}
.detail .dl{color:var(--ink);font-weight:700;font-size:13px}
.detail .row{margin-top:4px}
.detail .row b{color:var(--ink)}
.detail pre{white-space:pre-wrap;word-break:break-word;background:var(--panel2);border:1px solid var(--line);
  border-radius:8px;padding:8px 10px;margin:8px 0 0;color:var(--mut);max-height:160px;overflow:auto}

.legend{display:flex;flex-wrap:wrap;gap:14px;color:var(--mut);font-family:var(--mono);font-size:11px;margin-top:4px}
.legend i{width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:5px;vertical-align:middle}
.note{color:var(--dim);font-size:11px;font-family:var(--mono);margin-top:10px}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (max-width:680px){#app{padding:18px 12px}.head h1{font-size:18px}.chip{min-width:78px}}
@media (prefers-reduced-motion:reduce){.pill.run .dot{animation:none}}
`;
var CLIENT_JS = `
"use strict";
(function(){
var D = window.__WFVIZ__; if(!D){return;}
var PCOL = ["var(--p1)","var(--p2)","var(--p3)","var(--p4)","var(--p5)","var(--p6)"];
function pcol(i){ return PCOL[((i-1)%PCOL.length+PCOL.length)%PCOL.length]; }
function el(t,c,x){ var e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e; }
function S(t,a){ var e=document.createElementNS("http://www.w3.org/2000/svg",t); for(var k in a){ e.setAttribute(k,a[k]); } return e; }
function fmtClock(ms){ ms=Math.max(0,ms||0); var s=Math.round(ms/1000); var m=Math.floor(s/60); var r=s%60; return m+":"+(r<10?"0":"")+r; }
function fmtDur(ms){ if(ms<1000)return Math.round(ms)+" ms"; var s=ms/1000; if(s<90)return s.toFixed(1)+" s"; var m=s/60; if(m<60)return m.toFixed(1)+" min"; return Math.floor(m/60)+"h "+Math.round(m%60)+"m"; }
function fmtNum(n){ n=Math.round(n||0); var s=String(Math.abs(n)),o=""; for(var i=0;i<s.length;i++){ if(i>0&&(s.length-i)%3===0)o+=","; o+=s[i]; } return (n<0?"-":"")+o; }
function fmtK(n){ n=n||0; if(n<1000)return String(Math.round(n)); if(n<1e6)return (n<1e4?(n/1e3).toFixed(1):Math.round(n/1e3))+"k"; return (n/1e6).toFixed(1)+"M"; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

var app=document.getElementById("app");
var WIN=Math.max(1,D.windowMs);
var agentByIndex={}; D.agents.forEach(function(a){ agentByIndex[a.index]=a; });

// ---------- header ----------
var head=el("div","head");
head.appendChild(el("h1",null,D.run.workflowName));
var st=(D.run.status||"").toLowerCase();
var pc=st.indexOf("complet")>=0||st==="done"?"ok":(st.indexOf("err")>=0||st.indexOf("fail")>=0||st.indexOf("abort")>=0?"err":"run");
var pill=el("span","pill "+pc); pill.appendChild(el("span","dot")); pill.appendChild(el("span",null,D.run.status)); head.appendChild(pill);
app.appendChild(head);
var sub=el("div","sub");
var when=D.run.timestamp?new Date(D.run.timestamp).toLocaleString():"";
sub.innerHTML=esc(D.run.runId)+"  <span>\xB7</span>  "+esc(D.run.defaultModel||"")+(when?"  <span>\xB7</span>  "+esc(when):"");
app.appendChild(sub);
function esc(s){ s=(s==null?"":String(s)); return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

// ---------- chips ----------
var chips=el("div","chips");
function chip(v,l,cls){ var c=el("div","chip"+(cls?" "+cls:"")); c.appendChild(el("b",null,v)); c.appendChild(el("span",null,l)); chips.appendChild(c); }
chip(String(D.run.agentCount),"agents");
chip(fmtNum(D.run.totalToolCalls),"tool calls");
chip(fmtNum(D.run.totalTokens),"tokens");
chip(fmtDur(D.run.durationMs),"duration");
chip("\xD7"+D.peak+" / "+D.cap,"peak concurrency");
if(D.retries>0) chip(String(D.retries),"retries","warn");
app.appendChild(chips);

// ---------- transport ----------
var tp=el("div","panel");
var trow=el("div","transport");
var bRestart=el("button","tbtn","\u27F2"); bRestart.title="Restart"; bRestart.setAttribute("aria-label","Restart");
var bPlay=el("button","tbtn primary","\u25B6"); bPlay.title="Play / pause"; bPlay.setAttribute("aria-label","Play or pause");
var clock=el("div","clock","0:00 / "+fmtClock(WIN));
var scrub=document.createElement("input"); scrub.type="range"; scrub.min="0"; scrub.max=String(WIN); scrub.value="0"; scrub.step=String(Math.max(1,Math.round(WIN/600))); scrub.className="scrub"; scrub.setAttribute("aria-label","Replay position"); scrub.setAttribute("aria-valuetext","0:00");
var speeds=el("div","speeds"); var SP=[1,2,4,8]; var speed=4; var spbtns=[];
SP.forEach(function(s){ var b=el("button",s===speed?"on":null,s+"\xD7"); b.onclick=function(){ speed=s; spbtns.forEach(function(x,i){ x.className=SP[i]===speed?"on":""; }); }; spbtns.push(b); speeds.appendChild(b); });
var live=el("div","liveconc"); live.innerHTML="in flight <b>0</b>";
trow.appendChild(bRestart); trow.appendChild(bPlay); trow.appendChild(clock); trow.appendChild(scrub); trow.appendChild(speeds); trow.appendChild(live);
tp.appendChild(trow); app.appendChild(tp);

// ---------- gantt ----------
var gp=el("div","panel"); gp.appendChild(el("h2",null,"Timeline \xB7 gantt"));
var gwrap=el("div"); gp.appendChild(gwrap); app.appendChild(gp);
var ROWH=26, PADL=8, PADR=14, PADT=10, AXISH=22, CONCH=46;
var rows=D.agents.slice().sort(function(a,b){ return a.startRel-b.startRel || a.index-b.index; });
var W=1000; var GH=rows.length*ROWH; var H=PADT+CONCH+GH+AXISH;
var svg=S("svg",{viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"xMidYMid meet",role:"img","aria-label":"Gantt timeline: "+D.agents.length+" agents across "+D.phases.length+" phases, peak concurrency "+D.peak+" of "+D.cap});
var plotL=170, plotR=W-PADR, plotW=plotR-plotL;
function xOf(ms){ return plotL+ (clamp(ms,0,WIN)/WIN)*plotW; }
// gridlines + axis ticks
var ticks=6;
for(var i=0;i<=ticks;i++){ var tx=plotL+(i/ticks)*plotW; var tms=(i/ticks)*WIN;
  svg.appendChild(S("line",{class:"gridline",x1:tx,y1:PADT,x2:tx,y2:PADT+CONCH+GH}));
  var tl=S("text",{class:"axis",x:tx,y:H-6,"text-anchor":i===0?"start":(i===ticks?"end":"middle")}); tl.textContent=fmtClock(tms); svg.appendChild(tl);
}
// concurrency area
var cTop=PADT, cBot=PADT+CONCH;
var maxC=Math.max(D.peak,1);
var pts=[]; D.concurrency.forEach(function(v,idx){ var x=plotL+(idx/(D.concurrency.length-1))*plotW; var y=cBot-(v/maxC)*(CONCH-8); pts.push([x,y]); });
var areaD="M "+plotL+" "+cBot; pts.forEach(function(p){ areaD+=" L "+p[0].toFixed(1)+" "+p[1].toFixed(1); }); areaD+=" L "+plotR+" "+cBot+" Z";
svg.appendChild(S("path",{class:"concarea",d:areaD}));
svg.appendChild(S("path",{class:"conctop",d:"M "+pts.map(function(p){return p[0].toFixed(1)+" "+p[1].toFixed(1);}).join(" L ")}));
var clbl=S("text",{class:"axis",x:plotL,y:cTop+10}); clbl.textContent="concurrency \xB7 peak \xD7"+D.peak; svg.appendChild(clbl);
// barrier lines (at phase end where barrierAfter)
D.phases.forEach(function(p){ if(p.barrierAfter){ var bx=xOf(p.endRel);
  svg.appendChild(S("line",{class:"barrier-line",x1:bx,y1:cBot,x2:bx,y2:cBot+GH}));
  var bt=S("text",{class:"barrier-txt",x:bx+3,y:cBot+12}); bt.textContent="barrier"; svg.appendChild(bt);
}});
// agent rows
var barEls=[];
rows.forEach(function(a,r){ var y=cBot+r*ROWH+4; var h=ROWH-9;
  var lbl=S("text",{class:"lane",x:PADL,y:y+h-2}); lbl.textContent=a.label.length>24?a.label.slice(0,23)+"\u2026":a.label; svg.appendChild(lbl);
  var x1=xOf(a.startRel); var x2=Math.max(x1+3,xOf(a.state==="running"?WIN:a.endRel));
  var rect=S("rect",{class:"bar",x:x1,y:y,width:(x2-x1),height:h,rx:3,fill:pcol(a.phaseIndex)});
  rect.setAttribute("data-index",a.index);
  if(a.state==="error") rect.setAttribute("stroke","var(--red)");
  rect.addEventListener("click",function(){ select(a.index); });
  svg.appendChild(rect); barEls.push({a:a,rect:rect});
});
// playhead
var ph=S("line",{class:"playhead",x1:plotL,y1:PADT,x2:plotL,y2:cBot+GH}); svg.appendChild(ph);
gwrap.appendChild(svg);

// ---------- flow (fan-out -> barrier -> reduce) ----------
var fp=el("div","panel"); fp.appendChild(el("h2",null,"Flow \xB7 fan-out \u2192 barrier \u2192 reduce"));
var flow=el("div","flow");
var ing=el("div","ingress"); ing.innerHTML="prompt \u2192 <b>script.js</b> <span style='color:var(--dim)'>(orchestration Claude wrote; intermediate results stay in script vars, not the model's context)</span>"; flow.appendChild(ing);
var nodeEls={};
D.phases.slice().sort(function(a,b){return a.index-b.index;}).forEach(function(p){
  var band=el("div","band"); band.style.borderLeftColor=pcol(p.index);
  var bt=el("div","bt"); bt.innerHTML="Phase "+p.index+" \xB7 <b>"+esc(p.title)+"</b>"+(p.detail?" <span style='color:var(--dim)'>\u2014 "+esc(p.detail)+"</span>":""); band.appendChild(bt);
  var nodes=el("div","nodes");
  D.agents.filter(function(a){return a.phaseIndex===p.index;}).forEach(function(a){
    var n=el("div","node"); n.setAttribute("data-state",a.state); n.style.borderLeftColor=pcol(p.index);
    var nl=el("span","nl",a.label); var nm=el("div","nm");
    nm.appendChild(el("span",null,fmtDur(a.durationMs)));
    if(a.tokens) nm.appendChild(el("span",null,fmtK(a.tokens)+" tok"));
    if(a.toolCalls) nm.appendChild(el("span",null,a.toolCalls+" tools"));
    if(a.attempt>1) nm.appendChild(el("span",null,"\xD7"+a.attempt));
    n.appendChild(nl); n.appendChild(nm);
    n.setAttribute("tabindex","0"); n.setAttribute("role","button"); n.setAttribute("aria-label","agent "+a.label);
    n.addEventListener("click",function(){ select(a.index); });
    n.addEventListener("keydown",function(ev){ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); select(a.index); } });
    nodes.appendChild(n); nodeEls[a.index]=n;
  });
  band.appendChild(nodes); flow.appendChild(band);
  if(p.barrierAfter){ var br=el("div","barrier-row"); br.textContent="\u2551 barrier \u2014 parallel() waits for ALL "+D.agents.filter(function(a){return a.phaseIndex===p.index;}).length+" before the next phase"; flow.appendChild(br); }
});
var eg=el("div","egress"); eg.innerHTML="<b>return</b> "+esc(D.run.resultDesc||"(value)")+" <span style='color:var(--dim)'>\u2192 back to the conversation</span>"; flow.appendChild(eg);
fp.appendChild(flow); app.appendChild(fp);

// ---------- detail ----------
var dp=el("div","panel"); dp.appendChild(el("h2",null,"Agent detail"));
var detail=el("div","detail empty","Click any bar or node to inspect an agent."); dp.appendChild(detail); app.appendChild(dp);
function select(idx){ var a=agentByIndex[idx]; if(!a)return;
  Object.keys(nodeEls).forEach(function(k){ nodeEls[k].classList.toggle("active",String(k)===String(idx)); });
  barEls.forEach(function(b){ b.rect.classList.toggle("dim", b.a.index!==idx); });
  detail.className="detail";
  var html="<div class='dl'>"+esc(a.label)+"</div>";
  html+="<div class='row'>phase <b>"+a.phaseIndex+" \xB7 "+esc(a.phaseTitle)+"</b> \xB7 state <b>"+esc(a.state)+"</b> \xB7 "+esc(a.model||"")+"</div>";
  html+="<div class='row'>start <b>"+fmtClock(a.startRel)+"</b> \xB7 end <b>"+fmtClock(a.endRel)+"</b> \xB7 "+fmtDur(a.durationMs)+" \xB7 <b>"+fmtNum(a.tokens)+"</b> tok \xB7 <b>"+a.toolCalls+"</b> tools"+(a.attempt>1?" \xB7 attempts <b>"+a.attempt+"</b>":"")+(a.lastToolName?" \xB7 last tool "+esc(a.lastToolName):"")+"</div>";
  if(a.promptPreview) html+="<pre>"+esc(a.promptPreview)+"</pre>";
  if(a.resultPreview) html+="<pre>"+esc(a.resultPreview)+"</pre>";
  detail.innerHTML=html;
}

// ---------- logs ----------
if(D.run.logs && D.run.logs.length){ var lp=el("div","panel"); lp.appendChild(el("h2",null,"log() output"));
  var lc=el("div","logs"); D.run.logs.forEach(function(l){ lc.appendChild(el("div","lg",l)); }); lp.appendChild(lc); app.appendChild(lp);
}

// ---------- legend ----------
var lg=el("div","panel"); lg.appendChild(el("h2",null,"Phases"));
var leg=el("div","legend");
D.phases.slice().sort(function(a,b){return a.index-b.index;}).forEach(function(p){ var s=el("span"); var sw=el("i"); sw.style.background=pcol(p.index); s.appendChild(sw); s.appendChild(document.createTextNode(p.title)); leg.appendChild(s); });
lg.appendChild(leg);
lg.appendChild(el("div","note","Bars are positioned by each agent's real start/end times. A barrier marks where a phase had fully finished before the next began \u2014 the signature of parallel()/pipeline() joining results."));
app.appendChild(lg);

// ---------- replay engine ----------
var t=0, playing=false, raf=0, last=0;
var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
function setT(v){ t=clamp(v,0,WIN); scrub.value=String(Math.round(t));
  var x=xOf(t); ph.setAttribute("x1",x); ph.setAttribute("x2",x);
  clock.textContent=fmtClock(t)+" / "+fmtClock(WIN);
  scrub.setAttribute("aria-valuetext",fmtClock(t));
  var inflight=0;
  D.agents.forEach(function(a){ var on=a.startRel<=t && t<Math.max(a.endRel,a.startRel+1); if(a.state==="running") on=a.startRel<=t; if(on)inflight++;
    var n=nodeEls[a.index]; if(n) n.classList.toggle("active",on);
  });
  barEls.forEach(function(b){ var a=b.a; var done=t>=a.endRel; var started=t>=a.startRel; b.rect.style.opacity = started?(done?1:0.9):0.28; });
  live.innerHTML="in flight <b>"+inflight+"</b>";
}
function tick(ts){ if(!playing)return; if(!last)last=ts; var dt=ts-last; last=ts; setT(t+dt*speed); if(t>=WIN){ playing=false; bPlay.textContent="\u25B6"; } else { raf=requestAnimationFrame(tick); } }
function play(){ if(t>=WIN)t=0; playing=true; bPlay.textContent="\u275A\u275A"; last=0; raf=requestAnimationFrame(tick); }
function pause(){ playing=false; bPlay.textContent="\u25B6"; cancelAnimationFrame(raf); }
bPlay.onclick=function(){ playing?pause():play(); };
bRestart.onclick=function(){ pause(); setT(0); };
scrub.oninput=function(){ pause(); setT(Number(scrub.value)); };
setT(0);
if(!reduce){ /* leave paused by default; user presses play */ }
})();
`;

// src/render-terminal.ts
var CONCURRENCY_CAP_DEFAULT2 = 16;
function statusGlyph(run) {
  const s = run.status.toLowerCase();
  if (["completed", "complete", "done"].includes(s)) return { glyph: "\u2714", color: "brightGreen" };
  if (["failed", "error", "aborted"].includes(s)) return { glyph: "\u2718", color: "brightRed" };
  if (isRunning(run)) return { glyph: "\u25B6", color: "brightCyan" };
  return { glyph: "\u2022", color: "white" };
}
function gcells(startRel, endRel, total, width) {
  if (total <= 0) return [0, Math.min(width, 1)];
  let a = Math.floor(Math.max(0, startRel) / total * width);
  let b = Math.ceil(Math.min(endRel, total) / total * width);
  a = Math.max(0, Math.min(a, width - 1));
  b = Math.max(a + 1, Math.min(b, width));
  return [a, b];
}
function bar(p, startRel, endRel, total, width, color) {
  const [a, b] = gcells(startRel, endRel, total, width);
  return p.dim("\xB7".repeat(a)) + p.fg(color, "\u2588".repeat(b - a)) + p.dim("\xB7".repeat(Math.max(0, width - b)));
}
function describeResult2(result) {
  if (result == null) return void 0;
  if (typeof result === "string") return `"${truncate(result.replace(/\s+/g, " "), 56)}"`;
  if (Array.isArray(result)) return `[ ${result.length} item${result.length === 1 ? "" : "s"} ]`;
  if (typeof result === "object") {
    const keys = Object.keys(result);
    const shown = keys.slice(0, 6).join(", ");
    return `{ ${shown}${keys.length > 6 ? ", \u2026" : ""} }`;
  }
  return String(result);
}
function renderRun(run, opts = {}) {
  const p = makePainter(opts.color ?? false);
  const width = Math.max(56, Math.min(opts.width ?? 100, 140));
  const cap = opts.concurrencyCap ?? CONCURRENCY_CAP_DEFAULT2;
  const now = opts.now ?? Date.now();
  const lines = [];
  const maxEnd = run.agents.reduce((m, a) => Math.max(m, a.endRel), 0);
  const baseWindow = Math.max(1, run.durationMs, maxEnd);
  const nowRel = Math.max(0, now - run.startTime);
  const windowMs = isRunning(run) && nowRel > baseWindow ? Math.min(nowRel, Math.round(baseWindow * 1.5)) : baseWindow;
  const narrow = width < 84;
  const indent = "  ";
  const ROW_PREFIX = 6;
  const statsBudget = narrow ? 10 : 26;
  const labels = run.agents.map((a) => a.label);
  const maxLabel = labels.reduce((m, l) => Math.max(m, l.length), 0);
  let labelW = Math.max(8, Math.min(maxLabel, narrow ? 16 : 30));
  let ganttW = width - ROW_PREFIX - 2 - labelW - statsBudget;
  if (ganttW < 12) {
    labelW = Math.max(6, labelW + (ganttW - 12));
    ganttW = 12;
  }
  ganttW = Math.min(ganttW, 44);
  const sg = statusGlyph(run);
  lines.push("");
  lines.push(indent + p.bold(run.workflowName));
  const models = modelsUsed(run);
  const metaBits = [
    p.fg(sg.color, `${sg.glyph} ${run.status}`),
    p.dim(run.runId),
    run.startTime ? p.dim(fmtRelativeTime(run.startTime, now)) : "",
    models.length ? p.dim(models.join(", ")) : ""
  ].filter(Boolean);
  lines.push(indent + metaBits.join(p.dim("  \xB7  ")));
  lines.push("");
  const peak = peakConcurrency(run);
  const retries = totalRetries(run);
  const counts = stateCounts(run);
  const chips = [
    `${p.bold(String(run.agentCount))} agents`,
    `${p.bold(fmtCount(run.totalToolCalls))} tool calls`,
    `${p.bold(fmtCount(run.totalTokens))} tokens`,
    `${p.bold(fmtDuration(run.durationMs))}`,
    `peak ${p.bold("\xD7" + peak)}${p.dim("/" + cap)}`
  ];
  if (retries > 0) chips.push(p.fg("yellow", `${retries} retr${retries === 1 ? "y" : "ies"}`));
  if (counts.error) chips.push(p.fg("brightRed", `${counts.error} failed`));
  lines.push(indent + chips.join(p.dim("   ")));
  if (run.logs.length) {
    lines.push("");
    for (const log of run.logs.slice(0, 6)) {
      lines.push(indent + p.dim("\u25B8 ") + p.italic(p.dim(truncate(log.replace(/\s+/g, " "), width - 6))));
    }
  }
  const orderedPhases = [...run.phases].sort((a, b) => a.index - b.index);
  for (const phase of orderedPhases) {
    lines.push("");
    const members = run.agents.filter((a) => a.phaseIndex === phase.index).sort((a, b) => a.startRel - b.startRel || a.index - b.index);
    const { laneCount } = packLanes(members);
    const phaseStarted = members.some(
      (a) => a.startedAt != null || a.startRel > 0 || a.endRel > 0
    );
    const phaseRunning = members.some((a) => a.state === "running");
    const phaseEnd = phaseRunning ? windowMs : phase.endRel;
    const phaseLabel = `Phase ${phase.index} \xB7 ${phase.title}`;
    const phaseBar = phaseStarted ? bar(p, phase.startRel, phaseEnd, windowMs, ganttW, phaseColor(phase.index)) : p.dim("\xB7".repeat(ganttW));
    const fanout = !narrow && laneCount > 1 ? p.dim(`  \u2443 ${laneCount}-wide`) : "";
    lines.push(
      indent + p.bold(p.fg(phaseColor(phase.index), padEnd(truncate(phaseLabel, labelW + 4), labelW + 4))) + " " + phaseBar + " " + p.dim(phaseStarted ? fmtDuration(Math.max(0, phaseEnd - phase.startRel)) : "queued") + fanout
    );
    for (const a of members) {
      const glyph = p.fg(stateColor(a.state), stateGlyph(a.state));
      const label = padEnd(truncate(a.label, labelW), labelW);
      const startedA = a.startedAt != null || a.startRel > 0 || a.endRel > 0;
      const aEnd = a.state === "running" ? windowMs : a.endRel;
      const abar = startedA ? bar(p, a.startRel, aEnd, windowMs, ganttW, phaseColor(a.phaseIndex)) : p.dim("\xB7".repeat(ganttW));
      const stats = [padStart(fmtDuration(a.durationMs), 7)];
      if (!narrow && a.tokens) stats.push(p.dim(`${fmtCompact(a.tokens)} tok`));
      if (!narrow && a.toolCalls) stats.push(p.dim(`${a.toolCalls}t`));
      if (a.attempt > 1) stats.push(p.fg("yellow", `\xD7${a.attempt}`));
      lines.push(indent + "  " + glyph + " " + label + " " + abar + " " + stats.join(p.dim(" \xB7 ")));
    }
    if (phaseBarrierAfter(run, phase.index)) {
      const barrierTxt = p.fg(
        "yellow",
        narrow ? "\u2551 barrier \u2551" : "\u2551 barrier \u2014 next phase waits for all \u2551"
      );
      lines.push(indent + padEnd("", labelW + 5) + barrierTxt);
    }
  }
  lines.push("");
  const axisPad = labelW + 5;
  const axisInner = Math.max(2, ganttW - 2);
  const axis = p.dim("\u251C" + "\u2500".repeat(axisInner) + "\u2524");
  const left = fmtClock(0);
  const right = fmtClock(windowMs);
  lines.push(
    indent + p.dim(padEnd("timeline", axisPad)) + p.dim(left) + " " + axis + " " + p.dim(right)
  );
  const desc = describeResult2(run.result);
  if (desc) {
    lines.push("");
    lines.push(indent + p.fg("brightGreen", "\u2192 ") + p.dim("returns ") + desc);
  }
  if (run.summary) {
    lines.push(indent + p.dim(truncate(run.summary.replace(/\s+/g, " "), width - 4)));
  }
  lines.push("");
  return lines.join("\n");
}
function renderRunLine(run, opts = {}) {
  const p = makePainter(opts.color ?? false);
  const now = opts.now ?? Date.now();
  const s = run.status.toLowerCase();
  const color = ["completed", "complete", "done"].includes(s) ? "brightGreen" : ["failed", "error", "aborted"].includes(s) ? "brightRed" : "brightCyan";
  return [
    p.fg(color, padEnd(run.status, 10)),
    p.bold(padEnd(truncate(run.workflowName, 38), 38)),
    p.dim(padEnd(run.runId, 18)),
    padStart(`${run.agentCount} agents`, 10),
    padStart(fmtDuration(run.durationMs), 9),
    p.dim(run.startTime ? fmtRelativeTime(run.startTime, now) : "")
  ].join("  ");
}

// src/server.ts
import { spawn } from "node:child_process";
import fs3 from "node:fs";
import http from "node:http";

// src/render-live.ts
function liveDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>wfviz \u2014 live workflow</title>
<style>${CSS2}</style>
</head>
<body>
<main id="app">
  <div id="empty" class="empty">
    <div class="spinner"></div>
    <h1>Waiting for a workflow\u2026</h1>
    <p>Start a dynamic workflow in Claude Code and it will appear here, live.</p>
  </div>
  <div id="dash" hidden></div>
</main>
<footer class="credit">live \xB7 <a href="https://github.com/democra-ai/claude-workflow-viz" rel="noopener noreferrer">claude-workflow-viz</a></footer>
<script>${CLIENT_JS2}</script>
</body>
</html>
`;
}
var CSS2 = `
:root{
  --bg:#0a0e13;--panel:#0f151c;--panel2:#131b24;--line:#1f2a36;--ink:#cdd6e0;--mut:#7c8895;--dim:#525e6b;
  --teal:#2dd4bf;--green:#34d399;--amber:#f5b454;--red:#f87171;
  --p1:#5aa9ff;--p2:#f5b454;--p3:#34d399;--p4:#c084fc;--p5:#22d3ee;--p6:#fb7185;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.45;-webkit-font-smoothing:antialiased}
a{color:var(--teal);text-decoration:none}
#app{max-width:1180px;margin:0 auto;padding:26px 22px 8px;min-height:60vh}
.credit{max-width:1180px;margin:0 auto;padding:14px 22px 40px;color:var(--dim);font-size:12px;font-family:var(--mono)}
.empty{text-align:center;padding:14vh 20px;color:var(--mut)}
.empty h1{font-size:22px;color:var(--ink);font-weight:600;margin:18px 0 6px}
.empty p{font-size:14px;margin:0}
.spinner{width:34px;height:34px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--teal);margin:0 auto;animation:spin 1s linear infinite}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 14px;margin-bottom:4px}
.head h1{font-size:22px;font-weight:700;margin:0}
.pill{font-family:var(--mono);font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);display:inline-flex;align-items:center;gap:6px;color:var(--mut)}
.pill .dot{width:7px;height:7px;border-radius:50%}
.pill.live{color:var(--teal);border-color:#1c4b46}.pill.live .dot{background:var(--teal);animation:pulse 1.3s infinite}
.pill.done{color:var(--green)}.pill.done .dot{background:var(--green)}
.pill.err{color:var(--red)}.pill.err .dot{background:var(--red)}
.sub{color:var(--mut);font-family:var(--mono);font-size:12px;margin:2px 0 16px}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:16px}
.chip{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 13px;min-width:90px}
.chip b{display:block;font-size:17px;font-family:var(--mono);font-weight:700}
.chip span{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px}
.chip.warn b{color:var(--amber)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px}
.panel h2{font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);margin:0 0 12px}
svg{display:block;width:100%;height:auto;overflow:visible}
.gridline{stroke:var(--line);stroke-width:1}.axis{font-family:var(--mono);font-size:11px;fill:var(--mut)}
.lane{font-family:var(--mono);font-size:11px;fill:var(--mut)}
.barrier-line{stroke:var(--amber);stroke-width:1.3;stroke-dasharray:4 4;opacity:.7}
.barrier-txt{fill:var(--amber);font-family:var(--mono);font-size:10px}
.nowline{stroke:var(--teal);stroke-width:1.3;opacity:.8}
.concarea{fill:var(--teal);opacity:.12}.conctop{stroke:var(--teal);stroke-width:1.2;fill:none;opacity:.5}
.run-bar{animation:barpulse 1.4s ease-in-out infinite}
.flow{display:flex;flex-direction:column}
.band{border-left:2px solid var(--line);padding:9px 0 9px 16px}
.band .bt{font-family:var(--mono);font-size:12px;color:var(--mut);margin-bottom:8px}.band .bt b{color:var(--ink)}
.nodes{display:flex;flex-wrap:wrap;gap:8px}
.node{border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:7px 10px;font-family:var(--mono);font-size:11px;min-width:118px}
.node .nl{color:var(--ink);font-weight:600;display:block;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
.node .nm{color:var(--mut);font-size:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.node .st{width:7px;height:7px;border-radius:50%;display:inline-block}
.node.done{border-color:#1f5a44}.node.done .st{background:var(--green)}
.node.running{border-color:var(--teal);box-shadow:0 0 14px -4px var(--teal)}.node.running .st{background:var(--teal);animation:pulse 1.2s infinite}
.node.queued{opacity:.6}.node.queued .st{background:var(--dim)}
.node.error{border-color:var(--red)}.node.error .st{background:var(--red)}
.barrier-row{color:var(--amber);font-family:var(--mono);font-size:11px;padding:7px 0 7px 16px;border-left:2px solid var(--amber)}
.ingress,.egress{font-family:var(--mono);font-size:11px;color:var(--mut);padding:7px 0 7px 16px;border-left:2px solid #155e57}
.ingress b,.egress b{color:var(--teal)}
.logs{font-family:var(--mono);font-size:12px;color:var(--mut);display:flex;flex-direction:column;gap:5px}
.logs .lg::before{content:"\u25B8 ";color:var(--teal)}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes barpulse{0%,100%{opacity:1}50%{opacity:.62}}
@media (prefers-reduced-motion:reduce){.spinner,.pill .dot,.node.running .st,.run-bar{animation:none}}
@media (max-width:680px){#app{padding:16px 12px}.head h1{font-size:18px}}
`;
var CLIENT_JS2 = `
"use strict";
(function(){
var PCOL=["var(--p1)","var(--p2)","var(--p3)","var(--p4)","var(--p5)","var(--p6)"];
function pcol(i){return PCOL[((i-1)%PCOL.length+PCOL.length)%PCOL.length];}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function S(t,a){var e=document.createElementNS("http://www.w3.org/2000/svg",t);for(var k in a){e.setAttribute(k,a[k]);}return e;}
function esc(s){s=(s==null?"":String(s));return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function fmtClock(ms){ms=Math.max(0,ms||0);var s=Math.round(ms/1000),m=Math.floor(s/60),r=s%60;return m+":"+(r<10?"0":"")+r;}
function fmtDur(ms){if(ms<1000)return Math.round(ms)+" ms";var s=ms/1000;if(s<90)return s.toFixed(1)+" s";var m=s/60;if(m<60)return m.toFixed(1)+" min";return Math.floor(m/60)+"h "+Math.round(m%60)+"m";}
function fmtNum(n){n=Math.round(n||0);var s=String(Math.abs(n)),o="";for(var i=0;i<s.length;i++){if(i>0&&(s.length-i)%3===0)o+=",";o+=s[i];}return (n<0?"-":"")+o;}
function fmtK(n){n=n||0;if(n<1000)return String(Math.round(n));if(n<1e6)return (n<1e4?(n/1e3).toFixed(1):Math.round(n/1e3))+"k";return (n/1e6).toFixed(1)+"M";}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

var emptyEl=document.getElementById("empty"), dashEl=document.getElementById("dash");
var lastRunId=null;

function render(p){
  var D=p.data, run=D.run, live=p.isRunning;
  var nowRel=live?Math.max(0,Date.now()-run.startTime):run.durationMs;
  var WIN=Math.max(1,D.windowMs,nowRel);

  var root=document.createElement("div");

  // header
  var head=el("div","head"); head.appendChild(el("h1",null,run.workflowName));
  var st=(run.status||"").toLowerCase();
  var cls=live?"live":(st.indexOf("err")>=0||st.indexOf("fail")>=0||st.indexOf("abort")>=0?"err":"done");
  var pill=el("span","pill "+cls); pill.appendChild(el("span","dot")); pill.appendChild(el("span",null,live?"running":run.status)); head.appendChild(pill);
  root.appendChild(head);
  var sub=el("div","sub"); sub.textContent=run.runId+"  \xB7  "+(run.defaultModel||"")+"  \xB7  "+(live?"elapsed ":"")+fmtClock(nowRel); root.appendChild(sub);

  // chips
  var done=D.agents.filter(function(a){return a.state==="done";}).length;
  var chips=el("div","chips");
  function chip(v,l,w){var c=el("div","chip"+(w?" warn":""));c.appendChild(el("b",null,v));c.appendChild(el("span",null,l));chips.appendChild(c);}
  chip(done+" / "+D.agents.length,"agents done");
  chip(fmtNum(run.totalToolCalls),"tool calls");
  chip(fmtNum(run.totalTokens),"tokens");
  chip("\xD7"+D.peak+" / "+D.cap,"peak concurrency");
  if(D.retries>0)chip(String(D.retries),"retries",true);
  root.appendChild(chips);

  // gantt
  var gp=el("div","panel"); gp.appendChild(el("h2",null,"Timeline"));
  var rows=D.agents.slice().sort(function(a,b){return a.startRel-b.startRel||a.index-b.index;});
  var ROWH=24,PADT=8,CONCH=40,AXISH=20,W=1000,GH=Math.max(ROWH,rows.length*ROWH),H=PADT+CONCH+GH+AXISH;
  var svg=S("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Live gantt of "+D.agents.length+" agents"});
  var plotL=170,plotR=W-14,plotW=plotR-plotL;
  function xOf(ms){return plotL+(clamp(ms,0,WIN)/WIN)*plotW;}
  var cBot=PADT+CONCH;
  for(var i=0;i<=6;i++){var tx=plotL+(i/6)*plotW;svg.appendChild(S("line",{class:"gridline",x1:tx,y1:PADT,x2:tx,y2:cBot+GH}));var tl=S("text",{class:"axis",x:tx,y:H-5,"text-anchor":i===0?"start":(i===6?"end":"middle")});tl.textContent=fmtClock((i/6)*WIN);svg.appendChild(tl);}
  // concurrency area
  var maxC=Math.max(D.peak,1),pts=[];
  (D.concurrency||[]).forEach(function(v,idx,arr){var x=plotL+(idx/Math.max(1,arr.length-1))*plotW;var y=cBot-(v/maxC)*(CONCH-8);pts.push(x.toFixed(1)+" "+y.toFixed(1));});
  if(pts.length){svg.appendChild(S("path",{class:"concarea",d:"M "+plotL+" "+cBot+" L "+pts.join(" L ")+" L "+plotR+" "+cBot+" Z"}));svg.appendChild(S("path",{class:"conctop",d:"M "+pts.join(" L ")}));}
  var cl=S("text",{class:"axis",x:plotL,y:PADT+10});cl.textContent="concurrency \xB7 peak \xD7"+D.peak;svg.appendChild(cl);
  // barriers
  D.phases.forEach(function(ph){if(ph.barrierAfter){var bx=xOf(ph.endRel);svg.appendChild(S("line",{class:"barrier-line",x1:bx,y1:cBot,x2:bx,y2:cBot+GH}));var t=S("text",{class:"barrier-txt",x:bx+3,y:cBot+11});t.textContent="barrier";svg.appendChild(t);}});
  // bars
  rows.forEach(function(a,r){var y=cBot+r*ROWH+3,h=ROWH-8;
    var lab=S("text",{class:"lane",x:8,y:y+h-2});lab.textContent=a.label.length>24?a.label.slice(0,23)+"\u2026":a.label;svg.appendChild(lab);
    var endRel=(live&&a.state==="running")?nowRel:a.endRel;
    var x1=xOf(a.startRel),x2=Math.max(x1+3,xOf(endRel));
    var attrs={x:x1,y:y,width:(x2-x1),height:h,rx:3,fill:pcol(a.phaseIndex)};
    if(a.state==="queued")attrs["opacity"]="0.35";
    if(a.state==="error")attrs["stroke"]="var(--red)";
    var rect=S("rect",attrs);if(a.state==="running")rect.setAttribute("class","run-bar");svg.appendChild(rect);
  });
  // now line
  if(live){var nx=xOf(nowRel);svg.appendChild(S("line",{class:"nowline",x1:nx,y1:PADT,x2:nx,y2:cBot+GH}));}
  gp.appendChild(svg); root.appendChild(gp);

  // flow
  var fp=el("div","panel"); fp.appendChild(el("h2",null,"Flow \xB7 fan-out \u2192 barrier \u2192 reduce"));
  var flow=el("div","flow");
  var ing=el("div","ingress"); ing.innerHTML="prompt \u2192 <b>script.js</b>"; flow.appendChild(ing);
  D.phases.slice().sort(function(a,b){return a.index-b.index;}).forEach(function(ph){
    var band=el("div","band"); band.style.borderLeftColor=pcol(ph.index);
    var bt=el("div","bt"); bt.innerHTML="Phase "+ph.index+" \xB7 <b>"+esc(ph.title)+"</b>"; band.appendChild(bt);
    var nodes=el("div","nodes");
    D.agents.filter(function(a){return a.phaseIndex===ph.index;}).forEach(function(a){
      var n=el("div","node "+a.state); n.style.borderLeftColor=pcol(ph.index);
      var nl=el("span","nl",a.label);
      var nm=el("div","nm"); var dot=el("span","st"); nm.appendChild(dot);
      nm.appendChild(el("span",null,a.state));
      if(a.durationMs)nm.appendChild(el("span",null,fmtDur(a.durationMs)));
      if(a.tokens)nm.appendChild(el("span",null,fmtK(a.tokens)+" tok"));
      if(a.attempt>1)nm.appendChild(el("span",null,"\xD7"+a.attempt));
      n.appendChild(nl); n.appendChild(nm); nodes.appendChild(n);
    });
    band.appendChild(nodes); flow.appendChild(band);
    if(ph.barrierAfter){var br=el("div","barrier-row");br.textContent="\u2551 barrier \u2014 parallel() waits for all";flow.appendChild(br);}
  });
  var eg=el("div","egress"); eg.innerHTML=live?"<b>\u2026</b> running":("<b>return</b> "+esc(run.resultDesc||"(value)")); flow.appendChild(eg);
  fp.appendChild(flow); root.appendChild(fp);

  // logs
  if(run.logs&&run.logs.length){var lp=el("div","panel");lp.appendChild(el("h2",null,"log()"));var lc=el("div","logs");run.logs.forEach(function(l){lc.appendChild(el("div","lg",l));});lp.appendChild(lc);root.appendChild(lp);}

  dashEl.innerHTML=""; dashEl.appendChild(root); dashEl.hidden=false; emptyEl.hidden=true;
}

function showEmpty(){dashEl.hidden=true;emptyEl.hidden=false;}

var failures=0;
function poll(){
  fetch("/api/run",{cache:"no-store"}).then(function(r){return r.json();}).then(function(p){
    failures=0;
    if(p&&p.ok&&p.data&&p.data.agents){lastRunId=p.runId;render(p);}else{showEmpty();}
  }).catch(function(){failures++;if(failures>3)showEmpty();});
}
poll();
setInterval(poll,1000);
})();
`;

// src/server.ts
var DEFAULT_PORT = 7682;
function activeRunData(opts = {}) {
  const runs = discoverRuns(opts);
  if (runs.length === 0) return { ok: false, reason: "no workflow runs found" };
  let best = runs[0];
  let bestM = -1;
  for (const r of runs.slice(0, 40)) {
    try {
      const m = fs3.statSync(r.sourcePath).mtimeMs;
      if (m > bestM) {
        bestM = m;
        best = r;
      }
    } catch {
    }
  }
  try {
    const run = parseRunFile(best.sourcePath);
    return {
      ok: true,
      data: buildHtmlData(run),
      isRunning: isRunning(run),
      runId: run.runId,
      status: run.status,
      runCount: runs.length
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
function runById(id) {
  const ref = resolveRunRef(id);
  const run = parseRunFile(ref.sourcePath);
  return { ok: true, data: buildHtmlData(run), isRunning: isRunning(run), runId: run.runId, status: run.status };
}
function startServer(opts = {}) {
  const host = opts.host ?? "127.0.0.1";
  const desiredPort = opts.port ?? DEFAULT_PORT;
  const discover = opts.projectSlug ? { projectSlug: opts.projectSlug } : {};
  const server = http.createServer((req, res) => {
    const send = (code, type, body) => {
      res.writeHead(code, {
        "content-type": type,
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      });
      res.end(body);
    };
    let pathname = "/";
    let id = null;
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${desiredPort}`);
      pathname = url.pathname;
      id = url.searchParams.get("id");
    } catch {
    }
    try {
      if (pathname === "/healthz") return send(200, "text/plain", "ok");
      if (pathname === "/api/runs") {
        return send(200, "application/json", JSON.stringify(discoverRuns(discover)));
      }
      if (pathname === "/api/run") {
        const payload = id ? runById(id) : activeRunData(discover);
        return send(200, "application/json", JSON.stringify(payload));
      }
      if (pathname === "/" || pathname === "/index.html") {
        return send(200, "text/html; charset=utf-8", liveDashboardHtml());
      }
      return send(404, "text/plain", "not found");
    } catch (e) {
      return send(200, "application/json", JSON.stringify({ ok: false, reason: e.message }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(desiredPort, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : desiredPort;
      const url = `http://${host}:${port}`;
      if (opts.open) openBrowser(url);
      resolve({
        port,
        url,
        close: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
  }
}

// src/watch.ts
var CLEAR = "\x1B[2J\x1B[3J\x1B[H";
function renderFrame(sourcePath, opts = {}) {
  const run = parseRunFile(sourcePath);
  return { text: renderRun(run, opts), running: isRunning(run) };
}
function watchRun(ref, opts = {}) {
  const out = opts.out ?? process.stdout;
  const interval = Math.max(200, opts.intervalMs ?? 1e3);
  const clear = opts.clear ?? true;
  const p = makePainter(opts.color ?? false);
  let frames = 0;
  let lastGood = "";
  return new Promise((resolve) => {
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      process.off("SIGINT", onSig);
      resolve();
    };
    const onSig = () => stop();
    process.on("SIGINT", onSig);
    const tickOnce = () => {
      if (stopped) return;
      let frame = null;
      try {
        frame = renderFrame(ref.sourcePath, opts);
        lastGood = frame.text;
      } catch (err) {
        if (frames === 0) {
          out.write(p.fg("brightRed", String(err.message)) + "\n");
          stop();
          return;
        }
      }
      if (clear) out.write(CLEAR);
      out.write((frame ? frame.text : lastGood) + "\n");
      const running = frame ? frame.running : true;
      out.write(
        (running ? p.fg("brightCyan", "\u25CF live") + p.dim(` \u2014 polling every ${interval / 1e3}s \xB7 Ctrl-C to stop`) : p.dim("\u25CB run finished")) + "\n"
      );
      frames++;
      if (frame && !frame.running) {
        stop();
        return;
      }
      if (opts.maxFrames && frames >= opts.maxFrames) {
        stop();
        return;
      }
      setTimeout(tickOnce, interval).unref?.();
    };
    tickOnce();
  });
}

// src/cli.ts
var VERSION = "0.1.1";
var VALUE_FLAGS = /* @__PURE__ */ new Set(["out", "o", "limit", "interval", "width", "cap", "project", "port", "host"]);
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (VALUE_FLAGS.has(body) && i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        flags[body] = argv[++i];
      } else {
        flags[body] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      if (key === "o") {
        if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) flags["out"] = argv[++i];
        else flags["out"] = true;
      } else if (key === "h") flags["help"] = true;
      else if (key === "v") flags["version"] = true;
      else flags[key] = true;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}
function resolveColor(flags) {
  if (flags["no-color"]) return false;
  if (flags["color"]) return true;
  return colorEnabled();
}
function termWidth(flags) {
  const w = Number(flags["width"]);
  if (Number.isFinite(w) && w > 0) return w;
  return process.stdout.columns ?? 100;
}
var HELP = `wfviz \u2014 visualize Claude Code dynamic workflows

USAGE
  wfviz <command> [ref] [options]

COMMANDS
  list                 List discovered workflow runs (newest first)
  show   [ref]         Render a run in the terminal               (default: latest)
  watch  [ref]         Live terminal view; refreshes until the run finishes
  live                 Start a live web dashboard (auto-opens in your browser)
  export [ref]         Write a self-contained interactive HTML report
  help                 Show this help

REF
  A run id (e.g. wf_ab12cd34), the literal "latest", or a path to a wf_<id>.json.

OPTIONS
  --here               Only runs from the current directory's project
  --project <slug>     Only runs from a specific project slug
  --limit <n>          Limit number of runs (list)
  --json               Machine-readable output (list)
  -o, --out <file>     Output path (export)
  --open               Open the HTML report after writing (export)
  --port <n>           Port for the live dashboard (default: 7682) (live)
  --host <h>           Host to bind the live dashboard (default: 127.0.0.1)
  --no-open            Do not auto-open the browser (live)
  --cap <n>            Concurrency cap reference to display (default: 16)
  --interval <ms>      Poll interval for watch (default: 1000)
  --width <n>          Terminal width override (show, watch)
  --no-color           Disable ANSI colour
  -v, --version        Print version
  -h, --help           Show this help

EXAMPLES
  wfviz list
  wfviz show latest
  wfviz watch                       # follow the most recent run live
  wfviz live                        # open a live web dashboard; agents light up as they run
  wfviz export latest -o run.html --open

Runs are read from ~/.claude/projects (override with CLAUDE_CONFIG_DIR).
`;
function openFile(file) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", file] : [file];
  try {
    const child = spawn2(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
  }
}
function sanitizeName(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workflow";
}
function cmdList(args) {
  const color = resolveColor(args.flags);
  const p = makePainter(color);
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : typeof args.flags["project"] === "string" ? args.flags["project"] : void 0;
  const limit = Number(args.flags["limit"]);
  const runs = discoverRuns({ projectSlug: slug, limit: Number.isFinite(limit) ? limit : void 0 });
  if (args.flags["json"]) {
    process.stdout.write(JSON.stringify(runs, null, 2) + "\n");
    return 0;
  }
  if (runs.length === 0) {
    process.stdout.write(
      p.dim("No workflow runs found. Run a dynamic workflow in Claude Code first.\n")
    );
    return 0;
  }
  process.stdout.write("\n" + p.dim(`  ${runs.length} run${runs.length === 1 ? "" : "s"}`) + "\n\n");
  for (const r of runs) process.stdout.write("  " + renderRunLine(r, { color }) + "\n");
  process.stdout.write("\n" + p.dim("  wfviz show <id>   \xB7   wfviz export <id> -o report.html") + "\n\n");
  return 0;
}
function cmdShow(args) {
  const color = resolveColor(args.flags);
  const ref = args.positionals[0] ?? "latest";
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : void 0;
  const found = resolveRunRef(ref, { projectSlug: slug });
  const run = parseRunFile(found.sourcePath);
  const cap = Number(args.flags["cap"]);
  process.stdout.write(
    renderRun(run, {
      color,
      width: termWidth(args.flags),
      concurrencyCap: Number.isFinite(cap) ? cap : void 0
    }) + "\n"
  );
  return 0;
}
function cmdExport(args) {
  const ref = args.positionals[0] ?? "latest";
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : void 0;
  const found = resolveRunRef(ref, { projectSlug: slug });
  const run = parseRunFile(found.sourcePath);
  const cap = Number(args.flags["cap"]);
  const html = renderHtml(run, { concurrencyCap: Number.isFinite(cap) ? cap : void 0 });
  const outFlag = args.flags["out"];
  if (outFlag === true) throw new Error("the -o/--out option requires a file path");
  const out = typeof outFlag === "string" ? outFlag : `${sanitizeName(run.workflowName)}-${run.runId}.wfviz.html`;
  const abs = path3.resolve(out);
  try {
    fs4.mkdirSync(path3.dirname(abs), { recursive: true });
    fs4.writeFileSync(abs, html, "utf8");
  } catch (err) {
    const code = err.code;
    const why = code === "EACCES" ? "permission denied" : code === "ENOENT" ? "no such directory" : err.message;
    throw new Error(`cannot write report to ${abs}: ${why}`);
  }
  const p = makePainter(resolveColor(args.flags));
  process.stdout.write(p.fg("brightGreen", "\u2714 ") + "wrote " + p.bold(abs) + p.dim(` (${(html.length / 1024).toFixed(0)} KB)`) + "\n");
  if (args.flags["open"]) openFile(abs);
  return 0;
}
async function cmdWatch(args) {
  const color = resolveColor(args.flags);
  const ref = args.positionals[0] ?? "latest";
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : void 0;
  const found = resolveRunRef(ref, { projectSlug: slug });
  const interval = Number(args.flags["interval"]);
  await watchRun(found, {
    color,
    width: termWidth(args.flags),
    intervalMs: Number.isFinite(interval) ? interval : void 0
  });
  return 0;
}
async function cmdLive(args) {
  const port = Number(args.flags["port"]);
  const open = !args.flags["no-open"];
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : typeof args.flags["project"] === "string" ? args.flags["project"] : void 0;
  const host = typeof args.flags["host"] === "string" ? args.flags["host"] : void 0;
  const srv = await startServer({
    port: Number.isFinite(port) ? port : void 0,
    open,
    projectSlug: slug,
    host
  });
  const p = makePainter(resolveColor(args.flags));
  process.stdout.write(
    p.fg("brightGreen", "\u25CF ") + "live dashboard at " + p.bold(srv.url) + p.dim("   (Ctrl-C to stop)") + "\n"
  );
  return await new Promise((resolve) => {
    const stop = () => {
      srv.close().then(() => resolve(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
async function main(argv) {
  const args = parseArgs(argv);
  if (args.flags["version"]) {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  const cmd = args.positionals.shift() ?? (args.flags["help"] ? "help" : "list");
  if (args.flags["help"] || cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  switch (cmd) {
    case "list":
    case "ls":
      return cmdList(args);
    case "show":
    case "view":
      return cmdShow(args);
    case "export":
    case "html":
      return cmdExport(args);
    case "watch":
    case "follow":
      return cmdWatch(args);
    case "live":
    case "serve":
      return cmdLive(args);
    default:
      process.stderr.write(`Unknown command: ${cmd}

` + HELP);
      return 2;
  }
}
var isMain = (() => {
  try {
    const invoked = process.argv[1] ? path3.resolve(process.argv[1]) : "";
    const self = new URL(import.meta.url).pathname;
    return invoked === self || self.endsWith(invoked);
  } catch {
    return true;
  }
})();
if (isMain) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    const p = makePainter(colorEnabled());
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(p.fg("brightRed", "error: ") + msg + "\n");
    if (process.env.WFVIZ_DEBUG && err instanceof Error && err.stack) {
      process.stderr.write(p.dim(err.stack) + "\n");
    }
    process.exitCode = 1;
  });
}
export {
  main
};
