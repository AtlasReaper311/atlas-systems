// This module is loaded through the cache-versioned Lab shell entry in lab/index.html.
// Bump that HTML asset version whenever the Lab field mount contract changes.
import { createAtlasField } from "../../static/js/atlas-field.js";
import { enhanceCardSignatures } from "../../static/js/card-signatures.js";

export const LAB_FIELD_TARGETS = Object.freeze({
  intro: Object.freeze({
    selector: ".page-intro",
    hostClass: "lab-intro-atlas-field",
    options: Object.freeze({
      preset: "ambient",
      canvasClass: "lab-intro-field-canvas",
      seed: "atlas-lab-intro-field-v2",
      density: Object.freeze({ min: 560, max: 1200, reduced: 360, areaDivisor: 620 }),
      domainStyles: Object.freeze([
        "rgba(74, 222, 128, 0.30)",
        "rgba(245, 166, 35, 0.32)",
        "rgba(56, 189, 248, 0.28)",
      ]),
      pointer: Object.freeze({ enabled: false }),
      light: Object.freeze({ radiusMin: 260, radiusRatio: 0.52, smoothing: 0.02 }),
    }),
  }),
  systemMapCard: Object.freeze({
    selector: "#system-map",
    hostClass: "lab-system-map-atlas-field",
    options: Object.freeze({
      preset: "card",
      canvasClass: "lab-system-map-field-canvas",
      seed: "atlas-system-map-card-field-v3",
      density: Object.freeze({ min: 420, max: 900, reduced: 280, areaDivisor: 620 }),
      domainStyles: Object.freeze([
        "rgba(74, 222, 128, 0.38)",
        "rgba(245, 166, 35, 0.42)",
        "rgba(56, 189, 248, 0.36)",
      ]),
      pointer: Object.freeze({ enabled: false }),
      light: Object.freeze({ radiusMin: 220, radiusRatio: 0.56, smoothing: 0.024 }),
    }),
  }),
});

function mountLabField(root, target) {
  const host = root.querySelector(target.selector);
  if (!host || host.dataset.atlasFieldReady === "true") return null;

  const controller = createAtlasField(host, target.options);
  if (!controller) return null;

  host.classList.add(target.hostClass);
  host.dataset.atlasFieldReady = "true";
  return controller;
}

export async function initLabFields(root = document) {
  await enhanceCardSignatures(root);
  const controllers = Object.values(LAB_FIELD_TARGETS)
    .map((target) => mountLabField(root, target))
    .filter(Boolean);
  return Object.freeze(controllers);
}

function startLabFields() {
  initLabFields().catch((error) => {
    console.warn(`[lab-fields] ${error.message}; preserving static Lab presentation`);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startLabFields, { once: true });
  } else {
    startLabFields();
  }
}
