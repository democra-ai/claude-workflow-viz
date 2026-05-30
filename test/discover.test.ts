import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverRuns,
  encodeProjectSlug,
  refFromFile,
  resolveRunRef,
  RunNotFoundError,
} from "../src/discover.js";

const fixture = (name: string): string =>
  path.join(process.cwd(), "test", "fixtures", name);

test("encodeProjectSlug matches Claude Code's folder naming", () => {
  assert.equal(encodeProjectSlug("/Users/jane/democra-ai"), "-Users-jane-democra-ai");
  assert.equal(encodeProjectSlug("/Users/a.b/proj.x"), "-Users-a-b-proj-x");
  assert.equal(encodeProjectSlug("C:\\Users\\jane\\proj"), "C--Users-jane-proj");
});

test("refFromFile reads a run descriptor", () => {
  const ref = refFromFile(fixture("research-run.json"), "-slug");
  assert.ok(ref);
  assert.equal(ref!.runId, "wf_c7a66bf4-7c6");
  assert.equal(ref!.agentCount, 6);
  assert.equal(ref!.projectSlug, "-slug");
});

function makeProjects(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wfviz-"));
  const dir = path.join(tmp, "-Users-x-demo", "session-1", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(fixture("research-run.json"), path.join(dir, "wf_c7a66bf4-7c6.json"));
  fs.copyFileSync(fixture("viz-run.json"), path.join(dir, "wf_75e4612c-718.json"));
  return tmp;
}

test("discoverRuns finds runs newest-first under a projects dir", () => {
  const tmp = makeProjects();
  try {
    const runs = discoverRuns({ projectsDir: tmp });
    assert.equal(runs.length, 2);
    // viz run started later than the research run.
    assert.equal(runs[0]!.runId, "wf_75e4612c-718");
    assert.equal(runs[1]!.runId, "wf_c7a66bf4-7c6");
    assert.equal(discoverRuns({ projectsDir: tmp, limit: 1 }).length, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveRunRef resolves latest, by id, and by path", () => {
  const tmp = makeProjects();
  try {
    assert.equal(resolveRunRef("latest", { projectsDir: tmp }).runId, "wf_75e4612c-718");
    assert.equal(
      resolveRunRef("wf_c7a66bf4-7c6", { projectsDir: tmp }).runId,
      "wf_c7a66bf4-7c6",
    );
    // direct path bypasses discovery
    assert.equal(resolveRunRef(fixture("research-run.json")).runId, "wf_c7a66bf4-7c6");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveRunRef throws when nothing matches", () => {
  const tmp = makeProjects();
  try {
    assert.throws(() => resolveRunRef("wf_nope", { projectsDir: tmp }), RunNotFoundError);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "wfviz-empty-"));
  try {
    assert.throws(() => resolveRunRef("latest", { projectsDir: empty }), RunNotFoundError);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
