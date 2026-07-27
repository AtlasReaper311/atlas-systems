import * as baseline from "./apu-performance-conductor-baseline.js?v=20260727-system-symphony-recovery-pass-c";

/**
 * System Symphony recovery comparison candidate B.
 *
 * Keeps the PR #128 Pass C v3 performance conductor as the authority for
 * density, percussion, secondary voices and authored 4/8/16-bar ornaments.
 * It changes only two lead-continuity decisions:
 *
 * 1. the primary melody is never removed by the phrase silence budget;
 * 2. the automatic connective arpeggio is not inserted into every phrase.
 *
 * State identity omission, the sequencer, harmony, bass, drums, services,
 * replay and transport remain unchanged.
 */

export const APU_PERFORMANCE_CONDUCTOR_BUILD_ID =
  "20260727-apu-performance-conductor-continuous-lead-v4";

export const connectiveArpeggioInstructionsForPhrase =
  baseline.connectiveArpeggioInstructionsForPhrase;

export const performanceCategories = baseline.performanceCategories;
export const supplementalRhythmForDensity = baseline.supplementalRhythmForDensity;
export const velocityScaleForDensity = baseline.velocityScaleForDensity;

export function shouldOmitForPhase(args = {}) {
  if (args.category === "primary") return false;
  return baseline.shouldOmitForPhase(args);
}

export function ornamentInstructionsForPhrase(perfPlan) {
  if (!perfPlan) return Object.freeze([]);
  return Object.freeze(
    baseline
      .ornamentInstructionsForPhrase(perfPlan)
      .filter((instruction) => instruction.ornament !== "connective-arp"),
  );
}

export function describeConductor(perfPlan) {
  if (!perfPlan) return "conductor idle";
  return `${baseline.describeConductor(perfPlan)} primaryContinuity=locked phraseArp=disabled`;
}
