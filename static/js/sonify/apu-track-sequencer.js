import { chipIdentityForVoice, clamp } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import { normalizedStateIdentity, shouldOmitEvent } from "./apu-state-identities.js?v=20260726-system-symphony-state-identities-v4";

export const APU_TRACK_STEPS = 32;
export const TONIC_MIDI = 41;

const CHORD_DEGREES = Object.freeze({
  open: Object.freeze([0, 4, 7]),
  wide: Object.freeze([0, 4, 9]),
  minor: Object.freeze([0, 2, 4]),
  suspended: Object.freeze([0, 3, 4]),
  tense: Object.freeze([0, 1, 4]),
  power: Object.freeze([0, 4, 7]),
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
    Object.freeze({ step: 14, degree: 2, duration: "16n" }),
    Object.freeze({ step: 16, degree: 0, duration: "8n" }),
    Object.freeze({ step: 22, degree: 4, duration: "16n" }),
    Object.freeze({ step: 24, degree: 2, duration: "8n" }),
    Object.freeze({ step: 30, degree: 4, duration: "16n" }),
  ]),
  walk: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "8n" }),
    Object.freeze({ step: 4, degree: 1, duration: "8n" }),
    Object.freeze({ step: 8, degree: 2, duration: "8n" }),
    Object.freeze({ step: 12, degree: 4, duration: "8n" }),
    Object.freeze({ step: 16, degree: 0, duration: "8n" }),
    Object.freeze({ step: 20, degree: 1, duration: "8n" }),
    Object.freeze({ step: 24, degree: 2, duration: "8n" }),
    Object.freeze({ step: 28, degree: 4, duration: "8n" }),
  ]),
  pressure: Object.freeze([
    Object.freeze({ step: 0, degree: 0, duration: "16n" }),
    Object.freeze({ step: 4, degree: 1, duration: "32n" }),
    Object.freeze({ step: 8, degree: 0, duration: "16n" }),
    Object.freeze({ step: 12, degree: 3, duration: "32n" }),
    Object.freeze({ step: 16, degree: 0, duration: "16n" }),
    Object.freeze({ step: 20, degree: 1, duration: "32n" }),
    Object.freeze({ step: 24, degree: 0, duration: "16n" }),
    Object.freeze({ step: 28, degree: 4, duration: "32n" }),
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
    degree: index % 4 === 3 ? 4 : index % 3 === 1 ? 2 : 0,
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

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;
const wrappedStep = (step) => modulo(step, APU_TRACK_STEPS);
const barIndexFor = (arrangement, step) => (arrangement?.cycleBarStart ?? 1) - 1 + (wrappedStep(step) >= 16 ? 1 : 0);

export function normalizedScale(frame = {}) {
  const identityScale = normalizedStateIdentity(frame.scoreState).scale;
  const source = Array.isArray(frame?.scale) && frame.scale.length ? frame.scale : identityScale;
  const unique = [...new Set(source.filter(Number.isFinite).map((offset) => modulo(offset, 12)))].sort((left, right) => left - right);
  return Object.freeze(unique.length >= 3 ? unique : [...identityScale]);
}

export function scaleMidi(scale, rootMidi, degree) {
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0, 2, 3, 5, 7, 9, 10];
  const safeDegree = Math.trunc(degree);
  const octave = Math.floor(safeDegree / safeScale.length) * 12;
  return rootMidi + safeScale[modulo(safeDegree, safeScale.length)] + octave;
}

export function foldMidi(midi, minimum, maximum) {
  let folded = Number.isFinite(midi) ? midi : minimum;
  while (folded > maximum) folded -= 12;
  while (folded < minimum) folded += 12;
  return folded;
}

function activeHarmony(arrangement, step) {
  return arrangement?.harmony?.[wrappedStep(step) < 16 ? 0 : 1] ?? { rootDegree: 0, quality: "minor", inversion: 0 };
}

function chordDegrees(harmony) {
  return CHORD_DEGREES[harmony?.quality] ?? CHORD_DEGREES.minor;
}

function nearestNumber(target, candidates, previous = null, maximumLeap = Infinity) {
  let best = candidates[0] ?? target;
  let score = Infinity;
  for (const candidate of candidates) {
    const leap = previous === null ? 0 : Math.abs(candidate - previous);
    const candidateScore = Math.abs(candidate - target) + (leap > maximumLeap ? (leap - maximumLeap) * 8 : leap * 0.18);
    if (candidateScore < score) {
      best = candidate;
      score = candidateScore;
    }
  }
  return best;
}

function degreeCandidates(harmony, target, includePassing = false) {
  const root = harmony?.rootDegree ?? 0;
  const candidates = [];
  for (let octave = -2; octave <= 3; octave += 1) {
    for (const offset of chordDegrees(harmony)) {
      candidates.push(root + offset + octave * 7);
      if (includePassing) candidates.push(root + offset - 1 + octave * 7, root + offset + 1 + octave * 7);
    }
  }
  return candidates.sort((left, right) => Math.abs(left - target) - Math.abs(right - target));
}

function melodyDegreeSequence(arrangement, pattern, counter = false) {
  const source = arrangement?.motifDegrees?.length ? arrangement.motifDegrees : [0, 2, 4, 1, 5, 4, 2, 0];
  const result = [];
  let previous = null;
  for (let index = 0; index < pattern.length; index += 1) {
    const position = pattern[index];
    const harmony = activeHarmony(arrangement, position);
    const sourceIndex = counter ? modulo(source.length - 1 - index, source.length) : modulo(index, source.length);
    const target = (harmony.rootDegree ?? 0) + source[sourceIndex];
    const chosen = nearestNumber(target, degreeCandidates(harmony, target, !(position % 8 === 0 || index === 0)), previous, counter ? 4 : 3);
    result.push(chosen);
    previous = chosen;
  }
  return result;
}

function midiCandidatesForHarmony(frame, arrangement, step, minimum, maximum, includeScale = false) {
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, step);
  const offsets = includeScale ? Array.from({ length: scale.length }, (_, index) => index) : chordDegrees(harmony);
  const candidates = [];
  for (let octave = -3; octave <= 7; octave += 1) {
    for (const offset of offsets) {
      const midi = scaleMidi(scale, TONIC_MIDI, (harmony.rootDegree ?? 0) + offset + octave * scale.length);
      if (midi >= minimum && midi <= maximum) candidates.push(midi);
    }
  }
  return candidates;
}

