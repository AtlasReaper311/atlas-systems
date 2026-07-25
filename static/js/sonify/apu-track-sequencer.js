import { chipIdentityForVoice, clamp } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";

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

function modulo(value, length) {
  return ((Math.trunc(value) % length) + length) % length;
}

function wrappedStep(step) {
  return modulo(step, APU_TRACK_STEPS);
}

export function normalizedScale(frame = {}) {
  const source = Array.isArray(frame?.scale) && frame.scale.length
    ? frame.scale
    : [0, 2, 3, 5, 7, 8, 10, 12];
  const unique = [...new Set(source
    .filter(Number.isFinite)
    .map((offset) => modulo(offset, 12)))]
    .sort((left, right) => left - right);
  return Object.freeze(unique.length >= 3 ? unique : [0, 2, 3, 5, 7, 8, 10]);
}

export function scaleMidi(scale, rootMidi, degree) {
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0, 2, 3, 5, 7, 8, 10];
  const safeDegree = Math.trunc(degree);
  const octave = Math.floor(safeDegree / safeScale.length) * 12;
  const index = modulo(safeDegree, safeScale.length);
  return rootMidi + safeScale[index] + octave;
}

export function foldMidi(midi, minimum, maximum) {
  let folded = Number.isFinite(midi) ? midi : minimum;
  while (folded > maximum) folded -= 12;
  while (folded < minimum) folded += 12;
  return folded;
}

function activeHarmony(arrangement, step) {
  const bar = wrappedStep(step) < 16 ? 0 : 1;
  return arrangement?.harmony?.[bar] ?? { rootDegree: 0, quality: "minor", inversion: 0 };
}

function chordDegrees(harmony) {
  return CHORD_DEGREES[harmony?.quality] ?? CHORD_DEGREES.minor;
}

function nearestNumber(target, candidates, previous = null, maximumLeap = Infinity) {
  let best = candidates[0] ?? target;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const leap = previous === null ? 0 : Math.abs(candidate - previous);
    const leapPenalty = leap > maximumLeap ? (leap - maximumLeap) * 8 : leap * 0.18;
    const score = Math.abs(candidate - target) + leapPenalty;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function degreeCandidates(harmony, target, includePassing = false) {
  const root = harmony?.rootDegree ?? 0;
  const base = chordDegrees(harmony);
  const candidates = [];
  for (let octave = -2; octave <= 3; octave += 1) {
    const octaveOffset = octave * 7;
    for (const offset of base) {
      candidates.push(root + offset + octaveOffset);
      if (includePassing) {
        candidates.push(root + offset - 1 + octaveOffset);
        candidates.push(root + offset + 1 + octaveOffset);
      }
    }
  }
  return candidates.sort((left, right) => Math.abs(left - target) - Math.abs(right - target));
}

function melodyDegreeSequence(arrangement, pattern, counter = false) {
  const source = arrangement?.motifDegrees?.length
    ? arrangement.motifDegrees
    : [0, 2, 4, 1, 5, 4, 2, 0];
  const result = [];
  let previous = null;
  for (let index = 0; index < pattern.length; index += 1) {
    const position = pattern[index];
    const harmony = activeHarmony(arrangement, position);
    const sourceIndex = counter
      ? modulo(source.length - 1 - index, source.length)
      : modulo(index, source.length);
    const target = (harmony.rootDegree ?? 0) + source[sourceIndex];
    const strongBeat = position % 8 === 0 || index === 0;
    const candidates = degreeCandidates(harmony, target, !strongBeat);
    const chosen = nearestNumber(target, candidates, previous, counter ? 4 : 3);
    result.push(chosen);
    previous = chosen;
  }
  return result;
}

function midiCandidatesForHarmony(frame, arrangement, step, minimum, maximum, includeScale = false) {
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, step);
  const allowedOffsets = includeScale
    ? Array.from({ length: scale.length }, (_, index) => index)
    : chordDegrees(harmony);
  const candidates = [];
  for (let octave = -3; octave <= 7; octave += 1) {
    for (const offset of allowedOffsets) {
      const degree = (harmony.rootDegree ?? 0) + offset + octave * scale.length;
      const midi = scaleMidi(scale, TONIC_MIDI, degree);
      if (midi >= minimum && midi <= maximum) candidates.push(midi);
    }
  }
  return candidates;
}

