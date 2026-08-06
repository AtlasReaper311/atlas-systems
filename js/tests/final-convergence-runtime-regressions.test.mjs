import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const footer = fs.readFileSync("static/js/phase-6-footer.js", "utf8");
const budgets = JSON.parse(
  fs.readFileSync("scripts/interface-evidence/browser-performance-budgets.json", "utf8"),
);

test("Bearing uses the compact shared profile before the external shell fallback", () => {
  assert.match(footer, /const COMPACT_LAB_PROFILE_SELECTOR\s*=\s*"main > \.bearing"/);
  const compactBranch = footer.indexOf("if(isCompactLabProfile())return installCompactLabShell()");
  const externalFallback = footer.indexOf("void import(LAB_SHELL_MODULE)");
  assert.ok(compactBranch >= 0, "compact Bearing profile must be present");
  assert.ok(externalFallback > compactBranch, "compact profile must run before the external shell fallback");
  assert.doesNotMatch(footer, /setTimeout\s*\(/);
  assert.match(footer, /function installBearingShell\(\) \{\s*return bootstrapLabShell\(\);\s*\}/);
});

test("compact Bearing avoids duplicate shell assets and installs synchronously", () => {
  assert.match(footer, /if\(!isCompactLabProfile\(\)\)ensureStylesheet\(FOOTER_STYLESHEET/);
  assert.match(footer, /function installCompactLabShell\(\)/);
  assert.match(footer, /style\.id="atlas-compact-lab-shell"/);
  assert.match(footer, /installCompactHeader\(path\)/);
  assert.match(footer, /installCompactContext\(header,path\)/);
  assert.match(footer, /installCompactMobile\(path\)/);
  assert.match(footer, /--lab-shell-stack-height/);
});

test("convergence stylesheet is injected without consuming another style resource", () => {
  assert.match(footer, /fetch\(href,\{credentials:"same-origin"\}\)/);
  assert.match(footer, /atlas-surface-convergence-inline/);
  assert.match(footer, /CONVERGENCE_RUNTIME_CSS/);
  assert.match(footer, /system-card\.directory-card \.card-route/);
  assert.match(footer, /white-space:normal/);
});

test("reduced-motion console headings are stabilised before shell auditing", () => {
  assert.match(footer, /function stabilizePrimaryHeading\(\)/);
  assert.match(footer, /main h1\.page-heading/);
  assert.match(footer, /heading\.style\.opacity="1"/);
  assert.match(footer, /heading\.style\.animation="none"/);
});

test("accepted Bearing browser caps remain unchanged", () => {
  assert.deepEqual(budgets.routes["/lab/bearing/"], {
    requestCount: 9,
    encodedBytes: 56320,
    decodedBytes: 56320,
    scriptCount: 2,
    styleCount: 5,
  });
  assert.deepEqual(budgets.scope.browsers, ["chrome", "firefox"]);
  assert.equal(budgets.status, "accepted");
});