export function quantizeMidiToHarmony(frame, arrangement, step, midi, minimum = 32, maximum = 91) {
  const candidates = midiCandidatesForHarmony(frame, arrangement, step, minimum, maximum, wrappedStep(step) % 8 !== 0);
  return candidates.length ? nearestNumber(midi, candidates) : clamp(Math.round(midi), minimum, maximum);
}

function omissionContext(frame, arrangement, step, serviceHash = 0) {
  return {
    state: frame.scoreState,
    barIndex: barIndexFor(arrangement, step),
    stepIndex: wrappedStep(step),
    serviceHash,
    phraseIndex: arrangement?.phraseIndex ?? 0,
  };
}

function omitted(frame, arrangement, step, serviceHash = 0, preserveAnchor = false) {
  if (preserveAnchor) return false;
  return shouldOmitEvent(omissionContext(frame, arrangement, step, serviceHash));
}

function rhythmVelocity(arrangement, base) {
  return clamp(base * (0.78 + (arrangement?.energy ?? 0.4) * 0.22), 0.04, 0.92);
}

function uniqueSteps(steps) {
  return Object.freeze([...new Set(steps.map(wrappedStep))].sort((left, right) => left - right));
}

function structuralSection(arrangement) {
  return ["intro", "release", "recovery", "breathe"].includes(arrangement?.section);
}

function primaryPatternForState(identity, arrangement, basePattern) {
  if (identity.id === "healthy") return basePattern;
  if (identity.id === "warning" && !structuralSection(arrangement)) {
    return uniqueSteps(basePattern.map((position, index) => position + (index % 2 === 0 ? 1 : 0)));
  }
  if (identity.id === "critical" && !structuralSection(arrangement)) {
    return uniqueSteps([0, 4, 8, 12, 16, 20, 24, 28]);
  }
  if (identity.id === "unknown") {
    return arrangement?.sectionLocalPhrase % 2 === 0
      ? uniqueSteps([0, 16])
      : uniqueSteps([8, 24]);
  }
  return basePattern;
}

