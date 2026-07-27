import fs from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox } from "playwright";

const base = process.env.PREVIEW_URL;
if (!base) throw new Error("PREVIEW_URL is required");

const routes = [
  ["observability", "/systems/observability/", "systems"],
  ["reliability", "/systems/reliability/", "systems"],
  ["evidence", "/systems/evidence/", "systems"],
  ["system-symphony", "/lab/system-symphony/", "lab"],
];
const viewports = [
  ["320", { width: 320, height: 760 }],
  ["375", { width: 375, height: 812 }],
  ["768", { width: 768, height: 900 }],
  ["1024", { width: 1024, height: 900 }],
  ["1440", { width: 1440, height: 1000 }],
];
const browsers = [
  ["chrome", () => chromium.launch({ channel: "chrome", headless: true })],
  ["firefox", () => firefox.launch({ headless: true })],
];
const fixtureHosts = new Set([
  "api.atlas-systems.uk",
  "corpus.atlas-systems.uk",
  "ramone.atlas-systems.uk",
]);
const report = [];
const failures = [];

function writeReport() {
  fs.writeFileSync(
    "batch-h-evidence.json",
    `${JSON.stringify({
      preview: base,
      commit: process.env.HEAD_SHA,
      fixture: "deterministic-unavailable",
      browsers: browsers.map(([name]) => name),
      viewports: viewports.map(([name]) => Number(name)),
      routes: report,
      failures,
    }, null, 2)}\n`,
  );
}

function summarizeViolation(item) {
  return {
    id: item.id,
    impact: item.impact,
    help: item.help,
    nodes: item.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  };
}

async function configureContext(context) {
  await context.addInitScript(() => {
    Object.defineProperty(window, "__ATLAS_EVIDENCE_MODE__", {
      value: "deterministic-unavailable",
      configurable: false,
      writable: false,
    });
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    let audioContextCount = 0;
    if (NativeAudioContext) {
      const TrackedAudioContext = new Proxy(NativeAudioContext, {
        construct(target, args, newTarget) {
          audioContextCount += 1;
          return Reflect.construct(target, args, newTarget);
        },
      });
      if (window.AudioContext) window.AudioContext = TrackedAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = TrackedAudioContext;
    }
    Object.defineProperty(window, "__ATLAS_AUDIO_CONTEXT_COUNT__", {
      get: () => audioContextCount,
      configurable: false,
    });
  });

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (fixtureHosts.has(url.hostname)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ error: "deterministic Batch H preview fixture" }),
      });
      return;
    }
    await route.continue();
  });
}

async function openWithRetry(page, route) {
  const url = new URL(route, base).toString();
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
      await page.waitForSelector(".atlas-header__brand", { timeout: 15_000 });
      await page.waitForSelector(".atlas-header__actions", { timeout: 15_000 });
      await page.waitForSelector(".atlas-search-control", { timeout: 15_000 });
      await page.waitForSelector("main.focus-main", { timeout: 15_000 });
      await page.waitForSelector(".focus-hero, .symphony-flagship", { timeout: 15_000 });
      await page.evaluate(() => document.fonts?.ready || Promise.resolve());
      await page.waitForTimeout(1_000);
      return url;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

async function inspectPage(page) {
  return page.evaluate(() => {
    function selectorFor(element) {
      if (!element || element === document.documentElement) return "html";
      if (element === document.body) return "body";
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join("");
      return `${element.tagName.toLowerCase()}${classes}`;
    }

    const width = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflow = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: selectorFor(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.left < -1 || item.right > width + 1)
      .sort((a, b) => b.width - a.width)
      .slice(0, 12);
    const header = document.querySelector(".atlas-header");
    const hero = document.querySelector(".focus-hero, .symphony-flagship");
    const mobileNav = document.querySelector(".atlas-mobile-nav");
    const mobileVisible = Boolean(mobileNav) && getComputedStyle(mobileNav).display !== "none";
    const statusStates = [...document.querySelectorAll(".focus-status-line[data-state], .focus-state[data-state]")]
      .map((node) => node.dataset.state)
      .filter(Boolean);
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
      audioContextCount: window.__ATLAS_AUDIO_CONTEXT_COUNT__ || 0,
      audioToggleText: document.querySelector("[data-audio-toggle]")?.textContent?.trim() || null,
      modalCount: document.querySelectorAll('[aria-modal="true"]').length,
      inlineSymphonyRegion: Boolean(document.querySelector('.symphony-console[role="region"]')),
      activeElement: selectorFor(activeElement),
      activeElementInsideSymphony: Boolean(activeElement?.closest?.("[data-symphony-page-host]")),
    };
  });
}

