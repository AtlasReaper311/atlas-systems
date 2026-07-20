from __future__ import annotations

import re
from pathlib import Path

BUILD_ID = "20260720-system-symphony-loop-production-v2"
ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_all(text: str, old: str, new: str, label: str, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"{label}: expected at least {minimum} matches, found {count}")
    return text.replace(old, new)


# PART 1: Retune the score around the F/Fm sample cluster and keep tempo ratios near native loops.
mapping = read("static/js/sonify/mapping.js")
mapping = replace_once(mapping, "export const ROOT_MIDI = 38; // D2", "export const ROOT_MIDI = 41; // F2", "mapping root")
mapping = replace_once(mapping, 'mode: "D Aeolian",\n    bpm: 112,', 'mode: "F Aeolian",\n    bpm: 100,', "healthy mode")
mapping = replace_once(mapping, 'mode: "D Phrygian",\n    bpm: 118,', 'mode: "F Phrygian",\n    bpm: 106,', "warning mode")
mapping = replace_once(mapping, 'mode: "D Phrygian dominant",\n    bpm: 128,', 'mode: "F Phrygian dominant",\n    bpm: 112,', "critical mode")
mapping = replace_once(mapping, 'mode: "D suspended",\n    bpm: 96,', 'mode: "F suspended",\n    bpm: 96,', "unknown mode")
mapping = replace_once(
    mapping,
    '  "analog-pad": 40,\n  "data-sequence": 45,\n  "industrial-pulse": 38,\n  "edge-saw": 40,\n  "sub-drone": 33,\n  "relay-bass": 33,\n  "tape-signal": 43,',
    '  "analog-pad": 43,\n  "data-sequence": 48,\n  "industrial-pulse": 41,\n  "edge-saw": 43,\n  "sub-drone": 36,\n  "relay-bass": 36,\n  "tape-signal": 46,',
    "family registers",
)
mapping = replace_once(
    mapping,
    '  "analog-pad": Object.freeze({ minimum: 33, maximum: 57 }),\n  "data-sequence": Object.freeze({ minimum: 38, maximum: 62 }),\n  "industrial-pulse": Object.freeze({ minimum: 33, maximum: 57 }),\n  "edge-saw": Object.freeze({ minimum: 33, maximum: 60 }),\n  "sub-drone": Object.freeze({ minimum: 26, maximum: 50 }),\n  "relay-bass": Object.freeze({ minimum: 28, maximum: 52 }),\n  "tape-signal": Object.freeze({ minimum: 36, maximum: 60 }),',
    '  "analog-pad": Object.freeze({ minimum: 36, maximum: 60 }),\n  "data-sequence": Object.freeze({ minimum: 41, maximum: 65 }),\n  "industrial-pulse": Object.freeze({ minimum: 36, maximum: 60 }),\n  "edge-saw": Object.freeze({ minimum: 36, maximum: 63 }),\n  "sub-drone": Object.freeze({ minimum: 29, maximum: 53 }),\n  "relay-bass": Object.freeze({ minimum: 31, maximum: 55 }),\n  "tape-signal": Object.freeze({ minimum: 39, maximum: 63 }),',
    "family ranges",
)
mapping = replace_once(mapping, 'motifLabel: `degrees ${motif.join("-")} around D`,', 'motifLabel: `degrees ${motif.join("-")} around F`,', "motif label")
mapping = replace_once(mapping, '    masterFilterHz: score.masterFilterHz,\n    transitionSeconds: score.transitionSeconds,', '    masterFilterHz: score.masterFilterHz,\n    masterHpHz: score.masterHpHz,\n    transitionSeconds: score.transitionSeconds,', "master hp frame")
write("static/js/sonify/mapping.js", mapping)


# PART 2: Make live sample palettes intentional, remove deep granular transposition, and preserve Ghost variation.
samples = read("static/js/sonify/samples.js")
samples = replace_once(samples, 'export const SAMPLE_ASSET_VERSION = "20260718-system-symphony-h1-h8-preview";', f'export const SAMPLE_ASSET_VERSION = "{BUILD_ID}";', "sample asset version")
for old, new, label in [
    ('...asset("geneticist", "lead-geneticist-96-e-min", -7),\n    bpm: 96,\n    key: "E minor",\n    transposeCents: -200,', '...asset("geneticist", "lead-geneticist-96-e-min", -8),\n    bpm: 96,\n    key: "E minor toward F",\n    transposeCents: 100,', "geneticist retune"),
    ('...asset("no-alternative", "lead-no-alternative-100-e-min", -5),\n    bpm: 100,\n    key: "E minor",\n    transposeCents: -200,', '...asset("no-alternative", "lead-no-alternative-100-e-min", -7),\n    bpm: 100,\n    key: "E minor toward F",\n    transposeCents: 100,', "no alternative retune"),
    ('...asset("background-saws", "lead-background-saws-100-d-min", -9),\n    bpm: 100,\n    key: "D minor",\n    transposeCents: 0,', '...asset("background-saws", "lead-background-saws-100-d-min", -11),\n    bpm: 100,\n    key: "D minor toward F",\n    transposeCents: 300,', "background saws retune"),
    ('...asset("future-synth", "lead-future-synth-100-e-min", -8),\n    bpm: 100,\n    key: "E minor",\n    transposeCents: -200,', '...asset("future-synth", "lead-future-synth-100-e-min", -9),\n    bpm: 100,\n    key: "E minor toward F",\n    transposeCents: 100,', "future synth retune"),
    ('...asset("acid-synth", "lead-acid-synth-100-f-min", -11),\n    bpm: 100,\n    key: "F minor",\n    transposeCents: -300,', '...asset("acid-synth", "lead-acid-synth-100-f-min", -13),\n    bpm: 100,\n    key: "F minor",\n    transposeCents: 0,', "acid retune"),
    ('grainSize: 0.09,\n    grainOverlap: 0.05,', 'grainSize: 0.07,\n    grainOverlap: 0.035,', "acid grain"),
    ('...asset("wobbly-synth", "lead-wobbly-synth-104-d-sharp-min", -7),\n    bpm: 104,\n    key: "D# minor",\n    transposeCents: -100,', '...asset("wobbly-synth", "lead-wobbly-synth-104-d-sharp-min", -10),\n    bpm: 104,\n    key: "D# minor toward F",\n    transposeCents: 200,', "wobbly retune"),
    ('key: "D# minor",\n    transposeCents: -100,', 'key: "D# minor toward F",\n    transposeCents: 200,', "motherboard retune"),
    ('key: "G minor",\n    transposeCents: -500,', 'key: "G minor toward F",\n    transposeCents: -200,', "nanotech retune"),
    ('key: "C minor",\n    transposeCents: 200,', 'key: "C minor dominant relation to F",\n    transposeCents: 0,', "new punks relation"),
    ('...asset("sequenced-bass", "bassloop-sequenced-100-f-min", -12),\n    bpm: 100,\n    key: "F minor",\n    transposeCents: -300,', '...asset("sequenced-bass", "bassloop-sequenced-100-f-min", -14),\n    bpm: 100,\n    key: "F minor",\n    transposeCents: 0,', "sequenced bass retune"),
    ('...asset("evil-bass", "bassloop-evil-100-f-min", -14),\n    bpm: 100,\n    key: "F minor",\n    transposeCents: -300,', '...asset("evil-bass", "bassloop-evil-100-f-min", -16),\n    bpm: 100,\n    key: "F minor",\n    transposeCents: 0,', "evil bass retune"),
    ('...asset("distorted-guitar", "bassloop-distorted-guitar-105-f", -14),\n    bpm: 105,\n    key: "F root/fifth",\n    transposeCents: -300,', '...asset("distorted-guitar", "bassloop-distorted-guitar-105-f", -16),\n    bpm: 105,\n    key: "F root/fifth",\n    transposeCents: 0,', "distorted bass retune"),
]:
    samples = replace_once(samples, old, new, label)
