import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NON_INDEXED_ROUTES,
  STANDARD_VIEWPORTS,
  allEvidenceRoutes,
  buildEvidencePlan,
  classifyChangedFiles,
  parseSitemapRoutes,
} from "../../scripts/interface-evidence/contract.mjs";

const sitemapXml = readFileSync("sitemap.xml", "utf8");
const sitemapRoutes = parseSitemapRoutes(sitemapXml);
const routes = allEvidenceRoutes(sitemapXml);

function descriptor(plan, route) {
  return plan.routes.find((candidate) => candidate.path === route);
}

test("the evidence inventory is derived from every current sitemap route plus reviewed non-indexed routes", () => {
  assert.ok(sitemapRoutes.length >= 25, `expected at least 25 sitemap routes, found ${sitemapRoutes.length}`);
  assert.ok(sitemapRoutes.includes("/lab/bearing/"));
  assert.ok(sitemapRoutes.includes("/lab/drift/"));
  assert.ok(sitemapRoutes.includes("/lab/speculum/"));
  assert.ok(sitemapRoutes.includes("/writing/atlas-systems-cicd-pipeline/"));
  for (const route of NON_INDEXED_ROUTES) assert.ok(routes.includes(route), `missing reviewed override ${route}`);
  assert.equal(routes.length, sitemapRoutes.length + NON_INDEXED_ROUTES.length);
});

test("the plan gives every route semantic coverage and expands representative routes across the governed matrix", () => {
  const plan = buildEvidencePlan({ sitemapXml });
  assert.equal(plan.route_count, routes.length);
  assert.deepEqual(plan.required_viewports, [320, 375, 768, 1024, 1440]);
  assert.deepEqual(plan.reporting_viewports, [1920]);
  assert.deepEqual(STANDARD_VIEWPORTS.map(({ width }) => width), [320, 375, 768, 1024, 1440, 1920]);
  for (const route of plan.routes) {
    assert.ok(route.viewportNames.includes("375"), `${route.path} lacks mobile semantic coverage`);
    assert.ok(route.viewportNames.includes("1440"), `${route.path} lacks desktop semantic coverage`);
  }
  for (const route of ["/", "/work/", "/writing/", "/lab/", "/lab/bearing/", "/lab/speculum/", "/systems/", "/404.html"]) {
    assert.deepEqual(descriptor(plan, route).viewportNames, ["320", "375", "768", "1024", "1440", "1920"]);
    assert.deepEqual(descriptor(plan, route).screenshotViewportNames, ["320", "375", "768", "1024", "1440", "1920"]);
  }
});

test("changed routes receive the complete screenshot matrix", () => {
  const plan = buildEvidencePlan({ sitemapXml, changedRoutes: ["/lab/anomaly/"] });
  const anomaly = descriptor(plan, "/lab/anomaly/");
  assert.equal(anomaly.changed, true);
  assert.deepEqual(anomaly.screenshotViewportNames, ["320", "375", "768", "1024", "1440", "1920"]);
});

test("changed-file classification binds route work and shared assets to evidence approval", () => {
  const bearing = classifyChangedFiles({ changedFiles: ["lab/bearing/index.html"], routes });
  assert.equal(bearing.evidence_required, true);
  assert.deepEqual(bearing.changed_routes, ["/lab/bearing/"]);

  const shared = classifyChangedFiles({ changedFiles: ["static/css/estate-shell.css"], routes });
  assert.equal(shared.visual_change, true);
  assert.deepEqual(new Set(shared.changed_routes), new Set(routes));

  const harness = classifyChangedFiles({ changedFiles: ["scripts/capture_interface_evidence.mjs"], routes });
  assert.equal(harness.visual_change, false);
  assert.equal(harness.evidence_contract_change, true);
  assert.equal(harness.evidence_required, true);
});
