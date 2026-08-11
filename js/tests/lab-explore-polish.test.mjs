import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const systemMapCss = fs.readFileSync("lab/system-map.css", "utf8");
const systemMapHtml = fs.readFileSync("lab/system-map/index.html", "utf8");
const driftHtml = fs.readFileSync("lab/drift/index.html", "utf8");
const driftCss = fs.readFileSync("lab/drift/drift.css", "utf8");
const speculumCss = fs.readFileSync("lab/speculum/speculum-investigation-v4.css", "utf8");
const speculumEngine = fs.readFileSync("lab/speculum/engine.js", "utf8");
const anomalyHtml = fs.readFileSync("lab/anomaly/index.html", "utf8");
const anomalyCore = fs.readFileSync("lab/anomaly/anomaly-core.js", "utf8");
const bearingHtml = fs.readFileSync("lab/bearing/index.html", "utf8");

test("System Map legend colours resolve outside Operations smap-section", () => {
  assert.match(systemMapCss, /\.smap-section,\s*\n\.map-shell,\s*\n\.smap-legend \{/);
  assert.match(systemMapCss, /--map-role-worker:\s*#4ade80/);
  assert.match(systemMapHtml, /Public topology,\s*<br>without invented edges\./);
  assert.match(systemMapHtml, /system-map\.css\?v=20260811-night-city-frame/);
});

test("Drift keeps the title above the canvas and keys the field plus essay", () => {
  assert.match(driftHtml, /<header class="drift-title">[\s\S]*?<div class="drift-field">/);
  assert.match(driftHtml, /drift-legend-wrap--field/);
  assert.match(driftHtml, /drift-legend--field/);
  assert.match(driftHtml, /drift-legend--essay/);
  assert.match(driftCss, /\.drift-title \{\s*\n\s*position:\s*static/);
  assert.doesNotMatch(driftCss, /\.drift-title::before/);
});

test("Speculum node roles carry distinct colours in legend and engine", () => {
  assert.match(speculumCss, /--role-product:\s*#f5a623/);
  assert.match(speculumCss, /--role-observer:\s*#48b9dc/);
  assert.match(speculumCss, /\.node-mark\.is-service/);
  assert.match(speculumEngine, /role:\s*\{/);
  assert.match(speculumEngine, /observer:\s*'72,185,220'/);
  assert.match(speculumEngine, /function roleRGB\(kind\)/);
});

test("Shape Detector presents as an Explore instrument with timed evidence fallback", () => {
  assert.match(anomalyHtml, /class="shape-page"/);
  assert.match(anomalyHtml, /id="shape-title"/);
  assert.match(anomalyHtml, /LAB \/ EXPLORE \/ TELEMETRY ANALYSIS/);
  assert.match(anomalyHtml, /data-evidence-mode="unknown" data-runtime-state="checking" aria-live="polite">Unknown/);
  assert.doesNotMatch(anomalyHtml, /nav-links/);
  assert.match(anomalyCore, /AbortController/);
  assert.match(anomalyCore, /4500/);
  assert.match(anomalyCore, /applyEvidenceMode\("simulated"\)/);
});

test("Bearing keeps a full-bleed lattice and exposes a strut colour key", () => {
  assert.match(bearingHtml, /\.bearing \{[\s\S]*height:\s*100svh/);
  assert.match(bearingHtml, /bearing-key/);
  assert.match(bearingHtml, /bearing-key-load/);
  assert.match(bearingHtml, /bearing-key-crit/);
  assert.match(bearingHtml, /bearing-key-heal/);
});
