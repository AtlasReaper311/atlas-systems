import {
  APU_PERFORMANCE_CONDUCTOR_BUILD_ID as D1A_PERFORMANCE_CONDUCTOR_BUILD_ID,
  connectiveArpeggioInstructionsForPhrase as d1aConnectiveArpeggioInstructionsForPhrase,
  describeConductor,
  ornamentInstructionsForPhrase as d1aOrnamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase,
  supplementalRhythmForDensity,
} from "./apu-performance-conductor-d1a-baseline.js?v=20260727-system-symphony-pass-d1a-state-orchestration-v1";

export {
  describeConductor,
  performanceCategories,
  shouldOmitForPhase,
  supplementalRhythmForDensity,
};

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID =
  D1A_PERFORMANCE_CONDUCTOR_BUILD_ID;
export const APU_D3_LISTENER_POLISH_BUILD_ID =
  "20260727-system-symphony-pass-d3-listener-polish-v1";

const DENSITY_TARGETS = Object.freeze({
  rhythm: Object.freeze({ min: 0.72, max: 0.9 }),
  bass: Object.freeze({ min: 0.78, max: 0.92 }),
  pad: Object.freeze({ min: 0.78, max: 0.92 }),
  primary: Object.freeze({ min: 0.82, max: 0.96 }),
  secondary: Object.freeze({ min: 0.74, max: 0.92 }),
  service: Object.freeze({ min: 0.74, max: 0.9 }),
  accent: Object.freeze({ min: 0.7, max: 0.9 }),
});

const EXPLORER_HANDOFF_PHRASE = 4;
const EXPLORER_PEAK_PHRASES = Object.freeze([11, 12]);
const EXPLORER_HANDOFF_CONTOUR = Object.freeze([0, 4, 7, 12, 7, 4]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;

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

function explorerInstruction(instruction, overrides = {}) {
  const melodic = instruction.voice === "primary" || instruction.voice === "secondary";
  return Object.freeze({
    ...instruction,
    ...(melodic && Number.isFinite(instruction.midiOffset)
      ? { midiOffset: lowerExplorerRegister(instruction.midiOffset) }
      : {}),
    ...overrides,
    listenerPolishBuildId: APU_D3_LISTENER_POLISH_BUILD_ID,
  });
}

function polishExplorerInstructions(perfPlan, instructions) {
  const phraseIndex = Math.max(0, Math.trunc(perfPlan?.phraseIndex ?? 0));
  const cyclePhrase = modulo(phraseIndex, 16);

  const audible = EXPLORER_PEAK_PHRASES.includes(cyclePhrase)
    ? instructions.filter((instruction) => ![
      "state-arp",
      "explorer-sparkle-answer",
    ].includes(instruction.ornament))
    : instructions;

  let stateArpIndex = 0;
  return Object.freeze(audible.map((instruction) => {
    if (
      cyclePhrase === EXPLORER_HANDOFF_PHRASE
      && instruction.ornament === "state-arp"
    ) {
      const index = stateArpIndex;
      stateArpIndex += 1;
      return explorerInstruction(instruction, {
        offsetSteps: 18 + index * 2,
        midiOffset: EXPLORER_HANDOFF_CONTOUR[index % EXPLORER_HANDOFF_CONTOUR.length],
        velocity: Number(Math.min(0.21, instruction.velocity ?? 0.21).toFixed(3)),
        arpFunction: "theme-a-to-variation-handoff",
        register: "bright-mid",
      });
    }
    return explorerInstruction(instruction, {
      register: instruction.register === "bright-wide" ? "bright-mid" : instruction.register,
    });
  }));
}

export function connectiveArpeggioInstructionsForPhrase(perfPlan) {
  const baseline = d1aConnectiveArpeggioInstructionsForPhrase(perfPlan);
  if (perfPlan?.state !== "healthy") return baseline;
  return Object.freeze(baseline.map((instruction) => explorerInstruction(instruction, {
    register: "bright-mid",
  })));
}

export function ornamentInstructionsForPhrase(perfPlan) {
  const baseline = d1aOrnamentInstructionsForPhrase(perfPlan);
  if (perfPlan?.state !== "healthy") return baseline;
  return polishExplorerInstructions(perfPlan, baseline);
}
