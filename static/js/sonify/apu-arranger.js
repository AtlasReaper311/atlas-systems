import {
  APU_BARS_PER_PHRASE,
  APU_FORM,
  APU_MELODY_PRESERVING_D2_BUILD_ID,
  APU_TRACK_BARS,
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementForPhrase as d2ArrangementForPhrase,
  arrangementTimeline,
  resetMelodyPreservingD2Planner as resetD2Planner,
} from "./apu-arranger-d2-baseline.js?v=20260727-system-symphony-pass-d2-melody-preserving-v1";
import {
  APU_HARMONIC_JOURNEY_D3_BUILD_ID,
  createHarmonicJourneyPlanner,
} from "./apu-harmonic-journey.js?v=20260727-system-symphony-pass-d3-harmonic-journey-v1";

export {
  APU_BARS_PER_PHRASE,
  APU_FORM,
  APU_MELODY_PRESERVING_D2_BUILD_ID,
  APU_TRACK_BARS,
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementTimeline,
};

export const APU_HARMONIC_D3_BUILD_ID = APU_HARMONIC_JOURNEY_D3_BUILD_ID;
export const APU_UNKNOWN_QUESTION_BUILD_ID = "20260728-system-symphony-lost-signal-question-v1";

const UNKNOWN_QUESTION_DEGREES = Object.freeze([0, 2, 0, 4, 2]);
const UNKNOWN_STRUCTURAL_SECTIONS = new Set(["intro", "release", "breathe"]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

let harmonicPlanner = createHarmonicJourneyPlanner();

function completeUnknownArrangement(arrangement, directorPlan) {
  if (arrangement?.scoreState !== "unknown") return arrangement;

  const confidence = clamp(directorPlan?.intent?.confidence ?? 0.35, 0, 1);
  const audibility = 0.72 + confidence * 0.28;
  const confidenceRatio = audibility / Math.max(confidence, 0.05);
  const mix = Object.freeze({
    ...arrangement.mix,
    primary: clamp(arrangement.mix.primary * confidenceRatio, 0, 1),
    secondary: clamp(arrangement.mix.secondary * confidenceRatio, 0, 1),
  });
  const counterPattern = UNKNOWN_STRUCTURAL_SECTIONS.has(arrangement.section)
    ? arrangement.counterPattern
    : "ghost";

  return Object.freeze({
    ...arrangement,
    motifMode: "question",
    motifDegrees: UNKNOWN_QUESTION_DEGREES,
    counterPattern,
    mix,
    melodyAuthority: arrangement.melodyAuthority
      ? Object.freeze({
        ...arrangement.melodyAuthority,
        motifMode: "question",
        motifDegrees: UNKNOWN_QUESTION_DEGREES,
        primaryMix: mix.primary,
      })
      : arrangement.melodyAuthority,
    unknownAudibility: Object.freeze({
      buildId: APU_UNKNOWN_QUESTION_BUILD_ID,
      confidence,
      audibility,
      policy: "full-sized uncertainty",
    }),
  });
}

export function arrangementForPhrase(frame = {}, directorPlan = null, phraseIndex = 0) {
  const baseline = d2ArrangementForPhrase(frame, directorPlan, phraseIndex);
  const journey = harmonicPlanner.advancePhrase({ frame, arrangement: baseline });
  const arrangement = Object.freeze({
    ...baseline,
    // D3's supporting harmony is deliberately separate. The existing harmony
    // remains the authority for melody, counterline, services and ornaments.
    harmony: baseline.harmony,
    motifMode: baseline.motifMode,
    motifDegrees: baseline.motifDegrees,
    supportHarmony: journey.supportHarmony,
    supportVoicings: journey.supportVoicings,
    harmonicRegion: journey.region,
    cadenceIntent: journey.cadenceIntent,
    harmonicJourney: journey,
    harmonicBuildId: APU_HARMONIC_D3_BUILD_ID,
  });

  return completeUnknownArrangement(arrangement, directorPlan);
}

export function resetMelodyPreservingD2Planner() {
  resetD2Planner();
  harmonicPlanner.reset();
}

export function resetHarmonicJourneyD3Planner() {
  harmonicPlanner.reset();
}
