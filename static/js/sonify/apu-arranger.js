import { ATLAS_MOTIF_DEGREES } from "./composition-director.js?v=20260720-system-symphony-loop-production-v2";
import { clamp, normalizedScoreState } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";

export const ATLAS_APU_TRACK_BUILD_ID = "20260725-system-symphony-atlas-apu-track-v1";
export const APU_TRACK_PHRASES = 16;
export const APU_BARS_PER_PHRASE = 2;
export const APU_TRACK_BARS = APU_TRACK_PHRASES * APU_BARS_PER_PHRASE;

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
  healthy: Object.freeze([0, 3, 4, 5, 0, 3, 5, 4, 1, 5, 3, 4, 0, 5, 3, 0]),
  warning: Object.freeze([0, 1, 4, 5, 0, 1, 5, 4, 1, 4, 5, 1, 0, 5, 1, 0]),
  critical: Object.freeze([0, 1, 0, 4, 0, 1, 5, 1, 0, 1, 4, 1, 0, 5, 1, 0]),
  unknown: Object.freeze([0, 3, 0, 5, 0, 3, 5, 0, 0, 4, 3, 0, 5, 3, 0, 0]),
});

const MOTIF_MODES = Object.freeze({
  statement: Object.freeze([...ATLAS_MOTIF_DEGREES]),
  variation: Object.freeze([0, 2, 5, 4, 1, 4, 2, 3]),
  answer: Object.freeze([4, 5, 4, 2, 1, 2, 0, 0]),
  ascending: Object.freeze([0, 2, 4, 5, 6, 5, 4, 7]),
  fragment: Object.freeze([0, 2, 4, 2]),
  climax: Object.freeze([0, 4, 5, 7, 5, 4, 2, 7]),
  recovery: Object.freeze([...ATLAS_MOTIF_DEGREES]),
  breathe: Object.freeze([0, 4, 2, 0]),
});

const SECTION_MIX = Object.freeze({
  intro: Object.freeze({ primary: 0.42, secondary: 0, services: 0.18, bass: 0, drums: 0, pad: 0.82, accent: 0.18 }),
  establish: Object.freeze({ primary: 0.68, secondary: 0, services: 0.34, bass: 0.5, drums: 0.34, pad: 0.72, accent: 0.22 }),
  "theme-a": Object.freeze({ primary: 0.88, secondary: 0.28, services: 0.46, bass: 0.72, drums: 0.62, pad: 0.52, accent: 0.28 }),
  variation: Object.freeze({ primary: 0.82, secondary: 0.5, services: 0.56, bass: 0.76, drums: 0.68, pad: 0.46, accent: 0.34 }),
  "theme-b": Object.freeze({ primary: 0.74, secondary: 0.68, services: 0.48, bass: 0.8, drums: 0.76, pad: 0.34, accent: 0.4 }),
  build: Object.freeze({ primary: 0.82, secondary: 0.76, services: 0.62, bass: 0.9, drums: 0.88, pad: 0.24, accent: 0.58 }),
  peak: Object.freeze({ primary: 1, secondary: 0.88, services: 0.7, bass: 1, drums: 1, pad: 0.2, accent: 0.9 }),
  release: Object.freeze({ primary: 0.46, secondary: 0, services: 0.24, bass: 0.32, drums: 0.08, pad: 0.78, accent: 0.28 }),
  recovery: Object.freeze({ primary: 0.78, secondary: 0.3, services: 0.34, bass: 0.54, drums: 0.36, pad: 0.7, accent: 0.34 }),
  breathe: Object.freeze({ primary: 0.28, secondary: 0, services: 0.16, bass: 0, drums: 0, pad: 0.88, accent: 0.14 }),
});

const SECTION_QUALITY = Object.freeze({
  intro: "open",
  establish: "open",
  "theme-a": "wide",
  variation: "minor",
  "theme-b": "suspended",
  build: "tense",
  peak: "power",
  release: "open",
  recovery: "wide",
  breathe: "suspended",
});

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

