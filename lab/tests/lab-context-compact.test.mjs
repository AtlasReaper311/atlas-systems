import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const compact = fs.readFileSync("lab/shared/lab-context-compact.js", "utf8");
const styles = fs.readFileSync("lab/shared/lab-context-compact.css", "utf8");
const contract = fs.readFileSync("lab/shared/lab-shell-contract.js", "utf8");

test("the Lab landing page alone retains the complete directory rail", () => {
  assert.match(compact, /const LAB_HOME_ROUTE = "\/lab\/"/);
  assert.match(compact, /if \(pathname === LAB_HOME_ROUTE\)/);
  assert.match(compact, /installDirectoryMode\(context\)/);
  assert.match(compact, /dataset\.labContextMode = "directory"/);
  assert.match(compact, /classList\.add\("lab-context-nav--directory"\)/);
});

test("every individual Lab route receives compact current-location wayfinding", () => {
  assert.match(compact, /installCompactMode\(context, pathname\)/);
  assert.match(compact, /className = "lab-context-compact__crumbs"/);
  assert.match(compact, /home\.textContent = "Lab"/);
  assert.match(compact, /current\.setAttribute\("aria-current", "page"\)/);
  assert.match(compact, /summary\.textContent = "All Lab tools"/);
  assert.match(compact, /dataset\.labContextMode = "compact"/);
  assert.match(compact, /dataset\.currentLabRoute = descriptor\.label/);
});

test("the compact disclosure reuses the canonical grouped Lab inventory", () => {
  assert.match(compact, /LAB_ROUTE_GROUPS/);
  assert.match(compact, /SYSTEM_SYMPHONY_SCOPED_ROUTES/);
  assert.match(compact, /isCurrentLabRoute/);
  assert.match(compact, /routeGroup\.label\.toLowerCase\(\)/);
  assert.match(compact, /group\.setAttribute\("role", "group"\)/);
  assert.match(compact, /group\.setAttribute\("aria-labelledby", label\.id\)/);
  assert.doesNotMatch(compact, /const LAB_ROUTE_GROUPS/);

  for (const label of ["Experience", "Observe", "Verify", "Explore"]) {
    assert.match(shell, new RegExp(`label: "${label}"`));
  }
});

test("System Symphony keeps product navigation beneath the common compact Lab context", () => {
  assert.match(compact, /if \(isSystemSymphonyPath\(pathname\)\)/);
  assert.match(compact, /SYSTEM_SYMPHONY_SCOPED_ROUTES\.find/);
  assert.match(compact, /label: "System Symphony", href: "\/lab\/system-symphony\/"/);
  assert.match(shell, /installRouteEnhancements/);
  assert.match(shell, /system-symphony-navigation\.js/);
});

test("compact Lab navigation is keyboard-operable and closes predictably", () => {
  assert.match(compact, /event\.key !== "Escape"/);
  assert.match(compact, /details\.open = false/);
  assert.match(compact, /summary\.focus\(\{ preventScroll: true \}\)/);
  assert.match(compact, /!details\.contains\(target\)/);
  assert.match(compact, /new AbortController/);
  assert.match(compact, /pagehide/);
});

test("compact Lab navigation stays contained from 320px through desktop", () => {
  assert.match(styles, /min-width: 44px/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /outline: 2px solid var\(--accent\)/);
  assert.match(styles, /width: min\(760px, calc\(100vw - 32px\)\)/);
  assert.match(styles, /width: calc\(100vw - 24px\)/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns: 1fr/);
  assert.match(styles, /max-height: calc\(100svh - var\(--lab-shell-stack-height/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /text-overflow: ellipsis/);
  assert.doesNotMatch(styles, /display:\s*none[^}]*lab-context-compact__current/);
});

test("the rendered shell contract blocks a route that regresses to the wrong context mode", () => {
  assert.match(contract, /installCompactLabContext\(\)/);
  for (const rule of [
    "context-navigation-mode-present",
    "directory-navigation-home-only",
    "compact-navigation-individual-routes",
    "compact-tools-trigger-present",
    "compact-tools-trigger-visible",
  ]) {
    assert.match(contract, new RegExp(rule));
  }
  assert.match(contract, /context\?\.dataset\.labContextMode/);
  assert.match(contract, /\.lab-context-tools > summary/);
});
