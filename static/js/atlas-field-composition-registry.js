"use strict";

import { defineAtlasFieldConsumer } from "./atlas-field-consumer.js?v=20260728-consumer-contract-v1";

const SHARED = Object.freeze({
  preset: "ambient",
  stateKey: "atlasCompositionState",
  options: Object.freeze({
    pointer: Object.freeze({ enabled: false }),
  }),
});

function composition(definition) {
  return defineAtlasFieldConsumer({
    ...SHARED,
    ...definition,
    options: {
      ...SHARED.options,
      ...definition.options,
    },
  });
}

export const ATLAS_FIELD_COMPOSITIONS = Object.freeze({
  "pulse-horizon": composition({
    selector: ".focus-hero",
    hostClasses: ["atlas-composition-host", "atlas-composition--pulse-horizon"],
    errorLabel: "Reliability pulse-horizon field",
    options: {
      canvasClass: "atlas-composition-canvas",
      seed: "atlas-reliability-pulse-horizon-v1",
      density: { min: 170, max: 480, reduced: 140, areaDivisor: 1450 },
      domainBreaks: [0.5, 0.84],
      domainStyles: [
        "rgba(74, 222, 128, 0.095)",
        "rgba(245, 166, 35, 0.075)",
        "rgba(56, 189, 248, 0.055)",
      ],
      light: { radiusMin: 220, radiusRatio: 0.46, smoothing: 0.012 },
    },
  }),
  "identity-field": composition({
    selector: ".page-header",
    hostClasses: ["atlas-composition-host", "atlas-composition--identity-field"],
    errorLabel: "About identity field",
    options: {
      canvasClass: "atlas-composition-canvas",
      seed: "atlas-about-identity-field-v1",
      density: { min: 150, max: 440, reduced: 130, areaDivisor: 1500 },
      domainBreaks: [0.58, 0.86],
      domainStyles: [
        "rgba(245, 166, 35, 0.105)",
        "rgba(232, 232, 224, 0.055)",
        "rgba(170, 169, 160, 0.04)",
      ],
      light: { radiusMin: 190, radiusRatio: 0.38, smoothing: 0.01 },
    },
  }),
  "signal-bloom": composition({
    selector: ".page-intro",
    stateKey: "atlasIntroFieldState",
    hostClasses: ["atlas-composition-host", "atlas-composition--signal-bloom"],
    errorLabel: "Lab signal-bloom field",
    options: {
      canvasClass: "atlas-composition-canvas",
      seed: "atlas-lab-signal-bloom-v2",
      density: { min: 210, max: 620, reduced: 170, areaDivisor: 1150 },
      domainBreaks: [0.38, 0.7],
      domainStyles: [
        "rgba(74, 222, 128, 0.105)",
        "rgba(56, 189, 248, 0.11)",
        "rgba(245, 166, 35, 0.065)",
      ],
      light: { radiusMin: 165, radiusRatio: 0.3, smoothing: 0.018 },
    },
  }),
});

export const ATLAS_FIELD_ROUTE_COMPOSITIONS = Object.freeze({
  "/systems/reliability/": "pulse-horizon",
  "/about/": "identity-field",
  "/lab/": "signal-bloom",
});

export function compositionForRoute(pathname) {
  const normalized = pathname === "/" || pathname.endsWith("/") ? pathname : `${pathname}/`;
  const name = ATLAS_FIELD_ROUTE_COMPOSITIONS[normalized];
  if (!name) return null;
  return Object.freeze({ name, definition: ATLAS_FIELD_COMPOSITIONS[name] });
}
