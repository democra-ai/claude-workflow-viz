import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseRunFile, normalizeRun, mapState, WorkflowParseError } from "../src/parse.js";
import type { RawRun } from "../src/types.js";

const fixture = (name: string): string =>
  path.join(process.cwd(), "test", "fixtures", name);

test("parses the research run faithfully", () => {
  const r = parseRunFile(fixture("research-run.json"));
  assert.equal(r.runId, "wf_c7a66bf4-7c6");
  assert.equal(r.workflowName, "research-claude-dynamic-workflows");
  assert.equal(r.status, "completed");
  assert.equal(r.phases.length, 2);
  assert.equal(r.agents.length, 6);
  assert.equal(r.agentCount, 6);
  assert.equal(r.totalTokens, 308221);
  assert.equal(r.totalToolCalls, 85);
  assert.ok(r.durationMs > 0);
  assert.equal(r.endTime, r.startTime + r.durationMs);
});

test("research run: phase membership and agent fields", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const phase1 = r.phases.find((p) => p.index === 1)!;
  const phase2 = r.phases.find((p) => p.index === 2)!;
  assert.equal(phase1.title, "Search");
  assert.equal(phase1.agentIndexes.length, 5);
  assert.equal(phase2.title, "Synthesize");
  assert.equal(phase2.agentIndexes.length, 1);

  const a = r.agents.find((x) => x.label === "search:official-docs")!;
  assert.equal(a.state, "done");
  assert.equal(a.phaseIndex, 1);
  assert.ok(a.durationMs > 0);
  assert.ok(a.tokens > 0);
  assert.ok(a.toolCalls > 0);
  assert.ok(a.startRel >= 0 && a.endRel >= a.startRel);

  const synth = r.agents.find((x) => x.label === "synthesize")!;
  assert.equal(synth.phaseIndex, 2);
  // synthesize starts only after the search phase (barrier).
  assert.ok(synth.startRel >= phase1.endRel);
});

test("parses the viz run with three phases", () => {
  const r = parseRunFile(fixture("viz-run.json"));
  assert.equal(r.workflowName, "visualize-dynamic-workflow");
  assert.equal(r.phases.length, 3);
  assert.equal(r.agents.length, 6);
  assert.deepEqual(
    r.phases.map((p) => p.title),
    ["Concepts", "Pick", "Build"],
  );
});

test("in-progress run: state mapping, computed totals and durations", () => {
  const r = parseRunFile(fixture("running-run.json"));
  assert.equal(r.status, "running");
  const states = r.agents.map((a) => a.state);
  assert.ok(states.includes("done"));
  assert.ok(states.includes("running"));
  assert.ok(states.includes("queued"));

  // agentCount / totals were absent → computed from agents.
  assert.equal(r.agentCount, 4);
  assert.equal(r.totalTokens, 16000);
  assert.equal(r.totalToolCalls, 11);

  // run duration absent → derived from latest agent end (running agent's lastProgressAt).
  assert.equal(r.durationMs, 9000);

  // running agent has no durationMs → computed from startedAt..lastProgressAt.
  const running = r.agents.find((a) => a.state === "running")!;
  assert.equal(running.durationMs, 8800);

  // queued agent never started → startRel 0.
  const queued = r.agents.find((a) => a.state === "queued")!;
  assert.equal(queued.startRel, 0);
});

test("throws WorkflowParseError on invalid JSON", () => {
  assert.throws(() => parseRunFile(fixture("malformed.json")), WorkflowParseError);
});

test("normalizeRun synthesizes phases from agents when none are declared", () => {
  const raw: RawRun = {
    runId: "wf_x",
    workflowProgress: [
      { type: "workflow_agent", index: 1, label: "a", phaseIndex: 1, phaseTitle: "Alpha", startedAt: 100, durationMs: 50 },
      { type: "workflow_agent", index: 2, label: "b", phaseIndex: 2, phaseTitle: "Beta", startedAt: 200, durationMs: 50 },
    ],
    startTime: 0,
  };
  const r = normalizeRun(raw, "/tmp/wf_x.json");
  assert.equal(r.phases.length, 2);
  assert.equal(r.phases[0]!.title, "Alpha");
  assert.equal(r.phases[1]!.title, "Beta");
});

test("mapState normalizes many spellings", () => {
  assert.equal(mapState("completed"), "done");
  assert.equal(mapState("DONE"), "done");
  assert.equal(mapState("in_progress"), "running");
  assert.equal(mapState("pending"), "queued");
  assert.equal(mapState("failed"), "error");
  assert.equal(mapState("skipped"), "skipped");
  assert.equal(mapState("nonsense"), "unknown");
  assert.equal(mapState(undefined), "unknown");
});

test("start time reconciles a disagreeing timestamp with agent epoch times", () => {
  // The record timestamp is months before the agents; relative windows must
  // still be correct (not inflated by the offset).
  const raw: RawRun = {
    runId: "w",
    status: "completed",
    timestamp: "2026-01-01T00:00:00.000Z",
    workflowProgress: [
      { type: "workflow_agent", index: 1, label: "a", startedAt: 1780000000100, durationMs: 5000, state: "done" },
    ],
  };
  const r = normalizeRun(raw, "/x/y/workflows/w.json");
  const a = r.agents[0]!;
  assert.ok(a.startRel >= 0 && a.startRel < 1000, `startRel should be ~0, got ${a.startRel}`);
  assert.equal(a.endRel - a.startRel, 5000);
  assert.equal(r.durationMs, 5000);
});

test("duplicate/zero source indexes are renumbered to unique spawn order", () => {
  const raw: RawRun = {
    runId: "d",
    status: "done",
    workflowProgress: [
      { type: "workflow_agent", index: 0, label: "a", phaseIndex: 1, startedAt: 1000, durationMs: 1000, state: "done" },
      { type: "workflow_agent", index: 0, label: "b", phaseIndex: 1, startedAt: 2000, durationMs: 1000, state: "done" },
    ],
  };
  const r = normalizeRun(raw, "/x/y/workflows/d.json");
  assert.deepEqual(r.agents.map((a) => a.index), [1, 2]);
  assert.deepEqual(r.phases[0]!.agentIndexes, [1, 2]);
});
