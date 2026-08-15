"use strict";

/* Scenario-local telemetry clock, distinct from organism life time.
 *
 * Selecting a scenario changes the forces on the same living specimen.
 * RESET restarts organism life; REPLAY restarts only the selected scenario's
 * finite telemetry clock on the same specimen.
 */

import { SCENARIO_BY_ID, SIGNALS, clamp, createFrame } from "./domain.js";
import { organismLifeActive } from "./spectral-field-life-clock.js";

export const SCENARIO_HANDOFF_MS = 620;
export const SCENARIO_HANDOFF_SECONDS = SCENARIO_HANDOFF_MS / 1000;

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

export function beginScenarioHandoff(fromFrame, startedAt) {
  if (!fromFrame || !Number.isFinite(startedAt)) return null;
  return {
    fromFrame,
    startedAt,
    duration: SCENARIO_HANDOFF_MS,
  };
}

export function scenarioHandoffMix(handoff, now) {
  if (!handoff || !Number.isFinite(handoff.startedAt)) return 1;
  const duration = Math.max(1, Number(handoff.duration) || SCENARIO_HANDOFF_MS);
  return clamp((now - handoff.startedAt) / duration);
}

export function mixScenarioFrames(fromFrame, toFrame, amount) {
  if (!toFrame) return fromFrame;
  if (!fromFrame) return toFrame;
  const t = clamp(amount);
  if (t <= 0) return fromFrame;
  if (t >= 1) return toFrame;
  const s = t * t * (3 - 2 * t);
  const values = {};
  const normalised = {};
  for (const signal of SIGNALS) {
    const fromValue = fromFrame.values[signal.id];
    const toValue = toFrame.values[signal.id];
    values[signal.id] = fromValue + (toValue - fromValue) * s;
    const fromNorm = fromFrame.normalised[signal.id];
    const toNorm = toFrame.normalised[signal.id];
    normalised[signal.id] = fromNorm + (toNorm - fromNorm) * s;
  }
  return Object.freeze({
    ...toFrame,
    values: Object.freeze(values),
    normalised: Object.freeze(normalised),
    health: s < 0.55 ? fromFrame.health : toFrame.health,
  });
}

export function resolveScenarioFrame(targetFrame, handoff, now) {
  if (!handoff) return targetFrame;
  const mix = scenarioHandoffMix(handoff, now);
  if (mix >= 1) return targetFrame;
  return mixScenarioFrames(handoff.fromFrame, targetFrame, mix);
}

export function scenarioFrameAt(scenarioId, scenarioTime) {
  return createFrame(scenarioId, scenarioTime);
}
