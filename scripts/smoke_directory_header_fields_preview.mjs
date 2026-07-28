import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { firefox } from "playwright";

const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) throw new Error("PREVIEW_URL is required");

const expectedSha = process.env.HEAD_SHA ?? "unknown";
const outputDir = process.env.DIRECTORY_HEADER_FIELD_OUTPUT_DIR
  ?? path.join(process.cwd(), ".tmp", "directory-header-field-preview-smoke");

const routes = Object.freeze([
  { name: "systems", path: "/systems/", selector: ".page-intro", composition: "topology-current", minimumLuminousPixels: 4, animation: "topology-scan" },
  { name: "work", path: "/work/", selector: ".page-header", composition: "build-fragments", minimumLuminousPixels: 3, animation: "fragment-shift" },
  { name: "writing", path: "/writing/", selector: ".page-header", composition: "editorial-drift", minimumLuminousPixels: 1, animation: "editorial-drift" },
]);

await mkdir(outputDir, { recursive: true });

const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const evidence = [];
const consoleErrors = [];
const pageErrors = [];
let failure = null;

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

async function snapshot(route) {
  return page.evaluate(({ selector, name, composition }) => {
    const host = document.querySelector(selector);
    const canvases = host?.querySelectorAll(":scope > canvas.atlas-field-canvas") ?? [];
    const canvas = canvases[0] ?? null;
    const heading = host?.querySelector("h1") ?? null;
    const copy = host?.querySelector(".page-sub, .lede") ?? null;
    const canvasStyle = canvas ? getComputedStyle(canvas) : null;
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const copyStyle = copy ? getComputedStyle(copy) : null;
    const hostStyle = host ? getComputedStyle(host) : null;
    const overlayStyle = host ? getComputedStyle(host, "::before") : null;
    let sampledPixels = 0;
    let luminousPixels = 0;

    if (canvas && canvas.width > 0 && canvas.height > 0) {
      const context = canvas.getContext("2d");
      if (context) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const stride = 32;
        for (let offset = 0; offset < pixels.length; offset += 4 * stride) {
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const alpha = pixels[offset + 3];
          const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
          sampledPixels += 1;
          if (alpha > 6 && luminance > 14) luminousPixels += 1;
        }
      }
    }

    const resources = performance.getEntriesByType("resource").map((entry) => {
      const url = new URL(entry.name);
      return `${url.pathname}${url.search}`;
    });

    return {
      route: name,
      composition,
      bodyState: document.body.dataset.atlasDirectoryHeader ?? null,
      hostPresent: Boolean(host),
      state: host?.dataset.atlasDirectoryHeaderState ?? null,
      hostClasses: host ? Array.from(host.classList) : [],
      canvasCount: canvases.length,
      preset: canvas?.dataset.atlasFieldPreset ?? null,
      mode: canvas?.dataset.mode ?? null,
      frame: Number(canvas?.dataset.frame || 0),
      cssWidth: canvas?.getBoundingClientRect().width ?? 0,
      cssHeight: canvas?.getBoundingClientRect().height ?? 0,
      bitmapWidth: canvas?.width ?? 0,
      bitmapHeight: canvas?.height ?? 0,
      opacity: canvasStyle ? Number(canvasStyle.opacity) : 0,
      canvasTransform: canvasStyle?.transform ?? null,
      overlayAnimationName: overlayStyle?.animationName ?? null,
      overlayBackgroundImage: overlayStyle?.backgroundImage ?? null,
      sampledPixels,
      luminousPixels,
      headerMinHeight: hostStyle?.minHeight ?? null,
      headerPaddingTop: hostStyle?.paddingTop ?? null,
      headingFontFamily: headingStyle?.fontFamily ?? null,
      headingFontSize: headingStyle?.fontSize ?? null,
      headingLineHeight: headingStyle?.lineHeight ?? null,
      copyFontSize: copyStyle?.fontSize ?? null,
      copyLineHeight: copyStyle?.lineHeight ?? null,
      helperLoaded: resources.some((resource) => resource.startsWith("/static/js/directory-header-fields.js?v=20260728-directory-header-compositions-v2")),
      stylesheetLoaded: Boolean(document.querySelector('link[href="/static/css/directory-header-fields.css?v=20260728-directory-header-compositions-v2"]')),
    };
  }, route);
}

