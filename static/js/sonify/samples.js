/**
 * Deterministic sample palette and section grammar for System SYMPHONY.
 *
 * This module remains pure apart from browser format capability detection.
 * Asset metadata uses one template for Opus, AAC and WAV delivery variants;
 * engine.js remains the only module that constructs Tone.js nodes or starts
 * audio playback.
 */

import {
  pickAudioFormat,
  resolveAssetUrl,
  resolveAssetUrls,
} from "./asset-loader.js?v=20260718-system-symphony-ghost-circuit";

export const SAMPLE_ASSET_VERSION = "20260720-system-symphony-loop-production-v2";
export const SAMPLE_ASSET_BASE = "/static/audio/system-symphony/";

const assetUrlTemplate = (file) => (
  `${SAMPLE_ASSET_BASE}${file}.%ext%?v=${SAMPLE_ASSET_VERSION}`
);

const asset = (id, file, gainDb = 0) => Object.freeze({
  id,
  file,
  urlTemplate: assetUrlTemplate(file),
  get url() { return resolveAssetUrl(this.urlTemplate); },
  get urls() { return resolveAssetUrls(this.urlTemplate); },
  gainDb,
});

export const DRUM_SAMPLES = Object.freeze({
  "kick-aggressive": asset("kick-aggressive", "kick-aggressive", -2.5),
  "kick-crispy": asset("kick-crispy", "kick-crispy", -2),
  "kick-punchier": asset("kick-punchier", "kick-punchier", -2.5),
  "kick-subtle": asset("kick-subtle", "kick-subtle", -1.5),
  "snare-aggressive": asset("snare-aggressive", "snare-aggressive", -4),
  "snare-bright": asset("snare-bright", "snare-bright", -3.5),
  "snare-clip": asset("snare-clip", "snare-clip", -3),
  "snare-regular": asset("snare-regular", "snare-regular", -3.5),
  "hat-aggressive": asset("hat-aggressive", "hat-aggressive", -7),
  "hat-classic": asset("hat-classic", "hat-classic", -6.5),
  "hat-hard": asset("hat-hard", "hat-hard", -7),
  "hat-layer": asset("hat-layer", "hat-layer", -8),
  "hat-subtle": asset("hat-subtle", "hat-subtle", -6),
  "perc-ac-unit-1": asset("perc-ac-unit-1", "perc-ac-unit-1", 1.5),
  "perc-ac-unit-3": asset("perc-ac-unit-3", "perc-ac-unit-3", 0.5),
  "perc-ac-unit-6": asset("perc-ac-unit-6", "perc-ac-unit-6", 2),
  "perc-stick": asset("perc-stick", "perc-stick", -5),
  "crash-crisp": asset("crash-crisp", "crash-crisp", -7),
  "fx-tapestop": asset("fx-tapestop", "fx-tapestop", -6),
});

export const BASS_SAMPLES = Object.freeze({
  "bass-transformer": Object.freeze({
    ...asset("bass-transformer", "bass-transformer-a0", -5),
    rootNote: "A0",
  }),
  "bass-angry": Object.freeze({
    ...asset("bass-angry", "bass-angry-d1", -8),
    rootNote: "D1",
  }),
  "bass-percussive": Object.freeze({
    ...asset("bass-percussive", "bass-percussive-d-sharp1", -8.5),
    rootNote: "D#1",
  }),
  "bass-burial": Object.freeze({
    ...asset("bass-burial", "bass-burial-c1", -8),
    rootNote: "C1",
  }),
  "bass-deep": Object.freeze({
    ...asset("bass-deep", "bass-deep-c1", -5.5),
    rootNote: "C1",
  }),
  "bass-doom": Object.freeze({
    ...asset("bass-doom", "bass-doom-c1", -7.5),
    rootNote: "C1",
  }),
});