async function inspectKeyboardFocus(page) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(50);
  return page.evaluate(() => {
    const element = document.activeElement;
    const style = element ? getComputedStyle(element) : null;
    return {
      tag: element?.tagName?.toLowerCase() || null,
      text: element?.textContent?.trim()?.slice(0, 80) || null,
      href: element?.getAttribute?.("href") || null,
      focusVisible: Boolean(document.querySelector(":focus-visible")),
      outlineStyle: style?.outlineStyle || null,
      outlineWidth: style?.outlineWidth || null,
    };
  });
}

function semanticFailures(evidence, focus, browserName, viewportName, routeName, activeSection) {
  const prefix = `${browserName}/${viewportName}/${routeName}`;
  const values = [];
  if (!evidence.title.includes("Atlas Systems")) values.push(`${prefix}: title omits Atlas Systems`);
  if (evidence.h1Count !== 1) values.push(`${prefix}: expected one h1, found ${evidence.h1Count}`);
  if (evidence.mainCount !== 1) values.push(`${prefix}: expected one main, found ${evidence.mainCount}`);
  if (!evidence.headerPresent || !["fixed", "sticky"].includes(evidence.headerPosition)) values.push(`${prefix}: governed header is missing or not pinned`);
  if (!evidence.searchPresent) values.push(`${prefix}: global search control is missing`);
  if (evidence.heroTop === null || evidence.headerBottom === null || evidence.heroTop < evidence.headerBottom) values.push(`${prefix}: header obscures the focused page hero`);
  if (evidence.scrollWidth > evidence.width + 1) values.push(`${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}; ${JSON.stringify(evidence.overflow)}`);

  const mobileExpected = Number(viewportName) < 768;
  if (mobileExpected !== evidence.mobileVisible) values.push(`${prefix}: mobile navigation visibility is incorrect`);
  if (mobileExpected && evidence.mobileActive !== 1) values.push(`${prefix}: active mobile ${activeSection} route is missing`);
  if (mobileExpected && evidence.bodyPaddingBottom + 1 < evidence.mobileNavHeight) values.push(`${prefix}: mobile navigation can obscure content or focus`);
  if (evidence.fixtureMode !== "deterministic-unavailable") values.push(`${prefix}: deterministic fixture mode is missing`);
  if (evidence.canonical && !evidence.canonical.startsWith("https://atlas-systems.uk/")) values.push(`${prefix}: preview hostname entered canonical metadata`);
  if (!focus.focusVisible || ["body", "html"].includes(focus.tag)) values.push(`${prefix}: keyboard focus is not visibly placed on an interactive control`);
  if (routeName !== "system-symphony" && evidence.statusStates.length && evidence.healthyStates === evidence.statusStates.length) values.push(`${prefix}: unavailable evidence was rendered entirely healthy`);

  if (routeName === "system-symphony") {
    if (evidence.audioContextCount !== 0) values.push(`${prefix}: audio context was created before user consent`);
    if (evidence.audioToggleText !== "Start") values.push(`${prefix}: audio control did not remain at Start before consent`);
    if (evidence.modalCount !== 0 || !evidence.inlineSymphonyRegion) values.push(`${prefix}: Symphony is not embedded as a non-modal page region`);
    if (evidence.activeElementInsideSymphony) values.push(`${prefix}: Symphony stole focus during page load`);
  }
  return values;
}

