import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, firefox } from "playwright";

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
  const context = c.getContext('2d');
  if (!context) return null;
  const d = context.getImageData(0, 0, c.width, c.height).data;
  let hash = 0;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 97) {
    hash = (hash * 31 + (d[i] + d[i + 1] * 3 + d[i + 2] * 7)) >>> 0;
    if (d[i] + d[i + 1] + d[i + 2] > 60) lit += 1;
  }
  return {
    id: c.id,
    hash,
    lit,
    renderer: c.dataset.fieldRenderer ?? null,
    finalFormWebgl: c.dataset.finalFormWebgl ?? null,
    organismLifeTime: Number(c.dataset.organismLifeTime || 0),
    playback: c.dataset.fieldPlayback ?? null,
    fissionPhase: c.dataset.fissionPhase ?? 'idle',
    fissionCount: Number(c.dataset.fissionCount || 0),
    fissionStressDriven: c.dataset.fissionStressDriven === 'true',
    fractureDrive: Number(c.dataset.fractureDrive || 0),
    memory: Number(c.dataset.physicalMemory || 0),
    scarInfluence: Number(c.dataset.physicalScarInfluence || 0),
  };
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
    emaCpuMs: Number(perf.emaCpuMs || 0),
    maxCpuMs: Number(perf.maxCpuMs || 0),
    lastCpuMs: Number(perf.lastCpuMs || 0),
    dprCap: Number(perf.dprCap || 0),
  };
})()`;

const simTime = `document.querySelector('#simulation-time')?.textContent?.trim() ?? null`;
const isPlaying = `document.querySelector('#playback-state')?.textContent?.trim() === 'PLAYING'`;

async function browserSupportsWebgl2(page) {
  return page.evaluate(() => {
    const probe = document.createElement("canvas");
    try {
      return Boolean(probe.getContext("webgl2"));
    } catch {
      return false;
    }
  });
}

async function sampleField(page, samples = 4, gapMs = 240) {
  const frames = [];
  for (let index = 0; index < samples; index += 1) {
    frames.push(await page.evaluate(visibleFieldCanvas));
    if (index < samples - 1) await page.waitForTimeout(gapMs);
  }
  return frames;
}

function inspectLiveField(frames, label) {
  assert.ok(frames.every(Boolean), `${label}: no visible Field canvas`);
  const renderers = new Set(frames.map((frame) => frame.renderer));
  assert.deepEqual([...renderers], [EXPECTED_RENDERER], `${label}: renderer changed -> ${[...renderers].join(", ")}`);
  assert.ok(frames.every((frame) => frame.lit > 0), `${label}: Field canvas rendered blank`);
  return { distinct: new Set(frames.map((frame) => frame.hash)).size, frames };
}

async function waitForLiveField(page, label, { timeoutMs = 4_000, samples = 4, gapMs = 220 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastFrames = [];
  let lastError = null;
  while (Date.now() < deadline) {
    lastFrames = await sampleField(page, samples, gapMs);
    try {
      const evidence = inspectLiveField(lastFrames, label);
      if (evidence.distinct > 1) return evidence;
      lastError = new Error(`${label}: Field canvas did not change across ${samples} frames`);
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(120);
  }
  throw lastError ?? new Error(`${label}: no live Field evidence`);
}

async function waitForLifeClockAdvance(page, label, { timeoutMs = 4_000, gapMs = 220 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let first = null;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await page.evaluate(visibleFieldCanvas);
    inspectLiveField([latest], label);
    if (!first) first = latest;
    if (latest.organismLifeTime > first.organismLifeTime) return { first, latest };
    await page.waitForTimeout(gapMs);
  }
  throw new Error(`${label}: organism life clock did not advance`);
}

async function assertFinalFormPbr(page, label) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.forge-play .forge-field-stage canvas.spectral-field-proto-webgl');
    return Boolean(canvas?.isConnected && canvas.__atlasPerf?.architecture === "gpu-final-form" && canvas.__atlasPerf?.samples > 0);
  }, null, { timeout: 25_000, polling: 100 });
  const state = await page.evaluate(finalFormPbrState);
  assert.ok(state, `${label}: final-form WebGL canvas did not initialise`);
  assert.equal(state.architecture, EXPECTED_PBR_ARCHITECTURE, `${label}: wrong PBR architecture -> ${state.architecture}`);
  assert.ok(state.samples > 0, `${label}: final-form WebGL renderer produced no samples`);
  assert.equal(state.connected, true, `${label}: final-form WebGL canvas was detached`);
  return state;
}

async function assertGracefulWebglFallback(page, label) {
  await page.waitForFunction(() => document.querySelector('#play-field')?.dataset.finalFormWebgl === "webgl2-unavailable", null, {
    timeout: 8_000,
    polling: 100,
  });
  const frame = await page.evaluate(visibleFieldCanvas);
  assert.ok(frame, `${label}: fallback Field did not render`);
  assert.equal(frame.finalFormWebgl, "webgl2-unavailable", `${label}: WebGL2 unavailability was not recorded`);
  return Object.freeze({ architecture: "canvas2d-fallback", reason: "webgl2-unavailable" });
}

async function waitForScenarioTime(page, targetSeconds, timeoutMs = Math.max(20_000, targetSeconds * 2_000 + 20_000)) {
  await page.waitForFunction((target) => {
    const text = document.querySelector('#simulation-time')?.textContent?.trim() ?? '';
    const match = text.match(/^(\d+):(\d+(?:\.\d+)?)$/);
    if (!match) return false;
    return Number(match[1]) * 60 + Number(match[2]) >= target;
  }, targetSeconds, { timeout: timeoutMs, polling: 100 });
}

async function selectScenario(page, id, targetSeconds) {
  await page.locator('#scenario-select').selectOption(id);
  assert.ok(await page.evaluate(isPlaying), `${id}: scenario change did not preserve PLAYING transport`);
  await waitForScenarioTime(page, targetSeconds);
}

async function measureFrameIntervals(page, label, durationMs = 1_800) {
  const result = await page.evaluate(async ({ durationMs: duration }) => new Promise((resolve) => {
    const intervals = [];
    let previous = null;
    let started = null;
    const frame = (now) => {
      if (started == null) started = now;
      if (previous != null) intervals.push(now - previous);
      previous = now;
      if (now - started >= duration && intervals.length >= 2) {
        const sorted = [...intervals].sort((a, b) => a - b);
        const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
        resolve({
          samples: intervals.length,
          averageMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
          p95Ms: percentile(0.95),
          worstMs: sorted.at(-1),
          over33Ms: intervals.filter((value) => value > 33).length,
          over50Ms: intervals.filter((value) => value > 50).length,
          over100Ms: intervals.filter((value) => value > 100).length,
        });
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), { durationMs });
  return Object.fromEntries([
    ["label", label],
    ...Object.entries(result).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(3)) : value]),
  ]);
}

async function switchDepth(page, mode, label) {
  await page.locator('.forge-depth-nav button', { hasText: new RegExp(mode, 'i') }).first().click();
  await page.waitForTimeout(500);
  const motion = await waitForLiveField(page, `${label}: ${mode}`, { samples: 3 });
  assert.ok(await page.evaluate(isPlaying), `${label}: playback changed while switching to ${mode}`);
  return motion.frames.at(-1);
}

async function runPhysicalBehaviourEvidence(page, evidence) {
  const metrics = [];
  const scenario = page.locator('#scenario-select');

  await scenario.selectOption('normal');
  await waitForScenarioTime(page, 20);
  metrics.push(await measureFrameIntervals(page, 'normal-20s'));

  await selectScenario(page, 'traffic', 13);
  metrics.push(await measureFrameIntervals(page, 'traffic-transition'));

  await selectScenario(page, 'cache', 24);
  metrics.push(await measureFrameIntervals(page, 'cache-propagation'));

  await selectScenario(page, 'flapping', 12);
  metrics.push(await measureFrameIntervals(page, 'flapping'));

  await selectScenario(page, 'creep', 48);
  metrics.push(await measureFrameIntervals(page, 'late-creep'));

  await selectScenario(page, 'cascade', 45);
  const cascade = await page.evaluate(visibleFieldCanvas);
  assert.ok(cascade?.fissionStressDriven, `Cascade did not enter stress-driven fission by 45s (${JSON.stringify(cascade)})`);
  assert.ok(cascade.fissionCount >= 2 && cascade.fissionCount <= 3, `Cascade daughter count outside contract -> ${cascade.fissionCount}`);
  metrics.push(await measureFrameIntervals(page, 'cascade-fission'));

  const cascadeLife = cascade.organismLifeTime;
  for (const mode of ['FORGE', 'ANALYSE', 'PLAY']) {
    const modeFrame = await switchDepth(page, mode, 'cascade-active-fission');
    assert.ok(modeFrame.organismLifeTime > cascadeLife, `${mode}: organism life did not continue`);
  }

  const beforeSwitch = await page.evaluate(visibleFieldCanvas);
  await selectScenario(page, 'deploy', 2);
  const afterSwitch = await page.evaluate(visibleFieldCanvas);
  assert.ok(afterSwitch.organismLifeTime > beforeSwitch.organismLifeTime, 'organism life did not continue across active fission handoff');
  metrics.push(await measureFrameIntervals(page, 'scenario-switch-active-event'));

  await waitForScenarioTime(page, 40);
  metrics.push(await measureFrameIntervals(page, 'recovery'));

  const audioButton = page.locator('#audio-toggle');
  if ((await audioButton.textContent())?.includes('ENABLE AUDIO')) {
    await audioButton.click();
    await page.waitForTimeout(600);
  }
  const audioLabel = (await audioButton.textContent())?.trim() ?? '';
  assert.ok(!audioLabel.includes('ENABLE AUDIO'), `audio activation did not remain enabled -> ${audioLabel}`);
  metrics.push(await measureFrameIntervals(page, 'audio-enabled'));

  const memoryBeforeNormal = (await page.evaluate(visibleFieldCanvas))?.memory ?? 0;
  await selectScenario(page, 'normal', 20);
  const normalAfterRecovery = await page.evaluate(visibleFieldCanvas);
  assert.ok(normalAfterRecovery.memory <= memoryBeforeNormal + 0.02, 'residual memory increased unexpectedly during Normal recovery');
  metrics.push(await measureFrameIntervals(page, 'normal-after-recovery'));

  await waitForScenarioTime(page, 60);
  await page.waitForFunction(() => document.querySelector('#playback-state')?.textContent?.trim() === 'COMPLETE', null, { timeout: 5_000 });
  metrics.push(await measureFrameIntervals(page, '60s-hold'));
  const holdStart = await page.evaluate(visibleFieldCanvas);
  await page.waitForTimeout(10_000);
  const holdEnd = await page.evaluate(visibleFieldCanvas);
  assert.ok(holdEnd.organismLifeTime > holdStart.organismLifeTime + 8, 'held telemetry stopped organism lifetime');
  metrics.push(await measureFrameIntervals(page, 'long-passive-life'));

  const replayLife = holdEnd.organismLifeTime;
  const replayMode = await page.evaluate(() => document.body.dataset.forgeDepth);
  const replayAudio = (await audioButton.textContent())?.trim() ?? '';
  await page.locator('#play-toggle').click();
  await waitForScenarioTime(page, 1.2, 10_000);
  const replay = await page.evaluate(visibleFieldCanvas);
  assert.ok(await page.evaluate(isPlaying), 'REPLAY did not enter PLAYING');
  assert.ok(replay.organismLifeTime > replayLife, 'REPLAY restarted organism lifetime');
  assert.equal(await page.evaluate(() => document.body.dataset.forgeDepth), replayMode, 'REPLAY changed PLAY/FORGE/ANALYSE mode');
  assert.equal((await audioButton.textContent())?.trim() ?? '', replayAudio, 'REPLAY changed audio activation/mute state');
  metrics.push(await measureFrameIntervals(page, 'replay-from-hold'));

  await page.locator('#reset-run').click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(simTime), '00:00.0', 'RESET RUN did not return scenario time to zero');
  assert.equal((await page.locator('#playback-state').textContent())?.trim(), 'STOPPED', 'RESET RUN did not stop playback');
  const reset = await page.evaluate(visibleFieldCanvas);
  assert.ok(reset.organismLifeTime < 0.2, `RESET RUN did not restart organism lifetime -> ${reset.organismLifeTime}`);

  evidence.behaviourEvidence = {
    cascade,
    activeFissionSwitch: { before: beforeSwitch, after: afterSwitch },
    recoveryNormal: normalAfterRecovery,
    hold: { start: holdStart, end: holdEnd },
    replay,
    reset,
    metrics,
  };
  console.log(`ATLAS_FORGE_BROWSER_EVIDENCE ${JSON.stringify(evidence.behaviourEvidence)}`);
}

async function runEngine(engineName, engine) {
  const evidence = { engine: engineName, route: ROUTE, expectedSha, steps: [] };
  const pageErrors = [];
  const consoleErrors = [];
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  try {
    const response = await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert.ok(response?.ok(), `${engineName}: HTTP ${response?.status() ?? 'no response'} for ${ROUTE}`);
    await page.waitForSelector('.forge-play .forge-field-stage canvas', { timeout: 20_000 });
    await page.waitForTimeout(900);

    const webgl2Available = await browserSupportsWebgl2(page);
    evidence.webgl2Available = webgl2Available;
    evidence.pbr = webgl2Available
      ? await assertFinalFormPbr(page, `${engineName}: load`)
      : await assertGracefulWebglFallback(page, `${engineName}: load`);

    const rafPerSecond = await page.evaluate(async () => {
      let count = 0;
      const loop = () => { count += 1; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return count;
    });
    assert.ok(rafPerSecond > 10, `${engineName}: requestAnimationFrame did not run (${rafPerSecond}/s)`);
    evidence.rafPerSecond = rafPerSecond;

    const stopped = await page.evaluate(visibleFieldCanvas);
    assert.ok(stopped, `${engineName}: no Field canvas before playback`);
    assert.equal(stopped.renderer, EXPECTED_RENDERER, `${engineName}: unexpected renderer -> ${stopped.renderer}`);
    evidence.steps.push({ step: 'loaded', ...stopped, pbr: evidence.pbr });

    await page.getByRole('button', { name: /^PLAY$/i }).first().click();
    await page.waitForTimeout(500);
    const playMotion = await waitForLiveField(page, `${engineName}: PLAY`);
    evidence.steps.push({ step: 'play', distinctFrames: playMotion.distinct, renderer: playMotion.frames[0].renderer });
    assert.ok(await page.evaluate(isPlaying), `${engineName}: transport is not PLAYING after PLAY`);
    assert.notEqual(await page.evaluate(simTime), '00:00.0', `${engineName}: simulation time did not advance`);

    for (const mode of ['FORGE', 'ANALYSE', 'PLAY']) {
      const frame = await switchDepth(page, mode, engineName);
      evidence.steps.push({ step: `mode:${mode}`, canvas: frame.id, renderer: frame.renderer });
    }

    const scenario = page.locator('.forge-scenario-control select').first();
    if (await scenario.count()) {
      await scenario.selectOption({ index: 5 });
      await page.waitForTimeout(800);
      const scenarioLife = await waitForLifeClockAdvance(page, `${engineName}: scenario change`);
      assert.ok(await page.evaluate(isPlaying), `${engineName}: playback stopped when switching scenario`);
      const scenarioTime = await page.evaluate(simTime);
      assert.match(scenarioTime ?? '', /^00:0[01]\.\d$/, `${engineName}: scenario-local time did not restart near zero -> ${scenarioTime}`);
      evidence.steps.push({
        step: 'scenario-change',
        canvas: scenarioLife.latest.id,
        lifeStart: scenarioLife.first.organismLifeTime,
        lifeLatest: scenarioLife.latest.organismLifeTime,
        renderer: scenarioLife.latest.renderer,
        scenarioTime,
      });
    }

    if (engineName === 'chromium' && webgl2Available) await runPhysicalBehaviourEvidence(page, evidence);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${engineName}: horizontal overflow at ${VIEWPORT.width}px`);
    assert.deepEqual(pageErrors, [], `${engineName}: page errors`);
    assert.deepEqual(consoleErrors, [], `${engineName}: console errors`);

    evidence.result = 'pass';
    await page.screenshot({ path: path.join(outputDir, `${engineName}-final.png`) });
    return evidence;
  } catch (error) {
    evidence.result = 'fail';
    evidence.failure = { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null };
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    await fs.writeFile(path.join(outputDir, `${engineName}-failure.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

const report = [];
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  report.push(await runEngine(name, engine));
}
await fs.writeFile(path.join(outputDir, 'spectral-forge-smoke.json'), `${JSON.stringify({ baseUrl, expectedSha, report }, null, 2)}\n`);
console.log(`Spectral Forge preview smoke passed in ${report.map((entry) => entry.engine).join(' and ')}.`);
