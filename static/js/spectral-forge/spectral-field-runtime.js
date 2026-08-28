"use strict";

import { transitionActive, transitionMix, updateAccessibleSummary } from "./spectral-field-state.js";
import {
  rendererShouldAnimate,
  stepOrganismLifeClock,
} from "./spectral-field-life-clock.js";

export { transitionActive, transitionMix, updateAccessibleSummary };

export function syncLoop() {
  const shouldRun = rendererShouldAnimate(this.state, this.reducedMotion) || Boolean(this.state && transitionActive.call(this));
  if (shouldRun && !this.animationFrame) {
    this.lastTimestamp = performance.now();
    this.animationFrame = requestAnimationFrame((timestamp) => tick.call(this, timestamp));
  } else if (!shouldRun && this.animationFrame) {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }
}

export function tick(timestamp) {
  this.animationFrame = 0;
  if (!this.state || this.reducedMotion) return;
  const elapsed = Math.min(0.05, (timestamp - this.lastTimestamp) / 1000);
  this.lastTimestamp = timestamp;
  if (this.state.organismLife) {
    if (this.state.fieldVisible !== false) {
      stepOrganismLifeClock(this.state.organismLife, timestamp, this.state.playback);
    }
    this.visualTime = this.state.organismLife.time;
  } else if (rendererShouldAnimate(this.state, false)) {
    this.visualTime += elapsed;
  }
  if (this.canvas) {
    this.canvas.dataset.organismLifeTime = String(this.visualTime);
    if (this.state.playback) this.canvas.dataset.fieldPlayback = this.state.playback;
  }
  this.draw(timestamp);
  if (rendererShouldAnimate(this.state, this.reducedMotion) || transitionActive.call(this, timestamp)) {
    this.animationFrame = requestAnimationFrame((next) => tick.call(this, next));
  }
}
