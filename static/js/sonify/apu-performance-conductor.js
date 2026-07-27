import {
  APU_PERFORMANCE_CONDUCTOR_BUILD_ID as D1A_PERFORMANCE_CONDUCTOR_BUILD_ID,
  describeConductor,
  ornamentInstructionsForPhrase as d1aOrnamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase as d1aShouldOmitForPhase,
  supplementalRhythmForDensity,
} from "./apu-performance-conductor-d1a-baseline.js?v=20260727-system-symphony-pass-d1a-state-orchestration-v1";
import {
  APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  arpeggioInstructionsForPhrase,
  arpeggioPlanForPhrase,
} from "./apu-arpeggio-composer-d4.js?v=20260727-system-symphony-pass-d4-arpeggio-composer-v3";
import {
  isPeakPhraseIndex,
  isPrePeakCutoutStep,
  peakRegisterShiftForState,
  prePeakCutoutStartStep,
} from "./apu-signature-gestures-d3.js?v=20260727-system-symphony-pass-d3-signature-gestures-v1";

export {
  arpeggioPlanForPhrase,
  describeConductor,
  performanceCategories,
  supplementalRhythmForDensity,
};

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID =
  D1A_PERFORMANCE_CONDUCTOR_BUILD_ID;
export const APU_D3_LISTENER_POLISH_BUILD_ID =
  "20260727-system-symphony-pass-d3-listener-polish-v4";
export const APU_D4_ARPEGGIO_PERFORMANCE_BUILD_ID =
  APU_ARPEGGIO_COMPOSER_D4_BUILD_ID;

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

function isExplorerPlan(perfPlan = {}) {
  return perfPlan?.state === "healthy";
}

export function shouldOmitForPhase(args = {}) {
  if (isPrePeakCutoutStep(args.perfPlan, args.stepIndex)) {
    // Explorer's listener-approved transition removes only bass. The darker
    // states retain their existing state-specific pre-Peak treatment.
    if (isExplorerPlan(args.perfPlan)) return args.category === "bass";
    return true;
  }
  if (args.category === "primary" && isPeakPlan(args.perfPlan)) return false;

  // D4 arpeggios are additive ornaments. They never create silence, replace
  // the melody or change any omission decision.
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

function polishedLegacyInstruction(perfPlan, instruction) {
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

function preparedComposedInstruction(instruction) {
  return withListenerMetadata(instruction, {
    audibleTimbreVoice: instruction.voice,
    additive: true,
  });
}

function baselineInstructionsForPhrase(perfPlan, instructions) {
  const state = perfPlan?.state ?? "unknown";
  const cutoutStart = prePeakCutoutStartStep(perfPlan);
  const d4Plan = arpeggioPlanForPhrase(perfPlan);

  return instructions
    // D4 is the only active arp author. Earlier connective and state arps are
    // removed to prevent duplicate note clouds, while every non-arp score layer
    // remains untouched.
    .filter((instruction) => !["connective-arp", "state-arp"].includes(instruction.ornament))
    .filter((instruction) => !(d4Plan.active && instruction.ornament === "shimmer"))
    .filter((instruction) => !(
      state === "healthy"
      && isPeakPlan(perfPlan)
      && instruction.ornament === "explorer-sparkle-answer"
    ))
    .filter((instruction) => !(
      state !== "healthy"
      && Number.isFinite(cutoutStart)
      && Number.isFinite(instruction.offsetSteps)
      && instruction.offsetSteps >= cutoutStart
    ))
    .map((instruction) => polishedLegacyInstruction(perfPlan, instruction));
}

export function connectiveArpeggioInstructionsForPhrase(perfPlan) {
  return arpeggioInstructionsForPhrase(perfPlan);
}

export function ornamentInstructionsForPhrase(perfPlan) {
  const baseline = d1aOrnamentInstructionsForPhrase(perfPlan);
  const polishedLegacy = baselineInstructionsForPhrase(perfPlan, baseline);
  const composedArpeggios = arpeggioInstructionsForPhrase(perfPlan);
  return Object.freeze([
    ...polishedLegacy,
    ...composedArpeggios.map((instruction) => preparedComposedInstruction(instruction)),
  ]);
}
