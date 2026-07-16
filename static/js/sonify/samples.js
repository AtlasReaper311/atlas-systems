/**
 * Deterministic sample palette and section grammar for System SYMPHONY.
 *
 * This module is deliberately pure. It owns asset metadata and seeded musical
 * choices, while engine.js remains the only module that constructs Tone.js
 * nodes or starts audio playback.
 */

export const SAMPLE_ASSET_VERSION = "20260716-system-symphony-expanded-library";
export const SAMPLE_ASSET_BASE = "/static/audio/system-symphony/";

const assetUrl = (file) => (
  `${SAMPLE_ASSET_BASE}${file}?v=${SAMPLE_ASSET_VERSION}`
);

const asset = (id, file, gainDb = 0) => Object.freeze({
  id,
  file,
  url: assetUrl(file),
  gainDb,
});

export const DRUM_SAMPLES = Object.freeze({
  "kick-aggressive": asset("kick-aggressive", "kick-aggressive.wav", -2.5),
  "kick-crispy": asset("kick-crispy", "kick-crispy.wav", -2),
  "kick-punchier": asset("kick-punchier", "kick-punchier.wav", -2.5),
  "kick-subtle": asset("kick-subtle", "kick-subtle.wav", -1.5),
  "snare-aggressive": asset("snare-aggressive", "snare-aggressive.wav", -4),
  "snare-bright": asset("snare-bright", "snare-bright.wav", -3.5),
  "snare-clip": asset("snare-clip", "snare-clip.wav", -3),
  "snare-regular": asset("snare-regular", "snare-regular.wav", -3.5),
  "hat-aggressive": asset("hat-aggressive", "hat-aggressive.wav", -7),
  "hat-classic": asset("hat-classic", "hat-classic.wav", -6.5),
  "hat-hard": asset("hat-hard", "hat-hard.wav", -7),
  "hat-layer": asset("hat-layer", "hat-layer.wav", -8),
  "hat-subtle": asset("hat-subtle", "hat-subtle.wav", -6),
  "perc-ac-unit-1": asset("perc-ac-unit-1", "perc-ac-unit-1.wav", 1.5),
  "perc-ac-unit-3": asset("perc-ac-unit-3", "perc-ac-unit-3.wav", 0.5),
  "perc-ac-unit-6": asset("perc-ac-unit-6", "perc-ac-unit-6.wav", 2),
  "perc-stick": asset("perc-stick", "perc-stick.wav", -5),
  "crash-crisp": asset("crash-crisp", "crash-crisp.wav", -7),
  "fx-tapestop": asset("fx-tapestop", "fx-tapestop.wav", -6),
});

export const BASS_SAMPLES = Object.freeze({
  "bass-transformer": Object.freeze({
    ...asset("bass-transformer", "bass-transformer-a0.wav", -5),
    rootNote: "A0",
  }),
  "bass-angry": Object.freeze({
    ...asset("bass-angry", "bass-angry-d1.wav", -8),
    rootNote: "D1",
  }),
  "bass-percussive": Object.freeze({
    ...asset("bass-percussive", "bass-percussive-d-sharp1.wav", -8.5),
    rootNote: "D#1",
  }),
  "bass-burial": Object.freeze({
    ...asset("bass-burial", "bass-burial-c1.wav", -8),
    rootNote: "C1",
  }),
  "bass-deep": Object.freeze({
    ...asset("bass-deep", "bass-deep-c1.wav", -5.5),
    rootNote: "C1",
  }),
  "bass-doom": Object.freeze({
    ...asset("bass-doom", "bass-doom-c1.wav", -7.5),
    rootNote: "C1",
  }),
});

