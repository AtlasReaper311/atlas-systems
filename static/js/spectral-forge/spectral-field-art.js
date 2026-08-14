"use strict";

import { installSpectralFieldRuntime } from "./spectral-field-install.js";
import { draw } from "./spectral-field-compose-v4.js";
import { syncLoop, tick, transitionActive, transitionMix, updateAccessibleSummary } from "./spectral-field-runtime.js";
import { drawAfterimages, drawBackdrop, drawCausalPropagation, drawFracture, drawLattice, drawMicrostructure, drawPulseEmissions, drawSelectedRoute, drawSignalFilaments, drawSpectralBody } from "./spectral-field-layers-v4.js";

installSpectralFieldRuntime({
  updateAccessibleSummary,
  syncLoop,
  tick,
  draw,
  transitionMix,
  transitionActive,
  drawBackdrop,
  drawAfterimages,
  drawSpectralBody,
  drawLattice,
  drawSignalFilaments,
  drawMicrostructure,
  drawCausalPropagation,
  drawPulseEmissions,
  drawFracture,
  drawSelectedRoute,
});