samples = replace_once(samples, 'const STATE_SAMPLE_POOLS = Object.freeze({', 'export const STATE_SAMPLE_POOLS = Object.freeze({', "export state pools")
samples = replace_once(samples, 'lead: Object.freeze([null, "background-saws", null, "wobbly-synth"]),', 'lead: Object.freeze([null, "background-saws", null, "acid-synth"]),', "warning live-compatible leads")
fallbacks = '''
const LIVE_SAMPLE_FALLBACKS = Object.freeze({
  healthy: Object.freeze({ bassLoop: "sequenced-bass", lead: "acid-synth", atmosphere: "new-punks" }),
  warning: Object.freeze({ bassLoop: "neo-tokyo", lead: "acid-synth", atmosphere: "motherboard" }),
  critical: Object.freeze({ bassLoop: "distorted-guitar", lead: null, atmosphere: "nanotech" }),
  unknown: Object.freeze({ bassLoop: null, lead: "geneticist", atmosphere: null }),
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
'''
samples = replace_once(samples, 'const SECTION_CYCLES = Object.freeze({', fallbacks + '\nconst SECTION_CYCLES = Object.freeze({', "live sample fallbacks")
samples = replace_once(
    samples,
    '''  if (performance?.liveDirected) {
    palette.bassLoop = null;
    palette.metal = "perc-stick";
    if (palette.lead === "wobbly-synth") palette.lead = "background-saws";
  }''',
    '''  if (performance?.liveDirected) {
    const fallback = LIVE_SAMPLE_FALLBACKS[state];
    palette.bassLoop = palette.bassLoop ?? fallback.bassLoop;
    palette.lead = palette.lead ?? fallback.lead;
    palette.atmosphere = palette.atmosphere ?? fallback.atmosphere;
    palette.metal = "perc-stick";
    if (palette.lead === "wobbly-synth") palette.lead = fallback.lead;
  }''',
    "live palette policy",
)
write("static/js/sonify/samples.js", samples)


# PART 3: Use non-granular players when pitch shifting is unnecessary and play full loop phrases.
sampler = read("static/js/sonify/sampler.js")
sampler = replace_all(sampler, "20260720-system-symphony-composition-director", BUILD_ID, "sampler module cache tokens", minimum=3)
insert_after_clamp = '''function clampPlaybackRate(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, value));
}
'''
helper = insert_after_clamp + '''
export function bassLoopPlaybackPlan(sample, targetBpm) {
  if (!sample || !Number.isFinite(sample.bpm) || !Number.isFinite(sample.playableBeats)) return null;
  const requestedRate = Number(targetBpm) / sample.bpm;
  const playbackRate = clampPlaybackRate(requestedRate);
  const outputDuration = sample.playableBeats * 60 / Math.max(1, Number(targetBpm) || sample.bpm);
  return Object.freeze({
    requestedRate,
    playbackRate,
    rateWasClamped: Math.abs(playbackRate - requestedRate) > 0.0001,
    sourceOffset: 0,
    outputDuration,
    playableBeats: sample.playableBeats,
  });
}
'''
sampler = replace_once(sampler, insert_after_clamp, helper, "bass loop playback helper")
old_leads = '''    const voices = Array.from({ length: 4 }, () => {
      const voice = new Tone.GrainPlayer({
        grainSize: sample.grainSize ?? 0.14,
        overlap: sample.grainOverlap ?? 0.07,
        loop: false,
        volume: sample.gainDb,
      });
      voice.buffer = buffer;
      voice.connect(leadBus);
      return voice;
    });'''
new_leads = '''    const voices = Array.from({ length: 4 }, () => {
      const granular = Math.abs(sample.transposeCents ?? 0) > 0.01;
      const voice = granular
        ? new Tone.GrainPlayer({
          grainSize: sample.grainSize ?? 0.1,
          overlap: sample.grainOverlap ?? 0.045,
          loop: false,
          volume: sample.gainDb,
        })
        : new Tone.Player({
          fadeIn: 0.006,
          fadeOut: 0.025,
          volume: sample.gainDb,
        });
      voice.buffer = buffer;
      voice.__atlasGranular = granular;
      voice.connect(leadBus);
      return voice;
    });'''
sampler = replace_once(sampler, old_leads, new_leads, "lead player mode")
old_bass_voices = '''    const voices = Array.from({ length: 2 }, () => {
      const voice = new Tone.GrainPlayer({
        grainSize: 0.12,
        overlap: 0.06,
        loop: false,
        fadeIn: 0.008,
        fadeOut: 0.025,
        volume: sample.gainDb,
      });
      voice.buffer = buffer;
      voice.connect(bassLoopBus);
      return voice;
    });'''
new_bass_voices = '''    const voices = Array.from({ length: 2 }, () => {
      const voice = new Tone.Player({
        fadeIn: 0.008,
        fadeOut: 0.035,
        volume: sample.gainDb,
      });
      voice.buffer = buffer;
      voice.connect(bassLoopBus);
      return voice;
    });'''
sampler = replace_once(sampler, old_bass_voices, new_bass_voices, "bass loop player mode")
old_atmos = '''    const player = new Tone.GrainPlayer({
      grainSize: 0.4,
      overlap: 0.2,
      loop: true,
      volume: sample.gainDb,
    });
    player.buffer = buffer;
    player.connect(gain);
    const entry = { player, gain, sample, isPlaying: false };'''
new_atmos = '''    const granular = Math.abs(sample.transposeCents ?? 0) > 0.01;
    const player = granular
      ? new Tone.GrainPlayer({ grainSize: 0.24, overlap: 0.1, loop: true, volume: sample.gainDb })
      : new Tone.Player({ loop: true, fadeIn: 0.04, fadeOut: 0.08, volume: sample.gainDb });
    player.buffer = buffer;
    player.connect(gain);
    const entry = { player, gain, sample, granular, isPlaying: false };'''
