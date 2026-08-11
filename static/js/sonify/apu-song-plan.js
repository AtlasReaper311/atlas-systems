import {
  ATLAS_THEME_ID,
  createThematicMemoryStore,
  deepFreezeThematicMemory,
} from "./apu-thematic-memory.js";

/**
 * System Symphony Pass D1 song-plan authority.
 *
 * Produces deterministic phrase and cycle intent around one shared Atlas theme.
 * It is intentionally pure-data and does not alter the Pass D1A audio path.
 */

export const APU_SONG_PLAN_SCHEMA_VERSION = 1;
export const APU_SONG_PLAN_BUILD_ID = "20260727-system-symphony-pass-d1-song-plan-v1";

export const APU_CYCLE_ROLES = Object.freeze(["statement", "development", "contrast", "reprise"]);
export const APU_PHRASE_ROLES = Object.freeze([
  "statement",
  "answer",
  "restatement",
  "sequence",
  "development",
  "contrast",
  "bridge",
  "build",
  "climax",
  "release",
  "reprise",
  "cadence",
  "suspension",
  "decay",
  "restart",
]);

export const APU_THEME_TRANSFORMS = Object.freeze([
  "identity",
  "rotation",
  "sequence-up",
  "sequence-down",
  "inversion-lite",
  "retrograde-fragment",
  "augmentation",
  "diminution",
  "rhythmic-displacement",
  "compression",
  "expansion",
  "outer-note-fragment",
  "answer",
  "reprise",
  "cadential-extension",
]);

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const RESOLVING_CADENCES = Object.freeze(["resolved", "recovery"]);

const STATE_TREATMENTS = Object.freeze({
  healthy: Object.freeze({
    label: "Explorer statement",
    transforms: Object.freeze(["identity", "answer", "sequence-up", "expansion", "reprise"]),
  }),
  warning: Object.freeze({
    label: "Grid Pressure strain",
    transforms: Object.freeze(["rhythmic-displacement", "compression", "sequence-up", "inversion-lite"]),
  }),
  critical: Object.freeze({
    label: "Boss Protocol compression",
    transforms: Object.freeze(["compression", "diminution", "sequence-down", "rotation"]),
  }),
  unknown: Object.freeze({
    label: "Lost Signal fragmentation",
    transforms: Object.freeze(["outer-note-fragment", "augmentation", "retrograde-fragment", "inversion-lite"]),
  }),
});

const SECTION_ROLE_MAP = Object.freeze({
  intro: Object.freeze(["restart"]),
  establish: Object.freeze(["statement", "answer"]),
  "theme-a": Object.freeze(["restatement", "answer"]),
  variation: Object.freeze(["sequence", "development"]),
  "theme-b": Object.freeze(["contrast", "bridge"]),
  build: Object.freeze(["build", "build"]),
  peak: Object.freeze(["climax", "climax"]),
  release: Object.freeze(["release"]),
  recovery: Object.freeze(["reprise"]),
  breathe: Object.freeze(["cadence"]),
});

const HARMONIC_PATHS = Object.freeze({
  statement: Object.freeze({ from: "home", to: "home", function: "establish" }),
  development: Object.freeze({ from: "home", to: "subdominant", function: "depart" }),
  contrast: Object.freeze({ from: "subdominant", to: "suspended", function: "contrast" }),
  reprise: Object.freeze({ from: "recovery", to: "home", function: "return" }),
});

const SECTION_BASS_ROLES = Object.freeze({
  intro: "silence",
  establish: "tonic-foundation",
  "theme-a": "walking-support",
  variation: "syncopated-answer",
  "theme-b": "pedal",
  build: "rising-build",
  peak: "boss-ostinato",
  release: "release-sustain",
  recovery: "recovery-reprise",
  breathe: "silence",
});

