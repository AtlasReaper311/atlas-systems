"use strict";

const STYLESHEET = "/lab/shared/audio-flagship-cards.css?v=20260813-audio-family-scope";
const DEFINITIONS = Object.freeze([
  Object.freeze({ selector: ".lab-flagship-card--symphony", family: "LISTEN", prefix: "System", signature: "SYMPHONY", italic: false }),
  Object.freeze({ selector: ".lab-flagship-card--forge", family: "DESIGN", prefix: "Spectral", signature: "Forge", italic: true }),
]);

function ensureStylesheet(documentNode) {
  if (documentNode.head.querySelector(`link[href="${STYLESHEET}"]`)) return;
  const link = documentNode.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  documentNode.head.append(link);
}

export function enhanceAudioFlagshipCards(root = document) {
  const documentNode = root.ownerDocument ?? root;
  ensureStylesheet(documentNode);
  for (const definition of DEFINITIONS) {
    for (const card of root.querySelectorAll(definition.selector)) {
      if (card.dataset.atlasAudioFamilyReady === "true") continue;
      const topLabel = card.querySelector(".lab-flagship-card__top span:first-child");
      if (topLabel) topLabel.textContent = `ATLAS AUDIO // ${definition.family}`;
      const title = card.querySelector(".lab-flagship-card__copy h3");
      if (title) {
        const prefix = documentNode.createElement("span");
        prefix.className = "lab-flagship-card__prefix";
        prefix.textContent = definition.prefix;
        const signature = definition.italic ? documentNode.createElement("em") : documentNode.createElement("span");
        signature.className = "lab-flagship-card__signature";
        signature.textContent = definition.signature;
        title.replaceChildren(prefix, documentNode.createTextNode(" "), signature);
      }
      card.dataset.atlasAudioFamilyReady = "true";
    }
  }
}

function start() {
  enhanceAudioFlagshipCards(document);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
