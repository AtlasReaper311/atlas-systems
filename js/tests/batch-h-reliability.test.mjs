import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("systems/reliability/index.html", "utf8");
const script = readFileSync("systems/reliability/reliability.js", "utf8");
const compatibility = readFileSync("lab/reliability/index.html", "utf8");

test("reliability combines objectives, budgets, delivery, and bounded chaos", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/systems\/reliability\/">/);
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
  assert.match(page, /Unsupported percentiles are not invented\./);
  assert.match(page, /A simulated pass is not presented as production proof\./);
});

test("the old Lab reliability route remains a noindex compatibility route", () => {
  assert.match(compatibility, /<meta name="robots" content="noindex, follow">/);
  assert.match(compatibility, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/systems\/reliability\/">/);
  assert.match(compatibility, /window\.location\.replace\("\/systems\/reliability\/"\)/);
  assert.match(compatibility, /href="\/systems\/reliability\/"/);
});
