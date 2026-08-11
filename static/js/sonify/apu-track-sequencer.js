import {
  APU_TRACK_STEPS,
  TONIC_MIDI,
  bassEventForTrackStep as baselineBassEventForTrackStep,
  foldMidi,
  normalizedScale,
  padChordForTrackStep as baselinePadChordForTrackStep,
  primaryPulseEventForTrackStep as baselinePrimaryPulseEventForTrackStep,
  quantizeMidiToHarmony,
  rhythmEventsForTrackStep as baselineRhythmEventsForTrackStep,
  scaleMidi,
  secondaryPulseEventForTrackStep as baselineSecondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
} from "./apu-track-sequencer-d2-baseline.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import {
  transitionEventForTrackStep,
} from "./apu-transition-events.js?v=20260728-system-symphony-transition-events-v1";
import {
  shouldOmitEvent,
} from "./apu-state-identities.js?v=20260728-system-symphony-state-identities-v8";
import {
  peakRegisterShiftForState,
} from "./apu-signature-gestures-d3.js?v=20260727-system-symphony-pass-d3-signature-gestures-v1";

export {
  APU_TRACK_STEPS,
  TONIC_MIDI,
  foldMidi,
  normalizedScale,
  quantizeMidiToHarmony,
  scaleMidi,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
};

export const APU_UNKNOWN_SEQUENCER_BUILD_ID = "20260728-system-symphony-lost-signal-sequencer-v1";

