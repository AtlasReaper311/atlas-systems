/**
 * Atlas APU state identity policy.
 *
 * Pure deterministic musical rules. No DOM, clock, network, or Tone.js state
 * belongs here. The same state, position, lane, and service hash must always
 * produce the same decision.
 */

export const ATLAS_APU_STATE_IDENTITY_BUILD_ID =
  "20260726-system-symphony-atlas-apu-state-identities-v1";
export const ATLAS_APU_LOCKED_BPM = 100;

const LOGICAL_CHANNELS = Object.freeze([
  "lead",
  "counterline",
  "bass",
  "noise",
  "memory",
  "accent",
]);

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    scale: Object.freeze([...profile.scale]),
    patterns: Object.freeze({ ...profile.patterns }),
    roles: Object.freeze({ ...profile.roles }),
    synthesis: Object.freeze({ ...profile.synthesis }),
    mixScale: Object.freeze({ ...profile.mixScale }),
    dynamics: Object.freeze({ ...profile.dynamics }),
  });
}

export const APU_STATE_IDENTITIES = Object.freeze({
  healthy: freezeProfile({
    id: "healthy",
    label: "Explorer",
    mode: "F Dorian",
    scale: [0, 2, 3, 5, 7, 9, 10],
    patterns: {
      lead: "explorer",
      counterline: "open-counterpoint",
      bass: "walking",
      drums: "swing-open",
    },
    roles: {
      lead: "50-percent-legato-pulse",
      counterline: "25-percent-counterpoint",
      bass: "syncopated-walking-bass",
      noise: "open-swing-hats",
      memory: "warm-sustained-pad",
      accent: "service-callout-hits",
    },
    synthesis: {
      primaryDuty: 0.5,
      secondaryDuty: 0.25,
      primaryAttack: 0.008,
      primaryRelease: 0.18,
      secondaryAttack: 0.006,
      secondaryRelease: 0.16,
      memoryAttack: 0.18,
      memoryRelease: 1.1,
      detuneDepthCents: 1.5,
      stereoWidth: 0.78,
      leadDrive: 0.04,
    },
    mixScale: {
      primary: 1,
      secondary: 1.05,
      services: 0.92,
      bass: 0.92,
      drums: 0.86,
      pad: 1,
      accent: 0.86,
    },
    dynamics: {
      targetRmsDb: -18,
      dynamicRangeDb: 12,
      compressorThresholdDb: -22,
      compressorRatio: 1.35,
      peakCeilingDb: -1,
      masterTrimDb: -10,
    },
    omissionThreshold: 0.05,
  }),
  warning: freezeProfile({
    id: "warning",
    label: "Grid Pressure",
    mode: "F Phrygian",
    scale: [0, 1, 3, 5, 7, 8, 10],
    patterns: {
      lead: "diagnostic-stutter",
      counterline: "approach-pulses",
      bass: "mutating-ostinato",
      drums: "clockwork-diagnostic",
    },
    roles: {
      lead: "12-point-5-percent-staccato-pulse",
      counterline: "25-percent-diagnostic-line",
      bass: "mutating-monophonic-ostinato",
      noise: "sixteenth-note-diagnostic-stutter",
      memory: "gated-pulse-pad",
      accent: "diagnostic-bleeps",
    },
    synthesis: {
      primaryDuty: 0.125,
      secondaryDuty: 0.25,
      primaryAttack: 0.003,
      primaryRelease: 0.075,
      secondaryAttack: 0.002,
      secondaryRelease: 0.07,
      memoryAttack: 0.02,
      memoryRelease: 0.18,
      detuneDepthCents: 2.5,
      stereoWidth: 0.38,
      leadDrive: 0.12,
    },
    mixScale: {
      primary: 1,
      secondary: 1,
      services: 1.08,
      bass: 1,
      drums: 1.08,
      pad: 0.68,
      accent: 1.05,
    },
    dynamics: {
      targetRmsDb: -15,
      dynamicRangeDb: 8,
      compressorThresholdDb: -18,
      compressorRatio: 2.3,
      peakCeilingDb: -1,
      masterTrimDb: -10,
    },
    omissionThreshold: 0.12,
  }),
  critical: freezeProfile({
    id: "critical",
    label: "Boss Protocol",
    mode: "F Phrygian dominant",
    scale: [0, 1, 4, 5, 7, 8, 10],
    patterns: {
      lead: "boss-unison",
      counterline: "alarm-figures",
      bass: "root-fifth-lockstep",
      drums: "impact-metal",
    },
    roles: {
      lead: "hard-gated-unison-lead",
      counterline: "minor-second-tritone-alarm",
      bass: "root-fifth-lockstep-bass",
      noise: "heavy-noise-kick-snare",
      memory: "repurposed-sub-bass-distortion",
      accent: "repurposed-secondary-impact",
    },
    synthesis: {
      primaryDuty: 0.125,
      secondaryDuty: 0.125,
      primaryAttack: 0.001,
      primaryRelease: 0.045,
      secondaryAttack: 0.001,
      secondaryRelease: 0.05,
      memoryAttack: 0.002,
      memoryRelease: 0.08,
      detuneDepthCents: 0,
      stereoWidth: 0.18,
      leadDrive: 0.24,
    },
    mixScale: {
      primary: 1.12,
      secondary: 0.92,
      services: 0.72,
      bass: 1.14,
      drums: 1.16,
      pad: 0.78,
      accent: 1.16,
    },
    dynamics: {
      targetRmsDb: -11,
      dynamicRangeDb: 5,
      compressorThresholdDb: -15,
      compressorRatio: 4.6,
      peakCeilingDb: -1,
      masterTrimDb: -11,
    },
    omissionThreshold: 0.08,
  }),
  unknown: freezeProfile({
    id: "unknown",
    label: "Lost Signal",
    mode: "F suspended pentatonic",
    scale: [0, 2, 5, 7, 10],
    patterns: {
      lead: "fragmented-whispers",
      counterline: "suspended-extensions",
      bass: "static-root-drone",
      drums: "sparse-carrier",
    },
    roles: {
      lead: "fragmented-whispers-with-pitch-drift",
      counterline: "suspended-sus2-sus4-extensions",
      bass: "sub-drone-static-root",
      noise: "low-density-sparse-pulses",
      memory: "carrier-noise-filtered-drift",
      accent: "repurposed-low-level-telemetry-hum",
    },
    synthesis: {
      primaryDuty: 0.5,
      secondaryDuty: 0.5,
      primaryAttack: 0.12,
      primaryRelease: 0.9,
      secondaryAttack: 0.18,
      secondaryRelease: 1.1,
      memoryAttack: 0.45,
      memoryRelease: 1.8,
      detuneDepthCents: 8,
      stereoWidth: 0.62,
      leadDrive: 0.01,
    },
    mixScale: {
      primary: 0.52,
      secondary: 0.42,
      services: 0.46,
      bass: 0.5,
      drums: 0.24,
      pad: 0.9,
      accent: 0.34,
    },
    dynamics: {
      targetRmsDb: -24,
      dynamicRangeDb: 16,
      compressorThresholdDb: -28,
      compressorRatio: 1.15,
      peakCeilingDb: -1,
      masterTrimDb: -13,
    },
    omissionThreshold: 0.4,
  }),
});