function secondaryPatternForState(identity, arrangement, counter) {
  if (identity.id === "critical" && !structuralSection(arrangement)) {
    return uniqueSteps([1, 7, 15, 17, 23, 31]);
  }
  if (identity.id === "warning" && !structuralSection(arrangement)) {
    return counter === "answer"
      ? uniqueSteps([3, 11, 19, 27])
      : uniqueSteps([1, 5, 9, 13, 17, 21, 25, 29]);
  }
  if (identity.id === "unknown") {
    return counter === "none" ? [] : uniqueSteps([12, 28]);
  }
  if (counter === "answer") return [4, 12, 20, 28];
  if (counter === "counter" || counter === "octave") return [2, 6, 10, 14, 18, 22, 26, 30];
  return [];
}

function baseRhythm(pattern, position, localPhrase = 0) {
  if (pattern === "sparse") {
    return {
      kick: position === 0 || position === 16,
      snare: position === 8 || position === 24,
      hat: [7, 15, 23, 31].includes(position),
      openHat: false,
      noiseAccent: false,
    };
  }
  if (pattern === "groove") {
    return {
      kick: [0, 6, 16, 22].includes(position),
      snare: position === 8 || position === 24,
      hat: position % 4 === 2,
      openHat: position === 14 || position === 30,
      noiseAccent: false,
    };
  }
  if (pattern === "drive") {
    return {
      kick: [0, 6, 10, 16, 22, 26].includes(position),
      snare: position === 8 || position === 24,
      hat: [3, 7, 11, 15, 19, 23, 27, 31].includes(position),
      openHat: position === 15 || position === 31,
      noiseAccent: false,
    };
  }
  if (pattern === "diagnostic") {
    return {
      kick: [0, 6, 16, 22].includes(position),
      snare: [8, 24, 30].includes(position),
      hat: position % 2 === 1 && ![13, 29].includes(position),
      openHat: false,
      noiseAccent: [15, 23, 31].includes(position),
    };
  }
  if (pattern === "build") {
    return {
      kick: [0, 8, 16, 24].includes(position) || (localPhrase > 0 && [6, 14, 22, 30].includes(position)),
      snare: position === 8 || position === 24 || (localPhrase > 0 && [28, 30].includes(position)),
      hat: localPhrase > 0
        ? [1, 5, 9, 13, 17, 21, 25, 29].includes(position)
        : [2, 6, 10, 14, 18, 22, 26, 30].includes(position),
      openHat: position === 15 || position === 31,
      noiseAccent: position === 31,
    };
  }
  if (pattern === "peak") {
    return {
      kick: [0, 4, 6, 10, 16, 20, 22, 26].includes(position),
      snare: [8, 14, 24, 30].includes(position),
      hat: [1, 3, 5, 9, 11, 13, 17, 19, 21, 25, 27, 29].includes(position),
      openHat: [7, 15, 23, 31].includes(position),
      noiseAccent: position === 15 || position === 31,
    };
  }
  if (pattern === "boss") {
    return {
      kick: [0, 4, 8, 16, 20, 24].includes(position),
      snare: [8, 14, 24, 30].includes(position),
      hat: [3, 7, 11, 19, 23, 27].includes(position),
      openHat: false,
      noiseAccent: [0, 8, 14, 16, 24, 30, 31].includes(position),
    };
  }
  if (pattern === "release") {
    return {
      kick: position === 0,
      snare: false,
      hat: false,
      openHat: false,
      noiseAccent: position === 0,
    };
  }
  if (pattern === "recovery") {
    return {
      kick: position === 0 || position === 16,
      snare: position === 8 || position === 24,
      hat: [6, 14, 22, 30].includes(position),
      openHat: false,
      noiseAccent: false,
    };
  }
  return { kick: false, snare: false, hat: false, openHat: false, noiseAccent: false };
}