try {
  for (const route of routes) {
    const url = new URL(`${route.path}?directory-header-preview=${encodeURIComponent(expectedSha)}`, previewUrl).href;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    assert.equal(response?.ok(), true, `${route.name} preview answered ${response?.status()}`);

    await page.waitForFunction(({ selector }) => {
      const host = document.querySelector(selector);
      const canvas = host?.querySelector(":scope > canvas.atlas-field-canvas");
      if (!canvas || host?.dataset.atlasDirectoryHeaderState === "unavailable") return false;
      const animated = canvas.dataset.mode === "animated" && Number(canvas.dataset.frame || 0) >= 3;
      const staticFrame = canvas.dataset.mode === "static";
      return canvas.width > 0 && canvas.height > 0 && (animated || staticFrame);
    }, { selector: route.selector }, { timeout: 25_000, polling: 100 });

    await page.waitForTimeout(650);
    const rendered = await snapshot(route);
    evidence.push(rendered);

    assert.equal(rendered.hostPresent, true, JSON.stringify(rendered, null, 2));
    assert.equal(rendered.bodyState, route.name, JSON.stringify(rendered, null, 2));
    assert.equal(rendered.state, "ready", JSON.stringify(rendered, null, 2));
    assert.equal(rendered.canvasCount, 1, JSON.stringify(rendered, null, 2));
    assert.equal(rendered.preset, "ambient", JSON.stringify(rendered, null, 2));
    assert.ok(rendered.hostClasses.includes("atlas-page-header"), JSON.stringify(rendered, null, 2));
    assert.ok(rendered.hostClasses.includes(`atlas-header-composition--${route.composition}`), JSON.stringify(rendered, null, 2));
    assert.ok(rendered.cssWidth >= 700, JSON.stringify(rendered, null, 2));
    assert.ok(rendered.cssHeight >= 350, JSON.stringify(rendered, null, 2));
    assert.ok(rendered.bitmapWidth > 0 && rendered.bitmapHeight > 0, JSON.stringify(rendered, null, 2));
    assert.ok(rendered.sampledPixels > 0, JSON.stringify(rendered, null, 2));
    assert.ok(rendered.luminousPixels >= route.minimumLuminousPixels, JSON.stringify(rendered, null, 2));
    assert.equal(rendered.overlayAnimationName, route.animation, JSON.stringify(rendered, null, 2));
    assert.notEqual(rendered.canvasTransform, "none", JSON.stringify(rendered, null, 2));
    assert.notEqual(rendered.overlayBackgroundImage, "none", JSON.stringify(rendered, null, 2));
    assert.equal(rendered.helperLoaded, true, JSON.stringify(rendered, null, 2));
    assert.equal(rendered.stylesheetLoaded, true, JSON.stringify(rendered, null, 2));

    await page.screenshot({
      path: path.join(outputDir, `${route.name}-directory-header.png`),
      fullPage: false,
    });
  }

  const [systems, work, writing] = evidence;
  for (const rendered of [work, writing]) {
    assert.equal(rendered.headerMinHeight, systems.headerMinHeight, JSON.stringify(evidence, null, 2));
    assert.equal(rendered.headerPaddingTop, systems.headerPaddingTop, JSON.stringify(evidence, null, 2));
    assert.equal(rendered.headingFontFamily, systems.headingFontFamily, JSON.stringify(evidence, null, 2));
    assert.equal(rendered.headingLineHeight, systems.headingLineHeight, JSON.stringify(evidence, null, 2));
    assert.equal(rendered.copyFontSize, systems.copyFontSize, JSON.stringify(evidence, null, 2));
    assert.equal(rendered.copyLineHeight, systems.copyLineHeight, JSON.stringify(evidence, null, 2));
  }

  assert.equal(new Set(evidence.map(({ overlayAnimationName }) => overlayAnimationName)).size, 3, JSON.stringify(evidence, null, 2));
  assert.equal(new Set(evidence.map(({ canvasTransform }) => canvasTransform)).size, 3, JSON.stringify(evidence, null, 2));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    consoleErrors.filter((message) => /AtlasField|directory header|topology-current|build-fragments|editorial-drift/i.test(message)),
    [],
    JSON.stringify(consoleErrors, null, 2),
  );
} catch (error) {
  failure = error;
} finally {
  await writeFile(
    path.join(outputDir, "evidence.json"),
    `${JSON.stringify({
      ok: failure === null,
      previewUrl,
      expectedSha,
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
console.log(`Directory header preview smoke passed for ${routes.length} routes.`);