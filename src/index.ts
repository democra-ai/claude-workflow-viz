/**
 * claude-workflow-viz — programmatic API.
 *
 * Visualize Claude Code dynamic-workflow runs: discover runs on disk, parse
 * them into a normalized model, and render to the terminal or to a
 * self-contained interactive HTML report.
 *
 * @example
 * ```ts
 * import { discoverRuns, parseRunFile, renderRun, renderHtml } from "claude-workflow-viz";
 * const [latest] = discoverRuns();
 * const run = parseRunFile(latest.sourcePath);
 * console.log(renderRun(run, { color: true }));
 * const html = renderHtml(run);
 * ```
 */

export * from "./types.js";
export {
  claudeConfigDir,
  claudeProjectsDir,
  encodeProjectSlug,
  discoverRuns,
  refFromFile,
  resolveRunRef,
  journalPath,
  RunNotFoundError,
  type DiscoverOptions,
} from "./discover.js";
export { parseRunFile, normalizeRun, loadJournal, mapState, WorkflowParseError } from "./parse.js";
export {
  isRunning,
  peakConcurrency,
  concurrencyAt,
  concurrencySeries,
  phaseBarrierAfter,
  packLanes,
  totalRetries,
  modelsUsed,
  shortModel,
  stateCounts,
} from "./model.js";
export { renderRun, renderRunLine, type TerminalOptions } from "./render-terminal.js";
export { renderHtml, buildHtmlData, type HtmlOptions } from "./render-html.js";
export { watchRun, renderFrame, type WatchOptions } from "./watch.js";
export { liveDashboardHtml } from "./render-live.js";
export {
  startServer,
  openBrowser,
  activeRunData,
  type ServerOptions,
  type RunningServer,
} from "./server.js";
