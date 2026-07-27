/**
 * Atlas APU Performance Director v4.
 *
 * Sits above the existing composition director and layers a phrase-level
 * intent state machine on top of it. Where the composition director
 * answers "which motif fires next," this module answers "what is this
 * phrase for, in the shape of the whole piece."
 *
 * Six intent phases:
 *
 *   intro     - sparse, establishing tonic, letting the ear pick up the
 *               piece's identity
 *   groove    - settled body, moderate density, the main "we are here"
 *   pressure  - rising density and dissonance, tension building
 *   rupture   - peak drama, controlled ear candy, structural climax
 *   recovery  - coming down, resolving, room to breathe returning
 *   afterglow - sparse aftermath, memory of what happened
 *
 * The director advances phases in three ways:
 *
 *   1. Within a stable state, cycle through that state's phase sequence,
 *      spending each phase for its minimum phrase count before moving on.
 *   2. On a state transition, force the appropriate authored phase for
 *      that transition (warning bloom, critical choke, recovery release,
 *      unknown drift). This overrides the cycle for one phase.
 *   3. Ear candy fires on deterministic bar boundaries every 4, 8, and
 *      16 bars, with the specific ornament chosen by hash of
 *      (seed, phraseIndex, ornament size) so replays are identical.
 *
 * Every phrase produces a plan with silence budget, density target, and
 * ornament schedule. The engine wiring in Pass C reads these and passes
 * them to the arranger, drum sculptor, and mix director.
 *
 * The director has no Web Audio dependency and no Tone.js dependency.
 * It returns pure data. All variation is a function of seed, state, and
 * frame observations. There is no Math.random and no Date.now.
 */

export const APU_PERFORMANCE_DIRECTOR_V4_BUILD_ID = "20260727-apu-performance-director-v4";

// ---------------------------------------------------------------------------
// Phase catalogue
// ---------------------------------------------------------------------------

export const PERFORMANCE_PHASE_KEYS = Object.freeze([
  "intro",
  "groove",
  "pressure",
  "rupture",
  "recovery",
  "afterglow",
]);

/**
 * silenceBudget: fraction of note slots the arrangement may leave empty.
 * density:       target activity level, 0..1, consumed by the sequencer.
 * minPhrases:    the phase holds for at least this many phrases before
 *                the state cycle advances it.
 * energy:        mood tag consumed by the mix director for phase-based
 *                gain and wobble modulation.
 */
export const PERFORMANCE_PHASES = Object.freeze({
  intro:     Object.freeze({ silenceBudget: 0.40, density: 0.40, minPhrases: 2, energy: "opening" }),
  groove:    Object.freeze({ silenceBudget: 0.20, density: 0.70, minPhrases: 3, energy: "settled" }),
  pressure:  Object.freeze({ silenceBudget: 0.15, density: 0.85, minPhrases: 2, energy: "rising" }),
  rupture:   Object.freeze({ silenceBudget: 0.10, density: 1.00, minPhrases: 1, energy: "peak" }),
  recovery:  Object.freeze({ silenceBudget: 0.25, density: 0.55, minPhrases: 2, energy: "falling" }),
  afterglow: Object.freeze({ silenceBudget: 0.45, density: 0.30, minPhrases: 2, energy: "drift" }),
});

/**
 * State transition → phase override table. Any `from>to` key wins over
 * the wildcard `>to` and `from>` keys.
 */
const TRANSITION_MAP = Object.freeze({
  "healthy>warning":  "pressure",
  "healthy>critical": "rupture",
  "warning>critical": "rupture",
  "critical>warning": "recovery",
  "critical>healthy": "recovery",
  "warning>healthy":  "recovery",
});

const TRANSITION_TO_WILDCARD = Object.freeze({
  unknown:  "afterglow",
});

const TRANSITION_FROM_WILDCARD = Object.freeze({
  unknown:  "intro",
});

/**
 * Within-state phase cycle. When a phase completes its minPhrases and no
 * transition override is pending, the director advances to the next
 * entry in this list, wrapping.
 */
const STATE_CYCLE = Object.freeze({
  healthy:  Object.freeze(["intro",     "groove",   "groove",   "pressure", "recovery", "groove",    "afterglow"]),
  warning:  Object.freeze(["intro",     "groove",   "pressure", "pressure", "rupture",  "recovery",  "groove"]),
  critical: Object.freeze(["rupture",   "rupture",  "recovery", "pressure", "rupture",  "recovery"]),
  unknown:  Object.freeze(["afterglow", "intro",    "afterglow", "intro",   "afterglow"]),
});

