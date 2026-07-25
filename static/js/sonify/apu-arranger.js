import {
  ATLAS_APU_LOCKED_BPM,
  ATLAS_APU_STATE_IDENTITY_BUILD_ID,
  stateIdentityFor,
} from "./apu-state-identities.js?v=20260726-system-symphony-atlas-apu-state-identities-v1";

export const ATLAS_APU_TRACK_BUILD_ID =
  "20260726-system-symphony-atlas-apu-state-identities-v1";
export const APU_TRACK_PHRASES = 16;
export const APU_BARS_PER_PHRASE = 2;
export const APU_TRACK_BARS = APU_TRACK_PHRASES * APU_BARS_PER_PHRASE;

const ATLAS_MOTIF_DEGREES = Object.freeze([0, 2, 4, 1, 5, 4, 2, 0]);

export const APU_FORM = Object.freeze([
  Object.freeze({ id: "intro", label: "Intro", phrases: 1, motif: "fragment", drums: "none", bass: "none", counter: "none", transition: "lift" }),
  Object.freeze({ id: "establish", label: "Establish", phrases: 2, motif: "statement", drums: "sparse", bass: "foundation", counter: "none", transition: "fill" }),
  Object.freeze({ id: "theme-a", label: "Theme A", phrases: 2, motif: "statement", drums: "groove", bass: "groove", counter: "answer", transition: "fill" }),
  Object.freeze({ id: "variation", label: "Theme A Variation", phrases: 2, motif: "variation", drums: "groove", bass: "walk", counter: "answer", transition: "rise" }),
  Object.freeze({ id: "theme-b", label: "Theme B", phrases: 2, motif: "answer", drums: "drive", bass: "walk", counter: "counter", transition: "fill" }),
  Object.freeze({ id: "build", label: "Build", phrases: 2, motif: "ascending", drums: "build", bass: "rise", counter: "counter", transition: "rise" }),
  Object.freeze({ id: "peak", label: "Peak", phrases: 2, motif: "climax", drums: "peak", bass: "climax", counter: "octave", transition: "drop" }),
  Object.freeze({ id: "release", label: "Release", phrases: 1, motif: "fragment", drums: "release", bass: "sustain", counter: "none", transition: "resolve" }),
  Object.freeze({ id: "recovery", label: "Recovery", phrases: 1, motif: "recovery", drums: "recovery", bass: "reprise", counter: "answer", transition: "resolve" }),
  Object.freeze({ id: "breathe", label: "Breathe", phrases: 1, motif: "breathe", drums: "none", bass: "none", counter: "none", transition: "restart" }),
]);

const STATE_ROOTS = Object.freeze({
  healthy: Object.freeze([0, 3, 4, 0, 0, 3, 4, 5, 1, 3, 4, 5, 0, 3, 4, 0]),
  warning: Object.freeze([0, 1, 4, 5, 0, 1, 5, 4, 1, 4, 5, 1, 0, 5, 1, 0]),
  critical: Object.freeze([0, 1, 0, 4, 0, 1, 4, 1, 0, 1, 4, 1, 0, 4, 1, 0]),
  unknown: Object.freeze([0, 2, 0, 3, 0, 2, 3, 0, 0, 3, 2, 0, 3, 2, 0, 0]),
});

const MOTIF_MODES = Object.freeze({
  statement: Object.freeze([...ATLAS_MOTIF_DEGREES]),
  variation: Object.freeze([0, 2, 4, 5, 4, 2, 1, 0]),
  answer: Object.freeze([4, 5, 4, 2, 1, 2, 0, 0]),
  ascending: Object.freeze([0, 1, 2, 3, 4, 5, 4, 6]),
  fragment: Object.freeze([0, 2, 4, 2]),
  climax: Object.freeze([0, 2, 4, 5, 4, 2, 1, 0]),
  recovery: Object.freeze([...ATLAS_MOTIF_DEGREES]),
  breathe: Object.freeze([0, 4, 2, 0]),
});