sampler = replace_once(sampler, old_atmos, new_atmos, "atmosphere player mode")
sampler = replace_once(sampler, '    setDetune(entry.player, entry.sample.transposeCents);', '    if (entry.granular) setDetune(entry.player, entry.sample.transposeCents);', "atmosphere detune")
old_phrase = '''  function playBassPhrase(time, frame, step, phraseIndex, performance = null) {
    if (!ready || !performance || step % 8 !== 0) return false;
    const palette = resolveSamplePalette(frame?.scoreState, performance, phraseIndex);
    const sample = BASS_LOOPS[palette.bassLoop];
    const voices = ensureBassLoopVoices(palette.bassLoop);
    if (!sample || !voices?.length) return false;
    const targetBpm = performance.targetBpm ?? frame?.bpm ?? sample.bpm;
    const sourceMeasures = Math.max(1, Math.floor(sample.playableBeats / 4));
    const measureIndex = phraseIndex * 4 + Math.floor(step / 8);
    const sourceMeasure = (
      measureIndex + (performance.bassLoopSliceVariant ?? 0)
    ) % sourceMeasures;
    const sourceOffset = sourceMeasure * 4 * 60 / sample.bpm;
    const outputDuration = 4 * 60 / targetBpm;
    const voice = voices[bassLoopVoiceCursor % voices.length];
    bassLoopVoiceCursor += 1;
    voice.playbackRate = clampPlaybackRate(targetBpm / sample.bpm);
    setDetune(voice, sample.transposeCents);
    const liveRestraint = performance.liveDirected ? 0.84 : 1;
    setVolume(
      voice,
      (0.42 + (performance.energy ?? 0.5) * 0.14) * liveRestraint,
      sample.gainDb,
    );
    try {
      voice.start(time, sourceOffset, Math.max(0.5, outputDuration));
      return true;
    } catch (error) {
      console.warn(`system-symphony: bass loop ${sample.id} could not trigger`, error);
      return false;
    }
  }'''
new_phrase = '''  function playBassPhrase(time, frame, step, phraseIndex, performance = null) {
    if (!ready || !performance || step !== 0) return false;
    const palette = resolveSamplePalette(frame?.scoreState, performance, phraseIndex);
    const sample = BASS_LOOPS[palette.bassLoop];
    const voices = ensureBassLoopVoices(palette.bassLoop);
    if (!sample || !voices?.length) return false;
    const targetBpm = performance.targetBpm ?? frame?.bpm ?? sample.bpm;
    const plan = bassLoopPlaybackPlan(sample, targetBpm);
    if (!plan) return false;
    const voice = voices[bassLoopVoiceCursor % voices.length];
    bassLoopVoiceCursor += 1;
    voice.playbackRate = plan.playbackRate;
    const liveRestraint = performance.liveDirected ? 0.9 : 1;
    setVolume(
      voice,
      (0.48 + (performance.energy ?? 0.5) * 0.12) * liveRestraint,
      sample.gainDb,
    );
    try {
      voice.start(time, plan.sourceOffset, Math.max(0.5, plan.outputDuration));
      return true;
    } catch (error) {
      console.warn(`system-symphony: bass loop ${sample.id} could not trigger`, error);
      return false;
    }
  }'''
sampler = replace_once(sampler, old_phrase, new_phrase, "full phrase bass loop")
sampler = replace_once(sampler, '    setDetune(voice, sample.transposeCents);\n    voice.reverse = frame?.scoreState === "unknown" && event.section === "space";', '    if (voice.__atlasGranular) setDetune(voice, sample.transposeCents);\n    voice.reverse = frame?.scoreState === "unknown" && event.section === "space";', "lead detune mode")
write("static/js/sonify/sampler.js", sampler)


# PART 4: Add a seeded chord progression dimension to deterministic Demo arrangements.
seed = read("static/js/sonify/seed-dimensions.js")
seed = replace_all(seed, "20260718-system-symphony-ghost-circuit", BUILD_ID, "seed cache tokens")
seed = replace_once(seed, '  chordOffset: 4,', '  chordOffset: 4,\n  chordProgression: 4,', "chord progression dimension")
write("static/js/sonify/seed-dimensions.js", seed)

performance = read("static/js/sonify/performance.js")
performance = replace_all(performance, "20260718-system-symphony-ghost-circuit", BUILD_ID, "performance cache tokens", minimum=3)
performance = replace_once(performance, 'export const PERFORMANCE_SCHEMA_VERSION = 2;', 'export const PERFORMANCE_SCHEMA_VERSION = 3;', "performance schema")
performance = replace_once(performance, '    bpm: 112,', '    bpm: 100,', "demo healthy bpm")
performance = replace_once(performance, '    bpm: 118,', '    bpm: 106,', "demo warning bpm")
performance = replace_once(performance, '    bpm: 128,', '    bpm: 112,', "demo critical bpm")
performance = replace_once(performance, '  const chordOffset = dimensions.chordOffset;\n  const bassPattern = dimensions.bassPattern;', '  const chordOffset = dimensions.chordOffset;\n  const chordProgression = dimensions.chordProgression;\n  const bassPattern = dimensions.bassPattern;', "performance chord progression")
performance = replace_once(performance, '    chordOffset,\n    bassPattern,', '    chordOffset,\n    chordProgression,\n    bassPattern,', "signature chord progression")
performance = replace_once(performance, '    chordOffset,\n    bassPattern,\n    bassShift,', '    chordOffset,\n    chordProgression,\n    bassPattern,\n    bassShift,', "return chord progression")
write("static/js/sonify/performance.js", performance)


# PART 5: Give live composition phrase-stable drop grammar, F-centred tempos, loops and chord variation.
director = read("static/js/sonify/composition-director.js")
director = replace_all(director, "20260720-system-symphony-composition-director", BUILD_ID, "director cache token")
director = replace_once(
    director,
    'function livePerformanceFields(seed, phraseIndex, state, phase, intent, motifVariant, recoveryEnergy) {',
    'function livePerformanceFields(seed, phraseIndex, state, phase, stateAgePhrases, intent, motifVariant, recoveryEnergy) {',
    "live performance signature",
)
director = replace_once(
    director,
    '''  const targetBpm = clamp(
    (state === "critical" ? 126 : state === "warning" ? 118 : state === "unknown" ? 96 : 112)
      + intent.rhythmicPressure * 3
      + intent.deploymentEnergy * 2,
    92,
    132,
  );''',
    '''  const targetBpm = clamp(
    (state === "critical" ? 112 : state === "warning" ? 106 : state === "unknown" ? 96 : 100)
      + intent.rhythmicPressure * 1.5
      + intent.deploymentEnergy,
    94,
    116,
  );
  const stableEnoughForDrop = state !== "unknown" && stateAgePhrases >= 7;
  const dropCycle = stateAgePhrases % 8;
  const dropStage = stableEnoughForDrop && dropCycle === 7
    ? "build"
    : stableEnoughForDrop && dropCycle === 0
      ? "drop"
      : "none";''',
    "director tempos and drops",
)
director = replace_once(director, '    chordOffset: phraseSeed % 4,\n    bassPattern: phraseSeed % 8,', '    chordOffset: phraseSeed % 4,\n    chordProgression: (phraseSeed >>> 2) % 4,\n    bassPattern: phraseSeed % 8,', "live chord progression")
director = replace_once(director, '    bassLoopTimbre: state === "warning" ? 0 : (phraseSeed >>> 19) % 4,', '    bassLoopTimbre: (phraseSeed >>> 19) % 4,', "live loop timbre")
director = replace_once(director, '    recoveryEnergy,\n  };', '    recoveryEnergy,\n    stateAgePhrases,\n    dropStage,\n  };', "drop fields")
director = replace_once(director, '    const root = plan.state === "unknown" ? 50 : 54;', '    const root = plan.state === "unknown" ? 53 : 57;', "motif root retune")
director = replace_once(director, '  let currentState = "unknown";\n  let lastCommittedPressure = latestIntent.pressure;', '  let currentState = "unknown";\n  let lastPlanState = "unknown";\n  let stateAgePhrases = 0;\n  let lastCommittedPressure = latestIntent.pressure;', "director state age vars")
director = replace_once(
    director,
    '''  function advancePhrase() {
    phraseIndex += 1;
    const recoveryEnergy''',
    '''  function advancePhrase() {
    phraseIndex += 1;
    if (currentState === lastPlanState) stateAgePhrases += 1;
    else {
      lastPlanState = currentState;
      stateAgePhrases = 0;
    }
    const recoveryEnergy''',
    "advance state age",
)
director = replace_once(director, '      currentPhase,\n      intent,\n      motifVariant,', '      currentPhase,\n      stateAgePhrases,\n      intent,\n      motifVariant,', "pass state age")
director = replace_once(director, '      currentState,\n      lastCommittedPressure,', '      currentState,\n      stateAgePhrases,\n      lastCommittedPressure,', "snapshot state age")
director = replace_once(director, '      currentState = "unknown";\n      lastCommittedPressure = latestIntent.pressure;', '      currentState = "unknown";\n      lastPlanState = "unknown";\n      stateAgePhrases = 0;\n      lastCommittedPressure = latestIntent.pressure;', "reset state age")
write("static/js/sonify/composition-director.js", director)