async function captureRoute(context, browserName, viewportName, routeName, route, activeSection) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const url = await openWithRetry(page, route);
    const evidence = await inspectPage(page);
    const focus = await inspectKeyboardFocus(page);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = accessibility.violations.map(summarizeViolation);
    const blocking = violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    const pageFailures = semanticFailures(evidence, focus, browserName, viewportName, routeName, activeSection);
    if (pageErrors.length) pageFailures.push(`${browserName}/${viewportName}/${routeName}: page errors ${JSON.stringify(pageErrors)}`);
    if (blocking.length) pageFailures.push(`${browserName}/${viewportName}/${routeName}: serious accessibility findings ${JSON.stringify(blocking)}`);

    const fullPage = `batch-h-screenshots/${browserName}-${viewportName}-${routeName}-full.png`;
    const viewportShot = `batch-h-screenshots/${browserName}-${viewportName}-${routeName}-viewport.png`;
    await page.screenshot({ path: fullPage, fullPage: true });
    await page.screenshot({ path: viewportShot, fullPage: false });
    failures.push(...pageFailures);
    report.push({
      browser: browserName,
      viewport: viewportName,
      route,
      url,
      activeSection,
      evidence,
      focus,
      pageErrors,
      accessibilityViolations: violations,
      failures: pageFailures,
      screenshots: { fullPage, viewport: viewportShot },
    });
  } catch (error) {
    const message = `${browserName}/${viewportName}/${routeName}: ${error.stack || error.message}`;
    failures.push(message);
    report.push({ browser: browserName, viewport: viewportName, route, failures: [message] });
  } finally {
    writeReport();
    await page.close();
  }
}

async function runNoJavaScriptAcceptance() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [viewportName, viewport] of [["375", { width: 375, height: 812 }], ["1440", { width: 1440, height: 1000 }]]) {
      const context = await browser.newContext({ viewport, javaScriptEnabled: false, serviceWorkers: "block" });
      try {
        for (const [routeName, route] of routes) {
          const page = await context.newPage();
          const prefix = `chrome/${viewportName}/${routeName}/no-js`;
          try {
            const response = await page.goto(new URL(route, base).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
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
            const pageFailures = [];
            if (!evidence.navVisible || !evidence.mainVisible) pageFailures.push(`${prefix}: source navigation or main content is hidden`);
            if (!evidence.systemsLink) pageFailures.push(`${prefix}: source navigation omits Systems`);
            if (evidence.iconCount !== 5) pageFailures.push(`${prefix}: source icon package is incomplete`);
            if (evidence.scrollWidth > evidence.width + 1) pageFailures.push(`${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}`);
            failures.push(...pageFailures);
            report.push({ browser: "chrome", viewport: viewportName, route, scenario: "no-js", evidence, failures: pageFailures });
          } catch (error) {
            const message = `${prefix}: ${error.stack || error.message}`;
            failures.push(message);
            report.push({ browser: "chrome", viewport: viewportName, route, scenario: "no-js", failures: [message] });
          } finally {
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
  fs.mkdirSync("batch-h-screenshots", { recursive: true });
  for (const [browserName, launch] of browsers) {
    const browser = await launch();
    try {
      for (const [viewportName, viewport] of viewports) {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
        await configureContext(context);
        try {
          for (const [routeName, route, activeSection] of routes) {
            await captureRoute(context, browserName, viewportName, routeName, route, activeSection);
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  await runNoJavaScriptAcceptance();
  writeReport();
  if (failures.length) throw new Error(`Batch H evidence failed with ${failures.length} findings:\n${failures.join("\n")}`);
}

try {
  await run();
} catch (error) {
  fs.writeFileSync("batch-h-capture-error.txt", `${error.stack || error.message}\n`);
  process.exitCode = 1;
}
