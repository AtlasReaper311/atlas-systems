import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Conformance unavailable mode cannot masquerade as a clean zero report", () => {
  const html = read("lab/conformance/index.html");
  const source = read("lab/conformance/conformance-core.js");
  assert.match(html, /id="evidence-status"[^>]+data-evidence-mode="unknown"/);
  assert.match(source, /applyEvidenceMode\("unavailable"\)/);
  assert.match(source, /textContent = "Unavailable"/);
  assert.match(source, /repositories_scanned: null/);
  assert.match(source, /errors: null/);
  assert.match(source, /warnings: null/);
  assert.match(source, /unknown: null/);
  assert.match(source, /No zero-value result has been inferred/i);
  assert.doesNotMatch(source, /no report published yet/i);
});

test("Shape Detector browser fallback is persistently simulated and neutral", () => {
  const html = read("lab/anomaly/index.html");
  const source = read("lab/anomaly/anomaly-core.js");
  const css = read("lab/anomaly/anomaly.css");
  assert.match(html, /explicitly simulated browser fallback/);
  assert.match(source, /atlas-shape-detector-simulation\/v1/);
  assert.match(source, /applyEvidenceMode\("simulated"\)/);
  assert.match(source, /textContent = "Simulated"/);
  assert.match(source, /state-simulated/);
  assert.match(source, /setLineDash\?\.\(evidenceMode === "simulated" \? \[7, 6\] : \[\]\)/);
  assert.doesNotMatch(source, /labelled deterministic replay/i);
  assert.match(css, /data-evidence-mode="simulated"/);
});

test("Lab and Systems directory cards share live-and-simulated Shape Detector wording", () => {
  const source = read("static/js/card-signatures.js");
  assert.match(source, /SHAPE_DETECTOR_SELECTOR/);
  assert.match(source, /Current telemetry-shape analysis with an explicitly simulated browser fallback/);
  assert.match(source, /mode\.textContent = "Live and simulated"/);
  assert.match(source, /evidenceDirectoryMode = "live-simulated"/);
});

test("rendered interaction targets are measured at the accepted stable 44px minimum", () => {
  const contract = read("static/js/interaction-target-contract.js");
  const conformance = read("lab/conformance/conformance.css");
  const anomaly = read("lab/anomaly/anomaly.css");
  const symphony = read("lab/system-symphony/system-symphony-targets.css");
  const cards = read("static/js/card-signatures.js");

  assert.match(contract, /const TARGET_MINIMUM = 44/);
  assert.match(contract, /const STABILITY_DELAY_MS = 240/);
  assert.match(contract, /getBoundingClientRect/);
  assert.match(contract, /atlasTargetContract = "pending"/);
  assert.match(contract, /atlasTargetContract = "fail"/);
  assert.match(contract, /JSON\.stringify\(failures\)/);
  assert.match(contract, /await waitForPageLoad\(\)/);
  assert.match(contract, /console\.error/);

  for (const css of [conformance, anomaly, symphony]) {
    assert.match(css, /min-width: 44px/);
    assert.match(css, /min-height: 44px/);
    assert.match(css, /\.atlas-header__nav a/);
    assert.match(css, /\.atlas-header__actions a/);
    assert.match(css, /\.lab-context-nav a/);
    assert.match(css, /\.lab-tool-footer a/);
  }

  assert.match(symphony, /width: 44px/);
  assert.match(symphony, /height: 44px/);
  assert.match(cards, /system-symphony-targets\.css/);
  assert.match(cards, /interaction-target-contract\.js/);
});