const SECTION_MIX = Object.freeze({
  intro: Object.freeze({ primary: 0.42, secondary: 0, services: 0.12, bass: 0, drums: 0, pad: 0.82, accent: 0.14 }),
  establish: Object.freeze({ primary: 0.68, secondary: 0, services: 0.26, bass: 0.5, drums: 0.3, pad: 0.68, accent: 0.18 }),
  "theme-a": Object.freeze({ primary: 0.88, secondary: 0.24, services: 0.36, bass: 0.72, drums: 0.56, pad: 0.44, accent: 0.24 }),
  variation: Object.freeze({ primary: 0.82, secondary: 0.46, services: 0.42, bass: 0.76, drums: 0.6, pad: 0.38, accent: 0.28 }),
  "theme-b": Object.freeze({ primary: 0.7, secondary: 0.66, services: 0.38, bass: 0.8, drums: 0.7, pad: 0.28, accent: 0.34 }),
  build: Object.freeze({ primary: 0.82, secondary: 0.74, services: 0.48, bass: 0.9, drums: 0.82, pad: 0.2, accent: 0.52 }),
  peak: Object.freeze({ primary: 1, secondary: 0.86, services: 0.54, bass: 1, drums: 1, pad: 0.16, accent: 0.86 }),
  release: Object.freeze({ primary: 0.4, secondary: 0, services: 0.16, bass: 0.3, drums: 0.06, pad: 0.78, accent: 0.22 }),
  recovery: Object.freeze({ primary: 0.76, secondary: 0.26, services: 0.28, bass: 0.52, drums: 0.3, pad: 0.66, accent: 0.28 }),
  breathe: Object.freeze({ primary: 0.24, secondary: 0, services: 0.1, bass: 0, drums: 0, pad: 0.86, accent: 0.1 }),
});

const SECTION_QUALITY = Object.freeze({
  intro: "open",
  establish: "minor",
  "theme-a": "minor",
  variation: "wide",
  "theme-b": "suspended",
  build: "wide",
  peak: "power",
  release: "open",
  recovery: "minor",
  breathe: "suspended",
});

const SECTION_TIMBRE = Object.freeze({
  intro: Object.freeze({ leadCutoffHz: 2200, counterCutoffHz: 1800, serviceCutoffScale: 0.72, padCutoffScale: 0.78, leadDrive: 0.04 }),
  establish: Object.freeze({ leadCutoffHz: 3400, counterCutoffHz: 2400, serviceCutoffScale: 0.82, padCutoffScale: 0.88, leadDrive: 0.06 }),
  "theme-a": Object.freeze({ leadCutoffHz: 5200, counterCutoffHz: 3100, serviceCutoffScale: 0.92, padCutoffScale: 0.82, leadDrive: 0.08 }),
  variation: Object.freeze({ leadCutoffHz: 4300, counterCutoffHz: 4300, serviceCutoffScale: 1, padCutoffScale: 0.74, leadDrive: 0.1 }),
  "theme-b": Object.freeze({ leadCutoffHz: 3600, counterCutoffHz: 5600, serviceCutoffScale: 1.08, padCutoffScale: 0.66, leadDrive: 0.12 }),
  build: Object.freeze({ leadCutoffHz: 6100, counterCutoffHz: 6500, serviceCutoffScale: 1.12, padCutoffScale: 0.56, leadDrive: 0.16 }),
  peak: Object.freeze({ leadCutoffHz: 7600, counterCutoffHz: 7200, serviceCutoffScale: 1.16, padCutoffScale: 0.48, leadDrive: 0.22 }),
  release: Object.freeze({ leadCutoffHz: 2600, counterCutoffHz: 1800, serviceCutoffScale: 0.68, padCutoffScale: 0.9, leadDrive: 0.04 }),
  recovery: Object.freeze({ leadCutoffHz: 4400, counterCutoffHz: 3000, serviceCutoffScale: 0.84, padCutoffScale: 0.9, leadDrive: 0.06 }),
  breathe: Object.freeze({ leadCutoffHz: 1800, counterCutoffHz: 1400, serviceCutoffScale: 0.6, padCutoffScale: 0.72, leadDrive: 0.02 }),
});

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function modulo(value, length) {
  return ((Math.trunc(value) % length) + length) % length;
}

