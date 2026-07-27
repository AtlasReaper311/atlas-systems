import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, firefox } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PREVIEW_URL = process.env.PREVIEW_URL;
const HEAD_SHA = process.env.HEAD_SHA || 'unknown';
const OUTPUT = process.cwd();
const SCREENSHOTS = path.join(OUTPUT, 'speculum-screenshots');
const EVIDENCE = path.join(OUTPUT, 'speculum-evidence.json');
const ERROR_FILE = path.join(OUTPUT, 'speculum-capture-error.txt');
const ROUTE = '/lab/speculum/';

if (!PREVIEW_URL) throw new Error('PREVIEW_URL is required');

const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'mobile-320', width: 320, height: 900 }),
  Object.freeze({ name: 'mobile-375', width: 375, height: 900 }),
  Object.freeze({ name: 'tablet-768', width: 768, height: 1024 }),
  Object.freeze({ name: 'desktop-1024', width: 1024, height: 900 }),
  Object.freeze({ name: 'desktop-1440', width: 1440, height: 1000 }),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function routeUrl(label) {
  const base = PREVIEW_URL.replace(/\/$/, '');
  return `${base}${ROUTE}?evidence=${encodeURIComponent(`${HEAD_SHA.slice(0, 12)}-${label}`)}`;
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        overflowY: style.overflowY,
      };
    };
    const controls = rect('.controls');
    const detail = rect('.detail');
    const ledger = rect('.ledger-wrap');
    const field = rect('#speculum');
    const canvas = rect('#spc-canvas');
    const rail = rect('.rail');
    const tolerance = 1.5;
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance,
      controls,
      detail,
      ledger,
      field,
      canvas,
      rail,
      controlsOverlapDetail: Boolean(controls && detail && controls.bottom > detail.top + tolerance),
      detailOverlapLedger: Boolean(detail && ledger && detail.bottom > ledger.top + tolerance),
    };
  });
}

function assertRailLayout(snapshot, label) {
  assert(!snapshot.documentOverflow, `${label}: document has horizontal overflow`);
  assert(snapshot.controls && snapshot.detail && snapshot.ledger, `${label}: rail regions are missing`);
  assert(!snapshot.controlsOverlapDetail, `${label}: controls overlap the node dossier`);
  assert(!snapshot.detailOverlapLedger, `${label}: node dossier overlaps the ledger`);
  assert(snapshot.canvas?.width > 0 && snapshot.canvas?.height > 0, `${label}: canvas has no rendered area`);
  assert(snapshot.canvas?.display !== 'none', `${label}: canvas display is none`);
  assert(snapshot.canvas?.visibility !== 'hidden', `${label}: canvas visibility is hidden`);
}

async function canvasDiagnostics(page) {
  return page.evaluate(() => {
    const inspect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        selector,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        width: style.width,
        minWidth: style.minWidth,
        height: style.height,
        gridArea: style.gridArea,
        gridTemplateColumns: style.gridTemplateColumns,
        overflow: style.overflow,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        readyState: document.readyState,
      },
      main: inspect('main'),
      field: inspect('#speculum'),
      fieldCanvas: inspect('.field-canvas'),
      canvas: inspect('#spc-canvas'),
      rail: inspect('.rail'),
      stylesheets: [...document.styleSheets].map((sheet) => sheet.href || 'inline'),
    };
  });
}

