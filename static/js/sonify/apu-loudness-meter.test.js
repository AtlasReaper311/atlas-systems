import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_LOUDNESS_PROCESSOR_NAME,
  APU_LOUDNESS_WORKLET_URL,
  createApuLoudnessMeter,
} from "./apu-loudness-meter.js";

const directory = dirname(fileURLToPath(import.meta.url));

function fakeWorkletNode(name, options) {
  return {
    name,
    options,
    messages: [],
    disposed: false,
    port: {
      onmessage: null,
      postMessage(message) {
        this.owner.messages.push(message);
      },
      close() {
        this.owner.portClosed = true;
      },
      owner: null,
    },
    disconnect() {
      this.disposed = true;
    },
  };
}

test("the AudioWorklet source is self-contained and classic-loader safe", () => {
  const source = readFileSync(join(directory, "apu-loudness-worklet.js"), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false, "worklet must not use static imports");
  assert.equal(/^\s*export\s/m.test(source), false, "worklet must not use module exports");
  assert.match(source, /registerProcessor\(PROCESSOR_NAME, AtlasApuLoudnessProcessor\)/);
  assert.match(source, /1\.53512485958697/);
  assert.match(source, /-1\.99004745483398/);
  assert.doesNotThrow(() => new Function(source));
});

test("the controller rejects unsupported contexts before touching the source", async () => {
  let connected = false;
  await assert.rejects(
    createApuLoudnessMeter({
      context: {},
      source: { connect: () => { connected = true; } },
    }),
    /AudioWorklet is unavailable/,
  );
  assert.equal(connected, false);
});

test("the controller uses Tone's context factory so source and worklet share one node dialect", async () => {
  let node = null;
  const moduleRegistrations = [];
  const statusEvents = [];
  const metricEvents = [];
  const connections = [];
  const disconnections = [];
  const createdNodes = [];

  const toneContext = {
    sampleRate: 48000,
    async addAudioWorkletModule(url, name) {
      moduleRegistrations.push({ url, name });
    },
    createAudioWorkletNode(name, options) {
      node = fakeWorkletNode(name, options);
      node.port.owner = node;
      createdNodes.push(node);
      return node;
    },
    rawContext: {
      _nativeAudioContext: {
        sampleRate: 48000,
        audioWorklet: {
          addModule() {
            throw new Error("native path must not be selected when Tone factory exists");
          },
        },
      },
    },
  };

  const source = {
    connect(destination) {
      connections.push(destination);
    },
    disconnect(destination) {
      disconnections.push(destination);
    },
  };

  const meter = await createApuLoudnessMeter({
    context: toneContext,
    source,
    onStatus: (event) => statusEvents.push(event),
    onMetrics: (metrics) => metricEvents.push(metrics),
  });

  assert.deepEqual(moduleRegistrations, [{
    url: APU_LOUDNESS_WORKLET_URL,
    name: APU_LOUDNESS_PROCESSOR_NAME,
  }]);
  assert.equal(createdNodes.length, 1);
  assert.equal(node.name, APU_LOUDNESS_PROCESSOR_NAME);
  assert.equal(node.options.numberOfOutputs, 0);
  assert.equal(node.options.channelCount, 2);
  assert.deepEqual(connections, [node]);
  assert.equal(meter.getStatus().status, "loading");
  assert.equal(meter.getStatus().dialect, "tone-context");

  node.port.onmessage({ data: { type: "ready", buildId: "dsp", sampleRate: 48000 } });
  assert.equal(meter.getStatus().status, "running");
  assert.equal(meter.getStatus().processorReady, true);

  node.port.onmessage({ data: { type: "metrics", metrics: { integratedLufs: -18, ready: true } } });
  assert.equal(meter.getMetrics().integratedLufs, -18);
  assert.equal(metricEvents.length, 1);
  assert.equal(statusEvents.at(-1).status, "running");
  assert.equal(statusEvents.at(-1).dialect, "tone-context");

  assert.equal(meter.reset(), true);
  assert.deepEqual(node.messages, [{ type: "reset" }]);

  meter.dispose();
  assert.deepEqual(disconnections, [node]);
  assert.equal(node.portClosed, true);
  assert.equal(node.disposed, true);
  assert.equal(meter.getStatus().disposed, true);
});

test("the controller retains a native-context fallback outside Tone", async (context) => {
  const previousAudioWorkletNode = globalThis.AudioWorkletNode;
  const previousBaseAudioContext = globalThis.BaseAudioContext;
  let node = null;
  const moduleUrls = [];
  const connections = [];

  class FakeBaseAudioContext {
    constructor() {
      this.sampleRate = 44100;
      this.audioWorklet = {
        addModule: async (url) => moduleUrls.push(url),
      };
    }
  }

  class FakeAudioWorkletNode {
    constructor(rawContext, name, options) {
      assert.ok(rawContext instanceof FakeBaseAudioContext);
      node = fakeWorkletNode(name, options);
      node.port.owner = node;
      return node;
    }
  }

  globalThis.BaseAudioContext = FakeBaseAudioContext;
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  context.after(() => {
    if (previousAudioWorkletNode === undefined) delete globalThis.AudioWorkletNode;
    else globalThis.AudioWorkletNode = previousAudioWorkletNode;
    if (previousBaseAudioContext === undefined) delete globalThis.BaseAudioContext;
    else globalThis.BaseAudioContext = previousBaseAudioContext;
  });

  const nativeContext = new FakeBaseAudioContext();
  const source = {
    connect(destination) {
      connections.push(destination);
    },
    disconnect() {},
  };

  const meter = await createApuLoudnessMeter({ context: nativeContext, source });
  assert.deepEqual(moduleUrls, [APU_LOUDNESS_WORKLET_URL]);
  assert.deepEqual(connections, [node]);
  assert.equal(meter.getStatus().dialect, "native-context");
  meter.dispose();
});