function sectionAtPhrase(cyclePhrase) {
  let cursor = 0;
  for (const section of APU_FORM) {
    const end = cursor + section.phrases;
    if (cyclePhrase < end) {
      return Object.freeze({
        ...section,
        startPhrase: cursor,
        localPhrase: cyclePhrase - cursor,
        isFirstPhrase: cyclePhrase === cursor,
        isLastPhrase: cyclePhrase === end - 1,
      });
    }
    cursor = end;
  }
  return Object.freeze({ ...APU_FORM[0], startPhrase: 0, localPhrase: 0, isFirstPhrase: true, isLastPhrase: true });
}

function phraseVariation(source, localPhrase, cycleNumber) {
  const result = [...source];
  if (localPhrase % 2 === 1 && result.length >= 4) {
    result[result.length - 2] = Math.max(0, result[result.length - 2] - 1);
    result[result.length - 1] = 0;
  }
  if (cycleNumber % 2 === 1 && result.length >= 6) {
    result[3] = Math.max(0, result[3] - 1);
    result[5] = Math.max(0, result[5] - 1);
  }
  return result;
}

function stateAdjustedMotif(mode, state, section, cycleNumber) {
  const source = phraseVariation(
    MOTIF_MODES[mode] ?? MOTIF_MODES.statement,
    section.localPhrase,
    cycleNumber,
  );
  if (state === "healthy") {
    return source.map((degree, index) => (index % 4 === 3 ? degree + 1 : degree));
  }
  if (state === "warning") {
    return source.map((degree, index) => (
      index % 4 === 2 ? Math.max(0, degree - 1) : degree
    ));
  }
  if (state === "critical") {
    return source.map((_, index) => (index % 4 === 3 ? 1 : index % 2 === 0 ? 0 : 4));
  }
  return source
    .filter((_, index) => index % 2 === 0)
    .map((degree, index) => (index % 3 === 2 ? Math.max(0, degree - 1) : degree));
}

function harmonyQuality(state, section) {
  if (state === "critical") return "power";
  if (state === "unknown") return "suspended";
  if (state === "warning") {
    return ["theme-b", "build", "peak"].includes(section.id) ? "tense" : "minor";
  }
  if (["theme-a", "variation", "recovery"].includes(section.id)) return "dorian";
  if (["theme-b", "build"].includes(section.id)) return "sixth";
  return SECTION_QUALITY[section.id] ?? "open";
}

function harmonyForPhrase(state, cyclePhrase, section) {
  const roots = STATE_ROOTS[state] ?? STATE_ROOTS.unknown;
  const first = roots[cyclePhrase];
  const second = roots[(cyclePhrase + 1) % roots.length];
  const quality = harmonyQuality(state, section);
  return Object.freeze([
    Object.freeze({ rootDegree: first, quality, inversion: 0 }),
    Object.freeze({ rootDegree: second, quality, inversion: section.localPhrase % 2 }),
  ]);
}

function mixFor(section, identity, directorPlan) {
  const base = SECTION_MIX[section.id] ?? SECTION_MIX.establish;
  const intent = directorPlan?.intent ?? {};
  const pressure = clamp(intent.pressure ?? 0, 0, 1);
  const confidence = clamp(
    intent.confidence ?? (identity.id === "unknown" ? 0.35 : 0.85),
    0,
    1,
  );
  const result = {};
  for (const key of Object.keys(base)) {
    const evidenceScale = key === "primary" || key === "secondary"
      ? confidence
      : key === "bass" || key === "drums" || key === "accent"
        ? 0.82 + pressure * 0.18
        : 0.72 + confidence * 0.28;
    result[key] = clamp(base[key] * identity.mixScale[key] * evidenceScale, 0, 1);
  }
  if (section.id === "peak" && identity.id !== "unknown") {
    result.primary = Math.max(result.primary, identity.id === "critical" ? 0.98 : 0.92);
    result.bass = Math.max(result.bass, identity.id === "critical" ? 1 : 0.92);
    result.drums = Math.max(result.drums, identity.id === "critical" ? 1 : 0.92);
    result.accent = Math.max(result.accent, identity.id === "critical" ? 0.94 : 0.78);
  }
  if (identity.id === "critical") {
    result.pad = Math.max(result.pad, section.id === "intro" ? 0 : 0.28);
  }
  return Object.freeze(result);
}

