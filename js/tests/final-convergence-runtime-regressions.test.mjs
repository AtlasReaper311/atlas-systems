import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const footer = fs.readFileSync("static/js/phase-6-footer.js", "utf8");
const compact = fs.readFileSync("lab/shared/compact-bearing-shell.js", "utf8");
const budgets = JSON.parse(
  fs.readFileSync("scripts/interface-evidence/browser-performance-budgets.json", "utf8"),
);

test("Bearing selects the route-scoped shared shell before the normal Lab fallback", () => {
  assert.match(footer, /COMPACT_BEARING_SHELL_MODULE/);
  const compactBranch = footer.indexOf('document.querySelector("#lattice")');
  const normalFallback = footer.indexOf("void import(LAB_SHELL_MODULE)");
  assert.ok(compactBranch >= 0, "compact Bearing branch must be present");
  assert.ok(normalFallback > compactBranch, "compact branch must precede the normal shell fallback");
  assert.match(footer, /import\(COMPACT_BEARING_SHELL_MODULE\)/);
  assert.doesNotMatch(footer, /setTimeout\s*\(/);
  assert.match(footer, /function installBearingShell\(\) \{\s*return bootstrapLabShell\(\);\s*\}/);
});

test("compact Bearing installs the governed shell without initial asset fan-out", () => {
  assert.match(compact, /function installCompactBearingShell\(\)/);
  assert.match(compact, /atlas-header/);
  assert.match(compact, /lab-context-nav/);
  assert.match(compact, /atlas-mobile-nav/);
  assert.match(compact, /labShellContract:"pass"/);
  assert.match(compact, /import\("\/static\/js\/estate-search\/global-search\.js"\)/);
  assert.doesNotMatch(compact, /createElement\("link"\)/);
  assert.doesNotMatch(compact, /setTimeout\s*\(/);
});

test("Bearing light mode keeps accessible annotations and code tokens", () => {
  assert.match(compact, /--load:#8a4c00/);
  assert.match(compact, /--ink-faint:#5b5d60/);
  assert.match(compact, /\.step \.n,pre\.snip \.a\{color:#8a4c00\}/);
  assert.match(compact, /\.step p,pre\.snip \.c\{color:#5b5d60\}/);
});

test("convergence CSS is injected in one request with card geometry corrections", () => {
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
  assert.doesNotMatch(footer, /display:block!important;width:calc/);
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

test("accepted browser caps remain unchanged and runtime files stay bounded", () => {
  assert.deepEqual(budgets.routes["/lab/bearing/"], {
    requestCount: 9,
    encodedBytes: 56320,
    decodedBytes: 56320,
    scriptCount: 2,
    styleCount: 5,
  });
  assert.ok(Buffer.byteLength(footer) <= 9000, "shared footer runtime exceeds its reviewed headroom");
  assert.ok(Buffer.byteLength(compact) <= 10000, "compact Bearing shell exceeds its reviewed headroom");
  assert.equal(budgets.status, "accepted");
});
