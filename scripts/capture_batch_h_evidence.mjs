import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  BROWSERS,
  accessibilityReport,
  actionableConsoleErrors,
  configureDeterministicContext,
  observePage,
  openWithRetry,
  resourceMetrics,
  writeJson,
} from "./interface-evidence/browser-core.mjs";
import {
  EVIDENCE_SCHEMA_VERSION,
  STANDARD_VIEWPORTS,
} from "./interface-evidence/contract.mjs";

const base = process.env.PREVIEW_URL;
if (!base) throw new Error("PREVIEW_URL is required");

const headSha = process.env.HEAD_SHA || "unknown";
const outputDirectory = process.env.BATCH_H_EVIDENCE_OUTPUT_DIR || process.cwd();
const screenshotDirectory = path.join(outputDirectory, "batch-h-screenshots");
const reportPath = path.join(outputDirectory, "batch-h-evidence.json");
const errorPath = path.join(outputDirectory, "batch-h-capture-error.txt");
const routes = Object.freeze([
  Object.freeze({ name: "observability", path: "/systems/observability/", activeSection: "systems" }),
  Object.freeze({ name: "reliability", path: "/systems/reliability/", activeSection: "systems" }),
  Object.freeze({ name: "evidence", path: "/systems/evidence/", activeSection: "systems" }),
  Object.freeze({ name: "system-symphony", path: "/lab/system-symphony/", activeSection: "lab" }),
]);
const results = [];
const findings = [];
const blockingFailures = [];

function writeReport() {
  writeJson(reportPath, {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    profile: "batch-h",
    preview: base,
    commit: headSha,
    fixture: "deterministic-unavailable",
    browsers: BROWSERS.map(({ name }) => name),
    viewports: STANDARD_VIEWPORTS,
    routes: results,
    findings,
    blockingFailures,
  });
}

async function inspectPage(page) {
  return page.evaluate(() => {
    function selectorFor(element) {
      if (!element || element === document.documentElement) return "html";
      if (element === document.body) return "body";
      if (element.id) return `#${CSS.escape(element.id)}`;
      return `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join("")}`;
    }
    const width = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflow = [...document.querySelectorAll("body *")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { selector: selectorFor(element), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter((item) => item.left < -1 || item.right > width + 1).sort((a, b) => b.width - a.width).slice(0, 12);
    const header = document.querySelector(".atlas-header");
    const hero = document.querySelector(".focus-hero, .symphony-flagship");
    const mobileNav = document.querySelector(".atlas-mobile-nav");
    const mobileVisible = Boolean(mobileNav) && getComputedStyle(mobileNav).display !== "none";
    const statusStates = [...document.querySelectorAll(".focus-status-line[data-state], .focus-state[data-state]")]
      .map((node) => node.dataset.state).filter(Boolean);
    const activeElement = document.activeElement;
    return {
      title: document.title,
      width,
      scrollWidth,
      overflow,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      headerPresent: Boolean(header),
      headerPosition: header ? getComputedStyle(header).position : null,
      headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
      heroTop: hero ? Math.round(hero.getBoundingClientRect().top) : null,
      searchPresent: Boolean(document.querySelector(".atlas-search-control")),
      mobileVisible,
      mobileActive: document.querySelectorAll('.atlas-mobile-nav [aria-current="page"]').length,
      mobileNavHeight: mobileNav ? Math.round(mobileNav.getBoundingClientRect().height) : 0,
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0,
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      fixtureMode: window.__ATLAS_EVIDENCE_MODE__ || null,
      statusStates,
      healthyStates: statusStates.filter((state) => state === "healthy").length,
      audioContextStates: window.__ATLAS_AUDIO_CONTEXT_STATES__ || [],
      audioToggleText: document.querySelector("[data-audio-toggle]")?.textContent?.trim() || null,
      modalCount: document.querySelectorAll('[aria-modal="true"]').length,
      inlineSymphonyRegion: Boolean(document.querySelector('.symphony-console[role="region"]')),
      activeElement: selectorFor(activeElement),
      activeElementInsideSymphony: Boolean(activeElement?.closest?.("[data-symphony-page-host]")),
    };
  });
}

async function inspectKeyboardFocus(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      const style = element ? getComputedStyle(element) : null;
      const rect = element?.getBoundingClientRect?.();
      const header = document.querySelector(".atlas-header");
      const mobile = document.querySelector(".atlas-mobile-nav");
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
      const mobileTop = mobile && getComputedStyle(mobile).display !== "none" ? mobile.getBoundingClientRect().top : innerHeight;
      const insideFixedNavigation = Boolean(element?.closest?.(".atlas-header, .atlas-mobile-nav"));
      return {
        tag: element?.tagName?.toLowerCase() || null,
        text: element?.textContent?.trim()?.slice(0, 80) || null,
        href: element?.getAttribute?.("href") || null,
        focusVisible: Boolean(document.querySelector(":focus-visible")),
        outlineStyle: style?.outlineStyle || null,
        outlineWidth: style?.outlineWidth || null,
        insideFixedNavigation,
        obscured: Boolean(
          rect
          && !insideFixedNavigation
          && (rect.top < headerBottom - 1 || rect.bottom > mobileTop + 1)
        ),
      };
    });
    if (state.tag && !["body", "html"].includes(state.tag)) return state;
  }
  return { tag: null, focusVisible: false, obscured: false };
}

