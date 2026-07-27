import {
  defineAtlasFieldConsumer,
  mountAtlasFieldConsumer,
} from "../../static/js/atlas-field-consumer.js?v=20260728-consumer-contract-v1";

export const LAB_INTRO_FIELD = defineAtlasFieldConsumer({
  selector: ".page-intro",
  preset: "ambient",
  stateKey: "atlasIntroFieldState",
  hostClasses: ["lab-intro-atlas-field"],
  errorLabel: "Lab intro AtlasField",
  options: {
    canvasClass: "lab-intro-field-canvas",
    seed: "atlas-lab-intro-ambient-v1",
    density: {
      min: 180,
      max: 520,
      reduced: 160,
      areaDivisor: 1300,
    },
    domainStyles: [
      "rgba(74, 222, 128, 0.10)",
      "rgba(245, 166, 35, 0.055)",
      "rgba(56, 189, 248, 0.095)",
    ],
    pointer: { enabled: false },
    light: {
      radiusMin: 170,
      radiusRatio: 0.34,
      smoothing: 0.018,
    },
  },
});

export function mountLabIntroField(root = document) {
  return mountAtlasFieldConsumer(LAB_INTRO_FIELD, root);
}
