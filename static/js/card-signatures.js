import "./directory-header-fields.js?v=20260728-directory-header-compositions-v2";

export const CARD_SIGNATURES = Object.freeze([
  "work",
  "writing",
  "about",
  "cv",
  "ramone",
  "status",
  "symphony",
  "lab",
  "map",
  "proof",
  "conformance",
  "reliability",
  "api",
  "signal",
  "anomaly",
  "almost",
  "console",
]);

const SIGNATURE_SET = new Set(CARD_SIGNATURES);
const SVG_NS = "http://www.w3.org/2000/svg";
const SPRITE_PATH = new URL("../media/card-signatures.svg", import.meta.url).href;
const SPRITE_ID = "atlas-card-signature-sprite";
let spritePromise;

async function installSprite(documentNode) {
  if (documentNode.getElementById(SPRITE_ID)) {
    return;
  }

  const response = await fetch(SPRITE_PATH, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`signature sprite request failed with ${response.status}`);
  }

  const source = await response.text();
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("signature sprite is not valid SVG");
  }

  const sprite = documentNode.importNode(parsed.documentElement, true);
  sprite.id = SPRITE_ID;
  sprite.setAttribute("aria-hidden", "true");
  sprite.setAttribute("focusable", "false");
  sprite.style.position = "absolute";
  sprite.style.width = "0";
  sprite.style.height = "0";
  sprite.style.overflow = "hidden";
  documentNode.body.prepend(sprite);
}

export async function enhanceCardSignatures(root = document) {
  const documentNode = root.ownerDocument ?? root;
  spritePromise ??= installSprite(documentNode);
  await spritePromise;

  const cards = root.querySelectorAll(".system-card[data-visual][data-motif]");
  for (const card of cards) {
    if (card.dataset.cardSignatureReady === "true") {
      continue;
    }

    const visual = card.dataset.visual;
    if (!SIGNATURE_SET.has(visual)) {
      console.warn(`[card-signatures] no signature registered for data-visual="${visual}"`);
      continue;
    }

    const signature = documentNode.createElement("span");
    signature.className = "card-signature";
    signature.setAttribute("aria-hidden", "true");

    const svg = documentNode.createElementNS(SVG_NS, "svg");
    svg.classList.add("card-signature__diagram");
    svg.setAttribute("viewBox", "0 0 160 120");
    svg.setAttribute("focusable", "false");

    const use = documentNode.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#signature-${visual}`);
    svg.append(use);

    const motif = documentNode.createElement("span");
    motif.className = "card-signature__motif";
    motif.textContent = card.dataset.motif;

    signature.append(svg, motif);
    card.append(signature);
    card.dataset.cardSignatureReady = "true";
  }
}

function startEnhancement() {
  enhanceCardSignatures().catch((error) => {
    console.warn(`[card-signatures] ${error.message}; preserving CSS motif fallback`);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEnhancement, { once: true });
  } else {
    startEnhancement();
  }
}