function evaluate({ route, viewport, evidence, focus, accessibility, telemetry }) {
  const prefix = `${route.name}/${viewport.name}`;
  const routeFindings = [];
  const blockers = [];
  if (!evidence.title.includes("Atlas Systems")) blockers.push(`${prefix}: title omits Atlas Systems`);
  if (evidence.h1Count !== 1) blockers.push(`${prefix}: expected one h1, found ${evidence.h1Count}`);
  if (evidence.mainCount !== 1) blockers.push(`${prefix}: expected one main, found ${evidence.mainCount}`);
  if (!evidence.headerPresent || !["fixed", "sticky"].includes(evidence.headerPosition)) routeFindings.push(`${prefix}: governed header is missing or not pinned`);
  if (!evidence.searchPresent) routeFindings.push(`${prefix}: global search control is missing`);
  if (evidence.heroTop === null || evidence.headerBottom === null || evidence.heroTop < evidence.headerBottom) blockers.push(`${prefix}: header obscures the focused page hero`);
  if (evidence.scrollWidth > evidence.width + 1) blockers.push(`${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}; ${JSON.stringify(evidence.overflow)}`);
  const mobileExpected = viewport.width < 768;
  if (mobileExpected !== evidence.mobileVisible) routeFindings.push(`${prefix}: mobile navigation visibility is incorrect`);
  if (mobileExpected && evidence.mobileActive !== 1) routeFindings.push(`${prefix}: active mobile ${route.activeSection} route is missing`);
  if (mobileExpected && evidence.bodyPaddingBottom + 1 < evidence.mobileNavHeight) blockers.push(`${prefix}: mobile navigation can obscure content or focus`);
  if (evidence.fixtureMode !== "deterministic-unavailable") blockers.push(`${prefix}: deterministic fixture mode is missing`);
  if (evidence.canonical && !evidence.canonical.startsWith("https://atlas-systems.uk/")) blockers.push(`${prefix}: preview hostname entered canonical metadata`);
  if (!focus.focusVisible || !focus.tag) blockers.push(`${prefix}: keyboard focus is not visibly placed on an interactive control`);
  if (focus.obscured) blockers.push(`${prefix}: fixed navigation obscures focused content`);
  if (route.name !== "system-symphony" && evidence.statusStates.length && evidence.healthyStates === evidence.statusStates.length) routeFindings.push(`${prefix}: unavailable evidence was rendered entirely healthy`);
  if (route.name === "system-symphony") {
    if (evidence.audioContextStates.filter((state) => state === "running").length !== 0) blockers.push(`${prefix}: audio context entered running state before user consent`);
    if (!evidence.audioToggleText?.startsWith("Start")) blockers.push(`${prefix}: audio control did not remain a Start action before consent`);
    if (evidence.modalCount !== 0 || !evidence.inlineSymphonyRegion) blockers.push(`${prefix}: Symphony is not embedded as a non-modal page region`);
    if (evidence.activeElementInsideSymphony) blockers.push(`${prefix}: Symphony stole focus during page load`);
  }
  if (accessibility.blocking.length) blockers.push(`${prefix}: serious accessibility findings ${JSON.stringify(accessibility.blocking)}`);
  if (telemetry.pageErrors.length) blockers.push(`${prefix}: page errors ${JSON.stringify(telemetry.pageErrors)}`);
  const consoleErrors = actionableConsoleErrors(telemetry.consoleErrors);
  if (consoleErrors.length) blockers.push(`${prefix}: console errors ${JSON.stringify(consoleErrors)}`);
  if (telemetry.failedRequests.length) blockers.push(`${prefix}: failed requests ${JSON.stringify(telemetry.failedRequests)}`);
  if (telemetry.responseErrors.length) blockers.push(`${prefix}: HTTP errors ${JSON.stringify(telemetry.responseErrors)}`);
  return { routeFindings, blockers };
}

