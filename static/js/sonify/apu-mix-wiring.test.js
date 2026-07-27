import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_MIX_WIRING_BUILD_ID,
  attachMixWiring,
  createMixBus,
  translationNotes,
} from "./apu-mix-wiring.js";

function fixture() {
  const edges = [];
  const disposed = [];
  function param(value = 0) {
    return {
      value,
      events: [],
      setValueAtTime(v, at) { this.value = v; this.events.push(["set", v, at]); },
      linearRampToValueAtTime(v, at) { this.value = v; this.events.push(["linear", v, at]); },
      exponentialRampToValueAtTime(v, at) { this.value = v; this.events.push(["exp", v, at]); },
      cancelAndHoldAtTime(at) { this.events.push(["hold", at]); },
    };
  }
  class Base {
    constructor(kind) { this.kind = kind; }
    connect(target) { edges.push([this, target]); return this; }
    chain(...targets) { let source = this; for (const target of targets) { source.connect(target); source = target; } return this; }
    dispose() { disposed.push(this); }
  }
  class Gain extends Base { constructor(v = 1) { super("gain"); this.gain = param(v); } }
  class Filter extends Base { constructor(o = {}) { super("filter"); this.frequency = param(o.frequency ?? 1000); this.gain = param(o.gain ?? 0); } }
  class StereoWidener extends Base { constructor(v = 0.5) { super("widener"); this.width = param(v); } }
  class LFO extends Base { constructor(o = {}) { super("lfo"); this.frequency = param(o.frequency ?? 0.22); this.started = false; } start() { this.started = true; } stop() { this.started = false; } }
  const Tone = { Gain, Filter, StereoWidener, LFO };
  const destinations = Object.fromEntries(["melody", "chip", "delay", "reverb"].map((name) => [name, new Gain(1)]));
  const buses = {
    primary: createMixBus(Tone, { name: "primary", downstream: destinations.melody, auxiliarySends: [destinations.delay] }),
    secondary: createMixBus(Tone, { name: "secondary", downstream: destinations.melody, auxiliarySends: [destinations.delay] }),
    bass: createMixBus(Tone, { name: "bass", downstream: destinations.chip }),
    pad: createMixBus(Tone, { name: "pad", downstream: destinations.chip, auxiliarySends: [destinations.reverb] }),
    services: createMixBus(Tone, { name: "services", downstream: destinations.melody }),
    drums: createMixBus(Tone, { name: "drums", downstream: destinations.chip }),
    accent: createMixBus(Tone, { name: "accent", downstream: destinations.chip, auxiliarySends: [destinations.reverb] }),
  };
  const primaryPanner = { pan: param(0) };
  const secondaryPanner = { pan: param(0) };
  const servicePanners = [{ panner: { pan: param(0) }, basePan: -0.5 }, { panner: { pan: param(0) }, basePan: 0.5 }];
  const masterFilter = { frequency: param(8000) };
  const softenerShelf = { frequency: param(3400), gain: param(0) };
  const compressor = { threshold: param(-18), ratio: param(1.7), attack: param(0.02), release: param(0.2) };
  const safeRamp = (p, v, _d, at) => p.setValueAtTime(v, at ?? 0);
  return { Tone, edges, disposed, destinations, buses, primaryPanner, secondaryPanner, servicePanners, masterFilter, softenerShelf, compressor, safeRamp };
}

function directive() {
  const buses = {};
  for (const name of ["primary", "secondary", "bass", "pad", "services", "drums", "accent"]) {
    buses[name] = { gainMul: 1, highcutHz: 5000, width: 0.5 };
  }
  return {
    buses,
    ducking: [
      { source: "kick", target: "bass", depthDb: 3.2, releaseMs: 120 },
      { source: "kick", target: "pad", depthDb: 1.6, releaseMs: 200 },
      { source: "primary", target: "pad", depthDb: 2.2, releaseMs: 90 },
      { source: "primary", target: "services", depthDb: 1.2, releaseMs: 70 },
      { source: "services", target: "accent", depthDb: 1, releaseMs: 60 },
      { source: "drums", target: "accent", depthDb: 1.4, releaseMs: 80 },
    ],
    chipWobble: { rateHz: 0.22, depthCents: 4 },
    transientSoftener: { thresholdDb: -8, ratio: 1.4, freqHz: 3400 },
  };
}