# PART 6: Rebuild the engine mix around loops, kick ducking, sub foundation, soft clipping and richer analyzers.
engine = read("static/js/sonify/engine.js")
engine = replace_all(engine, "20260720-system-symphony-composition-director", BUILD_ID, "engine cache tokens", minimum=4)
engine = replace_once(engine, 'export const SYSTEM_SYMPHONY_BUILD_ID = "20260720-system-symphony-coherence-cache-v1";', f'export const SYSTEM_SYMPHONY_BUILD_ID = "{BUILD_ID}";', "engine build id")
engine = replace_once(engine, 'export const PAD_ROOT_MIDI = 38; // D2\nexport const ARP_ROOT_MIDI = 50; // D3\nexport const ARP_MAX_MIDI = 62; // D4\nexport const DRONE_MIDI = Object.freeze([26, 33]); // D1 / A1', 'export const PAD_ROOT_MIDI = 41; // F2\nexport const ARP_ROOT_MIDI = 53; // F3\nexport const ARP_MAX_MIDI = 65; // F4\nexport const DRONE_MIDI = Object.freeze([29, 36]); // F1 / C2\nexport const SUB_ROOT_MIDI = 29; // F1\nexport const SUB_FIFTH_MIDI = 36; // C2', "engine roots")
engine = replace_once(
    engine,
    '''const PAD_CHORDS = Object.freeze({
  healthy: [[0, 2, 4], [0, 3, 5], [4, 6, 1], [0, 2, 5]],
  warning: [[0, 1, 4], [0, 3, 5], [1, 4, 6], [0, 2, 5]],
  critical: [[0, 1, 4], [1, 3, 5], [0, 4, 6], [0, 1, 5]],
  unknown: [[0, 3], [0, 4], [1, 3], [0, 5]],
});''',
    '''const PAD_PROGRESSIONS = Object.freeze({
  healthy: Object.freeze([
    Object.freeze([[0, 2, 4], [0, 3, 5], [4, 6, 1], [0, 2, 5]]),
    Object.freeze([[0, 2, 5], [3, 5, 0], [4, 6, 2], [2, 4, 6]]),
    Object.freeze([[0, 4, 6], [5, 0, 2], [3, 5, 1], [4, 6, 2]]),
    Object.freeze([[0, 2, 4], [5, 1, 3], [3, 5, 0], [4, 1, 6]]),
  ]),
  warning: Object.freeze([
    Object.freeze([[0, 1, 4], [0, 3, 5], [1, 4, 6], [0, 2, 5]]),
    Object.freeze([[0, 1, 5], [3, 5, 0], [1, 4, 6], [4, 6, 2]]),
    Object.freeze([[0, 4, 6], [1, 3, 5], [0, 1, 4], [5, 0, 2]]),
    Object.freeze([[0, 2, 5], [1, 4, 6], [3, 5, 0], [0, 1, 4]]),
  ]),
  critical: Object.freeze([
    Object.freeze([[0, 1, 4], [1, 3, 5], [0, 4, 6], [0, 1, 5]]),
    Object.freeze([[0, 1, 5], [1, 4, 6], [0, 3, 5], [1, 3, 6]]),
    Object.freeze([[0, 4, 6], [1, 3, 5], [0, 1, 4], [3, 5, 1]]),
    Object.freeze([[0, 1, 4], [4, 6, 1], [1, 3, 5], [0, 1, 5]]),
  ]),
  unknown: Object.freeze([
    Object.freeze([[0, 3], [0, 4], [1, 3], [0, 5]]),
    Object.freeze([[0, 4], [1, 5], [0, 3], [2, 5]]),
    Object.freeze([[0, 5], [3, 0], [1, 4], [0, 3]]),
    Object.freeze([[0, 3], [2, 5], [0, 4], [1, 3]]),
  ]),
});''',
    "pad progressions",
)
engine = replace_once(engine, '  voicing = "triad",\n) {\n  const chords = PAD_CHORDS[scoreState] ?? PAD_CHORDS.unknown;', '  voicing = "triad",\n  progressionVariant = 0,\n) {\n  const progressions = PAD_PROGRESSIONS[scoreState] ?? PAD_PROGRESSIONS.unknown;\n  const chords = progressions[Math.abs(Math.trunc(progressionVariant)) % progressions.length];', "pad progression selector")
engine = replace_once(engine, '    Math.max(24, 26 + safeScale[degree % safeScale.length] + (performance?.bassOctaveShift ?? 0)),', '    Math.max(27, 29 + safeScale[degree % safeScale.length] + (performance?.bassOctaveShift ?? 0)),', "bass root retune")
engine = replace_once(engine, '  let analyser = null;\n  let limiter = null;\n  let masterCompressor = null;', '  let analyser = null;\n  let spectrumAnalyser = null;\n  let limiter = null;\n  let masterClipper = null;\n  let masterCompressor = null;\n  let musicDuckGain = null;', "master graph vars")
engine = replace_once(engine, '  let reverb = null;\n  let reverbReturn = null;', '  let reverb = null;\n  let reverbReturn = null;\n  let ghostReverb = null;\n  let ghostReverbReturn = null;', "ghost reverb vars")
engine = replace_once(engine, '  let textureNoise = null;\n  let textureFilter = null;', '  let textureNoise = null;\n  let textureFilter = null;\n  let textureAirNoise = null;\n  let textureAirFilter = null;\n  let textureAirGain = null;\n  let subBass = null;\n  let subFilter = null;\n  let subGain = null;', "texture and sub vars")
old_master = '''    userGain = new Tone.Gain(0).toDestination();
    analyser = new Tone.Analyser("waveform", WAVEFORM_SIZE);
    limiter = new Tone.Limiter(-2);
    masterCompressor = new Tone.Compressor({ threshold: -18, ratio: 2.8, attack: 0.025, release: 0.22 });
    masterHighpass = new Tone.Filter({ type: "highpass", frequency: 28, rolloff: -12, Q: 0.6 });
    masterFilter = new Tone.Filter({ type: "lowpass", frequency: 12000, rolloff: -24, Q: 0.8 });
    masterVolume = new Tone.Volume(-10);
    masterVolume.chain(masterHighpass, masterFilter, masterCompressor, limiter, userGain);
    limiter.connect(analyser);

    reverb = new Tone.Reverb({ decay: 1.9, wet: 1 });
    reverbReturn = new Tone.Gain(0.16).connect(masterCompressor);
    reverb.connect(reverbReturn);'''
