import test from "node:test";
import assert from "node:assert/strict";
import {
  fmtClock,
  fmtCompact,
  fmtCount,
  fmtDuration,
  ganttTrack,
  gauge,
  makePainter,
  truncate,
} from "../src/format.js";

test("fmtCount groups thousands", () => {
  assert.equal(fmtCount(308221), "308,221");
  assert.equal(fmtCount(0), "0");
  assert.equal(fmtCount(-1234), "-1,234");
});

test("fmtCompact rolls 999,999 over to M (not '1000k')", () => {
  assert.equal(fmtCompact(950), "950");
  assert.equal(fmtCompact(54817), "55k");
  assert.equal(fmtCompact(999999), "1.0M");
  assert.equal(fmtCompact(1_200_000), "1.2M");
});

test("fmtDuration is human and guards bad input", () => {
  assert.equal(fmtDuration(850), "850 ms");
  assert.equal(fmtDuration(76900), "76.9 s");
  assert.equal(fmtDuration(360818), "6.0 min");
  assert.equal(fmtDuration(-5), "0 ms");
  assert.equal(fmtDuration(NaN), "0 ms");
});

test("fmtClock formats m:ss", () => {
  assert.equal(fmtClock(0), "0:00");
  assert.equal(fmtClock(360000), "6:00");
  assert.equal(fmtClock(360818), "6:01"); // rounds to nearest second
  assert.equal(fmtClock(-1), "0:00");
});

test("ganttTrack always marks a non-empty interval and never overflows width", () => {
  const w = 20;
  const a = ganttTrack(0, 100, 100, w);
  assert.equal(a.length, w);
  const mid = ganttTrack(40, 60, 100, w);
  assert.equal(mid.length, w);
  assert.ok(mid.includes("█"));
  // zero total degrades safely
  assert.equal(ganttTrack(0, 0, 0, w).length, w);
});

test("gauge clamps fraction and holds width", () => {
  assert.equal(gauge(0.5, 10).length, 10);
  assert.equal(gauge(2, 10), "██████████");
  assert.equal(gauge(-1, 10), "░░░░░░░░░░");
});

test("truncate adds an ellipsis only when needed", () => {
  assert.equal(truncate("abc", 10), "abc");
  assert.equal(truncate("abcdefgh", 5), "abcd…");
});

test("painter emits ANSI only when enabled", () => {
  assert.equal(makePainter(false).fg("red", "x"), "x");
  assert.ok(makePainter(true).fg("red", "x").includes("\x1b["));
});
