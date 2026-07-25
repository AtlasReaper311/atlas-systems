import { chipIdentityForVoice, clamp } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";

export const APU_TRACK_STEPS = 32;

const CHORD_OFFSETS = Object.freeze({
  open: Object.freeze([0, 3, 6]),
  wide: Object.freeze([0, 4, 6]),
  minor: Object.freeze([0, 2, 4]),
  suspended: Object.freeze([0, 3, 5]),
  tense: Object.freeze([0, 1, 4]),
  power: Object.freeze([0, 4]),
});

const PRIMARY_PATTERNS = Object.freeze({
  fragment: Object.freeze([0, 8, 16, 24]),
  statement: Object.freeze([0, 3, 6, 10, 16, 19, 22, 26]),
  variation: Object.freeze([0, 4, 7, 11, 14, 16, 21, 24, 28]),
  answer: Object.freeze([2, 5, 9, 12, 18, 21, 25, 28]),
  ascending: Object.freeze([0, 3, 6, 9, 12, 16, 19, 22, 25, 28, 30]),
  climax: Object.freeze([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]),
  recovery: Object.freeze([0, 4, 7, 11, 16, 20, 23, 27]),
  breathe: Object.freeze([0, 16, 24]),
});

const BASS_PATTERNS = Object.freeze({
  none: Object.freeze([]),
  foundation: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "4n" }),
    Object.freeze({ step: 8, degree: 0, duration: "8n" }),
    Object.freeze({ step: 16, degree: 0, duration: "4n" }),
    Object.freeze({ step: 24, degree: 4, duration: "8n" }),
  ]),
  groove: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "8n" }),
    Object.freeze({ step: 6, degree: 4, duration: "16n" }),
    Object.freeze({ step: 8, degree: 0, duration: "8n" }),
    Object.freeze({ step: 14, degree: 5, duration: "16n" }),
    Object.freeze({ step: 16, degree: 0, duration: "8n" }),
    Object.freeze({ step: 22, degree: 4, duration: "16n" }),
    Object.freeze({ step: 24, degree: 5, duration: "8n" }),
    Object.freeze({ step: 30, degree: 4, duration: "16n" }),
  ]),
  walk: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "8n" }),
    Object.freeze({ step: 4, degree: 1, duration: "8n" }),
    Object.freeze({ step: 8, degree: 2, duration: "8n" }),
    Object.freeze({ step: 12, degree: 4, duration: "8n" }),
    Object.freeze({ step: 16, degree: 0, duration: "8n" }),
    Object.freeze({ step: 20, degree: 5, duration: "8n" }),
    Object.freeze({ step: 24, degree: 4, duration: "8n" }),
    Object.freeze({ step: 28, degree: 2, duration: "8n" }),
  ]),
  rise: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "8n" }),
    Object.freeze({ step: 4, degree: 1, duration: "8n" }),
    Object.freeze({ step: 8, degree: 2, duration: "8n" }),
    Object.freeze({ step: 12, degree: 3, duration: "8n" }),
    Object.freeze({ step: 16, degree: 4, duration: "8n" }),
    Object.freeze({ step: 20, degree: 5, duration: "8n" }),
    Object.freeze({ step: 24, degree: 6, duration: "8n" }),
    Object.freeze({ step: 28, degree: 7, duration: "8n" }),
  ]),
  climax: Object.freeze(Array.from({ length: 16 }, (_, index) => Object.freeze({
    step: index * 2,
    degree: index % 4 === 3 ? 5 : index % 4,
    duration: "16n",
  }))),
  sustain: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "1m" }),
    Object.freeze({ step: 16, degree: 0, duration: "1m" }),
  ]),
  reprise: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "4n" }),
    Object.freeze({ step: 8, degree: 4, duration: "8n" }),
    Object.freeze({ step: 16, degree: 0, duration: "4n" }),
    Object.freeze({ step: 24, degree: 2, duration: "8n" }),
  ]),
});

function modulo(value, length) {
  return ((Math.trunc(value) % length) + length) % length;
}

function wrappedStep(step) {
  return modulo(step, APU_TRACK_STEPS);
}

function safeScale(frame) {
  return Array.isArray(frame?.scale) && frame.scale.length
    ? frame.scale
    : [0, 2, 3, 5, 7, 8, 10, 12];
}

function scaleMidi(scale, rootMidi, degree) {
  const safeDegree = Math.trunc(degree);
  const octave = Math.floor(safeDegree / scale.length) * 12;
  const index = modulo(safeDegree, scale.length);
  return rootMidi + scale[index] + octave;
}

function activeHarmony(arrangement, step) {
  const bar = wrappedStep(step) < 16 ? 0 : 1;
  return arrangement?.harmony?.[bar] ?? { rootDegree: 0, quality: "minor", inversion: 0 };
}