export function rhythmEventsForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const state = normalizedStateIdentity(frame.scoreState).id;
  const pattern = arrangement?.drumPattern ?? "none";
  const fill = arrangement?.fillEnabled && position >= 28;
  const base = baseRhythm(pattern, position, arrangement?.sectionLocalPhrase ?? 0);
  let { kick, snare, hat, openHat, noiseAccent } = base;

  if (pattern !== "none" && pattern !== "release") {
    if (state === "healthy") {
      if (["groove", "drive"].includes(pattern)) {
        hat = [2, 7, 10, 15, 18, 23, 26, 31].includes(position);
        openHat = position === 15 || position === 31;
      }
      noiseAccent = noiseAccent && position === 31;
    } else if (state === "warning") {
      hat = position % 2 === 1 && ![13, 29].includes(position) && !omitted(frame, arrangement, step, 11);
      noiseAccent = noiseAccent || [15, 31].includes(position);
      snare = snare || (pattern !== "sparse" && position === 30);
    } else if (state === "critical") {
      if (pattern !== "sparse" && pattern !== "recovery") {
        kick = [0, 4, 6, 10, 16, 20, 22, 26].includes(position);
        snare = [8, 14, 24, 30].includes(position);
        hat = [1, 3, 5, 9, 11, 13, 17, 19, 21, 25, 27, 29].includes(position);
        openHat = [7, 15, 23, 31].includes(position);
        noiseAccent = [0, 8, 16, 24, 31].includes(position);
      }
    } else {
      kick = position === 0 && !omitted(frame, arrangement, step, 29, true);
      snare = false;
      hat = false;
      openHat = false;
      noiseAccent = [7, 23].includes(position) && !omitted(frame, arrangement, step, 31);
    }
  }

  if (fill && state !== "unknown") {
    snare = [28, 30, 31].includes(position);
    kick = kick || position === 28;
    hat = false;
    openHat = position === 31;
    noiseAccent = position === 31;
  }

  return Object.freeze({
    kick: kick ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "critical" ? 0.82 : 0.58) }) : null,
    snare: snare ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "critical" ? 0.56 : 0.38) }) : null,
    hat: hat ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "warning" ? 0.12 : 0.11) }) : null,
    openHat: openHat ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.16) }) : null,
    noiseAccent: noiseAccent ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "critical" ? 0.34 : 0.24) }) : null,
  });
}

export function bassEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const identity = normalizedStateIdentity(frame.scoreState);
  const pattern = BASS_PATTERNS[arrangement?.bassPattern ?? "none"] ?? BASS_PATTERNS.none;
  const event = pattern.find((candidate) => candidate.step === position);
  if (!event || omitted(frame, arrangement, step, 41, position % 16 === 0)) return null;
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  let degree = (harmony.rootDegree ?? 0) + event.degree;
  if (identity.id === "critical") degree = (harmony.rootDegree ?? 0) + (position % 8 === 0 ? 0 : 4);
  if (identity.id === "unknown") degree = harmony.rootDegree ?? 0;
  let midi = foldMidi(scaleMidi(scale, arrangement?.section === "peak" ? 41 : 29, degree), 27, 55);
  if (identity.id === "warning" && [12, 28].includes(position)) {
    midi = foldMidi(midi - 1, 27, 55);
  }
  return Object.freeze({
    midi,
    duration: identity.id === "unknown" ? "1m" : event.duration,
    velocity: clamp((identity.id === "critical" ? 0.48 : 0.36) + (arrangement?.mix?.bass ?? 0) * 0.28, 0.18, 0.78),
  });
}