export const LEAD_LOOPS = Object.freeze({
  geneticist: Object.freeze({
    ...asset("geneticist", "lead-geneticist-96-e-min.wav", -7),
    bpm: 96,
    key: "E minor",
    transposeCents: -200,
    durationSeconds: 20,
    playableEndSeconds: 18.16,
    playableBeats: 28,
  }),
  "no-alternative": Object.freeze({
    ...asset("no-alternative", "lead-no-alternative-100-e-min.wav", -5),
    bpm: 100,
    key: "E minor",
    transposeCents: -200,
    durationSeconds: 19.2,
    playableEndSeconds: 19.2,
    playableBeats: 32,
  }),
  "background-saws": Object.freeze({
    ...asset("background-saws", "lead-background-saws-100-d-min.wav", -9),
    bpm: 100,
    key: "D minor",
    transposeCents: 0,
    durationSeconds: 4.8,
    playableEndSeconds: 4.8,
    playableBeats: 8,
  }),
  "future-synth": Object.freeze({
    ...asset("future-synth", "lead-future-synth-100-e-min.wav", -8),
    bpm: 100,
    key: "E minor",
    transposeCents: -200,
    durationSeconds: 4.8,
    playableEndSeconds: 4.8,
    playableBeats: 8,
  }),
  "acid-synth": Object.freeze({
    ...asset("acid-synth", "lead-acid-synth-100-f-min.wav", -11),
    bpm: 100,
    key: "F minor",
    transposeCents: -300,
    durationSeconds: 9.6,
    playableEndSeconds: 9.6,
    playableBeats: 16,
  }),
  "wobbly-synth": Object.freeze({
    ...asset("wobbly-synth", "lead-wobbly-synth-104-d-sharp-min.wav", -7),
    bpm: 104,
    key: "D# minor",
    transposeCents: -100,
    durationSeconds: 9.231,
    playableEndSeconds: 9.231,
    playableBeats: 16,
  }),
});

export const ATMOSPHERE_LOOPS = Object.freeze({
  motherboard: Object.freeze({
    ...asset("motherboard", "atmos-motherboard-106-d-sharp-min.wav", -3),
    bpm: 106,
    key: "D# minor",
    transposeCents: -100,
    durationSeconds: 18.113,
  }),
  nanotech: Object.freeze({
    ...asset("nanotech", "atmos-nanotech-105-g-min.wav", -7),
    bpm: 105,
    key: "G minor",
    transposeCents: -500,
    durationSeconds: 18.286,
  }),
  "new-punks": Object.freeze({
    ...asset("new-punks", "atmos-new-punks-100-c-min.wav", -3),
    bpm: 100,
    key: "C minor",
    transposeCents: 200,
    durationSeconds: 19.2,
  }),
});

export const BASS_LOOPS = Object.freeze({
  "neo-tokyo": Object.freeze({
    ...asset("neo-tokyo", "bassloop-neo-tokyo-100-f.wav", -12),
    bpm: 100,
    key: "F / D minor compatible",
    transposeCents: 0,
    durationSeconds: 9.6,
    playableBeats: 16,
  }),
  "sequenced-bass": Object.freeze({
    ...asset("sequenced-bass", "bassloop-sequenced-100-f-min.wav", -12),
    bpm: 100,
    key: "F minor",
    transposeCents: -300,
    durationSeconds: 9.6,
    playableBeats: 16,
  }),
  "evil-bass": Object.freeze({
    ...asset("evil-bass", "bassloop-evil-100-f-min.wav", -14),
    bpm: 100,
    key: "F minor",
    transposeCents: -300,
    durationSeconds: 9.6,
    playableBeats: 16,
  }),
  "distorted-guitar": Object.freeze({
    ...asset("distorted-guitar", "bassloop-distorted-guitar-105-f.wav", -14),
    bpm: 105,
    key: "F root/fifth",
    transposeCents: -300,
    durationSeconds: 9.143,
    playableBeats: 16,
  }),
});

export const SAMPLE_LIBRARY = Object.freeze({
  ...DRUM_SAMPLES,
  ...BASS_SAMPLES,
  ...LEAD_LOOPS,
  ...ATMOSPHERE_LOOPS,
  ...BASS_LOOPS,
});

