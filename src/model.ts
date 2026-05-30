/**
 * Derived metrics over a normalized {@link WorkflowRun}: concurrency,
 * parallel-lane packing, and the barrier inference that powers the
 * fan-out -> barrier -> reduce visualization.
 */

import { TERMINAL_STATUSES, type Agent, type WorkflowRun } from "./types.js";

/** Is the run still in progress (i.e. its status is not a terminal one)? */
export function isRunning(run: WorkflowRun): boolean {
  return !TERMINAL_STATUSES.has(run.status.toLowerCase());
}

interface Interval {
  start: number;
  end: number;
}

/** Treat a zero-length agent as occupying 1ms so it is still "concurrent". */
function intervalsOf(agents: Agent[]): Interval[] {
  return agents
    .filter((a) => a.startedAt != null || a.startRel > 0 || a.endRel > 0)
    .map((a) => ({ start: a.startRel, end: Math.max(a.endRel, a.startRel + 1) }));
}

/** Maximum number of agents that were ever in flight at the same instant. */
export function peakConcurrency(run: WorkflowRun): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of intervalsOf(run.agents)) {
    events.push({ t: iv.start, delta: 1 });
    events.push({ t: iv.end, delta: -1 });
  }
  // At equal timestamps, process ends (-1) before starts (+1) so a clean
  // hand-off (A ends exactly as B starts) is not counted as overlap.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}

/** In-flight agent count at a given time (ms from run start). */
export function concurrencyAt(run: WorkflowRun, tRel: number): number {
  let n = 0;
  for (const iv of intervalsOf(run.agents)) {
    if (iv.start <= tRel && tRel < iv.end) n++;
  }
  return n;
}

/** Evenly sample concurrency across the run for sparklines/gutters. */
export function concurrencySeries(run: WorkflowRun, samples: number): number[] {
  const total = Math.max(1, run.durationMs);
  const out: number[] = [];
  const n = Math.max(1, samples);
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) * total;
    out.push(concurrencyAt(run, t));
  }
  return out;
}

/**
 * Does a barrier separate this phase from the next one? True when the next
 * phase only began after this phase had fully finished — the signature of a
 * `parallel()`/`pipeline()` join where the reduce step waits for all inputs.
 */
export function phaseBarrierAfter(run: WorkflowRun, phaseIndex: number): boolean {
  const ordered = [...run.phases].sort((a, b) => a.index - b.index);
  const pos = ordered.findIndex((p) => p.index === phaseIndex);
  if (pos < 0 || pos + 1 >= ordered.length) return false;
  const cur = ordered[pos]!;
  const next = ordered[pos + 1]!;
  if (cur.agentIndexes.length === 0 || next.agentIndexes.length === 0) return false;
  return next.startRel >= cur.endRel;
}

/**
 * Greedily pack agents into horizontal lanes so overlapping (concurrent)
 * agents land in different lanes. Returns the lane index per agent (keyed by
 * `Agent.index`) and the total lane count — i.e. the visual fan-out width.
 */
export function packLanes(agents: Agent[]): { laneOf: Map<number, number>; laneCount: number } {
  const sorted = [...agents].sort((a, b) => a.startRel - b.startRel || a.index - b.index);
  const laneEnds: number[] = [];
  const laneOf = new Map<number, number>();
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

/** Total retries across the run (attempt counts above the first). */
export function totalRetries(run: WorkflowRun): number {
  return run.agents.reduce((s, a) => s + Math.max(0, a.attempt - 1), 0);
}

/** Shorten a model id for display: "claude-opus-4-8[1m]" -> "opus-4-8". */
export function shortModel(model: string | undefined): string {
  if (!model) return "";
  let m = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  m = m.replace(/\[[^\]]*\]/g, "");
  m = m.replace(/^claude-/, "");
  return m.trim();
}

/** Distinct models used across the run, in first-seen order. */
export function modelsUsed(run: WorkflowRun): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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

/** Count of agents by state. */
export function stateCounts(run: WorkflowRun): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of run.agents) counts[a.state] = (counts[a.state] ?? 0) + 1;
  return counts;
}
