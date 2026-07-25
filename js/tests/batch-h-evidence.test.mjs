import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("systems/evidence/index.html", "utf8");
const script = readFileSync("systems/evidence/evidence.js", "utf8");

test("evidence is a focused provenance destination", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/systems\/evidence\/">/);
  for (const section of [
    "Evidence summary",
    "Ninety days of public commit evidence",
    "Latest bounded deployment record",
    "Recent CI and deployment events",
    "Published assurance records",
    "Freshness and provenance",
  ]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
});

test("evidence consumes fixed public records", () => {
  for (const endpoint of [
    "https://api.atlas-systems.uk/pulse/heatmap",
    "https://api.atlas-systems.uk/deploy-watch/latest",
    "https://api.atlas-systems.uk/notify/recent",
    "https://api.atlas-systems.uk/v1/evidence",
  ]) {
    assert.ok(script.includes(endpoint), `missing ${endpoint}`);
  }
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.doesNotMatch(script, /Authorization|Bearer|secret|token/i);
});

test("the activity heatmap has a complete non-visual alternative", () => {
  assert.match(page, /id="activity-heatmap"[^>]*role="img"/);
  assert.match(page, /id="activity-rows"/);
  assert.match(page, /complete keyboard and screen-reader alternative/);
  assert.match(script, /cell\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(script, /rows\.appendChild\(row\)/);
});

test("evidence keeps freshness and failure states independent", () => {
  for (const state of ["stale", "empty", "unknown", "unavailable", "warning", "failure", "healthy"]) {
    assert.ok(script.includes(`\"${state}\"`), `missing ${state}`);
  }
  assert.match(page, /One fresh source cannot wash a stale or unavailable source green\./);
  assert.match(page, /Empty evidence is not a successful pipeline\./);
});
