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
  buildEvidencePlan,
} from "./interface-evidence/contract.mjs";

const base = process.env.PREVIEW_URL;
if (!base) throw new Error("PREVIEW_URL is required");

const headSha = process.env.HEAD_SHA || "unknown";
const outputDirectory = process.env.INTERFACE_EVIDENCE_OUTPUT_DIR || process.cwd();
const sitemapPath = process.env.SITEMAP_PATH || path.join(process.cwd(), "sitemap.xml");
const changedRoutes = JSON.parse(process.env.CHANGED_ROUTES_JSON || "[]");
const screenshotDirectory = path.join(outputDirectory, "screenshots");
const reportPath = path.join(outputDirectory, "evidence.json");
const errorPath = path.join(outputDirectory, "capture-error.txt");
const sitemapXml = fs.readFileSync(sitemapPath, "utf8");
const plan = buildEvidencePlan({ sitemapXml, changedRoutes });
const viewportByName = new Map(STANDARD_VIEWPORTS.map((viewport) => [viewport.name, viewport]));
const routeResults = [];
const findings = [];
const blockingFailures = [];

function recordMessages(target, messages) {
  target.push(...messages);
  findings.push(...messages);
}

function writeReport() {
  writeJson(reportPath, {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    preview: base,
    commit: headSha,
    fixture: "deterministic-unavailable",
    browsers: BROWSERS.map(({ name }) => name),
    viewports: STANDARD_VIEWPORTS,
    plan,
    routes: routeResults,
    findings,
    blockingFailures,
  });
}

