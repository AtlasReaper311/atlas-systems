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

function fakeConnectableNode(name = "node") {
  return {
    name,
    connections: [],
    disconnections: [],
    connect(destination) {
      this.connections.push(destination);
    },
    disconnect(destination) {
      this.disconnections.push(destination ?? null);
    },
  };
}

function fakeWorkletNode(name, options) {
  const node = {
    ...fakeConnectableNode(name),
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
  };
  const disconnect = node.disconnect.bind(node);
  node.disconnect = (destination) => {
    disconnect(destination);
    if (destination === undefined) node.disposed = true;
  };
  return node;
}

function fakeSilentContext(sampleRate = 48000) {
  const destination = fakeConnectableNode("destination");
  const sinks = [];
  return {
    sampleRate,
    destination,
    sinks,
    createGain() {
      const sink = fakeConnectableNode("silent-sink");
      sink.gain = { value: 1 };
      sinks.push(sink);
      return sink;
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

test("the controller uses Tone defaults and an independent zero-gain sink", async () => {
  let node = null;
  const moduleRegistrations = [];
  const statusEvents = [];
  const metricEvents = [];
  const sourceConnections = [];
  const sourceDisconnections = [];
  const createdNodes = [];
  const standardizedContext = fakeSilentContext(48000);

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
      ...standardizedContext,
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
      sourceConnections.push(destination);
    },
    disconnect(destination) {
      sourceDisconnections.push(destination);
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
  assert.equal(node.options, undefined, "Tone path must use registered processor defaults");
  assert.deepEqual(sourceConnections, [node]);

  assert.equal(standardizedContext.sinks.length, 1);
  const sink = standardizedContext.sinks[0];
  assert.equal(sink.gain.value, 0);
  assert.deepEqual(sink.connections, [standardizedContext.destination]);
  assert.deepEqual(node.connections, [sink]);

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
  assert.deepEqual(sourceDisconnections, [node]);
  assert.deepEqual(node.disconnections, [sink, null]);
  assert.deepEqual(sink.disconnections, [null]);
  assert.equal(node.portClosed, true);
  assert.equal(node.disposed, true);
  assert.equal(meter.getStatus().disposed, true);
});

test("the controller retains explicit native options outside Tone", async (context) => {
  const previousAudioWorkletNode = globalThis.AudioWorkletNode;
  const previousBaseAudioContext = globalThis.BaseAudioContext;
  let node = null;
  const moduleUrls = [];
  const sourceConnections = [];

  class FakeBaseAudioContext {
    constructor() {
      Object.assign(this, fakeSilentContext(44100));
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
      sourceConnections.push(destination);
    },
    disconnect() {},
  };

  const meter = await createApuLoudnessMeter({ context: nativeContext, source, maxBlockHistory: 1234 });
  assert.deepEqual(moduleUrls, [APU_LOUDNESS_WORKLET_URL]);
  assert.deepEqual(sourceConnections, [node]);
  assert.equal(node.options.numberOfInputs, 1);
  assert.equal(node.options.numberOfOutputs, 1);
  assert.equal(node.options.processorOptions.maxBlockHistory, 1234);
  assert.equal(nativeContext.sinks.length, 1);
  assert.equal(nativeContext.sinks[0].gain.value, 0);
  assert.deepEqual(node.connections, [nativeContext.sinks[0]]);
  assert.equal(meter.getStatus().dialect, "native-context");
  meter.dispose();
});
