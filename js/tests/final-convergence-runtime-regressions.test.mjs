import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const footer = fs.readFileSync("static/js/phase-6-footer.js", "utf8");
const bearing = fs.readFileSync("lab/bearing/index.html", "utf8");
const budgets = JSON.parse(
  fs.readFileSync("scripts/interface-evidence/browser-performance-budgets.json", "utf8"),
);

test("Bearing uses the shared Lab shell entrypoint instead of the compact fork", () => {
  assert.match(bearing, /\/lab\/shared\/shell\.js\?v=20260807-bearing-shell/);
  assert.match(bearing, /\/static\/js\/phase-6-footer\.js\?v=20260807-bearing-shell/);
  assert.doesNotMatch(footer, /COMPACT_BEARING_SHELL_MODULE/);
  assert.doesNotMatch(footer, /compact-bearing-shell\.js/);
  assert.match(footer, /void import\(LAB_SHELL_MODULE\)/);
  assert.match(footer, /function installBearingShell\(\) \{\s*return bootstrapLabShell\(\);\s*\}/);
  assert.doesNotMatch(footer, /setTimeout\s*\(/);
});

test("Bearing keeps footer accessibility CSS and surface convergence on the shared path", () => {
  assert.match(footer, /ensureStylesheet\(FOOTER_STYLESHEET/);
  assert.doesNotMatch(footer, /if\(!bearing\)ensureStylesheet/);
  assert.doesNotMatch(footer, /isSurfaceConvergencePath\(path\)\|\|document\.querySelector\("#lattice"\)/);
  assert.match(footer, /if\(!isSurfaceConvergencePath\(path\)\)return null/);
  assert.match(footer, /fetch\(SURFACE_CONVERGENCE_STYLESHEET/);
  assert.match(footer, /atlas-surface-convergence-inline/);
  assert.match(footer, /CONVERGENCE_FIXES/);
  assert.match(footer, /system-card\.directory-card \.card-route/);
  assert.match(footer, /white-space:normal!important/);
  assert.match(footer, /width:fit-content!important/);
  assert.match(
    footer,
    /max-width:calc\(100% - var\(--card-signature-directory-width\) - var\(--card-signature-directory-gap\)\)!important/,
  );
  assert.match(footer, /directory-card--wide\{--card-signature-directory-width:190px\}/);
  assert.match(footer, /max-width:620px/);
  assert.match(footer, /function installBearingMobileWrap\(\)/);
  assert.match(footer, /pre\.snip\{overflow-x:visible;overflow-wrap:anywhere;white-space:pre-wrap\}/);
});

test("reduced-motion console headings are stabilised before shell auditing", () => {
  assert.match(footer, /main h1\.page-heading/);
  assert.match(footer, /opacity:"1"/);
  assert.match(footer, /animation:"none"/);
});

test("accepted browser caps remain unchanged for non-Bearing routes and Bearing tracks the shared shell", () => {
  assert.deepEqual(budgets.routes["/lab/bearing/"], {
    requestCount: 34,
    encodedBytes: 340992,
    decodedBytes: 360448,
    scriptCount: 14,
    styleCount: 14,
  });
  assert.ok(Buffer.byteLength(footer) <= 9000, "shared footer runtime exceeds its reviewed headroom");
  assert.equal(budgets.status, "accepted");
});