const SECTION_RHYTHM_ROLES = Object.freeze({
  intro: "carrier",
  establish: "pulse",
  "theme-a": "groove",
  variation: "diagnostic",
  "theme-b": "drive",
  build: "build",
  peak: "boss",
  release: "break",
  recovery: "recovery",
  breathe: "carrier",
});

const SECTION_ARP_FUNCTIONS = Object.freeze({
  intro: "connector",
  establish: "answer",
  "theme-a": "connector",
  variation: "lift",
  "theme-b": "answer",
  build: "lift",
  peak: "ostinato",
  release: "fracture",
  recovery: "reprise",
  breathe: "cadence",
});

const ORCHESTRATION_BY_SECTION = Object.freeze({
  intro: Object.freeze({ foreground: "pad", response: null, foundation: "silence", movement: "arp", atmosphere: "pad", telemetryDetail: "low-services", punctuation: "minimal" }),
  establish: Object.freeze({ foreground: "primary", response: null, foundation: "bass", movement: "arp", atmosphere: "pad", telemetryDetail: "quiet-services", punctuation: "accent" }),
  "theme-a": Object.freeze({ foreground: "primary", response: "secondary", foundation: "bass", movement: "arp", atmosphere: "pad", telemetryDetail: "quiet-services", punctuation: "accent" }),
  variation: Object.freeze({ foreground: "primary", response: "secondary", foundation: "bass", movement: "arp", atmosphere: "thin-pad", telemetryDetail: "active-services", punctuation: "accent" }),
  "theme-b": Object.freeze({ foreground: "secondary", response: "primary", foundation: "bass", movement: "counter-arp", atmosphere: "thin-pad", telemetryDetail: "active-services", punctuation: "accent" }),
  build: Object.freeze({ foreground: "arp", response: "secondary", foundation: "bass", movement: "persistent-arp", atmosphere: "narrow-pad", telemetryDetail: "reduced-services", punctuation: "transition" }),
  peak: Object.freeze({ foreground: "primary", response: "accent", foundation: "controlled-bass", movement: "limited-arp", atmosphere: "minimal-pad", telemetryDetail: "reduced-services", punctuation: "impact" }),
  release: Object.freeze({ foreground: "primary-fragment", response: null, foundation: "release-bass", movement: "fracture-arp", atmosphere: "widening-pad", telemetryDetail: "low-services", punctuation: "resolve" }),
  recovery: Object.freeze({ foreground: "primary", response: "descending-arp", foundation: "simple-bass", movement: "reprise-arp", atmosphere: "widening-pad", telemetryDetail: "recovery-services", punctuation: "resolve" }),
  breathe: Object.freeze({ foreground: "theme-fragment", response: null, foundation: "silence", movement: "cadence-arp", atmosphere: "pad", telemetryDetail: "low-services", punctuation: "restart" }),
});

function safeState(state) {
  return STATES.includes(state) ? state : "unknown";
}

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function modulo(value, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  return ((integer(value) % length) + length) % length;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }
  const copy = {};
  for (const key of Object.keys(value).sort()) copy[key] = canonicalValue(value[key]);
  return copy;
}

export function stableSongPlanStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

