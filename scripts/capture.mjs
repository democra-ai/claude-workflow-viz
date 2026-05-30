// Capture README media from REAL run data:
//  - assets/report.png        the interactive HTML report (end state)
//  - assets/live.png          the live dashboard
//  - assets/replay.gif        the report's replay scrubber animating 0 -> done
//
// Usage: node scripts/capture.mjs
// Requires: playwright (browser cached), ffmpeg on PATH.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { parseRunFile } from "../dist/src/parse.js";
import { renderHtml } from "../dist/src/render-html.js";

const ROOT = new URL("..", import.meta.url).pathname;
const ASSETS = ROOT + "assets";
const TMP = ROOT + "assets/.frames";
mkdirSync(ASSETS, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const SCALE = 2; // retina
const W = 1180;

function reportHtml(fixture) {
  return renderHtml(parseRunFile(ROOT + "test/fixtures/" + fixture));
}

const browser = await chromium.launch();

// ---- 1) interactive report, end state -------------------------------------
{
  const page = await browser.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: SCALE });
  await page.setContent(reportHtml("research-run.json"), { waitUntil: "load" });
  await page.waitForSelector("rect.bar");
  // jump the replay to the end so bars are fully drawn + result visible
  await page.evaluate(() => {
    const s = document.querySelector("input.scrub");
    if (s) { s.value = s.max; s.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: ASSETS + "/report.png", fullPage: true });
  console.log("wrote assets/report.png");
  await page.close();
}

// ---- 2) live dashboard (served) -------------------------------------------
{
  const { startServer } = await import("../dist/src/server.js");
  const srv = await startServer({ port: 7690, open: false });
  const page = await browser.newPage({ viewport: { width: W, height: 880 }, deviceScaleFactor: SCALE });
  await page.goto(srv.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // let it poll + render
  // if a run is present, capture full; else capture the waiting state
  const hasDash = await page.evaluate(() => !document.getElementById("dash")?.hidden);
  await page.screenshot({ path: ASSETS + "/live.png", fullPage: hasDash });
  console.log("wrote assets/live.png (dash=" + hasDash + ")");
  await page.close();
  await srv.close();
}

// ---- 3) replay GIF (viewport-cropped to the gantt+chips) -------------------
{
  const page = await browser.newPage({ viewport: { width: W, height: 760 }, deviceScaleFactor: 1 });
  await page.setContent(reportHtml("research-run.json"), { waitUntil: "load" });
  await page.waitForSelector("rect.bar");
  const FRAMES = 48;
  const max = await page.evaluate(() => Number(document.querySelector("input.scrub").max));
  for (let i = 0; i < FRAMES; i++) {
    const t = Math.round((i / (FRAMES - 1)) * max);
    await page.evaluate((v) => {
      const s = document.querySelector("input.scrub");
      s.value = String(v); s.dispatchEvent(new Event("input", { bubbles: true }));
    }, t);
    await page.waitForTimeout(28);
    const n = String(i).padStart(3, "0");
    await page.screenshot({ path: `${TMP}/f${n}.png`, clip: { x: 0, y: 0, width: W, height: 760 } });
  }
  console.log(`captured ${FRAMES} frames`);
  await page.close();
}

await browser.close();

// ---- 4) frames -> gif via ffmpeg (palette for quality) --------------------
const frames = readdirSync(TMP).filter((f) => f.endsWith(".png")).length;
if (frames > 0) {
  execFileSync("ffmpeg", ["-y", "-i", `${TMP}/f%03d.png`, "-vf", "palettegen=stats_mode=full", `${TMP}/pal.png`], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-framerate", "20", "-i", `${TMP}/f%03d.png`, "-i", `${TMP}/pal.png`,
    "-lavfi", "fps=20,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer",
    "-loop", "0", `${ASSETS}/replay.gif`,
  ], { stdio: "ignore" });
  console.log("wrote assets/replay.gif");
}
rmSync(TMP, { recursive: true, force: true });
console.log("done");