export const LEAD_LOOPS = Object.freeze({
  geneticist: Object.freeze({
    ...asset("geneticist", "lead-geneticist-96-e-min", -8),
    bpm: 96,
    key: "E minor toward F",
    transposeCents: 100,
    durationSeconds: 20,
    playableEndSeconds: 18.16,
    playableBeats: 28,
    grainSize: 0.14,
    grainOverlap: 0.07,
    stateCompatibility: Object.freeze(["healthy", "unknown"]),
  }),
  "no-alternative": Object.freeze({
    ...asset("no-alternative", "lead-no-alternative-100-e-min", -7),
    bpm: 100,
    key: "E minor toward F",
    transposeCents: 100,
    durationSeconds: 19.2,
    playableEndSeconds: 19.2,
    playableBeats: 32,
    grainSize: 0.14,
    grainOverlap: 0.07,
    stateCompatibility: Object.freeze(["healthy"]),
  }),
  "background-saws": Object.freeze({
    ...asset("background-saws", "lead-background-saws-100-d-min", -11),
    bpm: 100,
    key: "D minor toward F",
    transposeCents: 300,
    durationSeconds: 4.8,
    playableEndSeconds: 4.8,
    playableBeats: 8,
    grainSize: 0.14,
    grainOverlap: 0.07,
    stateCompatibility: Object.freeze(["healthy", "warning"]),
  }),
  "future-synth": Object.freeze({
    ...asset("future-synth", "lead-future-synth-100-e-min", -9),
    bpm: 100,
    key: "E minor toward F",
    transposeCents: 100,
    durationSeconds: 4.8,
    playableEndSeconds: 4.8,
    playableBeats: 8,
    grainSize: 0.12,
    grainOverlap: 0.06,
    stateCompatibility: Object.freeze(["healthy"]),
  }),
  "acid-synth": Object.freeze({
    ...asset("acid-synth", "lead-acid-synth-100-f-min", -13),
    bpm: 100,
    key: "F minor",
    transposeCents: 0,
    durationSeconds: 9.6,
    playableEndSeconds: 9.6,
    playableBeats: 16,
    grainSize: 0.07,
    grainOverlap: 0.035,
    stateCompatibility: Object.freeze(["healthy", "warning"]),
  }),
  "wobbly-synth": Object.freeze({
    ...asset("wobbly-synth", "lead-wobbly-synth-104-d-sharp-min", -10),
    bpm: 104,
    key: "D# minor toward F",
    transposeCents: 200,
    durationSeconds: 9.231,
    playableEndSeconds: 9.231,
    playableBeats: 16,
    grainSize: 0.14,
    grainOverlap: 0.07,
    stateCompatibility: Object.freeze(["healthy", "warning"]),
  }),
});

export const ATMOSPHERE_LOOPS = Object.freeze({
  motherboard: Object.freeze({
    ...asset("motherboard", "atmos-motherboard-106-d-sharp-min", -3),
    bpm: 106,
    key: "D# minor toward F",
    transposeCents: 200,
    durationSeconds: 17.587,
    stateCompatibility: Object.freeze(["warning", "critical"]),
  }),
  nanotech: Object.freeze({
    ...asset("nanotech", "atmos-nanotech-105-g-min", -7),
    bpm: 105,
    key: "G minor toward F",
    transposeCents: -200,
    durationSeconds: 17.836,
    stateCompatibility: Object.freeze(["critical"]),
  }),
  "new-punks": Object.freeze({
    ...asset("new-punks", "atmos-new-punks-100-c-min", -3),
    bpm: 100,
    key: "C minor dominant relation to F",
    transposeCents: 0,
    durationSeconds: 18.353,
    stateCompatibility: Object.freeze(["healthy", "warning"]),
  }),
});

export const BASS_LOOPS = Object.freeze({
  "neo-tokyo": Object.freeze({
    ...asset("neo-tokyo", "bassloop-neo-tokyo-100-f", -12),
    bpm: 100,
    key: "F / D minor compatible",
    transposeCents: 0,
    durationSeconds: 9.6,
    playableBeats: 16,
    stateCompatibility: Object.freeze(["warning", "critical"]),
  }),
  "sequenced-bass": Object.freeze({
    ...asset("sequenced-bass", "bassloop-sequenced-100-f-min", -14),
    bpm: 100,
    key: "F minor",
    transposeCents: 0,
    durationSeconds: 9.6,
    playableBeats: 16,
    stateCompatibility: Object.freeze(["healthy", "warning"]),
  }),
  "evil-bass": Object.freeze({
    ...asset("evil-bass", "bassloop-evil-100-f-min", -16),
    bpm: 100,
    key: "F minor",
    transposeCents: 0,
    durationSeconds: 9.6,
    playableBeats: 16,
    stateCompatibility: Object.freeze(["healthy", "warning"]),
  }),
  "distorted-guitar": Object.freeze({
    ...asset("distorted-guitar", "bassloop-distorted-guitar-105-f", -16),
    bpm: 105,
    key: "F root/fifth",
    transposeCents: 0,
    durationSeconds: 9.143,
    playableBeats: 16,
    stateCompatibility: Object.freeze(["critical"]),
  }),
});

export const SAMPLE_LIBRARY = Object.freeze({
  ...DRUM_SAMPLES,
  ...BASS_SAMPLES,
  ...LEAD_LOOPS,
  ...ATMOSPHERE_LOOPS,
  ...BASS_LOOPS,
});

