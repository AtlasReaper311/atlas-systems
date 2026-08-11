import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("static/css/estate-shell.css", "utf8");

test("MOB-005 includes the measured 768px viewport in the compact header contract", () => {
  assert.match(css, /grid-template-columns: minmax\(230px,1fr\) auto minmax\(230px,1fr\);/);
  assert.match(css, /@media \(max-width: 768px\) \{/);
  assert.doesNotMatch(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.atlas-nav-shell \.atlas-header__inner \{ width: min\(calc\(100% - 32px\), 1280px\); grid-template-columns: minmax\(0,1fr\) auto; gap: 12px; \}/);
  assert.match(css, /\.atlas-nav-shell \.atlas-header__nav \{ display: none; \}/);
  assert.match(css, /\.atlas-search-control \{ width: var\(--atlas-touch-min, 44px\); min-width: var\(--atlas-touch-min, 44px\); min-height: var\(--atlas-touch-min, 44px\) !important; padding: 0 !important; justify-content: center; \}/);
  assert.doesNotMatch(css, /\.atlas-search-control \{ width: 40px; min-width: 40px;/);
  assert.match(css, /\.atlas-search-control__label,\.atlas-search-control kbd \{ position: absolute;/);
  assert.match(css, /\.atlas-mobile-nav \{[\s\S]*display: block;/);
});