export function quantizeMidiToHarmony(frame, arrangement, step, midi, minimum = 32, maximum = 91) {
  const strongBeat = wrappedStep(step) % 8 === 0;
  const candidates = midiCandidatesForHarmony(frame, arrangement, step, minimum, maximum, !strongBeat);
  if (!candidates.length) return clamp(Math.round(midi), minimum, maximum);
  return nearestNumber(midi, candidates);
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
    hat = [3, 7, 11, 15, 19, 23, 27, 31].includes(position);
    openHat = position === 15 || position === 31;
  } else if (pattern === "build") {
    const local = arrangement?.sectionLocalPhrase ?? 0;
    kick = [0, 8, 16, 24].includes(position) || (local > 0 && [6, 14, 22, 30].includes(position));
    snare = position === 8 || position === 24 || (local > 0 && [28, 30].includes(position));
    hat = local > 0
      ? [1, 5, 9, 13, 17, 21, 25, 29].includes(position)
      : [2, 6, 10, 14, 18, 22, 26, 30].includes(position);
    openHat = position === 15 || position === 31;
    noiseAccent = position === 31;
  } else if (pattern === "peak") {
    kick = [0, 4, 6, 10, 16, 20, 22, 26].includes(position);
    snare = [8, 14, 24, 30].includes(position);
    hat = [1, 3, 5, 9, 11, 13, 17, 19, 21, 25, 27, 29].includes(position);
    openHat = position === 7 || position === 15 || position === 23 || position === 31;
    noiseAccent = position === 15 || position === 31;
  } else if (pattern === "release") {
    kick = position === 0;
    noiseAccent = position === 0;
  } else if (pattern === "recovery") {
    kick = position === 0 || position === 16;
    snare = position === 8 || position === 24;
    hat = [6, 14, 22, 30].includes(position);
  }

  if (fill) {
    snare = [28, 30, 31].includes(position);
    kick = kick || position === 28;
    hat = false;
    openHat = position === 31;
    noiseAccent = position === 31;
  }

  return Object.freeze({
    kick: kick ? Object.freeze({ velocity: rhythmVelocity(arrangement, pattern === "peak" ? 0.8 : 0.58) }) : null,
    snare: snare ? Object.freeze({ velocity: rhythmVelocity(arrangement, fill ? 0.48 + (position - 28) * 0.05 : 0.38) }) : null,
    hat: hat ? Object.freeze({ velocity: rhythmVelocity(arrangement, pattern === "peak" ? 0.13 : 0.11) }) : null,
    openHat: openHat ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.16) }) : null,
    noiseAccent: noiseAccent ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.24) }) : null,
  });
}

export function bassEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = BASS_PATTERNS[arrangement?.bassPattern ?? "none"] ?? BASS_PATTERNS.none;
  const event = pattern.find((candidate) => candidate.step === position);
  if (!event) return null;
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const degree = (harmony.rootDegree ?? 0) + event.degree;
  const base = arrangement?.section === "peak" ? 41 : 29;
  const midi = foldMidi(scaleMidi(scale, base, degree), 27, 55);
  return Object.freeze({
    midi,
    duration: event.duration,
    velocity: clamp(0.36 + (arrangement?.mix?.bass ?? 0) * 0.32, 0.2, 0.72),
  });
}