const STATE_SAMPLE_POOLS = Object.freeze({
  healthy: Object.freeze({
    kick: Object.freeze(["kick-subtle", "kick-crispy", "kick-punchier"]),
    snare: Object.freeze(["snare-bright", "snare-regular", "snare-clip"]),
    hat: Object.freeze(["hat-subtle", "hat-classic", "hat-layer"]),
    metal: Object.freeze(["perc-stick", "perc-ac-unit-1", "perc-ac-unit-6"]),
    bass: Object.freeze(["bass-transformer", "bass-percussive", "bass-burial", "bass-deep", "bass-doom"]),
    bassLoop: Object.freeze([null, "neo-tokyo", "sequenced-bass", "evil-bass"]),
    lead: Object.freeze(["geneticist", "no-alternative", "background-saws", "future-synth", "acid-synth", "wobbly-synth"]),
    atmosphere: Object.freeze(["new-punks", "motherboard", "nanotech"]),
  }),
  warning: Object.freeze({
    kick: Object.freeze(["kick-punchier", "kick-crispy", "kick-aggressive"]),
    snare: Object.freeze(["snare-clip", "snare-bright", "snare-aggressive"]),
    hat: Object.freeze(["hat-classic", "hat-hard", "hat-aggressive"]),
    metal: Object.freeze(["perc-ac-unit-1", "perc-ac-unit-3", "perc-stick"]),
    bass: Object.freeze(["bass-transformer", "bass-percussive", "bass-angry", "bass-deep", "bass-doom"]),
    bassLoop: Object.freeze([null, "neo-tokyo", null]),
    lead: Object.freeze([]),
    atmosphere: Object.freeze(["motherboard", "new-punks", "nanotech"]),
  }),
  critical: Object.freeze({
    kick: Object.freeze(["kick-aggressive", "kick-punchier", "kick-crispy"]),
    snare: Object.freeze(["snare-aggressive", "snare-clip", "snare-bright"]),
    hat: Object.freeze(["hat-hard", "hat-aggressive", "hat-classic"]),
    metal: Object.freeze(["perc-ac-unit-3", "perc-ac-unit-6", "perc-stick"]),
    bass: Object.freeze(["bass-percussive", "bass-angry", "bass-doom", "bass-burial"]),
    bassLoop: Object.freeze([null, "distorted-guitar", null]),
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
    lead: Object.freeze([]),
    atmosphere: Object.freeze([null]),
  }),
});

const SECTION_CYCLES = Object.freeze({
  healthy: Object.freeze(["drive", "drive", "lift", "drive", "break", "drive", "lift", "fill"]),
  warning: Object.freeze(["pressure", "drive", "pressure", "fill", "pressure", "break", "lift", "fill"]),
  critical: Object.freeze(["pursuit", "pursuit", "breach", "fill", "pursuit", "break", "redline", "fill"]),
  unknown: Object.freeze(["drift", "drift", "signal", "space", "drift", "signal", "space", "return"]),
});

const LEAD_STEP_PATTERNS = Object.freeze({
  healthy: Object.freeze([0, 7, 16, 23]),
  warning: Object.freeze([]),
  critical: Object.freeze([]),
  unknown: Object.freeze([]),
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

export function sectionForPhrase(scoreState, phraseIndex = 0, performance = null) {
  const state = normalizedState(scoreState);
  const cycle = SECTION_CYCLES[state];
  const offset = integer(performance?.sectionVariant);
  return cycle[poolIndex(integer(phraseIndex) + offset, cycle.length)];
}

export function sampleIdForEvent(
  kind,
  scoreState,
  step = 0,
  phraseIndex = 0,
  performance = null,
) {
  const state = normalizedState(scoreState);
  const pool = STATE_SAMPLE_POOLS[state][kind];
  if (!pool?.length) return null;
  const field = PERFORMANCE_FIELD_FOR_KIND[kind];
  const base = integer(performance?.[field]);
  const section = sectionForPhrase(state, phraseIndex, performance);
  const sectionShift = section === "fill" || section === "lift" || section === "breach"
    ? 1
    : section === "break" || section === "space"
      ? -1
      : 0;
  return pool[poolIndex(base + sectionShift, pool.length)];
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
  };
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
