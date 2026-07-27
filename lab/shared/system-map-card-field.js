import {
  defineAtlasFieldConsumer,
  mountAtlasFieldConsumer,
} from "../../static/js/atlas-field-consumer.js?v=20260728-consumer-contract-v1";

export const SYSTEM_MAP_CARD_FIELD = defineAtlasFieldConsumer({
  selector: "#system-map.featured",
  preset: "card",
  hostClasses: ["system-map-card-atlas-field"],
  errorLabel: "System Map card AtlasField",
  options: {
    canvasClass: "system-map-card-field-canvas",
    seed: "atlas-system-map-featured-card-v2",
    density: {
      min: 230,
      max: 520,
      reduced: 180,
      areaDivisor: 1000,
    },
    domainStyles: [
      "rgba(74, 222, 128, 0.18)",
      "rgba(245, 166, 35, 0.21)",
      "rgba(56, 189, 248, 0.17)",
    ],
    pointer: { enabled: false },
    light: {
      radiusMin: 150,
      radiusRatio: 0.38,
      smoothing: 0.024,
    },
  },
});

export function mountSystemMapCardField(root = document) {
  return mountAtlasFieldConsumer(SYSTEM_MAP_CARD_FIELD, root);
}
