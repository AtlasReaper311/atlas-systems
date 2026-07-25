/**
 * Atlas APU chip palette.
 *
 * Pure deterministic translation from a System Symphony score frame into
 * timbral decisions for the browser synthesiser. No DOM, clock, network, or
 * Tone.js state belongs in this module.
 */

export const ATLAS_APU_BUILD_ID = "20260725-system-symphony-atlas-apu-preview-v1";

export const APU_CHANNELS = Object.freeze({
  pulseA: "pulse-a",
  pulseB: "pulse-b",
  triangle: "triangle",
  noise: "noise",
  wavetable: "wavetable",
  fmAccent: "fm-accent",
});

export const APU_STATE_PROFILES = Object.freeze({
  healthy: Object.freeze({
    label: "Explorer",
    pulseADuty: 0.25,
    pulseBDuty: 0.125,
    pulseAttack: 0.006,
    pulseRelease: 0.16,
    bassCutoffHz: 1250,
    padCutoffHz: 4200,
    noiseBrightnessHz: 6500,
    crusherBits: 12,
    crusherWet: 0.08,
    delayWet: 0.1,
    reverbWet: 0.12,
    stereoWidth: 0.72,
  }),
  warning: Object.freeze({
    label: "Grid Pressure",
    pulseADuty: 0.25,
    pulseBDuty: 0.5,
    pulseAttack: 0.004,
    pulseRelease: 0.11,
    bassCutoffHz: 980,
    padCutoffHz: 3000,
    noiseBrightnessHz: 5200,
    crusherBits: 10,
    crusherWet: 0.14,
    delayWet: 0.08,
    reverbWet: 0.09,
    stereoWidth: 0.62,
  }),
  critical: Object.freeze({
    label: "Boss Protocol",
    pulseADuty: 0.125,
    pulseBDuty: 0.5,
    pulseAttack: 0.002,
    pulseRelease: 0.075,
    bassCutoffHz: 760,
    padCutoffHz: 2200,
    noiseBrightnessHz: 4300,
    crusherBits: 8,
    crusherWet: 0.2,
    delayWet: 0.055,
    reverbWet: 0.065,
    stereoWidth: 0.5,
  }),
  unknown: Object.freeze({
    label: "Lost Signal",
    pulseADuty: 0.125,
    pulseBDuty: 0.25,
    pulseAttack: 0.03,
    pulseRelease: 0.42,
    bassCutoffHz: 620,
    padCutoffHz: 1500,
    noiseBrightnessHz: 2800,
    crusherBits: 9,
    crusherWet: 0.12,
    delayWet: 0.16,
    reverbWet: 0.22,
    stereoWidth: 0.42,
  }),
});

const LAYER_IDENTITIES = Object.freeze({
  surface: Object.freeze({ channel: APU_CHANNELS.pulseA, label: "player lead", octaveOffset: 12 }),
  "public-api": Object.freeze({ channel: APU_CHANNELS.pulseB, label: "packet pulse", octaveOffset: 7 }),
  observability: Object.freeze({ channel: APU_CHANNELS.noise, label: "diagnostic percussion", octaveOffset: 0 }),
  edge: Object.freeze({ channel: APU_CHANNELS.pulseB, label: "gateway PWM", octaveOffset: 5 }),
  "local-ai": Object.freeze({ channel: APU_CHANNELS.wavetable, label: "memory wavetable", octaveOffset: 0 }),
  infra: Object.freeze({ channel: APU_CHANNELS.triangle, label: "machine triangle", octaveOffset: -12 }),
  "reusable-kit": Object.freeze({ channel: APU_CHANNELS.pulseB, label: "utility counterline", octaveOffset: 0 }),
  unknown: Object.freeze({ channel: APU_CHANNELS.wavetable, label: "unresolved carrier", octaveOffset: 0 }),
});

export function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizedScoreState(value) {
  return APU_STATE_PROFILES[value] ? value : "unknown";
}

export function stateProfile(value) {
  return APU_STATE_PROFILES[normalizedScoreState(value)];
}

export function layerIdentity(layer) {
  return LAYER_IDENTITIES[String(layer ?? "unknown").toLowerCase()]
    ?? LAYER_IDENTITIES.unknown;
}

export function chipIdentityForVoice(voice = {}) {
  const identity = layerIdentity(voice.layer);
  const hash = Number.isInteger(voice.hash) ? voice.hash >>> 0 : 0;
  const dutyOptions = [0.125, 0.25, 0.5];
  const dutyCycle = dutyOptions[(hash >>> 5) % dutyOptions.length];
  const octaveVariant = ((hash >>> 9) % 3 - 1) * 12;
  const stereoNudge = ((hash >>> 15) % 17 - 8) / 100;

  return Object.freeze({
    ...identity,
    dutyCycle,
    octaveOffset: clamp(identity.octaveOffset + octaveVariant, -12, 19),
    pan: clamp((voice.pan ?? 0) + stereoNudge, -0.78, 0.78),
    shortGate: voice.status === "down" || voice.articulation === "urgent",
    filtered: voice.status === "unknown" || !voice.measured,
  });
}

export function sceneForFrame(frame = {}, plan = null) {
  const scoreState = normalizedScoreState(frame.scoreState);
  const profile = stateProfile(scoreState);
  const intent = plan?.intent ?? frame.modulation ?? {};
  const pressure = clamp(intent.pressure ?? frame.tension ?? 0, 0, 1);
  const confidence = clamp(intent.confidence ?? (scoreState === "unknown" ? 0.35 : 0.85), 0, 1);
  const energy = clamp(plan?.energy ?? pressure * 0.7 + (frame.density ?? 0.5) * 0.3, 0, 1);

  return Object.freeze({
    buildId: ATLAS_APU_BUILD_ID,
    scoreState,
    label: profile.label,
    profile,
    phase: plan?.phase ?? "establish",
    bpm: clamp(plan?.targetBpm ?? frame.bpm ?? 100, 72, 132),
    density: clamp(frame.density ?? 0.5, 0.12, 1),
    pressure,
    confidence,
    energy,
    masterGainDb: clamp(frame.masterGainDb ?? -10, -18, -4),
    masterFilterHz: clamp(frame.masterFilterHz ?? 6000, 900, 15000),
    masterHpHz: clamp(frame.masterHpHz ?? 24, 20, 80),
  });
}

export function channelSummary(frame = {}) {
  const counts = new Map(Object.values(APU_CHANNELS).map((channel) => [channel, 0]));
  for (const voice of frame.voices ?? []) {
    const identity = chipIdentityForVoice(voice);
    counts.set(identity.channel, (counts.get(identity.channel) ?? 0) + 1);
  }
  return Object.freeze(Object.fromEntries(counts));
}
