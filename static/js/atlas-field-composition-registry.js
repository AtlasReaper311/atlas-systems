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
      seed: "atlas-reliability-pulse-horizon-v2",
      density: { min: 220, max: 620, reduced: 170, areaDivisor: 1180 },
      domainBreaks: [0.48, 0.82],
      domainStyles: [
        "rgba(74, 222, 128, 0.145)",
        "rgba(245, 166, 35, 0.115)",
        "rgba(56, 189, 248, 0.105)",
      ],
      light: { radiusMin: 205, radiusRatio: 0.4, smoothing: 0.014 },
    },
  }),
  "identity-field": composition({
    selector: ".page-header",
    hostClasses: ["atlas-composition-host", "atlas-composition--identity-field"],
    errorLabel: "About identity field",
    options: {
      canvasClass: "atlas-composition-canvas",
      seed: "atlas-about-identity-field-v2",
      density: { min: 210, max: 560, reduced: 160, areaDivisor: 1220 },
      domainBreaks: [0.62, 0.88],
      domainStyles: [
        "rgba(245, 166, 35, 0.16)",
        "rgba(247, 184, 74, 0.09)",
        "rgba(232, 232, 224, 0.065)",
      ],
      light: { radiusMin: 175, radiusRatio: 0.32, smoothing: 0.012 },
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
