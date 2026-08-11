import { masteringProfileForState } from "./apu-mastering.js?v=20260728-system-symphony-mastering-v5";

export const APU_STATE_IDENTITY_BUILD_ID = "20260728-system-symphony-state-identities-v8";
export const APU_STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);

const freezeArray = (values) => Object.freeze([...values]);
const freezeObject = (value) => Object.freeze({ ...value });
const HEALTHY_MASTERING = masteringProfileForState("healthy");
const WARNING_MASTERING = masteringProfileForState("warning");
const CRITICAL_MASTERING = masteringProfileForState("critical");
const UNKNOWN_MASTERING = masteringProfileForState("unknown");
const PEAK_PHRASES = Object.freeze([11, 12]);
const PRIMARY_MELODY_EVENT_HASH = 67;

export const APU_STATE_IDENTITIES = Object.freeze({
  healthy: freezeObject({
    id: "healthy",
    label: "Explorer",
    scale: freezeArray([0, 2, 3, 5, 7, 9, 10]),
    chordQualities: freezeArray(["open", "wide", "minor"]),
    primaryDutyCycle: 0.5,
    counterDutyCycle: 0.25,
    leadGate: "8n",
    counterGate: "16n",
    bassGrammar: "walking",
    rhythmGrammar: "swing-open",
    counterGrammar: "counterpoint",
    padRole: "warm-pad",
    accentRole: "service-callout",
    stereoWidth: 0.78,
    omissionThreshold: 0.05,
    mastering: HEALTHY_MASTERING,
    masterGainDb: HEALTHY_MASTERING.masterGainDb,
    dynamicRangeDb: 12,
    transitionPolicy: "one-bar-decay",
    tensionPolicy: "diatonic",
    soundLaw: "explorer-counterpoint",
  }),
  warning: freezeObject({
    id: "warning",
    label: "Grid Pressure",
    scale: freezeArray([0, 1, 3, 5, 7, 8, 10]),
    chordQualities: freezeArray(["tense", "minor", "suspended"]),
    primaryDutyCycle: 0.125,
    counterDutyCycle: 0.25,
    leadGate: "32n",
    counterGate: "32n",
    bassGrammar: "mutating-ostinato",
    rhythmGrammar: "diagnostic-stutter",
    counterGrammar: "diagnostic",
    padRole: "gated-pulse",
    accentRole: "diagnostic-bleep",
    stereoWidth: 0.28,
    omissionThreshold: 0.12,
    mastering: WARNING_MASTERING,
    masterGainDb: WARNING_MASTERING.masterGainDb,
    dynamicRangeDb: 8,
    transitionPolicy: "one-bar-decay",
    tensionPolicy: "approach-resolve",
    soundLaw: "diagnostic-stutter",
  }),
  critical: freezeObject({
    id: "critical",
    label: "Boss Protocol",
    scale: freezeArray([0, 1, 4, 5, 7, 8, 10]),
    chordQualities: freezeArray(["power", "tense"]),
    primaryDutyCycle: 0.125,
    counterDutyCycle: 0.125,
    leadGate: "32n",
    counterGate: "32n",
    bassGrammar: "root-fifth-lockstep",
    rhythmGrammar: "impact-metal",
    counterGrammar: "alarm",
    padRole: "sub-bass-layer",
    accentRole: "secondary-impact",
    stereoWidth: 0.12,
    omissionThreshold: 0.08,
    mastering: CRITICAL_MASTERING,
    masterGainDb: CRITICAL_MASTERING.masterGainDb,
    dynamicRangeDb: 5,
    transitionPolicy: "one-bar-decay",
    tensionPolicy: "bounded-alarm",
    soundLaw: "boss-lockstep",
  }),
  unknown: freezeObject({
    id: "unknown",
    label: "Lost Signal",
    scale: freezeArray([0, 2, 5, 7, 10]),
    chordQualities: freezeArray(["suspended", "open"]),
    primaryDutyCycle: 0.5,
    counterDutyCycle: 0.5,
    leadGate: "2n",
    counterGate: "2n",
    bassGrammar: "static-drone",
    rhythmGrammar: "sparse-carrier",
    counterGrammar: "ghost-echo",
    padRole: "carrier-drift",
    accentRole: "telemetry-hum",
    stereoWidth: 0.62,
    omissionThreshold: 0.18,
    mastering: UNKNOWN_MASTERING,
    masterGainDb: UNKNOWN_MASTERING.masterGainDb,
    dynamicRangeDb: 14,
    transitionPolicy: "one-bar-decay",
    tensionPolicy: "drift-only",
    soundLaw: "lost-signal-question",
  }),
});

export function normalizedStateIdentity(state) {
  return APU_STATE_IDENTITIES[state] ?? APU_STATE_IDENTITIES.unknown;
}

