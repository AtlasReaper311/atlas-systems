import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shellCss = fs.readFileSync("static/css/estate-shell.css", "utf8");
const baseline = JSON.parse(
  fs.readFileSync("scripts/interface-evidence/reporting-baseline.json", "utf8"),
);

test("Phase 8 keeps shared header controls at the governed touch minimum", () => {
  assert.match(shellCss, /\.atlas-nav-shell \.atlas-wordmark \{[\s\S]*?min-height: var\(--atlas-touch-min, 44px\)/);
  assert.match(shellCss, /\.atlas-nav-shell \.atlas-header__nav a \{[\s\S]*?min-width: var\(--atlas-touch-min, 44px\)[\s\S]*?min-height: var\(--atlas-touch-min, 44px\)/);
  assert.match(shellCss, /\.atlas-estate-status,[\s\S]*?min-height: var\(--atlas-touch-min, 44px\)/);
  assert.match(shellCss, /\.atlas-search-control \{[\s\S]*?min-height: var\(--atlas-touch-min, 44px\)/);
  assert.doesNotMatch(shellCss, /\.atlas-estate-status,[\s\S]{0,180}?min-height:\s*32px/);
});

test("Phase 8 compacts the existing tablet header without adding a breakpoint token", () => {
  assert.match(shellCss, /@media \(min-width: 768px\) and \(max-width: 900px\)/);
  assert.match(shellCss, /grid-template-columns: minmax\(0,1fr\) auto var\(--atlas-touch-min, 44px\)/);
  assert.match(shellCss, /\.atlas-search-control__label,[\s\S]*?clip: rect\(0 0 0 0\)/);
});

test("Phase 8 removes measured collisions and route overflow sources", () => {
  assert.match(shellCss, /body\[data-atlas-bottom-nav="true"\] \.term-chip[\s\S]*?bottom: calc\(64px \+ env\(safe-area-inset-bottom\) \+ 12px\)/);
  assert.match(shellCss, /\.word-bank \.word-chip \{ opacity: 1 !important; \}/);
  assert.match(shellCss, /@media \(max-width: 860px\)[\s\S]*?\.drift-page \.drift-title::before \{ display: none; \}/);
  assert.match(shellCss, /@media \(max-width: 820px\)[\s\S]*?\.almost-page \.almost-afterword[\s\S]*?grid-template-columns: 1fr/);
});

test("resolved accessibility and overflow signatures are no longer accepted", () => {
  assert.equal(baseline.source.reviewed_finding_count, 36);
  assert.match(baseline.source.phase_8_note, /recurrence is blocking/);
  assert.equal(baseline.families.length, 6);
  assert.ok(baseline.families.every((family) => family.kind === "console"));
  assert.deepEqual(
    [...new Set(baseline.families.map((family) => family.route))].sort(),
    [
      "lab-anomaly",
      "lab-conformance",
      "lab-drift",
      "lab-signal",
      "writing-sonin-generative-system",
    ],
  );
});
