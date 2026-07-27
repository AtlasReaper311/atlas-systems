import { createAtlasField } from "../../static/js/atlas-field.js?v=20260727-atlas-field-production-v2";

export const LAB_INTRO_FIELD = Object.freeze({
  selector: ".page-intro",
  hostClass: "lab-intro-atlas-field",
  options: Object.freeze({
    preset: "ambient",
    canvasClass: "lab-intro-field-canvas",
    seed: "atlas-lab-intro-ambient-v1",
    density: Object.freeze({
      min: 180,
      max: 520,
      reduced: 160,
      areaDivisor: 1300,
    }),
    domainStyles: Object.freeze([
      "rgba(74, 222, 128, 0.10)",
      "rgba(245, 166, 35, 0.055)",
      "rgba(56, 189, 248, 0.095)",
    ]),
    pointer: Object.freeze({ enabled: false }),
    light: Object.freeze({
      radiusMin: 170,
      radiusRatio: 0.34,
      smoothing: 0.018,
    }),
  }),
});

export function mountLabIntroField(root = document) {
  const host = root.querySelector(LAB_INTRO_FIELD.selector);
  if (!host) return null;
  if (host.dataset.atlasIntroFieldState === "ready") {
    return host.querySelector(":scope > canvas.atlas-field-canvas");
  }

  try {
    const controller = createAtlasField(host, LAB_INTRO_FIELD.options);
    if (!controller) {
      host.dataset.atlasIntroFieldState = "unavailable";
      return null;
    }

    host.classList.add(LAB_INTRO_FIELD.hostClass);
    host.dataset.atlasIntroFieldState = "ready";
    return controller;
  } catch (error) {
    host.dataset.atlasIntroFieldState = "unavailable";
    console.error("Lab intro AtlasField unavailable", error);
    return null;
  }
}
