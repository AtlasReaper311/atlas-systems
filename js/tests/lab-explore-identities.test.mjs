import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shared = fs.readFileSync("lab/shared/explore-identities.css", "utf8");
const lab = fs.readFileSync("lab/index.html", "utf8");
const cards = fs.readFileSync("static/css/v2-directory-pages.css", "utf8");
const speculumHtml = fs.readFileSync("lab/speculum/index.html", "utf8");
const speculumId = fs.readFileSync("lab/speculum/speculum-identity.css", "utf8");
const almostHtml = fs.readFileSync("lab/almost/index.html", "utf8");
const almostCss = fs.readFileSync("lab/almost/almost.css", "utf8");
const driftHtml = fs.readFileSync("lab/drift/index.html", "utf8");
const driftCss = fs.readFileSync("lab/drift/drift.css", "utf8");
const shapeHtml = fs.readFileSync("lab/anomaly/index.html", "utf8");
const shapeCss = fs.readFileSync("lab/anomaly/anomaly.css", "utf8");
const bearingHtml = fs.readFileSync("lab/bearing/index.html", "utf8");
const systemMapCss = fs.readFileSync("lab/system-map.css", "utf8");
const convergence = fs.readFileSync("static/js/surface-convergence.js", "utf8");

test("Explore identity tokens define distinct chroma for every experiment", () => {
  assert.match(shared, /--explore-almost:\s*#f5a623/);
  assert.match(shared, /--explore-drift:\s*#4ade80/);
  assert.match(shared, /--explore-speculum:\s*#7aa2ff/);
  assert.match(shared, /--explore-shape:\s*#48b9dc/);
  assert.match(shared, /@keyframes explore-stage-in/);
  assert.match(shared, /\.explore-stage-enter/);
  assert.match(shared, /html:has\(body\.almost-page\)/);
  assert.match(shared, /--explore-ground:\s*#07070b/);
});

test("Lab Explore cards carry per-tool chroma hooks", () => {
  assert.match(lab, /data-explore="speculum"/);
  assert.match(lab, /data-explore="almost"/);
  assert.match(lab, /data-explore="drift"/);
  assert.match(lab, /data-explore="bearing"/);
  assert.match(lab, /data-explore="shape"/);
  assert.match(lab, /v2-directory-pages\.css\?v=20260811-explore-chroma/);
  assert.match(cards, /\[data-explore="speculum"\]/);
  assert.match(cards, /\[data-explore="shape"\]/);
});

test("Speculum presents as a compact HUD attention flagship", () => {
  assert.match(speculumHtml, /class="speculum-page"/);
  assert.match(speculumHtml, /Speculum<span>\.<\/span>/);
  assert.match(speculumHtml, /speculum-identity\.css\?v=20260811-amber-stop/);
  assert.match(speculumHtml, /surface-convergence\.css\?v=20260811-explore-amber/);
  assert.match(speculumHtml, /explore-identities\.css\?v=20260811-continuity/);
  assert.match(speculumHtml, /LAB \/ EXPLORE \/ SYSTEMS ARTWORK/);
  assert.match(speculumHtml, /explore-stage-enter/);
  assert.match(speculumId, /\.control \.hint/);
  assert.match(speculumId, /display:\s*none/);
  assert.match(speculumId, /h1 span \{ color: #f5a623; \}/);
  assert.match(speculumId, /--explore-chroma:\s*var\(--explore-speculum\)/);
});

test("Drift and Shape carry cinematic stage identities", () => {
  assert.match(driftCss, /--drift-held:\s*var\(--explore-drift/);
  assert.match(driftCss, /lab-shell-stack-height/);
  assert.match(driftCss, /drift-swatch--held/);
  assert.match(driftCss, /:focus-visible/);
  assert.match(driftHtml, /explore-stage-enter/);
  assert.match(driftHtml, /LAB \/ EXPLORE \/ CONFORMANCE SIMULATION/);
  assert.match(driftHtml, /drift-swatch--held/);
  assert.doesNotMatch(driftHtml, /style="background:#4ade80"/);
  assert.match(shapeHtml, /Shape Detector for trajectory bends/);
  assert.match(shapeHtml, /<title>Shape\. \/\/ Atlas Systems<\/title>/);
  assert.match(shapeHtml, /anomaly\.css\?v=20260811-continuity/);
  assert.match(shapeHtml, /explore-stage-enter/);
  assert.match(shapeHtml, /surface-convergence\.css\?v=20260811-explore-amber/);
  assert.match(shapeCss, /\.shape-title h1 span \{ color: #f5a623; \}/);
  assert.match(shapeCss, /button:focus-visible/);
  assert.match(shapeCss, /select:focus-visible/);
});

test("Almost avoids pre-shell padding jump and shares enter motion", () => {
  assert.match(almostHtml, /explore-stage-enter/);
  assert.match(almostHtml, /LAB \/ EXPLORE \/ LOCAL PROCESS/);
  assert.match(almostHtml, /almost\.css\?v=20260811-continuity/);
  assert.doesNotMatch(almostCss, /padding:\s*122px/);
  assert.doesNotMatch(almostCss, /position:\s*fixed/);
  assert.match(almostCss, /lab-shell-header-height/);
});

test("Bearing stays forced dark and System Map gets night-city atmosphere", () => {
  assert.match(bearingHtml, /data-theme="dark"/);
  assert.match(bearingHtml, /class="bearing-page"/);
  assert.match(bearingHtml, /bearing explore-stage-enter/);
  assert.match(bearingHtml, /LAB(?:\s|&nbsp;)+\/(?:\s|&nbsp;)+EXPLORE(?:\s|&nbsp;)+\/(?:\s|&nbsp;)+STRUCTURAL(?:\s|&nbsp;)+SIMULATION/);
  assert.match(bearingHtml, /Nothing falls/);
  assert.doesNotMatch(bearingHtml, /Failure finds a path/);
  assert.doesNotMatch(bearingHtml, /@media \(prefers-color-scheme: light\)/);
  assert.match(systemMapCss, /Night-city frame/);
  assert.match(systemMapCss, /\.map-shell::before/);
  assert.match(systemMapCss, /\.map-shell \.smap-host/);
});

test("Explore kickers match surface-convergence shell eyebrows", () => {
  assert.match(convergence, /eyebrow: "LAB \/ EXPLORE \/ LOCAL PROCESS"/);
  assert.match(convergence, /eyebrow: "LAB \/ EXPLORE \/ CONFORMANCE SIMULATION"/);
  assert.match(convergence, /eyebrow: "LAB \/ EXPLORE \/ TELEMETRY ANALYSIS"/);
  assert.match(convergence, /eyebrow: "LAB \/ EXPLORE \/ SYSTEMS ARTWORK"/);
  assert.match(convergence, /eyebrow: "LAB \/ EXPLORE \/ STRUCTURAL SIMULATION"/);
});
