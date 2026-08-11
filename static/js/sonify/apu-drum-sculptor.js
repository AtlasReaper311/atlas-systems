/**
 * Atlas APU drum sculptor.
 *
 * Prepares a tamed, layered replacement for the current v3 Tone.js
 * percussion kit and the superseded raw-LFSR experiment. Snare, hat,
 * open-hat, and accent voices keep the engine's existing
 * `triggerAttackRelease(duration, time, velocity)` contract. The kick also
 * accepts Tone.MembraneSynth's four-argument
 * `triggerAttackRelease(note, duration, time, velocity)` form, so Pass C
 * can integrate the kit without changing rhythmic event semantics.
 *
 * Design fixes over the current and superseded percussion paths:
 *
 *   1. Attack envelopes use linearRampToValueAtTime with a 1-6 ms floor
 *      instead of abrupt or near-instant gain steps, reducing front-edge
 *      clicks.
 *   2. Snare layers LFSR noise with a triangle/pulse body thump so it
 *      reads as a hit instead of a static burst.
 *   3. Closed hats use short-period LFSR at 1.0x playback with the
 *      highpass at 8 kHz plus per-hit lowpass cap at 12 kHz, softening
 *      the metallic jab.
 *   4. Every hit deterministically offsets the buffer start position by
 *      a stable hash of the voice and its monotonic hit index, so
 *      consecutive hits never start on the same LFSR sample slice.
 *   5. Velocity input is curved (soft knee, gamma 1.6) so mid-range
 *      values stop punching harder than the composer wrote.
 *   6. Two modes: `polished` (default) applies all the above; `authentic`
 *      turns most of it off so the chip's raw character is available if
 *      asked for explicitly.
 *   7. Per-state kits: warning, critical, and unknown each get their own
 *      envelope, filter, and layer-balance profile.
 *
 * No new Web Audio primitives are introduced. The sculptor composes
 * OscillatorNode, BufferSourceNode, GainNode, and BiquadFilterNode using
 * the raw AudioContext underneath Tone.js, matching the raw-context pattern established by the APU foundation.
 */

import { createLfsrNoiseBuffer } from "./apu-chip-oscillators.js";

export const APU_DRUM_SCULPTOR_BUILD_ID = "20260727-apu-drum-sculptor-v1";
export const APU_DRUM_SCULPTOR_MODES = Object.freeze(["polished", "authentic"]);
export const APU_DRUM_SCULPTOR_DEFAULT_MODE = "polished";

const STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);

/**
 * Per-state kit tuning. `bodyMix` is the wet amount of the tonal body
 * layer on the snare (higher = more thump, less noise). `hatCutoff` is
 * the highpass corner for closed hats. `accentQ` is the bandpass Q on
 * noise accents (lower = smoother, higher = more resonant).
 *
 * All numbers deliberately chosen to sit within safe Web Audio ranges
 * regardless of state. Nothing here can produce NaN or unbounded gain.
 */
