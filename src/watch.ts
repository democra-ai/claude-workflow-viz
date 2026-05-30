/**
 * Live terminal view: re-parse a run's `wf_<id>.json` on an interval and
 * redraw until the run reaches a terminal status. Resilient to the file being
 * momentarily unreadable mid-write (keeps the last good frame).
 */

import { makePainter } from "./format.js";
import { isRunning } from "./model.js";
import { parseRunFile } from "./parse.js";
import { renderRun, type TerminalOptions } from "./render-terminal.js";

export interface WatchOptions extends TerminalOptions {
  intervalMs?: number;
  /** Stop after this many frames (mainly for tests). */
  maxFrames?: number;
  /** Clear the screen between frames (default true). */
  clear?: boolean;
  out?: NodeJS.WritableStream;
}

// Clear screen + scrollback + move cursor home.
const CLEAR = "\x1b[2J\x1b[3J\x1b[H";

/** Render a single frame from a run file. Throws if the file can't be parsed. */
export function renderFrame(
  sourcePath: string,
  opts: TerminalOptions = {},
): { text: string; running: boolean } {
  const run = parseRunFile(sourcePath);
  return { text: renderRun(run, opts), running: isRunning(run) };
}

/** Poll a run file and redraw until it finishes (or SIGINT / maxFrames). */
export function watchRun(
  ref: { sourcePath: string },
  opts: WatchOptions = {},
): Promise<void> {
  const out = opts.out ?? process.stdout;
  const interval = Math.max(200, opts.intervalMs ?? 1000);
  const clear = opts.clear ?? true;
  const p = makePainter(opts.color ?? false);
  let frames = 0;
  let lastGood = "";

  return new Promise<void>((resolve) => {
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      process.off("SIGINT", onSig);
      resolve();
    };
    const onSig = () => stop();
    process.on("SIGINT", onSig);

    const tickOnce = () => {
      if (stopped) return;
      let frame: { text: string; running: boolean } | null = null;
      try {
        frame = renderFrame(ref.sourcePath, opts);
        lastGood = frame.text;
      } catch (err) {
        if (frames === 0) {
          out.write(p.fg("brightRed", String((err as Error).message)) + "\n");
          stop();
          return;
        }
        // transient read error mid-write: keep showing the last good frame
      }
      if (clear) out.write(CLEAR);
      out.write((frame ? frame.text : lastGood) + "\n");
      const running = frame ? frame.running : true;
      out.write(
        (running
          ? p.fg("brightCyan", "● live") + p.dim(` — polling every ${interval / 1000}s · Ctrl-C to stop`)
          : p.dim("○ run finished")) + "\n",
      );
      frames++;
      if (frame && !frame.running) {
        stop();
        return;
      }
      if (opts.maxFrames && frames >= opts.maxFrames) {
        stop();
        return;
      }
      setTimeout(tickOnce, interval).unref?.();
    };

    tickOnce();
  });
}
