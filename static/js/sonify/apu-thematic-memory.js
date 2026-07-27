/**
 * System Symphony Pass D1 bounded thematic memory.
 *
 * Pure data only. The memory records compositional context between phrases;
 * it does not read telemetry directly, schedule audio, or choose evidence.
 */

export const APU_THEMATIC_MEMORY_SCHEMA_VERSION = 1;
export const APU_THEMATIC_MEMORY_BUILD_ID = "20260727-system-symphony-pass-d1-thematic-memory-v1";
export const APU_THEMATIC_MEMORY_HISTORY_LIMIT = 8;
export const ATLAS_THEME_ID = "ATLAS_THEME";

const HISTORY_FIELDS = Object.freeze([
  "cadenceHistory",
  "recentPhraseRoles",
  "recentTransforms",
  "recentBassRoles",
  "recentRhythmRoles",
  "recentArpFunctions",
  "recentForegroundVoices",
  "recentServiceInfluences",
  "stateHistory",
]);

function clonePlain(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlain(item));
  if (!value || typeof value !== "object") {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (["string", "boolean"].includes(typeof value) || value === null) return value;
    return null;
  }
  const copy = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (["function", "symbol", "undefined"].includes(typeof item)) continue;
    copy[key] = clonePlain(item);
  }
  return copy;
}

export function deepFreezeThematicMemory(value) {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreezeThematicMemory(child);
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function boundedHistory(previous, next, limit) {
  const source = Array.isArray(previous) ? previous : [];
  if (next === null || next === undefined || next === "") {
    return Object.freeze(source.slice(-limit).map((item) => clonePlain(item)));
  }
  return Object.freeze([...source, clonePlain(next)].slice(-limit));
}

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function createInitialThematicMemory({ historyLimit = APU_THEMATIC_MEMORY_HISTORY_LIMIT } = {}) {
  const limit = Math.max(2, Math.min(32, integer(historyLimit, APU_THEMATIC_MEMORY_HISTORY_LIMIT)));
  return deepFreezeThematicMemory({
    schemaVersion: APU_THEMATIC_MEMORY_SCHEMA_VERSION,
    buildId: APU_THEMATIC_MEMORY_BUILD_ID,
    historyLimit: limit,
    revision: 0,
    phraseIndex: -1,
    cycleNumber: 0,
    cycleRole: "statement",
    currentThemeId: ATLAS_THEME_ID,
    currentThemeState: "unknown",
    currentThemeVersion: 0,
    lastStatement: null,
    lastAnswer: null,
    lastTransformation: null,
    unresolvedQuestion: null,
    harmonicRegion: "home",
    targetHarmonicRegion: "home",
    cadenceHistory: [],
    recentPhraseRoles: [],
    recentTransforms: [],
    recentBassRoles: [],
    recentRhythmRoles: [],
    recentArpFunctions: [],
    recentForegroundVoices: [],
    recentServiceInfluences: [],
    stateHistory: ["unknown"],
    transitionOrigin: null,
    transitionDestination: null,
    recoverySourceTheme: null,
  });
}

export function updateThematicMemory(memory, plan) {
  if (!memory || typeof memory !== "object") {
    throw new TypeError("apu-thematic-memory: memory is required");
  }
  if (!plan || typeof plan !== "object") {
    throw new TypeError("apu-thematic-memory: song plan is required");
  }

  const limit = Math.max(2, Math.min(32, integer(memory.historyLimit, APU_THEMATIC_MEMORY_HISTORY_LIMIT)));
  const role = String(plan.phraseRole ?? "statement");
  const stateChanged = memory.currentThemeState !== plan.state;
  const resolved = ["resolved", "recovery"].includes(plan.cadenceIntent);
  const question = resolved
    ? null
    : plan.memoryUpdate?.unresolvedQuestion ?? memory.unresolvedQuestion;
  const statement = ["statement", "restatement", "reprise"].includes(role)
    ? {
      phraseIndex: plan.phraseIndex,
      state: plan.state,
      transform: plan.transform,
      themeVersion: plan.themeVersion,
    }
    : memory.lastStatement;
  const answer = role === "answer"
    ? {
      phraseIndex: plan.phraseIndex,
      state: plan.state,
      transform: plan.transform,
      themeVersion: plan.themeVersion,
    }
    : memory.lastAnswer;

  const next = {
    ...clonePlain(memory),
    schemaVersion: APU_THEMATIC_MEMORY_SCHEMA_VERSION,
    buildId: APU_THEMATIC_MEMORY_BUILD_ID,
    historyLimit: limit,
    revision: integer(memory.revision, 0) + 1,
    phraseIndex: integer(plan.phraseIndex, integer(memory.phraseIndex, -1) + 1),
    cycleNumber: integer(plan.cycleNumber, memory.cycleNumber),
    cycleRole: plan.cycleRole ?? memory.cycleRole,
    currentThemeId: plan.themeId ?? memory.currentThemeId,
    currentThemeState: plan.state ?? memory.currentThemeState,
    currentThemeVersion: integer(plan.themeVersion, memory.currentThemeVersion),
    lastStatement: statement,
    lastAnswer: answer,
    lastTransformation: plan.transform ?? memory.lastTransformation,
    unresolvedQuestion: question,
    harmonicRegion: plan.harmonyIntent?.from ?? memory.harmonicRegion,
    targetHarmonicRegion: plan.harmonyIntent?.to ?? memory.targetHarmonicRegion,
    transitionOrigin: stateChanged ? memory.currentThemeState : memory.transitionOrigin,
    transitionDestination: stateChanged ? plan.state : memory.transitionDestination,
    recoverySourceTheme: plan.memoryUpdate?.recoverySourceTheme ?? memory.recoverySourceTheme,
  };

  next.cadenceHistory = boundedHistory(memory.cadenceHistory, plan.cadenceIntent, limit);
  next.recentPhraseRoles = boundedHistory(memory.recentPhraseRoles, role, limit);
  next.recentTransforms = boundedHistory(memory.recentTransforms, plan.transform, limit);
  next.recentBassRoles = boundedHistory(memory.recentBassRoles, plan.bassRole, limit);
  next.recentRhythmRoles = boundedHistory(memory.recentRhythmRoles, plan.rhythmRole, limit);
  next.recentArpFunctions = boundedHistory(memory.recentArpFunctions, plan.arpFunction, limit);
  next.recentForegroundVoices = boundedHistory(memory.recentForegroundVoices, plan.orchestrationRole?.foreground, limit);
  next.recentServiceInfluences = boundedHistory(memory.recentServiceInfluences, plan.orchestrationRole?.telemetryDetail, limit);
  next.stateHistory = boundedHistory(memory.stateHistory, plan.state, limit);

  for (const field of HISTORY_FIELDS) {
    if (!Array.isArray(next[field]) || next[field].length > limit) {
      throw new RangeError(`apu-thematic-memory: ${field} exceeded bounded history`);
    }
  }

  return deepFreezeThematicMemory(next);
}

export function createThematicMemoryStore(options = {}) {
  let memory = createInitialThematicMemory(options);
  return Object.freeze({
    commit(plan) {
      memory = updateThematicMemory(memory, plan);
      return memory;
    },
    getSnapshot() {
      return memory;
    },
    reset() {
      memory = createInitialThematicMemory(options);
      return memory;
    },
  });
}
