import {
  APU_TRACK_STEPS,
  quantizeMidiToHarmony,
} from "./apu-track-sequencer-d2-baseline.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import {
  APU_TRANSITION_LANGUAGE_BUILD_ID,
  transitionForStates,
} from "./apu-transition-language.js?v=20260728-system-symphony-transition-language-v1";

export const APU_TRANSITION_EVENTS_BUILD_ID =
  "20260728-system-symphony-transition-events-v1";

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

function transitionDelta(transition, absoluteStepIndex, plan) {
  if (!Number.isFinite(absoluteStepIndex) || !Number.isFinite(transition?.stepIndex)) return null;
  const delta = Math.trunc(absoluteStepIndex) - Math.trunc(transition.stepIndex);
  return delta >= 0 && delta < plan.durationSteps ? delta : null;
}

function transitionNote(midi, duration, velocity, voice = "incident") {
  return Object.freeze({
    voice,
    midi,
    duration,
    velocity: clamp(velocity, 0.04, 0.46),
  });
}

function transitionNoise(duration, velocity) {
  return Object.freeze({
    duration,
    velocity: clamp(velocity, 0.04, 0.24),
  });
}

function noteAt(frame, arrangement, position, target, minimum = 48, maximum = 84) {
  return quantizeMidiToHarmony(frame, arrangement, position, target, minimum, maximum);
}

function pressureRamp(frame, arrangement, position, delta, type = "pressure-ramp") {
  const steps = [0, 3, 6, 9, 14];
  const index = steps.indexOf(delta);
  if (index === -1) return null;
  const target = 65 + (index % 2 === 0 ? 0 : 1) + index;
  return Object.freeze({
    type,
    notes: Object.freeze([
      transitionNote(noteAt(frame, arrangement, position, target), "32n", 0.2 + index * 0.025),
    ]),
    noise: [9, 14].includes(delta) ? transitionNoise("32n", 0.12 + index * 0.015) : null,
  });
}

function interruptDrop(frame, arrangement, position, delta, type = "interrupt-drop") {
  if (![0, 1, 4, 8].includes(delta)) return null;
  const lowMidi = noteAt(frame, arrangement, position, 41, 27, 55);
  return Object.freeze({
    type,
    bassDrop: delta === 0
      ? Object.freeze({ midi: Math.max(24, lowMidi - 12), duration: "16n", velocity: 0.3 })
      : null,
    notes: delta <= 1
      ? Object.freeze([
        transitionNote(noteAt(frame, arrangement, position, 53 + delta * 6, 48, 72), "32n", 0.34),
      ])
      : Object.freeze([
        transitionNote(noteAt(frame, arrangement, position, 41 + delta, 36, 64), "32n", 0.22),
      ]),
    noise: transitionNoise(delta === 0 ? 0.095 : "32n", delta === 0 ? 0.22 : 0.14),
  });
}

function recoveryBloom(frame, arrangement, position, delta) {
  const steps = [0, 2, 4, 6, 10, 14];
  const index = steps.indexOf(delta);
  if (index === -1) return null;
  return Object.freeze({
    type: "recovery-bloom",
    notes: Object.freeze([
      transitionNote(
        noteAt(frame, arrangement, position, 60 + index * 3, 55, 88),
        index === steps.length - 1 ? "8n" : "16n",
        0.22 + index * 0.032,
        "deployment",
      ),
    ]),
    noise: index === 0 ? transitionNoise("32n", 0.08) : null,
  });
}

function pressureRelease(frame, arrangement, position, delta) {
  const steps = [0, 4, 8, 12];
  const index = steps.indexOf(delta);
  if (index === -1) return null;
  const offsets = [9, 6, 3, 0];
  return Object.freeze({
    type: "pressure-release",
    notes: Object.freeze([
      transitionNote(
        noteAt(frame, arrangement, position, 60 + offsets[index], 52, 84),
        index === steps.length - 1 ? "8n" : "16n",
        0.25 - index * 0.025,
        "deployment",
      ),
    ]),
    noise: index === 0 ? transitionNoise("32n", 0.1) : null,
  });
}

