import { chipIdentityForVoice, clamp } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  pitchIntentFor,
  shouldOmitEvent,
  stateIdentityFor,
} from "./apu-state-identities.js?v=20260726-system-symphony-atlas-apu-state-identities-v1";

export const APU_TRACK_STEPS = 32;
export const TONIC_MIDI = 41;

const CHORD_DEGREES = Object.freeze({
  open: Object.freeze([0, 4, 7]),
  wide: Object.freeze([0, 4, 9]),
  minor: Object.freeze([0, 2, 4]),
  dorian: Object.freeze([0, 2, 4, 5]),
  sixth: Object.freeze([0, 4, 5]),
  suspended: Object.freeze([0, 1, 2]),
  tense: Object.freeze([0, 1, 4]),
  power: Object.freeze([0, 4, 7]),
});

const PRIMARY_PATTERNS = Object.freeze({
  healthy: Object.freeze({
    fragment: Object.freeze([0, 8, 16, 24]),
    statement: Object.freeze([0, 3, 6, 10, 16, 19, 22, 26]),
    variation: Object.freeze([0, 4, 7, 11, 14, 16, 21, 24, 28]),
    answer: Object.freeze([2, 5, 9, 12, 18, 21, 25, 28]),
    ascending: Object.freeze([0, 3, 6, 9, 12, 16, 19, 22, 25, 28, 30]),
    climax: Object.freeze([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]),
    recovery: Object.freeze([0, 4, 7, 11, 16, 20, 23, 27]),
    breathe: Object.freeze([0, 16, 24]),
  }),
  warning: Object.freeze({
    fragment: Object.freeze([0, 6, 7, 16, 22, 23]),
    statement: Object.freeze([0, 3, 6, 7, 10, 14, 15, 16, 19, 22, 23, 26, 30, 31]),
    variation: Object.freeze([0, 2, 6, 7, 10, 14, 15, 16, 18, 22, 23, 26, 30, 31]),
    answer: Object.freeze([2, 6, 7, 10, 14, 15, 18, 22, 23, 26, 30, 31]),
    ascending: Object.freeze([0, 2, 6, 7, 10, 14, 15, 16, 18, 22, 23, 26, 30, 31]),
    climax: Object.freeze(Array.from({ length: 32 }, (_, index) => index)),
    recovery: Object.freeze([0, 6, 7, 14, 15, 16, 22, 23, 30, 31]),
    breathe: Object.freeze([0, 14, 15, 30, 31]),
  }),
  critical: Object.freeze({
    fragment: Object.freeze([0, 4, 8, 12, 16, 20, 24, 28]),
    statement: Object.freeze([0, 4, 8, 12, 16, 20, 24, 28]),
    variation: Object.freeze([0, 2, 4, 8, 10, 12, 16, 18, 20, 24, 26, 28]),
    answer: Object.freeze([0, 4, 8, 12, 16, 20, 24, 28]),
    ascending: Object.freeze([0, 2, 4, 6, 8, 12, 16, 18, 20, 22, 24, 28]),
    climax: Object.freeze([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]),
    recovery: Object.freeze([0, 4, 8, 16, 20, 24]),
    breathe: Object.freeze([0, 16]),
  }),
  unknown: Object.freeze({
    fragment: Object.freeze([0, 12, 24]),
    statement: Object.freeze([0, 10, 20, 28]),
    variation: Object.freeze([0, 7, 18, 27]),
    answer: Object.freeze([4, 16, 28]),
    ascending: Object.freeze([0, 12, 24]),
    climax: Object.freeze([0, 8, 16, 24]),
    recovery: Object.freeze([0, 12, 24]),
    breathe: Object.freeze([0, 24]),
  }),
});

