import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  NON_INDEXED_ROUTES,
  allEvidenceRoutes,
  buildEvidencePlan,
} from "../../scripts/interface-evidence/contract.mjs";

const sitemapXml = fs.readFileSync("sitemap.xml", "utf8");
const evidenceRoutes = allEvidenceRoutes(sitemapXml);
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const layout = fs.readFileSync("lab/shared/lab-shell-layout.css", "utf8");
const shellContract = fs.readFileSync("lab/shared/lab-shell-contract.js", "utf8");
const footer = fs.readFileSync("static/js/phase-6-footer.js", "utf8");

const CANONICAL_LAB_ROUTES = [
  "/lab/",
  "/lab/system-symphony/",
  "/lab/spectral-forge/",
  "/lab/system-map/",
  "/lab/blackbox/",
  "/lab/proof-chain/",
  "/lab/signal/",
  "/lab/conformance/",
  "/lab/anomaly/",
  "/lab/almost/",
  "/lab/drift/",
  "/lab/bearing/",
  "/lab/speculum/",
];

const NON_INDEXED_LAB_ROUTES = [
  "/lab/console/",
  "/lab/consensus/",
  "/lab/system-symphony/roms/",
  "/lab/system-symphony/build-log/",
  "/lab/system-symphony/radio/",
];

test("every canonical and reviewed Lab route is in browser evidence", () => {
  for (const route of [...CANONICAL_LAB_ROUTES, ...NON_INDEXED_LAB_ROUTES]) {
    assert.ok(evidenceRoutes.includes(route), `missing Lab evidence route ${route}`);
  }
  for (const route of NON_INDEXED_LAB_ROUTES) {
    assert.ok(NON_INDEXED_ROUTES.includes(route), `missing non-indexed route ${route}`);
  }

  const plan = buildEvidencePlan({ sitemapXml });
  for (const descriptor of plan.routes.filter(({ path }) => path === "/lab/" || path.startsWith("/lab/"))) {
    assert.equal(descriptor.requiresStandardShell, true, `${descriptor.path} must require the governed shell`);
    assert.ok(descriptor.viewportNames.includes("375"), `${descriptor.path} lacks mobile evidence`);
    assert.ok(descriptor.viewportNames.includes("1440"), `${descriptor.path} lacks desktop evidence`);
  }
});

test("one shell owns header, search, context, measured layout, targets, and footer", () => {
  assert.match(shell, /LAB_CONTEXT_CSS/);
  assert.match(shell, /LAB_LAYOUT_CSS/);
  assert.match(shell, /TARGET_CONTRACT/);
  assert.match(shell, /PHASE6_FOOTER/);
  assert.match(shell, /LAB_SHELL_CONTRACT/);
  assert.match(shell, /await import\("\/static\/js\/estate-shell\.js/);
  assert.match(shell, /await import\("\/static\/js\/estate-search\/global-search\.js"\)/);
  assert.match(shell, /installGovernedFooter/);
  assert.match(shell, /installMeasuredShell/);
  assert.match(shell, /document\.documentElement\.dataset\.labShell/);
  assert.match(shell, /document\.body\.dataset\.labShell/);
});

test("route layout modes are explicit without flattening individual instruments", () => {
  assert.match(shell, /pathname === LAB_HOME_ROUTE\) return "directory"/);
  assert.match(shell, /isSystemSymphonyPath\(pathname\) \|\| pathname === SPECTRAL_FORGE_ROUTE\) return "product"/);
  assert.match(shell, /IMMERSIVE_ROUTES\.has\(pathname\)\) return "immersive"/);
  assert.match(shell, /return "standard"/);
  for (const route of ["/lab/almost/", "/lab/bearing/", "/lab/drift/"]) {
    assert.match(shell, new RegExp(route.replaceAll("/", "\\/")));
  }
  for (const mode of ["directory", "standard", "immersive", "product"]) {
    assert.match(layout, new RegExp(`data-lab-layout="${mode}"`));
  }
  assert.match(layout, /data-lab-route="bearing"/);
  assert.match(layout, /data-lab-route="speculum"/);
  assert.match(layout, /data-lab-route="almost"/);
  assert.match(layout, /data-lab-route="drift"/);
  assert.match(layout, /data-lab-route="console"/);
});

