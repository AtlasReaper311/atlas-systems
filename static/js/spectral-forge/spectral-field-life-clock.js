"use strict";

/* Shared organism-life clock for Spectral Forge.
 *
 * Telemetry `frame.time` remains a finite deterministic scenario clock.
 * Organism life time is a separate monotonic clock consumed by every Field
 * view so PLAY / FORGE / ANALYSE observe one specimen. Persistent physical
 * behaviour state belongs to the same organism lifetime and is reset only by
 * the deliberate hard-reset path.
 */

export function organismLifeActive(playback) {
  return playback === "PLAYING" || playback === "COMPLETE";
}

export function rendererShouldAnimate(state, reducedMotion = false) {
  if (!state || reducedMotion) return false;
  if (state.fieldVisible === false) return false;
  return organismLifeActive(state.playback);
}

export function createOrganismLifeClock() {
  return {
    time: 0,
    lastTimestamp: null,
    audioExpression: 0,
    audioExpressionTime: null,
    attitude: null,
    physical: null,
    physicalFission: null,
  };
}

export function stepOrganismLifeClock(clock, timestamp, playback, dtCap = 0.05) {
  if (!clock) return 0;
  if (!organismLifeActive(playback)) {
    clock.lastTimestamp = null;
    return clock.time;
  }
  if (clock.lastTimestamp == null) {
    clock.lastTimestamp = timestamp;
    return clock.time;
  }
  const elapsed = Math.min(dtCap, Math.max(0, (timestamp - clock.lastTimestamp) / 1000));
  clock.lastTimestamp = timestamp;
  clock.time += elapsed;
  return clock.time;
}

export function resetOrganismLifeClock(clock) {
  if (!clock) return clock;
  clock.time = 0;
  clock.lastTimestamp = null;
  clock.audioExpression = 0;
  clock.audioExpressionTime = null;
  clock.attitude = null;
  clock.framing = null;
  clock.fission = null;
  clock.physical = null;
  clock.physicalFission = null;
  return clock;
}

export function readOrganismLifeTime(state, fallback = 0) {
  const time = state?.organismLife?.time;
  return Number.isFinite(time) ? time : fallback;
}