const HEALTHY_BASS = Object.freeze({
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
  rise: Object.freeze(Array.from({ length: 8 }, (_, index) => Object.freeze({
    step: index * 4,
    degree: index,
    duration: "8n",
  }))),
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

function barIndexFor(arrangement, position) {
  return Math.max(0, (arrangement?.cycleBarStart ?? 1) - 1 + (position >= 16 ? 1 : 0));
}

function eventOmitted(frame, arrangement, position, lane, serviceHash = 0, threshold = null) {
  return shouldOmitEvent({
    state: frame?.scoreState,
    barIndex: barIndexFor(arrangement, position),
    stepIndex: position,
    serviceHash,
    lane,
    threshold,
  });
}

export function normalizedScale(frame = {}) {
  return stateIdentityFor(frame.scoreState).scale;
}

export function scaleMidi(scale, rootMidi, degree) {
  const safeScale = Array.isArray(scale) && scale.length ? scale : stateIdentityFor("unknown").scale;
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
  return clamp(base * (0.78 + (arrangement?.energy ?? 0.4) * 0.22), 0.03, 0.92);
}

function stateRhythm(frame, arrangement, position) {
  const state = stateIdentityFor(frame.scoreState).id;
  const section = arrangement?.drumPattern ?? "none";
  let kick = false;
  let snare = false;
  let hat = false;
  let openHat = false;
  let noiseAccent = false;

  if (state === "healthy") {
    if (section === "sparse") {
      kick = [0, 16].includes(position);
      snare = [8, 24].includes(position);
      hat = [6, 14, 22, 30].includes(position);
    } else if (["groove", "drive"].includes(section)) {
      kick = [0, 6, 16, 22].includes(position);
      snare = [8, 24].includes(position);
      hat = [2, 6, 10, 14, 18, 22, 26, 30].includes(position);
      openHat = [14, 30].includes(position);
    } else if (["build", "peak"].includes(section)) {
      kick = [0, 6, 10, 16, 22, 26].includes(position);
      snare = [8, 24].includes(position) || (section === "peak" && [14, 30].includes(position));
      hat = position % 2 === 1;
      openHat = [15, 31].includes(position);
      noiseAccent = section === "peak" && [15, 31].includes(position);
    } else if (section === "release") {
      kick = position === 0;
      noiseAccent = position === 0;
    } else if (section === "recovery") {
      kick = [0, 16].includes(position);
      snare = [8, 24].includes(position);
      hat = [6, 14, 22, 30].includes(position);
    }
  } else if (state === "warning") {
    kick = section !== "none" && [0, 7, 16, 23].includes(position);
    snare = section !== "none" && [8, 15, 24, 31].includes(position);
    hat = section !== "none" && position % 2 === 1;
    openHat = ["build", "peak"].includes(section) && [15, 31].includes(position);
    noiseAccent = ["drive", "build", "peak"].includes(section) && [7, 23, 31].includes(position);
  } else if (state === "critical") {
    const breakdown = arrangement?.section === "peak"
      && arrangement?.sectionLocalPhrase === 0
      && position >= 24;
    if (!breakdown && section !== "none") {
      kick = [0, 4, 8, 12, 16, 20, 24, 28].includes(position);
      snare = [6, 14, 22, 30].includes(position);
      hat = ["build", "peak"].includes(section) && position % 2 === 0;
      openHat = [15, 31].includes(position);
      noiseAccent = [6, 14, 22, 30].includes(position);
    }
  } else {
    kick = section !== "none" && [0, 24].includes(position);
    snare = section === "peak" && position === 16;
    hat = [11, 27].includes(position);
    noiseAccent = [0, 16].includes(position);
  }

  if (arrangement?.fillEnabled && position >= 28 && state !== "unknown") {
    snare = [28, 30, 31].includes(position);
    kick = kick || position === 28;
    hat = false;
    openHat = position === 31;
    noiseAccent = position === 31;
  }

  if (hat && eventOmitted(frame, arrangement, position, "noise-hat")) hat = false;
  if (openHat && eventOmitted(frame, arrangement, position, "noise-open-hat")) openHat = false;
  if (state === "unknown" && noiseAccent && eventOmitted(frame, arrangement, position, "carrier-pulse")) {
    noiseAccent = false;
  }

  return { kick, snare, hat, openHat, noiseAccent };
}

export function rhythmEventsForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const state = stateIdentityFor(frame.scoreState).id;
  const events = stateRhythm(frame, arrangement, position);
  return Object.freeze({
    kick: events.kick ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "critical" ? 0.84 : 0.58) }) : null,
    snare: events.snare ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "critical" ? 0.62 : 0.4) }) : null,
    hat: events.hat ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "warning" ? 0.15 : 0.11) }) : null,
    openHat: events.openHat ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.17) }) : null,
    noiseAccent: events.noiseAccent ? Object.freeze({ velocity: rhythmVelocity(arrangement, state === "critical" ? 0.42 : 0.24) }) : null,
  });
}

