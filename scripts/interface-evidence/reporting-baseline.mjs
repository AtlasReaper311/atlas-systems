import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(DIRECTORY, "reporting-baseline.json");

export const REPORTING_BASELINE = Object.freeze(
  JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")),
);

function issueKind(message) {
  if (message.includes(": horizontal overflow ")) return "horizontal-overflow";
  if (message.includes(": serious accessibility findings ")) return "accessibility";
  if (message.includes(": console errors ")) return "console";
  return null;
}

function accessibilityId(message) {
  const match = message.match(/"id":"([^"]+)"/);
  return match ? match[1] : null;
}

function matchesRule(rule, { routeName, browser, viewport, message }) {
  if (rule.route !== routeName) return false;
  if (rule.kind !== issueKind(message)) return false;
  if (rule.id && rule.id !== accessibilityId(message)) return false;
  if (rule.browsers && !rule.browsers.includes(browser)) return false;
  if (rule.viewports && !rule.viewports.includes(viewport)) return false;
  return (rule.contains || []).every((needle) => message.includes(needle));
}

export function acceptedReportingFinding(context) {
  const rule = REPORTING_BASELINE.families.find((candidate) => matchesRule(candidate, context));
  if (!rule) return null;
  return {
    rule,
    message: `[accepted Phase 2 reporting baseline] ${context.message}`,
  };
}

export function partitionBlockingFindings({ routeName, browser, viewport, messages }) {
  const accepted = [];
  const blocking = [];
  for (const message of messages) {
    const match = acceptedReportingFinding({ routeName, browser, viewport, message });
    if (match) accepted.push(match.message);
    else blocking.push(message);
  }
  return { accepted, blocking };
}

export function reconcileEvidenceReport({ reportPath, errorPath }) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { reconciled: false, acceptedCount: 0, blockingCount: 1, reason: "evidence report is missing" };
    }
    throw error;
  }

  const accepted = [];
  const blocking = [];

  for (const route of report.routes || []) {
    const original = [...(route.blockingFailures || [])];
    const partitioned = partitionBlockingFindings({
      routeName: route.routeName,
      browser: route.browser,
      viewport: String(route.viewport),
      messages: original,
    });
    if (original.length) route.preReconciliationBlockingFailures = original;
    route.blockingFailures = partitioned.blocking;
    route.findings = [...(route.findings || []), ...partitioned.accepted];
    if (partitioned.accepted.length) {
      route.acceptanceMode = partitioned.blocking.length
        ? "blocking-changed-route-with-reviewed-baseline"
        : "reporting-reviewed-baseline";
    }
    accepted.push(...partitioned.accepted);
    blocking.push(...partitioned.blocking);
  }

  report.preReconciliationBlockingFailures = [...(report.blockingFailures || [])];
  report.findings = [...(report.findings || []), ...accepted];
  report.blockingFailures = blocking;
  report.reportingBaseline = {
    schema_version: REPORTING_BASELINE.schema_version,
    source: REPORTING_BASELINE.source,
    accepted_count: accepted.length,
    unresolved_count: blocking.length,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (blocking.length) {
    fs.writeFileSync(
      errorPath,
      `Interface evidence retained ${blocking.length} unaccepted blocking finding(s):\n${blocking.join("\n")}\n`,
    );
    return { reconciled: false, acceptedCount: accepted.length, blockingCount: blocking.length };
  }

  fs.rmSync(errorPath, { force: true });
  return { reconciled: true, acceptedCount: accepted.length, blockingCount: 0 };
}
