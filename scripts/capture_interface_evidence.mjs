import fs from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox } from "playwright";

const base = process.env.PREVIEW_URL;
if (!base) throw new Error("PREVIEW_URL is required");

const routes = [
  ["home", "/"],
  ["systems", "/systems/"],
  ["lab", "/lab/"],
  ["system-map", "/lab/system-map/"],
  ["console", "/lab/console/"],
  ["work", "/work/"],
  ["writing", "/writing/"],
  ["about", "/about/"],
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

function writeReport() {
  fs.writeFileSync(
    "evidence.json",
    `${JSON.stringify({
      preview: base,
      commit: process.env.HEAD_SHA,
      fixture: "deterministic-unavailable",
      browsers: browsers.map(([name]) => name),
      viewports: viewports.map(([name]) => Number(name)),
      routes: report,
    }, null, 2)}\n`,
  );
}

async function openWithRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() ?? "no response"}`);
      }
      await page.waitForSelector(".atlas-header__brand", { timeout: 15_000 });
      await page.waitForSelector(".atlas-header__actions", { timeout: 15_000 });
      await page.evaluate(() => document.fonts?.ready || Promise.resolve());
      await page.waitForTimeout(700);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

async function configureContext(context) {
  await context.addInitScript(() => {
    Object.defineProperty(window, "__ATLAS_EVIDENCE_MODE__", {
      value: "deterministic-unavailable",
      configurable: false,
      writable: false,
    });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (fixtureHosts.has(url.hostname)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ error: "deterministic preview fixture" }),
      });
      return;
    }
    await route.continue();
  });
}

async function inspectPage(page, browserName, viewportName, routeName) {
  const evidence = await page.evaluate(() => {
    function selectorFor(element) {
      if (!element || element === document.documentElement) return "html";
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList]
        .slice(0, 3)
        .map((name) => `.${CSS.escape(name)}`)
        .join("");
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

    const mobileNav = document.querySelector(".atlas-mobile-nav");
    const mobileVisible = Boolean(mobileNav) && getComputedStyle(mobileNav).display !== "none";
    const navHeight = mobileVisible ? mobileNav.getBoundingClientRect().height : 0;
    const bodyPaddingBottom = Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    return {
      title: document.title,
      width,
      scrollWidth,
      overflow,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      systemsLink: Boolean(
        [...document.querySelectorAll(".atlas-header__nav a")]
          .find((link) => link.textContent.trim() === "Systems"),
      ),
      mobileVisible,
      mobileActive: document.querySelectorAll('.atlas-mobile-nav [aria-current="page"]').length,
      navHeight,
      bodyPaddingBottom,
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      fixtureMode: window.__ATLAS_EVIDENCE_MODE__ || null,
    };
  });

  const prefix = `${browserName}/${viewportName}/${routeName}`;
  if (!evidence.title.includes("Atlas Systems")) {
    throw new Error(`${prefix}: title does not include Atlas Systems`);
  }
  if (evidence.h1Count !== 1) {
    throw new Error(`${prefix}: expected one h1, found ${evidence.h1Count}`);
  }
  if (evidence.mainCount !== 1) {
    throw new Error(`${prefix}: expected one main landmark, found ${evidence.mainCount}`);
  }
  if (!evidence.systemsLink) {
    throw new Error(`${prefix}: Systems is missing from desktop navigation`);
  }
  if (evidence.scrollWidth > evidence.width + 1) {
    throw new Error(
      `${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}; ${JSON.stringify(evidence.overflow)}`,
    );
  }
  const mobileExpected = Number(viewportName) < 768;
  if (mobileExpected !== evidence.mobileVisible) {
    throw new Error(`${prefix}: mobile navigation visibility is incorrect`);
  }
  if (mobileExpected && evidence.bodyPaddingBottom + 1 < evidence.navHeight) {
    throw new Error(`${prefix}: bottom navigation can obscure content or focus`);
  }
  if (mobileExpected && routeName !== "home" && evidence.mobileActive !== 1) {
    throw new Error(`${prefix}: active mobile route is missing`);
  }
  if (evidence.fixtureMode !== "deterministic-unavailable") {
    throw new Error(`${prefix}: deterministic fixture mode is missing`);
  }
  if (evidence.canonical && !evidence.canonical.startsWith("https://atlas-systems.uk/")) {
    throw new Error(`${prefix}: preview hostname entered canonical metadata`);
  }
  return evidence;
}

async function run() {
  fs.mkdirSync("screenshots", { recursive: true });
  for (const [browserName, launch] of browsers) {
    const browser = await launch();
    try {
      for (const [viewportName, viewport] of viewports) {
        const context = await browser.newContext({
          viewport,
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        await configureContext(context);
        try {
          for (const [routeName, route] of routes) {
            const page = await context.newPage();
            const pageErrors = [];
            page.on("pageerror", (error) => pageErrors.push(error.message));
            const url = new URL(route, base).toString();
            await openWithRetry(page, url);
            const semantics = await inspectPage(page, browserName, viewportName, routeName);
            const accessibility = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze();
            const blocking = accessibility.violations.filter(
              (item) => item.impact === "serious" || item.impact === "critical",
            );
            const fullPage = `screenshots/${browserName}-${viewportName}-${routeName}-full.png`;
            await page.screenshot({ path: fullPage, fullPage: true });
            let viewportShot = null;
            if (Number(viewportName) < 768) {
              viewportShot = `screenshots/${browserName}-${viewportName}-${routeName}-viewport.png`;
              await page.screenshot({ path: viewportShot, fullPage: false });
            }
            report.push({
              browser: browserName,
              viewport: viewportName,
              route,
              url,
              semantics,
              pageErrors,
              accessibilityViolations: accessibility.violations.map((item) => ({
                id: item.id,
                impact: item.impact,
                nodes: item.nodes.length,
              })),
              screenshots: { fullPage, viewport: viewportShot },
            });
            writeReport();
            if (pageErrors.length) {
              throw new Error(`${browserName}/${viewportName}/${routeName}: page errors ${JSON.stringify(pageErrors)}`);
            }
            if (blocking.length) {
              const summary = blocking.map((item) => ({
                id: item.id,
                impact: item.impact,
                nodes: item.nodes.length,
              }));
              throw new Error(
                `${browserName}/${viewportName}/${routeName}: serious accessibility findings ${JSON.stringify(summary)}`,
              );
            }
            await page.close();
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  writeReport();
}

try {
  await run();
} catch (error) {
  fs.writeFileSync("capture-error.txt", `${error.stack || error.message}\n`);
  process.exitCode = 1;
}
