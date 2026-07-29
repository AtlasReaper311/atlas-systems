import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  NON_INDEXED_ROUTES,
  STANDARD_VIEWPORTS,
  allEvidenceRoutes,
  buildEvidencePlan,
  classifyChangedFiles,
  parseSitemapRoutes,
} from "../../scripts/interface-evidence/contract.mjs";
import {
  REPORTING_BASELINE,
  acceptedReportingFinding,
  reconcileEvidenceReport,
} from "../../scripts/interface-evidence/reporting-baseline.mjs";

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

test("the reporting baseline is pinned to the reviewed Phase 2 evidence", () => {
  assert.equal(REPORTING_BASELINE.schema_version, "atlas-systems/public-interface-reporting-baseline/v1");
  assert.equal(REPORTING_BASELINE.source.pull_request, "AtlasReaper311/atlas-systems#168");
  assert.equal(REPORTING_BASELINE.source.reviewed_head, "4dafa7d1d4690e94e36e9342e672d41307633d19");
  assert.equal(REPORTING_BASELINE.source.workflow_run, 30386218935);
  assert.equal(REPORTING_BASELINE.source.artifact_id, 8699615072);
  assert.equal(REPORTING_BASELINE.source.reviewed_finding_count, 36);
});

test("baseline matching is route, browser, viewport, issue, and target specific", () => {
  const accepted = acceptedReportingFinding({
    routeName: "lab-signal",
    browser: "firefox",
    viewport: "375",
    message: 'lab-signal/375: serious accessibility findings [{"id":"color-contrast","nodes":[{"target":["span[data-layer=\\"noise\\"]"]}]}]',
  });
  assert.ok(accepted);

  assert.equal(acceptedReportingFinding({
    routeName: "lab-speculum",
    browser: "firefox",
    viewport: "375",
    message: 'lab-speculum/375: serious accessibility findings [{"id":"color-contrast","nodes":[{"target":["span[data-layer=\\"noise\\"]"]}]}]',
  }), null);

  assert.equal(acceptedReportingFinding({
    routeName: "lab-signal",
    browser: "firefox",
    viewport: "375",
    message: 'lab-signal/375: serious accessibility findings [{"id":"aria-required-attr","nodes":[{"target":["span[data-layer=\\"noise\\"]"]}]}]',
  }), null);
});

test("reconciliation preserves reviewed findings and retains unknown blockers", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "atlas-interface-baseline-"));
  const reportPath = path.join(directory, "evidence.json");
  const errorPath = path.join(directory, "capture-error.txt");
  const acceptedMessage = 'writing-sonin-generative-system/375: console errors [{"type":"error","text":"Framing \'https://www.youtube.com/\' violates the following Content Security Policy directive: \\"default-src \'self\'\\"."}]';
  const unknownMessage = "lab-speculum/375: expected one h1, found 2";
  writeFileSync(reportPath, `${JSON.stringify({
    routes: [
      {
        routeName: "writing-sonin-generative-system",
        browser: "chrome",
        viewport: "375",
        findings: [],
        blockingFailures: [acceptedMessage],
      },
      {
        routeName: "lab-speculum",
        browser: "chrome",
        viewport: "375",
        findings: [],
        blockingFailures: [unknownMessage],
      },
    ],
    findings: [],
    blockingFailures: [acceptedMessage, unknownMessage],
  }, null, 2)}\n`);

  const result = reconcileEvidenceReport({ reportPath, errorPath });
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(result.reconciled, false);
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.blockingCount, 1);
  assert.equal(report.reportingBaseline.accepted_count, 1);
  assert.deepEqual(report.blockingFailures, [unknownMessage]);
  assert.match(report.findings[0], /accepted Phase 2 reporting baseline/);
  assert.match(readFileSync(errorPath, "utf8"), /lab-speculum/);
  rmSync(directory, { recursive: true, force: true });
});
