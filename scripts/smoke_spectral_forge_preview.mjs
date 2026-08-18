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
const transportState = `document.querySelector('#playback-state')?.textContent?.trim() ?? null`;

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
  const before = await page.evaluate(transportState);
  await page.locator('.forge-depth-nav button', { hasText: new RegExp(mode, 'i') }).first().click();
  await page.waitForTimeout(500);
  const motion = await waitForLiveField(page, `${label}: ${mode}`, { samples: 3 });
  const after = await page.evaluate(transportState);
  /* A depth change must not alter transport. Reaching the end of the finite
   * 60-second condition is a time-driven transition into the designed HOLD
   * state, not a depth-driven one, and the organism keeps living through it -
   * so the two causes are distinguished rather than conflated. Before the
   * transport clock tracked wall time this boundary was never reached inside
   * this window, which is why a strict PLAYING check used to hold. */
  assert.ok(
    after === before || (before === 'PLAYING' && after === 'COMPLETE'),
    `${label}: playback changed from ${before} to ${after} while switching to ${mode}`,
  );
  assert.ok(
    ['PLAYING', 'COMPLETE'].includes(after),
    `${label}: organism stopped living while switching to ${mode} (${after})`,
  );
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
  assert.ok(holdEnd.organismLifeTime > holdStart.organismLifeTime, 'held telemetry stopped organism lifetime');
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

/* Organism presence, measured rather than inferred.
 *
 * The WebGL canvas clears to alpha 0 and the organism is drawn opaque, so the
 * alpha channel of the drawing buffer is an exact "is the organism on screen"
 * signal. Three one-pixel strips is cheap enough to sample every frame, which is
 * the resolution needed to catch a single blank frame. */
const ORGANISM_COVERAGE = `(() => {
  const stage = document.querySelector('.forge-depth-panel:not([hidden]) .forge-field-stage');
  const gl3 = stage?.querySelector('canvas.spectral-field-proto-webgl');
  if (!gl3) return null;
  const gl = gl3.getContext('webgl2');
  if (!gl) return null;
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  if (w < 2 || h < 2) return null;
  const strip = new Uint8Array(w * 4);
  let lit = 0;
  for (const fy of [0.3, 0.5, 0.7]) {
    gl.readPixels(0, Math.round(h * fy), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, strip);
    for (let x = 0; x < w; x += 2) if (strip[x * 4 + 3] > 24) lit += 1;
  }
  const perf = gl3.__atlasPerf ?? {};
  return {
    lit,
    coverage: lit / ((w / 2) * 3),
    connected: gl3.isConnected,
    contextLost: gl.isContextLost(),
    buffer: w + 'x' + h,
    tier: perf.qualityTier ?? null,
    vertices: perf.vertices ?? null,
    pixelRatio: perf.pixelRatio ?? null,
  };
})()`;

/* Bug A regression.
 *
 * A note on what is and is not measurable here. The renderer runs with
 * preserveDrawingBuffer false, so readPixels outside an animation frame reads a
 * buffer the compositor has already consumed and reports zero whether or not the
 * organism is on screen. Pixel coverage is therefore only meaningful while the
 * loop is running, and is used here as a positive control that the renderer is
 * genuinely producing an organism.
 *
 * The paused case is covered by the state that actually caused the
 * disappearance: a tier change resizes - and so clears - the drawing buffer, and
 * while paused no frame follows to repaint it. Holding tier, buffer size,
 * geometry and pixel ratio steady across paused interaction is the guarantee,
 * and it is checked after a wait longer than the quality dwell so a regression
 * has every opportunity to fire. */
