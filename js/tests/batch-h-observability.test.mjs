import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("systems/observability/index.html", "utf8");
const script = readFileSync("systems/observability/observability.js", "utf8");
const css = readFileSync("static/css/systems-focus.css", "utf8");

test("observability is a focused public systems destination", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/systems\/observability\/">/);
  assert.match(page, /What is being observed now\?/);
  for (const section of ["Telemetry cockpit", "Observed services", "Recent failure feed", "Infrastructure and corpus state", "Raw public sources"]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
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
  assert.match(page, /Unknown is not healthy\./);
  assert.match(page, /Terms and IPs are not rendered\./);
});

test("focused systems pages retain accessible interaction foundations", () => {
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /<table class="focus-table">/);
});