const UNKNOWN_PRIMARY_STEPS = Object.freeze([0, 6, 12, 21, 28]);
const UNKNOWN_ECHO_STEPS = Object.freeze([4, 10, 16, 25]);
const UNKNOWN_CARRIER_STEPS = Object.freeze([7, 15, 23, 31]);
const UNKNOWN_STRUCTURAL_SECTIONS = new Set(["intro", "release", "breathe"]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const wrappedStep = (step) => (
  ((Math.trunc(step) % APU_TRACK_STEPS) + APU_TRACK_STEPS) % APU_TRACK_STEPS
);

function peakRegisterShift(frame = {}, arrangement = null) {
  if (arrangement?.section !== "peak") return 0;
  return peakRegisterShiftForState(frame?.scoreState);
}

function shiftLeadRegister(event, semitones) {
  if (!event || !Number.isFinite(event.midi) || semitones === 0) return event;
  return Object.freeze({
    ...event,
    midi: event.midi + semitones,
    registerAdjustmentSemitones: semitones,
  });
}

function unknownOmitted(arrangement, step, serviceHash, preserveAnchor = false) {
  if (preserveAnchor) return false;
  const position = wrappedStep(step);
  return shouldOmitEvent({
    state: "unknown",
    barIndex: (arrangement?.cycleBarStart ?? 1) - 1 + (position >= 16 ? 1 : 0),
    stepIndex: position,
    serviceHash,
    phraseIndex: arrangement?.phraseIndex ?? 0,
  });
}

function unknownPrimaryEvent(frame, arrangement, step) {
  const position = wrappedStep(step);
  const eventIndex = UNKNOWN_PRIMARY_STEPS.indexOf(position);
  if (eventIndex === -1) return null;
  const motif = Array.isArray(arrangement?.motifDegrees) && arrangement.motifDegrees.length
    ? arrangement.motifDegrees
    : [0, 2, 0, 4, 2];
  const degree = motif[eventIndex % motif.length];
  const target = scaleMidi(normalizedScale(frame), 62, degree);
  return Object.freeze({
    midi: quantizeMidiToHarmony(frame, arrangement, position, target, 52, 88),
    duration: arrangement?.stateIdentity?.leadGate ?? "2n",
    velocity: clamp(0.2 + (arrangement?.mix?.primary ?? 0) * 0.3, 0.14, 0.56),
    dutyCycle: arrangement?.stateIdentity?.primaryDutyCycle ?? 0.5,
    questionTheme: true,
  });
}

function unknownSecondaryEvent(frame, arrangement, step) {
  if (UNKNOWN_STRUCTURAL_SECTIONS.has(arrangement?.section)) return null;
  const position = wrappedStep(step);
  const eventIndex = UNKNOWN_ECHO_STEPS.indexOf(position);
  if (eventIndex === -1 || unknownOmitted(arrangement, step, 79, eventIndex === 0)) return null;
  const motif = Array.isArray(arrangement?.motifDegrees) && arrangement.motifDegrees.length
    ? arrangement.motifDegrees
    : [0, 2, 0, 4, 2];
  const degree = motif[eventIndex % motif.length];
  const target = scaleMidi(normalizedScale(frame), 55, degree);
  return Object.freeze({
    midi: quantizeMidiToHarmony(frame, arrangement, position, target, 50, 84),
    duration: "4n",
    velocity: clamp(0.06 + (arrangement?.mix?.secondary ?? 0) * 0.2, 0.05, 0.28),
    dutyCycle: 0.25,
    ghostEcho: true,
  });
}

function rhythmVelocity(arrangement, base) {
  return clamp(base * (0.78 + (arrangement?.energy ?? 0.4) * 0.22), 0.04, 0.92);
}

export function rhythmEventsForTrackStep(frame = {}, arrangement = null, step = 0) {
  if (frame?.scoreState !== "unknown") {
    return baselineRhythmEventsForTrackStep(frame, arrangement, step);
  }

  const position = wrappedStep(step);
  if (UNKNOWN_STRUCTURAL_SECTIONS.has(arrangement?.section)) {
    return baselineRhythmEventsForTrackStep(frame, arrangement, step);
  }

  const kick = position === 0 || position === 16;
  const carrier = UNKNOWN_CARRIER_STEPS.includes(position)
    && !unknownOmitted(arrangement, step, 31, position === UNKNOWN_CARRIER_STEPS[0]);

  return Object.freeze({
    kick: kick ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.34), carrierHeartbeat: true }) : null,
    snare: null,
    hat: null,
    openHat: null,
    noiseAccent: carrier ? Object.freeze({ velocity: rhythmVelocity(arrangement, 0.16), carrierTick: true }) : null,
  });
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const baseline = frame?.scoreState === "unknown"
    ? unknownPrimaryEvent(frame, arrangement, step)
    : baselinePrimaryPulseEventForTrackStep(frame, arrangement, step);
  return shiftLeadRegister(baseline, peakRegisterShift(frame, arrangement));
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const baseline = frame?.scoreState === "unknown"
    ? unknownSecondaryEvent(frame, arrangement, step)
    : baselineSecondaryPulseEventForTrackStep(frame, arrangement, step);
  return shiftLeadRegister(baseline, peakRegisterShift(frame, arrangement));
}

export function bassEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const baseline = baselineBassEventForTrackStep(frame, arrangement, step);
  if (!baseline) return null;
  const scale = clamp(arrangement?.harmonicJourney?.bassVelocityScale ?? 1, 0.9, 1);
  if (scale === 1) return baseline;
  return Object.freeze({
    ...baseline,
    // Listener-led D3 carry-forward: Boss weight should not depend on excess
    // low-end level. Pitch and rhythm remain unchanged.
    velocity: clamp(baseline.velocity * scale, 0.18, 0.78),
  });
}

export function padChordForTrackStep(frame = {}, arrangement = null, step = 0) {
  const baseline = baselinePadChordForTrackStep(frame, arrangement, step);
  if (!baseline) return null;
  const half = ((Math.trunc(step) % APU_TRACK_STEPS) + APU_TRACK_STEPS) % APU_TRACK_STEPS < 16 ? 0 : 1;
  const voiced = arrangement?.supportVoicings?.[half]?.midi;
  if (!Array.isArray(voiced) || voiced.length < 2) return baseline;
  return Object.freeze({
    ...baseline,
    midis: Object.freeze([...voiced]),
    harmonicRegion: arrangement?.harmonicRegion ?? null,
    cadenceIntent: arrangement?.cadenceIntent ?? null,
  });
}
