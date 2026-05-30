/**
 * Terminal formatting helpers: ANSI colour, human-readable durations/counts,
 * and the primitives used to draw gantt bars and gauges. No dependencies.
 */

import type { AgentState } from "./types.js";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    brightRed: "\x1b[91m",
    brightGreen: "\x1b[92m",
    brightYellow: "\x1b[93m",
    brightBlue: "\x1b[94m",
    brightMagenta: "\x1b[95m",
    brightCyan: "\x1b[96m",
  },
} as const;

export type FgColor = keyof typeof ANSI.fg;

/** Decide whether colour should be emitted, honouring NO_COLOR / FORCE_COLOR / TTY. */
export function colorEnabled(force?: boolean): boolean {
  if (force === true) return true;
  if (force === false) return false;
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR != null && process.env.FORCE_COLOR !== "") return true;
  return Boolean(process.stdout && process.stdout.isTTY);
}

/** A small colouring toolkit bound to an enabled flag. */
export interface Painter {
  enabled: boolean;
  fg(color: FgColor, s: string): string;
  bold(s: string): string;
  dim(s: string): string;
  italic(s: string): string;
}

export function makePainter(enabled: boolean): Painter {
  const wrap = (codes: string, s: string) => (enabled ? codes + s + ANSI.reset : s);
  return {
    enabled,
    fg: (color, s) => wrap(ANSI.fg[color], s),
    bold: (s) => wrap(ANSI.bold, s),
    dim: (s) => wrap(ANSI.dim, s),
    italic: (s) => wrap(ANSI.italic, s),
  };
}

// --- numbers & time ---------------------------------------------------------

/** Group thousands: 308221 -> "308,221". */
export function fmtCount(n: number): string {
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

/** Compact magnitude: 308221 -> "308k", 1_200_000 -> "1.2M". */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  // Cut over to "M" at 999_500 so rounding can't yield the awkward "1000k".
  if (abs < 999_500) {
    const v = n / 1000;
    return (abs < 10_000 ? v.toFixed(1) : Math.round(v).toString()) + "k";
  }
  const v = n / 1_000_000;
  return (abs < 10_000_000 ? v.toFixed(1) : Math.round(v).toString()) + "M";
}

/** Human duration: 360818 -> "6.0 min", 850 -> "850 ms", 3_700_000 -> "1h 2m". */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 90) return `${s.toFixed(1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return `${h}h ${rem}m`;
}

/** Clock for a timeline axis: 0 -> "0:00", 360818 -> "6:00". */
export function fmtClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "3m ago", "just now", "May 30" — relative to `now` (epoch ms). */
export function fmtRelativeTime(epochMs: number, now: number = Date.now()): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "unknown";
  const diff = now - epochMs;
  if (diff < 0) return "in the future";
  const sec = diff / 1000;
  if (sec < 45) return "just now";
  const min = sec / 60;
  if (min < 60) return `${Math.round(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)}h ago`;
  const days = hr / 24;
  if (days < 7) return `${Math.round(days)}d ago`;
  try {
    return new Date(epochMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return `${Math.round(days)}d ago`;
  }
}

// --- text -------------------------------------------------------------------

/** Truncate to `width` columns with an ellipsis. Operates on raw (uncoloured) text. */
export function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  if (s.length <= width) return s;
  if (width === 1) return "…";
  return s.slice(0, width - 1) + "…";
}

/** Pad raw text to `width` (right pad, space) without truncating shorter strings. */
export function padEnd(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

export function padStart(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

// --- bars -------------------------------------------------------------------

/** A horizontal gauge: `gauge(0.5, 10)` -> "█████░░░░░". */
export function gauge(frac: number, width: number, fill = "█", empty = "░"): string {
  if (width <= 0) return "";
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  const n = Math.round(f * width);
  return fill.repeat(n) + empty.repeat(Math.max(0, width - n));
}

/**
 * Render one gantt row: a `width`-column track where the interval
 * [startRel, endRel] over the window [0, total] is filled.
 * Guarantees a visible mark (>=1 cell) for any non-empty interval that
 * falls within the window.
 */
export function ganttTrack(
  startRel: number,
  endRel: number,
  total: number,
  width: number,
  fill = "█",
  empty = "·",
): string {
  if (width <= 0) return "";
  if (total <= 0) return fill + empty.repeat(Math.max(0, width - 1));
  const clampStart = Math.max(0, Math.min(startRel, total));
  const clampEnd = Math.max(clampStart, Math.min(endRel, total));
  let a = Math.floor((clampStart / total) * width);
  let b = Math.ceil((clampEnd / total) * width);
  a = Math.max(0, Math.min(a, width - 1));
  b = Math.max(a + 1, Math.min(b, width));
  return empty.repeat(a) + fill.repeat(b - a) + empty.repeat(width - b);
}

// --- agent state glyphs -----------------------------------------------------

export function stateGlyph(state: AgentState): string {
  switch (state) {
    case "done":
      return "✔";
    case "running":
      return "▶";
    case "queued":
      return "·";
    case "error":
      return "✘";
    case "skipped":
      return "⤬";
    default:
      return "?";
  }
}

export function stateColor(state: AgentState): FgColor {
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

/** A stable colour per phase index, cycling through a pleasant palette. */
export function phaseColor(phaseIndex: number): FgColor {
  const palette: FgColor[] = [
    "brightBlue",
    "brightYellow",
    "brightGreen",
    "brightMagenta",
    "brightCyan",
    "red",
  ];
  const i = ((phaseIndex - 1) % palette.length + palette.length) % palette.length;
  return palette[i] ?? "white";
}