export function deterministicEventHash({ state = "unknown", barIndex = 0, stepIndex = 0, serviceHash = 0, phraseIndex = 0 } = {}) {
  let hash = 2166136261;
  const source = `${state}:${Math.trunc(barIndex)}:${Math.trunc(stepIndex)}:${Math.trunc(serviceHash)}:${Math.trunc(phraseIndex)}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shouldOmitEvent(context = {}) {
  const identity = normalizedStateIdentity(context.state);
  const cyclePhrase = ((Math.trunc(context.phraseIndex ?? 0) % 16) + 16) % 16;

  // Peak is an authored melodic destination in every state. State identity may
  // change its rhythm and notes, but deterministic omission may not punch holes
  // in the primary line once the Peak begins.
  if (
    Math.trunc(context.serviceHash ?? 0) === PRIMARY_MELODY_EVENT_HASH
    && PEAK_PHRASES.includes(cyclePhrase)
  ) {
    return false;
  }

  const normalized = deterministicEventHash(context) / 0xffffffff;
  return normalized < identity.omissionThreshold;
}

function grammar(motif, bass, drums, counter) {
  return Object.freeze({ motif, bass, drums, counter });
}

export function statePatternGrammar(state, section) {
  const identity = normalizedStateIdentity(state);

  if (identity.id === "healthy") {
    if (section === "establish") return grammar("statement", "foundation", "sparse", "none");
    if (section === "theme-a") return grammar("statement", "walk", "groove", "counter");
    if (section === "variation") return grammar("variation", "walk", "groove", "counter");
    if (section === "theme-b") return grammar("answer", "walk", "drive", "counter");
    if (section === "build") return grammar("ascending", "rise", "build", "counter");
    if (section === "peak") return grammar("climax", "climax", "peak", "octave");
    if (section === "recovery") return grammar("recovery", "reprise", "recovery", "answer");
    return grammar("fragment", "none", "none", "none");
  }

  if (identity.id === "warning") {
    if (section === "establish") return grammar("statement", "pressure", "diagnostic", "answer");
    if (section === "theme-a") return grammar("variation", "pressure", "diagnostic", "answer");
    if (section === "variation") return grammar("answer", "pressure", "diagnostic", "counter");
    if (section === "theme-b") return grammar("variation", "pressure", "diagnostic", "counter");
    if (section === "build") return grammar("climax", "pressure", "build", "counter");
    if (section === "peak") return grammar("climax", "climax", "diagnostic", "octave");
    if (section === "recovery") return grammar("recovery", "reprise", "recovery", "answer");
    return grammar("fragment", "none", "none", "none");
  }

  if (identity.id === "critical") {
    if (section === "establish") return grammar("statement", "foundation", "sparse", "none");
    if (section === "recovery") return grammar("recovery", "reprise", "recovery", "answer");
    return grammar("climax", "climax", "boss", "octave");
  }

  if (section === "theme-b") return grammar("answer", "sustain", "none", "ghost");
  if (section === "recovery") return grammar("recovery", "reprise", "none", "ghost");
  return grammar("fragment", section === "release" || section === "breathe" ? "none" : "sustain", "none", "ghost");
}

export function stateMixModifiers(state) {
  const identity = normalizedStateIdentity(state);
  if (identity.id === "healthy") return Object.freeze({ primary: 1, secondary: 1.1, services: 0.9, bass: 0.95, drums: 0.88, pad: 1, accent: 0.75 });
  if (identity.id === "warning") return Object.freeze({ primary: 0.92, secondary: 1.08, services: 1.15, bass: 1.08, drums: 1.08, pad: 0.62, accent: 1.1 });
  if (identity.id === "critical") return Object.freeze({ primary: 1.08, secondary: 0.96, services: 0.72, bass: 1.18, drums: 1.18, pad: 0.18, accent: 1.25 });
  return Object.freeze({ primary: 0.9, secondary: 0.82, services: 0.8, bass: 0.78, drums: 0.58, pad: 1.02, accent: 0.78 });
}

export function stateTimbreModifiers(state) {
  const identity = normalizedStateIdentity(state);
  if (identity.id === "healthy") return Object.freeze({ leadCutoffScale: 1.18, counterCutoffScale: 1.12, serviceCutoffScale: 1.04, padCutoffScale: 1.08, leadDriveScale: 0.72 });
  if (identity.id === "warning") return Object.freeze({ leadCutoffScale: 0.82, counterCutoffScale: 0.9, serviceCutoffScale: 0.86, padCutoffScale: 0.72, leadDriveScale: 1.18 });
  if (identity.id === "critical") return Object.freeze({ leadCutoffScale: 1.08, counterCutoffScale: 1.04, serviceCutoffScale: 0.92, padCutoffScale: 0.48, leadDriveScale: 1.72 });
  return Object.freeze({ leadCutoffScale: 0.72, counterCutoffScale: 0.64, serviceCutoffScale: 0.68, padCutoffScale: 0.76, leadDriveScale: 0.55 });
}
