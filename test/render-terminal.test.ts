import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseRunFile } from "../src/parse.js";
import { renderRun, renderRunLine } from "../src/render-terminal.js";

const fixture = (name: string): string =>
  path.join(process.cwd(), "test", "fixtures", name);

const ESC = "\x1b[";

test("renders key content with colour off and no ANSI", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const out = renderRun(r, { color: false, width: 100 });
  assert.match(out, /research-claude-dynamic-workflows/);
  assert.match(out, /Search/);
  assert.match(out, /Synthesize/);
  assert.ok(out.includes("search:official-docs"));
  assert.ok(out.includes("synthesize"));
  assert.match(out, /tokens/);
  assert.match(out, /barrier/);
  assert.match(out, /timeline/);
  assert.ok(!out.includes(ESC), "no ANSI escape codes when colour disabled");
});

test("emits ANSI when colour enabled", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const out = renderRun(r, { color: true, width: 100 });
  assert.ok(out.includes(ESC));
});

test("renders an in-progress run without throwing", () => {
  const r = parseRunFile(fixture("running-run.json"));
  const out = renderRun(r, { color: false, width: 90, now: 1780000010000 });
  assert.ok(out.length > 0);
  assert.match(out, /map-reduce-demo/);
  assert.match(out, /running/);
});

test("adapts to narrow widths", () => {
  const r = parseRunFile(fixture("viz-run.json"));
  const out = renderRun(r, { color: false, width: 56 });
  const longest = Math.max(...out.split("\n").map((l) => l.length));
  // allow a little slack for the box but stay roughly within bounds
  assert.ok(longest <= 120, `lines unexpectedly wide: ${longest}`);
});

test("renderRunLine summarizes a run on one line", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const line = renderRunLine(r, { color: false });
  assert.ok(!line.includes("\n"));
  assert.match(line, /research-claude/);
  assert.match(line, /completed/);
  assert.match(line, /wf_c7a66bf4-7c6/);
});

test("a stale running run keeps a bounded axis and marks queued phases", () => {
  const r = parseRunFile(fixture("running-run.json"));
  // View it 10 days after its (stale) start — the live window must not balloon.
  const out = renderRun(r, { color: false, width: 90, now: r.startTime + 10 * 24 * 3600 * 1000 });
  assert.ok(!/\d{3,}:\d\d/.test(out), "axis must not blow up to hundreds of minutes");
  assert.match(out, /queued/); // the not-yet-started Reduce phase
});
