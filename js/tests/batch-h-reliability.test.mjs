import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("systems/reliability/index.html", "utf8");
const script = readFileSync("systems/reliability/reliability.js", "utf8");
const compatibility = readFileSync("lab/reliability/index.html", "utf8");
const shell = readFileSync("static/js/focused-systems-shell.js", "utf8");

test("reliability combines objectives, budgets, delivery, and bounded chaos", () => {
  assert.ok(page.includes('<link rel="canonical" href="https://atlas-systems.uk/systems/reliability/">'));
  for (const section of [
    "Reliability coverage",
    "Reliability objectives",
    "Error budgets and burn states",
    "DORA delivery metrics",
    "Latest failure evidence",
    "Inspect the contracts",
  ]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
});

test("reliability uses the governed estate header and an honest console link", () => {
  assert.match(page, /<header class="[^"]*\bfocus-hero\b[^"]*">/);
  assert.match(page, /<header class="[^"]*\batlas-composition--pulse-horizon\b[^"]*">/);
  assert.ok(page.includes('/static/css/estate-search.css'));
  assert.ok(page.includes('/static/css/estate-shell.css?v=20260723-interface-v2'));
  assert.ok(page.includes('/static/js/focused-systems-shell.js?v=20260725-batch-h-fixes'));
  assert.ok(shell.includes('import "./estate-shell.js?v=20260723-interface-v2"'));
  assert.ok(page.includes('href="/lab/console/"'));
  assert.ok(!page.includes('/lab/console/index.html'));
  assert.ok(!page.includes('#dora-metrics'));
});

test("reliability reads the existing public contracts without a new aggregator", () => {
  for (const endpoint of [
    "https://api.atlas-systems.uk/v1/reliability",
    "https://api.atlas-systems.uk/v1/reliability/objectives",
    "https://api.atlas-systems.uk/dora/metrics",
    "https://api.atlas-systems.uk/v1/evidence/chaos",
  ]) {
    assert.ok(script.includes(endpoint), `missing ${endpoint}`);
  }
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.doesNotMatch(script, /fetch\([^)]*report/i);
});

test("reliability retains every explicit evaluator state", () => {
  for (const state of [
    "objective_met",
    "budget_at_risk",
    "budget_exhausted",
    "insufficient_evidence",
    "stale_evidence",
    "unavailable_source",
    "malformed_evidence",
    "unmeasured",
  ]) {
    assert.ok(script.includes(`\"${state}\"`), `missing ${state}`);
  }
  assert.ok(page.includes("Unsupported percentiles are not invented."));
  assert.ok(page.includes("A simulated pass is not presented as production proof."));
});

test("the old Lab reliability route remains a noindex compatibility route", () => {
  assert.ok(compatibility.includes('<meta name="robots" content="noindex, follow">'));
  assert.ok(compatibility.includes('<link rel="canonical" href="https://atlas-systems.uk/systems/reliability/">'));
  assert.ok(compatibility.includes('window.location.replace("/systems/reliability/")'));
  assert.ok(compatibility.includes('href="/systems/reliability/"'));
});
