"use strict";

import { SCENARIO_BY_ID, clamp } from "./domain.js";
import { linearToDb } from "./audio-engine.js";
import { draw as drawSpectralField } from "./spectral-field-compose-v4.js";
import { syncLoop, tick, updateAccessibleSummary } from "./spectral-field-runtime.js";
import { rendererShouldAnimate } from "./spectral-field-life-clock.js";

export const HEALTH_VISUAL_PROFILES = Object.freeze({
  STABLE: Object.freeze({ pressureScale: 0.88, asymmetryBias: 0, coherenceScale: 1.04, widthScale: 1, heightScale: 1, fractureScale: 0.75 }),
  PRESSURED: Object.freeze({ pressureScale: 1, asymmetryBias: 0.025, coherenceScale: 0.95, widthScale: 0.96, heightScale: 1.02, fractureScale: 0.95 }),
  DEGRADED: Object.freeze({ pressureScale: 1.08, asymmetryBias: 0.065, coherenceScale: 0.84, widthScale: 0.9, heightScale: 1.05, fractureScale: 1.12 }),
  FAILED: Object.freeze({ pressureScale: 1.16, asymmetryBias: 0.12, coherenceScale: 0.7, widthScale: 0.82, heightScale: 1.08, fractureScale: 1.32 }),
  RECOVERING: Object.freeze({ pressureScale: 0.95, asymmetryBias: 0.035, coherenceScale: 0.92, widthScale: 0.94, heightScale: 1.03, fractureScale: 0.9 }),
});

export function healthVisualProfile(health) {
  return HEALTH_VISUAL_PROFILES[health] ?? HEALTH_VISUAL_PROFILES.STABLE;
}

function canvasSize(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, ratio };
}


export class SpectralFieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.state = null;
    this.animationFrame = 0;
    this.visualTime = 0;
    this.lastTimestamp = performance.now();
    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.motionQuery.matches;
    this.onMotionChange = (event) => {
      this.reducedMotion = event.matches;
      this.syncLoop();
      this.draw(performance.now());
    };
    this.motionQuery.addEventListener?.("change", this.onMotionChange);
    this.resizeObserver = new ResizeObserver(() => this.draw(performance.now()));
    this.resizeObserver.observe(canvas);
  }

  setState(state) {
    this.state = state;
    if (state?.organismLife) this.visualTime = state.organismLife.time;
    if (this.canvas) {
      this.canvas.dataset.organismLifeTime = String(this.visualTime);
      if (state?.playback) this.canvas.dataset.fieldPlayback = state.playback;
    }
    this.updateAccessibleSummary();
    this.syncLoop();
    const animating = rendererShouldAnimate(state, this.reducedMotion);
    if (!animating && state?.fieldVisible !== false) this.draw(performance.now());
  }

  updateAccessibleSummary() {
    updateAccessibleSummary.call(this);
  }

  syncLoop() {
    syncLoop.call(this);
  }

  tick(timestamp) {
    tick.call(this, timestamp);
  }

  draw(timestamp = performance.now()) {
    drawSpectralField.call(this, timestamp);
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.motionQuery.removeEventListener?.("change", this.onMotionChange);
  }
}

