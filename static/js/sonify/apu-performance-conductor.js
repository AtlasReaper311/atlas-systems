import {
  APU_PERFORMANCE_CONDUCTOR_BUILD_ID as D1A_PERFORMANCE_CONDUCTOR_BUILD_ID,
  connectiveArpeggioInstructionsForPhrase as d1aConnectiveArpeggioInstructionsForPhrase,
  describeConductor,
  ornamentInstructionsForPhrase as d1aOrnamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase as d1aShouldOmitForPhase,
  supplementalRhythmForDensity,
} from "./apu-performance-conductor-d1a-baseline.js?v=20260727-system-symphony-pass-d1a-state-orchestration-v1";
import {
  APU_D3_SIGNATURE_GESTURE_BUILD_ID,
  isPeakPhraseIndex,
  isPrePeakCutoutStep,
  peakRegisterShiftForState,
  prePeakCutoutStartStep,
  signatureGestureInstructionsForPhrase,
} from "./apu-signature-gestures-d3.js?v=20260727-system-symphony-pass-d3-signature-gestures-v1";

export {
  describeConductor,
  performanceCategories,
  supplementalRhythmForDensity,
};

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID =
  D1A_PERFORMANCE_CONDUCTOR_BUILD_ID;
export const APU_D3_LISTENER_POLISH_BUILD_ID =
  "20260727-system-symphony-pass-d3-listener-polish-v3";

const DENSITY_TARGETS = Object.freeze({
  rhythm: Object.freeze({ min: 0.72, max: 0.9 }),
  bass: Object.freeze({ min: 0.78, max: 0.92 }),
  pad: Object.freeze({ min: 0.78, max: 0.92 }),
  primary: Object.freeze({ min: 0.82, max: 0.96 }),
  secondary: Object.freeze({ min: 0.74, max: 0.92 }),
  service: Object.freeze({ min: 0.74, max: 0.9 }),
  accent: Object.freeze({ min: 0.7, max: 0.9 }),
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

function isPeakPlan(perfPlan = {}) {
  return isPeakPhraseIndex(perfPlan.phraseIndex ?? 0);
}

export function shouldOmitForPhase(args = {}) {
  if (isPrePeakCutoutStep(args.perfPlan, args.stepIndex)) return true;
  if (args.category === "primary" && isPeakPlan(args.perfPlan)) return false;
  return d1aShouldOmitForPhase(args);
}

export function velocityScaleForDensity(perfPlan, category) {
  if (!perfPlan) return 1;
  const density = clamp(perfPlan.density, 0, 1);
  const range = DENSITY_TARGETS[category] ?? Object.freeze({ min: 0.76, max: 0.92 });
  return clamp(range.min + (range.max - range.min) * density, 0.1, 1);
}

function lowerExplorerRegister(midiOffset) {
  if (!Number.isFinite(midiOffset)) return midiOffset;
  let lowered = Number(midiOffset);
  while (lowered > 12) lowered -= 12;
  return lowered;
}

function withListenerMetadata(instruction, overrides = {}) {
  return Object.freeze({
    ...instruction,
    ...overrides,
    listenerPolishBuildId: APU_D3_LISTENER_POLISH_BUILD_ID,
  });
}

function polishedInstruction(perfPlan, instruction) {
  const melodic = instruction.voice === "primary" || instruction.voice === "secondary";
  const state = perfPlan?.state ?? "unknown";

  if (isPeakPlan(perfPlan) && melodic && Number.isFinite(instruction.midiOffset)) {
    const registerShift = peakRegisterShiftForState(state);
    if (registerShift === 0) return instruction;
    return withListenerMetadata(instruction, {
      midiOffset: Number(instruction.midiOffset) + registerShift,
      register: "peak-warm-state",
      registerAdjustmentSemitones: registerShift,
    });
  }

  if (state === "healthy" && melodic && Number.isFinite(instruction.midiOffset)) {
    return withListenerMetadata(instruction, {
      midiOffset: lowerExplorerRegister(instruction.midiOffset),
      register: instruction.register === "bright-wide" ? "bright-mid" : instruction.register,
    });
  }

  return instruction;
}

function baselineInstructionsForPhrase(perfPlan, instructions) {
  const state = perfPlan?.state ?? "unknown";
  const cutoutStart = prePeakCutoutStartStep(perfPlan);
  const signatureMoment = signatureGestureInstructionsForPhrase(perfPlan).length > 0;

  return instructions
    // Keep the legacy ornament vocabulary, but suppress a selected shimmer at
    // the three guaranteed signature moments so two lead arcs never stack.
    .filter((instruction) => !(signatureMoment && instruction.ornament === "shimmer"))
    // Explorer Peak keeps the complete approved lead without the later D1A overlay.
    .filter((instruction) => !(
      state === "healthy"
      && isPeakPlan(perfPlan)
      && ["state-arp", "explorer-sparkle-answer"].includes(instruction.ornament)
    ))
    // The pre-Peak void is a real performance cutout, including ornaments.
    .filter((instruction) => !(
      Number.isFinite(cutoutStart)
      && Number.isFinite(instruction.offsetSteps)
      && instruction.offsetSteps >= cutoutStart
    ))
    .map((instruction) => polishedInstruction(perfPlan, instruction));
}

export function connectiveArpeggioInstructionsForPhrase(perfPlan) {
  const baseline = d1aConnectiveArpeggioInstructionsForPhrase(perfPlan);
  return Object.freeze(baselineInstructionsForPhrase(perfPlan, baseline));
}

export function ornamentInstructionsForPhrase(perfPlan) {
  const baseline = d1aOrnamentInstructionsForPhrase(perfPlan);
  const polished = baselineInstructionsForPhrase(perfPlan, baseline);
  const signatures = signatureGestureInstructionsForPhrase(perfPlan);
  return Object.freeze([
    ...polished,
    ...signatures.map((instruction) => withListenerMetadata(instruction, {
      signatureGestureBuildId: APU_D3_SIGNATURE_GESTURE_BUILD_ID,
    })),
  ]);
}
