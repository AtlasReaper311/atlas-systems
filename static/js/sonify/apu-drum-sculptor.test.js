import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_DRUM_SCULPTOR_BUILD_ID,
  APU_DRUM_SCULPTOR_DEFAULT_MODE,
  APU_DRUM_SCULPTOR_KITS,
  APU_DRUM_SCULPTOR_LATE_HIT_DROP_SECONDS,
  APU_DRUM_SCULPTOR_MODES,
  createDrumSculptorKit,
  curveVelocity,
  fnv1a,
  kitForState,
} from "./apu-drum-sculptor.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "apu-drum-sculptor.js"), "utf-8");

// ---------------------------------------------------------------------------
// AudioContext stub that records every node parameter automation
// ---------------------------------------------------------------------------

function stubAudioContext({ sampleRate = 44100, currentTime = 0 } = {}) {
  const nodes = [];
  const automations = [];
  const bufferSourceStarts = [];

  function record(node, kind) {
    node._kind = kind;
    nodes.push(node);
    return node;
  }

  function stubParam(name, node) {
    return {
      value: 0,
      setValueAtTime(v, t) { automations.push({ node, name, op: "set", value: v, time: t }); },
      linearRampToValueAtTime(v, t) { automations.push({ node, name, op: "linear", value: v, time: t }); },
      exponentialRampToValueAtTime(v, t) { automations.push({ node, name, op: "exp", value: v, time: t }); },
      cancelScheduledValues(t) { automations.push({ node, name, op: "cancel", time: t }); },
    };
  }

  const ctx = {
    sampleRate,
    currentTime,
    nodes,
    automations,
    bufferSourceStarts,

    createGain() {
      const node = { connect() {}, disconnect() {} };
      node.gain = stubParam("gain", node);
      return record(node, "gain");
    },
    createOscillator() {
      const node = {
        type: "sine",
        connect() {}, disconnect() {},
        start(t) { node._start = t; },
        stop(t) { node._stop = t; if (node.onended) queueMicrotask(node.onended); },
      };
      node.frequency = stubParam("frequency", node);
      node.detune = stubParam("detune", node);
      return record(node, "oscillator");
    },
    createBufferSource() {
      const node = {
        buffer: null,
        loop: false,
        connect() {}, disconnect() {},
        start(t, offset) { node._start = t; node._offset = offset; bufferSourceStarts.push({ node, time: t, offset }); },
        stop(t) { node._stop = t; if (node.onended) queueMicrotask(node.onended); },
      };
      node.playbackRate = stubParam("playbackRate", node);
      return record(node, "bufferSource");
    },
    createBiquadFilter() {
      const node = {
        type: "lowpass",
        connect() {}, disconnect() {},
      };
      node.frequency = stubParam("frequency", node);
      node.Q = stubParam("Q", node);
      return record(node, "filter");
    },
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData() { return data; },
      };
    },
    createPeriodicWave() { return {}; },
  };

  return ctx;
}

function stubOutputs() {
  return {
    kickOutput: { _tag: "kick", connect() {} },
    snareOutput: { _tag: "snare", connect() {} },
    hatOutput: { _tag: "hat", connect() {} },
    accentOutput: { _tag: "accent", connect() {} },
  };
}

// ---------------------------------------------------------------------------
// Metadata and constants
// ---------------------------------------------------------------------------

test("build id and constants are frozen", () => {
  assert.equal(typeof APU_DRUM_SCULPTOR_BUILD_ID, "string");
  assert.ok(APU_DRUM_SCULPTOR_BUILD_ID.length > 0);
  assert.deepEqual([...APU_DRUM_SCULPTOR_MODES], ["polished", "authentic"]);
  assert.equal(APU_DRUM_SCULPTOR_DEFAULT_MODE, "polished");
  assert.ok(APU_DRUM_SCULPTOR_LATE_HIT_DROP_SECONDS > 0);
  assert.ok(Object.isFrozen(APU_DRUM_SCULPTOR_KITS));
  assert.ok(Object.isFrozen(APU_DRUM_SCULPTOR_KITS.healthy));
});

test("every state has a kit with all voices defined", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const kit = APU_DRUM_SCULPTOR_KITS[state];
    assert.ok(kit, `${state} kit exists`);
    for (const voice of ["kick", "snare", "hat", "openHat", "accent"]) {
      assert.ok(kit[voice], `${state} kit has ${voice}`);
    }
  }
});

