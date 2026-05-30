/**
 * Render a {@link WorkflowRun} as a colour terminal visualization:
 * a header, telemetry chips, log lines, a per-phase gantt with barrier
 * markers, per-agent rows, a time axis, and a result footer.
 */

import {
  fmtClock,
  fmtCompact,
  fmtCount,
  fmtDuration,
  fmtRelativeTime,
  makePainter,
  padEnd,
  padStart,
  phaseColor,
  stateColor,
  stateGlyph,
  truncate,
  type Painter,
} from "./format.js";
import {
  isRunning,
  modelsUsed,
  packLanes,
  peakConcurrency,
  phaseBarrierAfter,
  shortModel,
  stateCounts,
  totalRetries,
} from "./model.js";
import type { Agent, WorkflowRun } from "./types.js";

export interface TerminalOptions {
  color?: boolean;
  width?: number;
  /** Concurrency cap to show as a reference (Claude Code's default is 16). */
  concurrencyCap?: number;
  now?: number;
}

const CONCURRENCY_CAP_DEFAULT = 16;

function statusGlyph(run: WorkflowRun): { glyph: string; color: Parameters<Painter["fg"]>[0] } {
  const s = run.status.toLowerCase();
  if (["completed", "complete", "done"].includes(s)) return { glyph: "✔", color: "brightGreen" };
  if (["failed", "error", "aborted"].includes(s)) return { glyph: "✘", color: "brightRed" };
  if (isRunning(run)) return { glyph: "▶", color: "brightCyan" };
  return { glyph: "•", color: "white" };
}

function gcells(startRel: number, endRel: number, total: number, width: number): [number, number] {
  if (total <= 0) return [0, Math.min(width, 1)];
  let a = Math.floor((Math.max(0, startRel) / total) * width);
  let b = Math.ceil((Math.min(endRel, total) / total) * width);
  a = Math.max(0, Math.min(a, width - 1));
  b = Math.max(a + 1, Math.min(b, width));
  return [a, b];
}

function bar(p: Painter, startRel: number, endRel: number, total: number, width: number, color: Parameters<Painter["fg"]>[0]): string {
  const [a, b] = gcells(startRel, endRel, total, width);
  return (
    p.dim("·".repeat(a)) +
    p.fg(color, "█".repeat(b - a)) +
    p.dim("·".repeat(Math.max(0, width - b)))
  );
}

function describeResult(result: unknown): string | undefined {
  if (result == null) return undefined;
  if (typeof result === "string") return `"${truncate(result.replace(/\s+/g, " "), 56)}"`;
  if (Array.isArray(result)) return `[ ${result.length} item${result.length === 1 ? "" : "s"} ]`;
  if (typeof result === "object") {
    const keys = Object.keys(result as Record<string, unknown>);
    const shown = keys.slice(0, 6).join(", ");
    return `{ ${shown}${keys.length > 6 ? ", …" : ""} }`;
  }
  return String(result);
}