export function normalizedApuState(value) {
  const state = String(value ?? "unknown").toLowerCase();
  return APU_STATE_IDENTITIES[state] ? state : "unknown";
}

export function stateIdentityFor(value) {
  return APU_STATE_IDENTITIES[normalizedApuState(value)];
}

export function logicalChannels() {
  return LOGICAL_CHANNELS;
}

function stableHash(parts) {
  const text = parts.map((part) => String(part ?? "")).join("|");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicUnitInterval(...parts) {
  return stableHash(parts) / 0x100000000;
}

export function shouldOmitEvent({
  state,
  barIndex = 0,
  stepIndex = 0,
  serviceHash = 0,
  lane = "generic",
  threshold = null,
} = {}) {
  const identity = stateIdentityFor(state);
  const boundedThreshold = Math.min(
    1,
    Math.max(0, Number.isFinite(threshold) ? threshold : identity.omissionThreshold),
  );
  return deterministicUnitInterval(
    identity.id,
    Math.trunc(barIndex),
    Math.trunc(stepIndex),
    Number(serviceHash) >>> 0,
    lane,
  ) < boundedThreshold;
}

export function pitchIntentFor({ state, role = "lead", stepIndex = 0 } = {}) {
  const normalized = normalizedApuState(state);
  const step = ((Math.trunc(stepIndex) % 32) + 32) % 32;
  if (normalized === "warning" && ["lead", "counterline"].includes(role)) {
    return [6, 14, 22, 30].includes(step) ? "approach" : "diatonic";
  }
  if (normalized === "critical" && role === "counterline") {
    return [6, 14, 22, 30].includes(step) ? "alarm" : "diatonic";
  }
  if (normalized === "unknown" && ["lead", "counterline", "memory"].includes(role)) {
    return "drift";
  }
  return "diatonic";
}

export function transitionPolicy(fromState, toState) {
  const from = normalizedApuState(fromState);
  const to = normalizedApuState(toState);
  if (from === to) {
    return Object.freeze({
      from,
      to,
      mode: "none",
      durationSeconds: 0.18,
      chokeChannels: Object.freeze([]),
    });
  }
  if (to === "critical") {
    return Object.freeze({
      from,
      to,
      mode: "hard-choke",
      durationSeconds: 0.04,
      chokeChannels: Object.freeze(["memory", "counterline"]),
    });
  }
  if (to === "unknown") {
    return Object.freeze({
      from,
      to,
      mode: "one-bar-dissolve",
      durationSeconds: 2.4,
      chokeChannels: Object.freeze([]),
    });
  }
  return Object.freeze({
    from,
    to,
    mode: "bar-crossfade",
    durationSeconds: 0.24,
    chokeChannels: Object.freeze([]),
  });
}

export function stateIdentitySignature(value) {
  const identity = stateIdentityFor(value);
  return [
    identity.id,
    identity.mode,
    identity.patterns.lead,
    identity.patterns.counterline,
    identity.patterns.bass,
    identity.patterns.drums,
    identity.roles.memory,
    identity.roles.accent,
  ].join(":");
}
