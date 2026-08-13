"use strict";

import { TARGETS, TARGET_BY_ID, clamp } from "./domain.js";

export const SONIC_BASE_FREQUENCY = 92;
export const SONIC_SUB_FREQUENCY = SONIC_BASE_FREQUENCY / 2;
export const COMPARE_INTERPOLATION_SECONDS = 0.1;

export const HARMONIC_PROFILES = Object.freeze({
  STABLE: Object.freeze({ harmonic: 1.5, shimmer: 2.8125, event: [1, 1.5] }),
  PRESSURED: Object.freeze({ harmonic: 1.414, shimmer: 2.52, event: [1, 1.414] }),
  DEGRADED: Object.freeze({ harmonic: 1.366, shimmer: 2.31, event: [1, 1.366] }),
  FAILED: Object.freeze({ harmonic: 1.2, shimmer: 2.18, event: [1, 1.2] }),
  RECOVERING: Object.freeze({ harmonic: 1.48, shimmer: 2.72, event: [1, 1.25, 1.5] }),
});

export const DEPLOY_GESTURE_RATIOS = Object.freeze([1, 1.25, 1.5]);

export function targetNormalised(id, value) {
  const target = TARGET_BY_ID[id];
  if (!target) return 0;
  return clamp((value - target.min) / (target.max - target.min));
}

export function effectiveStereoWidth(parameters) {
  const mappedWidth = targetNormalised("stereo_width", parameters.stereo_width);
  const instability = targetNormalised("instability", parameters.instability);
  return clamp(mappedWidth * (1 - instability * 0.58), 0.08, 1);
}

export function mappedParameterDelta(previous, next) {
  if (!previous) return 0;
  let maximum = 0;
  for (const target of TARGETS) {
    const span = Math.max(1e-9, target.max - target.min);
    const delta = Math.abs((next[target.id] - previous[target.id]) / span);
    maximum = Math.max(maximum, Number.isFinite(delta) ? delta : 0);
  }
  return maximum;
}