export function songPlanSignature(value) {
  let hash = 2166136261;
  const source = stableSongPlanStringify(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function cycleRoleFor(cycleNumber) {
  const cycle = Math.max(0, integer(cycleNumber));
  if (cycle === 0) return "statement";
  return ["development", "contrast", "reprise"][modulo(cycle - 1, 3)];
}

function phraseRoleFor(section, localPhrase, cycleRole, state, canResolve) {
  const roles = SECTION_ROLE_MAP[section] ?? ["statement"];
  let role = roles[modulo(localPhrase, roles.length)];
  if (cycleRole === "development" && ["statement", "restatement"].includes(role)) role = "development";
  if (cycleRole === "contrast" && ["statement", "restatement", "answer"].includes(role)) role = "contrast";
  if (cycleRole === "reprise" && ["statement", "restatement"].includes(role)) role = "reprise";
  if (section === "breathe" && !canResolve) role = state === "unknown" ? "decay" : "suspension";
  return role;
}

function chooseTransform({ state, cycleRole, phraseRole, phraseIndex, memory, seed, cadenceIntent }) {
  if (cadenceIntent === "recovery" || phraseRole === "reprise") return "reprise";
  if (phraseRole === "answer") return "answer";
  if (phraseRole === "cadence") return "cadential-extension";
  const treatment = STATE_TREATMENTS[state];
  const preferred = [];
  if (cycleRole === "reprise") preferred.push("reprise");
  if (phraseRole === "sequence") preferred.push(state === "critical" ? "sequence-down" : "sequence-up");
  if (cycleRole === "development") preferred.push("rotation");
  if (cycleRole === "contrast") preferred.push("inversion-lite");
  preferred.push(...treatment.transforms);
  const candidates = [...new Set(preferred)].filter((item) => APU_THEME_TRANSFORMS.includes(item));
  const recent = memory.recentTransforms?.slice(-2) ?? [];
  const initial = parseInt(songPlanSignature(`${seed ?? "ATLAS-PASS-D1"}:${phraseIndex}:${state}:${cycleRole}:${phraseRole}`), 16) % candidates.length;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[modulo(initial + offset, candidates.length)];
    if (!recent.includes(candidate)) return candidate;
  }
  return candidates[initial] ?? "identity";
}

function cadenceFor({ state, section, phraseRole, evidence, stateChanged }) {
  const stale = Boolean(evidence?.stale);
  const replay = evidence?.mode === "replay";
  const recoveryConfirmed = Boolean(evidence?.recoveryConfirmed || evidence?.movement?.fromEvidence && evidence?.movement?.kind === "recovery");
  const canResolve = state === "healthy" && !stale && (!replay || recoveryConfirmed || !stateChanged);
  if (state === "critical") return Object.freeze({ intent: "interrupted", canResolve: false });
  if (state === "unknown") return Object.freeze({ intent: "no-cadence", canResolve: false });
  if (state === "warning") return Object.freeze({ intent: section === "breathe" ? "suspended" : "open", canResolve: false });
  if (stateChanged && recoveryConfirmed) return Object.freeze({ intent: "recovery", canResolve: true });
  if (section === "breathe" || phraseRole === "cadence") return Object.freeze({ intent: canResolve ? "resolved" : "suspended", canResolve });
  return Object.freeze({ intent: "open", canResolve });
}

function transitionRoleFor(previousState, state, cadenceIntent) {
  if (previousState === state) return cadenceIntent === "recovery" ? "recover-theme" : "continue-theme";
  if (state === "unknown") return "fragment-theme";
  if (state === "critical") return "compress-theme";
  if (state === "warning") return "strain-theme";
  return "restore-theme";
}

function memoryUpdateFor({ memory, plan, cadence }) {
  const resolved = RESOLVING_CADENCES.includes(cadence.intent);
  const stateChanged = memory.currentThemeState !== plan.state;
  return deepFreezeThematicMemory({
    unresolvedQuestion: resolved
      ? null
      : {
        sourcePhrase: memory.unresolvedQuestion?.sourcePhrase ?? plan.phraseIndex,
        sourceState: memory.unresolvedQuestion?.sourceState ?? plan.state,
        cadenceIntent: cadence.intent,
        themeId: ATLAS_THEME_ID,
      },
    recoverySourceTheme: stateChanged && plan.state === "healthy" && cadence.intent === "recovery"
      ? {
        themeId: ATLAS_THEME_ID,
        fromState: memory.currentThemeState,
        fromVersion: memory.currentThemeVersion,
      }
      : memory.recoverySourceTheme,
  });
}

export function createSongPlan(input, memory) {
  if (!memory || typeof memory !== "object") {
    throw new TypeError("apu-song-plan: thematic memory is required");
  }
  const phraseIndex = Math.max(0, integer(input?.phraseIndex, memory.phraseIndex + 1));
  const cycleNumber = Math.max(0, integer(input?.cycleNumber, Math.floor(phraseIndex / 16)));
  const cyclePhrase = Math.max(0, integer(input?.cyclePhrase, modulo(phraseIndex, 16)));
  const cycleRole = cycleRoleFor(cycleNumber);
  const state = safeState(input?.state);
  const section = String(input?.section ?? "establish");
  const sectionLocalPhrase = Math.max(0, integer(input?.sectionLocalPhrase, 0));
  const stateChanged = memory.currentThemeState !== state;
  const preliminaryCadence = cadenceFor({ state, section, phraseRole: "cadence", evidence: input?.evidence, stateChanged });
  const initialPhraseRole = phraseRoleFor(section, sectionLocalPhrase, cycleRole, state, preliminaryCadence.canResolve);
  const cadence = cadenceFor({ state, section, phraseRole: initialPhraseRole, evidence: input?.evidence, stateChanged });
  const phraseRole = cadence.intent === "recovery" ? "reprise" : initialPhraseRole;
  const transform = chooseTransform({ state, cycleRole, phraseRole, phraseIndex, memory, seed: input?.seed, cadenceIntent: cadence.intent });
  const harmonicPath = HARMONIC_PATHS[cycleRole] ?? HARMONIC_PATHS.statement;
  const themeVersion = cycleNumber * 4 + ["healthy", "warning", "critical", "unknown"].indexOf(state);

  const payload = {
    schemaVersion: APU_SONG_PLAN_SCHEMA_VERSION,
    buildId: APU_SONG_PLAN_BUILD_ID,
    phraseIndex,
    cycleNumber,
    cyclePhrase,
    cycleRole,
    phraseRole,
    state,
    section,
    sectionLocalPhrase,
    themeId: ATLAS_THEME_ID,
    themeState: STATE_TREATMENTS[state].label,
    themeVersion,
    transform,
    harmonyIntent: harmonicPath,
    cadenceIntent: cadence.intent,
    bassRole: SECTION_BASS_ROLES[section] ?? "tonic-foundation",
    rhythmRole: SECTION_RHYTHM_ROLES[section] ?? "pulse",
    arpFunction: SECTION_ARP_FUNCTIONS[section] ?? "connector",
    orchestrationRole: ORCHESTRATION_BY_SECTION[section] ?? ORCHESTRATION_BY_SECTION.establish,
    transitionRole: transitionRoleFor(memory.currentThemeState, state, cadence.intent),
    evidenceAuthority: Object.freeze({
      mode: input?.evidence?.mode ?? "live",
      stale: Boolean(input?.evidence?.stale),
      recoveryConfirmed: cadence.intent === "recovery",
      resolutionPermitted: cadence.canResolve,
    }),
    compositionPhase: input?.compositionPhase ?? null,
    performancePhase: input?.performancePhase ?? null,
  };
  payload.memoryUpdate = memoryUpdateFor({ memory, plan: payload, cadence });
  const deterministicSignature = songPlanSignature(payload);
  return deepFreezeThematicMemory({ ...payload, deterministicSignature });
}

export function createSongPlanner({ historyLimit, seed = "ATLAS-PASS-D1" } = {}) {
  const store = createThematicMemoryStore({ historyLimit });
  let latestPlan = null;
  return Object.freeze({
    advancePhrase(input = {}) {
      const memory = store.getSnapshot();
      const plan = createSongPlan({ ...input, seed }, memory);
      const nextMemory = store.commit(plan);
      latestPlan = deepFreezeThematicMemory({ ...plan, memoryRevision: nextMemory.revision });
      return latestPlan;
    },
    getMemory() {
      return store.getSnapshot();
    },
    getPlan() {
      return latestPlan;
    },
    reset() {
      latestPlan = null;
      return store.reset();
    },
  });
}
