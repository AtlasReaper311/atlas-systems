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
  introStylesheet: "/lab/shared/lab-intro-field.css?v=20260727-lab-intro-field-v1",
  introModule: "/lab/shared/lab-intro-field.js?v=20260727-lab-intro-field-v1",
  cardStylesheet: "/lab/shared/system-map-card-field.css?v=20260727-system-map-card-field-v2",
  cardModule: "/lab/shared/system-map-card-field.js?v=20260727-system-map-card-field-v2",
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
    const resources = new Set(performance.getEntriesByType("resource").map((entry) => {
      const resourceUrl = new URL(entry.name);
      return `${resourceUrl.pathname}${resourceUrl.search}`;
    }));
    const entrypoints = {
      shell: document.querySelector(`script[type="module"][src="${expected.shell}"]`)?.getAttribute("src") ?? null,
      introStylesheet: document.querySelector(`link[rel="stylesheet"][href="${expected.introStylesheet}"]`)?.getAttribute("href") ?? null,
      introModule: resources.has(expected.introModule) ? expected.introModule : null,
      cardStylesheet: document.querySelector(`link[rel="stylesheet"][href="${expected.cardStylesheet}"]`)?.getAttribute("href") ?? null,
      cardModule: resources.has(expected.cardModule) ? expected.cardModule : null,
    };

    function snapshot(host, stateKey) {
      const canvases = host?.querySelectorAll(":scope > canvas.atlas-field-canvas") ?? [];
      const canvas = canvases[0] ?? null;
      if (!canvas) {
        return {
          hostPresent: Boolean(host),
          state: host?.dataset[stateKey] ?? null,
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
          if (alpha > 8 && luminance > 18) luminousPixels += 1;
        }
      }

      return {
        hostPresent: true,
        state: host.dataset[stateKey] ?? null,
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
    }

    return {
      location: location.href,
      entrypoints,
      intro: snapshot(document.querySelector(".page-intro"), "atlasIntroFieldState"),
      card: snapshot(document.querySelector("#system-map.featured"), "atlasFieldState"),
    };
  }, expectedEntrypoints);
}

function assertCanvas(rendered, {
  preset,
  minimumWidth,
  minimumHeight,
  minimumOpacity,
  maximumOpacity,
  minimumLuminousPixels,
}) {
  assert.equal(rendered.hostPresent, true, JSON.stringify(evidence, null, 2));
  assert.equal(rendered.state, "ready", JSON.stringify(evidence, null, 2));
  assert.equal(rendered.canvasCount, 1, JSON.stringify(evidence, null, 2));
  assert.equal(rendered.canvasPresent, true, JSON.stringify(evidence, null, 2));
  assert.equal(rendered.preset, preset, JSON.stringify(evidence, null, 2));
  assert.ok(rendered.cssWidth >= minimumWidth, JSON.stringify(evidence, null, 2));
  assert.ok(rendered.cssHeight >= minimumHeight, JSON.stringify(evidence, null, 2));
  assert.ok(rendered.bitmapWidth > 0 && rendered.bitmapHeight > 0, JSON.stringify(evidence, null, 2));
  assert.notEqual(rendered.display, "none", JSON.stringify(evidence, null, 2));
  assert.notEqual(rendered.visibility, "hidden", JSON.stringify(evidence, null, 2));
  assert.ok(rendered.opacity >= minimumOpacity, JSON.stringify(evidence, null, 2));
  assert.ok(rendered.opacity <= maximumOpacity, JSON.stringify(evidence, null, 2));
  assert.ok(rendered.sampledPixels > 0, JSON.stringify(evidence, null, 2));
  assert.ok(rendered.luminousPixels >= minimumLuminousPixels, JSON.stringify(evidence, null, 2));
}

try {
  const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(response?.ok(), true, `Lab preview answered ${response?.status()}`);

  await page.waitForFunction(() => {
    const intro = document.querySelector(".page-intro");
    const canvas = intro?.querySelector(":scope > canvas.atlas-field-canvas");
    if (!canvas || intro?.dataset.atlasIntroFieldState === "unavailable") return false;
    const animated = canvas.dataset.mode === "animated" && Number(canvas.dataset.frame || 0) >= 3;
    const staticFrame = canvas.dataset.mode === "static";
    return canvas.width > 0 && canvas.height > 0 && (animated || staticFrame);
  }, null, { timeout: 25_000, polling: 100 });

  await page.locator("#system-map.featured").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);

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
  assertCanvas(evidence.intro, {
    preset: "ambient",
    minimumWidth: 700,
    minimumHeight: 260,
    minimumOpacity: 0.28,
    maximumOpacity: 0.5,
    minimumLuminousPixels: 4,
  });
  assertCanvas(evidence.card, {
    preset: "card",
    minimumWidth: 500,
    minimumHeight: 180,
    minimumOpacity: 0.5,
    maximumOpacity: 0.72,
    minimumLuminousPixels: 8,
  });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    consoleErrors.filter((message) => /AtlasField|System Map card|Lab intro/i.test(message)),
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
    fullPage: true,
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
console.log(`Lab AtlasField preview smoke passed: ${pageUrl}`);