test("kitForState falls back to healthy for unknown state names", () => {
  assert.equal(kitForState("nonsense"), APU_DRUM_SCULPTOR_KITS.healthy);
  assert.equal(kitForState("critical"), APU_DRUM_SCULPTOR_KITS.critical);
});

// ---------------------------------------------------------------------------
// Velocity curve
// ---------------------------------------------------------------------------

test("curveVelocity is bounded in 0..1 and monotonic", () => {
  let previous = -Infinity;
  for (let i = 0; i <= 100; i += 1) {
    const value = curveVelocity(i / 100);
    assert.ok(value >= 0, `${i}: value >= 0`);
    assert.ok(value <= 1, `${i}: value <= 1`);
    assert.ok(value >= previous, `${i}: monotonic increase`);
    previous = value;
  }
});

test("curveVelocity handles pathological input", () => {
  assert.equal(curveVelocity(-5), 0);
  assert.equal(curveVelocity(999), curveVelocity(1));
  assert.equal(curveVelocity(NaN), 0);
});

test("curveVelocity soft knee mutes ghost hits", () => {
  const ghost = curveVelocity(0.05);
  const midLow = curveVelocity(0.2);
  assert.ok(ghost < 0.02, `ghost ${ghost} < 0.02`);
  assert.ok(midLow > ghost * 3, "mid-low velocity should stand well above ghost region");
});

// ---------------------------------------------------------------------------
// Deterministic hash and buffer offset
// ---------------------------------------------------------------------------

test("fnv1a is deterministic and returns non-negative integers", () => {
  const a = fnv1a("hat-1");
  const b = fnv1a("hat-1");
  const c = fnv1a("hat-2");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(Number.isInteger(a));
  assert.ok(a >= 0);
});

// ---------------------------------------------------------------------------
// Kit factory and voice creation
// ---------------------------------------------------------------------------

test("createDrumSculptorKit rejects a non-AudioContext argument", () => {
  assert.throws(() => createDrumSculptorKit({}, stubOutputs()), /raw AudioContext/);
});

test("createDrumSculptorKit exposes all voices and defaults to polished mode", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  assert.ok(kit.kick && kit.snare && kit.hat && kit.openHat && kit.noiseAccent);
  assert.equal(kit.getMode(), "polished");
  assert.equal(kit.getState(), "healthy");
});

test("createDrumSculptorKit falls back to polished when mode is invalid", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { mode: "distorted" });
  assert.equal(kit.getMode(), "polished");
});

test("createDrumSculptorKit falls back to healthy when state is invalid", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { state: "typo" });
  assert.equal(kit.getState(), "healthy");
});

test("setState switches active kit without rebuilding voices", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { state: "healthy" });
  const kickBefore = kit.kick;
  kit.setState("critical");
  assert.equal(kit.getState(), "critical");
  assert.equal(kit.kick, kickBefore, "voice objects are stable across setState");
  assert.equal(kit.getKit(), APU_DRUM_SCULPTOR_KITS.critical);
});

test("setState ignores same-state calls", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { state: "warning" });
  kit.setState("warning");
  assert.equal(kit.getState(), "warning");
});

// ---------------------------------------------------------------------------
// Envelope behaviour
// ---------------------------------------------------------------------------

test("polished kick uses a linear (not exponential) attack ramp", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  kit.kick.triggerAttackRelease(0.14, 0.5, 0.8);

  // Find gain nodes that received a linear attack automation
  const linearGains = ctx.automations.filter(
    (a) => a.op === "linear" && a.name === "gain",
  );
  assert.ok(linearGains.length > 0, "polished mode should use linearRampToValueAtTime for attack");
});

test("polished mode enforces a minimum attack floor of 4 ms", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { mode: "polished" });
  kit.snare.triggerAttackRelease(0.05, 0, 1);

  // For snare, envelope automations progress: set (0 at 0), linear (peak at attack_end), exp (0 at release_end)
  const snareGainAutomations = ctx.automations.filter(
    (a) => a.name === "gain" && (a.op === "set" || a.op === "linear") && a.time >= 0,
  );
  const linearRamp = snareGainAutomations.find((a) => a.op === "linear");
  assert.ok(linearRamp, "snare has linear attack ramp");
  assert.ok(linearRamp.time >= 0.004, `attack end ${linearRamp.time} >= 0.004`);
});

