import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const OUT = process.env.SPECTRAL_FORGE_CAPTURE_DIR
  ? path.resolve(process.env.SPECTRAL_FORGE_CAPTURE_DIR)
  : path.resolve(process.cwd(), "static/js/spectral-forge/prototypes/captures");
const BASE = process.env.SPECTRAL_FORGE_URL || "http://127.0.0.1:8791/lab/spectral-forge/";
const PROTOS = [
  { id: "flagship-anatomy-f2", module: "/static/js/spectral-forge/prototypes/field-proto-flagship-organism-anatomy-f2.js", backend: "webgl" },
  { id: "flagship-anatomy-f31", module: "/static/js/spectral-forge/prototypes/field-proto-flagship-organism-anatomy-f31.js", backend: "webgl" },
];
const AUDIO_MODES = [false, true];
const NORMAL_CAPTURES = [1, 5, 10, 20];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(45_000);
let pageErrors = [];
let consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

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

async function bootCase(proto, audioOn) {
  pageErrors = [];
  consoleErrors = [];
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".forge-play .forge-field-stage canvas");
  await page.waitForTimeout(300);
  await swap(proto.module);
  await page.waitForTimeout(350);

  if (audioOn) {
    const enable = page.getByRole("button", { name: /^ENABLE AUDIO$/i }).first();
    assert.equal(await enable.count(), 1, `${proto.id}: audio enable control unavailable`);
    await enable.click();
    await page.waitForTimeout(350);
    const label = (await page.locator("#audio-toggle").textContent())?.trim();
    assert.ok(label === "MUTE" || label === "UNMUTE", `${proto.id}: audio did not enter enabled state (${label})`);
  }
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
    const webgl = document.querySelector(".forge-play .forge-field-stage .spectral-field-proto-webgl");
    if (!c) return null;
    return {
      raf,
      renderer: c.dataset.fieldRenderer ?? null,
      backend: c.dataset.fieldBackend ?? null,
      webglCanvases: document.querySelectorAll(".forge-play .forge-field-stage .spectral-field-proto-webgl").length,
      rendererPerf: webgl?.__atlasPerf ? { ...webgl.__atlasPerf } : null,
      audioLabel: document.querySelector("#audio-toggle")?.textContent?.trim() ?? null,
      vis: document.visibilityState,
    };
  });
}

async function frameTiming(durationMs = 3000) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const deltas = [];
    let previous = 0;
    const started = performance.now();
    const loop = (timestamp) => {
      if (previous) deltas.push(timestamp - previous);
      previous = timestamp;
      if (timestamp - started < duration) {
        requestAnimationFrame(loop);
        return;
      }
      const sorted = [...deltas].sort((a, b) => a - b);
      const total = deltas.reduce((sum, value) => sum + value, 0);
      const average = total / Math.max(1, deltas.length);
      const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
      resolve({
        samples: deltas.length,
        averageMs: Number(average.toFixed(2)),
        p95Ms: Number(percentile(0.95).toFixed(2)),
        worstMs: Number((sorted.at(-1) ?? 0).toFixed(2)),
        over33ms: deltas.filter((value) => value > 33.4).length,
        over50ms: deltas.filter((value) => value > 50).length,
        over100ms: deltas.filter((value) => value > 100).length,
        approximateFps: Number((1000 / Math.max(0.001, average)).toFixed(1)),
      });
    };
    requestAnimationFrame(loop);
  }), durationMs);
}

function assertMetrics(proto, sample, label) {
  assert.ok(sample, `${label}: no base Field canvas`);
  assert.equal(sample.vis, "visible", `${label}: document must be visible before judging motion`);
  assert.ok(sample.raf > 10, `${label}: requestAnimationFrame did not run (${sample.raf}/s)`);
  assert.equal(sample.renderer, `proto-${proto.id}`, `${label}: unexpected renderer`);
  if (proto.backend === "webgl") {
    assert.equal(sample.backend, "webgl", `${label}: flagship did not activate WebGL`);
    assert.equal(sample.webglCanvases, 1, `${label}: expected exactly one WebGL overlay`);
  }
  if (proto.id === "flagship-anatomy-f31") {
    assert.ok(sample.rendererPerf, `${label}: F3.1 performance telemetry missing`);
    assert.equal(sample.rendererPerf.architecture, "gpu-f2-port", `${label}: F3.1 is not using the GPU F2 port`);
    assert.equal(sample.rendererPerf.gpuDeformation, true, `${label}: F3.1 GPU deformation flag missing`);
    assert.equal(sample.rendererPerf.macroModel, "f2-seven-field", `${label}: F3.1 macro model drifted from F2`);
    assert.equal(sample.rendererPerf.microModel, "clustered-ferrofluid", `${label}: F3.1 micro model missing`);
    assert.equal(sample.rendererPerf.fields, 7, `${label}: F3.1 field topology changed unexpectedly`);
    assert.equal(sample.rendererPerf.shaderCompiled, true, `${label}: F3.1 shader did not compile`);
    assert.equal(sample.rendererPerf.smoothNormals, true, `${label}: F3.1 smooth-normal path not active`);
  }
}

async function runNormal(proto, audioOn) {
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 0 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  let elapsed = 0;
  for (const seconds of NORMAL_CAPTURES) {
    await page.waitForTimeout((seconds - elapsed) * 1000);
    elapsed = seconds;
    const sample = await metrics();
    const audioLabel = audioOn ? "audio-on" : "audio-off";
    assertMetrics(proto, sample, `${proto.id} NORMAL ${audioLabel} ${seconds}s`);
    await page.locator(".forge-play .forge-field-stage").screenshot({
      path: path.join(OUT, `${proto.id}-normal-${audioLabel}-${seconds}s.png`),
    });
    console.log(proto.id, `NORMAL ${audioLabel} ${seconds}s`, sample);
  }
  const timing = await frameTiming();
  assert.ok(timing.samples > 20, `${proto.id}: insufficient NORMAL frame timing samples`);
  console.log(proto.id, `NORMAL ${audioOn ? "AUDIO ON" : "AUDIO OFF"} FRAME TIMING`, timing);
}

async function runCascade(proto, audioOn) {
  const pause = page.getByRole("button", { name: /^(PAUSE|STOP)$/i }).first();
  if (await pause.count()) await pause.click().catch(() => {});
  await page.locator(".forge-scenario-control select").first().selectOption({ index: 5 });
  await page.getByRole("button", { name: /^PLAY$/i }).first().click();
  await page.waitForTimeout(20000);
  const sample = await metrics();
  const audioLabel = audioOn ? "audio-on" : "audio-off";
  assertMetrics(proto, sample, `${proto.id} CASCADE ${audioLabel} 20s`);
  await page.locator(".forge-play .forge-field-stage").screenshot({
    path: path.join(OUT, `${proto.id}-cascade-${audioLabel}-20s.png`),
  });
  const timing = await frameTiming();
  assert.ok(timing.samples > 20, `${proto.id}: insufficient CASCADE frame timing samples`);
  console.log(proto.id, `CASCADE ${audioLabel} 20s`, sample);
  console.log(proto.id, `CASCADE ${audioOn ? "AUDIO ON" : "AUDIO OFF"} FRAME TIMING`, timing);
}

for (const proto of PROTOS) {
  for (const audioOn of AUDIO_MODES) {
    await bootCase(proto, audioOn);
    await runNormal(proto, audioOn);
    await runCascade(proto, audioOn);
    assert.deepEqual(pageErrors, [], `${proto.id}: browser page errors`);
    assert.deepEqual(consoleErrors, [], `${proto.id}: browser console errors`);
  }
}

await browser.close();
