import { deepFreeze, fnv1aHex, stableStringify } from "./apu-score-trace.js";

export const APU_SONG_PLAN_TRACE_BUILD_ID = "20260727-system-symphony-pass-d1b-song-plan-trace-v1";

export function enrichScoreTraceWithSongPlan(entry, songPlan) {
  if (!entry || typeof entry !== "object") throw new TypeError("apu-song-plan-trace: score trace entry is required");
  if (!songPlan || typeof songPlan !== "object") throw new TypeError("apu-song-plan-trace: song plan is required");
  const payload = {
    ...entry,
    schemaVersion: 2,
    buildId: APU_SONG_PLAN_TRACE_BUILD_ID,
    cycleRole: songPlan.cycleRole,
    phraseRole: songPlan.phraseRole,
    themeId: songPlan.themeId,
    themeVersion: songPlan.themeVersion,
    themeState: songPlan.themeState,
    motifTransformation: songPlan.transform,
    harmonicRegion: songPlan.harmonyIntent,
    cadenceIntent: songPlan.cadenceIntent,
    bassRole: songPlan.bassRole,
    rhythmRole: songPlan.rhythmRole,
    transitionIntent: songPlan.transitionRole,
    thematicMemory: songPlan.memoryUpdate,
    decisionSources: Object.freeze([...new Set([...(entry.decisionSources ?? []), "apu-song-plan", "apu-thematic-memory"])]),
  };
  delete payload.deterministicSignature;
  return deepFreeze({ ...payload, deterministicSignature: fnv1aHex(stableStringify(payload)) });
}
