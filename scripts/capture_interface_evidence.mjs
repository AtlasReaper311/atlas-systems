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
  ["article-w-01", "/writing/sonin-generative-system/"],
  ["article-w-02", "/writing/slampunk-dynamic-mix-engine/"],
  ["article-w-03", "/writing/ramone-local-ai-system/"],
  ["article-w-04", "/writing/overclocking-specular-core/"],
  ["not-found", "/404.html"],
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

function summarizeViolation(item) {
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
      failures,
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

async function inspectPage(page) {
  return page.evaluate(() => {
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
    const workProjects = [...document.querySelectorAll(".project-entry")];
    const cardLayout = [...document.querySelectorAll(".system-card")].map((card) => {
      const signature = card.querySelector(":scope > .card-signature");
      if (!signature) {
        return {
          visual: card.dataset.visual || null,
          signature: false,
          overlaps: [],
        };
      }
      const signatureRect = signature.getBoundingClientRect();
      const content = [...card.querySelectorAll(":scope > .card-top, :scope > h3, :scope > p, :scope > .data-mode, :scope > .card-route")];
      const route = card.querySelector(":scope > .card-route");
      const overlaps = content
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const horizontal = Math.min(rect.right, signatureRect.right) - Math.max(rect.left, signatureRect.left);
          const vertical = Math.min(rect.bottom, signatureRect.bottom) - Math.max(rect.top, signatureRect.top);
          return horizontal > 1 && vertical > 1;
        })
        .map(selectorFor);
      return {
        visual: card.dataset.visual || null,
        signature: true,
        overlaps,
        routeOverflow: route ? Math.max(0, route.scrollWidth - route.clientWidth) : 0,
      };
    });
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
      workProjectCount: workProjects.length,
      visibleWorkProjectCount: workProjects.filter((project) => {
        const style = getComputedStyle(project);
        const rect = project.getBoundingClientRect();
        return style.display !== "none" && Number.parseFloat(style.opacity) > 0.99 && rect.width > 0 && rect.height > 0;
      }).length,
      cardCount: cardLayout.length,
      cardSignatureCount: cardLayout.filter((item) => item.signature).length,
      cardLayoutOverlaps: cardLayout.filter((item) => item.overlaps.length > 0),
      cardRouteOverflows: cardLayout.filter((item) => item.routeOverflow > 1),
    };
  });
}

function semanticFailures(evidence, browserName, viewportName, routeName) {
  const prefix = `${browserName}/${viewportName}/${routeName}`;
  const values = [];
  if (!evidence.title.includes("Atlas Systems")) values.push(`${prefix}: title does not include Atlas Systems`);
  if (evidence.h1Count !== 1) values.push(`${prefix}: expected one h1, found ${evidence.h1Count}`);
  if (evidence.mainCount !== 1) values.push(`${prefix}: expected one main landmark, found ${evidence.mainCount}`);
  if (!evidence.systemsLink) values.push(`${prefix}: Systems is missing from desktop navigation`);
  if (evidence.scrollWidth > evidence.width + 1) {
    values.push(`${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}; ${JSON.stringify(evidence.overflow)}`);
  }
  const mobileExpected = Number(viewportName) < 768;
  if (mobileExpected !== evidence.mobileVisible) values.push(`${prefix}: mobile navigation visibility is incorrect`);
  if (mobileExpected && evidence.bodyPaddingBottom + 1 < evidence.navHeight) values.push(`${prefix}: bottom navigation can obscure content or focus`);
  if (mobileExpected && !["home", "not-found"].includes(routeName) && evidence.mobileActive !== 1) {
    values.push(`${prefix}: active mobile route is missing`);
  }
  if (evidence.fixtureMode !== "deterministic-unavailable") values.push(`${prefix}: deterministic fixture mode is missing`);
  if (evidence.canonical && !evidence.canonical.startsWith("https://atlas-systems.uk/")) values.push(`${prefix}: preview hostname entered canonical metadata`);
  if (routeName === "work" && evidence.visibleWorkProjectCount !== evidence.workProjectCount) {
    values.push(
      `${prefix}: visible Work projects ${evidence.visibleWorkProjectCount} != ${evidence.workProjectCount}`,
    );
  }
  if (["lab", "systems"].includes(routeName) && evidence.cardSignatureCount !== evidence.cardCount) {
    values.push(`${prefix}: card signatures ${evidence.cardSignatureCount} != cards ${evidence.cardCount}`);
  }
  if (evidence.cardLayoutOverlaps.length) {
    values.push(`${prefix}: card signature/text overlaps ${JSON.stringify(evidence.cardLayoutOverlaps)}`);
  }
  if (evidence.cardRouteOverflows.length) {
    values.push(`${prefix}: card CTA overflows ${JSON.stringify(evidence.cardRouteOverflows)}`);
  }
  return values;
}

async function capturePage(context, browserName, viewportName, routeName, route) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const url = new URL(route, base).toString();
  try {
    await openWithRetry(page, url);
    await page.evaluate(async () => {
      for (const element of document.querySelectorAll(".project-entry, .reveal")) {
        element.scrollIntoView({ block: "center" });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
    const semantics = await inspectPage(page);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = accessibility.violations.map(summarizeViolation);
    const blocking = violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    );
    const fullPage = `screenshots/${browserName}-${viewportName}-${routeName}-full.png`;
    await page.screenshot({ path: fullPage, fullPage: true });
    let viewportShot = null;
    if (Number(viewportName) < 768) {
      viewportShot = `screenshots/${browserName}-${viewportName}-${routeName}-viewport.png`;
      await page.screenshot({ path: viewportShot, fullPage: false });
    }
    const pageFailures = semanticFailures(semantics, browserName, viewportName, routeName);
    if (pageErrors.length) pageFailures.push(`${browserName}/${viewportName}/${routeName}: page errors ${JSON.stringify(pageErrors)}`);
    if (blocking.length) pageFailures.push(`${browserName}/${viewportName}/${routeName}: serious accessibility findings ${JSON.stringify(blocking)}`);
    failures.push(...pageFailures);
    report.push({
      browser: browserName,
      viewport: viewportName,
      route,
      url,
      semantics,
      pageErrors,
      accessibilityViolations: violations,
      failures: pageFailures,
      screenshots: { fullPage, viewport: viewportShot },
    });
  } catch (error) {
    const message = `${browserName}/${viewportName}/${routeName}: ${error.stack || error.message}`;
    failures.push(message);
    report.push({ browser: browserName, viewport: viewportName, route, url, failures: [message] });
  } finally {
    writeReport();
    await page.close();
  }
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
            await capturePage(context, browserName, viewportName, routeName, route);
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
  if (failures.length) {
    throw new Error(`Interface evidence failed with ${failures.length} findings:\n${failures.join("\n")}`);
  }
}

try {
  await run();
} catch (error) {
  fs.writeFileSync("capture-error.txt", `${error.stack || error.message}\n`);
  process.exitCode = 1;
}
