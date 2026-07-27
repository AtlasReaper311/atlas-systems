/**
 * Atlas APU drum sculptor.
 *
 * Replaces the raw LFSR percussion voices in the v3 track engine with a
 * tamed, layered kit. Every voice keeps the same public signature as the
 * original `createLfsrNoiseVoice` factory (`triggerAttackRelease(duration,
 * time, velocity)`, plus `dispose()`) so wiring into `buildGraph()` is a
 * one-line-per-voice swap and stays reversible.
 *
 * Design fixes over the current PR #127 wiring:
 *
 *   1. Attack envelope uses linearRampToValueAtTime with a 3-8 ms
 *      pre-ramp instead of exponential 2 ms ramps, which eliminates the
 *      DC-step click that the current voices produce at every hit.
 *   2. Snare layers LFSR noise with a triangle/pulse body thump so it
 *      reads as a hit instead of a static burst.
 *   3. Closed hats use short-period LFSR at 1.0x playback with the
 *      highpass at 8 kHz plus per-hit lowpass cap at 12 kHz, softening
 *      the metallic jab.
 *   4. Every hit deterministically offsets the buffer start position by
 *      a stable hash of (voice, step, phraseIndex), so consecutive hits
 *      never start on the same LFSR sample slice.
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
 * the raw AudioContext underneath Tone.js, matching the pattern PR #127
 * already established.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const isState = (state) => STATE_KEYS.includes(state);

/**
 * Curve a raw 0..1 velocity so mid-range values don't feel louder than
 * the composer wrote. Uses a soft knee below 0.15 and a gamma of 1.6
 * above it. Returns 0..1.
 *
 * @param {number} raw
 * @returns {number}
 */
export function curveVelocity(raw) {
  const v = clamp(raw, 0, 1);
  if (v <= 0) return 0;
  if (v < 0.15) return v * 0.35; // soft knee for ghost notes
  const above = (v - 0.15) / 0.85; // renormalise 0.15..1 to 0..1
  const curved = Math.pow(above, 1.6);
  return 0.15 * 0.35 + curved * (1 - 0.15 * 0.35);
}

/**
 * Deterministic 32-bit FNV-1a hash of a string. Used to offset LFSR
 * buffer read positions per (voice, step, phrase) so consecutive hits
 * never start on the same sample slice.
 *
 * @param {string} text
 * @returns {number} 0..0x7fffffff
 */
