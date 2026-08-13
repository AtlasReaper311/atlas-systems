"use strict";

import { SCENARIO_BY_ID, SIGNAL_BY_ID, clamp } from "./domain.js";
import { SCENARIO_TRANSITION_MS, visualTargetState } from "./spectral-field-model.js";

export function transitionMix(timestamp) {
  if (this.reducedMotion || !this.field3TransitionStartedAt) return 1;
  return clamp((timestamp - this.field3TransitionStartedAt) / SCENARIO_TRANSITION_MS);
}

export function transitionActive(timestamp = performance.now()) {
  return transitionMix.call(this, timestamp) < 1;
}

export function updateAccessibleSummary() {
  if (!this.state) return;
  const { frame, scenarioId, selectedMapping, routeFocus, outputs } = this.state;
  const pressure = Math.round((frame.normalised.anomaly_score * 0.55 + frame.normalised.error_rate * 0.25 + frame.normalised.queue_depth * 0.2) * 100);
  const visual = visualTargetState(outputs);
  const route = selectedMapping
    ? ` Selected route ${SIGNAL_BY_ID[selectedMapping.source].label} to ${selectedMapping.target.replaceAll("_", " ")}${routeFocus ? ", route focus active" : ""}.`
    : " Combined mapped state.";
  this.canvas.setAttribute(
    "aria-label",
    `Spectral Field for ${SCENARIO_BY_ID[scenarioId].label}; ${frame.health.toLowerCase()} simulated state; structural pressure ${pressure} percent; spectral aperture ${Math.round(visual.aperture * 100)} percent; body coherence ${Math.round(visual.bodyStrength * 100)} percent.${route}`,
  );
}