async function inspectPage(page, profile) {
  return page.evaluate((currentProfile) => {
    function selectorFor(element) {
      if (!element || element === document.documentElement) return "html";
      if (element === document.body) return "body";
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join("");
      return `${element.tagName.toLowerCase()}${classes}`;
    }

    function canvasState(selector) {
      const canvas = document.querySelector(selector);
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const rect = canvas.getBoundingClientRect();
      let distinctPixels = 0;
      try {
        const context = canvas.getContext("2d");
        const colours = new Set();
        const steps = 8;
        for (let row = 0; row < steps; row += 1) {
          for (let column = 0; column < steps; column += 1) {
            const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((column + 0.5) * canvas.width / steps)));
            const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((row + 0.5) * canvas.height / steps)));
            const pixel = context.getImageData(x, y, 1, 1).data;
            colours.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`);
          }
        }
        distinctPixels = colours.size;
      } catch {
        distinctPixels = -1;
      }
      return {
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        distinctPixels,
        display: getComputedStyle(canvas).display,
        visibility: getComputedStyle(canvas).visibility,
      };
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
    const mobileNav = document.querySelector(".atlas-mobile-nav");
    const mobileVisible = Boolean(mobileNav) && getComputedStyle(mobileNav).display !== "none";
    const workProjects = [...document.querySelectorAll(".project-entry")];
    const cardLayout = [...document.querySelectorAll(".system-card")].map((card) => {
      const signature = card.querySelector(":scope > .card-signature");
      if (!signature) return { visual: card.dataset.visual || null, signature: false, overlaps: [], routeOverflow: 0 };
      const signatureRect = signature.getBoundingClientRect();
      const content = [...card.querySelectorAll(":scope > .card-top, :scope > h3, :scope > p, :scope > .data-mode, :scope > .card-route")];
      const route = card.querySelector(":scope > .card-route");
      const overlaps = content.filter((element) => {
        const rect = element.getBoundingClientRect();
        const horizontal = Math.min(rect.right, signatureRect.right) - Math.max(rect.left, signatureRect.left);
        const vertical = Math.min(rect.bottom, signatureRect.bottom) - Math.max(rect.top, signatureRect.top);
        return horizontal > 1 && vertical > 1;
      }).map(selectorFor);
      return {
        visual: card.dataset.visual || null,
        signature: true,
        overlaps,
        routeOverflow: route ? Math.max(0, route.scrollWidth - route.clientWidth) : 0,
      };
    });

    return {
      profile: currentProfile,
      title: document.title,
      width,
      scrollWidth,
      overflow,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      fixtureMode: window.__ATLAS_EVIDENCE_MODE__ || null,
      headerPresent: Boolean(header),
      brandPresent: Boolean(document.querySelector(".atlas-header__brand")),
      actionsPresent: Boolean(document.querySelector(".atlas-header__actions")),
      searchPresent: Boolean(document.querySelector(".atlas-search-control")),
      systemsLink: Boolean([...document.querySelectorAll(".atlas-header__nav a")].find((link) => link.textContent.trim() === "Systems")),
      mobileVisible,
      mobileActive: document.querySelectorAll('.atlas-mobile-nav [aria-current="page"]').length,
      mobileNavHeight: mobileNav ? Math.round(mobileNav.getBoundingClientRect().height) : 0,
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0,
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
      bearingCanvas: currentProfile === "bearing" ? canvasState("#lattice") : null,
      speculumCanvas: currentProfile === "speculum" ? canvasState("#spc-canvas") : null,
      interactiveCount: document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').length,
    };
  }, profile);
}

async function inspectFocus(page) {
  const count = await page.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').count();
  if (!count) return { interactiveCount: 0, checked: false };
  for (let attempt = 0; attempt < Math.min(count, 12); attempt += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      const style = element ? getComputedStyle(element) : null;
      const rect = element?.getBoundingClientRect?.();
      const header = document.querySelector(".atlas-header");
      const mobile = document.querySelector(".atlas-mobile-nav");
      const headerBottom = header && ["fixed", "sticky"].includes(getComputedStyle(header).position)
        ? header.getBoundingClientRect().bottom
        : 0;
      const mobileTop = mobile && getComputedStyle(mobile).display !== "none"
        ? mobile.getBoundingClientRect().top
        : innerHeight;
      const insideFixedNavigation = Boolean(element?.closest?.(".atlas-header, .atlas-mobile-nav"));
      return {
        tag: element?.tagName?.toLowerCase() || null,
        text: element?.textContent?.trim()?.slice(0, 100) || null,
        href: element?.getAttribute?.("href") || null,
        focusVisible: Boolean(document.querySelector(":focus-visible")),
        outlineStyle: style?.outlineStyle || null,
        outlineWidth: style?.outlineWidth || null,
        rect: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
        insideFixedNavigation,
        obscuredByFixedNavigation: Boolean(
          rect
          && !insideFixedNavigation
          && (rect.top < headerBottom - 1 || rect.bottom > mobileTop + 1)
        ),
      };
    });
    if (state.tag && !["body", "html"].includes(state.tag)) return { ...state, interactiveCount: count, checked: true };
  }
  return { interactiveCount: count, checked: true, tag: null, focusVisible: false };
}

function evaluateRoute({ descriptor, viewport, semantics, focus, accessibility, telemetry }) {
  const prefix = `${descriptor.name}/${viewport.name}`;
  const blockers = [];
  const routeFindings = [];
  if (!semantics.title.includes("Atlas Systems")) blockers.push(`${prefix}: title omits Atlas Systems`);
  if (semantics.h1Count !== 1) blockers.push(`${prefix}: expected one h1, found ${semantics.h1Count}`);
  if (semantics.mainCount !== 1) blockers.push(`${prefix}: expected one main landmark, found ${semantics.mainCount}`);
  if (semantics.scrollWidth > semantics.width + 1) blockers.push(`${prefix}: horizontal overflow ${semantics.scrollWidth} > ${semantics.width}; ${JSON.stringify(semantics.overflow)}`);
  if (semantics.fixtureMode !== "deterministic-unavailable") blockers.push(`${prefix}: deterministic fixture mode is missing`);
  if (semantics.canonical && !semantics.canonical.startsWith("https://atlas-systems.uk/")) blockers.push(`${prefix}: preview hostname entered canonical metadata`);
  if (focus.checked && (!focus.focusVisible || !focus.tag)) blockers.push(`${prefix}: keyboard focus is not visibly placed on an interactive control`);
  if (focus.obscuredByFixedNavigation) blockers.push(`${prefix}: fixed navigation obscures the focused control`);
  if (accessibility.blocking.length) blockers.push(`${prefix}: serious accessibility findings ${JSON.stringify(accessibility.blocking)}`);
  if (telemetry.pageErrors.length) blockers.push(`${prefix}: page errors ${JSON.stringify(telemetry.pageErrors)}`);
  const consoleErrors = actionableConsoleErrors(telemetry.consoleErrors);
  if (consoleErrors.length) blockers.push(`${prefix}: console errors ${JSON.stringify(consoleErrors)}`);
  if (telemetry.failedRequests.length) blockers.push(`${prefix}: failed requests ${JSON.stringify(telemetry.failedRequests)}`);
  if (telemetry.responseErrors.length) blockers.push(`${prefix}: HTTP errors ${JSON.stringify(telemetry.responseErrors)}`);

  if (descriptor.requiresStandardShell) {
    if (!semantics.headerPresent || !semantics.brandPresent || !semantics.actionsPresent) routeFindings.push(`${prefix}: governed header structure is incomplete`);
    if (!semantics.searchPresent) routeFindings.push(`${prefix}: global search control is missing`);
    if (!semantics.systemsLink) routeFindings.push(`${prefix}: Systems is missing from desktop navigation`);
    const mobileExpected = viewport.width < 768;
    if (mobileExpected !== semantics.mobileVisible) routeFindings.push(`${prefix}: mobile navigation visibility is incorrect`);
    if (mobileExpected && semantics.bodyPaddingBottom + 1 < semantics.mobileNavHeight) blockers.push(`${prefix}: bottom navigation can obscure content or focus`);
    if (mobileExpected && !["home", "not-found"].includes(descriptor.name) && semantics.mobileActive !== 1) routeFindings.push(`${prefix}: active mobile route is missing`);
  }

  if (descriptor.kind === "work" && semantics.visibleWorkProjectCount !== semantics.workProjectCount) {
    blockers.push(`${prefix}: visible Work projects ${semantics.visibleWorkProjectCount} != ${semantics.workProjectCount}`);
  }
  if (["lab", "systems"].includes(descriptor.kind) && semantics.cardSignatureCount !== semantics.cardCount) {
    routeFindings.push(`${prefix}: card signatures ${semantics.cardSignatureCount} != cards ${semantics.cardCount}`);
  }
  if (semantics.cardLayoutOverlaps.length) blockers.push(`${prefix}: card signature/text overlaps ${JSON.stringify(semantics.cardLayoutOverlaps)}`);
  if (semantics.cardRouteOverflows.length) blockers.push(`${prefix}: card CTA overflows ${JSON.stringify(semantics.cardRouteOverflows)}`);

  if (descriptor.profile === "bearing") {
    const canvas = semantics.bearingCanvas;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0 || canvas.backingWidth <= 0 || canvas.backingHeight <= 0) blockers.push(`${prefix}: Bearing canvas has no rendered area`);
  }
  if (descriptor.profile === "speculum") {
    const canvas = semantics.speculumCanvas;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0 || canvas.backingWidth <= 0 || canvas.backingHeight <= 0) blockers.push(`${prefix}: Speculum canvas has no rendered area`);
  }

  return { blockers, findings: routeFindings };
}

async function captureRoute(browserName, browser, descriptor, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await configureDeterministicContext(context);
  const page = await context.newPage();
  const telemetry = observePage(page);
  const url = new URL(descriptor.path, base).toString();
  const result = {
    browser: browserName,
    viewport: viewport.name,
    viewportAuthority: viewport.authority,
    route: descriptor.path,
    routeName: descriptor.name,
    kind: descriptor.kind,
    profile: descriptor.profile,
    representative: descriptor.representative,
    changed: descriptor.changed,
    url,
    findings: [],
    blockingFailures: [],
  };
  try {
    const navigation = await openWithRetry(page, url, { readySelectors: ["main"] });
    await page.evaluate(async () => {
      for (const element of document.querySelectorAll(".project-entry, .reveal")) {
        element.scrollIntoView({ block: "center" });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
    const semantics = await inspectPage(page, descriptor.profile);
    const focus = await inspectFocus(page);
    const accessibility = await accessibilityReport(page);
    const resources = await resourceMetrics(page);
    let screenshots = { fullPage: null, viewport: null };
    if (descriptor.screenshotViewportNames.includes(viewport.name)) {
      const fullName = `${browserName}-${viewport.name}-${descriptor.name}-full.png`;
      await page.screenshot({ path: path.join(screenshotDirectory, fullName), fullPage: true });
      screenshots.fullPage = `screenshots/${fullName}`;
      if (viewport.width < 768) {
        const viewportName = `${browserName}-${viewport.name}-${descriptor.name}-viewport.png`;
        await page.screenshot({ path: path.join(screenshotDirectory, viewportName), fullPage: false });
        screenshots.viewport = `screenshots/${viewportName}`;
      }
    }
    const evaluation = evaluateRoute({ descriptor, viewport, semantics, focus, accessibility, telemetry });
    result.navigation = navigation;
    result.semantics = semantics;
    result.focus = focus;
    result.accessibilityViolations = accessibility.violations;
    result.telemetry = telemetry;
    result.resources = resources;
    result.screenshots = screenshots;
    result.acceptanceMode = descriptor.changed ? "blocking-changed-route" : "reporting-baseline";
    if (descriptor.changed) {
      result.findings = evaluation.findings;
      result.blockingFailures = evaluation.blockers;
      findings.push(...evaluation.findings);
      blockingFailures.push(...evaluation.blockers);
    } else {
      result.findings = [...evaluation.findings, ...evaluation.blockers];
      result.blockingFailures = [];
      findings.push(...result.findings);
    }
  } catch (error) {
    const message = `${browserName}/${viewport.name}/${descriptor.name}: ${error.stack || error.message}`;
    result.blockingFailures.push(message);
    blockingFailures.push(message);
  } finally {
    routeResults.push(result);
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
        for (const [routeName, route, selector] of [
          ["work", "/work/", ".project-entry"],
          ["writing", "/writing/", ".article-entry"],
        ]) {
          const page = await context.newPage();
          const prefix = `chrome/${viewport.name}/${routeName}/no-js`;
          const result = { browser: "chrome", viewport: viewport.name, route, scenario: "no-js", findings: [], blockingFailures: [] };
          try {
            const response = await page.goto(new URL(route, base).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
            if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
            const evidence = await page.evaluate((itemSelector) => {
              const items = [...document.querySelectorAll(itemSelector)];
              const visible = items.filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== "none" && Number.parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
              }).length;
              return {
                itemCount: items.length,
                visible,
                systemsLink: Boolean(document.querySelector('nav[aria-label="Primary navigation"] a[href="/systems/"]')),
                iconCount: ["/favicon.ico", "/favicon-16x16.png", "/favicon-32x32.png", "/apple-touch-icon.png", "/site.webmanifest"]
                  .filter((href) => document.head.querySelector(`link[href="${href}"]`)).length,
                width: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
              };
            }, selector);
            if (!evidence.itemCount || evidence.visible !== evidence.itemCount) result.blockingFailures.push(`${prefix}: visible entries ${evidence.visible} != ${evidence.itemCount}`);
            if (!evidence.systemsLink) result.findings.push(`${prefix}: source navigation omits Systems`);
            if (evidence.iconCount !== 5) result.blockingFailures.push(`${prefix}: source icon package is incomplete`);
            if (evidence.scrollWidth > evidence.width + 1) result.blockingFailures.push(`${prefix}: horizontal overflow ${evidence.scrollWidth} > ${evidence.width}`);
            result.semantics = evidence;
          } catch (error) {
            result.blockingFailures.push(`${prefix}: ${error.stack || error.message}`);
          } finally {
            findings.push(...result.findings);
            blockingFailures.push(...result.blockingFailures);
            routeResults.push(result);
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

async function runTextZoomAcceptance() {
  const browser = await BROWSERS[0].launch();
  try {
    for (const viewport of STANDARD_VIEWPORTS.filter(({ name }) => ["375", "1440"].includes(name))) {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion,
          serviceWorkers: "block",
        });
        await configureDeterministicContext(context);
        try {
          for (const [routeName, route] of [["lab", "/lab/"], ["systems", "/systems/"]]) {
            const page = await context.newPage();
            const scenario = `text-200-long-copy-${reducedMotion}`;
            const prefix = `chrome/${viewport.name}/${routeName}/${scenario}`;
            const result = { browser: "chrome", viewport: viewport.name, route, scenario, findings: [], blockingFailures: [] };
            try {
              await openWithRetry(page, new URL(route, base).toString(), { readySelectors: ["main"] });
              await page.evaluate(() => {
                document.documentElement.style.fontSize = "200%";
                const copy = document.querySelector(".system-card p");
                if (copy) copy.textContent = "Long-content fixture: this deliberately expanded description verifies that editorial copy can grow without colliding with the card signature, maturity badge, or destination action.";
              });
              await page.waitForTimeout(100);
              const semantics = await inspectPage(page, "standard-shell");
              if (semantics.scrollWidth > semantics.width + 1) result.blockingFailures.push(`${prefix}: horizontal overflow ${semantics.scrollWidth} > ${semantics.width}; ${JSON.stringify(semantics.overflow)}`);
              if (semantics.cardLayoutOverlaps.length) result.blockingFailures.push(`${prefix}: card signature/text overlaps ${JSON.stringify(semantics.cardLayoutOverlaps)}`);
              if (semantics.cardRouteOverflows.length) result.blockingFailures.push(`${prefix}: card CTA overflows ${JSON.stringify(semantics.cardRouteOverflows)}`);
              result.semantics = semantics;
            } catch (error) {
              result.blockingFailures.push(`${prefix}: ${error.stack || error.message}`);
            } finally {
              blockingFailures.push(...result.blockingFailures);
              routeResults.push(result);
              writeReport();
              await page.close();
            }
          }
        } finally {
          await context.close();
        }
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
      for (const descriptor of plan.routes) {
        for (const viewportName of descriptor.viewportNames) {
          const viewport = viewportByName.get(viewportName);
          if (!viewport) throw new Error(`Unknown viewport: ${viewportName}`);
          await captureRoute(browserDefinition.name, browser, descriptor, viewport);
        }
      }
    } finally {
      await browser.close();
    }
  }
  await runNoJavaScriptAcceptance();
  await runTextZoomAcceptance();
  writeReport();
  if (blockingFailures.length) {
    throw new Error(`Interface evidence failed with ${blockingFailures.length} blocking finding(s):\n${blockingFailures.join("\n")}`);
  }
}

try {
  await run();
} catch (error) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(errorPath, `${error.stack || error.message}\n`);
  writeReport();
  process.exitCode = 1;
}