function timbreFor(section, identity) {
  const base = SECTION_TIMBRE[section.id] ?? SECTION_TIMBRE.establish;
  const cutoffScale = identity.id === "healthy"
    ? 1.12
    : identity.id === "warning"
      ? 0.86
      : identity.id === "critical"
        ? 0.72
        : 0.5;
  return Object.freeze({
    ...base,
    leadCutoffHz: Math.round(base.leadCutoffHz * cutoffScale),
    counterCutoffHz: Math.round(base.counterCutoffHz * cutoffScale),
    serviceCutoffScale: base.serviceCutoffScale * cutoffScale,
    padCutoffScale: base.padCutoffScale * (identity.id === "unknown" ? 0.62 : 1),
    leadDrive: clamp(base.leadDrive + identity.synthesis.leadDrive, 0, 0.42),
  });
}

export function arrangementForPhrase(frame = {}, directorPlan = null, phraseIndex = 0) {
  const identity = stateIdentityFor(frame.scoreState);
  const state = identity.id;
  const absolutePhrase = Math.max(0, Math.trunc(phraseIndex));
  const cyclePhrase = modulo(absolutePhrase, APU_TRACK_PHRASES);
  const cycleNumber = Math.floor(absolutePhrase / APU_TRACK_PHRASES);
  const section = sectionAtPhrase(cyclePhrase);
  const harmony = harmonyForPhrase(state, cyclePhrase, section);
  const motifDegrees = stateAdjustedMotif(section.motif, state, section, cycleNumber);
  const mix = mixFor(section, identity, directorPlan);
  const cycleBarStart = cyclePhrase * APU_BARS_PER_PHRASE + 1;
  const energy = clamp(
    (directorPlan?.energy ?? directorPlan?.intent?.intensity ?? frame.tension ?? 0.35) * 0.55
      + mix.drums * 0.25
      + mix.primary * 0.2,
    0,
    1,
  );

  return Object.freeze({
    buildId: ATLAS_APU_TRACK_BUILD_ID,
    stateIdentityBuildId: ATLAS_APU_STATE_IDENTITY_BUILD_ID,
    phraseIndex: absolutePhrase,
    cyclePhrase,
    cycleNumber,
    cycleBarStart,
    cycleBarEnd: cycleBarStart + APU_BARS_PER_PHRASE - 1,
    section: section.id,
    sectionLabel: section.label,
    sectionLocalPhrase: section.localPhrase,
    sectionPhraseCount: section.phrases,
    isSectionStart: section.isFirstPhrase,
    isSectionEnd: section.isLastPhrase,
    scoreState: state,
    stateLabel: identity.label,
    stateMode: identity.mode,
    stateIdentity: identity,
    directorPhase: directorPlan?.phase ?? "establish",
    targetBpm: ATLAS_APU_LOCKED_BPM,
    energy,
    harmony,
    motifMode: section.motif,
    motifDegrees: Object.freeze(motifDegrees),
    drumPattern: section.drums,
    bassPattern: section.bass,
    counterPattern: section.counter,
    leadFamily: identity.patterns.lead,
    counterFamily: identity.patterns.counterline,
    bassFamily: identity.patterns.bass,
    drumFamily: identity.patterns.drums,
    transition: section.transition,
    fillEnabled: section.isLastPhrase && !["intro", "release", "breathe"].includes(section.id),
    octaveBoost: section.id === "peak" || (section.id === "build" && section.localPhrase === section.phrases - 1),
    serviceDensity: clamp(
      mix.services * (0.62 + energy * 0.24) * (state === "unknown" ? 0.72 : 1),
      0.04,
      state === "critical" ? 0.62 : 0.78,
    ),
    timbre: timbreFor(section, identity),
    mix,
  });
}

export function arrangementTimeline() {
  let phrase = 0;
  return Object.freeze(APU_FORM.map((section) => {
    const startPhrase = phrase;
    phrase += section.phrases;
    return Object.freeze({
      id: section.id,
      label: section.label,
      startPhrase,
      endPhrase: phrase - 1,
      startBar: startPhrase * APU_BARS_PER_PHRASE + 1,
      endBar: phrase * APU_BARS_PER_PHRASE,
    });
  }));
}
