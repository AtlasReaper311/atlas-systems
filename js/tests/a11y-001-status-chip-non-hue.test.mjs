import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("static/css/estate-shell.css", "utf8");
const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");

test("A11Y-001 keeps the narrow aggregate state visible without relying on hue", () => {
  assert.match(css, /@media \(max-width: 390px\) \{/);
  assert.match(
    css,
    /\.atlas-estate-status-label,#nav-build-status \{\s*position: static;\s*width: auto;\s*height: auto;\s*overflow: visible;\s*clip: auto;\s*clip-path: none;/,
  );
  assert.match(
    css,
    /\.atlas-estate-status,\.atlas-nav-shell \.nav-status \{[\s\S]*?min-height: var\(--atlas-touch-min, 44px\);/,
  );
  assert.doesNotMatch(
    css,
    /@media \(max-width: 390px\) \{[\s\S]*?\.atlas-estate-status-label,#nav-build-status \{[^}]*position: absolute;/,
  );
});

test("the aggregate chip continues to expose state text for every public state", () => {
  assert.match(shell, /chip\.append\(dot, label\)/);
  assert.match(shell, /label\.textContent = result\.label/);
  for (const label of ["Operational", "Degraded", "Unavailable", "Checking", "Unknown"]) {
    assert.ok(shell.includes(label), `missing aggregate status label: ${label}`);
  }
});
