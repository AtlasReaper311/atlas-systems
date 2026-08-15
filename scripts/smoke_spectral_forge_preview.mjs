import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, firefox } from "playwright";

/* Spectral Forge is the one Lab route where a green screenshot proves nothing.
 * The Field renders once on load and then animates from requestAnimationFrame,
 * so a still capture looks identical whether playback is running, frozen, or
 * has silently fallen back to a different renderer. This smoke therefore
 * asserts frame-to-frame canvas change, final-form WebGL presence and renderer
 * continuity across the real PLAY / FORGE / ANALYSE interaction path.
 */

const baseUrl = (process.env.PREVIEW_URL || "").replace(/\/$/, "");
const expectedSha = process.env.HEAD_SHA || "";
const outputDir = process.env.SPECTRAL_FORGE_OUTPUT_DIR || "spectral-forge-preview-smoke";
const ROUTE = "/lab/spectral-forge/";
const EXPECTED_RENDERER = "v4-spatial";
const EXPECTED_PBR_ARCHITECTURE = "gpu-final-form";
const VIEWPORT = { width: 1440, height: 900 };

assert.ok(baseUrl, "PREVIEW_URL is required");
assert.ok(expectedSha, "HEAD_SHA is required");

await fs.mkdir(outputDir, { recursive: true });

const visibleFieldCanvas = `(() => {
  const c = [...document.querySelectorAll('canvas')].find((x) => x.offsetParent !== null && x.id.includes('field'));
  if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let hash = 0;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 97) {
    hash = (hash * 31 + (d[i] + d[i + 1] * 3 + d[i + 2] * 7)) >>> 0;
    if (d[i] + d[i + 1] + d[i + 2] > 60) lit += 1;
  }
  return { id: c.id, hash, lit, renderer: c.dataset.fieldRenderer ?? null };
})()`;

const finalFormPbrState = `(() => {
  const c = document.querySelector('.forge-play .forge-field-stage canvas.spectral-field-proto-webgl');
  const perf = c?.__atlasPerf ?? null;
  if (!c || !perf) return null;
  return {
    architecture: perf.architecture ?? null,
    samples: Number(perf.samples || 0),
    triangles: Number(c.__atlasRendererInfo?.triangles || 0),
    connected: c.isConnected,
  };
})()`;

const simTime = `document.body.innerText.match(/\\d\\d:\\d\\d\\.\\d/)?.[0] ?? null`;
const isPlaying = `(document.querySelector('.forge-playback-controls')?.innerText ?? '').includes('PLAYING')`;

async function sampleField(page, samples = 4, gapMs = 260) {
  const frames = [];
  for (let i = 0; i < samples; i += 1) {
    frames.push(await page.evaluate(visibleFieldCanvas));
    if (i < samples - 1) await page.waitForTimeout(gapMs);
  }
  return frames;
}

function assertLiveField(frames, label) {
  assert.ok(frames.every(Boolean), `${label}: no visible Field canvas`);
  const renderers = new Set(frames.map((f) => f.renderer));
  assert.deepEqual([...renderers], [EXPECTED_RENDERER], `${label}: renderer changed mid-sequence -> ${[...renderers].join(", ")}`);
  assert.ok(frames.every((f) => f.lit > 0), `${label}: Field canvas rendered blank`);
  const distinct = new Set(frames.map((f) => f.hash)).size;
  assert.ok(distinct > 1, `${label}: Field canvas did not change across ${frames.length} frames (stale or frozen)`);
  return distinct;
}

async function assertFinalFormPbr(page, label) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.forge-play .forge-field-stage canvas.spectral-field-proto-webgl');
    return Boolean(canvas?.isConnected && canvas.__atlasPerf?.architecture === "gpu-final-form" && canvas.__atlasPerf?.samples > 0);
  }, null, { timeout: 20_000, polling: 100 });
  const state = await page.evaluate(finalFormPbrState);
  assert.ok(state, `${label}: final-form WebGL canvas did not initialise`);
  assert.equal(state.architecture, EXPECTED_PBR_ARCHITECTURE, `${label}: wrong PBR architecture -> ${state.architecture}`);
  assert.ok(state.samples > 0, `${label}: final-form WebGL renderer produced no samples`);
  assert.equal(state.connected, true, `${label}: final-form WebGL canvas was detached`);
  return state;
}

