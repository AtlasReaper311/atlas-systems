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

let harmonicPlanner = createHarmonicJourneyPlanner();

export function arrangementForPhrase(frame = {}, directorPlan = null, phraseIndex = 0) {
  const baseline = d2ArrangementForPhrase(frame, directorPlan, phraseIndex);
  const journey = harmonicPlanner.advancePhrase({ frame, arrangement: baseline });

  return Object.freeze({
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
}

export function resetMelodyPreservingD2Planner() {
  resetD2Planner();
  harmonicPlanner.reset();
}

export function resetHarmonicJourneyD3Planner() {
  harmonicPlanner.reset();
}
