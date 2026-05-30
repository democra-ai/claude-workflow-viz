import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseRunFile } from "../src/parse.js";
import { buildHtmlData, renderHtml } from "../src/render-html.js";

const fixture = (name: string): string =>
  path.join(process.cwd(), "test", "fixtures", name);

test("produces a self-contained HTML document", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const html = renderHtml(r);
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.trimEnd().endsWith("</html>"));
  assert.ok(html.includes("window.__WFVIZ__"));
});

test("makes no external network requests", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const html = renderHtml(r);
  assert.ok(!/\ssrc\s*=\s*["']https?:/i.test(html), "no remote scripts");
  assert.ok(!/<link[^>]+href\s*=\s*["']https?:/i.test(html), "no remote stylesheets");
  assert.ok(!/@import/i.test(html), "no CSS @import");
});

test("embeds all agent labels and the workflow name", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const html = renderHtml(r);
  assert.ok(html.includes("research-claude-dynamic-workflows"));
  for (const label of [
    "search:official-docs",
    "search:release-notes",
    "search:how-it-works",
    "search:community-examples",
    "search:comparison",
    "synthesize",
  ]) {
    assert.ok(html.includes(label), `missing label ${label}`);
  }
});

test("contains exactly the two intended <script> tags (no JSON breakout)", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const html = renderHtml(r);
  const closers = (html.match(/<\/script>/g) ?? []).length;
  assert.equal(closers, 2);
  // angle brackets inside injected data must be escaped
  assert.ok(!html.includes("</script><"), "unexpected adjacent script close");
});

test("renders the viz run (HTML-valued result) without bloating or breaking", () => {
  const r = parseRunFile(fixture("viz-run.json"));
  const html = renderHtml(r);
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  // result for this run is huge HTML; it must be summarized, not inlined whole.
  assert.ok(html.length < 200_000, `report unexpectedly large: ${html.length}`);
});

test("buildHtmlData exposes a faithful, compact payload", () => {
  const r = parseRunFile(fixture("research-run.json"));
  const d = buildHtmlData(r) as {
    agents: unknown[];
    phases: unknown[];
    peak: number;
    windowMs: number;
    concurrency: number[];
    run: { workflowName: string };
  };
  assert.equal(d.agents.length, 6);
  assert.equal(d.phases.length, 2);
  assert.equal(d.peak, 5);
  assert.ok(d.windowMs > 0);
  assert.ok(Array.isArray(d.concurrency) && d.concurrency.length > 0);
  // the sampled curve must actually reach the reported peak
  assert.equal(Math.max(...d.concurrency), d.peak);
  assert.equal(d.run.workflowName, "research-claude-dynamic-workflows");
});
