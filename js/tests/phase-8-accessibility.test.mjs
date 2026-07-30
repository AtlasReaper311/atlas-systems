import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("static/css/estate-shell.css", "utf8");
const baseline = JSON.parse(
  fs.readFileSync("scripts/interface-evidence/reporting-baseline.json", "utf8"),
);

test("Phase 8 keeps corrected controls and dense regions accessible", () => {
  assert.match(css, /\.word-chip \{ color: var\(--text-dim, #aaa9a0\); \}/);
  assert.match(css, /\.almost-prose \{ min-width: 0; max-width: 100%; overflow-wrap: anywhere; \}/);
  assert.match(css, /\.snip \{ max-width: 100%; overflow-x: auto;/);
  assert.match(css, /\.atlas-mobile-nav__item \{ min-width: 44px; min-height: 64px;/);
  assert.match(css, /\.bearing \.tag,/);
});

test("only reviewed diagnostic console families remain reporting-only", () => {
  assert.ok(baseline.families.length > 0);
  assert.ok(baseline.families.every((family) => family.kind === "console"));
  assert.ok(!baseline.families.some((family) => family.id === "target-size"));
  assert.ok(!baseline.families.some((family) => family.id === "color-contrast"));
  assert.ok(!baseline.families.some((family) => family.kind === "horizontal-overflow"));
  assert.ok(!baseline.families.some((family) => family.id === "scrollable-region-focusable"));
});
