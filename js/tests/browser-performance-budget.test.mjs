import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  evaluateBrowserPerformanceBudgets,
  loadBrowserPerformanceBudgetPolicy,
  reconcileBrowserPerformanceBudgets,
  validateBrowserPerformanceBudgetPolicy,
} from "../../scripts/interface-evidence/performance-budget.mjs";

const policy = loadBrowserPerformanceBudgetPolicy(
  "scripts/interface-evidence/browser-performance-budgets.json",
);

function resource(name, initiatorType, encodedBodySize, decodedBodySize) {
  return { name, initiatorType, encodedBodySize, decodedBodySize };
}

function routeResult({ browser, viewport, route, resources }) {
  return {
    browser,
    viewport,
    route,
    routeName: route === "/" ? "home" : route.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", "-"),
    resources: { resources },
    findings: [],
    blockingFailures: [],
  };
}

function completeReport(overrides = new Map()) {
  const routes = [];
  for (const browser of policy.scope.browsers) {
    for (const viewport of policy.scope.viewports) {
      for (const route of Object.keys(policy.routes)) {
        const identity = `${browser}/${viewport}${route}`;
        const resources = overrides.get(identity) || [
          resource("https://interface-pr-200.example/index.css", "link", 100, 100),
          resource("https://atlas-systems.uk/index.js", "script", 100, 100),
          resource("https://api.atlas-systems.uk/v1/status", "fetch", 999999, 999999),
        ];
        routes.push(routeResult({ browser, viewport, route, resources }));
      }
    }
  }
  routes.push({
    browser: "chrome",
    viewport: "375",
    route: "/writing/",
    scenario: "no-js",
    blockingFailures: [],
  });
  return { preview: "https://interface-pr-200.example", routes, blockingFailures: [] };
}

test("the accepted policy is complete, first-party-only, and scoped to 28 measurements", () => {
  assert.equal(policy.status, "accepted");
  assert.deepEqual(policy.scope.browsers, ["chrome", "firefox"]);
  assert.deepEqual(policy.scope.viewports, ["375", "1440"]);
  assert.equal(policy.scope.canonical_origin, "https://atlas-systems.uk");
  assert.equal(Object.keys(policy.routes).length, 7);
  const result = evaluateBrowserPerformanceBudgets({ report: completeReport(), policy });
  assert.equal(result.expected_measurements, 28);
  assert.equal(result.observed_measurements, 28);
  assert.deepEqual(result.violations, []);
  assert.equal(result.measurements[0].measured.requestCount, 2);
  assert.equal(result.measurements[0].measured.encodedBytes, 200);
  assert.equal(result.measurements[0].measured.scriptCount, 1);
  assert.equal(result.measurements[0].measured.styleCount, 1);
});

test("a selected first-party resource regression blocks with measured value and cap", () => {
  const overrides = new Map();
  overrides.set("chrome/375/lab/", Array.from({ length: 48 }, (_, index) => (
    resource(`https://interface-pr-200.example/asset-${index}.css`, "link", 100, 100)
  )));
  const result = evaluateBrowserPerformanceBudgets({ report: completeReport(overrides), policy });
  assert.ok(result.violations.includes("browser-budget/chrome/375/lab/: requestCount 48 > 47"));
  assert.ok(result.violations.includes("browser-budget/chrome/375/lab/: styleCount 48 > 19"));
});

test("a missing selected measurement fails closed while no-js scenarios are ignored", () => {
  const report = completeReport();
  report.routes = report.routes.filter((item) => !(
    !item.scenario
    && item.browser === "firefox"
    && item.viewport === "1440"
    && item.route === "/systems/"
  ));
  const result = evaluateBrowserPerformanceBudgets({ report, policy });
  assert.deepEqual(result.violations, [
    "browser-budget/firefox/1440/systems/: required first-party resource measurement is missing",
  ]);
});

test("policy validation rejects unaccepted authority, malformed caps, and invalid origins", () => {
  assert.throws(
    () => validateBrowserPerformanceBudgetPolicy({ ...policy, status: "proposed" }),
    /not accepted/,
  );
  const broken = JSON.parse(JSON.stringify(policy));
  broken.routes["/lab/"].styleCount = -1;
  assert.throws(() => validateBrowserPerformanceBudgetPolicy(broken), /non-negative integer/);

  const insecure = JSON.parse(JSON.stringify(policy));
  insecure.scope.canonical_origin = "http://atlas-systems.uk";
  assert.throws(() => validateBrowserPerformanceBudgetPolicy(insecure), /canonical HTTPS origin/);

  const withPath = JSON.parse(JSON.stringify(policy));
  withPath.scope.canonical_origin = "https://atlas-systems.uk/lab/";
  assert.throws(() => validateBrowserPerformanceBudgetPolicy(withPath), /canonical HTTPS origin/);
});

test("reconciliation records budget evidence and preserves unrelated blockers", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "atlas-browser-budget-"));
  const reportPath = path.join(directory, "evidence.json");
  const errorPath = path.join(directory, "capture-error.txt");
  const policyPath = path.join(directory, "policy.json");
  const report = completeReport();
  report.routes[0].blockingFailures = ["existing interface blocker"];
  report.blockingFailures = ["existing interface blocker"];
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(policyPath, readFileSync("scripts/interface-evidence/browser-performance-budgets.json"));

  const result = reconcileBrowserPerformanceBudgets({ reportPath, errorPath, policyPath });
  const reconciled = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(result.reconciled, true);
  assert.equal(reconciled.browserPerformanceBudget.observed_measurements, 28);
  assert.deepEqual(reconciled.blockingFailures, ["existing interface blocker"]);
  assert.deepEqual(reconciled.routes[0].blockingFailures, ["existing interface blocker"]);
  rmSync(directory, { recursive: true, force: true });
});

test("the browser evidence core applies budgets before reporting-baseline reconciliation", () => {
  const core = readFileSync("scripts/interface-evidence/browser-core.mjs", "utf8");
  assert.match(core, /reconcileBrowserPerformanceBudgets/);
  assert.match(core, /reconcileEvidenceReport/);
  assert.ok(
    core.indexOf("reconcileBrowserPerformanceBudgets({ reportPath, errorPath })")
      < core.indexOf("reconcileEvidenceReport({ reportPath, errorPath })"),
  );
  assert.match(core, /if \(budgetResult\.violationCount\)/);
});