function warningBassPattern(arrangement) {
  const mutation = (arrangement?.phraseIndex ?? 0) % 4 === 3 ? 1 : 0;
  return [
    { step: 0, degree: 0, duration: "16n" },
    { step: 4, degree: 0, duration: "16n" },
    { step: 7, degree: 1 + mutation, duration: "32n" },
    { step: 8, degree: 0, duration: "16n" },
    { step: 12, degree: 4, duration: "16n" },
    { step: 16, degree: 0, duration: "16n" },
    { step: 20, degree: 0, duration: "16n" },
    { step: 23, degree: 1 + mutation, duration: "32n" },
    { step: 24, degree: 0, duration: "16n" },
    { step: 28, degree: 4, duration: "16n" },
  ];
}

function criticalBassPattern(arrangement) {
  if (arrangement?.bassPattern === "none") return [];
  return Array.from({ length: 8 }, (_, index) => ({
    step: index * 4,
    degree: index % 2 === 0 ? 0 : 4,
    duration: "16n",
  }));
}

function unknownBassPattern(arrangement) {
  if (arrangement?.bassPattern === "none") return [];
  return [
    { step: 0, degree: 0, duration: "1m" },
    { step: 16, degree: 0, duration: "1m" },
  ];
}

function bassPatternFor(frame, arrangement) {
  const state = stateIdentityFor(frame.scoreState).id;
  if (state === "warning") return warningBassPattern(arrangement);
  if (state === "critical") return criticalBassPattern(arrangement);
  if (state === "unknown") return unknownBassPattern(arrangement);
  return HEALTHY_BASS[arrangement?.bassPattern ?? "none"] ?? HEALTHY_BASS.none;
}

export function bassEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = bassPatternFor(frame, arrangement);
  const event = pattern.find((candidate) => candidate.step === position);
  if (!event || eventOmitted(frame, arrangement, position, "bass", 0, frame.scoreState === "unknown" ? 0.18 : 0)) {
    return null;
  }
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  const degree = (harmony.rootDegree ?? 0) + event.degree;
  const base = arrangement?.section === "peak" ? 41 : 29;
  const midi = foldMidi(scaleMidi(scale, base, degree), 27, 55);
  return Object.freeze({
    midi,
    duration: event.duration,
    pitchIntent: "diatonic",
    role: stateIdentityFor(frame.scoreState).roles.bass,
    velocity: clamp(0.34 + (arrangement?.mix?.bass ?? 0) * 0.34, 0.18, 0.76),
  });
}

export function padChordForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  if (position !== 0 && position !== 16) return null;
  const state = stateIdentityFor(frame.scoreState).id;
  if (state !== "unknown" && eventOmitted(frame, arrangement, position, "memory", 0, 0)) {
    return null;
  }
  const scale = normalizedScale(frame);
  const harmony = activeHarmony(arrangement, position);
  if (state === "critical") {
    const root = foldMidi(scaleMidi(scale, 29, harmony.rootDegree ?? 0), 27, 53);
    return Object.freeze({
      midis: Object.freeze([root, root + 12]),
      duration: "8n",
      velocity: clamp(0.16 + (arrangement?.mix?.pad ?? 0) * 0.18, 0.12, 0.32),
      pitchIntent: "diatonic",
      role: "sub-bass-layer",
    });
  }
  if (state === "unknown") {
    const root = foldMidi(scaleMidi(scale, 41, harmony.rootDegree ?? 0), 36, 60);
    return Object.freeze({
      midis: Object.freeze([root, root + 7]),
      duration: "1m",
      velocity: clamp(0.06 + (arrangement?.mix?.pad ?? 0) * 0.1, 0.05, 0.16),
      pitchIntent: "drift",
      role: "carrier",
    });
  }
  const offsets = chordDegrees(harmony);
  const rootMidi = 53;
  let midis = offsets.map((offset) => scaleMidi(scale, rootMidi, (harmony.rootDegree ?? 0) + offset));
  if (harmony.inversion > 0 && midis.length > 2) {
    midis = [...midis.slice(1), midis[0] + 12];
  }
  const bounded = [...new Set(midis.map((midi) => foldMidi(midi, 45, 78)))].sort((left, right) => left - right);
  return Object.freeze({
    midis: Object.freeze(bounded),
    duration: state === "warning"
      ? "8n"
      : arrangement?.section === "release" || arrangement?.section === "breathe"
        ? "1m"
        : "2n",
    velocity: clamp(0.1 + (arrangement?.mix?.pad ?? 0) * 0.18, 0.07, 0.28),
    pitchIntent: "diatonic",
    role: state === "warning" ? "gated-pulse-pad" : "warm-pad",
  });
}

