import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseRunFile } from "../src/parse.js";
import {
  concurrencyAt,
  isRunning,
  modelsUsed,
  packLanes,
  peakConcurrency,
  phaseBarrierAfter,
  shortModel,
  stateCounts,
  totalRetries,
} from "../src/model.js";

const fixture = (name: string): string =>
  path.join(process.cwd(), "test", "fixtures", name);

test("peak concurrency = 5 for the 5-way parallel search", () => {
  const r = parseRunFile(fixture("research-run.json"));
  assert.equal(peakConcurrency(r), 5);
});

test("peak concurrency = 4 for the 4-way concept fan-out", () => {
  const r = parseRunFile(fixture("viz-run.json"));
  assert.equal(peakConcurrency(r), 4);
});

test("barrier sits between Search and Synthesize", () => {
  const r = parseRunFile(fixture("research-run.json"));
  assert.equal(phaseBarrierAfter(r, 1), true);
  assert.equal(phaseBarrierAfter(r, 2), false);
});

test("lane packing recovers the fan-out width", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const phase1 = r.agents.filter((a) => a.phaseIndex === 1);
  assert.equal(packLanes(phase1).laneCount, 5);
  const phase2 = r.agents.filter((a) => a.phaseIndex === 2);
  assert.equal(packLanes(phase2).laneCount, 1);
});

test("retries counted from attempt numbers", () => {
  const research = parseRunFile(fixture("research-run.json"));
  assert.equal(totalRetries(research), 0);
  const running = parseRunFile(fixture("running-run.json"));
  assert.equal(totalRetries(running), 1); // map:input-b is on attempt 2
});

test("shortModel strips prefix and bracket suffix", () => {
  assert.equal(shortModel("claude-opus-4-8[1m]"), "opus-4-8");
  assert.equal(shortModel("claude-sonnet-4-6"), "sonnet-4-6");
  assert.equal(shortModel(undefined), "");
});

test("modelsUsed lists distinct models", () => {
  const r = parseRunFile(fixture("research-run.json"));
  assert.deepEqual(modelsUsed(r), ["opus-4-8"]);
});

test("isRunning reflects status", () => {
  assert.equal(isRunning(parseRunFile(fixture("research-run.json"))), false);
  assert.equal(isRunning(parseRunFile(fixture("running-run.json"))), true);
});

test("concurrency is highest mid-run and zero past the end", () => {
  const r = parseRunFile(fixture("research-run.json"));
  assert.equal(concurrencyAt(r, r.durationMs + 10_000), 0);
  assert.ok(concurrencyAt(r, Math.floor(r.durationMs / 4)) >= 1);
});

test("stateCounts tallies agent states", () => {
  const r = parseRunFile(fixture("running-run.json"));
  const counts = stateCounts(r);
  assert.equal(counts.done, 1);
  assert.equal(counts.running, 1);
  assert.equal(counts.queued, 2);
});
