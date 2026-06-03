#!/usr/bin/env node
/**
 * wfviz — command-line interface.
 *
 *   wfviz list                 list discovered workflow runs (newest first)
 *   wfviz show [ref]           render a run in the terminal (default: latest)
 *   wfviz watch [ref]          live terminal view, refreshes until the run ends
 *   wfviz export [ref] -o f    write a self-contained interactive HTML report
 *
 * `ref` is a run id (wf_…), the literal "latest", or a path to a wf_<id>.json.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { colorEnabled, makePainter } from "./format.js";
import { discoverRuns, encodeProjectSlug, resolveRunRef } from "./discover.js";
import { parseRunFile } from "./parse.js";
import { renderHtml } from "./render-html.js";
import { renderRun, renderRunLine } from "./render-terminal.js";
import { startServer } from "./server.js";
import { watchRun } from "./watch.js";

const VERSION = "0.1.1";
const VALUE_FLAGS = new Set(["out", "o", "limit", "interval", "width", "cap", "project", "port", "host"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (VALUE_FLAGS.has(body) && i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
        flags[body] = argv[++i]!;
      } else {
        flags[body] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      if (key === "o") {
        if (i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) flags["out"] = argv[++i]!;
        else flags["out"] = true; // `-o` with no value -> rejected by cmdExport
      } else if (key === "h") flags["help"] = true;
      else if (key === "v") flags["version"] = true;
      else flags[key] = true;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function resolveColor(flags: Record<string, string | boolean>): boolean {
  if (flags["no-color"]) return false;
  if (flags["color"]) return true;
  return colorEnabled();
}

function termWidth(flags: Record<string, string | boolean>): number {
  const w = Number(flags["width"]);
  if (Number.isFinite(w) && w > 0) return w;
  return process.stdout.columns ?? 100;
}

const HELP = `wfviz — visualize Claude Code dynamic workflows

USAGE
  wfviz <command> [ref] [options]

COMMANDS
  list                 List discovered workflow runs (newest first)
  show   [ref]         Render a run in the terminal               (default: latest)
  watch  [ref]         Live terminal view; refreshes until the run finishes
  live                 Start a live web dashboard (auto-opens in your browser)
  export [ref]         Write a self-contained interactive HTML report
  help                 Show this help

REF
  A run id (e.g. wf_ab12cd34), the literal "latest", or a path to a wf_<id>.json.

OPTIONS
  --here               Only runs from the current directory's project
  --project <slug>     Only runs from a specific project slug
  --limit <n>          Limit number of runs (list)
  --json               Machine-readable output (list)
  -o, --out <file>     Output path (export)
  --open               Open the HTML report after writing (export)
  --port <n>           Port for the live dashboard (default: 7682) (live)
  --host <h>           Host to bind the live dashboard (default: 127.0.0.1)
  --no-open            Do not auto-open the browser (live)
  --cap <n>            Concurrency cap reference to display (default: 16)
  --interval <ms>      Poll interval for watch (default: 1000)
  --width <n>          Terminal width override (show, watch)
  --no-color           Disable ANSI colour
  -v, --version        Print version
  -h, --help           Show this help

EXAMPLES
  wfviz list
  wfviz show latest
  wfviz watch                       # follow the most recent run live
  wfviz live                        # open a live web dashboard; agents light up as they run
  wfviz export latest -o run.html --open

Runs are read from ~/.claude/projects (override with CLAUDE_CONFIG_DIR).
`;

function openFile(file: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", file] : [file];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    /* best effort */
  }
}

function sanitizeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workflow";
}

function cmdList(args: ParsedArgs): number {
  const color = resolveColor(args.flags);
  const p = makePainter(color);
  const slug = args.flags["here"]
    ? encodeProjectSlug(process.cwd())
    : typeof args.flags["project"] === "string"
      ? (args.flags["project"] as string)
      : undefined;
  const limit = Number(args.flags["limit"]);
  const runs = discoverRuns({ projectSlug: slug, limit: Number.isFinite(limit) ? limit : undefined });

  if (args.flags["json"]) {
    process.stdout.write(JSON.stringify(runs, null, 2) + "\n");
    return 0;
  }
  if (runs.length === 0) {
    process.stdout.write(
      p.dim("No workflow runs found. Run a dynamic workflow in Claude Code first.\n"),
    );
    return 0;
  }
  process.stdout.write("\n" + p.dim(`  ${runs.length} run${runs.length === 1 ? "" : "s"}`) + "\n\n");
  for (const r of runs) process.stdout.write("  " + renderRunLine(r, { color }) + "\n");
  process.stdout.write("\n" + p.dim("  wfviz show <id>   ·   wfviz export <id> -o report.html") + "\n\n");
  return 0;
}