function primaryPatternFor(frame, arrangement) {
  const state = stateIdentityFor(frame.scoreState).id;
  const patterns = PRIMARY_PATTERNS[state] ?? PRIMARY_PATTERNS.unknown;
  return patterns[arrangement?.motifMode ?? "statement"] ?? patterns.statement;
}

function basePrimaryMidis(frame, arrangement, pattern) {
  const scale = normalizedScale(frame);
  const state = stateIdentityFor(frame.scoreState).id;
  if (state === "critical") {
    return pattern.map((position, index) => {
      const harmony = activeHarmony(arrangement, position);
      const degree = (harmony.rootDegree ?? 0) + (index % 2 === 0 ? 0 : 4);
      return foldMidi(scaleMidi(scale, arrangement?.section === "peak" ? 77 : 65, degree), 58, 88);
    });
  }
  const degrees = melodyDegreeSequence(arrangement, pattern, false);
  const baseMidi = arrangement?.section === "peak" ? 77 : 65;
  return degrees.map((degree) => foldMidi(scaleMidi(scale, baseMidi, degree), 58, 88));
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = primaryPatternFor(frame, arrangement);
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1 || eventOmitted(frame, arrangement, position, "lead")) return null;
  const state = stateIdentityFor(frame.scoreState).id;
  const midis = basePrimaryMidis(frame, arrangement, pattern);
  const intent = pitchIntentFor({ state, role: "lead", stepIndex: position });
  let midi = midis[eventIndex];
  let resolvesToMidi = null;
  if (intent === "approach" && eventIndex + 1 < midis.length && pattern[eventIndex + 1] === position + 1) {
    resolvesToMidi = midis[eventIndex + 1];
    midi = resolvesToMidi - 1;
  }
  return Object.freeze({
    midi,
    resolvesToMidi,
    pitchIntent: intent,
    role: stateIdentityFor(state).roles.lead,
    duration: state === "unknown"
      ? "4n"
      : state === "critical"
        ? "32n"
        : state === "warning"
          ? "32n"
          : arrangement?.motifMode === "breathe"
            ? "8n"
            : arrangement?.motifMode === "climax"
              ? "32n"
              : "16n",
    velocity: clamp(0.18 + (arrangement?.mix?.primary ?? 0) * 0.28, 0.1, state === "critical" ? 0.6 : 0.52),
  });
}

function secondaryPatternFor(frame, arrangement) {
  const state = stateIdentityFor(frame.scoreState).id;
  if (state === "critical") return [6, 14, 22, 30];
  if (state === "unknown") return [8, 24];
  const counter = arrangement?.counterPattern ?? "none";
  if (counter === "answer") return state === "warning" ? [6, 7, 14, 15, 22, 23, 30, 31] : [4, 12, 20, 28];
  if (counter === "counter" || counter === "octave") {
    return state === "warning"
      ? [2, 6, 7, 10, 14, 15, 18, 22, 23, 26, 30, 31]
      : [2, 6, 10, 14, 18, 22, 26, 30];
  }
  return [];
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const position = wrappedStep(step);
  const pattern = secondaryPatternFor(frame, arrangement);
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1 || eventOmitted(frame, arrangement, position, "counterline")) return null;
  const state = stateIdentityFor(frame.scoreState).id;
  const scale = normalizedScale(frame);
  const intent = pitchIntentFor({ state, role: "counterline", stepIndex: position });
  if (intent === "alarm") {
    const harmony = activeHarmony(arrangement, position);
    const root = foldMidi(scaleMidi(scale, 53, harmony.rootDegree ?? 0), 53, 74);
    return Object.freeze({
      midi: root + (eventIndex % 2 === 0 ? 1 : 6),
      pitchIntent: "alarm",
      alarmInterval: eventIndex % 2 === 0 ? "minor-second" : "tritone",
      role: stateIdentityFor(state).roles.counterline,
      duration: "32n",
      velocity: clamp(0.16 + (arrangement?.mix?.secondary ?? 0) * 0.24, 0.12, 0.42),
    });
  }
  const degrees = melodyDegreeSequence(arrangement, pattern, true);
  const baseMidi = arrangement?.counterPattern === "octave" ? 65 : 53;
  const baseMidis = degrees.map((degree) => foldMidi(scaleMidi(scale, baseMidi, degree), 53, 86));
  let midi = baseMidis[eventIndex];
  let resolvesToMidi = null;
  if (intent === "approach" && eventIndex + 1 < baseMidis.length && pattern[eventIndex + 1] === position + 1) {
    resolvesToMidi = baseMidis[eventIndex + 1];
    midi = resolvesToMidi - 1;
  }
  return Object.freeze({
    midi,
    resolvesToMidi,
    pitchIntent: intent,
    role: stateIdentityFor(state).roles.counterline,
    duration: state === "unknown" ? "2n" : state === "warning" ? "32n" : arrangement?.counterPattern === "octave" ? "32n" : "16n",
    velocity: clamp(0.1 + (arrangement?.mix?.secondary ?? 0) * 0.23, 0.06, 0.38),
  });
}