export function fnv1a(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

/**
 * Resolve the state kit safely, always returning a valid entry.
 * @param {string} state
 * @returns {object}
 */
export function kitForState(state) {
  return APU_DRUM_SCULPTOR_KITS[state] ?? APU_DRUM_SCULPTOR_KITS.healthy;
}

/**
 * Convert a decibel value to linear gain.
 * @param {number} db
 * @returns {number}
 */
function dbToGain(db) {
  return Math.pow(10, (Number(db) || 0) / 20);
}

/**
 * Compute a smoothed attack ramp. Returns { rampStart, rampEnd, holdEnd,
 * releaseEnd, peak } absolute times.
 */
function computeEnvelope({
  startAt,
  hold,
  attack,
  release,
  velocity,
  volumeDb,
  mode,
}) {
  const holdSeconds = Math.max(0.005, Number(hold) || 0.005);
  const attackFloor = mode === "polished" ? 0.004 : 0.001;
  const attackSeconds = Math.max(attackFloor, Math.min(attack, holdSeconds * 0.6));
  const releaseSeconds = Math.max(0.006, release);
  const rampStart = startAt;
  const rampEnd = startAt + attackSeconds;
  const holdEnd = startAt + holdSeconds;
  const releaseEnd = holdEnd + releaseSeconds;
  const peak = clamp(curveVelocity(velocity) * dbToGain(volumeDb), 0, 1);
  return { rampStart, rampEnd, holdEnd, releaseEnd, peak };
}

// ---------------------------------------------------------------------------
// Individual voice factories
// ---------------------------------------------------------------------------

/**
 * Kick voice. Sine oscillator with rapid pitch drop from ~4x the base
 * to base, plus a short click layer for attack presence.
 *
 * Signature-compatible with the LFSR voice: `triggerAttackRelease(hold,
 * time, velocity)` and `dispose()`.
 */
export function createKickVoice(ctx, outputInput, { kit, mode }) {
  const activeSources = new Set();

  return Object.freeze({
    voice: "kick",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time)
        ? Math.max(ctx.currentTime, time)
        : ctx.currentTime;
      const env = computeEnvelope({
        startAt,
        hold: hold || 0.14,
        attack: mode === "polished" ? 0.006 : 0.002,
        release: kit.kick.decay,
        velocity,
        volumeDb: -11,
        mode,
      });

      const oscillator = ctx.createOscillator();
      const clickGain = ctx.createGain();
      const mainGain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(kit.kick.pitchHz * 4, env.rampStart);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, kit.kick.pitchHz),
        env.rampStart + 0.045,
      );

      // Main body envelope
      mainGain.gain.setValueAtTime(0, env.rampStart);
      mainGain.gain.linearRampToValueAtTime(env.peak, env.rampEnd);
      mainGain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, env.peak * 0.001),
        env.releaseEnd,
      );

      oscillator.connect(mainGain);
      mainGain.connect(outputInput);

      // Click layer (polished mode gets a softer click)
      if (kit.kick.thump > 0.5) {
        const click = ctx.createOscillator();
        click.type = "triangle";
        click.frequency.setValueAtTime(kit.kick.pitchHz * 8, env.rampStart);
        clickGain.gain.setValueAtTime(0, env.rampStart);
        clickGain.gain.linearRampToValueAtTime(
          env.peak * (mode === "polished" ? 0.32 : 0.45) * kit.kick.thump,
          env.rampStart + 0.002,
        );
        clickGain.gain.exponentialRampToValueAtTime(
          0.0001,
          env.rampStart + 0.020,
        );
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

/**
 * Snare voice. Noise layer (long-period LFSR) combined with a body
 * thump (triangle at snare fundamental) for a hit that reads as a snare
 * rather than a static burst.
 */
export function createSnareVoice(ctx, outputInput, { kit, mode, hitCounter }) {
  const noiseBuffer = createLfsrNoiseBuffer(ctx, false);
  const activeSources = new Set();

  return Object.freeze({
    voice: "snare",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time)
        ? Math.max(ctx.currentTime, time)
        : ctx.currentTime;
      const env = computeEnvelope({
        startAt,
        hold: hold || 0.05,
        attack: mode === "polished" ? 0.005 : 0.002,
        release: kit.snare.noiseDecay,
        velocity,
        volumeDb: -19,
        mode,
      });

      const bodyMix = mode === "polished" ? kit.snare.bodyMix : kit.snare.bodyMix * 0.6;
      const noiseMix = 1 - bodyMix;

      // Noise layer
      const noiseSource = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      const offsetHash = fnv1a(`snare-${hitCounter()}`);
      const offsetSeconds = (offsetHash % noiseBuffer.length) / ctx.sampleRate;
      noiseGain.gain.setValueAtTime(0, env.rampStart);
      noiseGain.gain.linearRampToValueAtTime(env.peak * noiseMix, env.rampEnd);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, env.releaseEnd);
      noiseSource.connect(noiseGain);
      noiseGain.connect(outputInput);
      noiseSource.start(env.rampStart, offsetSeconds);
      noiseSource.stop(env.releaseEnd + 0.01);

      // Body thump
      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(kit.snare.bodyPitchHz * 1.4, env.rampStart);
      body.frequency.exponentialRampToValueAtTime(
        Math.max(80, kit.snare.bodyPitchHz),
        env.rampStart + 0.030,
      );
      bodyGain.gain.setValueAtTime(0, env.rampStart);
      bodyGain.gain.linearRampToValueAtTime(env.peak * bodyMix, env.rampEnd);
      bodyGain.gain.exponentialRampToValueAtTime(
        0.0001,
        env.rampEnd + Math.max(0.020, kit.snare.noiseDecay * 0.7),
      );
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

/**
 * Hat voice. Short-period LFSR through highpass + per-hit lowpass cap.
 * Playback rate is 1.0 in polished mode to avoid pushing the metallic
 * partial into the 1 kHz jab range.
 */
export function createHatVoice(ctx, outputInput, {
  kit,
  mode,
  hitCounter,
  variant = "closed",
}) {
  const noiseBuffer = createLfsrNoiseBuffer(ctx, true);
  const activeSources = new Set();
  const isOpen = variant === "open";
  const decay = isOpen ? kit.openHat.decay : kit.hat.decay;
  const cutoff = isOpen ? kit.openHat.cutoffHz : kit.hat.cutoffHz;
  const softCap = isOpen ? kit.openHat.softCapHz : kit.hat.softCapHz;
  const baseVolume = isOpen ? -31 : -30;

  return Object.freeze({
    voice: isOpen ? "openHat" : "hat",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time)
        ? Math.max(ctx.currentTime, time)
        : ctx.currentTime;
      const env = computeEnvelope({
        startAt,
        hold: hold || (isOpen ? 0.075 : 0.015),
        attack: mode === "polished" ? 0.004 : 0.002,
        release: decay,
        velocity,
        volumeDb: baseVolume,
        mode,
      });

      const source = ctx.createBufferSource();
      const envelope = ctx.createGain();
      const highpass = ctx.createBiquadFilter();
      const softCapFilter = ctx.createBiquadFilter();

      source.buffer = noiseBuffer;
      source.loop = true;
      if (source.playbackRate) {
        source.playbackRate.value = mode === "polished" ? 1.0 : (isOpen ? 1.15 : 1.8);
      }

      highpass.type = "highpass";
      highpass.frequency.value = cutoff;
      highpass.Q.value = 0.5;

      softCapFilter.type = "lowpass";
      softCapFilter.frequency.value = softCap;
      softCapFilter.Q.value = 0.4;

      envelope.gain.setValueAtTime(0, env.rampStart);
      envelope.gain.linearRampToValueAtTime(env.peak, env.rampEnd);
      envelope.gain.exponentialRampToValueAtTime(0.0001, env.releaseEnd);

      const offsetHash = fnv1a(`${isOpen ? "openhat" : "hat"}-${hitCounter()}`);
      const offsetSeconds = (offsetHash % noiseBuffer.length) / ctx.sampleRate;

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
        try {
          source.disconnect(); envelope.disconnect();
          highpass.disconnect(); softCapFilter.disconnect();
        } catch { /* ignore */ }
      };
    },

    dispose() {
      for (const record of Array.from(activeSources)) {
        try { record.source.stop(); } catch { /* already ended */ }
        try {
          record.source.disconnect(); record.gain.disconnect();
          record.highpass.disconnect(); record.softCapFilter.disconnect();
        } catch { /* ignore */ }
        activeSources.delete(record);
      }
    },
  });
}