export class TimelineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
    this.history = [];
    this.frame = null;
    this.scenario = null;
    this.signalId = "anomaly_score";
  }

  setState({ history, frame, scenarioId, signalId = "anomaly_score" }) {
    this.history = history;
    this.frame = frame;
    this.scenario = SCENARIO_BY_ID[scenarioId];
    this.signalId = signalId;
    this.draw();
  }

  draw() {
    if (!this.context || !this.frame || !this.scenario) return;
    const { width, height, ratio } = canvasSize(this.canvas);
    const context = this.context;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0b0b11";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,0.055)";
    context.lineWidth = 1;
    for (const time of [0, 15, 30, 45, 60]) {
      const x = (time / 60) * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (const boundary of this.scenario.phaseBoundaries.slice(1, -1)) {
      const x = (boundary / 60) * width;
      context.setLineDash([3 * ratio, 5 * ratio]);
      context.strokeStyle = "rgba(255,255,255,0.12)";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.setLineDash([]);
    if (this.history.length > 1) {
      context.strokeStyle = "#f5a623";
      context.lineWidth = Math.max(1, ratio);
      context.beginPath();
      this.history.forEach((sample, index) => {
        const x = (sample.time / 60) * width;
        const y = height - sample.normalised[this.signalId] * height * 0.82 - height * 0.09;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    const playhead = (this.frame.time / 60) * width;
    context.strokeStyle = "rgba(232,232,224,0.82)";
    context.lineWidth = Math.max(1, ratio * 0.7);
    context.beginPath();
    context.moveTo(playhead, 0);
    context.lineTo(playhead, height);
    context.stroke();
  }

  destroy() {
    this.resizeObserver.disconnect();
  }
}

export class AudioAnalyserRenderer {
  constructor(canvas, meterElements) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.meterElements = meterElements;
    this.analyser = null;
    this.active = false;
    this.muted = false;
    this.frame = 0;
    this.lastDraw = 0;
    this.heldPeak = -60;
    this.buffer = null;
    this.frequency = null;
    this.resizeObserver = new ResizeObserver(() => this.draw(performance.now()));
    this.resizeObserver.observe(canvas);
  }

  setState({ analyser, active, muted }) {
    if (this.analyser !== analyser) {
      this.analyser = analyser;
      this.buffer = analyser ? new Float32Array(analyser.fftSize) : null;
      this.frequency = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    }
    this.active = active;
    this.muted = muted;
    if (active && analyser) this.start();
    else {
      this.stop();
      this.draw(performance.now());
      this.updateMeter(-Infinity, -Infinity);
    }
  }

  start() {
    if (this.frame) return;
    this.frame = requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  tick(timestamp) {
    this.frame = 0;
    if (!this.active || !this.analyser) return;
    if (timestamp - this.lastDraw >= 50) {
      this.lastDraw = timestamp;
      this.draw(timestamp);
    }
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  draw() {
    const { width, height, ratio } = canvasSize(this.canvas);
    const context = this.context;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#08080d";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,0.055)";
    for (let line = 1; line < 4; line += 1) {
      context.beginPath();
      context.moveTo(0, (height / 4) * line);
      context.lineTo(width, (height / 4) * line);
      context.stroke();
    }
    if (!this.active || !this.analyser || !this.buffer || !this.frequency) {
      context.strokeStyle = "rgba(255,255,255,0.18)";
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
      return;
    }
    this.analyser.getFloatTimeDomainData(this.buffer);
    this.analyser.getByteFrequencyData(this.frequency);
    let peak = 0;
    let squareSum = 0;
    context.beginPath();
    const step = width / Math.max(1, this.buffer.length - 1);
    this.buffer.forEach((sample, index) => {
      peak = Math.max(peak, Math.abs(sample));
      squareSum += sample * sample;
      const x = index * step;
      const y = height / 2 + sample * height * 2.3;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = this.muted ? "rgba(170,169,160,0.42)" : "#74d0ff";
    context.lineWidth = Math.max(1, ratio);
    context.stroke();

    const bars = 44;
    const barWidth = width / bars;
    for (let index = 0; index < bars; index += 1) {
      const frequencyIndex = Math.floor((index / bars) * Math.min(this.frequency.length, 260));
      const magnitude = (this.frequency[frequencyIndex] / 255) ** 0.48;
      context.fillStyle = this.muted ? "rgba(170,169,160,0.06)" : `rgba(127,136,255,${0.025 + magnitude * 0.11})`;
      context.fillRect(index * barWidth, height - magnitude * height * 0.42, Math.max(1, barWidth - ratio), magnitude * height * 0.42);
    }

    const rms = Math.sqrt(squareSum / this.buffer.length);
    const peakDb = linearToDb(peak);
    const rmsDb = linearToDb(rms);
    this.heldPeak = Math.max(peakDb, this.heldPeak - 0.8);
    this.updateMeter(this.muted ? -Infinity : this.heldPeak, this.muted ? -Infinity : rmsDb);
  }

  updateMeter(peakDb, rmsDb) {
    const { peak, rms, bar, marker } = this.meterElements;
    if (peak) peak.textContent = Number.isFinite(peakDb) ? `${peakDb.toFixed(1)} dBFS` : "−∞ dBFS";
    if (rms) rms.textContent = Number.isFinite(rmsDb) ? `${rmsDb.toFixed(1)} dBFS` : "−∞ dBFS";
    const normalisedRms = Number.isFinite(rmsDb) ? clamp((rmsDb + 60) / 60) : 0;
    const normalisedPeak = Number.isFinite(peakDb) ? clamp((peakDb + 60) / 60) : 0;
    if (bar) bar.style.width = `${normalisedRms * 100}%`;
    if (marker) marker.style.left = `${normalisedPeak * 100}%`;
  }

  destroy() {
    this.stop();
    this.resizeObserver.disconnect();
  }
}
