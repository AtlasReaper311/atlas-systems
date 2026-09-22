import fs from "node:fs";
import process from "node:process";

import {
  BROWSERS,
  accessibilityReport,
  configureDeterministicContext,
  observePage,
  writeJson,
} from "./interface-evidence/browser-core.mjs";

const PREVIEW_URL = process.env.PREVIEW_URL;
const HEAD_SHA = process.env.HEAD_SHA || "unknown";
const OUTPUT_DIRECTORY = process.env.SONIN_EVIDENCE_OUTPUT_DIR || process.cwd();
const ROUTE = "/writing/sonin-generative-system/";
const EXPECTED_IFRAME = "https://www.youtube.com/embed/O5f1tB5bdyE";
const EXPECTED_FRAME_ORIGIN = new URL(EXPECTED_IFRAME).origin;
const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ name: "320", width: 320, height: 760 }),
  Object.freeze({ name: "375", width: 375, height: 812 }),
  Object.freeze({ name: "768", width: 768, height: 900 }),
  Object.freeze({ name: "1024", width: 1024, height: 900 }),
  Object.freeze({ name: "1440", width: 1440, height: 1000 }),
  Object.freeze({ name: "1920", width: 1920, height: 1080 }),
]);

if (!PREVIEW_URL) throw new Error("PREVIEW_URL is required");

const atlasOrigin = new URL(PREVIEW_URL).origin;
const reportPath = `${OUTPUT_DIRECTORY}/sonin-evidence.json`;
const errorPath = `${OUTPUT_DIRECTORY}/sonin-capture-error.txt`;
fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isCspFrameBlock(text) {
  return /content security policy|frame-src|refused to frame|blocked.*csp|refused to display/i.test(text || "");
}

function isFrameTarget(target) {
  return target === "iframe" || target.startsWith("iframe ");
}

function classifyAccessibility(report) {
  const atlasBlocking = [];
  const youtubeOwned = [];
  for (const violation of report.violations) {
    const frameOnly = violation.nodes.length > 0
      && violation.nodes.every((node) => node.target.some(isFrameTarget));
    if (frameOnly) youtubeOwned.push(violation);
    else if (["serious", "critical"].includes(violation.impact)) atlasBlocking.push(violation);
  }
  return { atlasBlocking, youtubeOwned };
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const iframeNodes = [...document.querySelectorAll("iframe")];
    const nav = document.querySelector(".atlas-mobile-nav");
    const navStyle = nav ? getComputedStyle(nav) : null;
    const article = document.querySelector("main article") || document.querySelector("main");
    const navVisible = Boolean(nav && navStyle && navStyle.display !== "none");
    const navRect = nav?.getBoundingClientRect();
    const bodyPaddingBottom = Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const articleRectAtBottom = article?.getBoundingClientRect();
    const navObscuresArticle = Boolean(
      navVisible
      && navRect
      && articleRectAtBottom
      && articleRectAtBottom.bottom > navRect.top + 1
      && articleRectAtBottom.top < navRect.bottom - 1,
    );
    window.scrollTo(0, 0);
    return {
      iframeCount: iframeNodes.length,
      iframeSrcs: iframeNodes.map((node) => node.getAttribute("src") || ""),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      articleHierarchy: {
        mainCount: document.querySelectorAll("main").length,
        articleCount: document.querySelectorAll("main article").length,
        h1Count: document.querySelectorAll("main h1").length,
        h2Count: document.querySelectorAll("main h2").length,
        title: document.title,
      },
      mobileNavigation: {
        present: Boolean(nav),
        visible: navVisible,
        height: navRect ? Math.round(navRect.height) : 0,
        bodyPaddingBottom,
        navObscuresArticle,
      },
    };
  });
}

async function waitForYouTubeFrame(page) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find(
      (candidate) => candidate !== page.mainFrame() && originOf(candidate.url()) === EXPECTED_FRAME_ORIGIN,
    );
    if (frame) return frame;
    await page.waitForTimeout(500);
  }
  return null;
}

async function openRoute(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
      await page.waitForSelector("main", { timeout: 15_000 });
      await page.evaluate(() => document.fonts?.ready || Promise.resolve());
      await page.waitForTimeout(2_500);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 6) await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

