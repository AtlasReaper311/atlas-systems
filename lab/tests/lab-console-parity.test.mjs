import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync("docs/PHASE-11-LAB-CONSOLE-PARITY.md", "utf8");
const headers = readFileSync("_headers", "utf8");
const labDirectory = readFileSync("lab/index.html", "utf8");
const proofChain = readFileSync("lab/proof-chain/index.html", "utf8");
const conformance = readFileSync("lab/conformance/index.html", "utf8");
const shapeDetector = readFileSync("lab/anomaly/index.html", "utf8");

function tableRows(markdown) {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.includes("---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

test("Phase 11 console parity inventory covers every required migration field", () => {
  const [header, ...rows] = tableRows(inventory);
  assert.deepEqual(header, [
    "Panel",
    "Current function",
    "Current data source",
    "Focused route",
    "Missing parity",
    "State",
    "Migration or retirement prerequisite",
    "Evidence needed before removal",
  ]);
  assert.equal(rows.length, 11);
  for (const row of rows) {
    assert.equal(row.length, header.length);
    for (const cell of row) assert.ok(cell.length > 0);
  }
});

test("console inventory preserves the noindex route until parity evidence exists", () => {
  assert.match(inventory, /does not authorize a redirect/);
  assert.match(inventory, /Retirement state: not eligible for removal/);
  assert.match(inventory, /protected by the `_headers` noindex rule/);
  assert.match(headers, /\/lab\/console\/\*[\s\S]*X-Robots-Tag: noindex, follow/);
  assert.match(labDirectory, /href="\/lab\/console\/"/);
});

test("console inventory names focused routes and still-unique panels", () => {
  for (const expected of [
    "System map",
    "Incident console / Blackbox",
    "Failure log",
    "Activity heatmap",
    "Pipeline status grid",
    "Live estate section",
    "DORA metrics",
    "API surface summary",
    "Operations rail",
  ]) {
    assert.match(inventory, new RegExp(expected.replaceAll("/", "\\/")));
  }
  assert.match(inventory, /\/lab\/blackbox\//);
  assert.match(inventory, /\/lab\/system-map\//);
  assert.match(inventory, /\/lab\/conformance\//);
  assert.match(inventory, /Still unique/);
  assert.match(inventory, /Partially duplicated/);
});

test("evidence tool routes use current taxonomy and escape paths", () => {
  assert.match(proofChain, /href="\/lab\/system-map\/">System Map<\/a>/);
  assert.match(proofChain, /href="\/systems\/reliability\/">Reliability<\/a>/);
  assert.match(proofChain, /aria-describedby="proof-filter-help"/);
  assert.match(conformance, /href="\/lab\/conformance\/" aria-current="page">Estate Conformance<\/a>/);
  assert.match(conformance, /href="\/lab\/anomaly\/">Shape Detector<\/a>/);
  assert.match(conformance, /aria-controls="repo-table"/);
  assert.match(shapeDetector, /<title>Shape Detector \/\/ Atlas Systems<\/title>/);
  assert.match(shapeDetector, /LAB \/ EXPLORE \/ TELEMETRY ANALYSIS/);
  assert.match(shapeDetector, /explicitly simulated browser fallback/);
  assert.match(shapeDetector, /data-evidence-mode="unknown" data-runtime-state="checking" aria-live="polite">Unknown/);
});