test("triggerAttackRelease produces no NaN or Infinity in scheduled values", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { state: "critical" });
  kit.kick.triggerAttackRelease(0.14, 0, 1);
  kit.snare.triggerAttackRelease(0.05, 0.1, 0.8);
  kit.hat.triggerAttackRelease(0.015, 0.2, 0.6);
  kit.openHat.triggerAttackRelease(0.075, 0.3, 0.4);
  kit.noiseAccent.triggerAttackRelease(0.085, 0.4, 0.5);

  for (const automation of ctx.automations) {
    if (automation.value === undefined) continue;
    assert.ok(Number.isFinite(automation.value),
      `${automation.name} ${automation.op} value ${automation.value} must be finite`);
  }
});

test("scheduled gain values never exceed 1.0", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  for (let step = 0; step < 32; step += 1) {
    kit.kick.triggerAttackRelease(0.14, step * 0.125, 1);
    kit.snare.triggerAttackRelease(0.05, step * 0.125 + 0.02, 1);
    kit.hat.triggerAttackRelease(0.015, step * 0.125 + 0.04, 1);
  }
  const gainAutomations = ctx.automations.filter((a) => a.name === "gain" && a.value !== undefined);
  for (const automation of gainAutomations) {
    assert.ok(automation.value <= 1.0 + 1e-9,
      `gain automation ${automation.value} exceeded 1.0`);
    assert.ok(automation.value >= 0,
      `gain automation ${automation.value} went negative`);
  }
});

// ---------------------------------------------------------------------------
// Deterministic buffer offsets
// ---------------------------------------------------------------------------

test("consecutive hits use different LFSR buffer offsets", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  kit.hat.triggerAttackRelease(0.015, 0, 0.8);
  kit.hat.triggerAttackRelease(0.015, 0.1, 0.8);
  kit.hat.triggerAttackRelease(0.015, 0.2, 0.8);
  const offsets = ctx.bufferSourceStarts.map((s) => s.offset);
  const unique = new Set(offsets);
  assert.ok(unique.size >= 3, `three hits should produce >= 3 distinct offsets, got ${unique.size}`);
});

test("late scheduled hits are dropped instead of stacked onto current time", () => {
  const ctx = stubAudioContext({ currentTime: 10 });
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  kit.hat.triggerAttackRelease(0.015, 9.9, 0.8);
  assert.equal(ctx.bufferSourceStarts.length, 0);
  kit.hat.triggerAttackRelease(0.015, 9.99, 0.8);
  assert.equal(ctx.bufferSourceStarts.length, 1);
  assert.ok(ctx.bufferSourceStarts[0].time >= 10);
});

test("silence stops outstanding sculptor sources without rebuilding voices", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  const hat = kit.hat;
  kit.hat.triggerAttackRelease(0.015, 0, 0.8);
  assert.ok(ctx.bufferSourceStarts.length > 0);
  kit.silence();
  assert.equal(kit.hat, hat);
  kit.hat.triggerAttackRelease(0.015, 0.1, 0.8);
  assert.ok(ctx.bufferSourceStarts.length > 1);
});

test("buffer offsets are deterministic across repeated instances", () => {
  const ctxA = stubAudioContext();
  const kitA = createDrumSculptorKit(ctxA, stubOutputs());
  kitA.hat.triggerAttackRelease(0.015, 0, 0.8);
  kitA.hat.triggerAttackRelease(0.015, 0.1, 0.8);

  const ctxB = stubAudioContext();
  const kitB = createDrumSculptorKit(ctxB, stubOutputs());
  kitB.hat.triggerAttackRelease(0.015, 0, 0.8);
  kitB.hat.triggerAttackRelease(0.015, 0.1, 0.8);

  const offsetsA = ctxA.bufferSourceStarts.map((s) => s.offset);
  const offsetsB = ctxB.bufferSourceStarts.map((s) => s.offset);
  assert.deepEqual(offsetsA, offsetsB, "identical kit lifecycles produce identical offset sequences");
});

// ---------------------------------------------------------------------------
// Mode gating
// ---------------------------------------------------------------------------

test("polished mode plays hat at playbackRate 1.0", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { mode: "polished" });
  kit.hat.triggerAttackRelease(0.015, 0, 0.8);
  const rateAutomation = ctx.automations.find((a) => a.name === "playbackRate");
  // playbackRate is set as .value = 1.0 in polished mode, so it may not appear as an automation.
  // Instead, check the bufferSource node's playbackRate.value directly.
  const bufferSourceNode = ctx.nodes.find((n) => n._kind === "bufferSource");
  assert.equal(bufferSourceNode.playbackRate.value, 1.0);
});

