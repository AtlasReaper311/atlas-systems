import {
  APU_TRACK_STEPS,
  TONIC_MIDI,
  bassEventForTrackStep as baselineBassEventForTrackStep,
  foldMidi,
  normalizedScale,
  padChordForTrackStep as baselinePadChordForTrackStep,
  primaryPulseEventForTrackStep as baselinePrimaryPulseEventForTrackStep,
  quantizeMidiToHarmony,
  rhythmEventsForTrackStep,
  scaleMidi,
  secondaryPulseEventForTrackStep as baselineSecondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
} from "./apu-track-sequencer-d2-baseline.js?v=20260726-system-symphony-atlas-chip-laws-v3";

export {
  APU_TRACK_STEPS,
  TONIC_MIDI,
  foldMidi,
  normalizedScale,
  quantizeMidiToHarmony,
  rhythmEventsForTrackStep,
  scaleMidi,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
};

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

function isExplorerPeak(frame = {}, arrangement = null) {
  return frame?.scoreState === "healthy" && arrangement?.section === "peak";
}

function lowerLeadOneOctave(event) {
  if (!event || !Number.isFinite(event.midi)) return event;
  return Object.freeze({
    ...event,
    midi: event.midi - 12,
    registerAdjustmentSemitones: -12,
  });
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const baseline = baselinePrimaryPulseEventForTrackStep(frame, arrangement, step);
  return isExplorerPeak(frame, arrangement) ? lowerLeadOneOctave(baseline) : baseline;
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  const baseline = baselineSecondaryPulseEventForTrackStep(frame, arrangement, step);
  return isExplorerPeak(frame, arrangement) ? lowerLeadOneOctave(baseline) : baseline;
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
