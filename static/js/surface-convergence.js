"use strict";

const SURFACE_ROUTES = Object.freeze({
  "/lab/": Object.freeze({ surface: "lab", mode: "directory", eyebrow: "LAB / DIRECTORY / TECHNICAL WORKSPACE" }),
  "/lab/system-map/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / OBSERVE / ARCHITECTURE EVIDENCE" }),
  "/lab/blackbox/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / OBSERVE / INCIDENT REPLAY" }),
  "/lab/console/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / OBSERVE / OPERATIONS EVIDENCE" }),
  "/lab/proof-chain/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / VERIFY / TRACE EVIDENCE" }),
  "/lab/conformance/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / VERIFY / POLICY EVIDENCE" }),
  "/lab/anomaly/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / EXPLORE / TELEMETRY ANALYSIS", accent: "punctuation" }),
  "/lab/speculum/": Object.freeze({ surface: "lab", mode: "standard", eyebrow: "LAB / EXPLORE / SYSTEMS ARTWORK", accent: "punctuation" }),
  "/lab/signal/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPERIENCE / GENERATIVE AUDIO" }),
  "/lab/almost/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPLORE / LOCAL PROCESS", accent: "punctuation" }),
  "/lab/drift/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPLORE / CONFORMANCE SIMULATION", accent: "punctuation" }),
  "/lab/bearing/": Object.freeze({ surface: "lab", mode: "immersive", eyebrow: "LAB / EXPLORE / STRUCTURAL SIMULATION", accent: "word" }),
  "/lab/system-symphony/": Object.freeze({ surface: "lab", mode: "product", eyebrow: "LAB / EXPERIENCE / TELEMETRY SONIFICATION" }),
  "/lab/spectral-forge/": Object.freeze({ surface: "lab", mode: "product", eyebrow: "LAB / EXPERIENCE / SONIFICATION INSTRUMENT" }),
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
    ".nameplate, .almost-title, .drift-title, .shape-title, .intro, .hero, .page-intro, .focus-hero, header, section",
  ) || title?.parentElement || null;
}

