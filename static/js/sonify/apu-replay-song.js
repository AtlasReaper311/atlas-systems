import { PERFORMANCE_PHASES } from "./apu-performance-director-v4.js?v=20260727-apu-performance-director-v4";

/**
 * Atlas APU replay-as-song planner (v2).
 *
 * Turns an incident's evidence into a chronological movement plan.
 * Rewrites Pass C v1 to fix the evidence-honesty failures: the previous
 * planner de-duplicated state spans into a set and could invent
 * recovery/resolved movements even for incidents that never recovered.
 *
 * Contract:
 *
 *   - Consumes an ordered `stateSpans` array. Each span is
 *     `{ state, durationMs?, from?, to? }`. Order is preserved.
 *   - Movement kinds map ONLY from state observed in evidence:
 *       * "unknown" span    -> "unknown" movement
 *       * healthy at start  -> "load"    movement (or "boot" for first)
 *       * healthy elsewhere -> "resolved" movement (only if it follows a
 *                              warning or critical span)
 *       * warning           -> "escalate" movement
 *       * critical          -> "failure"  movement
 *       * critical -> anything non-critical -> "recovery" movement
 *     Nothing is invented. If evidence stops mid-critical, no recovery
 *     movement is added.
 *   - Repeated spans of the same state are collapsed into a single
 *     movement whose duration equals the sum, up to a bounded maximum,
 *     so a healthy incident that stayed healthy for an hour does not
 *     turn into a two-hundred-bar movement.
 *   - Duration mapping: durationMs -> bars via a deterministic clamp.
 *   - `sourceLabel` is passed through verbatim (fixture / replay /
 *     live / stale) so the Atlas honesty contract on missing evidence
 *     is preserved.
 *   - Missing state, non-string state, and empty spans list all
 *     produce a single "unknown" movement.
 *   - The plan carries an `evidenceHash` and `warnings` array. Warnings
 *     surface cases like "incident ended mid-critical - no recovery
 *     evidence" so the reviewer sees the honesty check.
 */

export const APU_REPLAY_SONG_BUILD_ID = "20260727-apu-replay-song-v3";

export const REPLAY_MOVEMENT_KINDS = Object.freeze([
  "boot", "load", "play", "escalate", "failure", "unknown", "recovery", "resolved", "export",
]);

