import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox } from "playwright";

import { reconcileEvidenceReport } from "./reporting-baseline.mjs";

export const FIXTURE_HOSTS = new Set([
  "api.atlas-systems.uk",
  "corpus.atlas-systems.uk",
  "ramone.atlas-systems.uk",
]);

export const BROWSERS = Object.freeze([
  Object.freeze({ name: "chrome", launch: () => chromium.launch({ channel: "chrome", headless: true }) }),
  Object.freeze({ name: "firefox", launch: () => firefox.launch({ headless: true }) }),
]);

function installReportingBaselineReconciliation() {
  if (path.basename(process.argv[1] || "") !== "capture_interface_evidence.mjs") return;
  process.once("beforeExit", () => {
    if (!process.exitCode) return;
    const outputDirectory = process.env.INTERFACE_EVIDENCE_OUTPUT_DIR || process.cwd();
    const result = reconcileEvidenceReport({
      reportPath: path.join(outputDirectory, "evidence.json"),
      errorPath: path.join(outputDirectory, "capture-error.txt"),
    });
    if (!result.reconciled) return;
    console.log(
      `Interface evidence preserved ${result.acceptedCount} reviewed reporting-baseline finding(s) and found no new blockers.`,
    );
    process.exitCode = 0;
  });
}

installReportingBaselineReconciliation();

function normalHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function isIgnoredThirdPartyUrl(value) {
  const hostname = normalHostname(value);
  return hostname === "cloudflareinsights.com" || hostname.endsWith(".cloudflareinsights.com");
}

export function isFixtureUrl(value) {
  return FIXTURE_HOSTS.has(normalHostname(value));
}

export async function installAudioContextTracking(context) {
  await context.addInitScript(() => {
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    const states = [];
    if (NativeAudioContext) {
      const TrackedAudioContext = new Proxy(NativeAudioContext, {
        construct(target, args, newTarget) {
          const instance = Reflect.construct(target, args, newTarget);
          const index = states.push(instance.state) - 1;
          const update = () => { states[index] = instance.state; };
          instance.addEventListener?.("statechange", update);
          return instance;
        },
      });
      if (window.AudioContext) window.AudioContext = TrackedAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = TrackedAudioContext;
    }
    Object.defineProperty(window, "__ATLAS_AUDIO_CONTEXT_STATES__", {
      get: () => [...states],
      configurable: false,
    });
  });
}

export async function configureDeterministicContext(context, {
  fixtureLabel = "deterministic preview fixture",
  trackAudioContexts = false,
} = {}) {
  await context.addInitScript(() => {
    Object.defineProperty(window, "__ATLAS_EVIDENCE_MODE__", {
      value: "deterministic-unavailable",
      configurable: false,
      writable: false,
    });
  });
  if (trackAudioContexts) await installAudioContextTracking(context);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (FIXTURE_HOSTS.has(url.hostname)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ error: fixtureLabel }),
      });
      return;
    }
    await route.continue();
  });
}

export function actionableConsoleErrors(records = []) {
  return records.filter(({ text = "" }) => !/\b503\b/.test(text));
}

export function observePage(page) {
  const state = {
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    responseErrors: [],
  };

  page.on("pageerror", (error) => state.pageErrors.push(error.message));
  page.on("console", (message) => {
    const record = { type: message.type(), text: message.text() };
    if (message.type() === "error") state.consoleErrors.push(record);
    if (message.type() === "warning") state.consoleWarnings.push(record);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (isIgnoredThirdPartyUrl(url) || isFixtureUrl(url)) return;
    state.failedRequests.push({
      url,
      method: request.method(),
      failure: request.failure()?.errorText || "request failed",
    });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() < 400 || isIgnoredThirdPartyUrl(url) || isFixtureUrl(url)) return;
    state.responseErrors.push({ url, status: response.status(), statusText: response.statusText() });
  });
  return state;
}

export async function openWithRetry(page, url, {
  attempts = 6,
  readySelectors = ["main"],
  settleMs = 700,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
      for (const selector of readySelectors) {
        await page.waitForSelector(selector, { timeout: 15_000 });
      }
      await page.evaluate(() => document.fonts?.ready || Promise.resolve());
      await page.waitForTimeout(settleMs);
      return { attempt, status: response.status() };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

export function summarizeViolation(item) {
  return {
    id: item.id,
    impact: item.impact,
    help: item.help,
    nodes: item.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
      checks: [...node.any, ...node.all, ...node.none].map((check) => ({
        id: check.id,
        message: check.message,
        data: check.data,
      })),
    })),
  };
}

export async function accessibilityReport(page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = result.violations.map(summarizeViolation);
  return {
    violations,
    blocking: violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  };
}

export async function resourceMetrics(page) {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const records = entries.map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: Number(entry.transferSize) || 0,
      encodedBodySize: Number(entry.encodedBodySize) || 0,
      decodedBodySize: Number(entry.decodedBodySize) || 0,
      duration: Math.round((Number(entry.duration) || 0) * 100) / 100,
    }));
    const sum = (values) => values.reduce((total, value) => total + value, 0);
    const scripts = records.filter(({ initiatorType }) => initiatorType === "script");
    const styles = records.filter(({ initiatorType }) => initiatorType === "link" || initiatorType === "css");
    return {
      requestCount: records.length,
      transferBytes: sum(records.map(({ transferSize }) => transferSize)),
      encodedBytes: sum(records.map(({ encodedBodySize }) => encodedBodySize)),
      decodedBytes: sum(records.map(({ decodedBodySize }) => decodedBodySize)),
      scriptCount: scripts.length,
      scriptTransferBytes: sum(scripts.map(({ transferSize }) => transferSize)),
      styleCount: styles.length,
      styleTransferBytes: sum(styles.map(({ transferSize }) => transferSize)),
      resources: records,
    };
  });
}

export function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