async function runEngine(engineName, engine) {
  const evidence = { engine: engineName, route: ROUTE, expectedSha, steps: [] };
  const pageErrors = [];
  const consoleErrors = [];
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  try {
    const response = await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: "networkidle", timeout: 45_000 });
    assert.ok(response?.ok(), `${engineName}: HTTP ${response?.status() ?? "no response"} for ${ROUTE}`);
    await page.waitForSelector(".forge-play .forge-field-stage canvas", { timeout: 20_000 });
    await page.waitForTimeout(900);

    // The bare route must now initialise the approved living final-form PBR
    // organism. A green Canvas2D fallback is not sufficient evidence.
    const pbr = await assertFinalFormPbr(page, `${engineName}: load`);
    evidence.pbr = pbr;

    // requestAnimationFrame must actually run, otherwise every later assertion
    // about motion would be vacuous.
    const rafPerSecond = await page.evaluate(async () => {
      let n = 0;
      const loop = () => { n += 1; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      await new Promise((r) => setTimeout(r, 1000));
      return n;
    });
    assert.ok(rafPerSecond > 10, `${engineName}: requestAnimationFrame did not run (${rafPerSecond}/s); motion evidence would be meaningless`);
    evidence.rafPerSecond = rafPerSecond;

    const stopped = await page.evaluate(visibleFieldCanvas);
    assert.ok(stopped, `${engineName}: no Field canvas before playback`);
    assert.equal(stopped.renderer, EXPECTED_RENDERER, `${engineName}: unexpected renderer on load -> ${stopped.renderer}`);
    await page.screenshot({ path: path.join(outputDir, `${engineName}-01-stopped.png`) });
    evidence.steps.push({ step: "loaded", ...stopped, pbr });

    // PLAY must animate the same renderer.
    await page.getByRole("button", { name: /^PLAY$/i }).first().click();
    await page.waitForTimeout(500);
    const playFrames = await sampleField(page);
    evidence.steps.push({ step: "play", distinctFrames: assertLiveField(playFrames, `${engineName}: PLAY`), renderer: playFrames[0].renderer });
    assert.ok(await page.evaluate(isPlaying), `${engineName}: transport is not PLAYING after PLAY`);
    const tAfterPlay = await page.evaluate(simTime);
    assert.notEqual(tAfterPlay, "00:00.0", `${engineName}: simulation time did not advance`);
    await page.screenshot({ path: path.join(outputDir, `${engineName}-02-play.png`) });

    // Depth switches must not restart playback nor swap renderer.
    for (const mode of ["FORGE", "ANALYSE", "PLAY"]) {
      await page.locator(".forge-depth-nav button", { hasText: new RegExp(mode, "i") }).first().click();
      await page.waitForTimeout(650);
      const frames = await sampleField(page, 3);
      const distinct = assertLiveField(frames, `${engineName}: ${mode}`);
      assert.ok(await page.evaluate(isPlaying), `${engineName}: playback restarted when switching to ${mode}`);
      evidence.steps.push({ step: `mode:${mode}`, canvas: frames[0].id, distinctFrames: distinct, renderer: frames[0].renderer });
      await page.screenshot({ path: path.join(outputDir, `${engineName}-03-${mode.toLowerCase()}.png`) });
    }

    // Scenario changes retarget telemetry on the same living specimen. Playback
    // must remain active, the same renderer must keep animating, and the new
    // scenario-local clock must restart near zero without requiring another PLAY.
    const scenario = page.locator(".forge-scenario-control select").first();
    if (await scenario.count()) {
      await scenario.selectOption({ index: 5 });
      await page.waitForTimeout(800);
      const scenarioFrames = await sampleField(page, 3);
      const distinct = assertLiveField(scenarioFrames, `${engineName}: scenario change`);
      assert.ok(await page.evaluate(isPlaying), `${engineName}: playback stopped when switching scenario`);
      const tAfterScenario = await page.evaluate(simTime);
      assert.match(tAfterScenario ?? "", /^00:0[01]\.\d$/, `${engineName}: scenario-local time did not restart near zero -> ${tAfterScenario}`);
      evidence.steps.push({
        step: "scenario-change",
        canvas: scenarioFrames[0].id,
        distinctFrames: distinct,
        renderer: scenarioFrames[0].renderer,
        scenarioTime: tAfterScenario,
      });
      await page.screenshot({ path: path.join(outputDir, `${engineName}-04-scenario.png`) });
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${engineName}: horizontal overflow at ${VIEWPORT.width}px`);

    assert.deepEqual(pageErrors, [], `${engineName}: page errors`);
    assert.deepEqual(consoleErrors, [], `${engineName}: console errors`);

    evidence.result = "pass";
    return evidence;
  } catch (error) {
    evidence.result = "fail";
    evidence.failure = { name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack || null };
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    await fs.writeFile(path.join(outputDir, `${engineName}-failure.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

const report = [];
for (const [name, engine] of [["chromium", chromium], ["firefox", firefox]]) {
  report.push(await runEngine(name, engine));
}
await fs.writeFile(path.join(outputDir, "spectral-forge-smoke.json"), `${JSON.stringify({ baseUrl, expectedSha, report }, null, 2)}\n`);
console.log(`Spectral Forge preview smoke passed in ${report.map((r) => r.engine).join(" and ")}.`);
