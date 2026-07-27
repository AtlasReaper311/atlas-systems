import assert from "node:assert/strict";
import test from "node:test";

function makeParam(value = 0) {
  const events = [];
  return {
    value,
    events,
    setValueAtTime(next, at) { this.value = next; events.push(["set", next, at]); },
    linearRampToValueAtTime(next, at) { this.value = next; events.push(["linear", next, at]); },
    exponentialRampToValueAtTime(next, at) { this.value = next; events.push(["exponential", next, at]); },
    cancelScheduledValues(at) { events.push(["cancel", at]); },
    cancelAndHoldAtTime(at) { events.push(["hold", at]); },
  };
}

function installToneRecorder() {
  const graph = [];
  const nativeWaves = [];
  const rawSources = [];
  const toneNodes = [];
  let nextId = 1;

  function destinationOf(target) {
    return target?.input ?? target;
  }

  class NodeBase {
    constructor(kind) {
      this.kind = kind;
      this.id = `${kind}-${nextId++}`;
      this.input = this;
      this.disposed = false;
      toneNodes.push(this);
    }
    connect(target) { graph.push([this, destinationOf(target)]); return this; }
    chain(...targets) {
      let source = this;
      for (const target of targets) { source.connect(target); source = target; }
      return targets.at(-1) ?? this;
    }
    disconnect() { throw new Error(`unexpected disconnect on ${this.id}`); }
    dispose() {
      if (this.disposed) throw new Error(`double dispose on ${this.id}`);
      this.disposed = true;
    }
    toDestination() { graph.push([this, destination]); return this; }
  }

  class Gain extends NodeBase { constructor(value = 1) { super("gain"); this.gain = makeParam(value); } }
  class Volume extends NodeBase { constructor(value = 0) { super("volume"); this.volume = makeParam(value); } }
  class Filter extends NodeBase {
    constructor(options = {}) {
      super(`filter-${options.type ?? "lowpass"}`);
      this.type = options.type ?? "lowpass";
      this.frequency = makeParam(options.frequency ?? 1000);
      this.Q = makeParam(options.Q ?? 0.5);
      this.gain = makeParam(options.gain ?? 0);
    }
  }
  class Compressor extends NodeBase {
    constructor(options = {}) {
      super("compressor");
      this.threshold = makeParam(options.threshold ?? -18);
      this.ratio = makeParam(options.ratio ?? 1.7);
      this.attack = makeParam(options.attack ?? 0.02);
      this.release = makeParam(options.release ?? 0.2);
    }
  }
  class Limiter extends NodeBase { constructor() { super("limiter"); } }
  class WaveShaper extends NodeBase { constructor(curve = null) { super("waveshaper"); this.curve = curve; this.oversample = "none"; } }
  class Panner extends NodeBase { constructor(value = 0) { super("panner"); this.pan = makeParam(value); } }
  class StereoWidener extends NodeBase { constructor(value = 0.5) { super("widener"); this.width = makeParam(value); } }
  class LFO extends NodeBase {
    constructor(options = {}) { super("lfo"); this.frequency = makeParam(options.frequency ?? 0.22); this.started = false; }
    start() { this.started = true; return this; }
    stop() { this.started = false; return this; }
  }
  class Analyser extends NodeBase {
    constructor(kind, size) { super(`analyser-${kind}`); this.size = size; }
    getValue() { return new Float32Array(this.size); }
  }
  class BitCrusher extends NodeBase { constructor(bits = 12) { super("bitcrusher"); this.bits = { value: bits }; this.wet = makeParam(0); } }
  class FeedbackDelay extends NodeBase { constructor() { super("delay"); this.wet = makeParam(1); } }
  class Freeverb extends NodeBase { constructor() { super("reverb"); this.wet = makeParam(1); } }
  class Oscillator extends NodeBase {
    constructor(options = {}) { super("tone-oscillator"); this.frequency = makeParam(options.frequency ?? 55); }
    start() { return this; }
    stop() { return this; }
  }
  class PolySynth extends NodeBase {
    constructor() { super("polysynth"); this.triggers = []; }
    triggerAttackRelease(...args) { this.triggers.push(args); }
    releaseAll() {}
  }
  class Synth extends NodeBase { constructor() { super("synth"); } }

  const rawContext = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createPeriodicWave(real, imag) { const wave = { real, imag, id: `wave-${nativeWaves.length}` }; nativeWaves.push(wave); return wave; },
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate, getChannelData() { return data; } };
    },
    createGain() {
      const node = {
        kind: "raw-gain", gain: makeParam(1), connections: [], disposed: false,
        connect(target) { this.connections.push(target); graph.push([this, destinationOf(target)]); return target; },
        disconnect() { this.disposed = true; },
      };
      return node;
    },
    createBiquadFilter() {
      return {
        kind: "raw-filter", type: "lowpass", frequency: makeParam(1000), Q: makeParam(0.5), gain: makeParam(0),
        connect(target) { graph.push([this, destinationOf(target)]); return this; }, disconnect() {},
      };
    },
    createBufferSource() {
      const source = {
        kind: "raw-buffer", buffer: null, loop: false, playbackRate: makeParam(1), onended: null,
        connect(target) { graph.push([this, destinationOf(target)]); return this; }, disconnect() {},
        start() {}, stop() {},
      };
      rawSources.push(source);
      return source;
    },
    createOscillator() {
      const source = {
        kind: "raw-oscillator", frequency: makeParam(440), detune: makeParam(0), wave: null, onended: null,
        setPeriodicWave(wave) { this.wave = wave; },
        connect(target) { graph.push([this, destinationOf(target)]); return this; }, disconnect() {},
        start(at) { this.startedAt = at; }, stop(at) { this.stoppedAt = at; },
      };
      rawSources.push(source);
      return source;
    },
  };

  const scheduled = [];
  const transport = {
    state: "stopped",
    bpm: makeParam(100),
    scheduleRepeat(callback, subdivision) { scheduled.push({ callback, subdivision }); return 1; },
    scheduleOnce() { throw new Error("Pass C v3 must not schedule audio-context times on Tone Transport"); },
    clear() {},
    start() { this.state = "started"; },
    stop() { this.state = "stopped"; },
  };
  const destination = { kind: "destination" };

  globalThis.Tone = {
    Gain, Volume, Filter, Compressor, Limiter, WaveShaper, Panner, StereoWidener,
    LFO, Analyser, BitCrusher, FeedbackDelay, Freeverb, Oscillator, PolySynth, Synth,
    connect(source, target) { source.connect(destinationOf(target)); },
    getTransport() { return transport; },
    getContext() { return { rawContext, state: "running" }; },
    now() { return rawContext.currentTime; },
    start() { return Promise.resolve(); },
    Time(value) {
      const seconds = { "32n": 0.075, "16n": 0.15, "8n": 0.3, "4n": 0.6, "2n": 1.2 }[value] ?? Number(value) ?? 0.15;
      return { toSeconds() { return seconds; } };
    },
    Draw: { schedule(callback) { callback(); } },
  };
  return { graph, nativeWaves, rawSources, toneNodes, transport, scheduled, rawContext };
}

