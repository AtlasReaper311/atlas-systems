import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const styles = fs.readFileSync("lab/shared/lab-context-navigation.css", "utf8");
const layout = fs.readFileSync("lab/shared/lab-shell-layout.css", "utf8");

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
    "/lab/spectral-forge/",
    "/lab/signal/",
    "/lab/system-map/",
    "/lab/blackbox/",
    "/systems/observability/",
    "/lab/console/",
    "/lab/proof-chain/",
    "/lab/conformance/",
    "/lab/xray/",
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
  assert.doesNotMatch(shell, /label: "Reliability", href: "\/lab\/reliability\/"/);
  assert.match(shell, /LEGACY_ROUTE_ALIASES/);
  assert.match(shell, /\["\/lab\/reliability\/", "\/systems\/reliability\/"\]/);

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
  assert.match(shell, /if \(isSystemSymphonyPath\(pathname\) \|\| pathname === SPECTRAL_FORGE_ROUTE\) return "product"/);
});

test("Spectral Forge is a first-class Experience product route", () => {
  assert.match(shell, /const SPECTRAL_FORGE_ROUTE = "\/lab\/spectral-forge\/"/);
  assert.match(shell, /label: "Spectral Forge", href: "\/lab\/spectral-forge\/"/);
  assert.match(shell, /pathname === SPECTRAL_FORGE_ROUTE\) return "product"/);
  assert.match(shell, /SPECTRAL_FORGE_ROUTE,/);
});

test("wayfinding keeps one measured rail and visible keyboard focus", () => {
  assert.match(shell, /LAB_CONTEXT_CSS/);
  assert.match(shell, /LAB_LAYOUT_CSS/);
  assert.match(styles, /a:focus-visible/);
  assert.match(styles, /outline: 2px solid var\(--accent\)/);
  assert.match(styles, /a\[aria-current="page"\]/);
  assert.match(styles, /min-width: 44px/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /overflow-x: auto/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(250px, 1fr\)\)/);
  assert.match(styles, /scrollbar-width: none/);
  assert.match(styles, /white-space: normal/);
  assert.match(styles, /top: var\(--lab-shell-header-height/);
  assert.doesNotMatch(styles, /body:has\(\.lab-context-nav\) main/);
  assert.match(layout, /--lab-shell-stack-height/);
  assert.match(layout, /body\[data-lab-shell\]/);
  assert.match(layout, /data-lab-layout="standard"/);
  assert.match(layout, /data-lab-layout="immersive"/);
  assert.match(layout, /data-lab-layout="product"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("shell height is measured instead of guessed per route", () => {
  assert.match(shell, /function installMeasuredShell/);
  assert.match(shell, /new ResizeObserver/);
  assert.match(shell, /--lab-shell-header-height/);
  assert.match(shell, /--lab-shell-context-height/);
  assert.match(shell, /--lab-shell-stack-height/);
  assert.match(shell, /dataset\.labShellReady/);
  assert.match(shell, /document\.body\.dataset\.labLayout = labLayoutForPath/);
  assert.doesNotMatch(layout, /padding-top:\s*122px/);
  assert.doesNotMatch(layout, /padding-top:\s*300px/);
});
