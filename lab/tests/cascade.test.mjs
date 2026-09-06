import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBaselineState,
  propagationFor,
  simulateFault,
  stateSummary,
  withResilience,
} from "../cascade/cascade-core.js";

const html = readFileSync(new URL("../cascade/index.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../cascade/cascade.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../cascade/cascade.css", import.meta.url), "utf8");
const headers = readFileSync(new URL("../../_headers", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../../sitemap.xml", import.meta.url), "utf8");
const sitemapGenerator = readFileSync(new URL("../../scripts/generate_sitemap.py", import.meta.url), "utf8");

test("baseline is exact, synthetic, and stable", () => {
  const first = createBaselineState();
  const second = createBaselineState();
  assert.deepEqual(first, second);
  assert.equal(first.phase, "baseline");
  assert.equal(first.nodes.database, "healthy");
  assert.equal(first.nodes.edge, "healthy");
  assert.equal(first.instruction, "Introduce a fault.");
});

test("database failure propagates upstream in deterministic stages", () => {
  const steps = propagationFor(
    { node: "database", type: "fail" },
    createBaselineState().resilience,
  );
  assert.equal(steps.length, 4);
  const settled = simulateFault({ node: "database", type: "fail" });
  assert.equal(settled.nodes.database, "failed");
  assert.equal(settled.nodes.core, "waiting");
  assert.equal(settled.nodes.api, "saturated");
  assert.equal(settled.nodes.edge, "degraded");
  assert.match(settled.explanation, /propagated upstream/i);
});

test("cache fallback contains database failure without erasing the root fault", () => {
  let state = createBaselineState();
  state = withResilience(state, "cacheFallback", true);
  const settled = simulateFault(
    { node: "database", type: "fail" },
    state.resilience,
  );
  assert.equal(settled.nodes.database, "failed");
  assert.equal(settled.nodes.cache, "fallback");
  assert.equal(settled.nodes.core, "degraded");
  assert.equal(settled.nodes.api, "healthy");
  assert.equal(settled.nodes.edge, "healthy");
  assert.equal(settled.mechanisms.cacheFallback, true);
  assert.match(settled.explanation, /root fault still exists/i);
  assert.match(settled.explanation, /freshness/i);
});

test("async buffer visibly accumulates work during database failure", () => {
  let state = createBaselineState();
  state = withResilience(state, "asyncBuffer", true);
  const settled = simulateFault(
    { node: "database", type: "fail" },
    state.resilience,
  );
  assert.equal(settled.nodes.database, "failed");
  assert.equal(settled.nodes.queue, "buffering");
  assert.equal(settled.mechanisms.asyncBuffer, true);
  assert.equal(settled.nodes.edge, "degraded");
  assert.match(settled.explanation, /write acceptance/i);
});

test("graceful mode contains an optional cache failure", () => {
  let state = createBaselineState();
  state = withResilience(state, "gracefulMode", true);
  const settled = simulateFault(
    { node: "cache", type: "fail" },
    state.resilience,
  );
  assert.equal(settled.nodes.cache, "failed");
  assert.equal(settled.nodes.core, "degraded");
  assert.equal(settled.nodes.api, "healthy");
  assert.equal(settled.nodes.edge, "healthy");
  assert.equal(settled.mechanisms.gracefulMode, true);
  assert.match(settled.explanation, /fault still exists/i);
});

test("all fault types are deterministic for both prototype roots", () => {
  for (const node of ["database", "cache"]) {
    for (const type of ["fail", "degrade", "latency"]) {
      const first = simulateFault({ node, type });
      const second = simulateFault({ node, type });
      assert.deepEqual(first, second, `${node}/${type} should replay exactly`);
      assert.match(stateSummary(first), new RegExp(`Root fault: ${node} ${type}`));
    }
  }
});

test("unpublished CASCADE route stays outside index and social-card graphs", () => {
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(html, /property="og:image"/);
  assert.doesNotMatch(html, /name="twitter:image"/);
  assert.match(headers, /\/lab\/cascade\/\*[\s\S]*X-Robots-Tag: noindex, follow/);
  assert.doesNotMatch(sitemap, /\/lab\/cascade\//);
  assert.doesNotMatch(sitemapGenerator, /\/lab\/cascade\//);
});

test("page exposes the micro-lab evidence and interaction contract", () => {
  assert.match(html, /ATLAS \/ CASCADE/);
  assert.match(html, /SIMULATED LAB/);
  assert.match(html, /Deterministic synthetic model\. No production Atlas Systems data connected\./);
  assert.match(html, /data-node="database"/);
  assert.match(html, /data-node="cache"/);
  assert.match(html, /data-fault-type="fail"/);
  assert.match(html, /data-fault-type="degrade"/);
  assert.match(html, /data-fault-type="latency"/);
  assert.match(html, /data-resilience="cacheFallback"/);
  assert.match(html, /data-resilience="asyncBuffer"/);
  assert.match(html, /data-resilience="gracefulMode"/);
  assert.match(html, /id="cascade-replay"/);
  assert.match(html, /id="cascade-reset"/);
  assert.doesNotMatch(html, />LIVE</i);
  assert.doesNotMatch(html, /production telemetry/i);
});

test("browser layer preserves keyboard, hidden-tab, resize, and reduced-motion behavior", () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "r"/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /overflow-x: hidden/);
});
