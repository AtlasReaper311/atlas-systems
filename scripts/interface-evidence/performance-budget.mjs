import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BROWSER_PERFORMANCE_BUDGET_PATH = path.join(
  DIRECTORY,
  "browser-performance-budgets.json",
);

export const BROWSER_PERFORMANCE_BUDGET_SCHEMA =
  "atlas-systems/browser-performance-budgets/v1";

const METRICS = Object.freeze([
  "requestCount",
  "encodedBytes",
  "decodedBytes",
  "scriptCount",
  "styleCount",
]);

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || !values.length) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} must contain non-empty strings`);
    }
    return value.trim();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return normalized;
}

function canonicalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("scope.canonical_origin must be an absolute URL origin");
  }
  if (url.protocol !== "https:" || url.origin !== value || url.pathname !== "/") {
    throw new Error("scope.canonical_origin must be a canonical HTTPS origin");
  }
  return url.origin;
}

export function validateBrowserPerformanceBudgetPolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("browser performance budget policy must be an object");
  }
  if (policy.schema_version !== BROWSER_PERFORMANCE_BUDGET_SCHEMA) {
    throw new Error(`unexpected browser performance budget schema: ${policy.schema_version}`);
  }
  if (policy.status !== "accepted") {
    throw new Error(`browser performance budget policy is not accepted: ${policy.status}`);
  }
  const browsers = uniqueStrings(policy.scope?.browsers, "scope.browsers");
  const viewports = uniqueStrings(policy.scope?.viewports, "scope.viewports");
  const metrics = uniqueStrings(policy.scope?.metrics, "scope.metrics");
  if (metrics.length !== METRICS.length || METRICS.some((metric) => !metrics.includes(metric))) {
    throw new Error(`scope.metrics must contain exactly ${METRICS.join(", ")}`);
  }
  if (policy.scope?.first_party_only !== true) {
    throw new Error("scope.first_party_only must be true");
  }
  const acceptedCanonicalOrigin = canonicalOrigin(policy.scope?.canonical_origin);
  if (!policy.routes || typeof policy.routes !== "object" || Array.isArray(policy.routes)) {
    throw new Error("routes must be an object");
  }
  const routes = Object.entries(policy.routes);
  if (!routes.length) throw new Error("routes must not be empty");
  for (const [route, caps] of routes) {
    if (!route.startsWith("/") || (route !== "/" && !route.endsWith("/"))) {
      throw new Error(`route must be canonical: ${route}`);
    }
    for (const metric of METRICS) integer(caps?.[metric], `${route}.${metric}`);
  }
  return Object.freeze({
    ...policy,
    scope: Object.freeze({
      ...policy.scope,
      browsers,
      viewports,
      metrics,
      canonical_origin: acceptedCanonicalOrigin,
    }),
    routes: Object.freeze(Object.fromEntries(
      routes.map(([route, caps]) => [route, Object.freeze({ ...caps })]),
    )),
  });
}

export function loadBrowserPerformanceBudgetPolicy(
  policyPath = DEFAULT_BROWSER_PERFORMANCE_BUDGET_PATH,
) {
  return validateBrowserPerformanceBudgetPolicy(
    JSON.parse(fs.readFileSync(policyPath, "utf8")),
  );
}

function firstPartyResources(result, preview, acceptedCanonicalOrigin) {
  const acceptedOrigins = new Set([new URL(preview).origin, acceptedCanonicalOrigin]);
  return (result.resources?.resources || []).filter(({ name }) => {
    try {
      return acceptedOrigins.has(new URL(name).origin);
    } catch {
      return false;
    }
  });
}

function aggregateResources(resources) {
  const sum = (field) => resources.reduce(
    (total, resource) => total + (Number(resource[field]) || 0),
    0,
  );
  const scripts = resources.filter(({ initiatorType }) => initiatorType === "script");
  const styles = resources.filter(
    ({ initiatorType }) => initiatorType === "link" || initiatorType === "css",
  );
  return {
    requestCount: resources.length,
    encodedBytes: sum("encodedBodySize"),
    decodedBytes: sum("decodedBodySize"),
    scriptCount: scripts.length,
    styleCount: styles.length,
  };
}

function key(browser, viewport, route) {
  return `${browser}\u0000${viewport}\u0000${route}`;
}

export function evaluateBrowserPerformanceBudgets({ report, policy }) {
  const accepted = validateBrowserPerformanceBudgetPolicy(policy);
  if (!report?.preview) throw new Error("evidence report preview is missing");
  const expected = new Map();
  for (const browser of accepted.scope.browsers) {
    for (const viewport of accepted.scope.viewports) {
      for (const route of Object.keys(accepted.routes)) {
        expected.set(key(browser, viewport, route), { browser, viewport, route });
      }
    }
  }

  const measurements = [];
  const violations = [];
  for (const result of report.routes || []) {
    if (result.scenario) continue;
    const browser = result.browser;
    const viewport = String(result.viewport);
    const route = result.route;
    const identity = key(browser, viewport, route);
    if (!expected.has(identity)) continue;
    expected.delete(identity);

    const caps = accepted.routes[route];
    const measured = aggregateResources(firstPartyResources(
      result,
      report.preview,
      accepted.scope.canonical_origin,
    ));
    const routeViolations = [];
    for (const metric of accepted.scope.metrics) {
      if (measured[metric] > caps[metric]) {
        routeViolations.push(
          `browser-budget/${browser}/${viewport}${route}: ${metric} ${measured[metric]} > ${caps[metric]}`,
        );
      }
    }
    measurements.push({ browser, viewport, route, measured, caps, violations: routeViolations });
    violations.push(...routeViolations);
  }

  for (const item of expected.values()) {
    violations.push(
      `browser-budget/${item.browser}/${item.viewport}${item.route}: required first-party resource measurement is missing`,
    );
  }

  return {
    schema_version: accepted.schema_version,
    authority: accepted.authority,
    scope: accepted.scope,
    expected_measurements: (
      accepted.scope.browsers.length
      * accepted.scope.viewports.length
      * Object.keys(accepted.routes).length
    ),
    observed_measurements: measurements.length,
    measurements,
    violations,
  };
}

export function reconcileBrowserPerformanceBudgets({
  reportPath,
  errorPath,
  policyPath = DEFAULT_BROWSER_PERFORMANCE_BUDGET_PATH,
}) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { reconciled: false, violationCount: 1, reason: "evidence report is missing" };
    }
    throw error;
  }

  const policy = loadBrowserPerformanceBudgetPolicy(policyPath);
  const evaluation = evaluateBrowserPerformanceBudgets({ report, policy });
  const violationSet = new Set(evaluation.violations);

  for (const route of report.routes || []) {
    const routeViolations = evaluation.measurements
      .find((item) => (
        item.browser === route.browser
        && item.viewport === String(route.viewport)
        && item.route === route.route
        && !route.scenario
      ))?.violations || [];
    route.blockingFailures = [
      ...(route.blockingFailures || []).filter((message) => !message.startsWith("browser-budget/")),
      ...routeViolations,
    ];
    if (routeViolations.length) route.acceptanceMode = "blocking-browser-performance-budget";
  }

  report.blockingFailures = [
    ...(report.blockingFailures || []).filter((message) => !message.startsWith("browser-budget/")),
    ...evaluation.violations,
  ];
  report.browserPerformanceBudget = evaluation;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (violationSet.size) {
    fs.writeFileSync(
      errorPath,
      `Browser performance budgets retained ${violationSet.size} blocking violation(s):\n${[...violationSet].join("\n")}\n`,
    );
    return { reconciled: false, violationCount: violationSet.size, evaluation };
  }

  return { reconciled: true, violationCount: 0, evaluation };
}
