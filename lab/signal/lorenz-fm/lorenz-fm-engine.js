import { LorenzAttractor, clamp, mapLorenzState } from "./lorenz-attractor.js";

const CONTROL_INTERVAL_MS = 25;
const MAX_CATCH_UP_SECONDS = 0.12;
const DEFAULT_VOLUME = 0.08;

function audioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

export class LorenzFmEngine {
  constructor(options = {}) {
    this.audioContext = options.audioContext ?? null;
    this.ownsContext = !options.audioContext;
    this.attractor = options.attractor ?? new LorenzAttractor();
    this.volume = clamp(Number(options.volume ?? DEFAULT_VOLUME), 0, 0.16);
    this.rate = clamp(Number(options.rate ?? 1), 0.25, 2);
    this.fmDepth = clamp(Number(options.fmDepth ?? 82), 0, 180);
    this.running = false;
    this.destroyed = false;
    this.timer = null;
    this.lastControlTime = 0;
    this.accumulator = 0;
    this.nodes = null;
    this.mapped = mapLorenzState(this.attractor.state, { fmDepth: this.fmDepth });
  }

  async ensureContext() {
    if (this.destroyed) throw new Error("The Lorenz FM engine has been destroyed.");
    if (!this.audioContext) {
      const AudioContextClass = audioContextConstructor();
      if (!AudioContextClass) throw new Error("Web Audio is not supported by this browser.");
      this.audioContext = new AudioContextClass({ latencyHint: "interactive" });
    }
    if (this.audioContext.state === "suspended") await this.audioContext.resume();
    return this.audioContext;
  }

  createGraph() {
    if (this.nodes) return this.nodes;
    const context = this.audioContext;
    if (!context) throw new Error("Audio context is not available.");

    const carrier = new OscillatorNode(context, { type: "sine", frequency: this.mapped.carrier });
    const modulator = new OscillatorNode(context, { type: "triangle", frequency: this.mapped.modulator });
    const modulation = new GainNode(context, { gain: this.fmDepth });
    const filter = new BiquadFilterNode(context, {
      type: "lowpass",
      frequency: this.mapped.cutoff,
      Q: 3.2,
    });
    const panner = new StereoPannerNode(context, { pan: this.mapped.pan });
    const limiter = new DynamicsCompressorNode(context, {
      threshold: -10,
      knee: 0,
      ratio: 20,
      attack: 0.003,
      release: 0.2,
    });
    const master = new GainNode(context, { gain: 0 });

    modulator.connect(modulation).connect(carrier.frequency);
    carrier.connect(filter).connect(panner).connect(limiter).connect(master).connect(context.destination);

    this.nodes = { carrier, modulator, modulation, filter, panner, limiter, master };
    return this.nodes;
  }

  async start() {
    if (this.running) return this.snapshot();
    await this.ensureContext();
    const nodes = this.createGraph();
    const now = this.audioContext.currentTime;

    nodes.carrier.start(now);
    nodes.modulator.start(now);
    nodes.master.gain.cancelScheduledValues(now);
    nodes.master.gain.setValueAtTime(0, now);
    nodes.master.gain.linearRampToValueAtTime(this.volume, now + 0.08);

    this.running = true;
    this.lastControlTime = performance.now();
    this.accumulator = 0;
    this.timer = globalThis.setInterval(() => this.controlTick(), CONTROL_INTERVAL_MS);
    return this.snapshot();
  }

  controlTick(nowMilliseconds = performance.now()) {
    if (!this.running || !this.audioContext || !this.nodes) return;
    const elapsedSeconds = clamp((nowMilliseconds - this.lastControlTime) / 1000, 0, MAX_CATCH_UP_SECONDS);
    this.lastControlTime = nowMilliseconds;
    this.accumulator += elapsedSeconds * this.rate;

    const stepSize = this.attractor.parameters.timeStep;
    const steps = Math.min(128, Math.floor(this.accumulator / stepSize));
    if (steps > 0) {
      this.attractor.step(steps);
      this.accumulator -= steps * stepSize;
    }

    this.mapped = mapLorenzState(this.attractor.state, { fmDepth: this.fmDepth });
    const now = this.audioContext.currentTime;
    const smoothing = 0.045;
    this.nodes.carrier.frequency.setTargetAtTime(this.mapped.carrier, now, smoothing);
    this.nodes.modulator.frequency.setTargetAtTime(this.mapped.modulator, now, smoothing);
    this.nodes.modulation.gain.setTargetAtTime(this.mapped.fmDepth, now, smoothing);
    this.nodes.filter.frequency.setTargetAtTime(this.mapped.cutoff, now, smoothing);
    this.nodes.panner.pan.setTargetAtTime(this.mapped.pan, now, smoothing);
  }

  setVolume(value) {
    this.volume = clamp(Number(value), 0, 0.16);
    if (this.audioContext && this.nodes) {
      this.nodes.master.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.04);
    }
  }

  setRate(value) {
    this.rate = clamp(Number(value), 0.25, 2);
  }

  setFmDepth(value) {
    this.fmDepth = clamp(Number(value), 0, 180);
    this.mapped = mapLorenzState(this.attractor.state, { fmDepth: this.fmDepth });
  }

  reset() {
    this.attractor.reset();
    this.accumulator = 0;
    this.mapped = mapLorenzState(this.attractor.state, { fmDepth: this.fmDepth });
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      running: this.running,
      state: Object.freeze([...this.attractor.state]),
      elapsed: this.attractor.elapsed,
      mapped: Object.freeze({ ...this.mapped }),
      rate: this.rate,
      volume: this.volume,
    });
  }

  async stop() {
    if (this.timer !== null) {
      globalThis.clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;

    if (!this.nodes || !this.audioContext) return;
    const nodes = this.nodes;
    const now = this.audioContext.currentTime;
    nodes.master.gain.cancelScheduledValues(now);
    nodes.master.gain.setTargetAtTime(0, now, 0.015);

    await new Promise((resolve) => globalThis.setTimeout(resolve, 70));
    for (const oscillator of [nodes.carrier, nodes.modulator]) {
      try {
        oscillator.stop();
      } catch {
        // The oscillator was already stopped.
      }
    }
    for (const node of Object.values(nodes)) node.disconnect();
    this.nodes = null;
  }

  async destroy() {
    if (this.destroyed) return;
    await this.stop();
    if (this.ownsContext && this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.destroyed = true;
  }
}
