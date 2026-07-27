import { createSongPlanner } from "./apu-song-plan.js";
import { themeMotifForPlan } from "./apu-theme-grammar.js";
import { deepFreezeThematicMemory } from "./apu-thematic-memory.js";

export const APU_THEME_RUNTIME_BUILD_ID = "20260727-system-symphony-pass-d2b-theme-runtime-v1";

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);

function safeState(value) {
  const state = String(value ?? "unknown").toLowerCase();
  return STATES.includes(state) ? state : "unknown";
}

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function movementForFrame(frame = {}) {
  const movement = frame.replayMovement ?? frame.movement ?? null;
  if (!movement || typeof movement !== "object") return null;
  return deepFreezeThematicMemory({
    kind: typeof movement.kind === "string" ? movement.kind : null,
    state: safeState(movement.state ?? frame.scoreState),
    phase: typeof movement.phase === "string" ? movement.phase : null,
    label: typeof movement.label === "string" ? movement.label : null,
    fromEvidence: Boolean(movement.fromEvidence),
  });
}

export function themeEvidenceForFrame(frame = {}) {
  const movement = movementForFrame(frame);
  const recoveryConfirmed = Boolean(
    frame.recoveryConfirmed
    || frame.evidenceRecoveryConfirmed
    || movement?.fromEvidence && movement?.kind === "recovery"
  );
  return deepFreezeThematicMemory({
    mode: typeof frame.evidenceMode === "string"
      ? frame.evidenceMode
      : movement
        ? "replay"
        : "live",
    stale: Boolean(frame.stale ?? frame.isStale),
    recoveryConfirmed,
    movement,
  });
}

function runtimeKey({ frame, directorPlan, arrangement, evidence }) {
  return JSON.stringify({
    phraseIndex: arrangement.phraseIndex,
    state: safeState(frame.scoreState ?? arrangement.scoreState),
    section: arrangement.section,
    sectionLocalPhrase: arrangement.sectionLocalPhrase,
    compositionPhase: directorPlan?.phase ?? arrangement.directorPhase ?? null,
    performancePhase: frame.performancePhase ?? null,
    evidence,
  });
}

function memorySummary(memory) {
  return deepFreezeThematicMemory({
    revision: integer(memory?.revision),
    phraseIndex: integer(memory?.phraseIndex, -1),
    currentThemeState: safeState(memory?.currentThemeState),
    currentThemeVersion: integer(memory?.currentThemeVersion),
    unresolvedQuestion: memory?.unresolvedQuestion ?? null,
    recentPhraseRoles: Object.freeze([...(memory?.recentPhraseRoles ?? [])]),
    recentTransforms: Object.freeze([...(memory?.recentTransforms ?? [])]),
  });
}

export function createApuThemeRuntime({
  historyLimit = 8,
  seed = "ATLAS-PASS-D2B-LIVE",
} = {}) {
  const planner = createSongPlanner({ historyLimit, seed });
  let lastPhraseIndex = -1;
  let lastKey = null;
  let latest = null;

  function reset() {
    planner.reset();
    lastPhraseIndex = -1;
    lastKey = null;
    latest = null;
    return null;
  }

  return Object.freeze({
    planForArrangement({ frame = {}, directorPlan = null, arrangement = null } = {}) {
      if (!arrangement || typeof arrangement !== "object") {
        throw new TypeError("apu-theme-runtime: arrangement is required");
      }
      const phraseIndex = Math.max(0, integer(arrangement.phraseIndex));
      if (phraseIndex < lastPhraseIndex) reset();

      const evidence = themeEvidenceForFrame(frame);
      const key = runtimeKey({ frame, directorPlan, arrangement, evidence });
      if (key === lastKey && latest) return latest;

      const state = safeState(frame.scoreState ?? arrangement.scoreState);
      const songPlan = planner.advancePhrase({
        phraseIndex,
        cycleNumber: Math.max(0, integer(arrangement.cycleNumber, Math.floor(phraseIndex / 16))),
        cyclePhrase: Math.max(0, integer(arrangement.cyclePhrase, phraseIndex % 16)),
        section: String(arrangement.section ?? "establish"),
        sectionLocalPhrase: Math.max(0, integer(arrangement.sectionLocalPhrase)),
        state,
        evidence,
        compositionPhase: directorPlan?.phase ?? arrangement.directorPhase ?? null,
        performancePhase: frame.performancePhase ?? null,
      });
      const themeMotif = themeMotifForPlan(songPlan);
      const memory = planner.getMemory();
      latest = deepFreezeThematicMemory({
        buildId: APU_THEME_RUNTIME_BUILD_ID,
        phraseIndex,
        state,
        songPlan,
        themeMotif,
        memory: memorySummary(memory),
      });
      lastPhraseIndex = phraseIndex;
      lastKey = key;
      return latest;
    },
    getLatest() {
      return latest;
    },
    getMemory() {
      return memorySummary(planner.getMemory());
    },
    reset,
  });
}

export const defaultApuThemeRuntime = createApuThemeRuntime();