const healthyFrame = Object.freeze({ scoreState: "healthy", scoreLabel: "Healthy", voices: [] });

let importCounter = 0;
async function engineModule() {
  importCounter += 1;
  return import(`./apu-track-engine-v3.js?test=${importCounter}`);
}

test("engine imports with Pass C v3 exports", async () => {
  installToneRecorder();
  const mod = await engineModule();
  assert.equal(typeof mod.createApuTrackEngine, "function");
  assert.match(mod.APU_TRACK_PASS_C_V3_BUILD_ID, /pass-c-v3$/);
});

test("factory exposes complete API and v3 identity", async () => {
  installToneRecorder();
  const { createApuTrackEngine } = await engineModule();
  const engine = createApuTrackEngine();
  for (const method of [
    "start", "pause", "applyFrame", "setVolume", "queueDeployment", "queueIncident",
    "getWaveform", "getSpectrum", "getScene", "getArrangement", "getPerformancePlan",
    "setReplayIncident", "getReplayPlan", "getReplayMovementAtBar", "getDiagnostics", "dispose",
  ]) assert.equal(typeof engine[method], "function", method);
  assert.match(engine.passCV3BuildId, /pass-c-v3$/);
});

test("graph starts with public PeriodicWave voices and no Transport scheduleOnce", async () => {
  const recorder = installToneRecorder();
  const { createApuTrackEngine } = await engineModule();
  const engine = createApuTrackEngine();
  engine.applyFrame(healthyFrame);
  await engine.start();
  assert.equal(recorder.scheduled.length, 1);
  recorder.scheduled[0].callback(1);
  assert.ok(recorder.nativeWaves.length >= 1);
  assert.ok(recorder.rawSources.some((source) => source.kind === "raw-oscillator" && source.wave));
  const diagnostics = engine.getDiagnostics();
  assert.deepEqual(diagnostics.chipVoiceKinds, {
    primary: "pulse-square", secondary: "pulse-hollow", bass: "triangle-4bit", padSub: "pulse-square",
  });
});

test("replay drives score and advances at both bar boundaries", async () => {
  const recorder = installToneRecorder();
  const { createApuTrackEngine } = await engineModule();
  const engine = createApuTrackEngine();
  engine.applyFrame(healthyFrame);
  engine.setReplayIncident({ id: "inc-critical", sourceLabel: "fixture", stateSpans: [{ state: "critical", durationMs: 24000 }] });
  await engine.start();
  const tick = recorder.scheduled[0].callback;
  tick(1);
  assert.equal(engine.getDiagnostics().state, "unknown");
  assert.equal(engine.getDiagnostics().replayBar, 1);
  for (let index = 1; index <= 16; index += 1) tick(1 + index * 0.15);
  assert.equal(engine.getDiagnostics().replayBar, 2);
  assert.equal(engine.getDiagnostics().replayCurrentMovement, "boot");
});

test("queued cues and ornaments use absolute audio time without scheduleOnce", async () => {
  const recorder = installToneRecorder();
  const { createApuTrackEngine } = await engineModule();
  const engine = createApuTrackEngine();
  engine.applyFrame(healthyFrame);
  engine.queueDeployment({ identity: "deploy-1" });
  engine.queueIncident(2);
  await engine.start();
  assert.doesNotThrow(() => recorder.scheduled[0].callback(2));
  assert.ok(recorder.rawSources.some((source) => Number.isFinite(source.startedAt)));
});

test("dispose has one owner per node and remains idempotent", async () => {
  installToneRecorder();
  const { createApuTrackEngine } = await engineModule();
  const engine = createApuTrackEngine();
  engine.applyFrame(healthyFrame);
  await engine.start();
  assert.doesNotThrow(() => engine.dispose());
  assert.doesNotThrow(() => engine.dispose());
  await assert.rejects(() => engine.start(), /disposed/);
});
