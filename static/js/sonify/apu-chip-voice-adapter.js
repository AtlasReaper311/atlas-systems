/**
 * Atlas APU raw chip voice adapter.
 *
 * Uses the public Web Audio OscillatorNode.setPeriodicWave contract and
 * Tone.connect for graph bridging. It never reaches into Tone.js private
 * oscillator fields. Every trigger creates a bounded native oscillator and
 * envelope, then cleans it up when the source ends.
 */

import {
  createPulseWave,
  createStaircaseTriangle,
  createVrc6Sawtooth,
} from "./apu-chip-oscillators.js?v=20260727-apu-chip-oscillators-v1";

export const APU_CHIP_VOICE_ADAPTER_BUILD_ID = "20260727-apu-chip-voice-adapter-v2";

export const APU_CHIP_WAVE_KINDS = Object.freeze([
  "pulse-narrow",
  "pulse-hollow",
  "pulse-square",
  "triangle-4bit",
  "vrc6-sawtooth",
]);

const DUTY_FOR_KIND = Object.freeze({
  "pulse-narrow": 0.125,
  "pulse-hollow": 0.25,
  "pulse-square": 0.5,
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const dbToGain = (db) => Math.pow(10, Number(db || 0) / 20);

export function chipWaveKindForDuty(dutyCycle) {
  const duty = Number(dutyCycle);
  if (!Number.isFinite(duty)) return "pulse-square";
  if (duty <= 0.18) return "pulse-narrow";
  if (duty <= 0.375) return "pulse-hollow";
  return "pulse-square";
}

export function extractRawContext(Tone) {
  const context = Tone?.getContext?.();
  return context?.rawContext ?? context?.context ?? null;
}

function waveForKind(context, kind) {
  if (kind === "pulse-narrow") return createPulseWave(context, 0.125);
  if (kind === "pulse-hollow") return createPulseWave(context, 0.25);
  if (kind === "pulse-square") return createPulseWave(context, 0.5);
  if (kind === "triangle-4bit") return createStaircaseTriangle(context);
  if (kind === "vrc6-sawtooth") return createVrc6Sawtooth(context);
  throw new Error(`apu-chip-voice-adapter: unsupported wave kind ${kind}`);
}

function durationSeconds(Tone, value, fallback = 0.12) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  try {
    const resolved = Tone?.Time?.(value)?.toSeconds?.();
    return Number.isFinite(resolved) && resolved > 0 ? resolved : fallback;
  } catch {
    return fallback;
  }
}

function connectNativeToTone(Tone, source, destination) {
  if (typeof Tone?.connect === "function") {
    Tone.connect(source, destination);
    return;
  }
  const input = destination?.input?.input
    ?? destination?.input
    ?? destination;
  if (!input || typeof source?.connect !== "function") {
    throw new Error("apu-chip-voice-adapter: destination is not connectable");
  }
  source.connect(input);
}

function createValueParam(initialValue, onChange) {
  let current = Number(initialValue) || 0;
  const set = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return current;
    current = numeric;
    onChange?.(current);
    return current;
  };
  return Object.freeze({
    get value() { return current; },
    set value(value) { set(value); },
    setValueAtTime(value) { return set(value); },
    linearRampToValueAtTime(value) { return set(value); },
    exponentialRampToValueAtTime(value) { return set(value); },
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
  });
}

/**
 * Create a sample-free chip voice with a Tone-compatible trigger contract.
 *
 * @param {object} Tone loaded Tone.js namespace
 * @param {object} output Tone.js or native destination
 * @param {object} options voice configuration
 */