async function assertPausedRuntimeStability(page, engineName, evidence) {
  const samples = [];
  const sample = async (label) => {
    const value = await page.evaluate(ORGANISM_COVERAGE);
    const entry = { label, ...(value ?? {}) };
    samples.push(entry);
    return entry;
  };

  await page.locator('#play-toggle').click();
  await page.waitForTimeout(2200);
  await page.locator('#audio-toggle').click();
  await page.waitForTimeout(700);

  /* Positive control: sampled inside an animation frame, while the loop is
   * running, so the drawing buffer is still valid. */
  const animatedCoverage = await page.evaluate(`new Promise((resolve) => requestAnimationFrame(() => resolve(${ORGANISM_COVERAGE})))`);
  assert.ok(animatedCoverage, `${engineName}: no WebGL surface while playing`);
  assert.ok(
    animatedCoverage.lit > 0,
    `${engineName}: renderer produced no organism while playing (alpha coverage 0)`,
  );
  samples.push({ label: 'playing-unmuted', ...animatedCoverage });

  await page.locator('#play-toggle').click();
  await page.waitForTimeout(600);
  const paused = await sample('paused');
  assert.ok(paused.buffer, `${engineName}: no WebGL surface after pausing`);

  /* Longer than QUALITY_DWELL_MS, so an interaction-driven tier change would
   * fire here if frame cadence were still being read from click intervals. */
  await page.waitForTimeout(3000);
  await page.locator('#audio-toggle').click();
  await page.waitForTimeout(700);
  const muted = await sample('paused-muted');

  await page.waitForTimeout(3000);
  await page.locator('#audio-toggle').click();
  await page.waitForTimeout(700);
  const unmuted = await sample('paused-unmuted');

  for (const entry of [muted, unmuted]) {
    assert.equal(entry.connected, true, `${engineName}: WebGL canvas detached at "${entry.label}"`);
    assert.equal(entry.contextLost, false, `${engineName}: WebGL context lost at "${entry.label}"`);
    assert.equal(
      entry.tier,
      paused.tier,
      `${engineName}: quality tier changed while paused at "${entry.label}" -> ${paused.tier} to ${entry.tier}`,
    );
    assert.equal(
      entry.buffer,
      paused.buffer,
      `${engineName}: drawing buffer resized while paused at "${entry.label}" -> ${entry.buffer}`,
    );
    assert.equal(
      entry.vertices,
      paused.vertices,
      `${engineName}: mesh tessellation changed while paused at "${entry.label}" -> ${entry.vertices}`,
    );
    assert.equal(
      entry.pixelRatio,
      paused.pixelRatio,
      `${engineName}: pixel ratio changed while paused at "${entry.label}" -> ${entry.pixelRatio}`,
    );
  }

  /* Resuming must bring the organism back, which also proves the paused frames
   * were never left with a dead renderer. */
  await page.locator('#play-toggle').click();
  await page.waitForTimeout(700);
  const resumed = await page.evaluate(`new Promise((resolve) => requestAnimationFrame(() => resolve(${ORGANISM_COVERAGE})))`);
  assert.ok(
    resumed?.lit > 0,
    `${engineName}: organism absent after resuming from a paused mute cycle`,
  );
  samples.push({ label: 'resumed', ...resumed });

  evidence.pausedRuntimeStability = { baselineTier: paused.tier, samples };
  await page.locator('#reset-run').click();
  await page.waitForTimeout(350);
}

/* Bug B regression. A hidden renderer must not advance shared physical state, so
 * a separation in progress has to survive repeated depth changes and reach
 * settle. Sampling runs in-page at frame rate because the failure was a single
 * blank frame and a one-frame progress reset. */
async function assertDepthSwitchContinuity(page, engineName, evidence) {
  await page.selectOption('#scenario-select', 'cascade');
  await page.waitForTimeout(300);
  await page.evaluate(`
    window.__forgeContinuity = { rows: [], hiddenDraws: 0 };
    (() => {
      const ids = ['play-field', 'forge-field', 'analysis-field'];
      const seen = new Map();
      const tick = () => {
        const stage = document.querySelector('.forge-depth-panel:not([hidden]) .forge-field-stage');
        const active = stage?.querySelector('canvas:not(.spectral-field-proto-webgl)');
        for (const id of ids) {
          const c = document.querySelector('#' + id);
          const gl3 = c?.parentElement?.querySelector('canvas.spectral-field-proto-webgl');
          const samples = gl3?.__atlasPerf?.samples ?? null;
          const hidden = !!c?.closest('[hidden]');
          const previous = seen.get(id);
          /* Only count a draw as hidden when the panel was hidden at both ends of
           * the interval. A panel hidden by a depth change draws once more in the
           * same task that hides it - that draw was made by the still-visible
           * view, and attributing it here would report a fault that did not
           * happen. */
          if (previous && samples != null && samples > previous.samples && hidden && previous.hidden) {
            window.__forgeContinuity.hiddenDraws += samples - previous.samples;
          }
          if (samples != null) seen.set(id, { samples, hidden });
        }
        if (active) {
          window.__forgeContinuity.rows.push({
            t: performance.now(),
            /* Carried so consecutive rows are only compared within one canvas,
             * across an interval where that canvas was visible at both ends. A
             * hidden panel's dataset is frozen at whatever it last drew, so its
             * first visible frame catches up in one step - real physics, read as
             * a discontinuity that never happened. */
            canvas: active.id,
            visible: !active.closest('[hidden]'),
            phase: active.dataset.fissionPhase ?? null,
            progress: Number(active.dataset.fissionProgress || 0),
            charge: Number(active.dataset.fractureCharge || 0),
            tier: document.querySelector('.forge-depth-panel:not([hidden]) canvas.spectral-field-proto-webgl')?.__atlasPerf?.qualityTier ?? null,
          });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })();
  `);
  await page.locator('#play-toggle').click();

  for (let second = 0; second < 66; second += 1) {
    await page.waitForTimeout(1000);
    if (second >= 12 && second % 6 === 0) {
      await page.locator('.forge-depth-nav button[data-depth="FORGE"]').click();
      await page.waitForTimeout(250);
      await page.locator('.forge-depth-nav button[data-depth="PLAY"]').click();
    }
  }

  const continuity = await page.evaluate(() => window.__forgeContinuity);
  const rows = continuity.rows;
  const phases = [...new Set(rows.map((row) => row.phase).filter(Boolean))];
  const tiers = [...new Set(rows.map((row) => row.tier).filter(Boolean))];

  let progressResets = 0;
  let chargeCollapses = 0;
  let comparableIntervals = 0;
  let sameCanvasRun = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    sameCanvasRun = previous.canvas === current.canvas ? sameCanvasRun + 1 : 0;
    /* A panel that has just become visible still carries the dataset it froze
     * when it was hidden; its first drawn frame catches up in one step. Waiting
     * for a short run of frames on the same canvas guarantees both ends of the
     * interval were published by a renderer that is actually drawing. */
    if (sameCanvasRun < 5) continue;
    comparableIntervals += 1;
    if (previous.progress > 0.05 && current.progress === 0 && previous.phase !== 'settle') progressResets += 1;
    if (previous.charge > 0.5 && current.charge < previous.charge * 0.25 && previous.phase === 'idle') chargeCollapses += 1;
  }
  /* Enough samples to judge continuity, not a statement about machine speed. A
   * software rasteriser on a loaded runner legitimately delivers a fraction of
   * the frames a GPU does, and the properties under test - no progress reset, no
   * charge collapse, no hidden draw - are just as visible in a sparser trace. */
  assert.ok(
    comparableIntervals > 150,
    `${engineName}: too few continuously-visible intervals to judge continuity (${comparableIntervals})`,
  );

  assert.equal(
    continuity.hiddenDraws,
    0,
    `${engineName}: ${continuity.hiddenDraws} draw(s) executed on a hidden Field panel`,
  );
  assert.ok(
    phases.includes('settle'),
    `${engineName}: physical fission never reached settle across depth changes -> ${phases.join(', ')}`,
  );
  assert.equal(
    progressResets,
    0,
    `${engineName}: active fission progress reset to zero ${progressResets} time(s) outside settle`,
  );
  assert.equal(
    chargeCollapses,
    0,
    `${engineName}: fracture charge collapsed ${chargeCollapses} time(s) outside a legitimate reset`,
  );
  assert.ok(
    tiers.length <= 1,
    `${engineName}: quality tier changed during depth switching -> ${tiers.join(' -> ')}`,
  );

  evidence.depthSwitchContinuity = {
    frames: rows.length,
    comparableIntervals,
    hiddenDraws: continuity.hiddenDraws,
    phases,
    tiers,
    progressResets,
    chargeCollapses,
  };
  console.log(`ATLAS_FORGE_CONTINUITY_EVIDENCE ${JSON.stringify({ engine: engineName, ...evidence.depthSwitchContinuity })}`);
}

