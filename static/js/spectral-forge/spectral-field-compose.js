"use strict";

import { deriveFieldGeometry } from "./spectral-field-geometry.js";
import { transitionMix } from "./spectral-field-state.js";
import { drawAfterimages, drawBackdrop, drawCausalPropagation, drawFracture, drawLattice, drawMicrostructure, drawPulseEmissions, drawSelectedRoute, drawSignalFilaments, drawSpectralBody } from "./spectral-field-layers.js";

function canvasSize(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, ratio };
}

function beginScenarioTransition(renderer, scenarioId, timestamp) {
  if (!renderer.field3LastScenarioId || renderer.field3LastScenarioId === scenarioId || renderer.reducedMotion) {
    renderer.field3LastScenarioId = scenarioId;
    return false;
  }
  renderer.field3TransitionStartedAt = timestamp;
  renderer.field3LastScenarioId = scenarioId;
  return true;
}

export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  const { width, height, ratio } = canvasSize(this.canvas);
  const { frame, selectedMapping, selectedCalculation, routeFocus, scenarioId } = this.state;
  const transitionStarted = beginScenarioTransition(this, scenarioId, timestamp);
  const geometry = deriveFieldGeometry(this.state, this.visualTime, width, height);
  const { centerX, centerY, mapped, health } = geometry;
  const mix = transitionMix.call(this, timestamp);
  this.context.clearRect(0, 0, width, height);
  this.context.fillStyle = "#07070c";
  this.context.fillRect(0, 0, width, height);
  drawBackdrop.call(this, this.context, { width, height, ...geometry });
  this.context.save();
  this.context.globalAlpha = 0.2 + mix * 0.8;
  const scale = 0.965 + mix * 0.035;
  this.context.translate(centerX, centerY);
  this.context.scale(scale, scale);
  this.context.translate(-centerX, -centerY);
  const shared = { width, height, ratio, ...geometry, frame, scenarioId };
  drawAfterimages.call(this, this.context, shared);
  drawSpectralBody.call(this, this.context, shared);
  drawLattice.call(this, this.context, shared);
  drawSignalFilaments.call(this, this.context, { ...shared, selectedMapping });
  drawMicrostructure.call(this, this.context, shared);
  drawCausalPropagation.call(this, this.context, shared);
  drawPulseEmissions.call(this, this.context, shared);
  drawFracture.call(this, this.context, { ...shared, fractureScale: health.fractureScale });
  if (selectedMapping && selectedCalculation) drawSelectedRoute.call(this, this.context, { ...shared, selectedMapping, selectedCalculation, routeFocus, mapped });
  this.context.restore();
  if (transitionStarted && this.state.playback !== "PLAYING") this.syncLoop();
}