export function createRawChipVoice(Tone, output, {
  waveKind = "pulse-square",
  envelope = {},
  volumeDb = -12,
  maxVoices = 8,
} = {}) {
  const context = extractRawContext(Tone);
  if (!context?.createOscillator || !context?.createGain || !context?.createPeriodicWave) {
    throw new Error("apu-chip-voice-adapter: raw AudioContext is unavailable");
  }
  if (!APU_CHIP_WAVE_KINDS.includes(waveKind)) {
    throw new Error(`apu-chip-voice-adapter: unsupported wave kind ${waveKind}`);
  }
  if (!output) throw new Error("apu-chip-voice-adapter: output is required");

  let disposed = false;
  let activeWaveKind = waveKind;
  let preparedWave = waveForKind(context, activeWaveKind);
  let detuneCents = 0;
  const active = new Set();
  const attack = clamp(envelope.attack ?? 0.004, 0.001, 1);
  const decay = clamp(envelope.decay ?? 0.075, 0.001, 2);
  const sustain = clamp(envelope.sustain ?? 0.2, 0.0001, 1);
  const release = clamp(envelope.release ?? 0.13, 0.005, 4);
  const voiceLimit = Math.max(1, Math.min(32, Math.trunc(maxVoices) || 8));
  const outputGain = dbToGain(volumeDb);

  const updateActiveDetune = (value) => {
    detuneCents = value;
    for (const record of active) {
      if (record.oscillator?.detune) record.oscillator.detune.value = value;
    }
  };
  const detune = createValueParam(0, updateActiveDetune);
  const width = createValueParam(DUTY_FOR_KIND[activeWaveKind] ?? 0.5, (value) => {
    activeWaveKind = chipWaveKindForDuty(value);
    preparedWave = waveForKind(context, activeWaveKind);
  });

  function stopRecord(record, at = context.currentTime) {
    if (!record || record.stopped) return;
    record.stopped = true;
    try { record.oscillator.stop(Math.max(context.currentTime, Number(at) || context.currentTime)); } catch { /* ended */ }
  }

  function removeRecord(record) {
    if (!active.has(record)) return;
    active.delete(record);
    try { record.oscillator.disconnect(); } catch { /* disconnected */ }
    try { record.gain.disconnect(); } catch { /* disconnected */ }
  }

  const voice = {
    get _apuChipKind() { return activeWaveKind; },
    oscillator: Object.freeze({ width }),
    detune,

    setWaveKind(nextKind) {
      if (!APU_CHIP_WAVE_KINDS.includes(nextKind)) return false;
      activeWaveKind = nextKind;
      preparedWave = waveForKind(context, activeWaveKind);
      if (DUTY_FOR_KIND[nextKind]) width.value = DUTY_FOR_KIND[nextKind];
      return true;
    },

    setDutyCycle(dutyCycle) {
      width.value = clamp(dutyCycle, 0.08, 0.75);
      return activeWaveKind;
    },

    triggerAttackRelease(frequency, duration, time, velocity = 1) {
      if (disposed) throw new Error("apu-chip-voice-adapter: voice is disposed");
      const peak = clamp(velocity, 0, 1) * outputGain;
      if (peak <= 0) return false;
      while (active.size >= voiceLimit) {
        const oldest = active.values().next().value;
        stopRecord(oldest, context.currentTime);
        removeRecord(oldest);
      }

      const startAt = Number.isFinite(time) ? Math.max(context.currentTime, time) : context.currentTime;
      const holdSeconds = durationSeconds(Tone, duration);
      const noteOff = startAt + Math.max(attack + decay, holdSeconds);
      const releaseEnd = noteOff + release;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.setPeriodicWave(preparedWave);
      oscillator.frequency.setValueAtTime(clamp(frequency, 20, 20000), startAt);
      if (oscillator.detune) oscillator.detune.setValueAtTime(detuneCents, startAt);
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), startAt + attack + decay);
      gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), noteOff);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);
      oscillator.connect(gain);
      connectNativeToTone(Tone, gain, output);

      const record = { oscillator, gain, stopped: false, waveKind: activeWaveKind };
      active.add(record);
      oscillator.onended = () => removeRecord(record);
      oscillator.start(startAt);
      oscillator.stop(releaseEnd + 0.01);
      return true;
    },

    triggerRelease(time = context.currentTime) {
      for (const record of Array.from(active)) stopRecord(record, time);
    },

    releaseAll(time = context.currentTime) {
      voice.triggerRelease(time);
    },

    getActiveVoiceCount() {
      return active.size;
    },

    getWaveKind() {
      return activeWaveKind;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of Array.from(active)) {
        stopRecord(record, context.currentTime);
        removeRecord(record);
      }
    },
  };

  return Object.freeze(voice);
}

export function describeChipVoice(voice) {
  if (!voice) return null;
  const kind = voice.getWaveKind?.() ?? voice._apuChipKind ?? null;
  if (!kind) return null;
  return Object.freeze({
    kind,
    rawWebAudio: true,
    activeVoices: voice.getActiveVoiceCount?.() ?? 0,
  });
}
