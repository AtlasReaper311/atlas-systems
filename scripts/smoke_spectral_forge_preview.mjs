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
  return {
    id: c.id,
    hash,
    lit,
    renderer: c.dataset.fieldRenderer ?? null,
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

async function sampleField(page, samples = 4, gapMs = 260) {
  const frames = [];
  for (let i = 0; i < samples; i += 1) {
    frames.push(await page.evaluate(visibleFieldCanvas));
    if (i < samples - 1) await page.waitForTimeout(gapMs);
  }
  return frames;
}

function inspectLiveField(frames, label) {
  assert.ok(frames.every(Boolean), `${label}: no visible Field canvas`);
  const renderers = new Set(frames.map((f) => f.renderer));
  assert.deepEqual([...renderers], [EXPECTED_RENDERER], `${label}: renderer changed mid-sequence -> ${[...renderers].join(", ")}`);
  assert.ok(frames.every((f) => f.lit > 0), `${label}: Field canvas rendered blank`);
  const distinct = new Set(frames.map((f) => f.hash)).size;
  return { distinct, frames };
}

function assertLiveField(frames, label) {
  const { distinct } = inspectLiveField(frames, label);
  assert.ok(distinct > 1, `${label}: Field canvas did not change across ${frames.length} frames (stale or frozen)`);
  return distinct;
}

async function waitForLiveField(page, label, { timeoutMs = 3_000, samples = 4, gapMs = 220 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastFrames = [];
  let lastError = null;
  while (Date.now() < deadline) {
    lastFrames = await sampleField(page, samples, gapMs);
    try {
      const { distinct } = inspectLiveField(lastFrames, label);
      if (distinct > 1) return { distinct, frames: lastFrames };
      lastError = new Error(`${label}: Field canvas did not change across ${samples} frames (stale or frozen)`);
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(120);
  }
  if (lastError) throw lastError;
  return { distinct: assertLiveField(lastFrames, label), frames: lastFrames };
}

async function waitForLifeClockAdvance(page, label, { timeoutMs = 3_000, gapMs = 220 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let first = null;
  let latest = null;
  let lastError = null;
  while (Date.now() < deadline) {
    const frame = await page.evaluate(visibleFieldCanvas);
    try {
      inspectLiveField([frame], label);
      if (!first) first = frame;
      latest = frame;
      if (latest.organismLifeTime > first.organismLifeTime) {
        return { first, latest };
      }
      lastError = new Error(`${label}: organism life clock did not advance (${first.organismLifeTime} -> ${latest.organismLifeTime})`);
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(gapMs);
  }
  throw lastError ?? new Error(`${label}: organism life clock did not advance`);
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

async function runFirefoxBehaviourEvidence(page, evidence) {
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

  await selectScenario(page, 'cascade', 55);
  const cascade = await page.evaluate(visibleFieldCanvas);
  assert.ok(cascade?.fissionStressDriven, `firefox: Cascade did not enter stress-driven fission by 55s (${JSON.stringify(cascade)})`);
  assert.ok(cascade.fissionCount >= 2 && cascade.fissionCount <= 3, `firefox: Cascade daughter count outside contract -> ${cascade.fissionCount}`);
  metrics.push(await measureFrameIntervals(page, 'cascade-fission'));

  const beforeSwitch = await page.evaluate(visibleFieldCanvas);
  await selectScenario(page, 'deploy', 2);
  const afterSwitch = await page.evaluate(visibleFieldCanvas);
  assert.equal(afterSwitch.fissionStressDriven, true, 'firefox: scenario switch despawned stress fission');
  assert.equal(afterSwitch.fissionCount, beforeSwitch.fissionCount, 'firefox: scenario switch changed active daughter count');
  assert.ok(afterSwitch.organismLifeTime > beforeSwitch.organismLifeTime, 'firefox: organism life did not continue across active fission handoff');
  metrics.push(await measureFrameIntervals(page, 'scenario-switch-active-event'));

  await waitForScenarioTime(page, 40);
  metrics.push(await measureFrameIntervals(page, 'recovery'));

  const audioButton = page.locator('#audio-toggle');
  if ((await audioButton.textContent())?.includes('ENABLE AUDIO')) {
    await audioButton.click();
    await page.waitForTimeout(600);
  }
  const audioLabel = (await audioButton.textContent())?.trim() ?? '';
  assert.ok(!audioLabel.includes('ENABLE AUDIO'), `firefox: audio activation did not remain enabled -> ${audioLabel}`);
  metrics.push(await measureFrameIntervals(page, 'audio-enabled'));

  const memoryBeforeNormal = (await page.evaluate(visibleFieldCanvas))?.memory ?? 0;
  await selectScenario(page, 'normal', 20);
  const normalAfterRecovery = await page.evaluate(visibleFieldCanvas);
  assert.ok(normalAfterRecovery.memory <= memoryBeforeNormal + 0.02, 'firefox: residual memory increased unexpectedly during Normal recovery');
  metrics.push(await measureFrameIntervals(page, 'normal-after-recovery'));

  await waitForScenarioTime(page, 60);
  await page.waitForFunction(() => document.querySelector('#playback-state')?.textContent?.trim() === 'COMPLETE', null, { timeout: 5_000 });
  metrics.push(await measureFrameIntervals(page, '60s-hold'));
  const holdStart = await page.evaluate(visibleFieldCanvas);
  await page.waitForTimeout(10_000);
  const holdEnd = await page.evaluate(visibleFieldCanvas);
  assert.ok(holdEnd.organismLifeTime > holdStart.organismLifeTime + 8, 'firefox: held telemetry stopped organism lifetime');
  metrics.push(await measureFrameIntervals(page, 'long-passive-life'));

  const replayLife = holdEnd.organismLifeTime;
  const replayMode = await page.evaluate(() => document.body.dataset.forgeDepth);
  const replayAudio = (await audioButton.textContent())?.trim() ?? '';
  await page.locator('#play-toggle').click();
  await waitForScenarioTime(page, 1.2, 8_000);
  const replay = await page.evaluate(visibleFieldCanvas);
  assert.ok(await page.evaluate(isPlaying), 'firefox: REPLAY did not enter PLAYING');
  assert.ok(replay.organismLifeTime > replayLife, 'firefox: REPLAY restarted organism lifetime');
  assert.equal(await page.evaluate(() => document.body.dataset.forgeDepth), replayMode, 'firefox: REPLAY changed PLAY/FORGE/ANALYSE mode');
  assert.equal((await audioButton.textContent())?.trim() ?? '', replayAudio, 'firefox: REPLAY changed audio activation/mute state');
  metrics.push(await measureFrameIntervals(page, 'replay-from-hold'));

  await page.locator('#reset-run').click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(simTime), '00:00.0', 'firefox: RESET RUN did not return scenario time to zero');
  assert.equal(await page.locator('#playback-state').textContent(), 'STOPPED', 'firefox: RESET RUN did not stop playback');
  const reset = await page.evaluate(visibleFieldCanvas);
  assert.ok(reset.organismLifeTime < 0.2, `firefox: RESET RUN did not restart organism lifetime -> ${reset.organismLifeTime}`);

  evidence.behaviourEvidence = {
    cascade,
    activeFissionSwitch: { before: beforeSwitch, after: afterSwitch },
    recoveryNormal: normalAfterRecovery,
    hold: { start: holdStart, end: holdEnd },
    replay,
    reset,
    metrics,
  };
  console.log(`ATLAS_FORGE_FIREFOX_EVIDENCE ${JSON.stringify(evidence.behaviourEvidence)}`);
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

    const pbr = await assertFinalFormPbr(page, `${engineName}: load`);
    evidence.pbr = pbr;

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

    await page.getByRole("button", { name: /^PLAY$/i }).first().click();
    await page.waitForTimeout(500);
    const playMotion = await waitForLiveField(page, `${engineName}: PLAY`);
    evidence.steps.push({ step: "play", distinctFrames: playMotion.distinct, renderer: playMotion.frames[0].renderer });
    assert.ok(await page.evaluate(isPlaying), `${engineName}: transport is not PLAYING after PLAY`);
    const tAfterPlay = await page.evaluate(simTime);
    assert.notEqual(tAfterPlay, "00:00.0", `${engineName}: simulation time did not advance`);
    await page.screenshot({ path: path.join(outputDir, `${engineName}-02-play.png`) });

    for (const mode of ["FORGE", "ANALYSE", "PLAY"]) {
      await page.locator(".forge-depth-nav button", { hasText: new RegExp(mode, "i") }).first().click();
      await page.waitForTimeout(650);
      const motion = await waitForLiveField(page, `${engineName}: ${mode}`, { samples: 3 });
      assert.ok(await page.evaluate(isPlaying), `${engineName}: playback restarted when switching to ${mode}`);
      evidence.steps.push({ step: `mode:${mode}`, canvas: motion.frames[0].id, distinctFrames: motion.distinct, renderer: motion.frames[0].renderer });
      await page.screenshot({ path: path.join(outputDir, `${engineName}-03-${mode.toLowerCase()}.png`) });
    }

    const scenario = page.locator(".forge-scenario-control select").first();
    if (await scenario.count()) {
      await scenario.selectOption({ index: 5 });
      await page.waitForTimeout(800);
      const scenarioLife = await waitForLifeClockAdvance(page, `${engineName}: scenario change`);
      assert.ok(await page.evaluate(isPlaying), `${engineName}: playback stopped when switching scenario`);
      const tAfterScenario = await page.evaluate(simTime);
      assert.match(tAfterScenario ?? "", /^00:0[01]\.\d$/, `${engineName}: scenario-local time did not restart near zero -> ${tAfterScenario}`);
      evidence.steps.push({
        step: "scenario-change",
        canvas: scenarioLife.latest.id,
        lifeStart: scenarioLife.first.organismLifeTime,
        lifeLatest: scenarioLife.latest.organismLifeTime,
        renderer: scenarioLife.latest.renderer,
        scenarioTime: tAfterScenario,
      });
      await page.screenshot({ path: path.join(outputDir, `${engineName}-04-scenario.png`) });
    }

    if (engineName === "firefox") await runFirefoxBehaviourEvidence(page, evidence);

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