export function padChordForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  if (position !== 0 && position !== 16) return null;
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const offsets = chordDegrees(harmony);
  const rootMidi = frame.scoreState === "unknown" ? 48 : 53;
  let midis = offsets.map((offset) => scaleMidi(scale, rootMidi, (harmony.rootDegree ?? 0) + offset));
  if (harmony.inversion > 0 && midis.length > 2) {
    midis = [...midis.slice(1), midis[0] + 12];
  }
  const bounded = [...new Set(midis.map((midi) => foldMidi(midi, 45, 78)))].sort((left, right) => left - right);
  return Object.freeze({
    midis: Object.freeze(bounded),
    duration: arrangement?.section === "release" || arrangement?.section === "breathe" ? "1m" : "2n",
    velocity: clamp(0.1 + (arrangement?.mix?.pad ?? 0) * 0.18, 0.07, 0.28),
  });
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = PRIMARY_PATTERNS[arrangement?.motifMode ?? "statement"] ?? PRIMARY_PATTERNS.statement;
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1) return null;
  const scale = normalizedScale(frame);
  const degrees = melodyDegreeSequence(arrangement, pattern, false);
  const baseMidi = arrangement?.section === "peak" ? 77 : 65;
  const midi = foldMidi(scaleMidi(scale, baseMidi, degrees[eventIndex]), 58, 88);
  return Object.freeze({
    midi,
    duration: arrangement?.motifMode === "breathe" ? "8n" : arrangement?.motifMode === "climax" ? "32n" : "16n",
    velocity: clamp(0.18 + (arrangement?.mix?.primary ?? 0) * 0.28, 0.12, 0.52),
  });
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const counter = arrangement?.counterPattern ?? "none";
  let pattern = [];
  if (counter === "answer") pattern = [4, 12, 20, 28];
  if (counter === "counter") pattern = [2, 6, 10, 14, 18, 22, 26, 30];
  if (counter === "octave") pattern = [2, 6, 10, 14, 18, 22, 26, 30];
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1) return null;
  const scale = normalizedScale(frame);
  const degrees = melodyDegreeSequence(arrangement, pattern, true);
  const baseMidi = counter === "octave" ? 65 : 53;
  return Object.freeze({
    midi: foldMidi(scaleMidi(scale, baseMidi, degrees[eventIndex]), 53, 86),
    duration: counter === "octave" ? "32n" : "16n",
    velocity: clamp(0.1 + (arrangement?.mix?.secondary ?? 0) * 0.23, 0.07, 0.38),
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
  if (!voice) return null;
  if (!voice.measured && frame.scoreState !== "unknown" && position % 8 !== offset) return null;

  const motif = Array.isArray(voice.motifMidi) && voice.motifMidi.length
    ? voice.motifMidi
    : [voice.registerMidi ?? 53];
  const motifIndex = modulo((arrangement?.phraseIndex ?? 0) + position + (voice.hash ?? 0), motif.length);
  const identity = chipIdentityForVoice(voice);
  const target = motif[motifIndex] + identity.octaveOffset;
  return Object.freeze({
    voice,
    identity,
    midi: quantizeMidiToHarmony(frame, arrangement, position, target, 32, 88),
    duration: identity.shortGate ? "32n" : frame.scoreState === "unknown" ? "8n" : "16n",
    velocity: clamp((voice.velocity ?? 0.3) * (0.28 + (arrangement?.mix?.services ?? 0) * 0.42), 0.05, 0.38),
  });
}

export function transitionEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  if (!arrangement?.isSectionEnd) return null;
  const position = wrappedStep(step);
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const transition = arrangement.transition ?? "none";
  if (transition === "fill" && position === 31) {
    return Object.freeze({ type: "hit", midi: scaleMidi(scale, 65, (harmony.rootDegree ?? 0) + 4), duration: "8n", velocity: 0.3 });
  }
  if (transition === "rise" && [28, 31].includes(position)) {
    const degree = (harmony.rootDegree ?? 0) + (position === 28 ? 2 : 4);
    return Object.freeze({ type: "rise", midi: scaleMidi(scale, 65, degree), duration: "32n", velocity: position === 31 ? 0.34 : 0.24 });
  }
  if (transition === "drop" && position === 31) {
    return Object.freeze({ type: "drop", midi: scaleMidi(scale, 53, harmony.rootDegree ?? 0), duration: "2n", velocity: 0.36 });
  }
  if (transition === "resolve" && position === 30) {
    return Object.freeze({ type: "resolve", midi: scaleMidi(scale, 65, harmony.rootDegree ?? 0), duration: "4n", velocity: 0.27 });
  }
  if (transition === "lift" && position === 31) {
    return Object.freeze({ type: "lift", midi: scaleMidi(scale, 77, (harmony.rootDegree ?? 0) + 4), duration: "8n", velocity: 0.25 });
  }
  if (transition === "restart" && position === 31) {
    return Object.freeze({ type: "restart", midi: scaleMidi(scale, 65, 0), duration: "2n", velocity: 0.2 });
  }
  return null;
}
