import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { firefox } from "playwright";

const baseUrl = (process.env.PREVIEW_URL || "").replace(/\/$/, "");
const expectedSha = process.env.HEAD_SHA || "";
const outputDir = process.env.SYSTEM_MAP_FIELD_OUTPUT_DIR || "system-map-card-field-preview-smoke";
const systemMapCardSelector = 'a.directory-card[href="/lab/system-map/"]';

assert.ok(baseUrl, "PREVIEW_URL is required");
assert.ok(expectedSha, "HEAD_SHA is required");

const pageUrl = `${baseUrl}/lab/?atlas-field-preview=${encodeURIComponent(expectedSha)}`;
const expectedEntrypoints = {
  shell: "/lab/shared/shell.js?v=20260723-interface-v2",
  introStylesheet: "/lab/shared/lab-intro-field.css?v=20260807-signature-position",
  cardStylesheet: "/lab/shared/system-map-card-field.css?v=20260807-signature-position",
};

await fs.mkdir(outputDir, { recursive: true });

const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];

page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

let evidence = null;

async function collectEvidence() {
  return page.evaluate((cardSelector) => {
    function sampleCanvas(hostSelector, stateKey) {
      const host = document.querySelector(hostSelector);
      const canvas = host?.querySelector(":scope > canvas.atlas-field-canvas") || null;
      const context = canvas?.getContext("2d", { willReadFrequently: true }) || null;
      const rect = canvas?.getBoundingClientRect() || null;
      const style = canvas ? getComputedStyle(canvas) : null;
      const sampleWidth = canvas ? Math.min(canvas.width, 160) : 0;
      const sampleHeight = canvas ? Math.min(canvas.height, 96) : 0;
      let sampledPixels = 0;
      let luminousPixels = 0;

      if (context && sampleWidth > 0 && sampleHeight > 0) {
        const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
        sampledPixels = pixels.length / 4;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3];
          const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
          if (alpha > 8 && luminance > 12) luminousPixels += 1;
        }
      }

      return {
        hostPresent: Boolean(host),
        hostClasses: host ? [...host.classList] : [],
        state: host?.dataset?.[stateKey] || null,
        canvasCount: host?.querySelectorAll(":scope > canvas.atlas-field-canvas").length || 0,
        canvasPresent: Boolean(canvas),
        mode: canvas?.dataset.mode || null,
        frame: Number(canvas?.dataset.frame || 0),
        cssWidth: rect?.width || 0,
        cssHeight: rect?.height || 0,
        bitmapWidth: canvas?.width || 0,
        bitmapHeight: canvas?.height || 0,
        display: style?.display || null,
        visibility: style?.visibility || null,
        opacity: Number(style?.opacity || 0),
        sampledPixels,
        luminousPixels,
      };
    }

    const resources = [...document.querySelectorAll("link[href], script[src]")].map((element) =>
      element.getAttribute("href") || element.getAttribute("src")
    );

    return {
      location: window.location.href,
      entrypoints: {
        shell: resources.find((value) => value?.startsWith("/lab/shared/shell.js")) || null,
        introStylesheet: resources.find((value) => value?.startsWith("/lab/shared/lab-intro-field.css")) || null,
        cardStylesheet: resources.find((value) => value?.startsWith("/lab/shared/system-map-card-field.css")) || null,
      },
      intro: sampleCanvas(".page-intro", "atlasIntroFieldState"),
      card: sampleCanvas(cardSelector, "atlasFieldState"),
    };
  }, systemMapCardSelector);
}

function assertCanvas(rendered, {
  requiredHostClass,
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
  assert.ok(rendered.hostClasses.includes(requiredHostClass), JSON.stringify(evidence, null, 2));
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

  await page.locator(systemMapCardSelector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);

  await page.waitForFunction((cardSelector) => {
    const card = document.querySelector(cardSelector);
    const canvas = card?.querySelector(":scope > canvas.atlas-field-canvas");
    if (!canvas || card?.dataset.atlasFieldState === "unavailable") return false;
    const animated = canvas.dataset.mode === "animated" && Number(canvas.dataset.frame || 0) >= 3;
    const staticFrame = canvas.dataset.mode === "static";
    return canvas.width > 0 && canvas.height > 0 && (animated || staticFrame);
  }, systemMapCardSelector, { timeout: 25_000, polling: 100 });

  await page.waitForTimeout(750);
  evidence = await collectEvidence();

  assert.deepEqual(evidence.entrypoints, expectedEntrypoints, JSON.stringify(evidence, null, 2));
  assertCanvas(evidence.intro, {
    requiredHostClass: "atlas-composition--signal-bloom",
    minimumWidth: 700,
    minimumHeight: 260,
    minimumOpacity: 0.24,
    maximumOpacity: 0.5,
    minimumLuminousPixels: 4,
  });
  assertCanvas(evidence.card, {
    requiredHostClass: "system-map-card-atlas-field",
    minimumWidth: 320,
    minimumHeight: 180,
    minimumOpacity: 0.5,
    maximumOpacity: 0.72,
    minimumLuminousPixels: 8,
  });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));

  await page.screenshot({
    path: path.join(outputDir, "system-map-card-field-preview.png"),
    fullPage: true,
  });

  await fs.writeFile(
    path.join(outputDir, "evidence.json"),
    JSON.stringify({ ok: true, pageUrl, expectedSha, expectedEntrypoints, systemMapCardSelector, evidence, pageErrors, consoleErrors }, null, 2) + "\n"
  );
} catch (error) {
  evidence ||= await collectEvidence().catch(() => null);
  await page.screenshot({
    path: path.join(outputDir, "system-map-card-field-preview.png"),
    fullPage: true,
  }).catch(() => {});
  await fs.writeFile(
    path.join(outputDir, "evidence.json"),
    JSON.stringify({
      ok: false,
      pageUrl,
      expectedSha,
      expectedEntrypoints,
      systemMapCardSelector,
      failure: {
        name: error?.name || "Error",
        message: error?.message || String(error),
        stack: error?.stack || null,
      },
      evidence,
      pageErrors,
      consoleErrors,
    }, null, 2) + "\n"
  );
  throw error;
} finally {
  await browser.close();
}
