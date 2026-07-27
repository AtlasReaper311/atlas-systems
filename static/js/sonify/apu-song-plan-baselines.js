import {
  PASS_D0_BASELINE_IDS,
  createBaselineJourney,
} from "./apu-score-trace-baselines.js";
import {
  createSongPlanner,
  songPlanSignature,
  stableSongPlanStringify,
} from "./apu-song-plan.js";
import { deepFreezeThematicMemory } from "./apu-thematic-memory.js";

export const APU_SONG_PLAN_BASELINE_BUILD_ID = "20260727-system-symphony-pass-d1-song-plan-baselines-v1";
export const PASS_D1_BASE_COMMIT = "084967b3e19ba7a763e6e44bc1b2169957035397";
export const PASS_D1_BASELINE_IDS = PASS_D0_BASELINE_IDS;

const SECTION_START = Object.freeze({
  intro: 0,
  establish: 1,
  "theme-a": 3,
  variation: 5,
  "theme-b": 7,
  build: 9,
  peak: 11,
  release: 13,
  recovery: 14,
  breathe: 15,
});

function sectionLocalPhrase(entry) {
  const start = SECTION_START[entry.section] ?? entry.cyclePhrase ?? 0;
  return Math.max(0, Math.trunc((entry.cyclePhrase ?? 0) - start));
}

function evidenceForEntry(entry) {
  const source = entry.evidenceSource ?? {};
  const movement = source.movement ?? null;
  return deepFreezeThematicMemory({
    mode: source.mode ?? "live",
    sourceLabel: source.sourceLabel ?? null,
    stale: Boolean(source.stale),
    movement,
    recoveryConfirmed: Boolean(movement?.kind === "recovery" && movement?.fromEvidence),
  });
}

function memoryTrace(memory) {
  return deepFreezeThematicMemory({
    revision: memory.revision,
    phraseIndex: memory.phraseIndex,
    cycleNumber: memory.cycleNumber,
    cycleRole: memory.cycleRole,
    currentThemeId: memory.currentThemeId,
    currentThemeState: memory.currentThemeState,
    currentThemeVersion: memory.currentThemeVersion,
    lastStatement: memory.lastStatement,
    lastAnswer: memory.lastAnswer,
    lastTransformation: memory.lastTransformation,
    unresolvedQuestion: memory.unresolvedQuestion,
    harmonicRegion: memory.harmonicRegion,
    targetHarmonicRegion: memory.targetHarmonicRegion,
    cadenceHistory: memory.cadenceHistory,
    recentPhraseRoles: memory.recentPhraseRoles,
    recentTransforms: memory.recentTransforms,
    recentBassRoles: memory.recentBassRoles,
    recentRhythmRoles: memory.recentRhythmRoles,
    recentArpFunctions: memory.recentArpFunctions,
    recentForegroundVoices: memory.recentForegroundVoices,
    recentServiceInfluences: memory.recentServiceInfluences,
    stateHistory: memory.stateHistory,
    transitionOrigin: memory.transitionOrigin,
    transitionDestination: memory.transitionDestination,
    recoverySourceTheme: memory.recoverySourceTheme,
  });
}

export function createD1SongPlanJourneyFromScoreJourney(scoreJourney, { seed = null } = {}) {
  if (!scoreJourney || !Array.isArray(scoreJourney.entries)) {
    throw new TypeError("apu-song-plan-baselines: score journey entries are required");
  }
  const id = String(scoreJourney.id ?? "unnamed-journey");
  const planner = createSongPlanner({ seed: seed ?? `PASS-D1:${id}` });
  const entries = scoreJourney.entries.map((scoreEntry) => {
    const plan = planner.advancePhrase({
      phraseIndex: scoreEntry.phraseIndex,
      cycleNumber: scoreEntry.cycleNumber,
      cyclePhrase: scoreEntry.cyclePhrase,
      section: scoreEntry.section,
      sectionLocalPhrase: sectionLocalPhrase(scoreEntry),
      state: scoreEntry.state,
      evidence: evidenceForEntry(scoreEntry),
      compositionPhase: scoreEntry.compositionPhase,
      performancePhase: scoreEntry.performancePhase,
    });
    const memory = memoryTrace(planner.getMemory());
    const payload = {
      phraseIndex: scoreEntry.phraseIndex,
      state: scoreEntry.state,
      section: scoreEntry.section,
      scoreSignature: scoreEntry.deterministicSignature,
      songPlan: plan,
      thematicMemory: memory,
    };
    return deepFreezeThematicMemory({
      ...payload,
      deterministicSignature: songPlanSignature(payload),
    });
  });
  const serialized = `${stableSongPlanStringify(entries)}\n`;
  return deepFreezeThematicMemory({
    schemaVersion: 1,
    buildId: APU_SONG_PLAN_BASELINE_BUILD_ID,
    baseCommit: PASS_D1_BASE_COMMIT,
    id,
    phraseCount: entries.length,
    barCount: scoreJourney.barCount ?? entries.length * 2,
    sourceScoreDigest: scoreJourney.digest ?? null,
    digest: songPlanSignature(serialized),
    entries,
    finalMemory: memoryTrace(planner.getMemory()),
    serialized,
  });
}

export function createD1SongPlanJourney(id) {
  return createD1SongPlanJourneyFromScoreJourney(createBaselineJourney(id));
}

export function createPassD1SongPlanBaseline() {
  const journeys = PASS_D1_BASELINE_IDS.map((id) => createD1SongPlanJourney(id));
  return deepFreezeThematicMemory({
    schemaVersion: 1,
    buildId: APU_SONG_PLAN_BASELINE_BUILD_ID,
    baseCommit: PASS_D1_BASE_COMMIT,
    generatedFrom: "D0 score traces plus pure deterministic D1 song-plan authority",
    journeys,
    digest: songPlanSignature(journeys.map((journey) => ({ id: journey.id, digest: journey.digest }))),
  });
}

export function createPassD1SongPlanManifest() {
  const baseline = createPassD1SongPlanBaseline();
  return deepFreezeThematicMemory({
    schemaVersion: baseline.schemaVersion,
    buildId: baseline.buildId,
    baseCommit: baseline.baseCommit,
    digest: baseline.digest,
    journeys: baseline.journeys.map((journey) => ({
      id: journey.id,
      phraseCount: journey.phraseCount,
      barCount: journey.barCount,
      sourceScoreDigest: journey.sourceScoreDigest,
      digest: journey.digest,
      signatures: journey.entries.map((entry) => entry.deterministicSignature),
    })),
  });
}
