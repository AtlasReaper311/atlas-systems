import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("systems/observability/index.html", "utf8");
const script = readFileSync("systems/observability/observability.js", "utf8");
const css = readFileSync("static/css/systems-focus.css", "utf8");
const shell = readFileSync("static/js/focused-systems-shell.js", "utf8");

test("observability is a focused public systems destination", () => {
  assert.ok(page.includes('<link rel="canonical" href="https://atlas-systems.uk/systems/observability/">'));
  assert.ok(page.includes("What is being observed now?"));
  for (const section of ["Telemetry cockpit", "Observed services", "Recent failure feed", "Infrastructure and corpus state", "Raw public sources"]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
});

test("observability uses the governed estate header and stable first-paint fallback", () => {
  assert.match(page, /<header class="[^"]*\bfocus-hero\b[^"]*">/);
  assert.match(page, /<header class="[^"]*\batlas-composition--telemetry-lattice\b[^"]*">/);
  assert.ok(page.includes('/static/css/estate-search.css'));
  assert.ok(page.includes('/static/css/estate-shell.css?v=20260723-interface-v2'));
  assert.ok(page.includes('/static/js/focused-systems-shell.js?v=20260725-batch-h-fixes'));
  assert.ok(shell.includes('import "./estate-shell.js?v=20260723-interface-v2"'));
  assert.ok(shell.includes('import "./estate-search/global-search.js"'));
  assert.ok(css.includes('nav[aria-label="Primary navigation"]:not(.atlas-nav-shell)'));
  assert.ok(css.includes(".focus-main > header"));
});

test("observability reads only bounded public endpoints", () => {
  for (const endpoint of [
    "https://api.atlas-systems.uk/specular",
    "https://api.atlas-systems.uk/v1/registry",
    "https://api.atlas-systems.uk/v1/infra/status",
    "https://api.atlas-systems.uk/v1/rag/stats",
    "https://api.atlas-systems.uk/notify/recent",
  ]) {
    assert.ok(script.includes(endpoint), `missing ${endpoint}`);
  }
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.doesNotMatch(script, /private|secret|token/i);
});

test("observability preserves honest non-healthy states", () => {
  for (const state of ["stale", "empty", "unknown", "unavailable", "degraded", "failure"]) {
    assert.ok(script.includes(`\"${state}\"`), `missing ${state}`);
  }
  assert.ok(page.includes("Unknown is not healthy."));
  assert.ok(page.includes("Terms and IPs are not rendered."));
});

test("focused systems pages retain accessible interaction foundations", () => {
  assert.ok(css.includes("min-height: 44px"));
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes(":focus-visible"));
  assert.ok(page.includes('aria-live="polite"'));
  assert.ok(page.includes('<table class="focus-table">'));
});