new_master = '''    userGain = new Tone.Gain(0).toDestination();
    analyser = new Tone.Analyser("waveform", WAVEFORM_SIZE);
    spectrumAnalyser = new Tone.Analyser("fft", 64);
    limiter = new Tone.Limiter(-2);
    masterClipper = new Tone.Distortion({ distortion: 0.04, oversample: "2x", wet: 0.08 });
    masterCompressor = new Tone.Compressor({ threshold: -18, ratio: 2.8, attack: 0.025, release: 0.22 });
    masterHighpass = new Tone.Filter({ type: "highpass", frequency: 28, rolloff: -12, Q: 0.6 });
    masterFilter = new Tone.Filter({ type: "lowpass", frequency: 12000, rolloff: -24, Q: 0.8 });
    masterVolume = new Tone.Volume(-10);
    masterVolume.chain(masterHighpass, masterFilter, masterCompressor, masterClipper, limiter, userGain);
    limiter.connect(analyser);
    limiter.connect(spectrumAnalyser);
    musicDuckGain = new Tone.Gain(1).connect(masterVolume);

    reverb = new Tone.Reverb({ decay: 1.9, wet: 1 });
    reverbReturn = new Tone.Gain(0.16).connect(musicDuckGain);
    reverb.connect(reverbReturn);
    ghostReverb = new Tone.Reverb({ decay: 0.45, wet: 1 });
    ghostReverbReturn = new Tone.Gain(0).connect(musicDuckGain);
    ghostReverb.connect(ghostReverbReturn);'''
engine = replace_once(engine, old_master, new_master, "master chain")
engine = replace_once(engine, '    bassInput.chain(bassFilter, bassCompressor, bassGain, masterVolume);', '    bassInput.chain(bassFilter, bassCompressor, bassGain, musicDuckGain);', "bass duck route")
engine = replace_once(engine, '    melodicBus.chain(melodicCompressor, masterVolume);\n    textureBus = new Tone.Gain(1).connect(masterVolume);\n    accentBus = new Tone.Gain(0.82).connect(masterVolume);', '    melodicBus.chain(melodicCompressor, musicDuckGain);\n    melodicBus.connect(ghostReverb);\n    textureBus = new Tone.Gain(1).connect(musicDuckGain);\n    accentBus = new Tone.Gain(0.82).connect(musicDuckGain);', "music duck routes")
engine = replace_once(
    engine,
    '''    textureNoise = new Tone.Noise("brown");
    textureFilter = new Tone.Filter({ type: "bandpass", frequency: 420, Q: 2.4 });
    textureNoise.chain(textureFilter, textureGain);
    textureGain.connect(atmosphericSend);
    textureNoise.start();''',
    '''    textureNoise = new Tone.Noise("brown");
    textureFilter = new Tone.Filter({ type: "bandpass", frequency: 420, Q: 2.4 });
    textureNoise.chain(textureFilter, textureGain);
    textureGain.connect(atmosphericSend);
    textureNoise.start();
    textureAirNoise = new Tone.Noise("pink");
    textureAirFilter = new Tone.Filter({ type: "bandpass", frequency: 6800, Q: 0.9 });
    textureAirGain = new Tone.Gain(0.004).connect(textureBus);
    textureAirNoise.chain(textureAirFilter, textureAirGain);
    textureAirNoise.start();

    subBass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      filter: { type: "lowpass", Q: 0.4, rolloff: -24 },
      envelope: { attack: 0.025, decay: 0.08, sustain: 0.86, release: 0.18 },
      filterEnvelope: { attack: 0.02, decay: 0.08, sustain: 0.8, release: 0.15, baseFrequency: 55, octaves: 0.5 },
      volume: -18,
    });
    subFilter = new Tone.Filter({ type: "lowpass", frequency: 115, rolloff: -24, Q: 0.5 });
    subGain = new Tone.Gain(0.22);
    subBass.chain(subFilter, subGain, bassInput);''',
    "noise and sub foundation",
)
engine = replace_once(engine, '      performance?.padVoicingLabel ?? "triad",\n    ).map(midiToFrequencyHz);', '      performance?.padVoicingLabel ?? "triad",\n      performance?.chordProgression ?? 0,\n    ).map(midiToFrequencyHz);', "pad progression playback")
engine = replace_once(engine, '  function playDrone(time, step) {\n    if (step !== 0) return;\n    drone.triggerAttackRelease(DRONE_MIDI.map(midiToFrequencyHz), "4m", time, 0.28);\n  }', '''  function playDrone(time, step) {
    if (step !== 0) return;
    drone.triggerAttackRelease(DRONE_MIDI.map(midiToFrequencyHz), "4m", time, 0.28);
  }

  function triggerSidechainDuck(time, scoreState) {
    const parameter = musicDuckGain?.gain;
    if (!parameter || !Number.isFinite(time)) return;
    const depth = scoreState === "critical" ? 0.48 : scoreState === "warning" ? 0.54 : 0.6;
    parameter.cancelScheduledValues?.(time);
    parameter.setValueAtTime?.(1, time);
    parameter.linearRampToValueAtTime?.(depth, time + 0.005);
    parameter.linearRampToValueAtTime?.(1, time + 0.18);
  }

  function playSubFoundation(time, step, performance) {
    if (!subBass) return;
    if ([0, 8, 16, 24].includes(step)) {
      subBass.triggerAttackRelease(midiToFrequencyHz(SUB_ROOT_MIDI), "1m", time, 0.3);
      return;
    }
    if ([14, 30].includes(step) && performance?.dropStage !== "build") {
      subBass.triggerAttackRelease(midiToFrequencyHz(SUB_FIFTH_MIDI), "4n", time, 0.22);
    }
  }

  function playDropGesture(time, step, performance) {
    if (!performance?.liveDirected || !Number.isFinite(time)) return;
    const Tone = requireTone();
    if (performance.dropStage === "build" && step === 28) {
      const spacing = Tone.Time("16n").toSeconds();
      for (let index = 0; index < 8; index += 1) {
        transport.scheduleOnce((scheduled) => {
          snare.triggerAttackRelease(0.055, scheduled, Math.max(0.08, 0.28 - index * 0.02));
        }, time + index * spacing);
      }
    }
    if (performance.dropStage === "build" && step === 31) {
      const eighth = Tone.Time("8n").toSeconds();
      musicDuckGain.gain.setValueAtTime?.(musicDuckGain.gain.value, time);
      musicDuckGain.gain.linearRampToValueAtTime?.(0.03, time + 0.02);
      musicDuckGain.gain.linearRampToValueAtTime?.(1, time + eighth * 0.95);
    }
    if (performance.dropStage === "drop" && step === 0) {
      hybridSampler?.playAccent("crash-crisp", time, 0.58);
    }
  }''', "sidechain sub drop functions")