async function captureBrowser(browserDefinition) {
  const browser = await browserDefinition.launch();
  const results = [];
  try {
    for (const viewport of REQUIRED_VIEWPORTS) {
      const context = await browser.newContext({ viewport });
      await configureDeterministicContext(context);
      const page = await context.newPage();
      const telemetry = observePage(page);
      const consoleRecords = [];
      const failedRequests = [];
      const responseErrors = [];
      const pageErrors = [];
      page.on("console", (message) => {
        const location = message.location();
        consoleRecords.push({
          type: message.type(),
          text: message.text(),
          locationUrl: location.url || null,
          origin: originOf(location.url || ""),
        });
      });
      page.on("pageerror", (error) => pageErrors.push({ message: error.message }));
      page.on("requestfailed", (request) => failedRequests.push({
        url: request.url(),
        origin: originOf(request.url()),
        method: request.method(),
        failure: request.failure()?.errorText || "request failed",
      }));
      page.on("response", (response) => {
        if (response.status() >= 400) responseErrors.push({
          url: response.url(),
          origin: originOf(response.url()),
          status: response.status(),
          statusText: response.statusText(),
        });
      });

      const result = {
        browser: browserDefinition.name,
        viewport: viewport.width,
        height: viewport.height,
        route: ROUTE,
        pageHttpStatus: null,
        pageHttp200: false,
        servedCsp: null,
        cspContainsExactFrameSrc: false,
        iframeCount: 0,
        iframeSrcs: [],
        expectedIframePresent: false,
        youtubeChildFrame: false,
        youtubeChildFrameUrl: null,
        atlasCspFrameBlockingViolations: [],
        atlasFailedRequests: [],
        atlasResponseErrors: [],
        atlasPageErrors: [],
        horizontalOverflow: null,
        articleHierarchy: null,
        mobileNavigation: null,
        atlasAccessibilityBlockingViolations: [],
        youtubeOwnedAccessibilityFindings: [],
        youtubeOwnedConsoleErrors: [],
        youtubeOwnedFailedRequests: [],
        youtubeOwnedResponseErrors: [],
        passed: false,
      };

      try {
        const response = await openRoute(page, `${PREVIEW_URL}${ROUTE}`);
        result.pageHttpStatus = response.status();
        result.pageHttp200 = response.status() === 200;
        result.servedCsp = response.headers()["content-security-policy"] || null;
        result.cspContainsExactFrameSrc = Boolean(
          result.servedCsp?.includes("frame-src 'self' https://www.youtube.com"),
        );
        result.youtubeChildFrame = Boolean(await waitForYouTubeFrame(page));
        result.youtubeChildFrameUrl = page.frames().find(
          (candidate) => candidate !== page.mainFrame() && originOf(candidate.url()) === EXPECTED_FRAME_ORIGIN,
        )?.url() || null;
        const layout = await inspectLayout(page);
        result.iframeCount = layout.iframeCount;
        result.iframeSrcs = layout.iframeSrcs;
        result.expectedIframePresent = layout.iframeCount === 1 && layout.iframeSrcs[0] === EXPECTED_IFRAME;
        result.horizontalOverflow = layout.horizontalOverflow;
        result.articleHierarchy = layout.articleHierarchy;
        result.mobileNavigation = layout.mobileNavigation;
        const accessibility = await accessibilityReport(page);
        const classifiedAccessibility = classifyAccessibility(accessibility);
        result.atlasAccessibilityBlockingViolations = classifiedAccessibility.atlasBlocking;
        result.youtubeOwnedAccessibilityFindings = classifiedAccessibility.youtubeOwned;
      } catch (error) {
        result.captureError = error?.stack || String(error);
      }

      result.atlasCspFrameBlockingViolations = consoleRecords.filter(
        ({ origin, text }) => origin === atlasOrigin && isCspFrameBlock(text),
      );
      result.atlasFailedRequests = failedRequests.filter(({ origin }) => origin === atlasOrigin);
      result.atlasResponseErrors = responseErrors.filter(({ origin }) => origin === atlasOrigin);
      result.atlasPageErrors = pageErrors;
      result.youtubeOwnedConsoleErrors = consoleRecords.filter(
        ({ origin, type }) => origin === EXPECTED_FRAME_ORIGIN && type === "error",
      );
      result.youtubeOwnedFailedRequests = failedRequests.filter(({ origin }) => origin === EXPECTED_FRAME_ORIGIN);
      result.youtubeOwnedResponseErrors = responseErrors.filter(({ origin }) => origin === EXPECTED_FRAME_ORIGIN);
      result.telemetry = {
        pageErrors: telemetry.pageErrors,
        consoleErrors: telemetry.consoleErrors,
        failedRequests: telemetry.failedRequests,
        responseErrors: telemetry.responseErrors,
      };
      result.passed = Boolean(
        result.pageHttp200
        && result.expectedIframePresent
        && result.youtubeChildFrame
        && result.cspContainsExactFrameSrc
        && !result.atlasCspFrameBlockingViolations.length
        && !result.horizontalOverflow
        && !result.atlasFailedRequests.length
        && !result.atlasResponseErrors.length
        && !result.atlasPageErrors.length
        && !result.atlasAccessibilityBlockingViolations.length,
      );
      results.push(result);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function main() {
  const results = [];
  for (const browserDefinition of BROWSERS) {
    results.push(...await captureBrowser(browserDefinition));
  }
  const report = {
    schema_version: "atlas-systems/sonin-youtube-evidence/v1",
    preview: PREVIEW_URL,
    commit: HEAD_SHA,
    route: ROUTE,
    expected_iframe: EXPECTED_IFRAME,
    browsers: BROWSERS.map(({ name }) => name),
    viewports: REQUIRED_VIEWPORTS,
    results,
  };
  writeJson(reportPath, report);
  for (const result of results) {
    console.log(JSON.stringify({
      browser: result.browser,
      viewport: result.viewport,
      http: result.pageHttpStatus,
      iframe: result.expectedIframePresent,
      childFrame: result.youtubeChildFrame,
      atlasCspBlockers: result.atlasCspFrameBlockingViolations.length,
      overflow: result.horizontalOverflow,
      atlasA11yBlockers: result.atlasAccessibilityBlockingViolations.length,
      youtubeFindings: result.youtubeOwnedAccessibilityFindings.length
        + result.youtubeOwnedConsoleErrors.length
        + result.youtubeOwnedFailedRequests.length
        + result.youtubeOwnedResponseErrors.length,
      passed: result.passed,
    }));
  }
  if (results.length !== BROWSERS.length * REQUIRED_VIEWPORTS.length || results.some(({ passed }) => !passed)) {
    throw new Error("SONIN exact route evidence failed");
  }
}

main().catch((error) => {
  const message = error?.stack || String(error);
  writeJson(errorPath, { error: message });
  console.error(message);
  process.exitCode = 1;
});
