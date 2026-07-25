/**
 * Loop-recovery musical timing contracts.
 *
 * These tests assert the audible timing and pitch behaviour of the locked-tempo
 * loop integration, not just object shape: one transport tempo for every state,
 * every live loop at native playback rate (no pitch shift), and each 16-beat
 * loop filling its phrase exactly with no gap and no overlap.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  ATMOSPHERE_LOOPS,
  BASS_LOOPS,
  LEAD_LOOPS,
  resolveSamplePalette,
} from "./samples.js";
import { bassLoopPlaybackPlan } from "./sampler.js";
import { createCompositionDirector } from "./composition-director.js";
import { LOCKED_TRANSPORT_BPM, SCORE_STATES } from "./mapping.js";
import { PRODUCTION_FEATURES } from "./engine.js";

const LIVE_STATES = ["healthy", "warning", "critical", "unknown"];
const DRIVING_STATES = ["healthy", "warning", "critical"];
const PHRASE_BEATS = 16;
const TOLERANCE_SECONDS = 0.001;

const centsFor = (rate) => 1200 * Math.log2(rate);

function livePlan(state, phraseCount = 1, modulation = {}) {
  const director = createCompositionDirector({ seed: `RECOVERY-${state}` });
  director.observe({
    scoreState: state,
    bpm: SCORE_STATES[state].bpm,
    scale: SCORE_STATES[state].scale,
    overallHealth: state === "critical" ? 0.3 : state === "warning" ? 0.8 : 1,
    activeIncidents: state === "critical" ? 2 : 0,
    stale: state === "unknown",
    modulation,
  });
  let plan = null;
  for (let index = 0; index < phraseCount; index += 1) plan = director.advancePhrase();
  return plan;
}

test("the transport is locked to one tempo for every state and every pressure level", () => {
  assert.equal(LOCKED_TRANSPORT_BPM, 100);
  const tempos = new Set(LIVE_STATES.map((state) => SCORE_STATES[state].bpm));
  assert.deepEqual([...tempos], [LOCKED_TRANSPORT_BPM]);

  const heavyPressure = {
    pressure: 1,
    incidentPressure: 1,
    errorPressure: 1,
    latencyPressure: 1,
    healthPressure: 1,
    coveragePressure: 1,
    deploymentEnergy: 1,
  };
  for (const state of LIVE_STATES) {
    for (let phrase = 1; phrase <= 8; phrase += 1) {
      const plan = livePlan(state, phrase, heavyPressure);
      assert.equal(
        plan.targetBpm,
        LOCKED_TRANSPORT_BPM,
        `${state} phrase ${phrase} must stay at the locked tempo under full pressure`,
      );
    }
  }
});

test("the live target tempo never changes mid loop across eight consecutive phrases", () => {
  for (const state of DRIVING_STATES) {
    const director = createCompositionDirector({ seed: `STABLE-${state}` });
    director.observe({
      scoreState: state,
      bpm: SCORE_STATES[state].bpm,
      scale: SCORE_STATES[state].scale,
      overallHealth: 1,
      activeIncidents: 0,
      stale: false,
      modulation: {},
    });
    const tempos = Array.from({ length: 8 }, () => director.advancePhrase().targetBpm);
    assert.deepEqual(
      tempos,
      Array(8).fill(LOCKED_TRANSPORT_BPM),
      `${state} target tempo must be constant while a loop is active`,
    );
  }
});

test("every live palette selects only native 100 BPM loops, so nothing is pitch shifted", () => {
  for (const state of DRIVING_STATES) {
    for (let phrase = 0; phrase < 16; phrase += 1) {
      const plan = livePlan(state, phrase + 1);
      const palette = resolveSamplePalette(state, plan, phrase);
      if (palette.bassLoop) {
        assert.equal(BASS_LOOPS[palette.bassLoop].bpm, 100, `${state} bass loop ${palette.bassLoop}`);
      }
      if (palette.lead) {
        assert.equal(LEAD_LOOPS[palette.lead].bpm, 100, `${state} lead ${palette.lead}`);
      }
      if (palette.atmosphere) {
        assert.equal(ATMOSPHERE_LOOPS[palette.atmosphere].bpm, 100, `${state} atmosphere ${palette.atmosphere}`);
      }
    }
  }
});

test("bassLoopPlaybackPlan passes native source length and fills the phrase for every loop", () => {
  for (const [id, sample] of Object.entries(BASS_LOOPS)) {
    const plan = bassLoopPlaybackPlan(sample, LOCKED_TRANSPORT_BPM);
    assert.ok(plan, `${id} plan`);
    const nativeSourceSeconds = sample.playableBeats * 60 / sample.bpm;
    assert.ok(
      Math.abs(plan.outputDuration - nativeSourceSeconds) < 1e-9,
      `${id} must pass its native source length as the Tone.Player duration`,
    );
    const phraseSeconds = sample.playableBeats * 60 / LOCKED_TRANSPORT_BPM;
    assert.ok(
      Math.abs(plan.audibleDurationSeconds - phraseSeconds) < 1e-9,
      `${id} audible length ${plan.audibleDurationSeconds}s must equal the phrase ${phraseSeconds}s`,
    );
  }
});

test("live loops play at exactly native rate with a pitch shift of zero cents", () => {
  for (const state of DRIVING_STATES) {
    const plan = livePlan(state);
    const palette = resolveSamplePalette(state, plan, 0);
    const sample = BASS_LOOPS[palette.bassLoop];
    const playback = bassLoopPlaybackPlan(sample, plan.targetBpm);
    assert.equal(playback.playbackRate, 1, `${state} loop must run at native rate`);
    assert.equal(playback.rateWasClamped, false);
    assert.ok(Math.abs(centsFor(playback.playbackRate)) < 1e-9, `${state} loop pitch shift must be zero`);
  }
});

test("a live bass loop fills eight bars with no gap and no overlap (with timing trace)", () => {
  const beatSeconds = 60 / LOCKED_TRANSPORT_BPM;
  const phraseSeconds = PHRASE_BEATS * beatSeconds;
  const sample = BASS_LOOPS["neo-tokyo"];
  const playback = bassLoopPlaybackPlan(sample, LOCKED_TRANSPORT_BPM);

  const trace = [];
  let previousEnd = null;
  for (let phrase = 0; phrase < 2; phrase += 1) {
    const start = phrase * phraseSeconds;
    const end = start + playback.audibleDurationSeconds;
    if (previousEnd !== null) {
      assert.ok(
        Math.abs(start - previousEnd) < TOLERANCE_SECONDS,
        `phrase ${phrase} must start where the previous phrase ended (no gap, no overlap)`,
      );
    }
    for (let bar = 0; bar < 4; bar += 1) {
      const barTime = start + bar * 4 * beatSeconds;
      const marker = bar === 0 ? ` loop ${sample.id} start` : "";
      trace.push(`${barTime.toFixed(3)}  phrase ${phrase + 1} bar ${bar + 1} beat 1${marker}`);
    }
    previousEnd = end;
  }
  trace.push(`${(2 * phraseSeconds).toFixed(3)}  next phrase loop start`);
  console.log(`\nbass loop eight-bar schedule (100 BPM, ${sample.id}):\n${trace.join("\n")}`);

  assert.ok(Math.abs(playback.audibleDurationSeconds - phraseSeconds) < 1e-9);
  assert.ok(Math.abs(previousEnd - 2 * phraseSeconds) < 1e-9);
});

test("the composition director advances exactly once per call with no skipped phrases", () => {
  const director = createCompositionDirector({ seed: "ADVANCE" });
  director.observe({
    scoreState: "healthy",
    bpm: 100,
    scale: SCORE_STATES.healthy.scale,
    overallHealth: 1,
    activeIncidents: 0,
    stale: false,
    modulation: {},
  });
  const indices = Array.from({ length: 8 }, () => director.advancePhrase().phraseIndex);
  assert.deepEqual(indices, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("the production features are enabled on top of the approved baseline", () => {
  assert.deepEqual(PRODUCTION_FEATURES, {
    sidechain: true,
    subBass: true,
    masterClipper: true,
    ghostReverb: true,
    airTexture: true,
    dropGestures: true,
  });
  assert.ok(Object.values(PRODUCTION_FEATURES).every((value) => value === true));
});