test("authentic mode plays closed hat at playbackRate 1.8", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs(), { mode: "authentic" });
  kit.hat.triggerAttackRelease(0.015, 0, 0.8);
  const bufferSourceNode = ctx.nodes.find((n) => n._kind === "bufferSource");
  assert.equal(bufferSourceNode.playbackRate.value, 1.8);
});

test("polished mode reduces snare body layer strength versus authentic", () => {
  const ctxPolished = stubAudioContext();
  const kitPolished = createDrumSculptorKit(ctxPolished, stubOutputs(), { mode: "polished" });
  kitPolished.snare.triggerAttackRelease(0.05, 0, 1);
  const polishedLinears = ctxPolished.automations
    .filter((a) => a.op === "linear" && a.name === "gain")
    .map((a) => a.value);

  const ctxAuthentic = stubAudioContext();
  const kitAuthentic = createDrumSculptorKit(ctxAuthentic, stubOutputs(), { mode: "authentic" });
  kitAuthentic.snare.triggerAttackRelease(0.05, 0, 1);
  const authenticLinears = ctxAuthentic.automations
    .filter((a) => a.op === "linear" && a.name === "gain")
    .map((a) => a.value);

  // Both should produce equal count of ramps, values differ per mode
  assert.equal(polishedLinears.length, authenticLinears.length);
  assert.notDeepEqual(polishedLinears, authenticLinears,
    "polished vs authentic should produce different snare layer balance");
});

// ---------------------------------------------------------------------------
// Per-state differentiation
// ---------------------------------------------------------------------------

test("critical kit has heavier kick thump than unknown", () => {
  assert.ok(APU_DRUM_SCULPTOR_KITS.critical.kick.thump
    > APU_DRUM_SCULPTOR_KITS.unknown.kick.thump);
});

test("unknown kit has longer noise decays than critical", () => {
  assert.ok(APU_DRUM_SCULPTOR_KITS.unknown.snare.noiseDecay
    > APU_DRUM_SCULPTOR_KITS.critical.snare.noiseDecay);
  assert.ok(APU_DRUM_SCULPTOR_KITS.unknown.openHat.decay
    > APU_DRUM_SCULPTOR_KITS.critical.openHat.decay);
});

test("state switch produces different accent bandpass centre", () => {
  const ctxHealthy = stubAudioContext();
  const kitHealthy = createDrumSculptorKit(ctxHealthy, stubOutputs(), { state: "healthy" });
  kitHealthy.noiseAccent.triggerAttackRelease(0.085, 0, 0.5);
  const healthyBandpass = ctxHealthy.nodes.find((n) => n._kind === "filter" && n.type === "bandpass");

  const ctxCritical = stubAudioContext();
  const kitCritical = createDrumSculptorKit(ctxCritical, stubOutputs(), { state: "critical" });
  kitCritical.noiseAccent.triggerAttackRelease(0.085, 0, 0.5);
  const criticalBandpass = ctxCritical.nodes.find((n) => n._kind === "filter" && n.type === "bandpass");

  assert.notEqual(healthyBandpass.frequency.value, criticalBandpass.frequency.value,
    "different states should choose different bandpass centre frequencies");
});

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

test("dispose does not throw and is idempotent", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, stubOutputs());
  kit.kick.triggerAttackRelease(0.14, 0, 1);
  kit.snare.triggerAttackRelease(0.05, 0.1, 1);
  assert.doesNotThrow(() => kit.dispose());
  assert.doesNotThrow(() => kit.dispose(), "double dispose is safe");
});

// ---------------------------------------------------------------------------
// Source-level negative controls
// ---------------------------------------------------------------------------

test("source does not import Tone.Player, Sampler, or GrainPlayer", () => {
  assert.doesNotMatch(SOURCE, /Tone\.Player/);
  assert.doesNotMatch(SOURCE, /Tone\.Sampler/);
  assert.doesNotMatch(SOURCE, /GrainPlayer/);
});

test("source does not reference sample assets", () => {
  assert.doesNotMatch(SOURCE, /\.wav\b/i);
  assert.doesNotMatch(SOURCE, /\.mp3\b/i);
  assert.doesNotMatch(SOURCE, /\.ogg\b/i);
});

test("source does not use Math.random", () => {
  assert.doesNotMatch(SOURCE, /Math\.random/);
});

test("polished is the default exported mode label", () => {
  assert.match(SOURCE, /APU_DRUM_SCULPTOR_DEFAULT_MODE\s*=\s*"polished"/);
});
