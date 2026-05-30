import test from "node:test";
import assert from "node:assert/strict";
import { liveDashboardHtml } from "../src/render-live.js";

test("live dashboard is a self-contained polling page", () => {
  const html = liveDashboardHtml();
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.trimEnd().endsWith("</html>"));
  // it polls the API rather than embedding data
  assert.ok(html.includes("/api/run"));
  assert.ok(html.includes("Waiting for a workflow"));
  // no external resource loads
  assert.ok(!/\ssrc\s*=\s*["']https?:/i.test(html));
  assert.ok(!/<link[^>]+href\s*=\s*["']https?:/i.test(html));
});
