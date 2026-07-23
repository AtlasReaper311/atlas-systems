import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import vm from "node:vm";

const processorSource = readFileSync(
  new URL("../signal/worklets/signal-garden-processor-v2.js", import.meta.url),
  "utf8",
);

const mainSource = readFileSync(
  new URL("../signal/signal-v2-core.js", import.meta.url),
  "utf8",
);

const htmlSource = readFileSync(
  new URL("../signal/index.html", import.meta.url),
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
      assert.equal(name, "signal-garden-v2");
      ProcessorClass = processorClass;
    },
    Float32Array,
    Float64Array,
    Math,
    Array,
    Number,
    Boolean,
    Object,
    String,
    performance,
    globalThis: null,
  });
  context.globalThis = context;
  vm.runInContext(processorSource, context, { filename: "signal-garden-processor-v2.js" });
  assert.ok(ProcessorClass);
  return new ProcessorClass();
}

function parameters(overrides = {}) {
  const values = {
    density: 0.72,
    grainSize: 0.11,
    spread: 0.76,
    tone: 0.82,
    tension: 0.12,
    texture: 0.3,
    width: 0.94,
    feedback: 0.48,
    evolution: 0.78,
    quantize: 0.96,
    lushness: 0.46,
    shape: 0.24,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, new Float32Array([value])]),
  );
}

function configureDefaultGenome(processor) {
  processor.port.onmessage({
    data: {
      type: "genome-profile",
      ratios: [0.5, 0.75, 1, 1.25, 1.5, 2],
      weights: [0.07, 0.15, 0.29, 0.22, 0.17, 0.1],
      modalRatios: [1, 1.498, 2.01, 2.67, 3.76, 5.11],
      motion: { panDrift: 0.72, pitchDrift: 0.04, orbit: 0.34, attractor: 0.86 },
      layers: { harmonic: 0.72, resonator: 0.92, transient: 0.72, noise: 0.34, fm: 0.28, sub: 0.16, air: 0.78 },
      eventRate: 0.7,
      field: "glass pentatonic",
    },
  });
}

function recycleMessages(processor) {
  const messages = processor.port.messages.splice(0);
  for (const message of messages) {
    if (message.type === "grain-state") {
      processor.port.onmessage({
        data: { type: "grain-state-buffer", state: message.state },
      });
    }
  }
  return messages;
}

test("v2 worklet produces bounded non-trivial evolving stereo output", () => {
  assert.equal(processorSource.includes("SharedArrayBuffer"), false);
  const processor = loadProcessor();
  configureDefaultGenome(processor);
  processor.port.onmessage({ data: { type: "character", value: 0.3 } });
  processor.port.onmessage({ data: { type: "mode", value: "autonomous" } });
  processor.port.onmessage({ data: { type: "grain-state-buffer", state: new Float32Array(48 * 4) } });
  processor.port.onmessage({ data: { type: "grain-state-buffer", state: new Float32Array(48 * 4) } });

  const params = parameters();
  let energy = 0;
  let peak = 0;
  let samples = 0;

  for (let quantum = 0; quantum < 1500; quantum += 1) {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    assert.equal(processor.process([], [[left, right]], params), true);
    for (let index = 0; index < left.length; index += 1) {
      assert.ok(Number.isFinite(left[index]));
      assert.ok(Number.isFinite(right[index]));
      energy += (left[index] * left[index] + right[index] * right[index]) * 0.5;
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
      samples += 1;
    }
    recycleMessages(processor);
    assert.ok(processor.grains.length <= processor.voiceLimit);
    assert.equal(processor.grains.length + processor.grainPool.length, 48);
    assert.ok(processor.voiceLimit >= 24 && processor.voiceLimit <= 48);
  }

  const rms = Math.sqrt(energy / samples);
  assert.ok(rms > 0.003, `expected audible RMS, received ${rms}`);
  assert.ok(peak > 0.02, `expected non-trivial peak, received ${peak}`);
  assert.ok(peak <= 0.721, `worklet safety output exceeded expected soft-clipped ceiling: ${peak}`);
});

test("autonomous lifecycle advances and publishes explanatory telemetry", () => {
  const processor = loadProcessor();
  configureDefaultGenome(processor);
  processor.port.onmessage({ data: { type: "mode", value: "autonomous" } });
  processor.lifecycleSamplesRemaining = 1;
  const before = processor.lifecycle;
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  processor.process([], [[left, right]], parameters());
  const messages = recycleMessages(processor);
  assert.notEqual(processor.lifecycle, before);
  const lifecycle = messages.find((message) => message.type === "lifecycle");
  assert.ok(lifecycle);
  assert.equal(typeof lifecycle.field, "string");
  assert.equal(typeof lifecycle.motion, "string");
  assert.ok(lifecycle.layers.resonator >= 0);
  assert.ok(lifecycle.layers.transient >= 0);
});

test("perform mode stops autonomous lifecycle takeover", () => {
  const processor = loadProcessor();
  configureDefaultGenome(processor);
  processor.port.onmessage({ data: { type: "mode", value: "perform" } });
  processor.lifecycleSamplesRemaining = 1;
  const before = processor.lifecycle;
  processor.process([], [[new Float32Array(128), new Float32Array(128)]], parameters());
  assert.equal(processor.lifecycle, before);
  assert.equal(processor.lifecycleSamplesRemaining, 1);
});

test("procedural source combines multiple synthesis layers and accepts local replacement", () => {
  const processor = loadProcessor();
  configureDefaultGenome(processor);
  for (let index = 0; index < 8192; index += 1) {
    processor.writeProceduralSource(0.2, 0.4, 0.8, 0.7);
    processor.sampleCounter += 1;
  }
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0; index < 8192; index += 1) {
    minimum = Math.min(minimum, processor.source[index]);
    maximum = Math.max(maximum, processor.source[index]);
  }
  assert.ok(maximum - minimum > 0.1);
  assert.ok(processor.effectiveLayers[0] > 0);
  assert.ok(processor.effectiveLayers[1] > 0);

  const samples = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index / 20));
  processor.port.onmessage({ data: { type: "source-buffer", samples, sampleRate: 44100 } });
  assert.equal(processor.sourceMode, "sample");
  processor.port.onmessage({ data: { type: "source-procedural" } });
  assert.equal(processor.sourceMode, "procedural");
  assert.equal(processor.externalSource, null);
});

test("UI defaults to a 50 percent master volume with explicit makeup gain and limiter", () => {
  assert.match(htmlSource, /id="master-volume"[^>]*value="50"/);
  assert.match(mainSource, /new GainNode\(audioContext, \{ gain: 1\.75 \}\)/);
  assert.match(mainSource, /new DynamicsCompressorNode/);
  assert.match(mainSource, /new GainNode\(audioContext, \{ gain: Number\(masterVolumeInput\.value\) \/ 100 \}\)/);
});
