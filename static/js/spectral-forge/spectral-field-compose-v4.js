"use strict";

import { draw as drawFlagshipFinalForm } from "./prototypes/field-proto-flagship-final-form.js";

/*
 * Canonical Spectral Field renderer entrypoint.
 *
 * The approved living ferrofluid organism is now the shipped/default artwork.
 * Keep the existing v4-spatial data identity temporarily because the governed
 * browser-evidence contract keys on that logical Field renderer identifier.
 * The development ?proto=flagship-final-form selector remains harmless but is
 * no longer required to see the approved organism.
 */
export function draw(timestamp = performance.now()) {
  if (!this.context || !this.state) return;
  drawFlagshipFinalForm.call(this, timestamp);
  this.canvas.dataset.fieldRenderer = "v4-spatial";
}
