"use strict";

import { mountSecondarySurfaceField } from "../../static/js/secondary-surface-fields.js?v=20260728-composition-batch-two-v1";
import { ATLAS_FIELD_COMPOSITIONS } from "../../static/js/atlas-field-composition-registry.js?v=20260728-composition-batch-two-v1";

const AUDIO_FLAGSHIP_CARDS_CSS = "/lab/shared/audio-flagship-cards.css?v=20260813-audio-family-scope-v2";
const AUDIO_FLAGSHIP_CARDS = Object.freeze([
  Object.freeze({ selector: ".lab-flagship-card--symphony", family: "LISTEN", prefix: "System", signature: "SYMPHONY", italic: false }),
  Object.freeze({ selector: ".lab-flagship-card--forge", family: "DESIGN", prefix: "Spectral", signature: "Forge", italic: true }),
]);

export const LAB_INTRO_FIELD = ATLAS_FIELD_COMPOSITIONS["signal-bloom"];

function ensureAudioFlagshipStylesheet(documentNode) {
  const requested = new URL(AUDIO_FLAGSHIP_CARDS_CSS, documentNode.baseURI);
  const present = [...documentNode.head.querySelectorAll('link[rel="stylesheet"][href]')]
    .some((link) => new URL(link.href, documentNode.baseURI).pathname === requested.pathname);
  if (present) return;
  const link = documentNode.createElement("link");
  link.rel = "stylesheet";
  link.href = AUDIO_FLAGSHIP_CARDS_CSS;
  documentNode.head.append(link);
}

export function enhanceAudioFlagshipCards(root = document) {
  const documentNode = root.ownerDocument ?? root;
  const pathname = new URL(documentNode.baseURI).pathname;
  if (!/^\/lab\/?$/.test(pathname)) return;

  ensureAudioFlagshipStylesheet(documentNode);
  for (const definition of AUDIO_FLAGSHIP_CARDS) {
    for (const card of root.querySelectorAll(definition.selector)) {
      if (card.dataset.atlasAudioFamilyReady === "true") continue;
      const topLabel = card.querySelector(".lab-flagship-card__top span:first-child");
      if (topLabel) topLabel.textContent = `ATLAS AUDIO // ${definition.family}`;

      const title = card.querySelector(".lab-flagship-card__copy h3");
      if (title) {
        const prefix = documentNode.createElement("span");
        prefix.className = "lab-flagship-card__prefix";
        prefix.textContent = definition.prefix;
        const signature = definition.italic
          ? documentNode.createElement("em")
          : documentNode.createElement("span");
        signature.className = "lab-flagship-card__signature";
        signature.textContent = definition.signature;
        title.replaceChildren(prefix, documentNode.createTextNode(" "), signature);
      }
      card.dataset.atlasAudioFamilyReady = "true";
    }
  }
}

export function mountLabIntroField(root = document) {
  enhanceAudioFlagshipCards(root);
  return mountSecondarySurfaceField(root, "/lab/");
}
