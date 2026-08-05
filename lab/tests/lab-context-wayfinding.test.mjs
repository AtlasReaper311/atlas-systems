import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const styles = fs.readFileSync("lab/shared/lab-context-navigation.css", "utf8");

test("Lab context navigation follows the accepted purpose taxonomy", () => {
  for (const label of ["Experience", "Observe", "Verify", "Explore"]) {
    assert.match(shell, new RegExp(`label: "${label}"`));
  }
  const labGroupsStart = shell.indexOf("const LAB_ROUTE_GROUPS");
  const labGroupsEnd = shell.indexOf("const LAB_ROUTES");
  assert.ok(labGroupsStart >= 0 && labGroupsEnd > labGroupsStart);
  assert.doesNotMatch(shell.slice(labGroupsStart, labGroupsEnd), /label: "Lab"/);
  assert.doesNotMatch(shell.slice(labGroupsStart, labGroupsEnd), /label: "Lab home"/);
  assert.match(shell, /const LAB_ROUTES = Object\.freeze\(LAB_ROUTE_GROUPS\.flatMap/);
  assert.match(shell, /dataset\.labContextGroup = routeGroup\.label\.toLowerCase\(\)/);
  assert.match(shell, /group\.setAttribute\("role", "group"\)/);
  assert.match(shell, /group\.setAttribute\("aria-labelledby", label\.id\)/);
});

test("Lab context inventory uses current canonical destinations", () => {
  for (const href of [
    "/lab/system-symphony/",
    "/lab/signal/",
    "/lab/system-map/",
    "/lab/blackbox/",
    "/systems/observability/",
    "/lab/console/",
    "/lab/proof-chain/",
    "/lab/conformance/",
    "/systems/reliability/",
    "/systems/evidence/",
    "/lab/speculum/",
    "/lab/almost/",
    "/lab/drift/",
    "/lab/bearing/",
    "/lab/anomaly/",
  ]) {
    assert.match(shell, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(shell, /\/lab\/reliability\//);

  const labGroupsStart = shell.indexOf("const LAB_ROUTE_GROUPS");
  const labGroupsEnd = shell.indexOf("const LAB_ROUTES");
  assert.ok(labGroupsStart >= 0 && labGroupsEnd > labGroupsStart);
  assert.doesNotMatch(shell.slice(labGroupsStart, labGroupsEnd), /https?:\/\//);
});

test("System Symphony children stay outside the global Lab route groups", () => {
  const scopedStart = shell.indexOf("const SYSTEM_SYMPHONY_SCOPED_ROUTES");
  const labGroupsStart = shell.indexOf("const LAB_ROUTE_GROUPS");
  const labGroupsEnd = shell.indexOf("const LAB_ROUTES");
  assert.ok(scopedStart >= 0 && scopedStart < labGroupsStart);
  assert.ok(labGroupsEnd > labGroupsStart);
  assert.match(shell.slice(scopedStart, labGroupsStart), /label: "APU ROMs", href: "\/lab\/system-symphony\/roms\/"/);
  assert.doesNotMatch(shell.slice(labGroupsStart, labGroupsEnd), /APU ROMs|build-log|\/radio\/|\/replay\//);
});

test("nested System Symphony routes retain parent Lab context", () => {
  assert.match(
    shell,
    /label: "System Symphony", href: "\/lab\/system-symphony\/"/,
  );
  assert.match(shell, /routePath === SYSTEM_SYMPHONY_ROUTE/);
  assert.match(shell, /SYSTEM_SYMPHONY_SCOPED_ROUTES\.some/);
  assert.match(shell, /link\.setAttribute\("aria-current", "page"\)/);
});

test("wayfinding styles preserve visible, reachable, non-overlapping navigation", () => {
  assert.match(shell, /LAB_CONTEXT_CSS/);
  assert.match(shell, /ensureStylesheet\(LAB_CONTEXT_CSS\)/);
  assert.match(styles, /a:focus-visible/);
  assert.match(styles, /outline: 2px solid var\(--accent\)/);
  assert.match(styles, /a\[aria-current="page"\]/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /\.lab-context-nav-inner[\s\S]*?overflow-x: visible/);
  assert.match(styles, /scrollbar-width: none/);
  assert.match(styles, /scroll-snap-type: none/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /flex-wrap: wrap/);
  assert.match(styles, /white-space: normal/);
  assert.match(styles, /min-width: 44px/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /top: var\(--atlas-header-height, var\(--global-nav-h, var\(--nav-h, 56px\)\)\)/);
  assert.match(styles, /body:has\(\.lab-context-nav\) main/);
  assert.match(styles, /var\(--atlas-header-height, var\(--global-nav-h, var\(--nav-h, 56px\)\)\)/);
  assert.match(styles, /\+ 64px/);
  assert.doesNotMatch(styles, /padding-top: calc\(var\(--nav-h\)/);
  assert.doesNotMatch(styles, /padding-top: calc\(var\(--nav-h\) \+ 126px\)/);
  assert.doesNotMatch(styles, /@media \(max-width: 760px\)[\s\S]*?\.lab-context-nav\s*{[\s\S]*?top:\s*0/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
