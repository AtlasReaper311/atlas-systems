import * as legacy from "./apu-arranger-legacy.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import {
  APU_THEME_RUNTIME_BUILD_ID,
  defaultApuThemeRuntime,
} from "./apu-theme-runtime.js?v=20260727-system-symphony-pass-d2b-theme-runtime-v1";

export * from "./apu-arranger-legacy.js?v=20260726-system-symphony-atlas-chip-laws-v3";

export const APU_THEME_INTEGRATION_BUILD_ID = "20260727-system-symphony-pass-d2b-arranger-v1";

function memorySummary(runtimeResult) {
  const memory = runtimeResult.memory;
  return Object.freeze({
    revision: memory.revision,
    phraseIndex: memory.phraseIndex,
    currentThemeState: memory.currentThemeState,
    currentThemeVersion: memory.currentThemeVersion,
    unresolvedQuestion: memory.unresolvedQuestion,
    recentPhraseRoles: Object.freeze([...memory.recentPhraseRoles]),
    recentTransforms: Object.freeze([...memory.recentTransforms]),
  });
}

export function arrangementForPhrase(frame = {}, directorPlan = null, phraseIndex = 0) {
  const arrangement = legacy.arrangementForPhrase(frame, directorPlan, phraseIndex);
  const runtimeResult = defaultApuThemeRuntime.planForArrangement({
    frame,
    directorPlan,
    arrangement,
  });
  const themeMotif = runtimeResult.themeMotif;
  return Object.freeze({
    ...arrangement,
    themeIntegrationBuildId: APU_THEME_INTEGRATION_BUILD_ID,
    themeRuntimeBuildId: APU_THEME_RUNTIME_BUILD_ID,
    songPlan: runtimeResult.songPlan,
    themeMotif,
    themeMemory: memorySummary(runtimeResult),
    themeEventSteps: Object.freeze(themeMotif.events.map((event) => event.step)),
    themeEchoSteps: Object.freeze(themeMotif.echoEvents.map((event) => event.step)),
  });
}

export function resetApuThemeIntegration() {
  return defaultApuThemeRuntime.reset();
}