function stateAdjustedMotif(mode, state, phraseIndex) {
  const source = MOTIF_MODES[mode] ?? MOTIF_MODES.statement;
  const rotation = modulo(phraseIndex, source.length);
  const rotated = source.map((_, index) => source[(index + rotation) % source.length]);
  if (state === "healthy") return rotated;
  if (state === "warning") {
    return rotated.map((degree, index) => (index % 3 === 2 ? rotated[Math.max(0, index - 1)] : degree));
  }
  if (state === "critical") {
    return rotated.map((degree, index) => (index % 2 === 0 ? degree : Math.max(0, degree - 1)));
  }
  return rotated.filter((_, index) => index % 2 === 0);
}

function harmonyForPhrase(state, cyclePhrase, section) {
  const roots = STATE_ROOTS[state];
  const first = roots[cyclePhrase];
  const second = roots[(cyclePhrase + 1) % roots.length];
  const quality = state === "critical"
    ? "power"
    : state === "unknown"
      ? "suspended"
      : state === "warning" && ["build", "peak", "theme-b"].includes(section.id)
        ? "tense"
        : SECTION_QUALITY[section.id] ?? "minor";
  return Object.freeze([
    Object.freeze({ rootDegree: first, quality, inversion: section.localPhrase % 2 }),
    Object.freeze({ rootDegree: second, quality, inversion: (section.localPhrase + 1) % 2 }),
  ]);
}

function mixFor(section, state, directorPlan) {
  const base = SECTION_MIX[section.id] ?? SECTION_MIX.establish;
  const intent = directorPlan?.intent ?? {};
  const pressure = clamp(intent.pressure ?? 0, 0, 1);
  const confidence = clamp(intent.confidence ?? (state === "unknown" ? 0.35 : 0.85), 0, 1);
  const stateScale = state === "critical" ? 1.08 : state === "warning" ? 1.02 : state === "unknown" ? 0.7 : 1;
  const computed = {
    primary: clamp(base.primary * confidence * stateScale, 0, 1),
    secondary: clamp(base.secondary * confidence * stateScale, 0, 1),
    services: clamp(base.services * (0.72 + confidence * 0.28), 0, 1),
    bass: clamp(base.bass * (0.84 + pressure * 0.16), 0, 1),
    drums: clamp(base.drums * (0.78 + pressure * 0.22) * (state === "unknown" ? 0.45 : 1), 0, 1),
    pad: clamp(base.pad * (state === "critical" ? 0.72 : 1), 0, 1),
    accent: clamp(base.accent * (0.74 + pressure * 0.26), 0, 1),
  };

  if (section.id === "peak" && state !== "unknown") {
    computed.primary = Math.max(computed.primary, 0.92);
    computed.bass = Math.max(computed.bass, 0.92);
    computed.drums = Math.max(computed.drums, 0.92);
    computed.accent = Math.max(computed.accent, 0.78);
  }

  return Object.freeze(computed);
}

export function arrangementForPhrase(frame = {}, directorPlan = null, phraseIndex = 0) {
  const state = normalizedScoreState(frame.scoreState);
  const absolutePhrase = Math.max(0, Math.trunc(phraseIndex));
  const cyclePhrase = modulo(absolutePhrase, APU_TRACK_PHRASES);
  const cycleNumber = Math.floor(absolutePhrase / APU_TRACK_PHRASES);
  const section = sectionAtPhrase(cyclePhrase);
  const harmony = harmonyForPhrase(state, cyclePhrase, section);
  const motifDegrees = stateAdjustedMotif(section.motif, state, absolutePhrase + cycleNumber);
  const mix = mixFor(section, state, directorPlan);
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
    directorPhase: directorPlan?.phase ?? "establish",
    targetBpm: directorPlan?.targetBpm ?? frame.bpm ?? 100,
    energy,
    harmony,
    motifMode: section.motif,
    motifDegrees: Object.freeze(motifDegrees),
    drumPattern: section.drums,
    bassPattern: section.bass,
    counterPattern: section.counter,
    transition: section.transition,
    fillEnabled: section.isLastPhrase && !["intro", "release", "breathe"].includes(section.id),
    octaveBoost: section.id === "peak" || (section.id === "build" && section.localPhrase === section.phrases - 1),
    serviceDensity: clamp(mix.services * (0.72 + energy * 0.28), 0.08, 1),
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