// ---------------------------------------------------------------------------
// Ornament schedule
// ---------------------------------------------------------------------------

const ORNAMENTS_SMALL  = Object.freeze(["ripple", "stab", "tick"]);
const ORNAMENTS_MEDIUM = Object.freeze(["swell", "glitch", "shimmer"]);
const ORNAMENTS_LARGE  = Object.freeze(["flourish", "structural", "reprise"]);

// Bars per phrase; matches the existing arranger's 32-step (16n) phrase.
const BARS_PER_PHRASE = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

/**
 * FNV-1a hash returning a non-negative 31-bit integer.
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

const STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const isValidState = (state) => STATE_KEYS.includes(state);
const safeState = (state) => (isValidState(state) ? state : "unknown");

function pickOrnament(list, phraseIndex, seedHash, salt) {
  const hash = fnv1a(`${seedHash}:${phraseIndex}:${salt}`);
  return list[hash % list.length];
}

function transitionPhase(from, to) {
  const direct = TRANSITION_MAP[`${from}>${to}`];
  if (direct) return direct;
  if (TRANSITION_TO_WILDCARD[to]) return TRANSITION_TO_WILDCARD[to];
  if (TRANSITION_FROM_WILDCARD[from]) return TRANSITION_FROM_WILDCARD[from];
  return null;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a performance director.
 *
 * @param {object} [options]
 * @param {string} [options.seed]            - deterministic seed string
 * @param {string} [options.initialState]    - starting estate state
 * @param {string} [options.initialPhase]    - starting phase, defaults to intro
 * @returns {object}
 */
export function createPerformanceDirector({
  seed = "ATLAS-APU-PERF-V4",
  initialState = "unknown",
  initialPhase = "intro",
} = {}) {
  const seedHash = fnv1a(seed);
  let phraseIndex = -1; // first advancePhrase() call moves to 0
  let currentState = safeState(initialState);
  let currentPhase = PERFORMANCE_PHASE_KEYS.includes(initialPhase) ? initialPhase : "intro";
  let phaseStartPhrase = 0;
  let pendingForcedPhase = null;
  let pendingForcedFrom = null;
  const cycleForState = () => STATE_CYCLE[currentState] ?? STATE_CYCLE.unknown;
  // Seed offsets the initial cycle index so different seeds produce
  // measurably different phase histories even before any state change.
  let cycleIndex = seedHash % cycleForState().length;
  const history = [];

  function observe(frame) {
    const nextState = safeState(frame?.scoreState);
    if (nextState !== currentState) {
      const forced = transitionPhase(currentState, nextState);
      if (forced) {
        pendingForcedPhase = forced;
        pendingForcedFrom = currentState;
      }
      currentState = nextState;
    }
  }

  function computeOrnaments() {
    if (phraseIndex < 0) return Object.freeze([]);
    const bars = phraseIndex * BARS_PER_PHRASE;
    const ornaments = [];
    // Every 4 bars: small ornament
    if (bars > 0 && bars % 4 === 0) {
      ornaments.push(Object.freeze({
        size: "small",
        name: pickOrnament(ORNAMENTS_SMALL, phraseIndex, seedHash, "s"),
        bar: bars,
      }));
    }
    // Every 8 bars: medium ornament
    if (bars > 0 && bars % 8 === 0) {
      ornaments.push(Object.freeze({
        size: "medium",
        name: pickOrnament(ORNAMENTS_MEDIUM, phraseIndex, seedHash, "m"),
        bar: bars,
      }));
    }
    // Every 16 bars: large ornament
    if (bars > 0 && bars % 16 === 0) {
      ornaments.push(Object.freeze({
        size: "large",
        name: pickOrnament(ORNAMENTS_LARGE, phraseIndex, seedHash, "l"),
        bar: bars,
      }));
    }
    return Object.freeze(ornaments);
  }

  function advancePhrase() {
    phraseIndex += 1;
    const phraseInPhase = phraseIndex - phaseStartPhrase;
    const currentSpec = PERFORMANCE_PHASES[currentPhase] ?? PERFORMANCE_PHASES.intro;

    let transitionReason = "hold";

    if (pendingForcedPhase !== null) {
      const from = pendingForcedFrom ?? "unknown";
      const to = pendingForcedPhase;
      currentPhase = to;
      phaseStartPhrase = phraseIndex;
      transitionReason = `authored:${from}>${currentState}`;
      pendingForcedPhase = null;
      pendingForcedFrom = null;
      // Reset cycle index into a position that will *follow* this phase
      // in the state cycle, so the next natural advance stays coherent.
      const cycle = cycleForState();
      const found = cycle.indexOf(currentPhase);
      cycleIndex = found >= 0 ? found : 0;
    } else if (phraseInPhase >= currentSpec.minPhrases) {
      const cycle = cycleForState();
      cycleIndex = (cycleIndex + 1) % cycle.length;
      currentPhase = cycle[cycleIndex];
      phaseStartPhrase = phraseIndex;
      transitionReason = "cycle";
    }

    const spec = PERFORMANCE_PHASES[currentPhase];
    const ornaments = computeOrnaments();
    const bars = phraseIndex * BARS_PER_PHRASE;

    const plan = Object.freeze({
      phraseIndex,
      bars,
      state: currentState,
      phase: currentPhase,
      transitionReason,
      silenceBudget: clamp(spec.silenceBudget, 0, 1),
      density: clamp(spec.density, 0, 1),
      energy: spec.energy,
      ornaments,
      describe: describePlan(currentState, currentPhase, phraseIndex, ornaments, transitionReason),
    });

    history.push(plan);
    if (history.length > 128) history.shift();
    return plan;
  }

  return Object.freeze({
    buildId: APU_PERFORMANCE_DIRECTOR_V4_BUILD_ID,
    observe,
    advancePhrase,
    getPhase: () => currentPhase,
    getState: () => currentState,
    getPhraseIndex: () => phraseIndex,
    getHistory: () => Object.freeze([...history]),
    getSeedHash: () => seedHash,
  });
}