function rhythmVelocity(arrangement, base) {
  return clamp(base * (0.78 + (arrangement?.energy ?? 0.4) * 0.22), 0.04, 0.92);
}

export function rhythmEventsForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = arrangement?.drumPattern ?? "none";
  const fill = arrangement?.fillEnabled && position >= 28;
  let kick = false;
  let snare = false;
  let hat = false;
  let openHat = false;
  let noiseAccent = false;

  if (pattern === "sparse") {
    kick = position === 0 || position === 16;
    snare = position === 8 || position === 24;
    hat = [7, 15, 23, 31].includes(position);
  } else if (pattern === "groove") {
    kick = [0, 6, 16, 22].includes(position);
    snare = position === 8 || position === 24;
    hat = position % 4 === 2;
    openHat = position === 14 || position === 30;
  } else if (pattern === "drive") {
    kick = [0, 6, 10, 16, 22, 26].includes(position);
    snare = position === 8 || position === 24;
    hat = position % 2 === 1;
    openHat = position === 15 || position === 31;
  } else if (pattern === "build") {
    const local = arrangement?.sectionLocalPhrase ?? 0;
    kick = [0, 8, 16, 24].includes(position) || (local > 0 && [6, 14, 22, 30].includes(position));
    snare = position === 8 || position === 24 || (local > 0 && [28, 30].includes(position));
    hat = position % (local > 0 ? 2 : 4) === (local > 0 ? 1 : 2);
    openHat = position === 15 || position === 31;
    noiseAccent = position === 31;
  } else if (pattern === "peak") {
    kick = [0, 4, 6, 10, 16, 20, 22, 26].includes(position);
    snare = [8, 14, 24, 30].includes(position);
    hat = position % 2 === 1;
    openHat = position === 7 || position === 15 || position === 23 || position === 31;
    noiseAccent = position === 15 || position === 31;
  } else if (pattern === "release") {
    kick = position === 0;
    noiseAccent = position === 0;
  } else if (pattern === "recovery") {
    kick = position === 0 || position === 16;
    snare = position === 8 || position === 24;
    hat = position % 4 === 2;
  }

  if (fill) {
    snare = position >= 28;
    kick = kick || position === 28;
    hat = false;
    openHat = position === 31;
    noiseAccent = position === 31;
  }

  return Object.freeze({
    kick: kick ? Object.freeze({ velocity: rhythmVelocity(arrangement, pattern === "peak" ? 0.8 : 0.58) }) : null,
    snare: snare ? Object.freeze({ velocity: rhythmVelocity(arrangement, fill ? 0.5 + (position - 28) * 0.06 : 0.38) }) : null,
    hat: hat ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.17) }) : null,
    openHat: openHat ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.22) }) : null,
    noiseAccent: noiseAccent ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.28) }) : null,
  });
}

export function bassEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = BASS_PATTERNS[arrangement?.bassPattern ?? "none"] ?? BASS_PATTERNS.none;
  const event = pattern.find((candidate) => candidate.step === position);
  if (!event) return null;
  const scale = safeScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const degree = harmony.rootDegree + event.degree;
  const octaveBoost = arrangement?.octaveBoost && position >= 24 ? 12 : 0;
  const midi = clamp(scaleMidi(scale, 29 + octaveBoost, degree), 27, 55);
  return Object.freeze({
    midi,
    duration: event.duration,
    velocity: clamp(0.38 + (arrangement?.mix?.bass ?? 0) * 0.34, 0.2, 0.76),
  });
}

