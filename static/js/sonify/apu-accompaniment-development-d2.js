/**
 * System Symphony Pass D2 melody-preserving accompaniment development.
 *
 * D2 may shape the space around the approved PR #133-era melody. It must not
 * replace, thin, transpose, re-time, re-gate or re-voice the primary line.
 */

export const APU_ACCOMPANIMENT_DEVELOPMENT_D2_BUILD_ID =
  "20260727-system-symphony-pass-d2-melody-preserving-v1";

const CYCLE_PROFILES = Object.freeze({
  statement: Object.freeze({
    secondary: 0.97,
    services: 0.96,
    bass: 0.99,
    drums: 0.97,
    pad: 1.04,
    accent: 0.95,
    counterCutoff: 0.98,
    serviceCutoff: 0.97,
    padCutoff: 1.02,
  }),
  development: Object.freeze({
    secondary: 1.05,
    services: 1.04,
    bass: 1.02,
    drums: 1.03,
    pad: 0.96,
    accent: 1.04,
    counterCutoff: 1.04,
    serviceCutoff: 1.03,
    padCutoff: 0.98,
  }),
  contrast: Object.freeze({
    secondary: 1.07,
    services: 1.05,
    bass: 1,
    drums: 1.02,
    pad: 0.93,
    accent: 1.07,
    counterCutoff: 1.06,
    serviceCutoff: 1.04,
    padCutoff: 0.96,
  }),
  reprise: Object.freeze({
    secondary: 0.99,
    services: 0.95,
    bass: 0.98,
    drums: 0.96,
    pad: 1.06,
    accent: 0.96,
    counterCutoff: 0.99,
    serviceCutoff: 0.96,
    padCutoff: 1.04,
  }),
});

const PHRASE_TWEAKS = Object.freeze({
  answer: Object.freeze({ secondary: 0.02 }),
  bridge: Object.freeze({ secondary: 0.02, services: 0.01 }),
  build: Object.freeze({ drums: 0.02, accent: 0.02 }),
  climax: Object.freeze({ drums: 0.02, accent: 0.02 }),
  release: Object.freeze({ drums: -0.02, accent: -0.02, pad: 0.02 }),
  cadence: Object.freeze({ drums: -0.02, accent: -0.02, pad: 0.02 }),
  suspension: Object.freeze({ services: -0.01, pad: 0.02 }),
  decay: Object.freeze({ secondary: -0.02, services: -0.02, drums: -0.02, pad: 0.02 }),
});

const STATE_TWEAKS = Object.freeze({
  healthy: Object.freeze({}),
  warning: Object.freeze({ secondary: 0.01, services: 0.01, accent: 0.01 }),
  critical: Object.freeze({ services: -0.01, drums: 0.01, pad: -0.01, accent: 0.02 }),
  unknown: Object.freeze({ secondary: -0.02, services: -0.01, drums: -0.01, pad: 0.02, accent: -0.01 }),
});

const MIX_KEYS = Object.freeze(["secondary", "services", "bass", "drums", "pad", "accent"]);
const TIMBRE_KEYS = Object.freeze(["counterCutoff", "serviceCutoff", "padCutoff"]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

function safeProfile(value, table, fallback) {
  return table[value] ?? table[fallback];
}

function multiplier(base, phraseDelta = 0, stateDelta = 0) {
  return Number(clamp(base + phraseDelta + stateDelta, 0.9, 1.1).toFixed(3));
}

export function accompanimentDevelopmentForSongPlan(songPlan = {}) {
  const cycleRole = CYCLE_PROFILES[songPlan?.cycleRole] ? songPlan.cycleRole : "statement";
  const phraseRole = String(songPlan?.phraseRole ?? "statement");
  const state = STATE_TWEAKS[songPlan?.state] ? songPlan.state : "unknown";
  const cycle = safeProfile(cycleRole, CYCLE_PROFILES, "statement");
  const phrase = PHRASE_TWEAKS[phraseRole] ?? Object.freeze({});
  const stateTweak = safeProfile(state, STATE_TWEAKS, "unknown");

  const mix = { primary: 1 };
  for (const key of MIX_KEYS) {
    mix[key] = multiplier(cycle[key], phrase[key], stateTweak[key]);
  }

  const timbre = {
    leadCutoff: 1,
    leadDrive: 1,
    primaryDutyCycle: 1,
  };
  for (const key of TIMBRE_KEYS) {
    timbre[key] = multiplier(cycle[key], phrase[key], stateTweak[key]);
  }

  return Object.freeze({
    buildId: APU_ACCOMPANIMENT_DEVELOPMENT_D2_BUILD_ID,
    policy: "preserve-primary-melody",
    cycleRole,
    phraseRole,
    state,
    themeId: songPlan?.themeId ?? "ATLAS_THEME",
    transform: songPlan?.transform ?? "identity",
    cadenceIntent: songPlan?.cadenceIntent ?? "open",
    mix: Object.freeze(mix),
    timbre: Object.freeze(timbre),
    invariants: Object.freeze({
      motifMode: "unchanged",
      motifDegrees: "unchanged",
      primaryPattern: "unchanged",
      primaryMidi: "unchanged",
      primaryGate: "unchanged",
      primaryVelocity: "unchanged",
      primaryMix: "unchanged",
      leadTimbre: "unchanged",
      extraPrimaryEvents: 0,
    }),
  });
}
