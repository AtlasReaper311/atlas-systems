"use strict";

import { SCENARIO_BY_ID, SIGNAL_BY_ID, TARGET_BY_ID, clamp } from "./domain.js";
import { linearToDb } from "./audio-engine.js";

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

function targetNormalised(id, value) {
  const definition = TARGET_BY_ID[id];
  return clamp((value - definition.min) / (definition.max - definition.min));
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
    this.visualTime = state.frame.time;
    this.updateAccessibleSummary();
    this.syncLoop();
    if (this.reducedMotion || state.playback !== "PLAYING") this.draw(performance.now());
  }

  updateAccessibleSummary() {
    if (!this.state) return;
    const { frame, scenarioId, selectedMapping, routeFocus } = this.state;
    const pressure = Math.round((frame.normalised.anomaly_score * 0.55 + frame.normalised.error_rate * 0.25 + frame.normalised.queue_depth * 0.2) * 100);
    const route = selectedMapping
      ? ` Selected route ${SIGNAL_BY_ID[selectedMapping.source].label} to ${TARGET_BY_ID[selectedMapping.target].label}${routeFocus ? ", route focus active" : ""}.`
      : " Combined mapped state.";
    this.canvas.setAttribute("aria-label", `Spectral Field for ${SCENARIO_BY_ID[scenarioId].label}; ${frame.health.toLowerCase()} simulated state; structural pressure ${pressure} percent.${route}`);
  }

  syncLoop() {
    const shouldRun = Boolean(this.state && this.state.playback === "PLAYING" && !this.reducedMotion);
    if (shouldRun && !this.animationFrame) {
      this.lastTimestamp = performance.now();
      this.animationFrame = requestAnimationFrame((timestamp) => this.tick(timestamp));
    } else if (!shouldRun && this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  tick(timestamp) {
    this.animationFrame = 0;
    if (!this.state || this.reducedMotion || this.state.playback !== "PLAYING") return;
    const elapsed = Math.min(0.05, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.visualTime += elapsed;
    this.draw(timestamp);
    this.animationFrame = requestAnimationFrame((next) => this.tick(next));
  }

  draw() {
    if (!this.context || !this.state) return;
    const { width, height, ratio } = canvasSize(this.canvas);
    const context = this.context;
    const { frame, outputs, selectedMapping, selectedCalculation, routeFocus, scenarioId } = this.state;
    const values = frame.normalised;
    const scenario = SCENARIO_BY_ID[scenarioId];
    const filter = targetNormalised("filter_cutoff", outputs.filter_cutoff);
    const instability = targetNormalised("instability", outputs.instability);
    const density = targetNormalised("texture_density", outputs.texture_density);
    const pulse = targetNormalised("pulse_rate", outputs.pulse_rate);
    const stereo = targetNormalised("stereo_width", outputs.stereo_width);
    const errorTexture = targetNormalised("error_texture", outputs.error_texture);
    const brightness = targetNormalised("harmonic_brightness", outputs.harmonic_brightness);
    const pressure = clamp(values.anomaly_score * 0.48 + values.error_rate * 0.24 + values.queue_depth * 0.2 + values.cpu_load * 0.08);
    const cacheDisruption = clamp(1 - values.cache_hit_rate);
    const latencyStretch = 1 + values.latency_ms * 0.34;
    const asymmetry = clamp(cacheDisruption * 0.44 + instability * 0.34 + errorTexture * 0.22);
    const coherence = clamp(1 - pressure * 0.64 - instability * 0.22, 0.16, 1);
    const seedPhase = scenario.visualSeed * 0.0071;
    const centerX = width * (0.5 + asymmetry * 0.025 * Math.sin(this.visualTime * 0.17 + seedPhase));
    const centerY = height * (0.5 + pressure * 0.025);
    const baseRadius = Math.min(width, height) * 0.31;
    const radiusX = baseRadius * (0.92 + stereo * 0.34) * (1 - pressure * 0.11);
    const radiusY = baseRadius * (0.8 + filter * 0.22) * latencyStretch;
    const phase = this.visualTime * (0.28 + pulse * 0.72) + seedPhase;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#08080d";
    context.fillRect(0, 0, width, height);

    const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 1.7);
    glow.addColorStop(0, `rgba(116,208,255,${0.035 + brightness * 0.055})`);
    glow.addColorStop(0.48, `rgba(127,136,255,${0.018 + instability * 0.045})`);
    glow.addColorStop(1, "rgba(8,8,13,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    this.drawLattice(context, { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, phase, seedPhase, ratio });
    this.drawTraces(context, { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, instability, density, brightness, phase, ratio, selectedMapping, frame });
    this.drawFracture(context, { centerX, centerY, radiusX, radiusY, pressure, cacheDisruption, errorTexture, phase, ratio, seedPhase });
    if (selectedMapping && selectedCalculation) this.drawSelectedRoute(context, { width, centerY, radiusY, selectedMapping, selectedCalculation, frame, routeFocus, ratio });
  }

  drawLattice(context, state) {
    const { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, phase, seedPhase, ratio } = state;
    context.save();
    context.translate(centerX, centerY);
    context.rotate(asymmetry * 0.11 * Math.sin(phase * 0.37));
    context.translate(-centerX, -centerY);
    const spokes = 12;
    for (let ring = 1; ring <= 4; ring += 1) {
      context.beginPath();
      for (let index = 0; index <= spokes; index += 1) {
        const angle = (index / spokes) * Math.PI * 2;
        const fracture = 1 + Math.sin(angle * 5 + seedPhase + this.visualTime * 0.08) * pressure * 0.065;
        const x = centerX + Math.cos(angle) * radiusX * (ring / 4) * fracture;
        const y = centerY + Math.sin(angle) * radiusY * (ring / 4) * (1 + asymmetry * Math.cos(angle) * 0.09);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.strokeStyle = `rgba(190,226,255,${0.035 + coherence * 0.065 - ring * 0.004})`;
      context.lineWidth = Math.max(1, ratio * 0.52);
      context.stroke();
    }
    context.restore();
  }

  drawTraces(context, state) {
    const { centerX, centerY, radiusX, radiusY, pressure, asymmetry, coherence, instability, density, brightness, phase, ratio, selectedMapping, frame } = state;
    const colours = [[116, 208, 255], [127, 136, 255], [211, 203, 255]];
    const sourceFocus = selectedMapping ? frame.normalised[selectedMapping.source] : 0.5;
    for (let trace = 0; trace < colours.length; trace += 1) {
      const points = 420 + Math.round(density * 180);
      context.beginPath();
      for (let index = 0; index <= points; index += 1) {
        const t = (index / points) * Math.PI * 2;
        const crystal = 1 + Math.cos(t * (6 + trace)) * (0.035 + density * 0.035);
        const interference = Math.sin(t * (11 + trace * 2) + phase * 0.37) * (instability + pressure * 0.28) * 0.075;
        const leftPropagation = (1 - Math.cos(t)) * asymmetry * (trace === 1 ? 0.18 : 0.08);
        const x = centerX
          + Math.cos(t * 2 + phase * (0.16 + trace * 0.04)) * radiusX * (0.76 + trace * 0.07) * (crystal + interference)
          + Math.sin(t * 5 + phase) * radiusX * instability * 0.04
          - leftPropagation * radiusX;
        const y = centerY
          + Math.sin(t * (3 + trace * 0.18) + phase * (0.12 + instability * 0.08)) * radiusY * (0.66 + trace * 0.06) * (crystal - interference)
          + Math.cos(t * 7 - phase * 0.22) * radiusY * instability * 0.07
          + Math.sin(t) * asymmetry * radiusY * 0.08;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      const [r, g, b] = colours[trace];
      const focusedTrace = Math.floor(sourceFocus * colours.length) % colours.length;
      const opacity = selectedMapping ? (trace === focusedTrace ? 0.88 : 0.11) : 0.4 + coherence * 0.26;
      context.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
      context.lineWidth = Math.max(1, ratio * (trace === 0 ? 1.05 : 0.72));
      context.shadowBlur = this.reducedMotion ? 0 : 7 * ratio * (brightness + 0.3);
      context.shadowColor = `rgba(${r},${g},${b},0.28)`;
      context.stroke();
    }
    context.shadowBlur = 0;
  }

  drawFracture(context, state) {
    const { centerX, centerY, radiusX, radiusY, pressure, cacheDisruption, errorTexture, phase, ratio, seedPhase } = state;
    const fracture = clamp(pressure * 0.75 + cacheDisruption * 0.35 + errorTexture * 0.2);
    if (fracture < 0.12) return;
    const count = 3 + Math.round(fracture * 9);
    context.save();
    context.lineWidth = Math.max(1, ratio * 0.55);
    for (let index = 0; index < count; index += 1) {
      const angle = seedPhase + (index / count) * Math.PI * 2 + Math.sin(phase * 0.13 + index) * 0.12;
      const inner = 0.42 + ((index * 37) % 17) / 100;
      const outer = inner + 0.12 + fracture * 0.15;
      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * radiusX * inner, centerY + Math.sin(angle) * radiusY * inner);
      context.lineTo(centerX + Math.cos(angle + fracture * 0.08) * radiusX * outer, centerY + Math.sin(angle - fracture * 0.06) * radiusY * outer);
      context.strokeStyle = `rgba(211,203,255,${0.08 + fracture * 0.18})`;
      context.stroke();
    }
    context.restore();
  }

  drawSelectedRoute(context, state) {
    const { width, centerY, radiusY, selectedMapping, selectedCalculation, frame, routeFocus, ratio } = state;
    const source = frame.normalised[selectedMapping.source];
    const targetY = centerY + (selectedCalculation.transformed - 0.5) * radiusY * 0.38;
    context.shadowBlur = routeFocus ? 14 * ratio : 7 * ratio;
    context.shadowColor = "rgba(245,166,35,0.52)";
    context.strokeStyle = `rgba(245,166,35,${routeFocus ? 0.9 : 0.6})`;
    context.lineWidth = Math.max(1, ratio * (routeFocus ? 1.45 : 0.9));
    context.beginPath();
    context.moveTo(width * 0.035, centerY + (source - 0.5) * radiusY * 0.55);
    context.bezierCurveTo(width * 0.26, centerY, width * 0.72, targetY, width * 0.965, targetY);
    context.stroke();
    context.shadowBlur = 0;
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
