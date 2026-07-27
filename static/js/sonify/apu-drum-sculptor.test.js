import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_DRUM_SCULPTOR_BUILD_ID,
  APU_DRUM_SCULPTOR_DEFAULT_MODE,
  APU_DRUM_SCULPTOR_KITS,
  APU_DRUM_SCULPTOR_MODES,
  createDrumSculptorKit,
  curveVelocity,
  fnv1a,
  kitForState,
} from "./apu-drum-sculptor.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "apu-drum-sculptor.js"), "utf8");

function stubAudioContext({ sampleRate = 44100, currentTime = 0 } = {}) {
  const nodes = [];
  const automations = [];
  const starts = [];

  function param(name, node) {
    return {
      value: 0,
      setValueAtTime(value, time) {
        this.value = value;
        automations.push({ node, name, op: "set", value, time });
      },
      linearRampToValueAtTime(value, time) {
        this.value = value;
        automations.push({ node, name, op: "linear", value, time });
      },
      exponentialRampToValueAtTime(value, time) {
        this.value = value;
        automations.push({ node, name, op: "exp", value, time });
      },
    };
  }

  function record(node, kind) {
    node._kind = kind;
    nodes.push(node);
    return node;
  }

  return {
    sampleRate,
    currentTime,
    nodes,
    automations,
    starts,
    createGain() {
      const node = { connect() {}, disconnect() {} };
      node.gain = param("gain", node);
      return record(node, "gain");
    },
    createOscillator() {
      const node = {
        type: "sine",
        connect() {},
        disconnect() {},
        start(time) { node._start = time; },
        stop(time) { node._stop = time; },
      };
      node.frequency = param("frequency", node);
      node.detune = param("detune", node);
      return record(node, "oscillator");
    },
    createBufferSource() {
      const node = {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        start(time, offset) {
          node._start = time;
          node._offset = offset;
          starts.push({ time, offset });
        },
        stop(time) { node._stop = time; },
      };
      node.playbackRate = param("playbackRate", node);
      return record(node, "bufferSource");
    },
    createBiquadFilter() {
      const node = { type: "lowpass", connect() {}, disconnect() {} };
      node.frequency = param("frequency", node);
      node.Q = param("Q", node);
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
}

function outputs() {
  return {
    kickOutput: {},
    snareOutput: {},
    hatOutput: {},
    accentOutput: {},
  };
}

test("metadata and modes are stable", () => {
  assert.match(APU_DRUM_SCULPTOR_BUILD_ID, /^20260727-/);
  assert.deepEqual([...APU_DRUM_SCULPTOR_MODES], ["polished", "authentic"]);
  assert.equal(APU_DRUM_SCULPTOR_DEFAULT_MODE, "polished");
});

for (const state of ["healthy", "warning", "critical", "unknown"]) {
  test(`${state} kit defines every voice`, () => {
    for (const voice of ["kick", "snare", "hat", "openHat", "accent"]) {
      assert.ok(APU_DRUM_SCULPTOR_KITS[state][voice]);
      assert.ok(Object.isFrozen(APU_DRUM_SCULPTOR_KITS[state][voice]));
    }
  });
}

test("invalid state fails closed to unknown", () => {
  assert.equal(kitForState("broken"), APU_DRUM_SCULPTOR_KITS.unknown);
});

test("velocity curve is bounded and monotonic", () => {
  let previous = -1;
  for (let step = 0; step <= 100; step += 1) {
    const value = curveVelocity(step / 100);
    assert.ok(value >= previous);
    assert.ok(value >= 0 && value <= 1);
    previous = value;
  }
});

test("velocity curve rejects pathological values", () => {
  assert.equal(curveVelocity(-1), 0);
  assert.equal(curveVelocity(NaN), 0);
  assert.equal(curveVelocity(5), 1);
  assert.ok(curveVelocity(0.05) < 0.02);
});

test("FNV variation is deterministic", () => {
  assert.equal(fnv1a("hat-1"), fnv1a("hat-1"));
  assert.notEqual(fnv1a("hat-1"), fnv1a("hat-2"));
  assert.ok(fnv1a("hat-1") >= 0);
});

test("factory validates context and outputs", () => {
  assert.throws(() => createDrumSculptorKit({}, outputs()), /raw AudioContext/);
  assert.throws(
    () => createDrumSculptorKit(stubAudioContext(), { ...outputs(), hatOutput: null }),
    /hatOutput is required/,
  );
});

test("factory exposes a stable five-voice kit", () => {
  const kit = createDrumSculptorKit(stubAudioContext(), outputs());
  for (const voice of ["kick", "snare", "hat", "openHat", "noiseAccent"]) {
    assert.ok(kit[voice]);
    assert.equal(typeof kit[voice].triggerAttackRelease, "function");
  }
  assert.equal(kit.getMode(), "polished");
  assert.equal(kit.getState(), "healthy");
});

test("invalid mode and state use safe defaults", () => {
  const kit = createDrumSculptorKit(stubAudioContext(), outputs(), {
    mode: "broken",
    state: "broken",
  });
  assert.equal(kit.getMode(), "polished");
  assert.equal(kit.getState(), "unknown");
});

test("state changes preserve voice identity", () => {
  const kit = createDrumSculptorKit(stubAudioContext(), outputs());
  const hat = kit.hat;
  kit.setState("critical");
  assert.equal(kit.hat, hat);
  assert.equal(kit.getKit(), APU_DRUM_SCULPTOR_KITS.critical);
  kit.setState("broken");
  assert.equal(kit.getState(), "unknown");
});

test("hat filters read the current state per trigger", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, outputs(), { state: "healthy" });
  kit.hat.triggerAttackRelease(0.015, 0, 0.8);
  kit.setState("critical");
  kit.hat.triggerAttackRelease(0.015, 0.1, 0.8);
  const highpasses = ctx.nodes.filter((node) => node.type === "highpass");
  assert.equal(highpasses[0].frequency.value, APU_DRUM_SCULPTOR_KITS.healthy.hat.cutoffHz);
  assert.equal(highpasses[1].frequency.value, APU_DRUM_SCULPTOR_KITS.critical.hat.cutoffHz);
});

