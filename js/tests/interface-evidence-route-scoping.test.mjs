import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allEvidenceRoutes,
  classifyChangedFiles,
  surfaceConvergenceRouteHints,
} from "../../scripts/interface-evidence/contract.mjs";

const sitemapXml = readFileSync("sitemap.xml", "utf8");
const routes = allEvidenceRoutes(sitemapXml);
const observatoryRoute = "/systems/model-promotion/";
const convergencePath = "static/js/surface-convergence.js";

test("route-named static assets only expand evidence for their known route", () => {
  const result = classifyChangedFiles({
    changedFiles: ["static/css/systems-model-promotion.css"],
    routes,
  });

  assert.equal(result.visual_change, true);
  assert.deepEqual(result.changed_routes, [observatoryRoute]);
});

test("surface convergence registry-only diffs provide a safe route hint", () => {
  const diffText = [
    "diff --git a/static/js/surface-convergence.js b/static/js/surface-convergence.js",
    "--- a/static/js/surface-convergence.js",
    "+++ b/static/js/surface-convergence.js",
    "@@ -20,0 +21 @@",
    '+  "/systems/model-promotion/": Object.freeze({ surface: "systems", mode: "standard" }),',
  ].join("\n");

  assert.deepEqual(surfaceConvergenceRouteHints(diffText, routes), [observatoryRoute]);

  const result = classifyChangedFiles({
    changedFiles: [convergencePath],
    routes,
    changedRouteHints: { [convergencePath]: [observatoryRoute] },
  });
  assert.deepEqual(result.changed_routes, [observatoryRoute]);
});

test("surface convergence functional changes fail safe to estate-wide evidence", () => {
  const diffText = [
    "--- a/static/js/surface-convergence.js",
    "+++ b/static/js/surface-convergence.js",
    "@@ -1 +1 @@",
    "-function descriptorForPath(pathname) {",
    "+function descriptorForPath(pathname, options = {}) {",
  ].join("\n");

  assert.deepEqual(surfaceConvergenceRouteHints(diffText, routes), []);

  const result = classifyChangedFiles({
    changedFiles: [convergencePath],
    routes,
  });
  assert.deepEqual(new Set(result.changed_routes), new Set(routes));
});