engine = replace_once(engine, '    const fallbackVelocity = sampled\n      ? Math.min(0.13, event.velocity * 0.16)\n      : Math.min(0.64, event.velocity);', '    const fallbackVelocity = sampled\n      ? Math.min(0.035, event.velocity * 0.05)\n      : Math.min(0.64, event.velocity);', "procedural bass restraint")
engine = replace_once(engine, '    if (events.kick) {\n      kick.triggerAttackRelease(', '    if (events.kick) {\n      triggerSidechainDuck(time, frame.scoreState);\n      kick.triggerAttackRelease(', "kick sidechain trigger")
engine = replace_once(engine, '    if (typeof terminalFilter?.frequency?.setValueAtTime === "function") {', '''    if (terminalSynth?.modulationIndex?.setValueAtTime) {
      const fmIndex = 1.4 + (performance.intent?.tension ?? performance.grit ?? 0.5) * 3.2;
      terminalSynth.modulationIndex.setValueAtTime(fmIndex, time);
    } else if (terminalSynth?.modulationIndex?.value !== undefined) {
      terminalSynth.modulationIndex.value = 1.4 + (performance.intent?.tension ?? performance.grit ?? 0.5) * 3.2;
    }
    if (typeof terminalFilter?.frequency?.setValueAtTime === "function") {''', "fm modulation telemetry")
engine = replace_once(engine, '    if (step % 8 === 0) {\n      hybridSampler?.playBassPhrase(', '    if (step === 0) {\n      hybridSampler?.playBassPhrase(', "phrase loop cadence")
engine = replace_once(engine, '    playDrone(time, step);\n    playPad(time, currentFrame, step, performance);', '    playDropGesture(time, step, performance);\n    playDrone(time, step);\n    playSubFoundation(time, step, performance);\n    playPad(time, currentFrame, step, performance);', "drop sub scheduler")
engine = replace_once(engine, '      ramp(terminalDelaySend.gain, performance?.delayWet ?? 0.08);', '''      ramp(terminalDelaySend.gain, performance?.delayWet ?? 0.08);
      const Tone = requireTone();
      const delayDivision = frame.scoreState === "critical"
        ? "16n"
        : frame.scoreState === "unknown"
          ? "4n"
          : "8n";
      ramp(terminalDelay.delayTime, Tone.Time(delayDivision).toSeconds());
      ramp(ghostReverbReturn.gain, demoMode ? 0.07 : 0.018);
      ramp(textureAirGain.gain, frame.scoreState === "unknown" ? 0.0025 : 0.0045);''', "shared delay ghost reverb air")
engine = replace_once(engine, '      ...riffSynths,\n      deploymentSynth,', '      ...riffSynths,\n      subGain,\n      subFilter,\n      subBass,\n      textureAirGain,\n      textureAirFilter,\n      textureAirNoise,\n      deploymentSynth,', "dispose sub air")
engine = replace_once(engine, '      reverbReturn,\n      reverb,\n      masterCompressor,\n      limiter,\n      analyser,', '      ghostReverbReturn,\n      ghostReverb,\n      reverbReturn,\n      reverb,\n      musicDuckGain,\n      masterCompressor,\n      masterClipper,\n      limiter,\n      spectrumAnalyser,\n      analyser,', "dispose master additions")
engine = replace_once(engine, '          reverb.generate(),\n          hybridSampler?.load(),', '          reverb.generate(),\n          ghostReverb.generate(),\n          hybridSampler?.load(),', "generate reverbs")
engine = replace_once(engine, '    getWaveform() {\n      if (!initialized || !analyser) return new Float32Array(WAVEFORM_SIZE);\n      const value = analyser.getValue();\n      return value instanceof Float32Array\n        ? value\n        : Float32Array.from(value ?? []);\n    },', '''    getWaveform() {
      if (!initialized || !analyser) return new Float32Array(WAVEFORM_SIZE);
      const value = analyser.getValue();
      return value instanceof Float32Array
        ? value
        : Float32Array.from(value ?? []);
    },

    getSpectrum() {
      if (!initialized || !spectrumAnalyser) return new Float32Array(64).fill(-100);
      const value = spectrumAnalyser.getValue();
      return value instanceof Float32Array
        ? value
        : Float32Array.from(value ?? []);
    },''', "spectrum getter")
engine = replace_once(engine, '        50 + scale[Math.abs(degree) % scale.length] + (index === degrees.length - 1 ? 12 : 0)', '        53 + scale[Math.abs(degree) % scale.length] + (index === degrees.length - 1 ? 12 : 0)', "deployment root retune")
write("static/js/sonify/engine.js", engine)


# PART 7: Add spectrum visualization and expose the new build through Lab cache keys.
ui = read("static/js/sonify/ui.js")
ui = replace_once(ui, '"./engine.js?v=20260720-system-symphony-coherence-cache-v1"', f'"./engine.js?v={BUILD_ID}"', "ui engine cache")
ui = replace_all(ui, "20260718-system-symphony-ghost-circuit", BUILD_ID, "ui module cache tokens", minimum=3)
ui = replace_once(
    ui,
    '''                <div class="symphony-waveform-wrap">
                  <span>Master waveform / real analyser</span>
                  <canvas data-waveform width="960" height="112" aria-label="Real-time waveform from the System SYMPHONY master analyser"></canvas>
                </div>''',
    '''                <div class="symphony-analyser-grid">
                  <div class="symphony-waveform-wrap">
                    <span>Master waveform / real analyser</span>
                    <canvas data-waveform width="960" height="112" aria-label="Real-time waveform from the System SYMPHONY master analyser"></canvas>
                  </div>
                  <div class="symphony-spectrum-wrap">
                    <span>Master spectrum / 32 bands</span>
                    <canvas data-spectrum width="960" height="112" aria-label="Real-time 32-band spectrum from the System SYMPHONY master analyser"></canvas>
                  </div>
                </div>''',
    "spectrum markup",
)
ui = replace_once(ui, '  const waveformCanvas = host.querySelector("[data-waveform]");\n  const waveformContext = waveformCanvas.getContext("2d");', '  const waveformCanvas = host.querySelector("[data-waveform]");\n  const waveformContext = waveformCanvas.getContext("2d");\n  const spectrumCanvas = host.querySelector("[data-spectrum]");\n  const spectrumContext = spectrumCanvas.getContext("2d");', "spectrum context")
needle = '''      waveformContext.stroke();
    }
    waveformAnimation = window.requestAnimationFrame(drawWaveform);'''