export function renderRun(run: WorkflowRun, opts: TerminalOptions = {}): string {
  const p = makePainter(opts.color ?? false);
  const width = Math.max(56, Math.min(opts.width ?? 100, 140));
  const cap = opts.concurrencyCap ?? CONCURRENCY_CAP_DEFAULT;
  const now = opts.now ?? Date.now();
  const lines: string[] = [];

  // --- window for gantt math ---
  const maxEnd = run.agents.reduce((m, a) => Math.max(m, a.endRel), 0);
  const baseWindow = Math.max(1, run.durationMs, maxEnd);
  const nowRel = Math.max(0, now - run.startTime);
  // For a live run, extend the axis a little toward "now" so in-flight agents
  // have room — but never let a stale/abandoned run's wall-clock gap blow the
  // scale up to hours (which would collapse every real bar into one cell).
  const windowMs =
    isRunning(run) && nowRel > baseWindow
      ? Math.min(nowRel, Math.round(baseWindow * 1.5))
      : baseWindow;

  // --- column layout (budgeted so rows never exceed `width`) ---
  const narrow = width < 84;
  const indent = "  ";
  const ROW_PREFIX = 6; // indent(2) + "  "(2) + glyph(1) + space(1)
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

  // --- header ---
  const sg = statusGlyph(run);
  lines.push("");
  lines.push(indent + p.bold(run.workflowName));
  const models = modelsUsed(run);
  const metaBits = [
    p.fg(sg.color, `${sg.glyph} ${run.status}`),
    p.dim(run.runId),
    run.startTime ? p.dim(fmtRelativeTime(run.startTime, now)) : "",
    models.length ? p.dim(models.join(", ")) : "",
  ].filter(Boolean);
  lines.push(indent + metaBits.join(p.dim("  ·  ")));
  lines.push("");

  // --- telemetry chips ---
  const peak = peakConcurrency(run);
  const retries = totalRetries(run);
  const counts = stateCounts(run);
  const chips: string[] = [
    `${p.bold(String(run.agentCount))} agents`,
    `${p.bold(fmtCount(run.totalToolCalls))} tool calls`,
    `${p.bold(fmtCount(run.totalTokens))} tokens`,
    `${p.bold(fmtDuration(run.durationMs))}`,
    `peak ${p.bold("×" + peak)}${p.dim("/" + cap)}`,
  ];
  if (retries > 0) chips.push(p.fg("yellow", `${retries} retr${retries === 1 ? "y" : "ies"}`));
  if (counts.error) chips.push(p.fg("brightRed", `${counts.error} failed`));
  lines.push(indent + chips.join(p.dim("   ")));

  // --- log lines ---
  if (run.logs.length) {
    lines.push("");
    for (const log of run.logs.slice(0, 6)) {
      lines.push(indent + p.dim("▸ ") + p.italic(p.dim(truncate(log.replace(/\s+/g, " "), width - 6))));
    }
  }

  // --- phases + agents ---
  const orderedPhases = [...run.phases].sort((a, b) => a.index - b.index);
  for (const phase of orderedPhases) {
    lines.push("");
    const members = run.agents
      .filter((a) => a.phaseIndex === phase.index)
      .sort((a, b) => a.startRel - b.startRel || a.index - b.index);
    const { laneCount } = packLanes(members);
    const phaseStarted = members.some(
      (a) => a.startedAt != null || a.startRel > 0 || a.endRel > 0,
    );
    const phaseRunning = members.some((a) => a.state === "running");
    const phaseEnd = phaseRunning ? windowMs : phase.endRel;
    const phaseLabel = `Phase ${phase.index} · ${phase.title}`;
    const phaseBar = phaseStarted
      ? bar(p, phase.startRel, phaseEnd, windowMs, ganttW, phaseColor(phase.index))
      : p.dim("·".repeat(ganttW));
    const fanout = !narrow && laneCount > 1 ? p.dim(`  ⑃ ${laneCount}-wide`) : "";
    lines.push(
      indent +
        p.bold(p.fg(phaseColor(phase.index), padEnd(truncate(phaseLabel, labelW + 4), labelW + 4))) +
        " " +
        phaseBar +
        " " +
        p.dim(phaseStarted ? fmtDuration(Math.max(0, phaseEnd - phase.startRel)) : "queued") +
        fanout,
    );

    for (const a of members) {
      const glyph = p.fg(stateColor(a.state), stateGlyph(a.state));
      const label = padEnd(truncate(a.label, labelW), labelW);
      const startedA = a.startedAt != null || a.startRel > 0 || a.endRel > 0;
      const aEnd = a.state === "running" ? windowMs : a.endRel;
      const abar = startedA
        ? bar(p, a.startRel, aEnd, windowMs, ganttW, phaseColor(a.phaseIndex))
        : p.dim("·".repeat(ganttW));
      const stats: string[] = [padStart(fmtDuration(a.durationMs), 7)];
      if (!narrow && a.tokens) stats.push(p.dim(`${fmtCompact(a.tokens)} tok`));
      if (!narrow && a.toolCalls) stats.push(p.dim(`${a.toolCalls}t`));
      if (a.attempt > 1) stats.push(p.fg("yellow", `×${a.attempt}`));
      lines.push(indent + "  " + glyph + " " + label + " " + abar + " " + stats.join(p.dim(" · ")));
    }

    if (phaseBarrierAfter(run, phase.index)) {
      const barrierTxt = p.fg(
        "yellow",
        narrow ? "║ barrier ║" : "║ barrier — next phase waits for all ║",
      );
      lines.push(indent + padEnd("", labelW + 5) + barrierTxt);
    }
  }

  // --- time axis ---
  lines.push("");
  const axisPad = labelW + 5;
  const axisInner = Math.max(2, ganttW - 2);
  const axis = p.dim("├" + "─".repeat(axisInner) + "┤");
  const left = fmtClock(0);
  const right = fmtClock(windowMs);
  lines.push(
    indent +
      p.dim(padEnd("timeline", axisPad)) +
      p.dim(left) +
      " " +
      axis +
      " " +
      p.dim(right),
  );

  // --- footer: result ---
  const desc = describeResult(run.result);
  if (desc) {
    lines.push("");
    lines.push(indent + p.fg("brightGreen", "→ ") + p.dim("returns ") + desc);
  }
  if (run.summary) {
    lines.push(indent + p.dim(truncate(run.summary.replace(/\s+/g, " "), width - 4)));
  }
  lines.push("");

  return lines.join("\n");
}

/** One-line summary used by `list`. */
export function renderRunLine(
  run: { runId: string; workflowName: string; status: string; startTime: number; durationMs: number; agentCount: number },
  opts: TerminalOptions = {},
): string {
  const p = makePainter(opts.color ?? false);
  const now = opts.now ?? Date.now();
  const s = run.status.toLowerCase();
  const color = ["completed", "complete", "done"].includes(s)
    ? "brightGreen"
    : ["failed", "error", "aborted"].includes(s)
      ? "brightRed"
      : "brightCyan";
  return [
    p.fg(color, padEnd(run.status, 10)),
    p.bold(padEnd(truncate(run.workflowName, 38), 38)),
    p.dim(padEnd(run.runId, 18)),
    padStart(`${run.agentCount} agents`, 10),
    padStart(fmtDuration(run.durationMs), 9),
    p.dim(run.startTime ? fmtRelativeTime(run.startTime, now) : ""),
  ].join("  ");
}