function carrierResolve(frame, arrangement, position, delta, pressured = false) {
  const steps = [0, 4, 8, 12];
  const index = steps.indexOf(delta);
  if (index === -1) return null;
  return Object.freeze({
    type: pressured ? "carrier-resolve-pressure" : "carrier-resolve",
    notes: Object.freeze([
      transitionNote(
        noteAt(frame, arrangement, position, 53 + index * 5, 48, 84),
        index === steps.length - 1 ? "8n" : "16n",
        0.18 + index * 0.04,
        index === steps.length - 1 && pressured ? "incident" : "deployment",
      ),
    ]),
    noise: index === 0 ? transitionNoise("16n", pressured ? 0.12 : 0.1) : null,
  });
}

function dropout(frame, arrangement, position, delta, type) {
  const profiles = {
    "melody-dropout": { steps: [0, 5, 10, 15], target: 65, start: 0.1, end: 0.16 },
    "pressure-dropout": { steps: [0, 3, 7, 11, 15], target: 60, start: 0.12, end: 0.18 },
    "alarm-dropout": { steps: [0, 2, 6, 10, 15], target: 53, start: 0.18, end: 0.1 },
  };
  const profile = profiles[type];
  const index = profile.steps.indexOf(delta);
  if (index === -1) return null;
  const progress = profile.steps.length === 1 ? 1 : index / (profile.steps.length - 1);
  const velocity = profile.start + (profile.end - profile.start) * progress;
  return Object.freeze({
    type,
    notes: index === 0
      ? Object.freeze([
        transitionNote(noteAt(frame, arrangement, position, profile.target, 48, 80), "32n", 0.18),
      ])
      : Object.freeze([]),
    noise: transitionNoise(delta === 15 ? "16n" : "32n", velocity),
  });
}

export function transitionEventForTrackStep(
  frame = {},
  arrangement = null,
  step = 0,
  transitionState = null,
  absoluteStepIndex = null,
) {
  const plan = transitionForStates(transitionState?.from, transitionState?.to);
  if (plan.id === "steady-state") return null;
  const delta = transitionDelta(transitionState, absoluteStepIndex, plan);
  if (delta === null) return null;
  const position = wrappedStep(step);

  if (plan.id === "pressure-ramp") return pressureRamp(frame, arrangement, position, delta);
  if (plan.id === "interrupt-drop") return interruptDrop(frame, arrangement, position, delta);
  if (plan.id === "carrier-interrupt") return interruptDrop(frame, arrangement, position, delta, "carrier-interrupt");
  if (plan.id === "recovery-bloom") return recoveryBloom(frame, arrangement, position, delta);
  if (plan.id === "pressure-release") return pressureRelease(frame, arrangement, position, delta);
  if (plan.id === "carrier-resolve") return carrierResolve(frame, arrangement, position, delta, false);
  if (plan.id === "carrier-resolve-pressure") return carrierResolve(frame, arrangement, position, delta, true);
  if (["melody-dropout", "pressure-dropout", "alarm-dropout"].includes(plan.id)) {
    return dropout(frame, arrangement, position, delta, plan.id);
  }

  if (![0, 8].includes(delta)) return null;
  return Object.freeze({
    type: plan.id,
    notes: Object.freeze([
      transitionNote(noteAt(frame, arrangement, position, 65), "16n", 0.16, "deployment"),
    ]),
    noise: delta === 0 ? transitionNoise("32n", 0.08) : null,
  });
}

export function transitionEventsMetadata() {
  return Object.freeze({
    buildId: APU_TRANSITION_EVENTS_BUILD_ID,
    languageBuildId: APU_TRANSITION_LANGUAGE_BUILD_ID,
  });
}