export function serviceEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const voices = Array.isArray(frame.voices) ? frame.voices : [];
  if (!voices.length || (arrangement?.mix?.services ?? 0) <= 0.05) return null;
  const position = wrappedStep(step);
  const density = arrangement?.serviceDensity ?? 0.2;
  const state = stateIdentityFor(frame.scoreState);
  const stride = state.id === "critical"
    ? 8
    : state.id === "unknown"
      ? 16
      : density >= 0.66
        ? 4
        : density >= 0.36
          ? 8
          : 16;
  const offset = arrangement?.section === "intro" || arrangement?.section === "breathe" ? 4 : 2;
  if (position % stride !== offset % stride) return null;

  const voiceIndex = modulo((arrangement?.phraseIndex ?? 0) * 5 + position * 3, voices.length);
  const voice = voices[voiceIndex];
  if (!voice) return null;
  if (eventOmitted(frame, arrangement, position, "service", voice.hash ?? 0)) return null;
  if (!voice.measured && state.id !== "unknown" && position % 8 !== offset) return null;

  const motif = Array.isArray(voice.motifMidi) && voice.motifMidi.length
    ? voice.motifMidi
    : [voice.registerMidi ?? 53];
  const motifIndex = modulo((arrangement?.phraseIndex ?? 0) + position + (voice.hash ?? 0), motif.length);
  const baseIdentity = chipIdentityForVoice(voice);
  const width = state.synthesis.stereoWidth;
  const identity = Object.freeze({
    ...baseIdentity,
    dutyCycle: state.id === "healthy"
      ? (voiceIndex % 2 === 0 ? 0.5 : 0.25)
      : state.id === "warning" || state.id === "critical"
        ? 0.125
        : 0.5,
    pan: clamp(baseIdentity.pan * width, -width, width),
  });
  const target = motif[motifIndex] + identity.octaveOffset;
  return Object.freeze({
    voice,
    identity,
    midi: quantizeMidiToHarmony(frame, arrangement, position, target, 32, 88),
    pitchIntent: state.id === "unknown" ? "drift" : "diatonic",
    duration: identity.shortGate || state.id === "critical"
      ? "32n"
      : state.id === "unknown"
        ? "4n"
        : state.id === "warning"
          ? "32n"
          : "16n",
    detuneCents: state.id === "unknown"
      ? (shouldOmitEvent({
          state: state.id,
          barIndex: barIndexFor(arrangement, position),
          stepIndex: position,
          serviceHash: voice.hash ?? 0,
          lane: "drift-direction",
          threshold: 0.5,
        }) ? -state.synthesis.detuneDepthCents : state.synthesis.detuneDepthCents)
      : voice.detuneCents ?? 0,
    velocity: clamp((voice.velocity ?? 0.3) * (0.28 + (arrangement?.mix?.services ?? 0) * 0.42), 0.04, 0.38),
  });
}

export function transitionEventForTrackStep() {
  return null;
}

export function eventSignatureForPhrase(frame = {}, arrangement = null) {
  const signature = [];
  for (let step = 0; step < APU_TRACK_STEPS; step += 1) {
    const rhythm = rhythmEventsForTrackStep(frame, arrangement, step);
    const bass = bassEventForTrackStep(frame, arrangement, step);
    const lead = primaryPulseEventForTrackStep(frame, arrangement, step);
    const counter = secondaryPulseEventForTrackStep(frame, arrangement, step);
    const memory = padChordForTrackStep(frame, arrangement, step);
    if (rhythm.kick) signature.push(`k${step}`);
    if (rhythm.snare) signature.push(`s${step}`);
    if (rhythm.hat) signature.push(`h${step}`);
    if (bass) signature.push(`b${step}:${bass.midi}`);
    if (lead) signature.push(`l${step}:${lead.midi}:${lead.pitchIntent}`);
    if (counter) signature.push(`c${step}:${counter.midi}:${counter.pitchIntent}`);
    if (memory) signature.push(`m${step}:${memory.role}`);
  }
  return Object.freeze(signature);
}