/**
 * Noise accent voice. Short-period LFSR through a bandpass tuned per
 * state, with lower Q than the PR #127 version to remove the rasp.
 */
export function createNoiseAccentVoice(ctx, outputInput, { kit, mode, hitCounter }) {
  const noiseBuffer = createLfsrNoiseBuffer(ctx, true);
  const activeSources = new Set();

  return Object.freeze({
    voice: "noiseAccent",
    triggerAttackRelease(hold, time, velocity = 1) {
      const startAt = Number.isFinite(time)
        ? Math.max(ctx.currentTime, time)
        : ctx.currentTime;
      const env = computeEnvelope({
        startAt,
        hold: hold || 0.085,
        attack: mode === "polished" ? 0.006 : 0.004,
        release: kit.accent.decay,
        velocity,
        volumeDb: -25,
        mode,
      });

      const source = ctx.createBufferSource();
      const envelope = ctx.createGain();
      const bandpass = ctx.createBiquadFilter();

      source.buffer = noiseBuffer;
      source.loop = true;
      if (source.playbackRate) {
        source.playbackRate.value = mode === "polished" ? 0.9 : 0.72;
      }

      bandpass.type = "bandpass";
      bandpass.frequency.value = kit.accent.centreHz;
      bandpass.Q.value = kit.accent.Q;

      envelope.gain.setValueAtTime(0, env.rampStart);
      envelope.gain.linearRampToValueAtTime(env.peak, env.rampEnd);
      envelope.gain.exponentialRampToValueAtTime(0.0001, env.releaseEnd);

      const offsetHash = fnv1a(`accent-${hitCounter()}`);
      const offsetSeconds = (offsetHash % noiseBuffer.length) / ctx.sampleRate;

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

// ---------------------------------------------------------------------------
// Kit factory
// ---------------------------------------------------------------------------

/**
 * Build a full drum kit ready to be wired into the engine.
 *
 * Returns an object with `kick`, `snare`, `hat`, `openHat`, `noiseAccent`,
 * a `setState(state)` mutator, and a `dispose()` to tear down all
 * outstanding voices.
 *
 * @param {BaseAudioContext} ctx - raw AudioContext, not Tone's wrapper
 * @param {object} outputs - target nodes for each voice
 * @param {AudioNode|object} outputs.kickOutput
 * @param {AudioNode|object} outputs.snareOutput
 * @param {AudioNode|object} outputs.hatOutput
 * @param {AudioNode|object} outputs.accentOutput
 * @param {object} [options]
 * @param {string} [options.mode] - "polished" (default) or "authentic"
 * @param {string} [options.state] - initial state key
 * @returns {object}
 */
export function createDrumSculptorKit(ctx, outputs, {
  mode = APU_DRUM_SCULPTOR_DEFAULT_MODE,
  state = "healthy",
} = {}) {
  if (!ctx?.createGain || !ctx?.createBufferSource) {
    throw new Error("apu-drum-sculptor: raw AudioContext is required");
  }
  const activeMode = APU_DRUM_SCULPTOR_MODES.includes(mode) ? mode : APU_DRUM_SCULPTOR_DEFAULT_MODE;
  let activeState = isState(state) ? state : "healthy";
  let kit = kitForState(activeState);

  // Hit counter is monotonic within this kit instance. Each voice reads it
  // via a closure so buffer offsets deterministically vary hit-to-hit.
  let hitCount = 0;
  const hitCounter = () => {
    hitCount = (hitCount + 1) | 0;
    return hitCount;
  };

  // We build voices with a proxy that reads the current kit lazily, so
  // setState() takes effect on the next trigger without rebuilding voices.
  const dynamicKit = new Proxy({}, {
    get(_target, key) {
      return kit[key];
    },
  });

  const context = { kit: dynamicKit, mode: activeMode, hitCounter };

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
      if (!isState(nextState) || nextState === activeState) return;
      activeState = nextState;
      kit = kitForState(activeState);
    },

    dispose() {
      for (const voice of voices) voice.dispose();
    },
  });
}
