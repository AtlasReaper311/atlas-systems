import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import vm from "node:vm";

const processorSource = readFileSync(
  new URL("../signal/worklets/signal-garden-processor.js", import.meta.url),
  "utf8",
);

class MockPort {
  constructor() {
    this.onmessage = null;
    this.messages = [];
  }

  postMessage(message) {
    this.messages.push(message);
  }
}

class MockAudioWorkletProcessor {
  constructor() {
    this.port = new MockPort();
  }
}

function loadProcessor() {
  let ProcessorClass = null;
  const context = vm.createContext({
    sampleRate: 48000,
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    registerProcessor(name, processorClass) {
      assert.equal(name, "signal-garden");
      ProcessorClass = processorClass;
    },
    Float32Array,
    Float64Array,
    Math,
    Array,
    Number,
    Boolean,
    performance,
    globalThis: null,
  });
  context.globalThis = context;
  vm.runInContext(processorSource, context, { filename: "signal-garden-processor.js" });
  assert.ok(ProcessorClass);
  return new ProcessorClass();
}

function parameters(overrides = {}) {
  const values = {
    density: 0.7,
    grainSize: 0.12,
    spread: 0.8,
    tone: 0.6,
    tension: 0.35,
    texture: 0.4,
    width: 0.9,
    feedback: 0.55,
    evolution: 0.75,
    quantize: 0.85,
    lushness: 0.7,
    shape: 0.5,
    ...overrides,
  };

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, new Float32Array([value])]),
  );
}

function recycleStateMessages(processor) {
  const messages = processor.port.messages.splice(0);
  for (const message of messages) {
    if (message.type === "grain-state") {
      processor.port.onmessage({
        data: { type: "grain-state-buffer", state: message.state },
      });
    }
  }
}

test("Signal Garden uses bounded transferable state buffers without SharedArrayBuffer", () => {
  assert.equal(processorSource.includes("SharedArrayBuffer"), false);

  const processor = loadProcessor();
  processor.port.onmessage({
    data: { type: "grain-state-buffer", state: new Float32Array(48 * 4) },
  });
  processor.port.onmessage({
    data: { type: "grain-state-buffer", state: new Float32Array(48 * 4) },
  });
  processor.port.onmessage({
    data: {
      type: "genome-profile",
      ratios: [0.5, 0.75, 1, 1.25, 1.5, 2],
      weights: [0.08, 0.16, 0.27, 0.22, 0.17, 0.1],
      motion: { panDrift: 0.72, pitchDrift: 0.04, orbit: 0.34, attractor: 0.86 },
    },
  });
  processor.port.onmessage({
    data: { type: "attractor", active: true, x: 0.8, y: 0.25, strength: 0.8, velocity: 0.4 },
  });
  processor.port.onmessage({ data: { type: "weather", value: "bloom" } });
  processor.port.onmessage({ data: { type: "spectral-mode", value: "blur" } });

  const params = parameters();
  for (let quantum = 0; quantum < 400; quantum += 1) {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    assert.equal(processor.process([], [[left, right]], params), true);
    assert.ok(left.every(Number.isFinite));
    assert.ok(right.every(Number.isFinite));
    recycleStateMessages(processor);
    assert.ok(processor.grains.length <= processor.voiceLimit);
    assert.equal(processor.grains.length + processor.grainPool.length, 48);
    assert.ok(processor.voiceLimit >= 24 && processor.voiceLimit <= 48);
  }

  processor.port.onmessage({ data: { type: "seed", value: 311 } });
  assert.equal(processor.grains.length, 0);
  assert.equal(processor.grainPool.length, 48);
});

test("harmonic tension dissolves scale attraction into microtonal instability", () => {
  const processor = loadProcessor();
  processor.port.onmessage({
    data: {
      type: "genome-profile",
      ratios: [0.5, 1, 1.5],
      weights: [0, 1, 0],
      motion: { panDrift: 0, pitchDrift: 0, orbit: 0, attractor: 0 },
    },
  });

  processor.reseed(311);
  processor.spawnGrain(0.1, 0.5, 0, 1, 0);
  assert.equal(processor.grains[0].ratioStart, 1);

  processor.resetGrains();
  processor.reseed(311);
  processor.spawnGrain(0.1, 0.5, 1, 1, 0);
  assert.notEqual(processor.grains[0].ratioStart, 1);
});

test("local source buffers can replace and restore procedural source memory", () => {
  const processor = loadProcessor();
  const samples = Float32Array.from(
    { length: 4096 },
    (_, index) => Math.sin(index / 20),
  );

  processor.port.onmessage({
    data: { type: "source-buffer", samples, sampleRate: 44100, name: "fixture.wav" },
  });
  assert.equal(processor.sourceMode, "sample");
  assert.equal(processor.externalSourceSampleRate, 44100);

  processor.port.onmessage({ data: { type: "source-procedural" } });
  assert.equal(processor.sourceMode, "procedural");
  assert.equal(processor.externalSource, null);
});