export const APU_DRUM_SCULPTOR_KITS = Object.freeze({
  healthy: Object.freeze({
    kick: Object.freeze({ pitchHz: 55, thump: 0.72, decay: 0.16 }),
    snare: Object.freeze({ bodyMix: 0.42, bodyPitchHz: 220, noiseDecay: 0.09 }),
    hat: Object.freeze({ cutoffHz: 8200, softCapHz: 11500, decay: 0.018 }),
    openHat: Object.freeze({ cutoffHz: 6800, softCapHz: 10500, decay: 0.075 }),
    accent: Object.freeze({ centreHz: 1300, Q: 0.9, decay: 0.055 }),
  }),
  warning: Object.freeze({
    kick: Object.freeze({ pitchHz: 58, thump: 0.68, decay: 0.14 }),
    snare: Object.freeze({ bodyMix: 0.48, bodyPitchHz: 240, noiseDecay: 0.08 }),
    hat: Object.freeze({ cutoffHz: 8800, softCapHz: 12000, decay: 0.014 }),
    openHat: Object.freeze({ cutoffHz: 7200, softCapHz: 11000, decay: 0.062 }),
    accent: Object.freeze({ centreHz: 1650, Q: 1.05, decay: 0.048 }),
  }),
  critical: Object.freeze({
    kick: Object.freeze({ pitchHz: 48, thump: 0.85, decay: 0.20 }),
    snare: Object.freeze({ bodyMix: 0.58, bodyPitchHz: 205, noiseDecay: 0.075 }),
    hat: Object.freeze({ cutoffHz: 7400, softCapHz: 10500, decay: 0.012 }),
    openHat: Object.freeze({ cutoffHz: 6400, softCapHz: 9800, decay: 0.055 }),
    accent: Object.freeze({ centreHz: 1150, Q: 1.15, decay: 0.045 }),
  }),
  unknown: Object.freeze({
    kick: Object.freeze({ pitchHz: 62, thump: 0.55, decay: 0.22 }),
    snare: Object.freeze({ bodyMix: 0.35, bodyPitchHz: 260, noiseDecay: 0.14 }),
    hat: Object.freeze({ cutoffHz: 7600, softCapHz: 10800, decay: 0.028 }),
    openHat: Object.freeze({ cutoffHz: 6500, softCapHz: 10200, decay: 0.11 }),
    accent: Object.freeze({ centreHz: 1000, Q: 0.75, decay: 0.09 }),
  }),
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const isState = (state) => STATE_KEYS.includes(state);

export function curveVelocity(raw) {
  const v = clamp(raw, 0, 1);
  if (v <= 0) return 0;
  if (v < 0.15) return v * 0.35;
  const above = (v - 0.15) / 0.85;
  const curved = Math.pow(above, 1.6);
  return 0.15 * 0.35 + curved * (1 - 0.15 * 0.35);
}

export function fnv1a(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

export function kitForState(state) {
  return APU_DRUM_SCULPTOR_KITS[state] ?? APU_DRUM_SCULPTOR_KITS.unknown;
}

function dbToGain(db) {
  return Math.pow(10, (Number(db) || 0) / 20);
}

function computeEnvelope({ startAt, hold, attack, release, velocity, volumeDb, mode }) {
  const holdSeconds = Math.max(0.005, Number(hold) || 0.005);
  const attackFloor = mode === "polished" ? 0.004 : 0.001;
  const attackSeconds = Math.max(attackFloor, Math.min(attack, holdSeconds * 0.6));
  const releaseSeconds = Math.max(0.006, release);
  const rampStart = startAt;
  const rampEnd = startAt + attackSeconds;
  const holdEnd = startAt + holdSeconds;
  const releaseEnd = holdEnd + releaseSeconds;
  const rawPeak = clamp(curveVelocity(velocity) * dbToGain(volumeDb), 0, 1);
  const peak = rawPeak > 0 ? Math.max(0.0001, rawPeak) : 0;
  return { rampStart, rampEnd, holdEnd, releaseEnd, peak };
}

function durationSeconds(value, bpm, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = /^(1|2|4|8|16|32)n$/.exec(String(value ?? ""));
  if (!match) return fallback;
  const safeBpm = clamp(bpm, 20, 300);
  const denominator = Number(match[1]);
  return (60 / safeBpm) * (4 / denominator);
}

function kickTriggerArguments(args, bpm) {
  if (args.length >= 4) {
    return Object.freeze({
      hold: durationSeconds(args[1], bpm, 0.14),
      time: args[2],
      velocity: args[3],
    });
  }
  return Object.freeze({
    hold: durationSeconds(args[0], bpm, 0.14),
    time: args[1],
    velocity: args[2] ?? 1,
  });
}

export function createKickVoice(ctx, outputInput, { kit, mode, bpm = 100 }) {
  const activeSources = new Set();
  return Object.freeze({
    voice: "kick",
    triggerAttackRelease(...args) {
      const { hold, time, velocity } = kickTriggerArguments(args, bpm);
      const startAt = Number.isFinite(time) ? Math.max(ctx.currentTime, time) : ctx.currentTime;
      const env = computeEnvelope({ startAt, hold, attack: mode === "polished" ? 0.006 : 0.002, release: kit.kick.decay, velocity, volumeDb: -11, mode });
      if (env.peak <= 0) return;

      const oscillator = ctx.createOscillator();
      const mainGain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(kit.kick.pitchHz * 4, env.rampStart);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, kit.kick.pitchHz), env.rampStart + 0.045);
      mainGain.gain.setValueAtTime(0, env.rampStart);
      mainGain.gain.linearRampToValueAtTime(env.peak, env.rampEnd);
      mainGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, env.peak * 0.001), env.releaseEnd);
      oscillator.connect(mainGain);
      mainGain.connect(outputInput);

      if (kit.kick.thump > 0.5) {
        const click = ctx.createOscillator();
        const clickGain = ctx.createGain();
        click.type = "triangle";
        click.frequency.setValueAtTime(kit.kick.pitchHz * 8, env.rampStart);
        clickGain.gain.setValueAtTime(0, env.rampStart);
        clickGain.gain.linearRampToValueAtTime(env.peak * (mode === "polished" ? 0.32 : 0.45) * kit.kick.thump, env.rampStart + 0.002);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, env.rampStart + 0.020);
        click.connect(clickGain);
        clickGain.connect(outputInput);
        click.start(env.rampStart);
        click.stop(env.rampStart + 0.025);
        const clickRecord = { source: click, gain: clickGain };
        activeSources.add(clickRecord);
        click.onended = () => {
          activeSources.delete(clickRecord);
          try { click.disconnect(); clickGain.disconnect(); } catch { /* ignore */ }
        };
      }

      oscillator.start(env.rampStart);
      oscillator.stop(env.releaseEnd + 0.01);
      const record = { source: oscillator, gain: mainGain };
      activeSources.add(record);
      oscillator.onended = () => {
        activeSources.delete(record);
        try { oscillator.disconnect(); mainGain.disconnect(); } catch { /* ignore */ }
      };
    },
    dispose() {
      for (const record of Array.from(activeSources)) {
        try { record.source.stop(); } catch { /* already ended */ }
        try { record.source.disconnect(); record.gain.disconnect(); } catch { /* ignore */ }
        activeSources.delete(record);
      }
    },
  });
}

