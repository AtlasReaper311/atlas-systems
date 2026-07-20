import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  BASS_LOOPS,
  LEAD_LOOPS,
  resolveSamplePalette,
  samplePoolAnalysis,
} from "./samples.js";
import { bassLoopPlaybackPlan } from "./sampler.js";
import { createCompositionDirector } from "./composition-director.js";
import { buildPadVoicing } from "./engine.js";
import { ROOT_MIDI, SCORE_STATES } from "./mapping.js";

function livePlan(state, phraseCount = 1) {
  const director = createCompositionDirector({ seed: `ATLAS-LOOP-${state}` });
  director.observe({
    scoreState: state,
    bpm: SCORE_STATES[state].bpm,
    scale: SCORE_STATES[state].scale,
    overallHealth: state === "critical" ? 0.3 : state === "warning" ? 0.8 : 1,
    activeIncidents: state === "critical" ? 1 : 0,
    stale: state === "unknown",
    modulation: {
      pressure: state === "critical" ? 0.95 : state === "warning" ? 0.58 : 0.2,
      healthPressure: 0.2,
      coveragePressure: state === "unknown" ? 0.7 : 0,
      latencyPressure: 0.2,
      errorPressure: 0.1,
      incidentPressure: state === "critical" ? 0.5 : 0,
      deploymentEnergy: 0,
      spectralOpenness: 0.8,
      staleDecay: state === "unknown" ? 0.8 : 0,
    },
  });
  let plan = null;
  for (let index = 0; index < phraseCount; index += 1) plan = director.advancePhrase();
  return plan;
}

test("F-centred score keeps loop playback near native rate", () => {
  assert.equal(ROOT_MIDI, 41);
  assert.deepEqual(Object.fromEntries(Object.entries(SCORE_STATES).map(([state, score]) => [state, score.bpm])), {
    healthy: 100,
    warning: 106,
    critical: 112,
    unknown: 96,
  });
  for (const state of ["healthy", "warning", "critical"]) {
    const plan = livePlan(state);
    const palette = resolveSamplePalette(state, plan, 0);
    const sample = BASS_LOOPS[palette.bassLoop];
    const playback = bassLoopPlaybackPlan(sample, plan.targetBpm);
    assert.ok(playback);
    assert.equal(playback.playableBeats, 16);
    assert.ok(playback.playbackRate >= 0.75 && playback.playbackRate <= 1.35);
    assert.equal(playback.rateWasClamped, false);
    assert.ok(playback.outputDuration >= 16 * 60 / 116);
  }
});

test("F and Fm foundation loops no longer use granular pitch transposition", () => {
  for (const id of ["neo-tokyo", "sequenced-bass", "evil-bass", "distorted-guitar"]) {
    assert.equal(BASS_LOOPS[id].transposeCents, 0, `${id} should run at native pitch`);
  }
  assert.equal(LEAD_LOOPS["acid-synth"].transposeCents, 0);
});

test("live palettes always provide a loop foundation outside Unknown", () => {
  for (const state of ["healthy", "warning", "critical"]) {
    for (let phrase = 0; phrase < 24; phrase += 1) {
      const plan = livePlan(state, phrase + 1);
      const palette = resolveSamplePalette(state, plan, phrase);
      assert.ok(palette.bassLoop, `${state} phrase ${phrase} needs a loop foundation`);
      assert.notEqual(palette.lead, "wobbly-synth");
      assert.equal(palette.metal, "perc-stick");
    }
  }
});

test("raw nullable pools remain visible as deliberate Ghost variation", () => {
  const analysis = samplePoolAnalysis();
  assert.equal(analysis.healthy.kinds.bassLoop.nulls, 2);
  assert.equal(analysis.warning.kinds.lead.nulls, 2);
  assert.ok(analysis.healthy.emptyLeadAtmosphereProbability >= 0);
  assert.ok(analysis.warning.emptyLeadAtmosphereProbability >= 0);
});

test("seeded chord progression variants change pad harmony", () => {
  const score = SCORE_STATES.healthy;
  const signatures = new Set(Array.from({ length: 4 }, (_, variant) => (
    buildPadVoicing("healthy", score.scale, 0, 0, "triad", variant).join(":")
  )));
  assert.ok(signatures.size >= 3);
});

test("stable live state eventually schedules a build and drop pair", () => {
  const director = createCompositionDirector({ seed: "ATLAS-DROP" });
  director.observe({
    scoreState: "healthy",
    bpm: 100,
    scale: SCORE_STATES.healthy.scale,
    overallHealth: 1,
    activeIncidents: 0,
    stale: false,
    modulation: { pressure: 0.2, healthPressure: 0, coveragePressure: 0, latencyPressure: 0.1, errorPressure: 0, incidentPressure: 0, deploymentEnergy: 0, spectralOpenness: 0.9, staleDecay: 0 },
  });
  const stages = Array.from({ length: 18 }, () => director.advancePhrase().dropStage);
  assert.ok(stages.includes("build"));
  const buildIndex = stages.indexOf("build");
  assert.equal(stages[buildIndex + 1], "drop");
});

test("production graph source includes ducking, sub, clipper, shared delay and FFT analysis", () => {
  const source = fs.readFileSync("static/js/sonify/engine.js", "utf8");
  assert.match(source, /triggerSidechainDuck/);
  assert.match(source, /SUB_ROOT_MIDI/);
  assert.match(source, /masterClipper/);
  assert.match(source, /new Tone\.Analyser\("fft", 64\)/);
  assert.match(source, /terminalDelay\.delayTime/);
  assert.match(source, /textureAirNoise/);
});

test("active build id is the loop production v2 release candidate", () => {
  const source = fs.readFileSync("static/js/sonify/engine.js", "utf8");
  assert.match(source, /20260720-system-symphony-loop-production-v2/);
});
