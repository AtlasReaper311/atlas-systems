"use strict";

import { draw as fallbackDraw } from "./spectral-field-compose.js";
import { transitionActive, transitionMix, updateAccessibleSummary } from "./spectral-field-state.js";

export { fallbackDraw as draw, transitionActive, transitionMix, updateAccessibleSummary };

export function syncLoop() {
  const shouldRun = Boolean(this.state && !this.reducedMotion && (this.state.playback === "PLAYING" || transitionActive.call(this)));
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
  if (this.state.playback === "PLAYING") this.visualTime += elapsed;
  const render = typeof this.draw === "function" ? this.draw : fallbackDraw;
  render.call(this, timestamp);
  if (this.state.playback === "PLAYING" || transitionActive.call(this, timestamp)) {
    this.animationFrame = requestAnimationFrame((next) => tick.call(this, next));
  }
}