function findEyebrow(hero) {
  if (!hero) return null;
  return hero.querySelector([
    ":scope .systems-detail-intro > .systems-detail-kicker",
    ":scope > .snapshot-label",
    ":scope > .almost-index",
    ":scope > .drift-index",
    ":scope > .shape-index",
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

function createTaxonomyDisclosure(documentNode) {
  const details = documentNode.createElement("details");
  details.className = "directory-taxonomy";
  const summary = documentNode.createElement("summary");
  summary.textContent = "What maturity and data mode mean";
  const content = documentNode.createElement("div");
  content.className = "directory-taxonomy__content";
  const maturity = documentNode.createElement("p");
  maturity.innerHTML = "<strong>Maturity</strong> describes the public commitment around a destination: Production, Tool, Preview, or Experiment.";
  const data = documentNode.createElement("p");
  data.innerHTML = "<strong>Data mode</strong> describes what the interface is using now: Live, Replay, Generated, or Simulated. Runtime state remains separate.";
  content.append(maturity, data);
  details.append(summary, content);
  return details;
}

function installTaxonomyDisclosure(hero, documentNode) {
  if (!hero || hero.querySelector(":scope > .directory-taxonomy")) return;
  const actions = hero.querySelector(":scope .page-actions");
  const disclosure = createTaxonomyDisclosure(documentNode);
  if (actions) actions.insertAdjacentElement("afterend", disclosure);
  else hero.appendChild(disclosure);
}

function createSecondaryDirectoryRoutes(documentNode) {
  const details = documentNode.createElement("details");
  details.className = "lab-directory-secondary";
  const summary = documentNode.createElement("summary");
  summary.textContent = "Advanced and contract routes";
  const content = documentNode.createElement("div");
  content.className = "lab-directory-secondary__links";
  for (const route of [
    {
      href: "/lab/console/",
      title: "Detailed Console",
      detail: "Protected noindex compatibility and operator route.",
    },
    {
      href: "https://api.atlas-systems.uk/v1/docs",
      title: "API Docs",
      detail: "Human-readable public machine contract.",
    },
  ]) {
    const link = documentNode.createElement("a");
    link.href = route.href;
    const title = documentNode.createElement("strong");
    title.textContent = route.title;
    const detail = documentNode.createElement("span");
    detail.textContent = route.detail;
    link.append(title, detail);
    content.appendChild(link);
  }
  details.append(summary, content);
  return details;
}

function normalizeLabDirectory(documentNode, hero) {
  const main = documentNode.querySelector("main");
  const directory = main?.querySelector('section[aria-labelledby="directory-title"]');
  if (!main || !directory) return;

  const lede = hero?.querySelector(".lede");
  if (lede) {
    lede.textContent = "The Lab is the technical workspace of Atlas Systems. Seventeen public destinations are grouped by what you do with them. Ramone remains the flagship.";
  }
  const browse = hero?.querySelector('a[href="#featured-title"]');
  if (browse) browse.href = "#directory-title";

  main.querySelector('section[aria-labelledby="featured-title"]')?.setAttribute("hidden", "");
  main.querySelector("aside.interface-legend")?.setAttribute("hidden", "");
  main.querySelector(".console-callout")?.closest("section")?.setAttribute("hidden", "");

  for (const selector of [
    'a.directory-card[href="/lab/console/"]',
    'a.directory-card[href="https://api.atlas-systems.uk/v1/docs"]',
  ]) {
    const card = directory.querySelector(selector);
    if (card) card.hidden = true;
  }

  const groupStack = directory.querySelector(".group-stack");
  if (groupStack && !directory.querySelector(".lab-directory-secondary")) {
    groupStack.insertAdjacentElement("afterend", createSecondaryDirectoryRoutes(documentNode));
  }
  installTaxonomyDisclosure(hero, documentNode);
  documentNode.body.dataset.labDirectoryPresentation = "single";
}

function normalizeSystemsDirectory(documentNode, hero) {
  const main = documentNode.querySelector("main");
  if (!main) return;
  main.querySelector("aside.interface-legend")?.setAttribute("hidden", "");
  installTaxonomyDisclosure(hero, documentNode);

  for (const badge of main.querySelectorAll(".portfolio-grid .card-top .badge")) {
    if (badge.textContent.trim() !== "Portfolio") continue;
    badge.className = "directory-group-marker";
    badge.setAttribute("aria-label", "Directory group: Portfolio");
  }
  documentNode.body.dataset.systemsDirectoryPresentation = "purpose-first";
}

function normalizeDirectory(pathname, documentNode, hero) {
  if (pathname === "/lab/") normalizeLabDirectory(documentNode, hero);
  if (pathname === "/systems/") normalizeSystemsDirectory(documentNode, hero);
}

function installSurfaceConvergence(root = document) {
  if (typeof document === "undefined") return null;
  const documentNode = root?.nodeType === 9 ? root : root?.ownerDocument || document;
  const pathname = normalizePath(documentNode.defaultView?.location?.pathname || window.location.pathname);
  const descriptor = descriptorForPath(pathname);
  if (!descriptor || !documentNode.body) return null;

  const title = documentNode.querySelector("main h1");
  const hero = findHero(title, descriptor, documentNode);
  const eyebrow = findEyebrow(hero);
  const lede = findLede(hero);

  documentNode.body.dataset.atlasSurface = descriptor.surface;
  documentNode.body.dataset.atlasSurfaceMode = descriptor.mode;
  documentNode.body.dataset.atlasSurfaceRoute = pathname;
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
  normalizeDirectory(pathname, documentNode, hero);

  documentNode.documentElement.dataset.atlasSurfaceConvergence = "ready";
  return { descriptor, hero, title, eyebrow, lede };
}

export {
  SURFACE_ROUTES,
  descriptorForPath,
  installSurfaceConvergence,
  normalizePath,
};