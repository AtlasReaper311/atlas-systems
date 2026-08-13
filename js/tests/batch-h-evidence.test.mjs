import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("systems/evidence/index.html", "utf8");
const script = readFileSync("systems/evidence/evidence.js", "utf8");
const shell = readFileSync("static/js/focused-systems-shell.js", "utf8");

test("evidence is a focused provenance destination", () => {
  assert.ok(page.includes('<link rel="canonical" href="https://atlas-systems.uk/systems/evidence/">'));
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

test("evidence uses the governed estate header without inline layout overrides", () => {
  assert.match(page, /<header class="[^"]*\bfocus-hero\b[^"]*">/);
  assert.match(page, /<header class="[^"]*\batlas-composition--proof-trace\b[^"]*">/);
  assert.ok(page.includes('/static/css/estate-search.css'));
  assert.ok(page.includes('/static/css/estate-shell.css?v=20260723-interface-v2'));
  assert.ok(page.includes('/static/js/focused-systems-shell.js?v=20260725-batch-h-fixes'));
  assert.ok(shell.includes('import "./estate-search/global-search.js"'));
  assert.ok(page.includes('class="focus-rail focus-rail-spaced"'));
  assert.ok(!page.includes('style="margin-top:1.5rem"'));
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
  assert.ok(page.includes('id="activity-heatmap" class="focus-heatmap" role="img"'));
  assert.ok(page.includes('id="activity-rows"'));
  assert.ok(page.includes("complete keyboard and screen-reader alternative"));
  assert.ok(script.includes('document.createElement("span")'));
  assert.ok(script.includes('cell.className = "focus-heatmap-cell"'));
  assert.ok(script.includes('cell.setAttribute("aria-hidden", "true")'));
  assert.ok(script.includes("rows.appendChild(row)"));
  assert.ok(!script.includes('document.createElement("button")'));
});

test("evidence keeps freshness and failure states independent", () => {
  for (const state of ["stale", "empty", "unknown", "unavailable", "warning", "failure", "healthy"]) {
    assert.ok(script.includes(`\"${state}\"`), `missing ${state}`);
  }
  assert.ok(page.includes("One fresh source cannot wash a stale or unavailable source green."));
  assert.ok(page.includes("Empty evidence is not a successful pipeline."));
});

test("evidence pipeline list stays capped to the newest events", () => {
  assert.match(script, /const PIPELINE_VISIBLE_LIMIT = 6/);
  assert.match(script, /pipelineEvents\.slice\(0,\s*PIPELINE_VISIBLE_LIMIT\)/);
  assert.match(script, /Newest \$\{events\.length\} of \$\{pipelineEvents\.length\} pipeline events/);
});