export function padChordForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const identity = normalizedStateIdentity(frame.scoreState);
  if ((position !== 0 && position !== 16) || identity.id === "critical") return null;
  if (omitted(frame, arrangement, step, 53, true)) return null;
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const offsets = chordDegrees(harmony);
  const rootMidi = identity.id === "unknown" ? 48 : 53;
  let midis = offsets.map((offset) => scaleMidi(scale, rootMidi, (harmony.rootDegree ?? 0) + offset));
  if (harmony.inversion > 0 && midis.length > 2) midis = [...midis.slice(1), midis[0] + 12];
  return Object.freeze({
    midis: Object.freeze([...new Set(midis.map((midi) => foldMidi(midi, 45, 78)))].sort((left, right) => left - right)),
    duration: identity.id === "unknown" ? "1m" : arrangement?.section === "release" || arrangement?.section === "breathe" ? "1m" : "2n",
    velocity: clamp(0.08 + (arrangement?.mix?.pad ?? 0) * 0.18, 0.05, 0.28),
  });
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const identity = normalizedStateIdentity(frame.scoreState);
  const basePattern = PRIMARY_PATTERNS[arrangement?.motifMode ?? "statement"] ?? PRIMARY_PATTERNS.statement;
  const pattern = primaryPatternForState(identity, arrangement, basePattern);
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1 || omitted(frame, arrangement, step, 67, identity.id === "critical" || position % 16 === 0)) return null;
  if (identity.id === "critical") {
    const scale = normalizedScale(frame);
    const harmony = activeHarmony(arrangement, position);
    const degree = (harmony.rootDegree ?? 0) + (position % 8 === 0 ? 0 : 4);
    return Object.freeze({
      midi: foldMidi(scaleMidi(scale, 53, degree), 52, 76),
      duration: identity.leadGate,
      velocity: clamp(0.18 + (arrangement?.mix?.primary ?? 0) * 0.3, 0.12, 0.58),
      dutyCycle: identity.primaryDutyCycle,
    });
  }
  const degrees = melodyDegreeSequence(arrangement, pattern, false);
  const rootMidi = identity.id === "critical" ? 53 : identity.id === "unknown" ? 62 : arrangement?.section === "peak" ? 77 : 65;
  const midi = foldMidi(scaleMidi(normalizedScale(frame), rootMidi, degrees[eventIndex]), 52, 88);
  return Object.freeze({
    midi,
    duration: identity.leadGate,
    velocity: clamp(0.16 + (arrangement?.mix?.primary ?? 0) * 0.3, 0.1, 0.56),
    dutyCycle: identity.primaryDutyCycle,
  });
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const identity = normalizedStateIdentity(frame.scoreState);
  const counter = arrangement?.counterPattern ?? "none";
  const pattern = secondaryPatternForState(identity, arrangement, counter);
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1 || omitted(frame, arrangement, step, 79, identity.id === "critical" || eventIndex === 0)) return null;
  if (identity.id === "critical") {
    const harmony = activeHarmony(arrangement, position);
    const alarmSemitone = eventIndex % 2 === 0 ? 1 : 6;
    return Object.freeze({
      midi: foldMidi(TONIC_MIDI + 12 + (harmony.rootDegree ?? 0) + alarmSemitone, 48, 76),
      duration: identity.counterGate,
      velocity: clamp(0.12 + (arrangement?.mix?.secondary ?? 0) * 0.26, 0.08, 0.44),
      dutyCycle: identity.counterDutyCycle,
    });
  }
  const degrees = melodyDegreeSequence(arrangement, pattern, true);
  return Object.freeze({
    midi: foldMidi(scaleMidi(normalizedScale(frame), counter === "octave" ? 65 : 53, degrees[eventIndex]), 53, 86),
    duration: identity.counterGate,
    velocity: clamp(0.08 + (arrangement?.mix?.secondary ?? 0) * 0.25, 0.05, 0.42),
    dutyCycle: identity.counterDutyCycle,
  });
}

export function serviceEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const voices = Array.isArray(frame.voices) ? frame.voices : [];
  if (!voices.length || (arrangement?.mix?.services ?? 0) <= 0.05) return null;
  const position = wrappedStep(step);
  const density = arrangement?.serviceDensity ?? 0.2;
  const stride = density >= 0.66 ? 4 : density >= 0.36 ? 8 : 16;
  const offset = arrangement?.section === "intro" || arrangement?.section === "breathe" ? 4 : 2;
  if (position % stride !== offset % stride) return null;
  const voiceIndex = modulo((arrangement?.phraseIndex ?? 0) * 5 + position * 3, voices.length);
  const voice = voices[voiceIndex];
  const preserveAnchor = position === offset;
  if (!voice || omitted(frame, arrangement, step, voice.hash ?? 0, preserveAnchor)) return null;
  if (!voice.measured && frame.scoreState !== "unknown" && position % 8 !== offset) return null;
  const motif = Array.isArray(voice.motifMidi) && voice.motifMidi.length ? voice.motifMidi : [voice.registerMidi ?? 53];
  const identity = chipIdentityForVoice(voice);
  const target = motif[modulo((arrangement?.phraseIndex ?? 0) + position + (voice.hash ?? 0), motif.length)] + identity.octaveOffset;
  return Object.freeze({
    voice,
    identity,
    midi: quantizeMidiToHarmony(frame, arrangement, position, target, 32, 88),
    duration: normalizedStateIdentity(frame.scoreState).id === "unknown" ? "8n" : identity.shortGate ? "32n" : "16n",
    velocity: clamp((voice.velocity ?? 0.3) * (0.28 + (arrangement?.mix?.services ?? 0) * 0.42), 0.04, 0.38),
  });
}

export function transitionEventForTrackStep() {
  return null;
}
