"use strict";

/* Scenario-local telemetry clock, distinct from organism life time.
 *
 * Selecting a scenario changes the forces on the same living specimen.
 * RESET restarts organism life; REPLAY restarts only the selected scenario's
 * finite telemetry clock on the same specimen.
 *
 * Telemetry is the forcing function, so it must not jump. Selecting a new
 * condition captures the current live signal values, measures them against the
 * incoming scenario's native value at local time zero, and carries that offset
 * into the new trajectory while it decays over scenario-local seconds. The new
 * scenario therefore owns its own shape from the first frame but inherits the
 * state the previous condition actually left behind.
 */

import {
  SCENARIO_BY_ID,
  SIGNALS,
  SIGNAL_BY_ID,
  clamp,
  createFrame,
  normaliseSignal,
} from "./domain.js";
import { organismLifeActive } from "./spectral-field-life-clock.js";

/* Long enough to read as one continuous specimen, short enough that the new
 * condition is unmistakably in charge within the 3-8s recognition window. */
export const TELEMETRY_HANDOFF_SECONDS = 4.5;

/* An offset below this fraction of a signal's range is not perceptible, so a
 * handoff carrying only such offsets is not worth holding. */
const NEGLIGIBLE_OFFSET_FRACTION = 0.004;

function unchangedSelection(state, scenarioId, playback) {
  return {
    changed: false,
    scenarioId,
    playback,
    scenarioTime: state?.scenarioTime ?? 0,
    resetOrganism: false,
    keepTimer: playback === "PLAYING",
    startTimer: false,
    stopTimer: false,
    handoff: false,
    notice: "",
  };
}

export function applyScenarioSelection(state, nextScenarioId) {
  const scenarioId = state?.scenarioId;
  const playback = state?.playback ?? "STOPPED";
  if (!SCENARIO_BY_ID[nextScenarioId]) return unchangedSelection(state, scenarioId, playback);

  if (nextScenarioId === scenarioId) {
    if (playback !== "COMPLETE") return unchangedSelection(state, scenarioId, playback);
    return {
      changed: true,
      scenarioId,
      playback: "PLAYING",
      scenarioTime: 0,
      resetOrganism: false,
      keepTimer: false,
      startTimer: true,
      stopTimer: false,
      handoff: true,
      notice: `${SCENARIO_BY_ID[scenarioId].label} · scenario replayed · organism continues`,
    };
  }

  const nextPlayback = playback === "COMPLETE" ? "PLAYING" : playback;
  const living = organismLifeActive(playback) || nextPlayback === "PLAYING";
  return {
    changed: true,
    scenarioId: nextScenarioId,
    playback: nextPlayback,
    scenarioTime: 0,
    resetOrganism: false,
    keepTimer: playback === "PLAYING" && nextPlayback === "PLAYING",
    startTimer: nextPlayback === "PLAYING" && playback !== "PLAYING",
    stopTimer: nextPlayback !== "PLAYING",
    handoff: living && (playback === "PLAYING" || playback === "COMPLETE"),
    notice: `${SCENARIO_BY_ID[nextScenarioId].label} · condition applied · organism continues`,
  };
}

/* Captures the offset between the live signal state and where the incoming
 * scenario natively begins. Offsets are held in raw signal units and consumed
 * against scenario-local time, so the transition is deterministic, identical on
 * replay, and paused along with playback. */
export function beginScenarioHandoff(fromFrame, nextScenarioId, duration = TELEMETRY_HANDOFF_SECONDS) {
  if (!fromFrame?.values || !SCENARIO_BY_ID[nextScenarioId]) return null;
  const span = Math.max(0.001, Number(duration) || TELEMETRY_HANDOFF_SECONDS);
  const native = createFrame(nextScenarioId, 0);
  const offsets = {};
  let perceptible = false;
  for (const signal of SIGNALS) {
    const delta = Number(fromFrame.values[signal.id]) - native.values[signal.id];
    offsets[signal.id] = Number.isFinite(delta) ? delta : 0;
    if (Math.abs(offsets[signal.id]) > (signal.max - signal.min) * NEGLIGIBLE_OFFSET_FRACTION) {
      perceptible = true;
    }
  }
  if (!perceptible) return null;
  return Object.freeze({
    offsets: Object.freeze(offsets),
    duration: span,
    fromHealth: fromFrame.health,
  });
}

/* Full offset at local time zero with zero slope at both ends, so the signal
 * leaves the previous value continuously and arrives at the native trajectory
 * without a kink. */
export function scenarioHandoffWeight(handoff, scenarioTime) {
  if (!handoff) return 0;
  const t = clamp(Number(scenarioTime) / Math.max(0.001, handoff.duration));
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

export function scenarioHandoffActive(handoff, scenarioTime) {
  return scenarioHandoffWeight(handoff, scenarioTime) > 0;
}

function offsetFrame(native, handoff, weight) {
  const values = {};
  const normalised = {};
  for (const signal of SIGNALS) {
    const definition = SIGNAL_BY_ID[signal.id];
    const shifted = native.values[signal.id] + handoff.offsets[signal.id] * weight;
    const bounded = clamp(shifted, definition.min, definition.max);
    values[signal.id] = bounded;
    normalised[signal.id] = normaliseSignal(signal.id, bounded);
  }
  return Object.freeze({
    ...native,
    values: Object.freeze(values),
    normalised: Object.freeze(normalised),
    health: weight > 0.5 ? handoff.fromHealth : native.health,
  });
}

/* The single place a telemetry frame is produced for the running instrument.
 * Everything downstream - graph, mapped outputs, physical state, renderer -
 * consumes this one continuous frame. */
export function scenarioFrameAt(scenarioId, scenarioTime, handoff = null) {
  const native = createFrame(scenarioId, scenarioTime);
  const weight = scenarioHandoffWeight(handoff, scenarioTime);
  if (weight <= 0) return native;
  return offsetFrame(native, handoff, weight);
}
