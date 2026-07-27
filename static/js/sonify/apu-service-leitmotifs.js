/**
 * Atlas APU service leitmotif system.
 *
 * Assigns every service a short, deterministic melodic and rhythmic
 * signature that a listener can learn to recognise. The signature stays
 * stable across replays of the same frame and mutates in specific,
 * musically legible ways under warning, critical, unknown, and recovery.
 *
 * The engine already has a pool of eight service voices that pick up
 * whichever service is scheduled at a given step. This module gives that
 * pool an intent: "when it is `atlas-corpus` playing, it should sound
 * like this melodic cell, in this register, on this rhythm shape, and
 * under critical it should fracture like this."
 *
 * Determinism is enforced through FNV-1a hashes of the service name.
 * All motif variation is a function of `(service name, state)`. There
 * is no `Math.random` and no per-run seed. Two identical frames render
 * identical leitmotif outputs.
 *
 * The module has no Web Audio dependency and no Tone.js dependency; it
 * returns pure data structures. The engine consumes those structures
 * when it schedules a service note.
 *
 * Provenance is preserved in the return value: every leitmotif reports
 * which service produced it, which channel it prefers, and which
 * mutation was applied, so the debug UI can show "critical is
 * fracturing `atlas-corpus` motif via 'invert' mutation".
 */

export const APU_SERVICE_LEITMOTIFS_BUILD_ID = "20260727-apu-service-leitmotifs-v1";

/**
 * Registers say which octave band a service naturally sings in. Number
 * values are MIDI octave offsets from the tonic (F2 = MIDI 41), so
 * `+2` means two octaves above the tonic.
 */
export const LEITMOTIF_REGISTERS = Object.freeze({
  bass:    Object.freeze({ label: "bass",    octaveOffset: 0 }),
  mid:     Object.freeze({ label: "mid",     octaveOffset: 1 }),
  lead:    Object.freeze({ label: "lead",    octaveOffset: 2 }),
  upper:   Object.freeze({ label: "upper",   octaveOffset: 3 }),
});

/**
 * Rhythm shapes are 8-slot patterns (half a bar in 16th notes). Each
 * entry indicates whether that 16th note carries a leitmotif note.
 * The shapes are intentionally sparse so several services can weave
 * without collisions.
 */
export const LEITMOTIF_RHYTHMS = Object.freeze({
  call:      Object.freeze([1, 0, 0, 0, 1, 0, 0, 0]),
  answer:    Object.freeze([0, 0, 1, 0, 0, 0, 1, 0]),
  pulse:     Object.freeze([1, 0, 1, 0, 1, 0, 1, 0]),
  syncopate: Object.freeze([1, 0, 0, 1, 0, 0, 1, 0]),
  arc:       Object.freeze([1, 0, 0, 0, 0, 1, 0, 0]),
  breath:    Object.freeze([1, 0, 0, 0, 0, 0, 0, 0]),
});

/**
 * APU role affinity determines which layer bus the service tends to
 * sing on when the arrangement gives it space. These match the layer
 * names used by the existing arranger and sequencer.
 */
export const LEITMOTIF_ROLES = Object.freeze({
  lead:      "primary",
  counter:   "secondary",
  bass:      "bass",
  pad:       "pad",
  percussion: "drum",
  accent:    "accent",
});

const STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown", "recovery"]);

const CANONICAL_ROLE_BY_HASH = Object.freeze([
  { role: "lead",    register: "lead",  rhythm: "call" },
  { role: "counter", register: "mid",   rhythm: "answer" },
  { role: "pad",     register: "mid",   rhythm: "arc" },
  { role: "accent",  register: "upper", rhythm: "syncopate" },
  { role: "bass",    register: "bass",  rhythm: "pulse" },
]);

/**
 * Base motif shapes. Each is a sequence of scale degrees relative to
 * the service's chosen register root. They are 4-note cells so a
 * listener can learn them in a single phrase and recognise the
 * mutated form later.
 */