replacement = '''      waveformContext.stroke();

      const spectrum = engine.getSpectrum();
      const spectrumWidth = spectrumCanvas.width;
      const spectrumHeight = spectrumCanvas.height;
      spectrumContext.clearRect(0, 0, spectrumWidth, spectrumHeight);
      spectrumContext.fillStyle = "#09090d";
      spectrumContext.fillRect(0, 0, spectrumWidth, spectrumHeight);
      const bandCount = 32;
      const binStride = Math.max(1, Math.floor(spectrum.length / bandCount));
      const gap = 3;
      const barWidth = spectrumWidth / bandCount;
      for (let band = 0; band < bandCount; band += 1) {
        const start = band * binStride;
        const bins = spectrum.slice(start, start + binStride);
        const db = bins.length
          ? bins.reduce((sum, value) => sum + (Number.isFinite(value) ? value : -100), 0) / bins.length
          : -100;
        const normalized = Math.max(0, Math.min(1, (db + 100) / 100));
        const barHeight = Math.max(1, normalized * spectrumHeight * 0.92);
        spectrumContext.fillStyle = engine.isRunning() ? "rgba(245, 166, 35, 0.72)" : "rgba(85, 85, 96, 0.72)";
        spectrumContext.fillRect(
          band * barWidth + gap / 2,
          spectrumHeight - barHeight,
          Math.max(1, barWidth - gap),
          barHeight,
        );
      }
    }
    waveformAnimation = window.requestAnimationFrame(drawWaveform);'''
ui = replace_once(ui, needle, replacement, "spectrum drawing")
write("static/js/sonify/ui.js", ui)

css = read("static/css/system-symphony.css")
css += '''

.symphony-analyser-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.symphony-spectrum-wrap {
  border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  padding-top: 8px;
}

.symphony-waveform-wrap span,
.symphony-spectrum-wrap span {
  display: block;
  margin-bottom: 5px;
  color: var(--text-faint, #555560);
  font-size: 8px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.symphony-spectrum-wrap canvas {
  display: block;
  width: 100%;
  height: 112px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  background: #09090d;
}
'''
write("static/css/system-symphony.css", css)

lab = read("lab/index.html")
lab = replace_once(lab, '/static/css/system-symphony.css?v=20260718-system-symphony-ghost-mix', f'/static/css/system-symphony.css?v={BUILD_ID}', "symphony css cache")
lab = replace_all(lab, 'ui.js?v=20260720-system-symphony-coherence-cache-v1', f'ui.js?v={BUILD_ID}', "lab ui cache")
write("lab/index.html", lab)

headers = read("_headers")
headers = headers.replace("20260720-system-symphony-coherence-cache-v1", BUILD_ID)
write("_headers", headers)


# PART 8: Update the sample audit to describe the actual new runtime contract.
audit = read("static/audio/system-symphony/AUDIT.md")
audit = replace_once(audit, '- Allow only the background-saws and wobbly-synth palettes in Warning; Critical melodic content remains procedural.', '- Live Warning uses the F/Fm-compatible background-saws or acid-synth palettes; Critical melodic lead content remains procedural.', "audit warning palette")
audit = replace_once(audit, '- Trigger rhythmic sources as four-beat, bar-quantised fragments. No rhythmic WAV free-runs against the Tone.js transport.', '- Trigger bass-loop sources as four-bar phrase-quantised foundations. They restart only at phrase boundaries and remain locked to Tone.Transport.', "audit loop grammar")
audit = replace_once(audit, '- Every rhythmic bass fragment is selected and restarted on a measure boundary, tempo-scaled within a bounded range and double-buffered so adjacent measures do not reuse an active voice.', '- F/Fm bass loops play through non-granular Tone.Player voices at bounded near-native playback rates. Full 16-beat phrases are double-buffered and restart only at phrase boundaries, removing GrainPlayer warble from the low-end foundation.', "audit loop implementation")
audit += '''

## F-centred production pass

The live score is centred on F so the dominant F/Fm source cluster can run without a three-semitone granular pitch shift. The procedural pads, service registers, sub foundation, deployment motif and state modes are retuned around the same centre. Samples that still require pitch adaptation use smaller intervals and remain behind bounded granular playback. Live palettes always choose a rhythmic bass-loop foundation for Healthy, Warning and Critical; Ghost Circuit keeps its nullable seeded pools for deliberate variation.
'''
write("static/audio/system-symphony/AUDIT.md", audit)


# PART 9: Update existing regression expectations for the new musical centre and loop policy.
mapping_test = read("static/js/sonify/mapping.test.js")
mapping_test = replace_once(mapping_test, 'healthy: [112, 12000, 28],\n      warning: [118, 10000, 32],\n      critical: [128, 8000, 38],', 'healthy: [100, 12000, 28],\n      warning: [106, 10000, 32],\n      critical: [112, 8000, 38],', "mapping tempo expectations")
mapping_test = replace_once(mapping_test, 'test("healthy state uses dark D Aeolian at the healthy tempo"', 'test("healthy state uses F Aeolian at the healthy tempo"', "healthy test name")
mapping_test = replace_once(mapping_test, 'assert.equal(frame.mode, "D Aeolian");', 'assert.equal(frame.mode, "F Aeolian");', "healthy mode expectation")
mapping_test = replace_once(mapping_test, 'test("warning state uses D Phrygian for degraded service or sub-0.95 health"', 'test("warning state uses F Phrygian for degraded service or sub-0.95 health"', "warning test name")
mapping_test = replace_once(mapping_test, 'assert.equal(frame.mode, "D Phrygian");', 'assert.equal(frame.mode, "F Phrygian");', "warning mode expectation")
mapping_test = replace_once(mapping_test, 'test("critical state uses D Phrygian dominant and persistent rhythm"', 'test("critical state uses F Phrygian dominant and persistent rhythm"', "critical test name")
mapping_test = replace_once(mapping_test, 'Object.values(FAMILY_MIDI_RANGES).every((range) => range.maximum <= 62),\n    "recurring service families must stay at or below D4",', 'Object.values(FAMILY_MIDI_RANGES).every((range) => range.maximum <= 65),\n    "recurring service families must stay at or below F4",', "register ceiling expectation")
write("static/js/sonify/mapping.test.js", mapping_test)

engine_test = read("static/js/sonify/engine.test.js")
engine_test = replace_once(engine_test, '    assert.deepEqual(DRONE_MIDI, [26, 33]);', '    assert.deepEqual(DRONE_MIDI, [29, 36]);', "drone expectation")
engine_test = replace_once(engine_test, 'assert.ok(Math.max(...notes) <= 57, `${state} pad should stay at or below A3`);', 'assert.ok(Math.max(...notes) <= 60, `${state} pad should stay at or below C4`);', "pad ceiling expectation")
engine_test = replace_once(engine_test, 'assert.equal(runtime.constructed.filter((name) => name === "Distortion").length, 3);', 'assert.equal(runtime.constructed.filter((name) => name === "Distortion").length, 4);', "soft clipper graph expectation")
write("static/js/sonify/engine.test.js", engine_test)

