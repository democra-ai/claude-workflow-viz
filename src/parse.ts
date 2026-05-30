/**
 * Parse and normalize a Claude Code workflow run.
 *
 * The on-disk format is a research-preview artifact, so every field is treated
 * as optional and validated. `parseRunFile` throws only when the file is not
 * valid JSON; any structural gaps are filled with sensible defaults so the
 * renderers always receive a complete {@link WorkflowRun}.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  Agent,
  AgentState,
  JournalEvent,
  Phase,
  RawRun,
  WorkflowRun,
} from "./types.js";

export class WorkflowParseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WorkflowParseError";
  }
}

// --- small coercion helpers -------------------------------------------------

const num = (v: unknown, d = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const optNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const optStr = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;

/** Normalize the many possible state spellings into an {@link AgentState}. */
export function mapState(raw: unknown): AgentState {
  const s = str(raw).toLowerCase();
  if (["done", "complete", "completed", "success", "succeeded", "ok"].includes(s)) return "done";
  if (["running", "in_progress", "in-progress", "active", "started", "streaming"].includes(s))
    return "running";
  if (["queued", "pending", "waiting", "scheduled"].includes(s)) return "queued";
  if (["error", "failed", "failure", "rejected", "errored"].includes(s)) return "error";
  if (["skipped", "skip", "cancelled", "canceled", "aborted"].includes(s)) return "skipped";
  return "unknown";
}

interface ParsedAgentSeed {
  raw: Record<string, unknown>;
  index: number;
}

/** Convert the raw run object into a normalized {@link WorkflowRun}. */
export function normalizeRun(raw: RawRun, sourcePath: string): WorkflowRun {
  const runId = str(raw.runId) || path.basename(sourcePath).replace(/\.json$/, "");
  const sessionDir = path.dirname(path.dirname(sourcePath));

  // Collect raw agent + phase progress entries.
  const progress = arr(raw.workflowProgress) as Array<Record<string, unknown>>;
  const agentSeeds: ParsedAgentSeed[] = [];
  const phaseTitleByIndex = new Map<number, string>();
  for (const entry of progress) {
    const type = str(entry.type);
    if (type === "workflow_agent") {
      agentSeeds.push({ raw: entry, index: num(entry.index, agentSeeds.length + 1) });
    } else if (type === "workflow_phase") {
      const pi = num(entry.index, phaseTitleByIndex.size + 1);
      phaseTitleByIndex.set(pi, str(entry.title, `Phase ${pi}`));
    }
  }

  // Determine the run start: explicit field, else the timestamp, else the
  // earliest agent queue/spawn time.
  let earliest = Number.POSITIVE_INFINITY;
  for (const seed of agentSeeds) {
    const q = optNum(seed.raw.queuedAt) ?? optNum(seed.raw.startedAt);
    if (q != null && q < earliest) earliest = q;
  }
  const explicitStart = optNum(raw.startTime);
  const fromTs = raw.timestamp ? Date.parse(str(raw.timestamp)) : NaN;
  const candidate = explicitStart ?? (Number.isFinite(fromTs) ? fromTs : undefined);
  // Agents carry authoritative epoch times. Trust the declared start only when
  // it sits at (or just before) the first agent; a startTime/timestamp that is
  // later than the agents — or implausibly far before them — would otherwise
  // clamp every startRel to 0 or inflate it, so fall back to the earliest agent.
  const SANE_STARTUP_GAP_MS = 5 * 60 * 1000;
  let startTime: number;
  if (Number.isFinite(earliest)) {
    startTime =
      candidate != null && candidate <= earliest && earliest - candidate <= SANE_STARTUP_GAP_MS
        ? candidate
        : earliest;
  } else {
    startTime = candidate ?? 0;
  }

  // Build agents (first pass: absolute times), then derive relative windows.
  let latestEnd = startTime;
  const agents: Agent[] = agentSeeds
    .sort((a, b) => a.index - b.index)
    .map((seed, i) => {
      const e = seed.raw;
      const startedAt = optNum(e.startedAt);
      const queuedAt = optNum(e.queuedAt);
      const lastProgressAt = optNum(e.lastProgressAt);
      let durationMs = num(e.durationMs);
      if (durationMs <= 0 && startedAt != null && lastProgressAt != null) {
        durationMs = Math.max(0, lastProgressAt - startedAt);
      }
      let endedAt: number | undefined;
      if (startedAt != null && durationMs > 0) endedAt = startedAt + durationMs;
      else if (lastProgressAt != null) endedAt = lastProgressAt;
      else endedAt = startedAt;
      if (endedAt != null && endedAt > latestEnd) latestEnd = endedAt;

      const phaseIndex = num(e.phaseIndex, 1);
      const agent: Agent = {
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
        durationMs,
        startRel: startedAt != null ? Math.max(0, startedAt - startTime) : 0,
        endRel:
          endedAt != null
            ? Math.max(0, endedAt - startTime)
            : startedAt != null
              ? Math.max(0, startedAt - startTime)
              : 0,
        attempt: Math.max(1, num(e.attempt, 1)),
        tokens: num(e.tokens),
        toolCalls: num(e.toolCalls),
        lastToolName: optStr(e.lastToolName),
        lastToolSummary: optStr(e.lastToolSummary),
        promptPreview: optStr(e.promptPreview),
        resultPreview: optStr(e.resultPreview),
      };
      if (agent.endRel < agent.startRel) agent.endRel = agent.startRel;
      return agent;
    });

  const durationMs = num(raw.durationMs) || Math.max(0, latestEnd - startTime);

  // Build phases: prefer the declared meta.phases, fall back to phase progress
  // entries, finally synthesize from the agents themselves.
  const rawPhases = arr(raw.phases) as Array<Record<string, unknown>>;
  const phases: Phase[] = [];
  if (rawPhases.length > 0) {
    rawPhases.forEach((p, i) => {
      phases.push(makePhase(i + 1, str(p.title, `Phase ${i + 1}`), optStr(p.detail), agents));
    });
  } else if (phaseTitleByIndex.size > 0) {
    [...phaseTitleByIndex.keys()]
      .sort((a, b) => a - b)
      .forEach((pi) => phases.push(makePhase(pi, phaseTitleByIndex.get(pi)!, undefined, agents)));
  } else {
    const seen = new Map<number, string>();
    for (const a of agents) if (!seen.has(a.phaseIndex)) seen.set(a.phaseIndex, a.phaseTitle);
    [...seen.keys()]
      .sort((a, b) => a - b)
      .forEach((pi) => phases.push(makePhase(pi, seen.get(pi)!, undefined, agents)));
  }
  // Guarantee every agent's phase exists.
  for (const a of agents) {
    if (!phases.some((p) => p.index === a.phaseIndex)) {
      phases.push(makePhase(a.phaseIndex, a.phaseTitle, undefined, agents));
    }
  }
  phases.sort((a, b) => a.index - b.index);

  const logs = arr(raw.logs).filter((l): l is string => typeof l === "string");

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
    result: "result" in raw ? raw.result : undefined,
    sourcePath,
    sessionDir,
  };
}

