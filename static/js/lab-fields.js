import { createAtlasField } from "./atlas-field.js";
import { enhanceCardSignatures } from "./card-signatures.js";

export const LAB_FIELD_TARGETS = Object.freeze({
  intro: Object.freeze({
    selector: ".page-intro",
    hostClass: "lab-intro-atlas-field",
    options: Object.freeze({
      preset: "ambient",
      canvasClass: "lab-intro-field-canvas",
      seed: "atlas-lab-intro-field-v1",
      density: Object.freeze({ min: 320, max: 820, reduced: 240, areaDivisor: 980 }),
      domainStyles: Object.freeze([
        "rgba(74, 222, 128, 0.11)",
        "rgba(245, 166, 35, 0.12)",
        "rgba(56, 189, 248, 0.10)",
      ]),
      pointer: Object.freeze({ enabled: false }),
      light: Object.freeze({ radiusMin: 210, radiusRatio: 0.44, smoothing: 0.02 }),
    }),
  }),
  systemMapCard: Object.freeze({
    selector: "#system-map",
    hostClass: "lab-system-map-atlas-field",
    options: Object.freeze({
      preset: "card",
      canvasClass: "lab-system-map-field-canvas",
      seed: "atlas-system-map-card-field-v2",
      density: Object.freeze({ min: 220, max: 520, reduced: 160, areaDivisor: 900 }),
      domainStyles: Object.freeze([
        "rgba(74, 222, 128, 0.17)",
        "rgba(245, 166, 35, 0.20)",
        "rgba(56, 189, 248, 0.16)",
      ]),
      pointer: Object.freeze({ enabled: false }),
      light: Object.freeze({ radiusMin: 170, radiusRatio: 0.48, smoothing: 0.024 }),
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
