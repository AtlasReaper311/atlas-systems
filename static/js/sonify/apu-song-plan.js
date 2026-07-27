import { createThematicMemory } from "./apu-thematic-memory.js";

export const APU_SONG_PLAN_BUILD_ID = "20260727-system-symphony-pass-d1b-song-plan-v1";
export const APU_CYCLE_ROLES = Object.freeze(["statement", "development", "contrast", "reprise", "development", "contrast", "reprise", "expanded-statement"]);
export const APU_PHRASE_ROLES = Object.freeze(["statement", "answer", "restatement", "sequence", "development", "contrast", "bridge", "build", "climax", "release", "reprise", "cadence", "suspension", "decay", "restart"]);

const SECTION_ROLE = Object.freeze({
  intro: "statement", establish: "statement", "theme-a": "statement", "theme-a-variation": "sequence",
  "theme-b": "contrast", build: "build", peak: "climax", release: "release", recovery: "reprise", breathe: "cadence",
});
const TRANSFORM_BY_CYCLE = Object.freeze({
  statement: "identity", development: "sequence-up", contrast: "rhythmic-displacement", reprise: "reprise", "expanded-statement": "expansion",
});
const STATE_TRANSFORM = Object.freeze({ healthy: "clear", warning: "strain", critical: "compression", unknown: "fragmentation" });
const safeState = (value) => ["healthy", "warning", "critical", "unknown"].includes(value) ? value : "unknown";
const freeze = (value) => { if (!value || typeof value !== "object") return value; for (const child of Object.values(value)) freeze(child); return Object.freeze(value); };

function roleFor(arrangement, cycleRole) {
  const section = String(arrangement?.section ?? "").toLowerCase();
  const base = SECTION_ROLE[section] ?? (arrangement?.cyclePhrase === 0 ? "statement" : "development");
  if (cycleRole === "reprise" && ["statement", "sequence"].includes(base)) return "reprise";
  if (cycleRole === "contrast" && base === "statement") return "contrast";
  if (cycleRole === "development" && base === "statement") return "development";
  return base;
}

function cadenceFor({ state, phraseRole, frame, recovery }) {
  if (!["cadence", "release", "reprise"].includes(phraseRole)) return "no-cadence";
  if (state === "critical") return "interrupted";
  if (state === "warning") return "suspended";
  if (state === "unknown" || frame?.stale) return "no-cadence";
  if (recovery) return "recovery";
  return phraseRole === "cadence" ? "resolved" : "open";
}

export function createSongPlanner({ memory = createThematicMemory() } = {}) {
  let latest = null;
  return Object.freeze({
    planPhrase({ frame = {}, directorPlan = {}, arrangement = {} } = {}) {
      const previous = memory.get();
      const phraseIndex = Math.max(0, Math.trunc(arrangement.phraseIndex ?? directorPlan.phraseIndex ?? previous.phraseCount));
      const cycleNumber = Math.max(0, Math.trunc(arrangement.cycleNumber ?? Math.floor(phraseIndex / 16)));
      const cycleRole = APU_CYCLE_ROLES[cycleNumber % APU_CYCLE_ROLES.length];
      const state = safeState(arrangement.scoreState ?? directorPlan.state ?? frame.scoreState);
      const phraseRole = roleFor(arrangement, cycleRole);
      const recovery = state === "healthy" && ["warning", "critical", "unknown"].includes(previous.currentThemeState);
      const transform = `${TRANSFORM_BY_CYCLE[cycleRole]}+${STATE_TRANSFORM[state]}`;
      const cadenceIntent = cadenceFor({ state, phraseRole, frame, recovery });
      const unresolvedQuestion = ["answer", "cadence", "reprise"].includes(phraseRole) ? null : phraseRole === "statement" ? phraseIndex : previous.unresolvedQuestion;
      const plan = {
        schemaVersion: 1,
        buildId: APU_SONG_PLAN_BUILD_ID,
        phraseIndex,
        cycleNumber,
        cycleRole,
        phraseRole,
        state,
        section: arrangement.section ?? null,
        themeId: "ATLAS_THEME",
        themeVersion: cycleNumber,
        themeState: state,
        transform,
        harmonyIntent: null,
        cadenceIntent,
        bassRole: arrangement.bassPattern ?? null,
        rhythmRole: arrangement.drumPattern ?? null,
        arpFunction: null,
        orchestrationRole: arrangement.motifMode ?? null,
        transitionRole: recovery ? "recovery-reprise" : state !== previous.currentThemeState ? "theme-preserving-transition" : "continue",
        unresolvedQuestion,
      };
      const nextMemory = memory.update({ ...plan, foregroundVoice: null, serviceInfluence: arrangement.serviceDensity ?? null });
      latest = freeze({ ...plan, memoryUpdate: nextMemory });
      return latest;
    },
    getPlan: () => latest,
    getMemory: () => memory.get(),
    reset() { latest = null; return memory.reset(); },
  });
}