export function padChordForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  if (position !== 0 && position !== 16) return null;
  const scale = safeScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const offsets = CHORD_OFFSETS[harmony.quality] ?? CHORD_OFFSETS.minor;
  const rootMidi = frame.scoreState === "unknown" ? 48 : 53;
  let midis = offsets.map((offset) => scaleMidi(scale, rootMidi, harmony.rootDegree + offset));
  if (harmony.inversion > 0 && midis.length > 2) {
    midis = [...midis.slice(1), midis[0] + 12];
  }
  return Object.freeze({
    midis: Object.freeze(midis.map((midi) => clamp(midi, 45, 76))),
    duration: arrangement?.section === "release" || arrangement?.section === "breathe" ? "1m" : "2n",
    velocity: clamp(0.12 + (arrangement?.mix?.pad ?? 0) * 0.2, 0.08, 0.34),
  });
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = PRIMARY_PATTERNS[arrangement?.motifMode ?? "statement"] ?? PRIMARY_PATTERNS.statement;
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1) return null;
  const degrees = arrangement?.motifDegrees?.length ? arrangement.motifDegrees : [0, 2, 4, 1, 5, 4, 2, 0];
  const harmony = activeHarmony(arrangement, position);
  const scale = safeScale(frame);
  const motifDegree = degrees[eventIndex % degrees.length];
  const octave = arrangement?.octaveBoost && eventIndex % 3 === 1 ? 12 : 0;
  const midi = clamp(scaleMidi(scale, 60 + octave, harmony.rootDegree + motifDegree), 58, 91);
  return Object.freeze({
    midi,
    duration: arrangement?.motifMode === "breathe" ? "8n" : arrangement?.motifMode === "climax" ? "32n" : "16n",
    velocity: clamp(0.2 + (arrangement?.mix?.primary ?? 0) * 0.3, 0.12, 0.56),
  });
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const counter = arrangement?.counterPattern ?? "none";
  let active = false;
  if (counter === "answer") active = [4, 12, 20, 28].includes(position);
  if (counter === "counter") active = [2, 6, 10, 14, 18, 22, 26, 30].includes(position);
  if (counter === "octave") active = position % 4 === 2;
  if (!active) return null;
  const scale = safeScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const degrees = arrangement?.motifDegrees?.length ? arrangement.motifDegrees : [0, 2, 4, 1];
  const index = Math.floor(position / 2) % degrees.length;
  const direction = counter === "answer" ? degrees.length - 1 - index : index;
  const octave = counter === "octave" && position >= 16 ? 12 : 0;
  return Object.freeze({
    midi: clamp(scaleMidi(scale, 55 + octave, harmony.rootDegree + degrees[modulo(direction, degrees.length)]), 53, 88),
    duration: counter === "octave" ? "32n" : "16n",
    velocity: clamp(0.12 + (arrangement?.mix?.secondary ?? 0) * 0.26, 0.08, 0.44),
  });
}

export function serviceEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const voices = Array.isArray(frame.voices) ? frame.voices : [];
  if (!voices.length || (arrangement?.mix?.services ?? 0) <= 0.05) return null;
  const position = wrappedStep(step);
  const density = arrangement?.serviceDensity ?? 0.2;
  const stride = density >= 0.7 ? 2 : density >= 0.4 ? 4 : 8;
  const offset = arrangement?.section === "intro" || arrangement?.section === "breathe" ? 4 : 2;
  if (position % stride !== offset % stride) return null;

  const voiceIndex = modulo((arrangement?.phraseIndex ?? 0) * 5 + position * 3, voices.length);
  const voice = voices[voiceIndex];
  if (!voice) return null;
  if (!voice.measured && frame.scoreState !== "unknown" && position % 8 !== offset) return null;

  const motif = Array.isArray(voice.motifMidi) && voice.motifMidi.length
    ? voice.motifMidi
    : [voice.registerMidi ?? 53];
  const motifIndex = modulo((arrangement?.phraseIndex ?? 0) + position + (voice.hash ?? 0), motif.length);
  const identity = chipIdentityForVoice(voice);
  const registerLift = arrangement?.section === "peak" ? 12 : 0;
  return Object.freeze({
    voice,
    identity,
    midi: clamp(motif[motifIndex] + identity.octaveOffset + registerLift, 32, 91),
    duration: identity.shortGate ? "32n" : frame.scoreState === "unknown" ? "8n" : "16n",
    velocity: clamp((voice.velocity ?? 0.3) * (0.34 + (arrangement?.mix?.services ?? 0) * 0.52), 0.06, 0.48),
  });
}

export function transitionEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  if (!arrangement?.isSectionEnd) return null;
  const position = wrappedStep(step);
  const scale = safeScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const transition = arrangement.transition ?? "none";
  if (transition === "fill" && position === 31) {
    return Object.freeze({ type: "hit", midi: scaleMidi(scale, 67, harmony.rootDegree + 4), duration: "8n", velocity: 0.34 });
  }
  if (transition === "rise" && position >= 28) {
    return Object.freeze({ type: "rise", midi: scaleMidi(scale, 65, harmony.rootDegree + (position - 27)), duration: "32n", velocity: 0.26 + (position - 28) * 0.04 });
  }
  if (transition === "drop" && position === 31) {
    return Object.freeze({ type: "drop", midi: scaleMidi(scale, 53, harmony.rootDegree), duration: "2n", velocity: 0.4 });
  }
  if (transition === "resolve" && position === 30) {
    return Object.freeze({ type: "resolve", midi: scaleMidi(scale, 60, harmony.rootDegree), duration: "4n", velocity: 0.3 });
  }
  if (transition === "lift" && position === 31) {
    return Object.freeze({ type: "lift", midi: scaleMidi(scale, 72, harmony.rootDegree + 4), duration: "8n", velocity: 0.28 });
  }
  if (transition === "restart" && position === 31) {
    return Object.freeze({ type: "restart", midi: scaleMidi(scale, 60, 0), duration: "2n", velocity: 0.24 });
  }
  return null;
}