async function waitForBase(page, label) {
  await page.goto(routeUrl(label), { waitUntil: 'networkidle' });
  await page.locator('#spc-canvas').waitFor({ state: 'attached' });
  await page.locator('#spc-present').waitFor({ state: 'visible' });
  try {
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#spc-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const box = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return box.width > 0
        && box.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    }, null, { timeout: 15000 });
  } catch (error) {
    const diagnostics = await canvasDiagnostics(page);
    await page.screenshot({ path: path.join(SCREENSHOTS, `${label}-geometry-failure.png`), fullPage: true });
    throw new Error(`${label}: canvas geometry did not become usable: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
  await page.waitForFunction(() => document.querySelectorAll('#spc-speeds button').length === 4);
}

async function openCentreDossier(page) {
  const box = await page.locator('#spc-canvas').boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'canvas bounding box is unavailable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.querySelector('#spc-detail h3')?.textContent?.trim() === 'atlas-systems');
}

async function populateLedger(page) {
  await page.getByRole('button', { name: 'Week · 86400×' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#spc-ledger li:not(.ledger-empty)').length > 0, null, { timeout: 8000 });
}

async function verifyPresentation(page) {
  const before = await page.locator('#spc-canvas').boundingBox();
  await page.locator('#spc-present').click();
  await page.waitForFunction(() => document.querySelector('#speculum')?.classList.contains('is-presenting'));
  const state = await page.evaluate(() => ({
    railDisplay: getComputedStyle(document.querySelector('.rail')).display,
    legendDisplay: getComputedStyle(document.querySelector('.field-keys')).display,
    pressed: document.querySelector('#spc-present')?.getAttribute('aria-pressed'),
  }));
  const after = await page.locator('#spc-canvas').boundingBox();
  assert(state.railDisplay === 'none', 'presentation: rail remains visible');
  assert(state.legendDisplay === 'none', 'presentation: legend remains visible');
  assert(state.pressed === 'true', 'presentation: control does not expose pressed state');
  assert(before && after && after.width > before.width, 'presentation: canvas did not expand into the rail area');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#speculum')?.classList.contains('is-presenting'));
}

async function verifyExport(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#spc-export').click();
  const download = await downloadPromise;
  assert(/^speculum-\d{8}T\d{6}Z\.png$/.test(download.suggestedFilename()), 'export: unexpected PNG filename');
  await download.cancel();
}

async function verifyTraceCompletion(page) {
  await page.locator('#spc-trace').click();
  await page.waitForFunction(() => document.querySelector('.dossier-badge.is-trace')?.textContent?.trim() === 'step 5/5', null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#spc-trace-completion')?.classList.contains('is-active'));
  const trace = await page.evaluate(() => ({
    path: Boolean(document.querySelector('#spc-trace-completion .spc-trace-pulse')),
    arrival: Boolean(document.querySelector('#spc-trace-completion .spc-trace-arrival')),
    status: document.querySelector('#spc-polish-status')?.textContent || '',
  }));
  assert(trace.path && trace.arrival, 'trace: completion overlay is incomplete');
  assert(trace.status.includes('not live execution evidence'), 'trace: completion status loses the evidence boundary');
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  await waitForBase(page, viewport.name);
  const initial = await layoutSnapshot(page);
  assertRailLayout(initial, viewport.name);
  await openCentreDossier(page);
  const dossier = await layoutSnapshot(page);
  assertRailLayout(dossier, `${viewport.name}/dossier`);
  await populateLedger(page);
  const populated = await layoutSnapshot(page);
  assertRailLayout(populated, `${viewport.name}/ledger`);
  await page.screenshot({ path: path.join(SCREENSHOTS, `${viewport.name}.png`), fullPage: true });
  await context.close();
  return { name: viewport.name, initial, dossier, populated };
}

async function runTextZoom(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  await waitForBase(page, 'text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.waitForTimeout(150);
  const snapshot = await layoutSnapshot(page);
  assertRailLayout(snapshot, 'text-200');
  await page.screenshot({ path: path.join(SCREENSHOTS, 'text-200.png'), fullPage: true });
  await context.close();
  return snapshot;
}

async function runBrowserZoom() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 720, height: 500 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await waitForBase(page, 'browser-zoom-200');
  const snapshot = await layoutSnapshot(page);
  assertRailLayout(snapshot, 'browser-zoom-200');
  await page.screenshot({ path: path.join(SCREENSHOTS, 'browser-zoom-200.png'), fullPage: true });
  await browser.close();
  return snapshot;
}

async function runReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await waitForBase(page, 'reduced-motion');
  await page.locator('#spc-reduced').waitFor({ state: 'visible' });
  const snapshot = await layoutSnapshot(page);
  assertRailLayout(snapshot, 'reduced-motion');
  await page.screenshot({ path: path.join(SCREENSHOTS, 'reduced-motion.png'), fullPage: true });
  await context.close();
  return snapshot;
}

async function runInteractive(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await waitForBase(page, 'interactive');
  await openCentreDossier(page);
  await populateLedger(page);
  await verifyPresentation(page);
  await verifyExport(page);
  await verifyTraceCompletion(page);
  const layout = await layoutSnapshot(page);
  assertRailLayout(layout, 'interactive/trace');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = axe.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
  assert(serious.length === 0, `interactive: serious accessibility violations: ${serious.map((item) => item.id).join(', ')}`);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'interactive-trace-complete.png'), fullPage: true });
  await context.close();
  return { layout, axeViolations: axe.violations.length };
}

async function main() {
  await fs.mkdir(SCREENSHOTS, { recursive: true });
  const browser = await firefox.launch();
  const results = [];
  try {
    for (const viewport of VIEWPORTS) results.push(await runViewport(browser, viewport));
    const textZoom = await runTextZoom(browser);
    const reducedMotion = await runReducedMotion(browser);
    const interactive = await runInteractive(browser);
    const browserZoom = await runBrowserZoom();
    const evidence = {
      route: ROUTE,
      previewUrl: PREVIEW_URL,
      headSha: HEAD_SHA,
      capturedAt: new Date().toISOString(),
      viewports: results,
      textZoom,
      browserZoom,
      reducedMotion,
      interactive,
      assertions: {
        railRegionsNeverOverlap: true,
        documentHasNoHorizontalOverflow: true,
        dossierStateCovered: true,
        populatedLedgerCovered: true,
        guidedTraceCompletionCovered: true,
        presentationExpansionCovered: true,
        pngExportCovered: true,
        reducedMotionCovered: true,
        textAtTwoHundredPercentCovered: true,
        browserZoomAtTwoHundredPercentCovered: true,
      },
    };
    await fs.writeFile(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  const message = error?.stack || String(error);
  await fs.writeFile(ERROR_FILE, `${message}\n`, 'utf8');
  console.error(message);
  process.exitCode = 1;
});