/* Runtime continuity runs at devicePixelRatio 2 because the faults it covers are
 * only reachable when a tier change genuinely reallocates the drawing buffer;
 * at ratio 1 the tier pixel ratios collapse to the same value. */
async function runRuntimeContinuity(engineName, engine, outputDir) {
  const browser = await engine.launch({ headless: true });
  const evidence = { engine: engineName, deviceScaleFactor: 2, route: ROUTE, expectedSha };
  const pageErrors = [];
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

  try {
    const response = await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert.ok(response?.ok(), `${engineName}: HTTP ${response?.status() ?? 'no response'} for ${ROUTE}`);
    await page.waitForSelector('.forge-play .forge-field-stage canvas', { timeout: 20_000 });
    await page.waitForTimeout(1000);

    if (!(await browserSupportsWebgl2(page))) {
      evidence.result = 'skipped-no-webgl2';
      return evidence;
    }

    await assertPausedRuntimeStability(page, engineName, evidence);
    await assertDepthSwitchContinuity(page, engineName, evidence);
    assert.deepEqual(pageErrors, [], `${engineName}: page errors during runtime continuity`);
    evidence.result = 'pass';
    return evidence;
  } catch (error) {
    evidence.result = 'fail';
    evidence.failure = { name: error?.name || 'Error', message: error?.message || String(error) };
    evidence.pageErrors = pageErrors;
    await fs.writeFile(
      path.join(outputDir, `${engineName}-runtime-continuity-failure.json`),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    throw error;
  } finally {
    await browser.close();
  }
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
      /* Proves the restart rather than the runner's speed: the previous
       * condition had run to its 60-second end, so any small value is
       * unambiguously a restart. A sub-two-second window only held while the
       * transport clock ran slower than wall time. */
      const scenarioSeconds = Number(String(scenarioTime ?? '').split(':').at(-1));
      assert.ok(
        Number.isFinite(scenarioSeconds) && scenarioSeconds < 5,
        `${engineName}: scenario-local time did not restart near zero -> ${scenarioTime}`,
      );
      assert.match(scenarioTime ?? '', /^00:\d{2}\.\d$/, `${engineName}: scenario clock format changed -> ${scenarioTime}`);
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
const continuityReport = [];
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  report.push(await runEngine(name, engine));
  continuityReport.push(await runRuntimeContinuity(name, engine, outputDir));
}
await fs.writeFile(
  path.join(outputDir, 'spectral-forge-smoke.json'),
  `${JSON.stringify({ baseUrl, expectedSha, report, continuityReport }, null, 2)}\n`,
);
console.log(`Spectral Forge preview smoke passed in ${report.map((entry) => entry.engine).join(' and ')}.`);
console.log(`Runtime continuity passed in ${continuityReport.map((entry) => `${entry.engine}:${entry.result}`).join(' and ')}.`);
