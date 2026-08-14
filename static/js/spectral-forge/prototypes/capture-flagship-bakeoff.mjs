import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const OUT = process.env.SPECTRAL_FORGE_CAPTURE_DIR
  ? path.resolve(process.env.SPECTRAL_FORGE_CAPTURE_DIR)
  : path.resolve(process.cwd(), "static/js/spectral-forge/prototypes/captures");
const BASE = process.env.SPECTRAL_FORGE_URL || "http://127.0.0.1:8791/lab/spectral-forge/";
const PROTOS = [
  { id: "flagship-organism", module: "/static/js/spectral-forge/prototypes/field-proto-flagship-organism.js", backend: "webgl" },
  { id: "living-organism", module: "/static/js/spectral-forge/prototypes/field-proto-living-organism.js", backend: null },
  { id: "specimen-core", module: "/static/js/spectral-forge/prototypes/field-proto-specimen-core.js", backend: null },
  { id: "signal-monolith", module: "/static/js/spectral-forge/prototypes/field-proto-signal-monolith.js", backend: null },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(45_000);
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".forge-play .forge-field-stage canvas");
await page.waitForTimeout(500);

async function swap(module) {
  await page.evaluate(async (mod) => {
    document.querySelectorAll(".spectral-field-proto-webgl").forEach((canvas) => {
      try {
        canvas.__atlasDispose?.();
      } catch {
        /* The harness still removes a stale overlay below. */
      }
      if (canvas.isConnected) canvas.remove();
    });
    document.querySelectorAll(".forge-field-stage canvas:not(.spectral-field-proto-webgl)").forEach((canvas) => {
      delete canvas.dataset.fieldBackend;
    });

    const visuals = await import("/static/js/spectral-forge/visuals.js");
    const proto = await import(`${mod}?capture=${Date.now()}`);
    visuals.SpectralFieldRenderer.prototype.draw = function drawProto(t) {
      return proto.draw.call(this, t);
    };
  }, module);
}

async function metrics() {
  return page.evaluate(async () => {
    const raf = await new Promise((resolve) => {
      let n = 0;
      const start = performance.now();
      const loop = (t) => {
        n += 1;
        if (t - start < 1000) requestAnimationFrame(loop);
        else resolve(n);
      };
      requestAnimationFrame(loop);
    });
    const c = document.querySelector(".forge-play .forge-field-stage canvas:not(.spectral-field-proto-webgl)");
    if (!c) return null;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    let total = 0;
    let maxL = 0;
    for (let i = 0; i < d.length; i += 4 * 53) {
      total += 1;
      const l = d[i] + d[i + 1] + d[i + 2];
      if (l > 70) lit += 1;
      if (l > maxL) maxL = l;
    }
    return {
      raf,
      litPct: Math.round((lit / total) * 100),
      maxL,
      renderer: c.dataset.fieldRenderer ?? null,
      backend: c.dataset.fieldBackend ?? null,
      webglCanvases: document.querySelectorAll(".forge-play .forge-field-stage .spectral-field-proto-webgl").length,
      vis: document.visibilityState,
    };
  });
}

function assertMetrics(proto, sample, label) {
  assert.ok(sample, `${label}: no base Field canvas`);
  assert.equal(sample.vis, "visible", `${label}: document must be visible before judging motion`);
  assert.ok(sample.raf > 10, `${label}: requestAnimationFrame did not run (${sample.raf}/s)`);
  assert.equal(sample.renderer, `proto-${proto.id}`, `${label}: unexpected renderer`);
  if (proto.backend === "webgl") {
    assert.equal(sample.backend, "webgl", `${label}: flagship did not activate WebGL`);
    assert.equal(sample.webglCanvases, 1, `${label}: expected exactly one WebGL overlay`);
  } else {
    assert.equal(sample.webglCanvases, 0, `${label}: stale WebGL overlay contaminated comparison prototype`);
  }
}

for (const proto of PROTOS) {
  await swap(proto.module);
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 0 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(3000);
  const normal = await metrics();
  assertMetrics(proto, normal, `${proto.id} NORMAL`);
  await page.locator(".forge-play .forge-field-stage").screenshot({ path: path.join(OUT, `${proto.id}-normal-3s.png`) });
  console.log(proto.id, "NORMAL", normal);

  const pause = page.getByRole("button", { name: /^(PAUSE|STOP)$/i }).first();
  if (await pause.count()) await pause.click().catch(() => {});
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 5 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(20000);
  const cascade = await metrics();
  assertMetrics(proto, cascade, `${proto.id} CASCADE`);
  await page.locator(".forge-play .forge-field-stage").screenshot({ path: path.join(OUT, `${proto.id}-cascade-20s.png`) });
  console.log(proto.id, "CASCADE", cascade);
  if (await pause.count()) await pause.click().catch(() => {});
}

assert.deepEqual(pageErrors, [], "browser page errors during flagship bake-off capture");
assert.deepEqual(consoleErrors, [], "browser console errors during flagship bake-off capture");
await browser.close();