test("zero velocity schedules no nodes", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, outputs());
  const initial = ctx.nodes.length;
  kit.kick.triggerAttackRelease(0.14, 0, 0);
  kit.snare.triggerAttackRelease(0.05, 0, 0);
  kit.hat.triggerAttackRelease(0.015, 0, 0);
  kit.openHat.triggerAttackRelease(0.075, 0, 0);
  kit.noiseAccent.triggerAttackRelease(0.085, 0, 0);
  assert.equal(ctx.nodes.length, initial);
});

test("kick accepts the current four-argument engine contract", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, outputs(), { bpm: 100 });
  kit.kick.triggerAttackRelease("F1", "16n", 0.5, 0.8);
  const main = ctx.nodes.find((node) => node._kind === "oscillator" && node.type === "sine");
  assert.equal(main._start, 0.5);
  assert.ok(main._stop > 0.65);
});

test("all voices schedule finite bounded gain values", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, outputs(), { state: "critical" });
  kit.kick.triggerAttackRelease(0.14, 0, 1);
  kit.snare.triggerAttackRelease(0.05, 0.1, 0.8);
  kit.hat.triggerAttackRelease(0.015, 0.2, 0.6);
  kit.openHat.triggerAttackRelease(0.075, 0.3, 0.4);
  kit.noiseAccent.triggerAttackRelease(0.085, 0.4, 0.5);
  for (const automation of ctx.automations.filter((item) => item.name === "gain")) {
    assert.ok(Number.isFinite(automation.value));
    assert.ok(automation.value >= 0 && automation.value <= 1);
  }
});

test("tiny positive velocity keeps ramps above zero", () => {
  const ctx = stubAudioContext();
  const kit = createDrumSculptorKit(ctx, outputs());
  kit.hat.triggerAttackRelease(0.015, 0, 1e-8);
  const attack = ctx.automations.find((item) => item.name === "gain" && item.op === "linear");
  assert.ok(attack.value >= 0.0001);
});

test("consecutive hits use deterministic distinct offsets", () => {
  const first = stubAudioContext();
  const firstKit = createDrumSculptorKit(first, outputs());
  firstKit.hat.triggerAttackRelease(0.015, 0, 0.8);
  firstKit.hat.triggerAttackRelease(0.015, 0.1, 0.8);

  const second = stubAudioContext();
  const secondKit = createDrumSculptorKit(second, outputs());
  secondKit.hat.triggerAttackRelease(0.015, 0, 0.8);
  secondKit.hat.triggerAttackRelease(0.015, 0.1, 0.8);

  assert.notEqual(first.starts[0].offset, first.starts[1].offset);
  assert.deepEqual(first.starts, second.starts);
});

test("offset time is independent of device sample rate", () => {
  const a = stubAudioContext({ sampleRate: 44100 });
  createDrumSculptorKit(a, outputs()).hat.triggerAttackRelease(0.015, 0, 0.8);
  const b = stubAudioContext({ sampleRate: 48000 });
  createDrumSculptorKit(b, outputs()).hat.triggerAttackRelease(0.015, 0, 0.8);
  assert.equal(a.starts[0].offset, b.starts[0].offset);
});

test("polished and authentic hats retain distinct playback rates", () => {
  const polished = stubAudioContext();
  createDrumSculptorKit(polished, outputs(), { mode: "polished" })
    .hat.triggerAttackRelease(0.015, 0, 0.8);
  const authentic = stubAudioContext();
  createDrumSculptorKit(authentic, outputs(), { mode: "authentic" })
    .hat.triggerAttackRelease(0.015, 0, 0.8);
  assert.equal(polished.nodes.find((node) => node._kind === "bufferSource").playbackRate.value, 1);
  assert.equal(authentic.nodes.find((node) => node._kind === "bufferSource").playbackRate.value, 1.8);
});

test("state kits are audibly differentiated", () => {
  assert.ok(APU_DRUM_SCULPTOR_KITS.critical.kick.thump > APU_DRUM_SCULPTOR_KITS.unknown.kick.thump);
  assert.ok(APU_DRUM_SCULPTOR_KITS.unknown.openHat.decay > APU_DRUM_SCULPTOR_KITS.critical.openHat.decay);
  assert.notEqual(APU_DRUM_SCULPTOR_KITS.healthy.accent.centreHz, APU_DRUM_SCULPTOR_KITS.critical.accent.centreHz);
});

test("dispose is idempotent", () => {
  const kit = createDrumSculptorKit(stubAudioContext(), outputs());
  kit.kick.triggerAttackRelease(0.14, 0, 1);
  assert.doesNotThrow(() => kit.dispose());
  assert.doesNotThrow(() => kit.dispose());
});

test("source remains deterministic and sample-free", () => {
  assert.doesNotMatch(SOURCE, /Math\.random|Date\.now/);
  assert.doesNotMatch(SOURCE, /Tone\.(?:Player|Sampler)|GrainPlayer/);
  assert.doesNotMatch(SOURCE, /\.(?:wav|mp3|ogg)\b/i);
});