function cmdShow(args: ParsedArgs): number {
  const color = resolveColor(args.flags);
  const ref = args.positionals[0] ?? "latest";
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : undefined;
  const found = resolveRunRef(ref, { projectSlug: slug });
  const run = parseRunFile(found.sourcePath);
  const cap = Number(args.flags["cap"]);
  process.stdout.write(
    renderRun(run, {
      color,
      width: termWidth(args.flags),
      concurrencyCap: Number.isFinite(cap) ? cap : undefined,
    }) + "\n",
  );
  return 0;
}

function cmdExport(args: ParsedArgs): number {
  const ref = args.positionals[0] ?? "latest";
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : undefined;
  const found = resolveRunRef(ref, { projectSlug: slug });
  const run = parseRunFile(found.sourcePath);
  const cap = Number(args.flags["cap"]);
  const html = renderHtml(run, { concurrencyCap: Number.isFinite(cap) ? cap : undefined });

  const outFlag = args.flags["out"];
  if (outFlag === true) throw new Error("the -o/--out option requires a file path");
  const out =
    typeof outFlag === "string"
      ? outFlag
      : `${sanitizeName(run.workflowName)}-${run.runId}.wfviz.html`;
  const abs = path.resolve(out);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, html, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const why =
      code === "EACCES" ? "permission denied" : code === "ENOENT" ? "no such directory" : (err as Error).message;
    throw new Error(`cannot write report to ${abs}: ${why}`);
  }
  const p = makePainter(resolveColor(args.flags));
  process.stdout.write(p.fg("brightGreen", "✔ ") + "wrote " + p.bold(abs) + p.dim(` (${(html.length / 1024).toFixed(0)} KB)`) + "\n");
  if (args.flags["open"]) openFile(abs);
  return 0;
}

async function cmdWatch(args: ParsedArgs): Promise<number> {
  const color = resolveColor(args.flags);
  const ref = args.positionals[0] ?? "latest";
  const slug = args.flags["here"] ? encodeProjectSlug(process.cwd()) : undefined;
  const found = resolveRunRef(ref, { projectSlug: slug });
  const interval = Number(args.flags["interval"]);
  await watchRun(found, {
    color,
    width: termWidth(args.flags),
    intervalMs: Number.isFinite(interval) ? interval : undefined,
  });
  return 0;
}

async function cmdLive(args: ParsedArgs): Promise<number> {
  const port = Number(args.flags["port"]);
  const open = !args.flags["no-open"];
  const slug = args.flags["here"]
    ? encodeProjectSlug(process.cwd())
    : typeof args.flags["project"] === "string"
      ? (args.flags["project"] as string)
      : undefined;
  const host = typeof args.flags["host"] === "string" ? (args.flags["host"] as string) : undefined;
  const srv = await startServer({
    port: Number.isFinite(port) ? port : undefined,
    open,
    projectSlug: slug,
    host,
  });
  const p = makePainter(resolveColor(args.flags));
  process.stdout.write(
    p.fg("brightGreen", "● ") +
      "live dashboard at " +
      p.bold(srv.url) +
      p.dim("   (Ctrl-C to stop)") +
      "\n",
  );
  // Stay alive until interrupted.
  return await new Promise<number>((resolve) => {
    const stop = () => {
      srv.close().then(() => resolve(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.flags["version"]) {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  const cmd = args.positionals.shift() ?? (args.flags["help"] ? "help" : "list");
  if (args.flags["help"] || cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  switch (cmd) {
    case "list":
    case "ls":
      return cmdList(args);
    case "show":
    case "view":
      return cmdShow(args);
    case "export":
    case "html":
      return cmdExport(args);
    case "watch":
    case "follow":
      return cmdWatch(args);
    case "live":
    case "serve":
      return cmdLive(args);
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n` + HELP);
      return 2;
  }
}

const isMain = (() => {
  try {
    const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
    const self = new URL(import.meta.url).pathname;
    return invoked === self || self.endsWith(invoked);
  } catch {
    return true;
  }
})();

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      const p = makePainter(colorEnabled());
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(p.fg("brightRed", "error: ") + msg + "\n");
      // Full stack only when explicitly debugging — users never see raw traces.
      if (process.env.WFVIZ_DEBUG && err instanceof Error && err.stack) {
        process.stderr.write(p.dim(err.stack) + "\n");
      }
      process.exitCode = 1;
    });
}