export const ASSET_TIERS = Object.freeze({
  tier1: Object.freeze([
    DRUM_SAMPLES["kick-aggressive"],
    DRUM_SAMPLES["kick-crispy"],
    DRUM_SAMPLES["kick-punchier"],
    DRUM_SAMPLES["kick-subtle"],
    DRUM_SAMPLES["snare-aggressive"],
    DRUM_SAMPLES["snare-bright"],
    DRUM_SAMPLES["snare-clip"],
    DRUM_SAMPLES["snare-regular"],
    DRUM_SAMPLES["hat-classic"],
    DRUM_SAMPLES["hat-hard"],
    DRUM_SAMPLES["hat-subtle"],
    DRUM_SAMPLES["crash-crisp"],
    DRUM_SAMPLES["fx-tapestop"],
    BASS_SAMPLES["bass-transformer"],
    BASS_SAMPLES["bass-doom"],
  ]),
  tier2: Object.freeze([
    DRUM_SAMPLES["hat-aggressive"],
    DRUM_SAMPLES["hat-layer"],
    DRUM_SAMPLES["perc-ac-unit-1"],
    DRUM_SAMPLES["perc-ac-unit-3"],
    DRUM_SAMPLES["perc-ac-unit-6"],
    DRUM_SAMPLES["perc-stick"],
    BASS_SAMPLES["bass-angry"],
    BASS_SAMPLES["bass-percussive"],
    BASS_SAMPLES["bass-burial"],
    BASS_SAMPLES["bass-deep"],
    LEAD_LOOPS.geneticist,
    LEAD_LOOPS["no-alternative"],
    LEAD_LOOPS["background-saws"],
    LEAD_LOOPS["future-synth"],
    LEAD_LOOPS["acid-synth"],
    LEAD_LOOPS["wobbly-synth"],
    BASS_LOOPS["neo-tokyo"],
    BASS_LOOPS["sequenced-bass"],
    BASS_LOOPS["evil-bass"],
    BASS_LOOPS["distorted-guitar"],
  ]),
  tier3: Object.freeze([
    ATMOSPHERE_LOOPS.motherboard,
    ATMOSPHERE_LOOPS.nanotech,
    ATMOSPHERE_LOOPS["new-punks"],
  ]),
});

export const STATE_SAMPLE_POOLS = Object.freeze({
  healthy: Object.freeze({
    kick: Object.freeze(["kick-subtle", "kick-crispy", "kick-punchier"]),
    snare: Object.freeze(["snare-bright", "snare-regular", "snare-clip"]),
    hat: Object.freeze(["hat-subtle", "hat-classic", "hat-layer"]),
    metal: Object.freeze(["perc-stick", "perc-ac-unit-1", "perc-ac-unit-6"]),
    bass: Object.freeze(["bass-transformer", "bass-percussive", "bass-burial", "bass-deep", "bass-doom"]),
    bassLoop: Object.freeze([null, "sequenced-bass", "evil-bass", null]),
    lead: Object.freeze(["background-saws", "wobbly-synth", "acid-synth", "geneticist", "no-alternative", "future-synth"]),
    atmosphere: Object.freeze(["new-punks", null]),
  }),
  warning: Object.freeze({
    kick: Object.freeze(["kick-punchier", "kick-crispy", "kick-aggressive"]),
    snare: Object.freeze(["snare-clip", "snare-bright", "snare-aggressive"]),
    hat: Object.freeze(["hat-classic", "hat-hard", "hat-aggressive"]),
    metal: Object.freeze(["perc-ac-unit-1", "perc-ac-unit-3", "perc-stick"]),
    bass: Object.freeze(["bass-transformer", "bass-percussive", "bass-angry", "bass-deep", "bass-doom"]),
    bassLoop: Object.freeze([null, "neo-tokyo", null, "sequenced-bass"]),
    lead: Object.freeze([null, "background-saws", null, "acid-synth"]),
    atmosphere: Object.freeze(["motherboard", "new-punks"]),
  }),
  critical: Object.freeze({
    kick: Object.freeze(["kick-aggressive", "kick-punchier", "kick-crispy"]),
    snare: Object.freeze(["snare-aggressive", "snare-clip", "snare-bright"]),
    hat: Object.freeze(["hat-hard", "hat-aggressive", "hat-classic"]),
    metal: Object.freeze(["perc-ac-unit-3", "perc-ac-unit-6", "perc-stick"]),
    bass: Object.freeze(["bass-percussive", "bass-angry", "bass-doom", "bass-burial"]),
    // Critical uses the native 100 BPM neo-tokyo loop so the foundation plays at
    // playbackRate 1.0. The 105 BPM distorted-guitar cannot run at native rate on
    // the locked 100 BPM transport and is held out of the live pool for now.
    bassLoop: Object.freeze([null, "neo-tokyo", "neo-tokyo", null]),
    lead: Object.freeze([]),
    atmosphere: Object.freeze(["nanotech", "motherboard"]),
  }),
  unknown: Object.freeze({
    kick: Object.freeze(["kick-subtle", "kick-crispy"]),
    snare: Object.freeze(["snare-regular", "snare-bright"]),
    hat: Object.freeze(["hat-subtle", "hat-layer", "hat-classic"]),
    metal: Object.freeze(["perc-ac-unit-6", "perc-stick", "perc-ac-unit-1"]),
    bass: Object.freeze(["bass-transformer", "bass-deep", "bass-burial"]),
    bassLoop: Object.freeze([null]),
    lead: Object.freeze([null, "geneticist"]),
    atmosphere: Object.freeze([null]),
  }),
});


