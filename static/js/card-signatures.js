import "./directory-header-fields.js?v=20260807-hero-contrast";

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
  "drift",
  "bearing",
  "console",
]);

const GOVERNED_CARD_SELECTOR = ".system-card[data-visual][data-motif]";
const SHAPE_DETECTOR_SELECTOR = 'a.system-card[href="/lab/anomaly/"]';
const SIGNATURE_SET = new Set(CARD_SIGNATURES);
const SVG_NS = "http://www.w3.org/2000/svg";
const SPRITE_PATH = new URL("../media/card-signatures.svg?v=20260811-bearing-lattice", import.meta.url).href;
const SPRITE_ID = "atlas-card-signature-sprite";
const SYMPHONY_ROUTE = "/lab/system-symphony/";
const SYMPHONY_TARGET_STYLESHEET = "/lab/system-symphony/system-symphony-targets.css?v=20260805-target-contract-v1";
const INTERACTION_TARGET_MODULE = "/static/js/interaction-target-contract.js?v=20260805-target-contract-v1";
let spritePromise;
let cardObserver;
let symphonyTargetPromise;

async function installSprite(documentNode) {
  if (documentNode.getElementById(SPRITE_ID)) return;

  const response = await fetch(SPRITE_PATH, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`signature sprite request failed with ${response.status}`);

  const source = await response.text();
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("signature sprite is not valid SVG");

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

function ensureStylesheetReady(href, documentNode = document) {
  const existing = documentNode.head.querySelector(`link[href="${href}"]`);
  if (existing) {
    if (existing.sheet) return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  const link = documentNode.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const ready = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", reject, { once: true });
  });
  documentNode.head.appendChild(link);
  return ready;
}

function normalizeShapeDetectorCards(root = document) {
  for (const card of root.querySelectorAll(SHAPE_DETECTOR_SELECTOR)) {
    const description = card.querySelector(":scope > p");
    const mode = card.querySelector(":scope > .data-mode");
    if (description) {
      description.textContent = "Current telemetry-shape analysis with an explicitly simulated browser fallback when measured evidence is unavailable.";
    }
    if (mode) mode.textContent = "Live and simulated";
    card.dataset.evidenceDirectoryMode = "live-simulated";
  }
}

async function installSystemSymphonyTargetContract() {
  if (!window.location.pathname.startsWith(SYMPHONY_ROUTE)) return;
  symphonyTargetPromise ??= (async () => {
    await ensureStylesheetReady(SYMPHONY_TARGET_STYLESHEET);
    await import(INTERACTION_TARGET_MODULE);
  })();
  try {
    await symphonyTargetPromise;
  } catch (error) {
    document.documentElement.dataset.atlasTargetContract = "unavailable";
    console.error("[interaction-target-contract] System SYMPHONY target contract failed to load", error);
  }
}

export async function enhanceCardSignatures(root = document) {
  const documentNode = root.ownerDocument ?? root;
  normalizeShapeDetectorCards(root);
  spritePromise ??= installSprite(documentNode);
  await spritePromise;

  const cards = root.querySelectorAll(GOVERNED_CARD_SELECTOR);
  for (const card of cards) {
    if (card.dataset.cardSignatureReady === "true") continue;

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

function containsGovernedCard(node) {
  if (node?.nodeType !== 1) return false;
  return Boolean(
    node.matches?.(GOVERNED_CARD_SELECTOR)
    || node.querySelector?.(GOVERNED_CARD_SELECTOR),
  );
}

export function observeCardSignatures(documentNode = document) {
  if (cardObserver || !documentNode.body || typeof MutationObserver === "undefined") return;
  cardObserver = new MutationObserver((records) => {
    const cardAdded = records.some(({ addedNodes }) =>
      [...addedNodes].some(containsGovernedCard),
    );
    if (!cardAdded) return;
    normalizeShapeDetectorCards(documentNode);
    enhanceCardSignatures(documentNode).catch((error) => {
      console.warn(`[card-signatures] ${error.message}; preserving CSS motif fallback`);
    });
  });
  cardObserver.observe(documentNode.body, { childList: true, subtree: true });
}

async function startEnhancement() {
  observeCardSignatures(document);
  normalizeShapeDetectorCards(document);
  await Promise.all([
    enhanceCardSignatures().catch((error) => {
      console.warn(`[card-signatures] ${error.message}; preserving CSS motif fallback`);
    }),
    installSystemSymphonyTargetContract(),
  ]);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEnhancement, { once: true });
  } else {
    void startEnhancement();
  }
}