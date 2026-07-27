import { createAtlasField } from "../../static/js/atlas-field.js?v=20260727-atlas-field-production-v2";

export const SYSTEM_MAP_CARD_FIELD = Object.freeze({
  selector: "#system-map.featured",
  hostClass: "system-map-card-atlas-field",
  options: Object.freeze({
    preset: "card",
    canvasClass: "system-map-card-field-canvas",
    seed: "atlas-system-map-featured-card-v1",
    density: Object.freeze({
      min: 340,
      max: 720,
      reduced: 240,
      areaDivisor: 700,
    }),
    domainStyles: Object.freeze([
      "rgba(74, 222, 128, 0.30)",
      "rgba(245, 166, 35, 0.34)",
      "rgba(56, 189, 248, 0.28)",
    ]),
    pointer: Object.freeze({ enabled: false }),
    light: Object.freeze({
      radiusMin: 210,
      radiusRatio: 0.54,
      smoothing: 0.024,
    }),
  }),
});

export function mountSystemMapCardField(root = document) {
  const host = root.querySelector(SYSTEM_MAP_CARD_FIELD.selector);
  if (!host) return null;
  if (host.dataset.atlasFieldState === "ready") return host.querySelector(":scope > canvas.atlas-field-canvas");

  try {
    const controller = createAtlasField(host, SYSTEM_MAP_CARD_FIELD.options);
    if (!controller) {
      host.dataset.atlasFieldState = "unavailable";
      return null;
    }

    host.classList.add(SYSTEM_MAP_CARD_FIELD.hostClass);
    host.dataset.atlasFieldState = "ready";
    return controller;
  } catch (error) {
    host.dataset.atlasFieldState = "unavailable";
    console.error("System Map card AtlasField unavailable", error);
    return null;
  }
}

function initialise() {
  mountSystemMapCardField();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialise, { once: true });
} else {
  initialise();
}