test("The Bearing joins the estate through its existing governed footer bootstrap", () => {
  const bearing = fs.readFileSync("lab/bearing/index.html", "utf8");
  assert.match(bearing, /\/static\/js\/phase-6-footer\.js/);
  assert.match(footer, /LAB_SHELL_MODULE/);
  assert.match(footer, /function bootstrapLabShell/);
  assert.match(footer, /document\.documentElement\.hasAttribute\("data-lab-shell"\)/);
  assert.match(footer, /void import\(LAB_SHELL_MODULE\)/);
  assert.match(layout, /body\[data-lab-route="bearing"\] main/);
  assert.match(layout, /body\[data-lab-route="bearing"\] \.bearing/);
});

test("standard and experimental route entrypoints all reach the shared shell", () => {
  const directHtml = [
    "lab/index.html",
    "lab/system-map/index.html",
    "lab/speculum/index.html",
    "lab/bearing/index.html",
    "lab/system-symphony/index.html",
    "lab/spectral-forge/index.html",
    "lab/system-symphony/roms/index.html",
    "lab/system-symphony/build-log/index.html",
    "lab/system-symphony/radio/index.html",
  ];
  for (const path of directHtml) {
    assert.match(fs.readFileSync(path, "utf8"), /\/lab\/shared\/shell\.js/, `${path} shell entrypoint`);
  }

  const routeModules = [
    "lab/blackbox/blackbox.js",
    "lab/proof-chain/proof-chain.js",
    "lab/signal/signal-v2.js",
    "lab/conformance/conformance.js",
    "lab/anomaly/anomaly.js",
    "lab/almost/almost.js",
    "lab/drift/drift.js",
  ];
  for (const path of routeModules) {
    assert.match(fs.readFileSync(path, "utf8"), /\.\.\/shared\/shell\.js/, `${path} shell entrypoint`);
  }

  const consolePage = fs.readFileSync("lab/console/index.html", "utf8");
  const searchRenderer = fs.readFileSync("static/js/estate-search/render.js", "utf8");
  assert.match(consolePage, /\/static\/js\/estate-search\/global-search\.js/);
  assert.match(searchRenderer, /import "\.\.\/phase-6-footer\.js";/);
});

test("duplicate and guessed route chrome is neutralised by the shared layout", () => {
  assert.match(layout, /body\[data-lab-route="speculum"\] \.masthead/);
  assert.match(layout, /display: none !important/);
  assert.match(layout, /body\[data-lab-route="almost"\] \.lab-context-nav/);
  assert.match(layout, /body\[data-lab-route="console"\] \.page-header/);
  assert.match(shell, /ROUTE_TITLE_OVERRIDES/);
  assert.match(shell, /\["\/lab\/console\/", "Operations \/\/ Atlas Systems"\]/);
  assert.match(shell, /canonical\.href = productionUrl/);
  assert.match(shell, /ensureMeta\("og:url", productionUrl\)/);
});

test("the executable shell contract blocks disconnected or obscured Lab pages", () => {
  for (const rule of [
    "header-present",
    "context-navigation-present",
    "search-present",
    "footer-present",
    "layout-mode-present",
    "fixed-header-reserved-in-flow",
    "context-navigation-below-header",
    "no-gap-between-header-and-context-navigation",
    "heading-clears-context-navigation",
  ]) {
    assert.match(shellContract, new RegExp(rule));
  }
  assert.match(shellContract, /getBoundingClientRect/);
  assert.match(shellContract, /dataset\.labShellContract = "pending"/);
  assert.match(shellContract, /dataset\.labShellContract = "fail"/);
  assert.match(shellContract, /console\.error/);
});