/**
 * Locate Claude Code workflow runs on disk.
 *
 * Claude Code stores each dynamic-workflow run as:
 *   <config>/projects/<project-slug>/<session-id>/workflows/wf_<id>.json
 * with sibling per-agent transcripts under:
 *   <config>/projects/<project-slug>/<session-id>/subagents/workflows/wf_<id>/
 *
 * `<config>` defaults to `~/.claude` and can be overridden with the
 * CLAUDE_CONFIG_DIR environment variable (matching Claude Code itself).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseRunFile } from "./parse.js";
import type { RunRef } from "./types.js";

/** Root config directory for Claude Code. */
export function claudeConfigDir(): string {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env && env.trim() !== "") return env;
  return path.join(os.homedir(), ".claude");
}

/** Directory that contains one sub-directory per project. */
export function claudeProjectsDir(): string {
  return path.join(claudeConfigDir(), "projects");
}

/**
 * Encode an absolute working directory the way Claude Code names its project
 * folders: every "/" and "." becomes "-".
 * e.g. "/Users/jane/democra-ai" -> "-Users-jane-democra-ai".
 * Handles Windows separators and the drive colon too
 * ("C:\\Users\\jane\\proj" -> "C--Users-jane-proj").
 */
export function encodeProjectSlug(absDir: string): string {
  return absDir.replace(/[/.\\:]/g, "-");
}

export interface DiscoverOptions {
  /** Override the projects root (used by tests). */
  projectsDir?: string;
  /** Only return runs from this project slug. */
  projectSlug?: string;
  /** Cap the number of results (after sorting newest-first). */
  limit?: number;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Build a lightweight {@link RunRef} from a `wf_<id>.json` file (best effort). */
export function refFromFile(file: string, projectSlug: string): RunRef | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const sessionDir = path.dirname(path.dirname(file));
  const num = (v: unknown, d = 0): number =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
  const runId = str(raw.runId) || path.basename(file).replace(/\.json$/, "");
  return {
    runId,
    workflowName: str(raw.workflowName, runId),
    status: str(raw.status, "unknown"),
    startTime: num(raw.startTime) || Date.parse(str(raw.timestamp)) || 0,
    durationMs: num(raw.durationMs),
    agentCount: num(raw.agentCount),
    sourcePath: file,
    sessionDir,
    projectSlug,
  };
}

/** Find all workflow runs, newest first. */
export function discoverRuns(opts: DiscoverOptions = {}): RunRef[] {
  const root = opts.projectsDir ?? claudeProjectsDir();
  const refs: RunRef[] = [];

  for (const projectSlug of safeReaddir(root)) {
    if (opts.projectSlug && projectSlug !== opts.projectSlug) continue;
    const projectDir = path.join(root, projectSlug);
    if (!isDir(projectDir)) continue;

    for (const session of safeReaddir(projectDir)) {
      const workflowsDir = path.join(projectDir, session, "workflows");
      if (!isDir(workflowsDir)) continue;

      for (const entry of safeReaddir(workflowsDir)) {
        if (!entry.startsWith("wf_") || !entry.endsWith(".json")) continue;
        const file = path.join(workflowsDir, entry);
        const ref = refFromFile(file, projectSlug);
        if (ref) refs.push(ref);
      }
    }
  }

  refs.sort((a, b) => b.startTime - a.startTime);
  return typeof opts.limit === "number" ? refs.slice(0, opts.limit) : refs;
}

export class RunNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunNotFoundError";
  }
}

/**
 * Resolve a user-supplied run reference to a concrete `wf_<id>.json` path.
 * Accepts: a direct file path, the literal "latest", or a run id (`wf_…`).
 */
export function resolveRunRef(ref: string, opts: DiscoverOptions = {}): RunRef {
  // 1) explicit path to a wf json
  if (ref.endsWith(".json") || ref.includes(path.sep)) {
    const abs = path.resolve(ref);
    if (fs.existsSync(abs)) {
      const slug = path.basename(path.dirname(path.dirname(path.dirname(abs))));
      const r = refFromFile(abs, slug);
      if (r) return r;
      // refFromFile swallows the parse error; re-parse to surface the precise
      // reason (invalid JSON / not an object / unreadable / a directory).
      parseRunFile(abs);
      throw new RunNotFoundError(`Could not read run file: ${abs}`);
    }
  }

  const runs = discoverRuns(opts);
  if (runs.length === 0) {
    throw new RunNotFoundError(
      "No Claude Code workflow runs found. Run a workflow in Claude Code first, " +
        `or check ${claudeProjectsDir()} (override with CLAUDE_CONFIG_DIR).`,
    );
  }

  if (ref === "latest" || ref === "") return runs[0]!;

  const byId = runs.find((r) => r.runId === ref);
  if (byId) return byId;

  // tolerate a bare id without the wf_ prefix or a unique prefix match
  const byPrefix = runs.filter((r) => r.runId === `wf_${ref}` || r.runId.startsWith(ref));
  if (byPrefix.length === 1) return byPrefix[0]!;
  if (byPrefix.length > 1) {
    throw new RunNotFoundError(
      `Ambiguous run reference "${ref}" matches ${byPrefix.length} runs; use the full run id.`,
    );
  }

  throw new RunNotFoundError(
    `No run matching "${ref}". Use \`wfviz list\` to see available runs.`,
  );
}

/** Absolute path to a run's `journal.jsonl`, if the directory layout is present. */
export function journalPath(sessionDir: string, runId: string): string {
  return path.join(sessionDir, "subagents", "workflows", runId, "journal.jsonl");
}
