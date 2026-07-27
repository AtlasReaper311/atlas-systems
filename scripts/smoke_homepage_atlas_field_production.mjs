import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const siteUrl = process.env.SITE_URL;
if (!siteUrl) throw new Error("SITE_URL is required");

const expectedSha = process.env.EXPECTED_SHA ?? "unknown";
const outputDir = process.env.HOMEPAGE_FIELD_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", "homepage-atlas-field-production-smoke");
const pageUrl = new URL(
  `/?atlas-deploy=${encodeURIComponent(expectedSha)}&atlas-field-smoke=1`,
  siteUrl,
).href;
const expectedEntrypoints = Object.freeze({
  stylesheet: "/css/home-v2-base.css?v=20260727-atlas-field-production-v1",
  interactions: "/static/js/homepage-interactions.js?v=20260727-atlas-field-production-v1",
  truth: "/static/js/live/homepage-truth.js?v=20260727-atlas-field-production-v1",
});

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const consoleErrors = [];
const pageErrors = [];
let evidence = null;
let failure = null;

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

async function collectEvidence() {
  return page.evaluate((expected) => {
    const entrypoints = {
      stylesheet: document.querySelector(`link[rel="stylesheet"][href="${expected.stylesheet}"]`)?.getAttribute("href") ?? null,
      interactions: document.querySelector(`script[src="${expected.interactions}"]`)?.getAttribute("src") ?? null,
      truth: document.querySelector(`script[type="module"][src="${expected.truth}"]`)?.getAttribute("src") ?? null,
    };
    const hero = document.querySelector(".hero");
    const canvas = hero?.querySelector(":scope > canvas.atlas-field-canvas");
    if (!canvas) {
      return {
        location: location.href,
        entrypoints,
        heroState: hero?.dataset.atlasFieldState ?? null,
        canvasPresent: false,
      };
    }

    const bounds = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const context = canvas.getContext("2d");
    let sampledPixels = 0;
    let luminousPixels = 0;

    if (context && canvas.width > 0 && canvas.height > 0) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixelStride = 64;
      for (let offset = 0; offset < pixels.length; offset += 4 * pixelStride) {
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        sampledPixels += 1;
        if (alpha > 12 && luminance > 24) luminousPixels += 1;
      }
    }

    return {
      location: location.href,
      entrypoints,
      heroState: hero?.dataset.atlasFieldState ?? null,
      canvasPresent: true,
      mode: canvas.dataset.mode ?? null,
      frame: Number(canvas.dataset.frame || 0),
      preset: canvas.dataset.atlasFieldPreset ?? null,
      playback: canvas.dataset.playback ?? null,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      bitmapWidth: canvas.width,
      bitmapHeight: canvas.height,
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      sampledPixels,
      luminousPixels,
    };
  }, expectedEntrypoints);
}

try {
  const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(response?.ok(), true, `production homepage answered ${response?.status()}`);

  await page.waitForFunction(() => {
    const hero = document.querySelector(".hero");
    const canvas = hero?.querySelector(":scope > canvas.atlas-field-canvas");
    if (!canvas || hero?.dataset.atlasFieldState === "unavailable") return false;
    const animated = canvas.dataset.mode === "animated" && Number(canvas.dataset.frame || 0) >= 3;
    const staticFrame = canvas.dataset.mode === "static";
    return canvas.width > 0 && canvas.height > 0 && (animated || staticFrame);
  }, null, { timeout: 25_000, polling: 100 });

  await page.waitForTimeout(750);
  evidence = await collectEvidence();

  assert.deepEqual(evidence.entrypoints, expectedEntrypoints, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.canvasPresent, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.heroState, "ready", JSON.stringify(evidence, null, 2));
  assert.equal(evidence.preset, "hero", JSON.stringify(evidence, null, 2));
  assert.ok(evidence.cssWidth >= 900, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.cssHeight >= 400, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.bitmapWidth > 0 && evidence.bitmapHeight > 0, JSON.stringify(evidence, null, 2));
  assert.notEqual(evidence.display, "none", JSON.stringify(evidence, null, 2));
  assert.notEqual(evidence.visibility, "hidden", JSON.stringify(evidence, null, 2));
  assert.ok(evidence.opacity >= 0.35, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.sampledPixels > 0, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.luminousPixels >= 8, JSON.stringify(evidence, null, 2));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    consoleErrors.filter((message) => /AtlasField/i.test(message)),
    [],
    JSON.stringify(consoleErrors, null, 2),
  );
} catch (error) {
  failure = error;
  evidence = evidence ?? await collectEvidence().catch((collectionError) => ({
    collectionError: collectionError.message,
  }));
} finally {
  await page.screenshot({
    path: path.join(outputDir, "homepage-atlas-field-production.png"),
    fullPage: false,
  }).catch(() => {});
  await writeFile(
    path.join(outputDir, "evidence.json"),
    `${JSON.stringify({
      ok: failure === null,
      pageUrl,
      expectedSha,
      expectedEntrypoints,
      failure: failure ? { name: failure.name, message: failure.message, stack: failure.stack } : null,
      evidence,
      pageErrors,
      consoleErrors,
    }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
}

if (failure) throw failure;
console.log(`Production homepage AtlasField smoke passed: ${pageUrl}`);