const LIVE_SAMPLE_FALLBACKS = Object.freeze({
  healthy: Object.freeze({ bassLoop: "sequenced-bass", lead: "acid-synth", atmosphere: "new-punks" }),
  warning: Object.freeze({ bassLoop: "neo-tokyo", lead: "acid-synth", atmosphere: "new-punks" }),
  critical: Object.freeze({ bassLoop: "neo-tokyo", lead: null, atmosphere: "new-punks" }),
  unknown: Object.freeze({ bassLoop: null, lead: null, atmosphere: null }),
});

export function samplePoolAnalysis() {
  return Object.freeze(Object.fromEntries(
    Object.entries(STATE_SAMPLE_POOLS).map(([state, pools]) => {
      const kinds = Object.fromEntries(Object.entries(pools).map(([kind, pool]) => {
        const nonNull = pool.filter(Boolean).length;
        return [kind, Object.freeze({ total: pool.length, nonNull, nulls: pool.length - nonNull })];
      }));
      const leadNullRate = kinds.lead.total ? kinds.lead.nulls / kinds.lead.total : 1;
      const atmosphereNullRate = kinds.atmosphere.total
        ? kinds.atmosphere.nulls / kinds.atmosphere.total
        : 1;
      return [state, Object.freeze({
        kinds: Object.freeze(kinds),
        emptyLeadAtmosphereProbability: leadNullRate * atmosphereNullRate,
      })];
    }),
  ));
}

const SECTION_CYCLES = Object.freeze({
  healthy: Object.freeze(["drive", "drive", "lift", "drive", "break", "drive", "lift", "fill"]),
  warning: Object.freeze(["pressure", "drive", "pressure", "fill", "pressure", "break", "lift", "fill"]),
  critical: Object.freeze(["pursuit", "pursuit", "breach", "fill", "pursuit", "break", "redline", "fill"]),
  unknown: Object.freeze(["drift", "drift", "signal", "space", "drift", "signal", "space", "return"]),
});

const HYPER_CYCLES = Object.freeze(["A", "B", "C", "D"]);
const PHRASES_PER_HYPER_CYCLE = 8;

const LEAD_STEP_PATTERNS = Object.freeze({
  healthy: Object.freeze([0, 8, 16, 24]),
  warning: Object.freeze([0, 16]),
  critical: Object.freeze([]),
  unknown: Object.freeze([0, 16]),
});

const LEAD_SOURCE_BEATS = Object.freeze([0, 4, 8, 12, 16, 20, 24, 28]);
const PERFORMANCE_FIELD_FOR_KIND = Object.freeze({
  kick: "kickTimbre",
  snare: "snareTimbre",
  hat: "hatTimbre",
  metal: "metalTimbre",
  bass: "bassTimbre",
  bassLoop: "bassLoopTimbre",
  lead: "leadTimbre",
  atmosphere: "atmosphereTimbre",
});

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function normalizedState(scoreState) {
  return STATE_SAMPLE_POOLS[scoreState] ? scoreState : "unknown";
}

function poolIndex(value, length) {
  return ((integer(value) % length) + length) % length;
}

export function hyperCycleForPhrase(phraseIndex = 0) {
  const cycle = poolIndex(
    Math.floor(integer(phraseIndex) / PHRASES_PER_HYPER_CYCLE),
    HYPER_CYCLES.length,
  );
  return HYPER_CYCLES[cycle];
}

export function sectionForPhrase(scoreState, phraseIndex = 0, performance = null) {
  const state = normalizedState(scoreState);
  const cycle = SECTION_CYCLES[state];
  const offset = integer(performance?.sectionVariant);
  return cycle[poolIndex(integer(phraseIndex) + offset, cycle.length)];
}