export function createSnareVoice(ctx, outputInput, { kit, mode, hitCounter }) {
  const noiseBuffer = createLfsrNoiseBuffer(ctx, false);
  const activeSources = new Set();
  return Object.freeze({
    voice: "snare",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time) ? Math.max(ctx.currentTime, time) : ctx.currentTime;
      const env = computeEnvelope({ startAt, hold: hold || 0.05, attack: mode === "polished" ? 0.005 : 0.002, release: kit.snare.noiseDecay, velocity, volumeDb: -19, mode });
      if (env.peak <= 0) return;
      const bodyMix = mode === "polished" ? kit.snare.bodyMix : kit.snare.bodyMix * 0.6;
      const noiseMix = 1 - bodyMix;
      const noiseSource = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      const offsetHash = fnv1a(`snare-${hitCounter()}`);
      const offsetSeconds = (offsetHash % noiseBuffer.length) / noiseBuffer.sampleRate;
      noiseGain.gain.setValueAtTime(0, env.rampStart);
      noiseGain.gain.linearRampToValueAtTime(env.peak * noiseMix, env.rampEnd);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, env.releaseEnd);
      noiseSource.connect(noiseGain);
      noiseGain.connect(outputInput);
      noiseSource.start(env.rampStart, offsetSeconds);
      noiseSource.stop(env.releaseEnd + 0.01);

      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(kit.snare.bodyPitchHz * 1.4, env.rampStart);
      body.frequency.exponentialRampToValueAtTime(Math.max(80, kit.snare.bodyPitchHz), env.rampStart + 0.030);
      bodyGain.gain.setValueAtTime(0, env.rampStart);
      bodyGain.gain.linearRampToValueAtTime(env.peak * bodyMix, env.rampEnd);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, env.rampEnd + Math.max(0.020, kit.snare.noiseDecay * 0.7));
      body.connect(bodyGain);
      bodyGain.connect(outputInput);
      body.start(env.rampStart);
      body.stop(env.releaseEnd + 0.01);

      const noiseRecord = { source: noiseSource, gain: noiseGain };
      const bodyRecord = { source: body, gain: bodyGain };
      activeSources.add(noiseRecord);
      activeSources.add(bodyRecord);
      noiseSource.onended = () => {
        activeSources.delete(noiseRecord);
        try { noiseSource.disconnect(); noiseGain.disconnect(); } catch { /* ignore */ }
      };
      body.onended = () => {
        activeSources.delete(bodyRecord);
        try { body.disconnect(); bodyGain.disconnect(); } catch { /* ignore */ }
      };
    },
    dispose() {
      for (const record of Array.from(activeSources)) {
        try { record.source.stop(); } catch { /* already ended */ }
        try { record.source.disconnect(); record.gain.disconnect(); } catch { /* ignore */ }
        activeSources.delete(record);
      }
    },
  });
}

