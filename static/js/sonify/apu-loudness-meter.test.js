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

function installFakeAudioGlobals(context) {
  const previousAudioWorkletNode = globalThis.AudioWorkletNode;
  const previousBaseAudioContext = globalThis.BaseAudioContext;
  globalThis.BaseAudioContext = context.FakeBaseAudioContext;
  globalThis.AudioWorkletNode = context.FakeAudioWorkletNode;
  context.after(() => {
    if (previousAudioWorkletNode === undefined) delete globalThis.AudioWorkletNode;
    else globalThis.AudioWorkletNode = previousAudioWorkletNode;
    if (previousBaseAudioContext === undefined) delete globalThis.BaseAudioContext;
    else globalThis.BaseAudioContext = previousBaseAudioContext;
  });
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

test("Tone output crosses into the native worklet through an isolated media stream", async (context) => {
  let node = null;
  const moduleUrls = [];
  const createdMediaSources = [];
  const sourceConnections = [];
  const sourceDisconnections = [];
  const statusEvents = [];
  const metricEvents = [];
  const stoppedTracks = [];

  class FakeBaseAudioContext {
    constructor() {
      Object.assign(this, fakeSilentContext(48000));
      this.audioWorklet = {
        addModule: async (url) => moduleUrls.push(url),
      };
    }

    createMediaStreamSource(stream) {
      const mediaSource = fakeConnectableNode("native-media-source");
      mediaSource.stream = stream;
      createdMediaSources.push(mediaSource);
      return mediaSource;
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

  context.FakeBaseAudioContext = FakeBaseAudioContext;
  context.FakeAudioWorkletNode = FakeAudioWorkletNode;
  installFakeAudioGlobals(context);

  const nativeContext = new FakeBaseAudioContext();
  const stream = {
    getTracks() {
      return [{ stop: () => stoppedTracks.push("stopped") }];
    },
  };
  const capture = fakeConnectableNode("tone-media-destination");
  capture.stream = stream;
  const toneContext = {
    rawContext: { _nativeAudioContext: nativeContext },
    createMediaStreamDestination() {
      return capture;
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
    maxBlockHistory: 1234,
    onStatus: (event) => statusEvents.push(event),
    onMetrics: (metrics) => metricEvents.push(metrics),
  });

  assert.deepEqual(moduleUrls, [APU_LOUDNESS_WORKLET_URL]);
  assert.equal(node.name, APU_LOUDNESS_PROCESSOR_NAME);
  assert.equal(node.options.numberOfInputs, 1);
  assert.equal(node.options.numberOfOutputs, 1);
  assert.equal(node.options.processorOptions.maxBlockHistory, 1234);
  assert.deepEqual(sourceConnections, [capture]);
  assert.equal(createdMediaSources.length, 1);
  assert.equal(createdMediaSources[0].stream, stream);
  assert.deepEqual(createdMediaSources[0].connections, [node]);

  assert.equal(nativeContext.sinks.length, 1);
  const sink = nativeContext.sinks[0];
  assert.equal(sink.gain.value, 0);
  assert.deepEqual(sink.connections, [nativeContext.destination]);
  assert.deepEqual(node.connections, [sink]);
  assert.equal(meter.getStatus().dialect, "tone-media-stream-bridge");

  node.port.onmessage({ data: { type: "ready", buildId: "dsp", sampleRate: 48000 } });
  assert.equal(meter.getStatus().status, "running");
  assert.equal(meter.getStatus().processorReady, true);

  node.port.onmessage({ data: { type: "metrics", metrics: { integratedLufs: -18, ready: true } } });
  assert.equal(meter.getMetrics().integratedLufs, -18);
  assert.equal(metricEvents.length, 1);
  assert.equal(statusEvents.at(-1).dialect, "tone-media-stream-bridge");

  meter.dispose();
  assert.deepEqual(sourceDisconnections, [capture]);
  assert.deepEqual(createdMediaSources[0].disconnections, [node, null]);
  assert.deepEqual(capture.disconnections, [null]);
  assert.deepEqual(stoppedTracks, ["stopped"]);
  assert.deepEqual(node.disconnections, [sink, null]);
  assert.deepEqual(sink.disconnections, [null]);
  assert.equal(node.portClosed, true);
  assert.equal(node.disposed, true);
});

test("a native source retains the direct worklet path", async (context) => {
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

  context.FakeBaseAudioContext = FakeBaseAudioContext;
  context.FakeAudioWorkletNode = FakeAudioWorkletNode;
  installFakeAudioGlobals(context);

  const nativeContext = new FakeBaseAudioContext();
  const source = {
    connect(destination) {
      sourceConnections.push(destination);
    },
    disconnect() {},
  };

  const meter = await createApuLoudnessMeter({ context: nativeContext, source, maxBlockHistory: 4321 });
  assert.deepEqual(moduleUrls, [APU_LOUDNESS_WORKLET_URL]);
  assert.deepEqual(sourceConnections, [node]);
  assert.equal(node.options.processorOptions.maxBlockHistory, 4321);
  assert.equal(nativeContext.sinks.length, 1);
  assert.equal(nativeContext.sinks[0].gain.value, 0);
  assert.deepEqual(node.connections, [nativeContext.sinks[0]]);
  assert.equal(meter.getStatus().dialect, "native-context");
  meter.dispose();
});