function makePhase(
  index: number,
  title: string,
  detail: string | undefined,
  agents: Agent[],
): Phase {
  const members = agents.filter((a) => a.phaseIndex === index);
  // Only agents that actually started define the phase window; a phase whose
  // agents are all still queued has no extent yet ([0,0]) rather than being
  // dragged to t=0 (which would break ordering and barrier inference).
  const started = members.filter(
    (a) => a.startedAt != null || a.startRel > 0 || a.endRel > 0,
  );
  const startRel = started.length ? Math.min(...started.map((a) => a.startRel)) : 0;
  const endRel = started.length ? Math.max(...started.map((a) => a.endRel)) : 0;
  return {
    index,
    title,
    detail,
    agentIndexes: members.map((a) => a.index),
    startRel,
    endRel,
  };
}

/** Read and normalize a `wf_<id>.json` file. Throws {@link WorkflowParseError}. */
export function parseRunFile(file: string): WorkflowRun {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new WorkflowParseError(`Cannot read run file: ${file}`, err);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new WorkflowParseError(`Run file is not valid JSON: ${file}`, err);
  }
  if (raw == null || typeof raw !== "object") {
    throw new WorkflowParseError(`Run file does not contain a JSON object: ${file}`);
  }
  return normalizeRun(raw as RawRun, file);
}

/** Read a run's `journal.jsonl` (best effort). Returns [] when absent/unreadable. */
export function loadJournal(journalFile: string): JournalEvent[] {
  let text: string;
  try {
    text = fs.readFileSync(journalFile, "utf8");
  } catch {
    return [];
  }
  const events: JournalEvent[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj === "object") events.push(obj as JournalEvent);
    } catch {
      // skip malformed line
    }
  }
  return events;
}
