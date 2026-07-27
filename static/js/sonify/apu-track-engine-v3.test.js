import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { APU_MASTERING_LIMITER_CEILING_DB } from "./apu-mastering.js";
import {
  APU_TRACK_CRITICAL_CHOKE_SECONDS,
  APU_TRACK_PULSE_WIDTH_LEAD_SECONDS,
  APU_TRACK_TRANSITION_ORNAMENT_OFFSET_SECONDS,
  safeRamp,
} from "./apu-track-engine-v3.js";

test("safeRamp holds the scheduled value when cancelAndHoldAtTime is available", () => {
  const calls = [];
  const parameter = {
    value: 0.25,
    cancelAndHoldAtTime(at) {
      calls.push(["hold", at]);
    },
    cancelScheduledValues(at) {
      calls.push(["cancel", at]);
    },
    setValueAtTime(value, at) {
      calls.push(["set", value, at]);
    },
    linearRampToValueAtTime(value, at) {
      calls.push(["ramp", value, at]);
    },
  };

  safeRamp(parameter, 0.75, 0.2, 10);

  assert.deepEqual(calls, [
    ["hold", 10],
    ["ramp", 0.75, 10.2],
  ]);
});

test("safeRamp fallback keeps the current parameter value before ramping", () => {
  const calls = [];
  const parameter = {
    value: 0.25,
    cancelScheduledValues(at) {
      calls.push(["cancel", at]);
    },
    setValueAtTime(value, at) {
      calls.push(["set", value, at]);
    },
    linearRampToValueAtTime(value, at) {
      calls.push(["ramp", value, at]);
    },
  };

  safeRamp(parameter, 0.5, 0.1, 4);

  assert.deepEqual(calls, [
    ["cancel", 4],
    ["set", 0.25, 4],
    ["ramp", 0.5, 4.1],
  ]);
});

test("track engine source keeps crusher off the full master and schedules pulse width before note attack", () => {
  const source = fs.readFileSync("static/js/sonify/apu-track-engine-v3.js", "utf8");

  assert.ok(APU_TRACK_CRITICAL_CHOKE_SECONDS >= 0.08);
  assert.ok(APU_TRACK_PULSE_WIDTH_LEAD_SECONDS > 0);
  assert.ok(APU_TRACK_TRANSITION_ORNAMENT_OFFSET_SECONDS > 0);
  assert.ok(APU_TRACK_TRANSITION_ORNAMENT_OFFSET_SECONDS < 0.02);
  assert.ok(APU_MASTERING_LIMITER_CEILING_DB <= -2);
  assert.match(source, /new Tone\.Limiter\(APU_MASTERING_LIMITER_CEILING_DB\)/);
  assert.match(source, /masterStageProfileForState/);
  assert.match(source, /new Tone\.WaveShaper\(Array\.from\(tanhCurve\(1\.45\)\)\)/);
  assert.match(source, /new Tone\.WaveShaper\(Array\.from\(quantiseCurve8Bit\(\)\)\)/);
  assert.match(source, /nodes\.compressor\.connect\(nodes\.masterDacDry\)/);
  assert.match(source, /nodes\.masterDacMix\.chain\(nodes\.softClipper, nodes\.limiter, nodes\.output\)/);
  assert.match(source, /pulseOscillatorForDutyCycle\(0\.5\)/);
  assert.match(source, /pulseOscillatorForDutyCycle\(0\.25\)/);
  assert.match(source, /pulseOscillatorForDutyCycle\(0\.125\)/);
  assert.match(source, /staircaseTriangleOscillator\(\)/);
  assert.match(source, /vrc6SawtoothOscillator\(\)/);
  assert.match(source, /createDrumSculptorKit\(rawContext,/);
  assert.match(source, /nodes\.drumKit\.kick/);
  assert.match(source, /nodes\.drumKit\?\.setState\?\.\(state\)/);
  assert.match(source, /leitmotifFor\(name, stateKey\(currentFrame\)\)/);
  assert.match(source, /describeLeitmotif\(leitmotif\)/);
  assert.match(source, /oscillatorType: voice\.label/);
  assert.match(source, /nodes\.serviceBus\.chain\(nodes\.chipColor, nodes\.melodyBus\)/);
  assert.doesNotMatch(source, /nodes\.chipBus\.chain\(\s*nodes\.crusher,/);
  assert.doesNotMatch(source, /new Tone\.NoiseSynth/);
  assert.match(source, /setPulseWidth\(nodes\.primary, event\.dutyCycle, pulseWidthLeadTime\(time\)\)/);
  assert.match(source, /setPulseWidth\(nodes\.secondary, event\.dutyCycle, pulseWidthLeadTime\(time\)\)/);
  assert.match(source, /setPulseWidth\(slot\.synth, event\.identity\.dutyCycle, pulseWidthLeadTime\(time\)\)/);
  assert.match(source, /transitionEventForTrackStep\(\s*currentFrame,\s*currentArrangement,\s*step,\s*lastStateTransition,\s*stepIndex,/);
  assert.match(source, /lastTransitionEvent/);
});

test("track engine consumes guarded score-plan controls without sample playback nodes", () => {
  const source = fs.readFileSync("static/js/sonify/apu-track-engine-v3.js", "utf8");

  assert.match(source, /engineControlsForFrame\(frame\)/);
  assert.match(source, /currentEngineControls\.buses/);
  assert.match(source, /scorePlanGuard: currentEngineControls\.guard/);
  assert.match(source, /sampleFree: currentEngineControls\.sampleFree/);
  assert.doesNotMatch(source, /new Tone\.Player/);
  assert.doesNotMatch(source, /new Tone\.Sampler/);
  assert.doesNotMatch(source, /new Tone\.GrainPlayer/);
});
