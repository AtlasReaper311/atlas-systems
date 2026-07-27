import * as legacy from "./apu-score-trace-legacy.js?v=20260727-system-symphony-pass-d0-score-trace-v1";

export * from "./apu-score-trace-legacy.js?v=20260727-system-symphony-pass-d0-score-trace-v1";

export const APU_THEME_TRACE_BUILD_ID = "20260727-system-symphony-pass-d2b-score-trace-v1";

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.length ? value : null;
}

function themeTrace(arrangement) {
  const songPlan = arrangement?.songPlan;
  const motif = arrangement?.themeMotif;
  if (!songPlan || !motif) return null;
  return legacy.deepFreeze({
    buildId: APU_THEME_TRACE_BUILD_ID,
    runtimeBuildId: stringOrNull(arrangement.themeRuntimeBuildId),
    integrationBuildId: stringOrNull(arrangement.themeIntegrationBuildId),
    themeId: stringOrNull(motif.themeId),
    themeState: stringOrNull(songPlan.themeState),
    themeVersion: finiteOrNull(songPlan.themeVersion),
    memoryRevision: finiteOrNull(songPlan.memoryRevision),
    cycleRole: stringOrNull(songPlan.cycleRole),
    phraseRole: stringOrNull(songPlan.phraseRole),
    requestedTransform: stringOrNull(motif.requestedTransform),
    playedTransform: stringOrNull(motif.transform),
    cadenceIntent: stringOrNull(songPlan.cadenceIntent),
    harmonicRegion: stringOrNull(songPlan.harmonyIntent?.to),
    transitionRole: stringOrNull(songPlan.transitionRole),
    preservedAnchors: Object.freeze([...(motif.preservedAnchors ?? [])]),
    primarySteps: Object.freeze((motif.events ?? []).map((event) => event.step)),
    echoSteps: Object.freeze((motif.echoEvents ?? []).map((event) => event.step)),
    deterministicSignature: stringOrNull(songPlan.deterministicSignature),
  });
}

export function createScoreTraceEntry(input = {}) {
  const base = legacy.createScoreTraceEntry(input);
  const theme = themeTrace(input.arrangement);
  if (!theme) return base;

  const motif = input.arrangement.themeMotif;
  const songPlan = input.arrangement.songPlan;
  const { deterministicSignature: _legacySignature, ...basePayload } = base;
  const payload = {
    ...basePayload,
    harmonicRegion: theme.harmonicRegion,
    cadenceIntent: theme.cadenceIntent,
    motifId: theme.themeId,
    motifSource: "apu-song-plan+apu-theme-grammar+apu-arranger",
    motifTransformation: theme.playedTransform,
    motifDegrees: Object.freeze((motif.events ?? []).map((event) => event.degree)),
    motifPattern: Object.freeze((motif.events ?? []).map((event) => event.step)),
    arpFunction: stringOrNull(songPlan.arpFunction),
    bassRole: stringOrNull(songPlan.bassRole),
    rhythmRole: stringOrNull(songPlan.rhythmRole),
    transitionIntent: theme.transitionRole,
    cycleRole: theme.cycleRole,
    phraseRole: theme.phraseRole,
    themePlan: theme,
    decisionSources: Object.freeze([
      ...new Set([
        ...(base.decisionSources ?? []),
        "apu-song-plan",
        "apu-theme-grammar",
        "apu-theme-runtime",
      ]),
    ]),
  };
  const deterministicSignature = legacy.fnv1aHex(legacy.stableStringify(payload));
  return legacy.deepFreeze({ ...payload, deterministicSignature });
}

export function createScoreTraceRecorder({
  limit = legacy.APU_SCORE_TRACE_HISTORY_LIMIT,
  onTrace = null,
} = {}) {
  const boundedLimit = Math.max(1, Math.min(4096, Math.trunc(limit) || legacy.APU_SCORE_TRACE_HISTORY_LIMIT));
  let history = [];
  return Object.freeze({
    record(input) {
      const entry = createScoreTraceEntry(input);
      const retained = boundedLimit > 1 ? history.slice(-(boundedLimit - 1)) : [];
      history = [...retained, entry];
      onTrace?.(entry);
      return entry;
    },
    getLatest() {
      return history.at(-1) ?? null;
    },
    getHistory() {
      return Object.freeze([...history]);
    },
    serialize() {
      return legacy.serializeScoreTrace(history);
    },
    reset() {
      history = [];
    },
  });
}