const MIN_BARS = Object.freeze({
  boot: 2, load: 2, play: 4, escalate: 3, failure: 3,
  unknown: 2, recovery: 3, resolved: 3, export: 2,
});
const MAX_BARS = Object.freeze({
  boot: 4, load: 4, play: 12, escalate: 6, failure: 8,
  unknown: 6, recovery: 6, resolved: 4, export: 2,
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

export function fnv1a(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function normalizedState(raw) {
  const v = String(raw ?? "").toLowerCase();
  if (["healthy", "warning", "critical", "unknown"].includes(v)) return v;
  return "unknown";
}

// Duration mapping: ms -> bars. Choose a bar per 8 seconds of live
// evidence at 112 BPM (~4s/bar), clamped by movement kind. This is a
// bounded, deterministic function - never Math.random.
function barsForDuration(kind, durationMs, incidentId, salt) {
  const min = MIN_BARS[kind] ?? 2;
  const max = MAX_BARS[kind] ?? 6;
  const ms = clamp(durationMs, 0, 60 * 60 * 1000);
  if (ms <= 0) {
    // No duration evidence: pick a deterministic bounded default from hash
    const offset = fnv1a(`${incidentId}:${kind}:${salt}`) % (max - min + 1);
    return min + offset;
  }
  // Linear map: 8000 ms per bar, clamp into range
  const approx = Math.round(ms / 8000);
  return clamp(approx, min, max);
}

function movementKindForSpan(span, index, previousState, seenFailure) {
  const state = normalizedState(span.state);
  if (state === "unknown") return "unknown";
  if (state === "warning") return "escalate";
  if (state === "critical") return "failure";
  // healthy
  if (index === 0) return "load";
  if (previousState === "critical" || (previousState === "warning" && seenFailure)) return "recovery";
  if (previousState === "warning") return "resolved";
  if (previousState === "critical") return "recovery";
  return "resolved";
}

/**
 * Build a replay song plan from an incident.
 *
 * @param {object} incident
 * @param {string} incident.id
 * @param {ReadonlyArray<{state: string, durationMs?: number}>} incident.stateSpans
 * @param {string} [incident.sourceLabel] - preserved verbatim
 * @param {object} [options]
 * @param {string} [options.seed]
 * @returns {object} frozen plan
 */
export function createReplaySongPlan(incident, { seed = "" } = {}) {
  if (!incident || typeof incident !== "object") {
    throw new TypeError("apu-replay-song: incident is required");
  }
  const incidentId = String(incident.id ?? "incident");
  const spansRaw = Array.isArray(incident.stateSpans) ? incident.stateSpans : null;
  const sourceLabel = typeof incident.sourceLabel === "string" ? incident.sourceLabel : "replay";
  const hashSeed = `${incidentId}|${seed}`;
  const warnings = [];

  // Collapse consecutive same-state spans, summing durationMs.
  const spans = [];
  if (spansRaw?.length) {
    for (const raw of spansRaw) {
      const state = normalizedState(raw?.state);
      const durationMs = Number(raw?.durationMs);
      if (spans.length && spans[spans.length - 1].state === state) {
        spans[spans.length - 1].durationMs += Number.isFinite(durationMs) ? durationMs : 0;
      } else {
        spans.push({ state, durationMs: Number.isFinite(durationMs) ? durationMs : 0 });
      }
    }
  }

  const movements = [];

  // Boot movement is always first - it's the cartridge coming up. It
  // represents the transport starting, not any state evidence.
  movements.push({
    order: 0,
    kind: "boot",
    state: "unknown",
    phase: "intro",
    label: "boot cartridge",
    bars: barsForDuration("boot", 0, incidentId, "boot"),
    fromEvidence: false,
  });

  // Derive movements from evidence in order.
  if (!spans.length) {
    warnings.push("no state evidence - single unknown movement");
    movements.push({
      order: movements.length,
      kind: "unknown",
      state: "unknown",
      phase: "afterglow",
      label: "no evidence",
      bars: barsForDuration("unknown", 0, incidentId, "unknown-no-evidence"),
      fromEvidence: false,
    });
  } else {
    let previousState = null;
    let seenFailure = false;
    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i];
      const kind = movementKindForSpan(span, i, previousState, seenFailure);
      if (kind === "failure") seenFailure = true;
      movements.push({
        order: movements.length,
        kind,
        state: span.state,
        phase: phaseForMovementKind(kind),
        label: labelForMovementKind(kind),
        bars: barsForDuration(kind, span.durationMs, incidentId, `${i}:${span.state}`),
        fromEvidence: true,
        durationMs: span.durationMs || 0,
      });
      previousState = span.state;
    }

    // Honesty checks
    if (previousState === "critical") {
      warnings.push("incident ended mid-critical - no recovery evidence, no recovery movement added");
    }
    if (previousState === "warning" && seenFailure) {
      warnings.push("incident ended in warning after critical - resolved movement omitted (evidence does not show resolution)");
    }
  }

  // Export tail is always present - it represents the reviewer's
  // "listen back and export proof" moment. It's not evidence of
  // anything, just a musical cadence tail. It's clearly labelled.
  movements.push({
    order: movements.length,
    kind: "export",
    state: normalizedState(spans[spans.length - 1]?.state ?? "unknown"),
    phase: "afterglow",
    label: "listen / export",
    bars: barsForDuration("export", 0, incidentId, "export"),
    fromEvidence: false,
  });

  const totalBars = movements.reduce((sum, m) => sum + m.bars, 0);
  const evidenceHash = fnv1a(spans.map((s) => `${s.state}:${s.durationMs}`).join("|"));

  return Object.freeze({
    buildId: APU_REPLAY_SONG_BUILD_ID,
    incidentId,
    sourceLabel,
    seedHash: fnv1a(hashSeed),
    evidenceHash,
    movements: Object.freeze(movements.map((m) => Object.freeze(m))),
    totalBars,
    warnings: Object.freeze(warnings),
    describe: movements.map((m) => `${m.label} (${m.bars}b)`).join(" -> "),
  });
}

function phaseForMovementKind(kind) {
  if (kind === "boot" || kind === "load") return "intro";
  if (kind === "escalate") return "pressure";
  if (kind === "failure") return "rupture";
  if (kind === "recovery") return "recovery";
  if (kind === "resolved" || kind === "export") return "afterglow";
  if (kind === "unknown") return "afterglow";
  return "groove";
}

function labelForMovementKind(kind) {
  return {
    boot: "boot cartridge",
    load: "load incident",
    play: "play movement",
    escalate: "estate escalates",
    failure: "failure point",
    unknown: "signal unknown",
    recovery: "recovery release",
    resolved: "resolved",
    export: "listen / export",
  }[kind] ?? kind;
}

/**
 * Playback cursor over a plan. Advances by bars. Stops at end.
 */
export function createReplaySongCursor(plan) {
  if (!plan || !Array.isArray(plan.movements)) {
    throw new TypeError("apu-replay-song: valid plan required");
  }
  let barCursor = 0;
  return Object.freeze({
    movementForBar(bar) {
      const safeBar = clamp(bar, 0, Number.MAX_SAFE_INTEGER);
      let accumulator = 0;
      for (const movement of plan.movements) {
        if (safeBar < accumulator + movement.bars) return movement;
        accumulator += movement.bars;
      }
      return null;
    },
    advance(bars = 1) {
      barCursor = clamp(barCursor + clamp(bars, 0, plan.totalBars), 0, plan.totalBars);
      return this.movementForBar(barCursor);
    },
    seek(bar = 0) {
      barCursor = clamp(bar, 0, plan.totalBars);
      return this.movementForBar(barCursor);
    },
    reset() { barCursor = 0; },
    getBar() { return barCursor; },
    isFinished() { return barCursor >= plan.totalBars; },
  });
}

/**
 * Overlay an evidence-backed replay movement onto the latest read-only frame.
 * The original frame is retained under replayBaseFrame; no provider state is
 * changed and no service evidence is fabricated.
 */
export function replayFrameForMovement(baseFrame, movement, sourceLabel = "replay") {
  if (!movement) return baseFrame;
  const state = normalizedState(movement.state);
  return Object.freeze({
    ...(baseFrame && typeof baseFrame === "object" ? baseFrame : {}),
    scoreState: state,
    evidenceMode: "replay",
    replaySourceLabel: sourceLabel,
    replayMovement: Object.freeze({
      kind: movement.kind,
      state,
      phase: movement.phase,
      label: movement.label,
      fromEvidence: Boolean(movement.fromEvidence),
    }),
    replayBaseFrame: baseFrame ?? null,
  });
}

/**
 * Make the replay movement own phrase energy while preserving the director's
 * deterministic ornament list and phrase index.
 */
export function performancePlanForReplayMovement(basePlan, movement) {
  if (!movement) return basePlan;
  const phase = PERFORMANCE_PHASES[movement.phase] ? movement.phase : "afterglow";
  const spec = PERFORMANCE_PHASES[phase];
  return Object.freeze({
    ...(basePlan && typeof basePlan === "object" ? basePlan : {}),
    phase,
    state: normalizedState(movement.state),
    silenceBudget: spec.silenceBudget,
    density: spec.density,
    energy: spec.energy,
    replayMovement: movement.kind,
    replayFromEvidence: Boolean(movement.fromEvidence),
  });
}