function describePlan(state, phase, phraseIndex, ornaments, transitionReason) {
  const ornamentLabel = ornaments.length
    ? ` +${ornaments.map((o) => `${o.size}:${o.name}`).join(",")}`
    : "";
  return `phrase ${phraseIndex}: ${state}/${phase} (${transitionReason})${ornamentLabel}`;
}

// ---------------------------------------------------------------------------
// Pure helpers exposed for the debug UI and mix director
// ---------------------------------------------------------------------------

/**
 * Look up the phase specification for a phase key. Falls back to `intro`
 * so consumers never receive undefined.
 * @param {string} phase
 * @returns {object}
 */
export function phaseSpec(phase) {
  return PERFORMANCE_PHASES[phase] ?? PERFORMANCE_PHASES.intro;
}

/**
 * Silence budget for a phase, clamped 0..1.
 * @param {string} phase
 * @returns {number}
 */
export function silenceBudgetForPhase(phase) {
  return clamp(phaseSpec(phase).silenceBudget, 0, 1);
}

/**
 * The specific ornament (if any) scheduled at `phraseIndex` under a given
 * seed. Returns a frozen array. Useful for the debug UI and for tests
 * that want to verify determinism without running the whole director.
 *
 * @param {number} phraseIndex
 * @param {string} [seed]
 * @returns {ReadonlyArray<object>}
 */
export function scheduledOrnamentsFor(phraseIndex, seed = "ATLAS-APU-PERF-V4") {
  const seedHash = fnv1a(seed);
  const safe = Math.max(0, Math.trunc(phraseIndex));
  const bars = safe * BARS_PER_PHRASE;
  const list = [];
  if (safe > 0 && bars % 4 === 0)  list.push({ size: "small",  name: pickOrnament(ORNAMENTS_SMALL,  safe, seedHash, "s"), bar: bars });
  if (safe > 0 && bars % 8 === 0)  list.push({ size: "medium", name: pickOrnament(ORNAMENTS_MEDIUM, safe, seedHash, "m"), bar: bars });
  if (safe > 0 && bars % 16 === 0) list.push({ size: "large",  name: pickOrnament(ORNAMENTS_LARGE,  safe, seedHash, "l"), bar: bars });
  return Object.freeze(list.map((o) => Object.freeze(o)));
}