export function createHatVoice(ctx, outputInput, { kit, mode, hitCounter, variant = "closed" }) {
  const noiseBuffer = createLfsrNoiseBuffer(ctx, true);
  const activeSources = new Set();
  const isOpen = variant === "open";
  const baseVolume = isOpen ? -31 : -30;
  return Object.freeze({
    voice: isOpen ? "openHat" : "hat",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time) ? Math.max(ctx.currentTime, time) : ctx.currentTime;
      const voiceConfig = isOpen ? kit.openHat : kit.hat;
      const env = computeEnvelope({ startAt, hold: hold || (isOpen ? 0.075 : 0.015), attack: mode === "polished" ? 0.004 : 0.002, release: voiceConfig.decay, velocity, volumeDb: baseVolume, mode });
      if (env.peak <= 0) return;
      const source = ctx.createBufferSource();
      const envelope = ctx.createGain();
      const highpass = ctx.createBiquadFilter();
      const softCapFilter = ctx.createBiquadFilter();
      source.buffer = noiseBuffer;
      source.loop = true;
      if (source.playbackRate) source.playbackRate.value = mode === "polished" ? 1.0 : (isOpen ? 1.15 : 1.8);
      highpass.type = "highpass";
      highpass.frequency.value = voiceConfig.cutoffHz;
      highpass.Q.value = 0.5;
      softCapFilter.type = "lowpass";
      softCapFilter.frequency.value = voiceConfig.softCapHz;
      softCapFilter.Q.value = 0.4;
      envelope.gain.setValueAtTime(0, env.rampStart);
      envelope.gain.linearRampToValueAtTime(env.peak, env.rampEnd);
      envelope.gain.exponentialRampToValueAtTime(0.0001, env.releaseEnd);
      const offsetHash = fnv1a(`${isOpen ? "openhat" : "hat"}-${hitCounter()}`);
      const offsetSeconds = (offsetHash % noiseBuffer.length) / noiseBuffer.sampleRate;
      source.connect(highpass);
      highpass.connect(softCapFilter);
      softCapFilter.connect(envelope);
      envelope.connect(outputInput);
      source.start(env.rampStart, offsetSeconds);
      source.stop(env.releaseEnd + 0.01);
      const record = { source, gain: envelope, highpass, softCapFilter };
      activeSources.add(record);
      source.onended = () => {
        activeSources.delete(record);
        try { source.disconnect(); envelope.disconnect(); highpass.disconnect(); softCapFilter.disconnect(); } catch { /* ignore */ }
      };
    },
    dispose() {
      for (const record of Array.from(activeSources)) {
        try { record.source.stop(); } catch { /* already ended */ }
        try { record.source.disconnect(); record.gain.disconnect(); record.highpass.disconnect(); record.softCapFilter.disconnect(); } catch { /* ignore */ }
        activeSources.delete(record);
      }
    },
  });
}

