import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { firefox } from "playwright";

const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) throw new Error("PREVIEW_URL is required");

const expectedSha = process.env.HEAD_SHA ?? "unknown";
const outputDir = process.env.SYSTEM_MAP_FIELD_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", "system-map-card-field-preview-smoke");
const pageUrl = new URL(`/lab/?atlas-field-preview=${encodeURIComponent(expectedSha)}`, previewUrl).href;
const expectedEntrypoints = Object.freeze({
  shell: "/lab/shared/shell.js?v=20260723-interface-v2",
  stylesheet: "/lab/shared/system-map-card-field.css?v=20260727-system-map-card-field-v1",
  module: "/lab/shared/system-map-card-field.js?v=20260727-system-map-card-field-v1",
});

await mkdir(outputDir, { recursive: true });

const browser = await firefox.launch({ headless: true });
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
    const card = document.querySelector("#system-map.featured");
    const canvases = card?.querySelectorAll(":scope > canvas.atlas-field-canvas") ?? [];
    const canvas = canvases[0] ?? null;
    const resources = new Set(performance.getEntriesByType("resource").map((entry) => {
      const resourceUrl = new URL(entry.name);
      return `${resourceUrl.pathname}${resourceUrl.search}`;
    }));
    const entrypoints = {
      shell: document.querySelector(`script[type="module"][src="${expected.shell}"]`)?.getAttribute("src") ?? null,
      stylesheet: document.querySelector(`link[rel="stylesheet"][href="${expected.stylesheet}"]`)?.getAttribute("href") ?? null,
      module: resources.has(expected.module) ? expected.module : null,
    };

    if (!canvas) {
      return {
        location: location.href,
        entrypoints,
        cardPresent: Boolean(card),
        cardState: card?.dataset.atlasFieldState ?? null,
        canvasCount: canvases.length,
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
      const pixelStride = 32;
      for (let offset = 0; offset < pixels.length; offset += 4 * pixelStride) {
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        sampledPixels += 1;
        if (alpha > 10 && luminance > 20) luminousPixels += 1;
      }
    }

    return {
      location: location.href,
      entrypoints,
      cardPresent: true,
      cardState: card.dataset.atlasFieldState ?? null,
      canvasCount: canvases.length,
      canvasPresent: true,
      mode: canvas.dataset.mode ?? null,
      frame: Number(canvas.dataset.frame || 0),
      preset: canvas.dataset.atlasFieldPreset ?? null,
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
  assert.equal(response?.ok(), true, `Lab preview answered ${response?.status()}`);

  await page.waitForFunction(() => {
    const card = document.querySelector("#system-map.featured");
    const canvas = card?.querySelector(":scope > canvas.atlas-field-canvas");
    if (!canvas || card?.dataset.atlasFieldState === "unavailable") return false;
    const animated = canvas.dataset.mode === "animated" && Number(canvas.dataset.frame || 0) >= 3;
    const staticFrame = canvas.dataset.mode === "static";
    return canvas.width > 0 && canvas.height > 0 && (animated || staticFrame);
  }, null, { timeout: 25_000, polling: 100 });

  await page.waitForTimeout(750);
  evidence = await collectEvidence();

  assert.deepEqual(evidence.entrypoints, expectedEntrypoints, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.cardPresent, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.cardState, "ready", JSON.stringify(evidence, null, 2));
  assert.equal(evidence.canvasCount, 1, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.canvasPresent, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.preset, "card", JSON.stringify(evidence, null, 2));
  assert.ok(evidence.cssWidth >= 500, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.cssHeight >= 180, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.bitmapWidth > 0 && evidence.bitmapHeight > 0, JSON.stringify(evidence, null, 2));
  assert.notEqual(evidence.display, "none", JSON.stringify(evidence, null, 2));
  assert.notEqual(evidence.visibility, "hidden", JSON.stringify(evidence, null, 2));
  assert.ok(evidence.opacity >= 0.8, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.sampledPixels > 0, JSON.stringify(evidence, null, 2));
  assert.ok(evidence.luminousPixels >= 8, JSON.stringify(evidence, null, 2));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    consoleErrors.filter((message) => /AtlasField|System Map card/i.test(message)),
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
    path: path.join(outputDir, "system-map-card-field-preview.png"),
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
console.log(`System Map card AtlasField preview smoke passed: ${pageUrl}`);
