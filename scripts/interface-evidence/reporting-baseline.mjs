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
