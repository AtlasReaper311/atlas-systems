import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shellCss = fs.readFileSync("static/css/estate-shell.css", "utf8");
const estateShell = fs.readFileSync("static/js/estate-shell.js", "utf8");
const labLanding = fs.readFileSync("lab/index.html", "utf8");
const labShell = fs.readFileSync("lab/shared/shell.js", "utf8");
const failureTrace = fs.readFileSync("lab/failure-trace/index.html", "utf8");
const legacyFailureTrace = fs.readFileSync("lab/failure-laboratory/index.html", "utf8");
const convergence = fs.readFileSync("static/js/surface-convergence.js", "utf8");
const redirects = fs.readFileSync("_redirects", "utf8");

test("the shared mobile shell owns one five-column contract below 768px", () => {
  assert.match(shellCss, /@media \(max-width: 767px\) \{/);
  assert.doesNotMatch(shellCss, /@media \(max-width: 768px\)/);
  assert.match(shellCss, /\.atlas-mobile-nav\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*auto 0 0;[^}]*width:\s*100%;/s);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav\s*\{[^}]*display:\s*block;[^}]*grid-template-columns:\s*none;/s);
  assert.match(shellCss, /\.atlas-mobile-nav__inner\s*\{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/s);
  assert.match(shellCss, /\.atlas-mobile-nav__item\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*64px;[^}]*text-align:\s*center;/s);
  assert.match(shellCss, /\.atlas-mobile-nav__item span\s*\{[^}]*max-width:\s*100%;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
  assert.match(shellCss, /\.atlas-nav-shell \.atlas-header__nav a\s*\{[^}]*min-width:\s*var\(--atlas-touch-min, 44px\);[^}]*min-height:\s*var\(--atlas-touch-min, 44px\);/s);
  assert.match(shellCss, /body\[data-atlas-bottom-nav="true"\]\s*\{\s*padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
});

test("the global destinations remain the five governed mobile targets", () => {
  for (const [label, href] of [
    ["Work", "/work/"],
    ["Writing", "/writing/"],
    ["Lab", "/lab/"],
    ["Systems", "/systems/"],
    ["About", "/about/"],
  ]) {
    assert.match(estateShell, new RegExp(`label: "${label}", href: "${href.replaceAll("/", "\\/")}"`));
  }
  assert.match(fs.readFileSync("static/js/interaction-target-contract.js", "utf8"), /const TARGET_MINIMUM = 44/);
});

test("the Lab landing source presents only canonical Failure Trace links", () => {
  assert.match(labLanding, /Failure Trace/);
  assert.match(labLanding, /href="\/lab\/failure-trace\/">Enter Failure Trace<\/a>/);
  assert.match(labLanding, /href="\/lab\/failure-trace\/">Open the guided journey<\/a>/);
  assert.doesNotMatch(labLanding, /href="\/lab\/failure-laboratory\/"/);
  assert.doesNotMatch(labLanding, />Failure Laboratory(?:\.|<)/);
  assert.doesNotMatch(labLanding, /bounded Failure Laboratory journey/);
});

test("the shared Verify inventory and Failure Trace current route stay canonical", () => {
  const verify = labShell.slice(labShell.indexOf('label: "Verify"'), labShell.indexOf('label: "Explore"'));
  assert.match(verify, /label: "Failure Trace", href: "\/lab\/failure-trace\/"/);
  assert.doesNotMatch(verify, /failure-laboratory/);
  const failureVerify = failureTrace.slice(
    failureTrace.indexOf('data-lab-context-group="verify"'),
    failureTrace.indexOf('data-lab-context-group="explore"'),
  );
  assert.equal((failureVerify.match(/href="\/lab\/failure-trace\/"/g) || []).length, 1);
  assert.match(failureVerify, /href="\/lab\/failure-trace\/" aria-current="page">Failure Trace<\/a>/);
  assert.match(convergence, /LEGACY_FAILURE_TRACE_ROUTE/);
  assert.match(legacyFailureTrace, /location\.replace\("\/lab\/failure-trace\//);
  assert.match(redirects, /\/lab\/failure-laboratory\/\s+\/lab\/failure-trace\/\s+301/);
});