async function captureRoute(browserName, browser, route, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await configureDeterministicContext(context, {
    fixtureLabel: "deterministic Batch H preview fixture",
    trackAudioContexts: true,
  });
  const page = await context.newPage();
  const telemetry = observePage(page);
  const result = {
    browser: browserName,
    viewport: viewport.name,
    viewportAuthority: viewport.authority,
    route: route.path,
    routeName: route.name,
    findings: [],
    blockingFailures: [],
  };
  try {
    const url = new URL(route.path, base).toString();
    const navigation = await openWithRetry(page, url, {
      readySelectors: [".atlas-header__brand", ".atlas-header__actions", ".atlas-search-control", "main.focus-main", ".focus-hero, .symphony-flagship"],
      settleMs: 1_000,
    });
    const evidence = await inspectPage(page);
    const focus = await inspectKeyboardFocus(page);
    const accessibility = await accessibilityReport(page);
    const resources = await resourceMetrics(page);
    const fullName = `${browserName}-${viewport.name}-${route.name}-full.png`;
    const viewportName = `${browserName}-${viewport.name}-${route.name}-viewport.png`;
    await page.screenshot({ path: path.join(screenshotDirectory, fullName), fullPage: true });
    await page.screenshot({ path: path.join(screenshotDirectory, viewportName), fullPage: false });
    const assessment = evaluate({ route, viewport, evidence, focus, accessibility, telemetry });
    result.url = url;
    result.navigation = navigation;
    result.evidence = evidence;
    result.focus = focus;
    result.accessibilityViolations = accessibility.violations;
    result.telemetry = telemetry;
    result.resources = resources;
    result.screenshots = { fullPage: `batch-h-screenshots/${fullName}`, viewport: `batch-h-screenshots/${viewportName}` };
    result.findings = assessment.routeFindings;
    result.blockingFailures = assessment.blockers;
    findings.push(...assessment.routeFindings);
    blockingFailures.push(...assessment.blockers);
  } catch (error) {
    const message = `${browserName}/${viewport.name}/${route.name}: ${error.stack || error.message}`;
    result.blockingFailures.push(message);
    blockingFailures.push(message);
  } finally {
    results.push(result);
    writeReport();
    await context.close();
  }
}

async function runNoJavaScriptAcceptance() {
  const browser = await BROWSERS[0].launch();
  try {
    for (const viewport of STANDARD_VIEWPORTS.filter(({ name }) => ["375", "1440"].includes(name))) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        javaScriptEnabled: false,
        serviceWorkers: "block",
      });
      try {
        for (const route of routes) {
          const page = await context.newPage();
          const prefix = `chrome/${viewport.name}/${route.name}/no-js`;
          const result = { browser: "chrome", viewport: viewport.name, route: route.path, scenario: "no-js", findings: [], blockingFailures: [] };
          try {
            const response = await page.goto(new URL(route.path, base).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
            if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
            const evidence = await page.evaluate(() => {
              const nav = document.querySelector('body > nav[aria-label="Primary navigation"]');
              const main = document.querySelector("main.focus-main");
              return {
                navVisible: Boolean(nav) && getComputedStyle(nav).display !== "none" && nav.getBoundingClientRect().height > 0,
                mainVisible: Boolean(main) && main.getBoundingClientRect().height > 0,
                systemsLink: Boolean(nav?.querySelector('a[href="/systems/"]')),
                iconCount: ["/favicon.ico", "/favicon-16x16.png", "/favicon-32x32.png", "/apple-touch-icon.png", "/site.webmanifest"]
                  .filter((href) => document.head.querySelector(`link[href="${href}"]`)).length,
                width: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
              };
            });
            if (!evidence.navVisible || !evidence.mainVisible) result.blockingFailures.push(`${prefix}: source navigation or main content is hidden`);
            if (!evidence.systemsLink) result.findings.push(`${prefix}: source navigation omits Systems`);
            if (evidence.iconCount !== 5) result.blockingFailures.push(`${prefix}: source icon package is incomplete`);
            if (evidence.scrollWidth > evidence.width + 1) result.blockingFailures.push(`${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}`);
            result.evidence = evidence;
          } catch (error) {
            result.blockingFailures.push(`${prefix}: ${error.stack || error.message}`);
          } finally {
            findings.push(...result.findings);
            blockingFailures.push(...result.blockingFailures);
            results.push(result);
            writeReport();
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function run() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  for (const browserDefinition of BROWSERS) {
    const browser = await browserDefinition.launch();
    try {
      for (const route of routes) {
        for (const viewport of STANDARD_VIEWPORTS) {
          await captureRoute(browserDefinition.name, browser, route, viewport);
        }
      }
    } finally {
      await browser.close();
    }
  }
  await runNoJavaScriptAcceptance();
  writeReport();
  if (blockingFailures.length) throw new Error(`Batch H evidence failed with ${blockingFailures.length} blocking finding(s):\n${blockingFailures.join("\n")}`);
}

try {
  await run();
} catch (error) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(errorPath, `${error.stack || error.message}\n`);
  writeReport();
  process.exitCode = 1;
}
