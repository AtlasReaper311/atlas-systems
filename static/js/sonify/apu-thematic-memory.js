export const APU_THEMATIC_MEMORY_BUILD_ID = "20260727-system-symphony-pass-d1b-thematic-memory-v1";
export const APU_THEMATIC_MEMORY_HISTORY_LIMIT = 8;

const freeze = (value) => {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const bounded = (items, limit = APU_THEMATIC_MEMORY_HISTORY_LIMIT) => Object.freeze([...items].slice(-limit));
const state = (value) => ["healthy", "warning", "critical", "unknown"].includes(value) ? value : "unknown";

export function initialThematicMemory() {
  return freeze({
    schemaVersion: 1,
    buildId: APU_THEMATIC_MEMORY_BUILD_ID,
    phraseCount: 0,
    cycleNumber: 0,
    cycleRole: "statement",
    currentThemeId: "ATLAS_THEME",
    currentThemeState: "unknown",
    currentThemeVersion: 0,
    lastStatement: null,
    lastAnswer: null,
    lastTransformation: null,
    unresolvedQuestion: null,
    harmonicRegion: null,
    targetHarmonicRegion: null,
    cadenceHistory: [],
    recentPhraseRoles: [],
    recentTransforms: [],
    recentBassRoles: [],
    recentRhythmRoles: [],
    recentArpFunctions: [],
    recentForegroundVoices: [],
    recentServiceInfluences: [],
    transitionOrigin: null,
    transitionDestination: null,
    recoverySourceTheme: null,
  });
}

export function applyThematicMemoryUpdate(memory, update = {}) {
  const current = memory ?? initialThematicMemory();
  const nextState = state(update.state ?? current.currentThemeState);
  const changed = nextState !== current.currentThemeState;
  const recovery = nextState === "healthy" && ["warning", "critical", "unknown"].includes(current.currentThemeState);
  const phraseRole = update.phraseRole ?? null;
  const transform = update.transform ?? null;
  const cadenceIntent = update.cadenceIntent ?? null;
  return freeze({
    ...current,
    phraseCount: current.phraseCount + 1,
    cycleNumber: Math.max(0, Math.trunc(update.cycleNumber ?? current.cycleNumber)),
    cycleRole: update.cycleRole ?? current.cycleRole,
    currentThemeId: update.themeId ?? current.currentThemeId,
    currentThemeState: nextState,
    currentThemeVersion: Math.max(0, Math.trunc(update.themeVersion ?? current.currentThemeVersion)),
    lastStatement: phraseRole === "statement" || phraseRole === "restatement" ? update.phraseIndex ?? current.phraseCount : current.lastStatement,
    lastAnswer: phraseRole === "answer" ? update.phraseIndex ?? current.phraseCount : current.lastAnswer,
    lastTransformation: transform ?? current.lastTransformation,
    unresolvedQuestion: update.unresolvedQuestion === undefined ? current.unresolvedQuestion : update.unresolvedQuestion,
    harmonicRegion: update.harmonicRegion ?? current.harmonicRegion,
    targetHarmonicRegion: update.targetHarmonicRegion ?? current.targetHarmonicRegion,
    cadenceHistory: bounded(cadenceIntent ? [...current.cadenceHistory, cadenceIntent] : current.cadenceHistory),
    recentPhraseRoles: bounded(phraseRole ? [...current.recentPhraseRoles, phraseRole] : current.recentPhraseRoles),
    recentTransforms: bounded(transform ? [...current.recentTransforms, transform] : current.recentTransforms),
    recentBassRoles: bounded(update.bassRole ? [...current.recentBassRoles, update.bassRole] : current.recentBassRoles),
    recentRhythmRoles: bounded(update.rhythmRole ? [...current.recentRhythmRoles, update.rhythmRole] : current.recentRhythmRoles),
    recentArpFunctions: bounded(update.arpFunction ? [...current.recentArpFunctions, update.arpFunction] : current.recentArpFunctions),
    recentForegroundVoices: bounded(update.foregroundVoice ? [...current.recentForegroundVoices, update.foregroundVoice] : current.recentForegroundVoices),
    recentServiceInfluences: bounded(update.serviceInfluence ? [...current.recentServiceInfluences, update.serviceInfluence] : current.recentServiceInfluences),
    transitionOrigin: changed ? current.currentThemeState : current.transitionOrigin,
    transitionDestination: changed ? nextState : current.transitionDestination,
    recoverySourceTheme: recovery ? current.currentThemeId : current.recoverySourceTheme,
  });
}

export function serializeThematicMemory(memory) {
  return `${JSON.stringify(memory ?? initialThematicMemory())}\n`;
}

export function createThematicMemory() {
  let memory = initialThematicMemory();
  return Object.freeze({
    get: () => memory,
    update(update) { memory = applyThematicMemoryUpdate(memory, update); return memory; },
    serialize: () => serializeThematicMemory(memory),
    reset() { memory = initialThematicMemory(); return memory; },
  });
}
