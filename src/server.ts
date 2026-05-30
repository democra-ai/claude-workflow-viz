/**
 * Live dashboard server. A tiny zero-dependency HTTP server that re-reads the
 * most-recently-active workflow run on demand and serves it as JSON, plus the
 * live dashboard page that polls it. Used by `wfviz live` and the Claude Code
 * plugin's PreToolUse hook to auto-open a visualization when a workflow starts.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { discoverRuns, resolveRunRef, type DiscoverOptions } from "./discover.js";
import { isRunning } from "./model.js";
import { parseRunFile } from "./parse.js";
import { buildHtmlData } from "./render-html.js";
import { liveDashboardHtml } from "./render-live.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  open?: boolean;
  /** Limit to a single project slug (defaults to all projects). */
  projectSlug?: string;
}

export interface RunningServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_PORT = 7682;

/** Pick the most-recently-written run (the one that is currently active). */
export function activeRunData(opts: DiscoverOptions = {}): Record<string, unknown> {
  const runs = discoverRuns(opts);
  if (runs.length === 0) return { ok: false, reason: "no workflow runs found" };
  // The active run is the one whose file was touched most recently — more
  // reliable than startTime while a run is still in progress.
  let best = runs[0]!;
  let bestM = -1;
  for (const r of runs.slice(0, 40)) {
    try {
      const m = fs.statSync(r.sourcePath).mtimeMs;
      if (m > bestM) {
        bestM = m;
        best = r;
      }
    } catch {
      /* ignore unreadable */
    }
  }
  try {
    const run = parseRunFile(best.sourcePath);
    return {
      ok: true,
      data: buildHtmlData(run),
      isRunning: isRunning(run),
      runId: run.runId,
      status: run.status,
      runCount: runs.length,
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

function runById(id: string): Record<string, unknown> {
  const ref = resolveRunRef(id);
  const run = parseRunFile(ref.sourcePath);
  return { ok: true, data: buildHtmlData(run), isRunning: isRunning(run), runId: run.runId, status: run.status };
}

/** Start the live server. Resolves once it is listening. */
export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const host = opts.host ?? "127.0.0.1";
  const desiredPort = opts.port ?? DEFAULT_PORT;
  const discover: DiscoverOptions = opts.projectSlug ? { projectSlug: opts.projectSlug } : {};

  const server = http.createServer((req, res) => {
    const send = (code: number, type: string, body: string) => {
      res.writeHead(code, {
        "content-type": type,
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(body);
    };
    let pathname = "/";
    let id: string | null = null;
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${desiredPort}`);
      pathname = url.pathname;
      id = url.searchParams.get("id");
    } catch {
      /* fall through to default */
    }
    try {
      if (pathname === "/healthz") return send(200, "text/plain", "ok");
      if (pathname === "/api/runs") {
        return send(200, "application/json", JSON.stringify(discoverRuns(discover)));
      }
      if (pathname === "/api/run") {
        const payload = id ? runById(id) : activeRunData(discover);
        return send(200, "application/json", JSON.stringify(payload));
      }
      if (pathname === "/" || pathname === "/index.html") {
        return send(200, "text/html; charset=utf-8", liveDashboardHtml());
      }
      return send(404, "text/plain", "not found");
    } catch (e) {
      return send(200, "application/json", JSON.stringify({ ok: false, reason: (e as Error).message }));
    }
  });

  return new Promise<RunningServer>((resolve, reject) => {
    server.once("error", reject);
    server.listen(desiredPort, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : desiredPort;
      const url = `http://${host}:${port}`;
      if (opts.open) openBrowser(url);
      resolve({
        port,
        url,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** Open a URL in the default browser (best effort, cross-platform). */
export function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    /* best effort */
  }
}
