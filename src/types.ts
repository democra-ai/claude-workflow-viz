/**
 * Type definitions for claude-workflow-viz.
 *
 * Two layers:
 *  - `Raw*`        : the best-effort shape Claude Code writes to disk in
 *                    `~/.claude/projects/<slug>/<session>/workflows/wf_<id>.json`.
 *                    Every field is optional — the on-disk format is a research
 *                    preview and may change, so the parser treats it defensively.
 *  - `WorkflowRun` : the normalized model the renderers consume. Always valid.
 */

/** Lifecycle state of a single agent within a run. */
export type AgentState =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "skipped"
  | "unknown";

/** Terminal run statuses (a run not in this set is considered in-progress). */
export const TERMINAL_STATUSES = new Set([
  "completed",
  "complete",
  "done",
  "failed",
  "error",
  "aborted",
  "cancelled",
  "canceled",
]);

// ---------------------------------------------------------------------------
// Raw on-disk shapes (all fields optional / defensive)
// ---------------------------------------------------------------------------

export interface RawPhase {
  title?: string;
  detail?: string;
}

export interface RawProgressPhase {
  type: "workflow_phase";
  index?: number;
  title?: string;
}

export interface RawProgressAgent {
  type: "workflow_agent";
  index?: number;
  label?: string;
  phaseIndex?: number;
  phaseTitle?: string;
  agentId?: string;
  model?: string;
  state?: string;
  queuedAt?: number;
  startedAt?: number;
  lastProgressAt?: number;
  durationMs?: number;
  attempt?: number;
  tokens?: number;
  toolCalls?: number;
  lastToolName?: string;
  lastToolSummary?: string;
  promptPreview?: string;
  resultPreview?: string;
}

export type RawProgress =
  | RawProgressPhase
  | RawProgressAgent
  | { type?: string; [k: string]: unknown };

export interface RawRun {
  runId?: string;
  workflowName?: string;
  status?: string;
  defaultModel?: string;
  startTime?: number;
  durationMs?: number;
  timestamp?: string;
  agentCount?: number;
  totalTokens?: number;
  totalToolCalls?: number;
  scriptPath?: string;
  script?: string;
  summary?: string;
  taskId?: string;
  logs?: unknown;
  phases?: unknown;
  workflowProgress?: unknown;
  result?: unknown;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Normalized model
// ---------------------------------------------------------------------------

export interface Agent {
  /** 1-based order in which the agent was spawned. */
  index: number;
  label: string;
  agentId?: string;
  model?: string;
  state: AgentState;
  phaseIndex: number;
  phaseTitle: string;
  /** Absolute epoch-ms timestamps (when known). */
  queuedAt?: number;
  startedAt?: number;
  endedAt?: number;
  /** Duration in ms (computed if not provided). */
  durationMs: number;
  /** Milliseconds from the run start (clamped to >= 0). */
  startRel: number;
  endRel: number;
  attempt: number;
  tokens: number;
  toolCalls: number;
  lastToolName?: string;
  lastToolSummary?: string;
  promptPreview?: string;
  resultPreview?: string;
}

export interface Phase {
  /** 1-based phase order. */
  index: number;
  title: string;
  detail?: string;
  /** `Agent.index` values belonging to this phase, in spawn order. */
  agentIndexes: number[];
  /** Phase window in ms from run start (derived from member agents). */
  startRel: number;
  endRel: number;
}

export interface WorkflowRun {
  runId: string;
  workflowName: string;
  status: string;
  defaultModel?: string;
  /** Epoch ms. */
  startTime: number;
  durationMs: number;
  endTime: number;
  timestamp?: string;
  agentCount: number;
  totalTokens: number;
  totalToolCalls: number;
  scriptPath?: string;
  script?: string;
  summary?: string;
  logs: string[];
  phases: Phase[];
  agents: Agent[];
  result?: unknown;
  /** Absolute path to the `wf_<id>.json` this run was parsed from. */
  sourcePath: string;
  /** Session directory that holds `workflows/` and `subagents/`. */
  sessionDir: string;
}

/** Lightweight descriptor produced by discovery (no full parse). */
export interface RunRef {
  runId: string;
  workflowName: string;
  status: string;
  startTime: number;
  durationMs: number;
  agentCount: number;
  sourcePath: string;
  sessionDir: string;
  projectSlug: string;
}

/** A single appended event from a run's `journal.jsonl`. */
export interface JournalEvent {
  type: string;
  key?: string;
  agentId?: string;
  result?: unknown;
  [k: string]: unknown;
}