const BASE_MOTIFS = Object.freeze({
  "up-return":     Object.freeze([0, 2, 4, 2]),
  "step-down":     Object.freeze([4, 3, 2, 0]),
  "arpeggio":      Object.freeze([0, 2, 4, 7]),
  "pivot":         Object.freeze([0, 4, 2, 5]),
  "held-tail":     Object.freeze([0, 2, 3, 3]),
  "leap-return":   Object.freeze([0, 5, 4, 0]),
  "climb":         Object.freeze([0, 1, 3, 5]),
  "descend":       Object.freeze([5, 4, 2, 0]),
});

const MOTIF_KEYS = Object.freeze(Object.keys(BASE_MOTIFS));

// ---------------------------------------------------------------------------
// Deterministic hash helpers
// ---------------------------------------------------------------------------

/**
 * FNV-1a hash; returns a non-negative 31-bit integer.
 * @param {string} text
 * @returns {number}
 */
export function fnv1a(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function pick(list, hash) {
  return list[hash % list.length];
}

// ---------------------------------------------------------------------------
// Base leitmotif for a service
// ---------------------------------------------------------------------------

/**
 * Build the stable, state-independent leitmotif for a service.
 *
 * @param {string} serviceName
 * @returns {{
 *   service: string,
 *   role: string,
 *   register: string,
 *   rhythm: readonly number[],
 *   motifKey: string,
 *   motif: readonly number[],
 *   octaveOffset: number,
 *   preferredLayer: string,
 * }}
 */
export function baseLeitmotifFor(serviceName) {
  const service = String(serviceName ?? "unknown-service");
  const hash = fnv1a(service);
  const roleChoice = CANONICAL_ROLE_BY_HASH[hash % CANONICAL_ROLE_BY_HASH.length];

  // Motif key uses a second, decorrelated hash slot so services with the
  // same role can still have distinctive melodic cells.
  const motifKey = pick(MOTIF_KEYS, (hash >>> 3));
  const motif = BASE_MOTIFS[motifKey];

  const register = LEITMOTIF_REGISTERS[roleChoice.register];
  const preferredLayer = LEITMOTIF_ROLES[roleChoice.role];

  return Object.freeze({
    service,
    role: roleChoice.role,
    register: roleChoice.register,
    rhythm: LEITMOTIF_RHYTHMS[roleChoice.rhythm],
    motifKey,
    motif,
    octaveOffset: register.octaveOffset,
    preferredLayer,
  });
}

// ---------------------------------------------------------------------------
// State mutations
// ---------------------------------------------------------------------------

const MODULO = (value, length) => ((Math.trunc(value) % length) + length) % length;

function invert(motif) {
  const pivot = motif[0];
  return Object.freeze(motif.map((degree) => pivot - (degree - pivot)));
}

function fragment(motif, hash) {
  // Deterministic fragmentation: always keep note 0, always keep exactly
  // one interior note (chosen by hash), drop all others. For a 4-note
  // motif this leaves 2 notes, which stays distinct from `sparse` (which
  // keeps first and last). The result feels like a chip glitch dropping
  // most of the phrase rather than a complete silence.
  const keepInterior = 1 + (hash % (motif.length - 2 || 1));
  return Object.freeze(motif.map((degree, index) => (
    index === 0 || index === keepInterior ? degree : null
  )));
}

function sparse(motif) {
  // Keep first and last note only, gap the middle.
  return Object.freeze(motif.map((degree, index) => (index === 0 || index === motif.length - 1 ? degree : null)));
}

function resolve(motif) {
  // Bright resolution: force final note to tonic plus one scale degree
  // above (leading tone answered), and lift the penultimate note by one
  // so recovery always sounds distinct from healthy even when a motif
  // already ends on the tonic.
  const copy = [...motif];
  const last = copy.length - 1;
  copy[last] = 7; // one octave above tonic
  if (last >= 1) copy[last - 1] = copy[last - 1] + 1;
  return Object.freeze(copy);
}

function tenseShift(motif) {
  // Shift interior notes up one scale degree to introduce tension without
  // changing register.
  return Object.freeze(motif.map((degree, index) => (index === 0 || index === motif.length - 1 ? degree : degree + 1)));
}

/**
 * Apply the state mutation to a base leitmotif.
 *
 * healthy   : returns unchanged
 * warning   : tenseShift (interior notes rise a scale degree)
 * critical  : fragment (chip drops notes deterministically)
 * unknown   : sparse (only first and last notes remain)
 * recovery  : resolve (final note pulls to tonic)
 *
 * @param {ReturnType<typeof baseLeitmotifFor>} base
 * @param {string} state
 * @returns {object}
 */
export function mutateLeitmotifForState(base, state) {
  if (!base || typeof base !== "object") throw new TypeError("apu-service-leitmotifs: base required");
  const safeState = STATE_KEYS.includes(state) ? state : "unknown";
  const hash = fnv1a(base.service);

  let mutation = "identity";
  let mutatedMotif = base.motif;
  let mutatedRhythm = base.rhythm;

  switch (safeState) {
    case "healthy":
      mutation = "identity";
      break;
    case "warning":
      mutation = "tenseShift";
      mutatedMotif = tenseShift(base.motif);
      break;
    case "critical":
      mutation = "fragment";
      mutatedMotif = fragment(base.motif, hash);
      // Warning rhythm degrades to alternating "call+silence" bar shape.
      mutatedRhythm = Object.freeze(base.rhythm.map((slot, index) => (index === 0 ? slot : 0)));
      break;
    case "unknown":
      mutation = "sparse";
      mutatedMotif = sparse(base.motif);
      break;
    case "recovery":
      mutation = "resolve";
      mutatedMotif = resolve(base.motif);
      break;
    default:
      mutation = "identity";
  }

  return Object.freeze({
    ...base,
    state: safeState,
    mutation,
    motif: mutatedMotif,
    rhythm: mutatedRhythm,
  });
}

/**
 * Combined helper: build the base leitmotif and immediately mutate for a state.
 *
 * @param {string} serviceName
 * @param {string} state
 * @returns {object}
 */
export function leitmotifFor(serviceName, state = "healthy") {
  return mutateLeitmotifForState(baseLeitmotifFor(serviceName), state);
}

// ---------------------------------------------------------------------------
// Provenance for the debug UI
// ---------------------------------------------------------------------------

/**
 * Human-readable provenance for a leitmotif. The debug UI can show
 * exactly which service is currently influencing which APU voice, and
 * which mutation the current state applied.
 *
 * @param {object} leitmotif
 * @returns {{
 *   service: string,
 *   role: string,
 *   register: string,
 *   rhythmName: string,
 *   motifKey: string,
 *   mutation: string,
 *   describe: string,
 * }}
 */
export function describeLeitmotif(leitmotif) {
  if (!leitmotif) return Object.freeze({ service: "unknown", describe: "no leitmotif" });
  const rhythmName = Object.entries(LEITMOTIF_RHYTHMS)
    .find(([, pattern]) => shallowEqual(pattern, leitmotif.rhythm))?.[0] ?? "custom";
  const describe = `${leitmotif.service} → ${leitmotif.role} on ${leitmotif.register} (${leitmotif.motifKey}, ${rhythmName}, ${leitmotif.mutation})`;
  return Object.freeze({
    service: leitmotif.service,
    role: leitmotif.role,
    register: leitmotif.register,
    rhythmName,
    motifKey: leitmotif.motifKey,
    mutation: leitmotif.mutation ?? "identity",
    describe,
  });
}

function shallowEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

/**
 * Build a Map keyed by service name of pre-mutated leitmotifs, given a
 * list of services and the current estate state.
 *
 * @param {string[]} services
 * @param {string} state
 * @returns {Map<string, object>}
 */
export function buildLeitmotifRegistry(services, state = "healthy") {
  const registry = new Map();
  for (const service of services ?? []) {
    if (typeof service !== "string" || !service) continue;
    registry.set(service, leitmotifFor(service, state));
  }
  return registry;
}

/**
 * Resolve the layer preference for a voice given its base service and
 * current state. Returns null if the service has no leitmotif.
 *
 * @param {string} serviceName
 * @param {string} state
 * @returns {string | null}
 */
export function preferredLayerFor(serviceName, state = "healthy") {
  if (!serviceName) return null;
  return leitmotifFor(serviceName, state).preferredLayer;
}

// Re-export state keys so tests and consumers can enumerate valid inputs.
export { STATE_KEYS as LEITMOTIF_STATE_KEYS };
