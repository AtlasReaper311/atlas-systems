import {
  APU_BARS_PER_PHRASE,
  APU_FORM,
  APU_TRACK_BARS,
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID as BASELINE_TRACK_BUILD_ID,
  arrangementForPhrase as baselineArrangementForPhrase,
  arrangementTimeline,
} from "./apu-arranger-baseline.js?v=20260727-system-symphony-pr133-audio-baseline";
import { createSongPlanner } from "./apu-song-plan.js?v=20260727-system-symphony-pass-d1-song-plan-v1";
import {
  APU_ACCOMPANIMENT_DEVELOPMENT_D2_BUILD_ID,
  accompanimentDevelopmentForSongPlan,
} from "./apu-accompaniment-development-d2.js?v=20260727-system-symphony-pass-d2-melody-preserving-v1";

export {
  APU_BARS_PER_PHRASE,
  APU_FORM,
  APU_TRACK_BARS,
  APU_TRACK_PHRASES,
  arrangementTimeline,
};

// Preserve the established public build contract. D2 publishes its own
// development build identifier on each arrangement instead of pretending the
// approved baseline composition was replaced.
export const ATLAS_APU_TRACK_BUILD_ID = BASELINE_TRACK_BUILD_ID;
export const APU_MELODY_PRESERVING_D2_BUILD_ID = APU_ACCOMPANIMENT_DEVELOPMENT_D2_BUILD_ID;

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

let planner = createSongPlanner({ seed: "ATLAS-D2-MELODY-PRESERVING" });
let latestPhraseIndex = null;
let latestPlanKey = null;
let latestSongPlan = null;

function evidenceForFrame(frame = {}) {
  const movement = frame?.movement ?? frame?.replayMovement ?? null;
  const replay = frame?.mode === "replay" || frame?.source === "replay" || Boolean(movement);
  const recoveryConfirmed = Boolean(
    frame?.recoveryConfirmed
    || movement?.kind === "recovery" && movement?.fromEvidence,
  );
  return Object.freeze({
    mode: replay ? "replay" : "live",
    stale: Boolean(frame?.stale ?? frame?.evidence?.stale),
    recoveryConfirmed,
    movement,
  });
}

function songPlanForArrangement(frame, directorPlan, arrangement) {
  const phraseIndex = arrangement.phraseIndex;
  if (latestPhraseIndex !== null && phraseIndex < latestPhraseIndex) {
    planner.reset();
    latestPlanKey = null;
    latestSongPlan = null;
  }

  const planKey = [phraseIndex, arrangement.scoreState, arrangement.section].join(":");
  if (latestPlanKey !== planKey) {
    latestSongPlan = planner.advancePhrase({
      phraseIndex,
      cycleNumber: arrangement.cycleNumber,
      cyclePhrase: arrangement.cyclePhrase,
      state: arrangement.scoreState,
      section: arrangement.section,
      sectionLocalPhrase: arrangement.sectionLocalPhrase,
      compositionPhase: directorPlan?.phase ?? null,
      performancePhase: null,
      evidence: evidenceForFrame(frame),
    });
    latestPlanKey = planKey;
    latestPhraseIndex = phraseIndex;
  }
  return latestSongPlan;
}

function developedMix(baseline, development) {
  return Object.freeze({
    primary: baseline.primary,
    secondary: clamp(baseline.secondary * development.secondary, 0, 1),
    services: clamp(baseline.services * development.services, 0, 1),
    bass: clamp(baseline.bass * development.bass, 0, 1),
    drums: clamp(baseline.drums * development.drums, 0, 1),
    pad: clamp(baseline.pad * development.pad, 0, 1),
    accent: clamp(baseline.accent * development.accent, 0, 1),
  });
}

function developedTimbre(baseline, development) {
  return Object.freeze({
    ...baseline,
    leadCutoffHz: baseline.leadCutoffHz,
    leadDrive: baseline.leadDrive,
    primaryDutyCycle: baseline.primaryDutyCycle,
    counterCutoffHz: Math.round(baseline.counterCutoffHz * development.counterCutoff),
    serviceCutoffScale: baseline.serviceCutoffScale * development.serviceCutoff,
    padCutoffScale: baseline.padCutoffScale * development.padCutoff,
  });
}

export function arrangementForPhrase(frame = {}, directorPlan = null, phraseIndex = 0) {
  const baseline = baselineArrangementForPhrase(frame, directorPlan, phraseIndex);
  const songPlan = songPlanForArrangement(frame, directorPlan, baseline);
  const development = accompanimentDevelopmentForSongPlan(songPlan);

  return Object.freeze({
    ...baseline,
    // These assignments are deliberately explicit. They are the approved
    // melody authority and D2 is not allowed to replace them.
    motifMode: baseline.motifMode,
    motifDegrees: baseline.motifDegrees,
    melodyAuthority: Object.freeze({
      sourceBuildId: baseline.buildId,
      motifMode: baseline.motifMode,
      motifDegrees: baseline.motifDegrees,
      primaryMix: baseline.mix.primary,
      leadTimbre: Object.freeze({
        leadCutoffHz: baseline.timbre.leadCutoffHz,
        leadDrive: baseline.timbre.leadDrive,
        primaryDutyCycle: baseline.timbre.primaryDutyCycle,
      }),
    }),
    mix: developedMix(baseline.mix, development.mix),
    timbre: developedTimbre(baseline.timbre, development.timbre),
    songPlan,
    accompanimentDevelopment: development,
    developmentBuildId: APU_MELODY_PRESERVING_D2_BUILD_ID,
  });
}

export function resetMelodyPreservingD2Planner() {
  planner = createSongPlanner({ seed: "ATLAS-D2-MELODY-PRESERVING" });
  latestPhraseIndex = null;
  latestPlanKey = null;
  latestSongPlan = null;
}