test("build id identifies corrected wiring", () => assert.match(APU_MIX_WIRING_BUILD_ID, /v2$/));

test("explicit buses preserve every auxiliary send", () => {
  const { edges, buses, destinations } = fixture();
  assert.ok(edges.some(([source, target]) => source === buses.primary.spatial && target === destinations.delay));
  assert.ok(edges.some(([source, target]) => source === buses.secondary.spatial && target === destinations.delay));
  assert.ok(edges.some(([source, target]) => source === buses.pad.spatial && target === destinations.reverb));
  assert.ok(edges.some(([source, target]) => source === buses.accent.spatial && target === destinations.reverb));
});

test("no bus construction calls disconnect", () => {
  const source = createMixBus.toString();
  assert.doesNotMatch(source, /\.disconnect\s*\(/);
});

test("all six ducking rules remain active with shared target gains", () => {
  const f = fixture();
  const wiring = attachMixWiring(f.Tone, f);
  wiring.applyDirective(directive(), { safeRamp: f.safeRamp, compressionTarget: {}, at: 1 });
  assert.equal(wiring.duckOnHit("kick", 2), 2);
  assert.equal(wiring.duckOnHit("primary", 3), 2);
  assert.equal(wiring.duckOnHit("services", 4), 1);
  assert.equal(wiring.duckOnHit("drums", 5), 1);
  assert.ok(f.buses.pad.duck.gain.events.some(([kind]) => kind === "linear"));
  assert.ok(f.buses.accent.duck.gain.events.some(([kind]) => kind === "linear"));
});

test("directive owns one resolved compressor update", () => {
  const f = fixture();
  const wiring = attachMixWiring(f.Tone, f);
  wiring.applyDirective(directive(), {
    safeRamp: f.safeRamp,
    compressionTarget: { threshold: -21, ratio: 3.1, attack: 0.012, release: 0.16 },
    at: 1,
  });
  assert.equal(f.compressor.threshold.events.length, 1);
  assert.equal(f.compressor.ratio.events.length, 1);
  assert.equal(f.compressor.attack.events.length, 1);
  assert.equal(f.compressor.release.events.length, 1);
});

test("spatial ownership uses voice panners and stereo wideners", () => {
  const f = fixture();
  const wiring = attachMixWiring(f.Tone, f);
  wiring.applyDirective(directive(), { safeRamp: f.safeRamp, compressionTarget: {}, at: 1 });
  assert.equal(f.primaryPanner.pan.value, -0.21);
  assert.equal(f.secondaryPanner.pan.value, 0.21);
  assert.equal(f.servicePanners[0].panner.pan.value, -0.25);
  assert.equal(f.buses.pad.spatial.width.value, 0.5);
});

test("gain multipliers are available without mutating node bags", () => {
  const f = fixture();
  const wiring = attachMixWiring(f.Tone, f);
  wiring.applyDirective(directive(), { safeRamp: f.safeRamp, compressionTarget: {}, at: 1 });
  assert.equal(wiring.getGainMultiplier("primary"), 1);
  assert.equal(wiring.getGainMultiplier("unknown"), 1);
});

test("translation notes document honest width and ducking mappings", () => {
  const notes = translationNotes();
  assert.match(notes.ducking, /one gain per target/);
  assert.equal(notes.bassWidth, "mono by design");
});

test("dispose is idempotent", () => {
  const f = fixture();
  const wiring = attachMixWiring(f.Tone, f);
  wiring.dispose();
  wiring.dispose();
});
