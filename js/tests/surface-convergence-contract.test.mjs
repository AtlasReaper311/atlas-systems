import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SURFACE_ROUTES,
  descriptorForPath,
} from "../../static/js/surface-convergence.js";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function sitemapRoutes() {
  const xml = read("sitemap.xml");
  return [...xml.matchAll(/<loc>https:\/\/atlas-systems\.uk([^<]+)<\/loc>/g)]
    .map(([, route]) => route)
    .filter((route) => route === "/lab/" || route.startsWith("/lab/") || route === "/systems/" || route.startsWith("/systems/"));
}

test("every public Lab and Systems route has a presentation descriptor", () => {
  for (const route of sitemapRoutes()) {
    assert.ok(descriptorForPath(route), `missing surface descriptor for ${route}`);
  }
  assert.equal(descriptorForPath("/lab/system-symphony/roms/")?.mode, "product");
});

test("the accepted standard, immersive, product, and directory modes are explicit", () => {
  for (const route of [
    "/lab/system-map/",
    "/lab/blackbox/",
    "/lab/console/",
    "/lab/proof-chain/",
    "/lab/conformance/",
    "/lab/anomaly/",
    "/lab/speculum/",
    "/systems/observability/",
    "/systems/reliability/",
    "/systems/evidence/",
  ]) {
    assert.equal(descriptorForPath(route)?.mode, "standard", route);
  }
  for (const route of ["/lab/signal/", "/lab/almost/", "/lab/drift/", "/lab/bearing/"]) {
    assert.equal(descriptorForPath(route)?.mode, "immersive", route);
  }
  assert.equal(descriptorForPath("/lab/")?.mode, "directory");
  assert.equal(descriptorForPath("/systems/")?.mode, "directory");
  assert.equal(descriptorForPath("/lab/system-symphony/")?.mode, "product");
});

test("route eyebrows use the approved three-part grammar", () => {
  for (const [route, descriptor] of Object.entries(SURFACE_ROUTES)) {
    assert.match(descriptor.eyebrow, /^[A-Z][A-Z -]+ \/ [A-Z][A-Z -]+ \/ [A-Z][A-Z -]+$/, route);
  }
  assert.equal(SURFACE_ROUTES["/lab/speculum/"].eyebrow, "LAB / EXPLORE / SYSTEMS ARTWORK");
  assert.equal(SURFACE_ROUTES["/systems/reliability/"].eyebrow, "SYSTEMS / RELIABILITY / SERVICE EVIDENCE");
});

test("shared tokens enforce the approved spacing, type, title, and directory tiers", () => {
  const css = read("static/css/surface-convergence.css");
  assert.match(css, /--atlas-surface-gap-standard:\s*clamp\(40px, 4vw, 48px\)/);
  assert.match(css, /--atlas-surface-gap-immersive:\s*clamp\(24px, 3vw, 32px\)/);
  assert.match(css, /--atlas-surface-gap-directory:\s*clamp\(56px, 6vw, 72px\)/);
  assert.match(css, /--atlas-surface-title-standard:\s*clamp\(3rem, 6vw, 5rem\)/);
  assert.match(css, /--atlas-surface-title-immersive:\s*clamp\(4rem, 8vw, 7rem\)/);
  assert.match(css, /font-family:\s*var\(--serif, "DM Serif Display"/);
  assert.match(css, /data-lab-route="bearing"[\s\S]*--f-display:\s*"DM Serif Display"/);
  assert.match(css, /data-lab-route="almost"[\s\S]*atlas-surface-title span/);
  assert.match(css, /data-lab-route="bearing"[\s\S]*atlas-surface-title em/);
  assert.match(css, /\.directory-taxonomy/);
  assert.match(css, /\.lab-directory-secondary__links/);
});

test("The Bearing no longer receives a parallel hand-built estate shell", () => {
  const footer = read("static/js/phase-6-footer.js");
  assert.doesNotMatch(footer, /bearing-governed-shell-styles/);
  assert.doesNotMatch(footer, /if\s*\(path\s*===\s*BEARING_ROUTE\)/);
  assert.match(footer, /import\(LAB_SHELL_MODULE\)/);
  assert.match(footer, /function installBearingShell\(\) \{\s*return bootstrapLabShell\(\);\s*\}/);
});

test("the shared footer owns convergence bootstrap without duplicate directory or Systems imports", () => {
  const footer = read("static/js/phase-6-footer.js");
  const focused = read("static/js/focused-systems-shell.js");
  const directory = read("static/js/directory-header-fields.js");

  assert.match(footer, /surface-convergence\.js/);
  assert.match(footer, /surface-convergence\.css/);
  assert.match(footer, /isSurfaceConvergencePath/);
  assert.match(footer, /installSurfaceConvergence/);
  assert.doesNotMatch(footer, /directory-convergence\.css/);

  assert.doesNotMatch(focused, /surface-convergence\.js/);
  assert.doesNotMatch(focused, /surface-convergence\.css/);
  assert.doesNotMatch(focused, /installSurfaceConvergence/);
  assert.doesNotMatch(focused, /installPhase6Footer/);

  assert.doesNotMatch(directory, /surface-convergence\.js/);
  assert.doesNotMatch(directory, /surface-convergence\.css/);
  assert.doesNotMatch(directory, /installSurfaceConvergence/);
  assert.doesNotMatch(directory, /installPhase6Footer/);
  assert.match(directory, /path === "\/systems\/"/);
});
