/**
 * Atlas APU deterministic event planner.
 *
 * This module creates note and percussion events only. The browser audio graph
 * consumes the plan, which keeps musical logic testable without an AudioContext.
 */

import {
  chipIdentityForVoice,
  clamp,
  normalizedScoreState,
} from "./apu-palette.js";

export const APU_PHRASE_STEPS = 32;

const BASS_PATTERNS = Object.freeze({
  healthy: Object.freeze([0, 6, 8, 14, 16, 22, 24, 30]),
  warning: Object.freeze([0, 5, 8, 11, 14, 16, 21, 24, 27, 30]),
  critical: Object.freeze([0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30]),
  unknown: Object.freeze([0, 12, 16, 28]),
});

const BASS_DEGREES = Object.freeze({
  healthy: Object.freeze([0, 4, 5, 4]),
  warning: Object.freeze([0, 1, 4, 5, 1]),
  critical: Object.freeze([0, 1, 4, 1, 5, 1]),
  unknown: Object.freeze([0, 4, 0, 5]),
});

function safeScale(frame) {
  return Array.isArray(frame?.scale) && frame.scale.length ? frame.scale : [0, 2, 3, 5, 7, 8, 10, 12];
}

function wrappedStep(step) {
  return ((Math.trunc(step) % APU_PHRASE_STEPS) + APU_PHRASE_STEPS) % APU_PHRASE_STEPS;
}

export function rhythmEventsForStep(scoreState, step, density = 0.5) {
  const state = normalizedScoreState(scoreState);
  const position = wrappedStep(step);
  const boundedDensity = clamp(density, 0, 1);

  const kick = state === "critical"
    ? position % 8 === 0 || [6, 14, 22, 30].includes(position)
    : state === "warning"
      ? position % 8 === 0 || [14, 30].includes(position)
      : state === "unknown"
        ? position === 0 || position === 16
        : position % 8 === 0;

  const snare = state === "unknown"
    ? position === 12 || position === 28
    : position === 8 || position === 24;

  const hatStride = state === "critical" ? 2 : state === "warning" ? 2 : state === "unknown" ? 8 : 4;
  const hat = position % hatStride === hatStride - 1
    && (state !== "healthy" || boundedDensity >= 0.35 || position % 8 === 7);

  const noiseAccent = state === "critical"
    ? position === 15 || position === 31
    : state === "warning"
      ? position === 31
      : false;

  return Object.freeze({
    kick: kick ? Object.freeze({ velocity: state === "critical" ? 0.76 : state === "warning" ? 0.62 : state === "unknown" ? 0.34 : 0.52 }) : null,
    snare: snare ? Object.freeze({ velocity: state === "critical" ? 0.5 : state === "warning" ? 0.4 : state === "unknown" ? 0.2 : 0.32 }) : null,
    hat: hat ? Object.freeze({ velocity: state === "critical" ? 0.28 : state === "warning" ? 0.2 : state === "unknown" ? 0.08 : 0.14 }) : null,
    noiseAccent: noiseAccent ? Object.freeze({ velocity: state === "critical" ? 0.34 : 0.2 }) : null,
  });
}

export function bassEventForStep(frame = {}, plan = null, step = 0, phraseIndex = 0) {
  const state = normalizedScoreState(frame.scoreState);
  const position = wrappedStep(step);
  const pattern = BASS_PATTERNS[state];
  const eventIndex = pattern.indexOf(position);
  if (eventIndex === -1) return null;

  const degrees = BASS_DEGREES[state];
  const scale = safeScale(frame);
  const phraseOffset = Math.abs(Math.trunc(phraseIndex)) + Math.abs(Math.trunc(plan?.motifVariant ?? 0));
  const degree = degrees[(eventIndex + phraseOffset) % degrees.length];
  const midi = 29 + scale[degree % scale.length];

  return Object.freeze({
    midi: clamp(midi, 27, 48),
    duration: state === "unknown" ? "4n" : state === "critical" ? "16n" : "8n",
    velocity: state === "critical" ? 0.68 : state === "warning" ? 0.58 : state === "unknown" ? 0.34 : 0.5,
  });
}