function sampleForKind(kind, id) {
  if (!id) return null;
  if (kind === "lead") return LEAD_LOOPS[id] ?? null;
  if (kind === "bassLoop") return BASS_LOOPS[id] ?? null;
  if (kind === "atmosphere") return ATMOSPHERE_LOOPS[id] ?? null;
  if (kind === "bass") return BASS_SAMPLES[id] ?? null;
  return DRUM_SAMPLES[id] ?? null;
}

function compatiblePool(kind, state, rawPool) {
  return rawPool.filter((id) => {
    if (id === null) return true;
    const sample = sampleForKind(kind, id);
    return !sample?.stateCompatibility || sample.stateCompatibility.includes(state);
  });
}

export function sampleIdForEvent(
  kind,
  scoreState,
  step = 0,
  phraseIndex = 0,
  performance = null,
) {
  const state = normalizedState(scoreState);
  const rawPool = STATE_SAMPLE_POOLS[state][kind];
  if (!rawPool?.length) return null;
  const pool = compatiblePool(kind, state, rawPool);
  if (!pool.length) return null;
  const field = PERFORMANCE_FIELD_FOR_KIND[kind];
  const base = integer(performance?.[field]);
  const section = sectionForPhrase(state, phraseIndex, performance);
  const sectionShift = section === "fill" || section === "lift" || section === "breach"
    ? 1
    : section === "break" || section === "space"
      ? -1
      : 0;
  const hyperShift = Math.max(0, HYPER_CYCLES.indexOf(hyperCycleForPhrase(phraseIndex)));
  return pool[poolIndex(base + sectionShift + hyperShift, pool.length)];
}

export function resolveSamplePalette(scoreState, performance = null, phraseIndex = 0) {
  const state = normalizedState(scoreState);
  const palette = {
    kick: sampleIdForEvent("kick", state, 0, phraseIndex, performance),
    snare: sampleIdForEvent("snare", state, 0, phraseIndex, performance),
    hat: sampleIdForEvent("hat", state, 0, phraseIndex, performance),
    metal: sampleIdForEvent("metal", state, 0, phraseIndex, performance),
    bass: sampleIdForEvent("bass", state, 0, phraseIndex, performance),
    bassLoop: sampleIdForEvent("bassLoop", state, 0, phraseIndex, performance),
    lead: sampleIdForEvent("lead", state, 0, phraseIndex, performance),
    atmosphere: sampleIdForEvent("atmosphere", state, 0, phraseIndex, performance),
    section: sectionForPhrase(state, phraseIndex, performance),
    hyperCycle: hyperCycleForPhrase(phraseIndex),
  };
  if (performance?.liveDirected) {
    const fallback = LIVE_SAMPLE_FALLBACKS[state];
    palette.bassLoop = palette.bassLoop ?? fallback.bassLoop;
    palette.lead = fallback.lead;
    palette.atmosphere = fallback.atmosphere;
    palette.metal = "perc-stick";
  }
  return Object.freeze({
    ...palette,
    signature: Object.values(palette).join(":"),
  });
}

export function leadSliceForStep(
  scoreState,
  step,
  phraseIndex = 0,
  performance = null,
) {
  const state = normalizedState(scoreState);
  if (!Number.isInteger(step) || step < 0 || step >= 32) return null;
  const pattern = LEAD_STEP_PATTERNS[state];
  const eventIndex = pattern.indexOf(step);
  if (eventIndex === -1) return null;
  const section = sectionForPhrase(state, phraseIndex, performance);
  if ((section === "break" || section === "space") && eventIndex % 2 === 1) return null;
  const sliceVariant = integer(performance?.leadSliceVariant);
  const sourceBeat = LEAD_SOURCE_BEATS[
    poolIndex(eventIndex + sliceVariant + integer(phraseIndex), LEAD_SOURCE_BEATS.length)
  ];
  const durationBeats = state === "unknown"
    ? 2
    : state === "critical"
      ? 0.75
      : section === "lift" || section === "fill"
        ? 1
        : 1.5;
  const stateVelocity = state === "critical"
    ? 0.68
    : state === "warning"
      ? 0.58
      : state === "unknown"
        ? 0.32
        : 0.5;
  return Object.freeze({
    sourceBeat,
    durationBeats,
    velocity: Math.min(0.76, stateVelocity + (performance?.energy ?? 0.5) * 0.08),
    section,
  });
}

export function allSampleAssets() {
  return Object.freeze(Object.values(SAMPLE_LIBRARY));
}

export { pickAudioFormat };
