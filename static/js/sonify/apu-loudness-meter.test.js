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

test("the controller loads a sink-only processor and keeps the source branch independent", async (context) => {
  const previousAudioWorkletNode = globalThis.AudioWorkletNode;
  let node = null;
  const moduleUrls = [];
  const statusEvents = [];
  const metricEvents = [];
  const connections = [];
  const disconnections = [];

  class FakeAudioWorkletNode {
    constructor(rawContext, name, options) {
      this.rawContext = rawContext;
      this.name = name;
      this.options = options;
      this.messages = [];
      this.disposed = false;
      this.port = {
        onmessage: null,
        postMessage: (message) => this.messages.push(message),
        close: () => { this.portClosed = true; },
      };
      node = this;
    }

    disconnect() {
      this.disposed = true;
    }
  }

  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  context.after(() => {
    if (previousAudioWorkletNode === undefined) delete globalThis.AudioWorkletNode;
    else globalThis.AudioWorkletNode = previousAudioWorkletNode;
  });

  const rawContext = {
    sampleRate: 48000,
    audioWorklet: {
      addModule: async (url) => moduleUrls.push(url),
    },
  };
  const source = {
    connect: (destination) => connections.push(destination),
    disconnect: (destination) => disconnections.push(destination),
  };

  const meter = await createApuLoudnessMeter({
    context: { rawContext },
    source,
    onStatus: (event) => statusEvents.push(event),
    onMetrics: (metrics) => metricEvents.push(metrics),
  });

  assert.deepEqual(moduleUrls, [APU_LOUDNESS_WORKLET_URL]);
  assert.equal(node.name, APU_LOUDNESS_PROCESSOR_NAME);
  assert.equal(node.options.numberOfOutputs, 0);
  assert.equal(node.options.channelCount, 2);
  assert.deepEqual(connections, [node]);
  assert.equal(meter.getStatus().status, "loading");

  node.port.onmessage({ data: { type: "ready", buildId: "dsp", sampleRate: 48000 } });
  assert.equal(meter.getStatus().status, "running");
  assert.equal(meter.getStatus().processorReady, true);

  node.port.onmessage({ data: { type: "metrics", metrics: { integratedLufs: -18, ready: true } } });
  assert.equal(meter.getMetrics().integratedLufs, -18);
  assert.equal(metricEvents.length, 1);
  assert.equal(statusEvents.at(-1).status, "running");

  assert.equal(meter.reset(), true);
  assert.deepEqual(node.messages, [{ type: "reset" }]);

  meter.dispose();
  assert.deepEqual(disconnections, [node]);
  assert.equal(node.portClosed, true);
  assert.equal(node.disposed, true);
  assert.equal(meter.getStatus().disposed, true);
});
