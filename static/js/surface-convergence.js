"use strict";

const SURFACE_ROUTES = Object.freeze({
  "/lab/": Object.freeze({ surface: "lab", mode: "directory", eyebrow: "LAB / DIRECTORY / TECHNICAL WORKSPACE" }),
  "/lab/system-map/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / OBSERVE / ARCHITECTURE EVIDENCE" }),
  "/lab/blackbox/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / OBSERVE / INCIDENT REPLAY" }),
  "/lab/console/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / OBSERVE / OPERATIONS EVIDENCE" }),
  "/lab/proof-chain/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / VERIFY / TRACE EVIDENCE" }),
  "/lab/conformance/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / VERIFY / POLICY EVIDENCE" }),
  "/lab/anomaly/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / EXPLORE / TELEMETRY ANALYSIS" }),
  "/lab/speculum/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / EXPLORE / SYSTEMS ARTWORK" }),
  "/lab/signal/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPERIENCE / GENERATIVE AUDIO" }),
  "/lab/almost/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPLORE / LOCAL PROCESS", accent: "punctuation" }),
  "/lab/drift/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPLORE / CONFORMANCE SIMULATION", accent: "punctuation" }),
  "/lab/bearing/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPLORE / STRUCTURAL SIMULATION", accent: "word" }),
  "/lab/system-symphony/": Object.freeze({ surface: "lab", mode: "product", eyebrow: "LAB / EXPERIENCE / TELEMETRY SONIFICATION" }),
  "/systems/": Object.freeze({ surface: "systems", mode: "directory", eyebrow: "SYSTEMS / DIRECTORY / PUBLIC SURFACES" }),
  "/systems/observability/": Object.freeze({ surface: "systems", mode: "standard", eyebrow: "SYSTEMS / OBSERVE / ESTATE TELEMETRY" }),
  "/systems/reliability/": Object.freeze({ surface: "systems", mode: "standard", eyebrow: "SYSTEMS / RELIABILITY / SERVICE EVIDENCE" }),
  "/systems/evidence/": Object.freeze({ surface: "systems", mode: "standard", eyebrow: "SYSTEMS / VERIFY / CLAIM PROVENANCE" }),
});

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function descriptorForPath(pathname) {
  const path = normalizePath(pathname);
  if (path.startsWith("/lab/system-symphony/")) return SURFACE_ROUTES["/lab/system-symphony/"];
  return SURFACE_ROUTES[path] || null;
}

function findHero(title, descriptor, documentNode) {
  if (descriptor.heroSelector) {
    const explicit = documentNode.querySelector(descriptor.heroSelector);
    if (explicit) return explicit;
  }
  return title?.closest(
    ".nameplate, .almost-title, .drift-title, .intro, .hero, .page-intro, .focus-hero, header, section",
  ) || title?.parentElement || null;
}

function findEyebrow(hero) {
  if (!hero) return null;
  return hero.querySelector([
    ":scope .systems-detail-intro > .systems-detail-kicker",
    ":scope > .snapshot-label",
    ":scope > .almost-index",
    ":scope > .drift-index",
    ":scope > .eyebrow > .tag",
    ":scope > .eyebrow",
    ":scope > .systems-detail-kicker",
  ].join(", "));
}

function findLede(hero) {
  if (!hero) return null;
  return hero.querySelector([
    ":scope .focus-lede",
    ":scope > .lede",
    ":scope > .thesis",
    ":scope > p:last-child",
  ].join(", "));
}

function installSurfaceConvergence(root = document) {
  if (typeof document === "undefined") return null;
  const documentNode = root?.nodeType === 9 ? root : root?.ownerDocument || document;
  const pathname = documentNode.defaultView?.location?.pathname || window.location.pathname;
  const descriptor = descriptorForPath(pathname);
  if (!descriptor || !documentNode.body) return null;

  const title = documentNode.querySelector("main h1");
  const hero = findHero(title, descriptor, documentNode);
  const eyebrow = findEyebrow(hero);
  const lede = findLede(hero);

  documentNode.body.dataset.atlasSurface = descriptor.surface;
  documentNode.body.dataset.atlasSurfaceMode = descriptor.mode;
  documentNode.body.dataset.atlasSurfaceRoute = normalizePath(pathname);
  if (descriptor.surface === "lab") documentNode.body.dataset.labLayout = descriptor.mode;

  hero?.classList.add("atlas-surface-hero");
  if (title) {
    title.classList.add("atlas-surface-title");
    title.dataset.atlasTitleAccent = descriptor.accent || "none";
  }
  if (eyebrow) {
    eyebrow.classList.add("atlas-surface-eyebrow");
    eyebrow.textContent = descriptor.eyebrow;
  }
  lede?.classList.add("atlas-surface-lede");

  documentNode.documentElement.dataset.atlasSurfaceConvergence = "ready";
  return { descriptor, hero, title, eyebrow, lede };
}

export {
  SURFACE_ROUTES,
  descriptorForPath,
  installSurfaceConvergence,
  normalizePath,
};
