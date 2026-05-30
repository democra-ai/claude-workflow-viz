import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { activeRunData } from "../src/server.js";

const fixture = (name: string): string =>
  path.join(process.cwd(), "test", "fixtures", name);

function makeProjects(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wfviz-srv-"));
  const dir = path.join(tmp, "-Users-x-demo", "session-1", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(fixture("research-run.json"), path.join(dir, "wf_c7a66bf4-7c6.json"));
  fs.copyFileSync(fixture("running-run.json"), path.join(dir, "wf_running01.json"));
  return tmp;
}

test("activeRunData returns the most-recently-written run as a payload", () => {
  const tmp = makeProjects();
  try {
    // touch the running fixture so it is the most recently modified.
    const runningPath = path.join(tmp, "-Users-x-demo", "session-1", "workflows", "wf_running01.json");
    const now = new Date();
    fs.utimesSync(runningPath, now, now);
    const payload = activeRunData({ projectsDir: tmp }) as {
      ok: boolean;
      isRunning: boolean;
      runId: string;
      data: { agents: unknown[] };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.runId, "wf_running01");
    assert.equal(payload.isRunning, true);
    assert.ok(payload.data.agents.length > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("activeRunData reports cleanly when there are no runs", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "wfviz-empty-"));
  try {
    const payload = activeRunData({ projectsDir: empty }) as { ok: boolean };
    assert.equal(payload.ok, false);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