export function createNoiseAccentVoice(ctx, outputInput, { kit, mode, hitCounter }) {
  const noiseBuffer = createLfsrNoiseBuffer(ctx, true);
  const activeSources = new Set();
  return Object.freeze({
    voice: "noiseAccent",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time) ? Math.max(ctx.currentTime, time) : ctx.currentTime;
      const env = computeEnvelope({ startAt, hold: hold || 0.085, attack: mode === "polished" ? 0.006 : 0.004, release: kit.accent.decay, velocity, volumeDb: -25, mode });
      if (env.peak <= 0) return;
      const source = ctx.createBufferSource();
      const envelope = ctx.createGain();
      const bandpass = ctx.createBiquadFilter();
      source.buffer = noiseBuffer;
      source.loop = true;
      if (source.playbackRate) source.playbackRate.value = mode === "polished" ? 0.9 : 0.72;
      bandpass.type = "bandpass";
      bandpass.frequency.value = kit.accent.centreHz;
      bandpass.Q.value = kit.accent.Q;
      envelope.gain.setValueAtTime(0, env.rampStart);
      envelope.gain.linearRampToValueAtTime(env.peak, env.rampEnd);
      envelope.gain.exponentialRampToValueAtTime(0.0001, env.releaseEnd);
      const offsetHash = fnv1a(`accent-${hitCounter()}`);
      const offsetSeconds = (offsetHash % noiseBuffer.length) / noiseBuffer.sampleRate;
      source.connect(bandpass);
      bandpass.connect(envelope);
      envelope.connect(outputInput);
      source.start(env.rampStart, offsetSeconds);
      source.stop(env.releaseEnd + 0.01);
      const record = { source, gain: envelope, bandpass };
      activeSources.add(record);
      source.onended = () => {
        activeSources.delete(record);
        try { source.disconnect(); envelope.disconnect(); bandpass.disconnect(); } catch { /* ignore */ }
      };
    },
    dispose() {
      for (const record of Array.from(activeSources)) {
        try { record.source.stop(); } catch { /* already ended */ }
        try { record.source.disconnect(); record.gain.disconnect(); record.bandpass.disconnect(); } catch { /* ignore */ }
        activeSources.delete(record);
      }
    },
  });
}

export function createDrumSculptorKit(ctx, outputs, { mode = APU_DRUM_SCULPTOR_DEFAULT_MODE, state = "healthy", bpm = 100 } = {}) {
  if (!ctx?.createGain || !ctx?.createBufferSource) throw new Error("apu-drum-sculptor: raw AudioContext is required");
  const activeMode = APU_DRUM_SCULPTOR_MODES.includes(mode) ? mode : APU_DRUM_SCULPTOR_DEFAULT_MODE;
  for (const outputName of ["kickOutput", "snareOutput", "hatOutput", "accentOutput"]) {
    if (!outputs?.[outputName]) throw new Error(`apu-drum-sculptor: ${outputName} is required`);
  }
  let activeState = isState(state) ? state : "unknown";
  let kit = kitForState(activeState);
  let hitCount = 0;
  const hitCounter = () => {
    hitCount = (hitCount + 1) | 0;
    return hitCount;
  };
  const dynamicKit = new Proxy({}, { get(_target, key) { return kit[key]; } });
  const context = { kit: dynamicKit, mode: activeMode, hitCounter, bpm };
  const kick = createKickVoice(ctx, outputs.kickOutput, context);
  const snare = createSnareVoice(ctx, outputs.snareOutput, context);
  const hat = createHatVoice(ctx, outputs.hatOutput, { ...context, variant: "closed" });
  const openHat = createHatVoice(ctx, outputs.hatOutput, { ...context, variant: "open" });
  const noiseAccent = createNoiseAccentVoice(ctx, outputs.accentOutput, context);
  const voices = [kick, snare, hat, openHat, noiseAccent];
  return Object.freeze({
    buildId: APU_DRUM_SCULPTOR_BUILD_ID,
    mode: activeMode,
    kick,
    snare,
    hat,
    openHat,
    noiseAccent,
    getState() { return activeState; },
    getMode() { return activeMode; },
    getKit() { return kit; },
    getHitCount() { return hitCount; },
    setState(nextState) {
      const safeState = isState(nextState) ? nextState : "unknown";
      if (safeState === activeState) return;
      activeState = safeState;
      kit = kitForState(activeState);
    },
    dispose() { for (const voice of voices) voice.dispose(); },
  });
}
