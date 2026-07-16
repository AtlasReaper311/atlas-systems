import assert from "node:assert/strict";
import test from "node:test";

import { createPerformanceArrangement } from "./performance.js";
import {
  createHybridSampler,
  waitForSampleLoad,
} from "./sampler.js";

function fakeToneRuntime({ load = "resolve" } = {}) {
  const constructed = [];
  const starts = [];
  const triggers = [];
  const parameter = (value = 0) => ({
    value,
    rampTo(nextValue) { this.value = nextValue; },
    setValueAtTime(nextValue) { this.value = nextValue; },
  });

  class FakeNode {
    constructor(name, options = {}) {
      this.name = name;
      this.options = options && typeof options === "object" ? options : {};
      this.gain = parameter(Number.isFinite(options) ? options : 0);
      this.volume = parameter(this.options.volume ?? 0);
      this.detune = parameter(this.options.detune ?? 0);
      this.playbackRate = this.options.playbackRate ?? 1;
      this.reverse = false;
      constructed.push({ name, options: this.options });
    }
    connect() { return this; }
    start(...args) { starts.push({ name: this.name, args }); return this; }
    triggerAttackRelease(...args) { triggers.push({ name: this.name, args }); }
    dispose() {}
  }

  const node = (name) => class extends FakeNode {
    constructor(options) { super(name, options); }
  };

  const loaded = load === "resolve"
    ? async () => undefined
    : load === "reject"
      ? async () => { throw new Error("decode failed"); }
      : () => new Promise(() => {});

  return {
    Tone: {
      Gain: node("Gain"),
      Distortion: node("Distortion"),
      Player: node("Player"),
      Sampler: node("Sampler"),
      GrainPlayer: node("GrainPlayer"),
      Filter: node("Filter"),
      loaded,
    },
    output: new FakeNode("Output"),
    reverb: new FakeNode("ReverbInput"),
    delay: new FakeNode("DelayInput"),
    constructed,
    starts,
    triggers,
  };
}

test("sample loading resolves and fails closed on a bounded timeout", async () => {
  assert.equal(await waitForSampleLoad({ loaded: async () => undefined }, 20), true);
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await waitForSampleLoad({ loaded: () => new Promise(() => {}) }, 10), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("the hybrid sampler allocates the bounded library once and plays every layer", async () => {
  const runtime = fakeToneRuntime();
  const sampler = createHybridSampler(runtime.Tone, {
    output: runtime.output,
    reverbInput: runtime.reverb,
    delayInput: runtime.delay,
  });
  try {
    assert.equal(await sampler.load(), true);
    assert.equal(runtime.constructed.filter(({ name }) => name === "Player").length, 19);
    assert.equal(runtime.constructed.filter(({ name }) => name === "Sampler").length, 6);
    assert.equal(runtime.constructed.filter(({ name }) => name === "GrainPlayer").length, 35);
    const bassDrive = runtime.constructed.find(({ name }) => name === "Distortion");
    assert.ok(bassDrive.options.distortion <= 0.25);
    const lowpassFilters = runtime.constructed.filter(({ name, options }) => (
      name === "Filter" && options.type === "lowpass"
    ));
    assert.ok(lowpassFilters.length >= 2, "bass and atmosphere need independent filters");
    assert.ok(
      runtime.constructed
        .filter(({ name }) => name === "Player")
        .every(({ options }) => options.fadeIn >= 0.002),
      "one-shots should use a short anti-click fade",
    );

    const performance = {
      ...createPerformanceArrangement("A71A5", "healthy"),
      bassLoopTimbre: 0,
      bassLoopSliceVariant: 0,
      sectionVariant: 0,
    };
    const frame = { scoreState: "healthy", bpm: performance.targetBpm };
    const palette = sampler.applyScene(frame, performance, 0, 0.1);
    assert.equal(typeof palette.signature, "string");
    assert.ok(sampler.playDrums(0, frame, 0, 0, {
      kick: { velocity: 0.7 },
      snare: { velocity: 0.5 },
      hat: { velocity: 0.3 },
      metal: { velocity: 0.2 },
    }, performance));
    assert.ok(sampler.playBass(0, frame, {
      step: 0,
      frequency: 73.42,
      duration: "8n",
      velocity: 0.6,
    }, 0, performance));
    assert.equal(runtime.triggers.length, 1, "one-shot bass should trigger once");

    const loopPerformance = { ...performance, bassLoopTimbre: 1 };
    sampler.applyScene(frame, loopPerformance, 0, 0.1);
    assert.equal(sampler.playBassPhrase(0, frame, 0, 0, loopPerformance), true);
    assert.equal(sampler.playBassPhrase(0, frame, 1, 0, loopPerformance), false);
    assert.equal(sampler.playBass(0, frame, {
      step: 0,
      frequency: 73.42,
      duration: "8n",
      velocity: 0.6,
    }, 0, loopPerformance), true);
    assert.equal(
      runtime.triggers.length,
      1,
      "a rhythmic bass loop must replace rather than double the one-shot",
    );
    assert.ok(sampler.playLead(0, frame, 0, 0, performance));
    assert.equal(
      sampler.playSectionAccent(0, { scoreState: "critical" }, 2, { sectionVariant: 0 }),
      false,
      "breach must not put a tape-stop on the downbeat",
    );
    assert.equal(
      sampler.playSectionAccent(0, { scoreState: "critical" }, 6, { sectionVariant: 0 }),
      true,
      "redline keeps its bounded crash transition",
    );
    assert.ok(runtime.starts.length >= 10, "atmospheres, drums, bass loop and lead should start");
  } finally {
    sampler.dispose();
  }
});

test("a failed library keeps sample playback silent for synth fallback", async () => {
  const runtime = fakeToneRuntime({ load: "reject" });
  const sampler = createHybridSampler(runtime.Tone, { output: runtime.output });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await sampler.load(), false);
    assert.equal(sampler.isReady(), false);
    assert.equal(sampler.playDrums(0, { scoreState: "healthy" }, 0, 0, {}, null), false);
    assert.equal(sampler.playLead(0, { scoreState: "healthy" }, 0, 0, null), false);
    assert.equal(
      sampler.playBassPhrase(0, { scoreState: "healthy" }, 0, 0, null),
      false,
    );
  } finally {
    console.warn = originalWarn;
    sampler.dispose();
  }
});
