import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GLOBAL_ROUTES } from "../../static/js/estate-shell.js";

const shellCss = readFileSync("static/css/estate-shell.css", "utf8");
const interactionContract = readFileSync("static/js/interaction-target-contract.js", "utf8");
const labShell = readFileSync("lab/shared/shell.js", "utf8");
const landing = readFileSync("lab/index.html", "utf8");
const failureTrace = readFileSync("lab/failure-trace/index.html", "utf8");
const convergence = readFileSync("static/js/surface-convergence.js", "utf8");
const redirects = readFileSync("_redirects", "utf8");

test("the shared mobile shell owns five full-width equal navigation slots below 768px", () => {
  assert.match(shellCss, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(shellCss, /@media \(max-width: 768px\)/);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav\s*\{[\s\S]*?display: block;[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav \.atlas-mobile-nav__inner\s*\{[\s\S]*?width: 100%;[\s\S]*?grid-template-columns: repeat\(5,\s*minmax\(0,1fr\)\)/);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav \.atlas-mobile-nav__item\s*\{[\s\S]*?min-width: 0;[\s\S]*?min-height: 64px;/);
  assert.match(shellCss, /body\[data-atlas-bottom-nav="true"\]\s*\{[\s\S]*?padding-bottom: calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
  assert.deepEqual(GLOBAL_ROUTES.map(({ label }) => label), ["Work", "Writing", "Lab", "Systems", "About"]);
});

test("the shared shell keeps mobile navigation below 768px and desktop navigation at 768px", () => {
  assert.match(shellCss, /\.atlas-nav-shell \.atlas-header__nav\s*\{\s*display: none;\s*\}/);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav\s*\{[\s\S]*?position: fixed;/);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav \.atlas-mobile-nav__item\s*\{[\s\S]*?text-overflow: ellipsis/);
  assert.match(shellCss, /\.atlas-mobile-nav__item span\s*\{[\s\S]*?white-space: nowrap;/);
  assert.match(shellCss, /@media \(min-width: 768px\)\s*\{[\s\S]*?body\[data-atlas-bottom-nav="true"\]\s*\{ padding-bottom: 0 !important; \}/);
});

test("the mobile navigation remains bound to the declared 44px interaction target contract", () => {
  assert.match(interactionContract, /const TARGET_MINIMUM = 44/);
  assert.match(interactionContract, /\.atlas-mobile-nav a/);
  assert.match(shellCss, /\.atlas-mobile-nav\.atlas-bottom-nav \.atlas-mobile-nav__item\s*\{[\s\S]*?min-height: 64px;/);
});

test("tablet header links retain the declared interaction-target width", () => {
  assert.match(shellCss, /\.atlas-nav-shell \.atlas-header__nav a[\s\S]*?min-width: var\(--atlas-touch-min, 44px\)/);
});

test("the Lab landing source uses the canonical Failure Trace identity", () => {
  assert.match(landing, /Failure Trace/);
  assert.match(landing, /href="\/lab\/failure-trace\/">Failure Trace<\/a>/);
  assert.match(landing, /href="\/lab\/failure-trace\/">Enter Failure Trace<\/a>/);
  assert.match(landing, /href="\/lab\/failure-trace\/">Open the guided journey<\/a>/);
  assert.doesNotMatch(landing, /href="\/lab\/failure-laboratory\/"/);
  assert.doesNotMatch(landing, />Failure Laboratory(?:<|\.)/);
});

test("the shared Lab inventory exposes Failure Trace first in Verify and preserves current-route handling", () => {
  const verify = labShell.slice(labShell.indexOf('label: "Verify"'), labShell.indexOf('label: "Explore"'));
  assert.match(verify, /\{ label: "Failure Trace", href: "\/lab\/failure-trace\/" \}/);
  assert.ok(verify.indexOf('label: "Failure Trace"') < verify.indexOf('label: "Proof Chain"'));
  assert.doesNotMatch(verify, /failure-laboratory/);
  assert.match(labShell, /function isCurrentLabRoute\(route, pathname = currentPath\(\)\)/);
  assert.match(labShell, /inventoryComplete/);
  assert.match(failureTrace, /href="\/lab\/failure-trace\/" aria-current="page"/);
});

test("legacy Failure Laboratory handoffs remain compatibility-only", () => {
  assert.match(convergence, /const LEGACY_FAILURE_TRACE_ROUTE = "\/lab\/failure-laboratory\/"/);
  assert.match(convergence, /function normalizeFailureTraceHandoffs\(documentNode\)/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\s+\/lab\/failure-trace\/\s+301/);
  assert.doesNotMatch(labShell, /href: "\/lab\/failure-laboratory\/"/);
});