export function padChordForStep(frame = {}, plan = null, step = 0, phraseIndex = 0) {
  const position = wrappedStep(step);
  if (position !== 0 && position !== 16) return null;
  const state = normalizedScoreState(frame.scoreState);
  const scale = safeScale(frame);
  const rootDegree = (Math.abs(Math.trunc(phraseIndex)) + (position === 16 ? 3 : 0)) % 6;
  const chordDegrees = state === "critical"
    ? [rootDegree, rootDegree + 1, rootDegree + 4]
    : state === "warning"
      ? [rootDegree, rootDegree + 1, rootDegree + 5]
      : state === "unknown"
        ? [rootDegree, rootDegree + 3]
        : [rootDegree, rootDegree + 3, rootDegree + 6];
  const rootMidi = state === "unknown" ? 48 : 53;
  const midis = chordDegrees.map((degree) => {
    const octave = Math.floor(degree / scale.length) * 12;
    return clamp(rootMidi + scale[((degree % scale.length) + scale.length) % scale.length] + octave, 45, 72);
  });

  return Object.freeze({
    midis: Object.freeze(midis),
    duration: state === "critical" ? "2n" : "1m",
    velocity: state === "unknown" ? 0.16 : state === "critical" ? 0.22 : 0.26,
  });
}

export function secondaryPulseEventForStep(frame = {}, plan = null, step = 0, phraseIndex = 0) {
  const state = normalizedScoreState(frame.scoreState);
  const position = wrappedStep(step);
  const active = state === "critical"
    ? position % 4 === 2
    : state === "warning"
      ? [6, 14, 22, 30].includes(position)
      : state === "unknown"
        ? position === 20
        : [4, 12, 20, 28].includes(position);
  if (!active) return null;

  const scale = safeScale(frame);
  const degree = (Math.abs(Math.trunc(plan?.motifVariant ?? 0)) + phraseIndex + position / 2) % scale.length;
  return Object.freeze({
    midi: clamp(60 + scale[Math.trunc(degree)], 58, 79),
    duration: state === "critical" ? "32n" : "16n",
    velocity: state === "critical" ? 0.38 : state === "warning" ? 0.3 : state === "unknown" ? 0.14 : 0.24,
  });
}

export function serviceEventForStep(frame = {}, step = 0, phraseIndex = 0) {
  const voices = Array.isArray(frame.voices) ? frame.voices : [];
  if (!voices.length) return null;
  const state = normalizedScoreState(frame.scoreState);
  const position = wrappedStep(step);
  const stride = state === "critical" ? 2 : state === "warning" ? 4 : state === "unknown" ? 8 : 4;
  if (position % stride !== (state === "unknown" ? 4 : 2) % stride) return null;

  const voiceIndex = (Math.abs(Math.trunc(phraseIndex)) * 7 + position * 3) % voices.length;
  const voice = voices[voiceIndex];
  if (!voice) return null;
  if (!voice.measured && state !== "unknown" && position % 8 !== 2) return null;

  const motif = Array.isArray(voice.motifMidi) && voice.motifMidi.length
    ? voice.motifMidi
    : [voice.registerMidi ?? 53];
  const motifIndex = (Math.abs(Math.trunc(phraseIndex)) + position + (voice.hash ?? 0)) % motif.length;
  const identity = chipIdentityForVoice(voice);
  const midi = clamp(motif[motifIndex] + identity.octaveOffset, 32, 84);

  return Object.freeze({
    voice,
    identity,
    midi,
    duration: identity.shortGate ? "32n" : state === "unknown" ? "8n" : "16n",
    velocity: clamp((voice.velocity ?? 0.3) * (voice.measured ? 0.78 : 0.38), 0.08, 0.46),
  });
}

function hashText(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deploymentSequence(frame = {}, identity = "deployment") {
  const scale = safeScale(frame);
  const hash = hashText(identity);
  const root = 65 + (hash % 3);
  const degrees = [0, 2, 4, 6, 4, 7];
  return Object.freeze(degrees.map((degree, index) => Object.freeze({
    offset: index,
    midi: clamp(root + scale[degree % scale.length] + (index === degrees.length - 1 ? 12 : 0), 60, 88),
    duration: index === degrees.length - 1 ? "4n" : "16n",
    velocity: index === degrees.length - 1 ? 0.46 : 0.34,
  })));
}

export function incidentSequence(frame = {}, count = 1) {
  const scale = safeScale(frame);
  const boundedCount = Math.max(1, Math.min(4, Math.trunc(count) || 1));
  return Object.freeze(Array.from({ length: boundedCount * 2 }, (_, index) => Object.freeze({
    offset: index,
    midi: clamp(53 + scale[(index % 2 === 0 ? 1 : 4) % scale.length], 48, 72),
    duration: "32n",
    velocity: index % 2 === 0 ? 0.44 : 0.32,
  })));
}
