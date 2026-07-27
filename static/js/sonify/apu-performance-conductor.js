import {
  APU_PERFORMANCE_CONDUCTOR_BUILD_ID as D1A_PERFORMANCE_CONDUCTOR_BUILD_ID,
  connectiveArpeggioInstructionsForPhrase as d1aConnectiveArpeggioInstructionsForPhrase,
  describeConductor,
  ornamentInstructionsForPhrase as d1aOrnamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase as d1aShouldOmitForPhase,
  supplementalRhythmForDensity,
} from "./apu-performance-conductor-d1a-baseline.js?v=20260727-system-symphony-pass-d1a-state-orchestration-v1";

export {
  describeConductor,
  performanceCategories,
  supplementalRhythmForDensity,
};

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID =
  D1A_PERFORMANCE_CONDUCTOR_BUILD_ID;
export const APU_D3_LISTENER_POLISH_BUILD_ID =
  "20260727-system-symphony-pass-d3-listener-polish-v2";

const DENSITY_TARGETS = Object.freeze({
  rhythm: Object.freeze({ min: 0.72, max: 0.9 }),
  bass: Object.freeze({ min: 0.78, max: 0.92 }),
  pad: Object.freeze({ min: 0.78, max: 0.92 }),
  primary: Object.freeze({ min: 0.82, max: 0.96 }),
  secondary: Object.freeze({ min: 0.74, max: 0.92 }),
  service: Object.freeze({ min: 0.74, max: 0.9 }),
  accent: Object.freeze({ min: 0.7, max: 0.9 }),
});

const EXPLORER_THEME_A_HANDOFF_PHRASE = 4;
const EXPLORER_PEAK_PHRASES = Object.freeze([11, 12]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;

function isExplorerPeakPlan(perfPlan = {}) {
  return perfPlan.state === "healthy"
    && EXPLORER_PEAK_PHRASES.includes(modulo(perfPlan.phraseIndex ?? 0, 16));
}

export function shouldOmitForPhase(args = {}) {
  if (args.category === "primary" && isExplorerPeakPlan(args.perfPlan)) return false;
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
  const cyclePhrase = modulo(perfPlan?.phraseIndex ?? 0, 16);
  const explorerPeak = EXPLORER_PEAK_PHRASES.includes(cyclePhrase);

  const audible = explorerPeak
    ? instructions.filter((instruction) => ![
      "state-arp",
      "explorer-sparkle-answer",
    ].includes(instruction.ornament))
    : instructions;

  return Object.freeze(audible.map((instruction) => {
    const melodic = instruction.voice === "primary" || instruction.voice === "secondary";

    // PR #128's authored shimmer is the high, fast descending lead arc at the
    // end of Theme A. Preserve its exact register, timing and contour.
    if (
      cyclePhrase === EXPLORER_THEME_A_HANDOFF_PHRASE
      && instruction.ornament === "shimmer"
    ) {
      return Object.freeze({
        ...instruction,
        register: "bright-high-transition",
        listenerPolishBuildId: APU_D3_LISTENER_POLISH_BUILD_ID,
      });
    }

    // Explorer Peak should retain the full melodic contour but sit one octave
    // lower. Bass, drums, pads and non-melodic accents are untouched.
    if (explorerPeak && melodic && Number.isFinite(instruction.midiOffset)) {
      return explorerInstruction(instruction, {
        midiOffset: Number(instruction.midiOffset) - 12,
        register: "peak-mid",
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
  const explorerPeak = isExplorerPeakPlan(perfPlan);
  return Object.freeze(baseline.map((instruction) => explorerInstruction(instruction, {
    ...(explorerPeak && Number.isFinite(instruction.midiOffset)
      ? { midiOffset: Number(instruction.midiOffset) - 12 }
      : {}),
    register: explorerPeak ? "peak-mid" : "bright-mid",
  })));
}

export function ornamentInstructionsForPhrase(perfPlan) {
  const baseline = d1aOrnamentInstructionsForPhrase(perfPlan);
  if (perfPlan?.state !== "healthy") return baseline;
  return polishExplorerInstructions(perfPlan, baseline);
}