integration = read("static/js/sonify/composition-integration.test.js")
integration = replace_once(integration, 'assert.equal(plan.bassLoopTimbre, 0, "live Warning must default away from bar-sliced bass loops");', 'assert.ok(Number.isInteger(plan.bassLoopTimbre), "live Warning must select a deterministic phrase-loop timbre");', "live loop expectation")
write("static/js/sonify/composition-integration.test.js", integration)

coherence = read("static/js/sonify/coherence-cache.test.js")
coherence = replace_once(coherence, 'test("live telemetry palette removes bass loops, wobbly lead and AC-unit metal hits"', 'test("live telemetry palette keeps loop foundations while removing wobbly lead and AC-unit metal hits"', "coherence palette test name")
coherence = replace_once(coherence, '    assert.equal(palette.bassLoop, null);', '    assert.ok(palette.bassLoop);', "coherence live loop assertion")
coherence = replace_once(coherence, 'assert.equal(SYSTEM_SYMPHONY_BUILD_ID, "20260720-system-symphony-coherence-cache-v1");', f'assert.equal(SYSTEM_SYMPHONY_BUILD_ID, "{BUILD_ID}");', "coherence build id")
write("static/js/sonify/coherence-cache.test.js", coherence)


# PART 10: Add focused regression coverage for loop continuity, transposition and production architecture.
production_test = f'''import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {{
  BASS_LOOPS,
  LEAD_LOOPS,
  resolveSamplePalette,
  samplePoolAnalysis,
}} from "./samples.js";
import {{ bassLoopPlaybackPlan }} from "./sampler.js";
import {{ createCompositionDirector }} from "./composition-director.js";
import {{ buildPadVoicing }} from "./engine.js";
import {{ ROOT_MIDI, SCORE_STATES }} from "./mapping.js";

function livePlan(state, phraseCount = 1) {{
  const director = createCompositionDirector({{ seed: `ATLAS-LOOP-${{state}}` }});
  director.observe({{
    scoreState: state,
    bpm: SCORE_STATES[state].bpm,
    scale: SCORE_STATES[state].scale,
    overallHealth: state === "critical" ? 0.3 : state === "warning" ? 0.8 : 1,
    activeIncidents: state === "critical" ? 1 : 0,
    stale: state === "unknown",
    modulation: {{
      pressure: state === "critical" ? 0.95 : state === "warning" ? 0.58 : 0.2,
      healthPressure: 0.2,
      coveragePressure: state === "unknown" ? 0.7 : 0,
      latencyPressure: 0.2,
      errorPressure: 0.1,
      incidentPressure: state === "critical" ? 0.5 : 0,
      deploymentEnergy: 0,
      spectralOpenness: 0.8,
      staleDecay: state === "unknown" ? 0.8 : 0,
    }},
  }});
  let plan = null;
  for (let index = 0; index < phraseCount; index += 1) plan = director.advancePhrase();
  return plan;
}}

test("F-centred score keeps loop playback near native rate", () => {{
  assert.equal(ROOT_MIDI, 41);
  assert.deepEqual(Object.fromEntries(Object.entries(SCORE_STATES).map(([state, score]) => [state, score.bpm])), {{
    healthy: 100,
    warning: 106,
    critical: 112,
    unknown: 96,
  }});
  for (const state of ["healthy", "warning", "critical"]) {{
    const plan = livePlan(state);
    const palette = resolveSamplePalette(state, plan, 0);
    const sample = BASS_LOOPS[palette.bassLoop];
    const playback = bassLoopPlaybackPlan(sample, plan.targetBpm);
    assert.ok(playback);
    assert.equal(playback.playableBeats, 16);
    assert.ok(playback.playbackRate >= 0.75 && playback.playbackRate <= 1.35);
    assert.equal(playback.rateWasClamped, false);
    assert.ok(playback.outputDuration >= 16 * 60 / 116);
  }}
}});

test("F and Fm foundation loops no longer use granular pitch transposition", () => {{
  for (const id of ["neo-tokyo", "sequenced-bass", "evil-bass", "distorted-guitar"]) {{
    assert.equal(BASS_LOOPS[id].transposeCents, 0, `${{id}} should run at native pitch`);
  }}
  assert.equal(LEAD_LOOPS["acid-synth"].transposeCents, 0);
}});

test("live palettes always provide a loop foundation outside Unknown", () => {{
  for (const state of ["healthy", "warning", "critical"]) {{
    for (let phrase = 0; phrase < 24; phrase += 1) {{
      const plan = livePlan(state, phrase + 1);
      const palette = resolveSamplePalette(state, plan, phrase);
      assert.ok(palette.bassLoop, `${{state}} phrase ${{phrase}} needs a loop foundation`);
      assert.notEqual(palette.lead, "wobbly-synth");
      assert.equal(palette.metal, "perc-stick");
    }}
  }}
}});

test("raw nullable pools remain visible as deliberate Ghost variation", () => {{
  const analysis = samplePoolAnalysis();
  assert.equal(analysis.healthy.kinds.bassLoop.nulls, 2);
  assert.equal(analysis.warning.kinds.lead.nulls, 2);
  assert.ok(analysis.healthy.emptyLeadAtmosphereProbability >= 0);
  assert.ok(analysis.warning.emptyLeadAtmosphereProbability >= 0);
}});

test("seeded chord progression variants change pad harmony", () => {{
  const score = SCORE_STATES.healthy;
  const signatures = new Set(Array.from({{ length: 4 }}, (_, variant) => (
    buildPadVoicing("healthy", score.scale, 0, 0, "triad", variant).join(":")
  )));
  assert.ok(signatures.size >= 3);
}});

test("stable live state eventually schedules a build and drop pair", () => {{
  const director = createCompositionDirector({{ seed: "ATLAS-DROP" }});
  director.observe({{
    scoreState: "healthy",
    bpm: 100,
    scale: SCORE_STATES.healthy.scale,
    overallHealth: 1,
    activeIncidents: 0,
    stale: false,
    modulation: {{ pressure: 0.2, healthPressure: 0, coveragePressure: 0, latencyPressure: 0.1, errorPressure: 0, incidentPressure: 0, deploymentEnergy: 0, spectralOpenness: 0.9, staleDecay: 0 }},
  }});
  const stages = Array.from({{ length: 18 }}, () => director.advancePhrase().dropStage);
  assert.ok(stages.includes("build"));
  const buildIndex = stages.indexOf("build");
  assert.equal(stages[buildIndex + 1], "drop");
}});

test("production graph source includes ducking, sub, clipper, shared delay and FFT analysis", () => {{
  const source = fs.readFileSync("static/js/sonify/engine.js", "utf8");
  assert.match(source, /triggerSidechainDuck/);
  assert.match(source, /SUB_ROOT_MIDI/);
  assert.match(source, /masterClipper/);
  assert.match(source, /new Tone\.Analyser\("fft", 64\)/);
  assert.match(source, /terminalDelay\.delayTime/);
  assert.match(source, /textureAirNoise/);
}});

test("active build id is the loop production v2 release candidate", () => {{
  const source = fs.readFileSync("static/js/sonify/engine.js", "utf8");
  assert.match(source, /{BUILD_ID}/);
}});
'''
write("static/js/sonify/loop-production-v2.test.js", production_test)

print("System SYMPHONY loop production v2 patch applied successfully")
