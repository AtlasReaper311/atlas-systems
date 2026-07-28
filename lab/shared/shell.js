"use strict";

const LAB_ROUTES = [
  { label: "Lab home", href: "/lab/" },
  { label: "System Symphony", href: "/lab/system-symphony/" },
  { label: "APU ROMs", href: "/lab/system-symphony/roms/" },
  { label: "System Map", href: "/lab/system-map/" },
  { label: "Operations", href: "/lab/console/" },
  { label: "Proof Chain", href: "/lab/proof-chain/" },
  { label: "Signal Garden", href: "/lab/signal/" },
  { label: "Reliability", href: "/systems/reliability/" },
  { label: "Conformance", href: "/lab/conformance/" },
  { label: "Speculum", href: "/lab/speculum/" },
  { label: "Shape Detector", href: "/lab/anomaly/" },
  { label: "Almost", href: "/lab/almost/" },
  { label: "Drift", href: "/lab/drift/" },
];

const PRODUCTION_ORIGIN = "https://atlas-systems.uk";
const SEARCH_CSS = "/static/css/estate-search.css";
const LAB_HOME_ROUTE = "/lab/";
const SYSTEM_SYMPHONY_ROUTE = "/lab/system-symphony/";
const LAB_INTRO_FIELD_CSS = "/lab/shared/lab-intro-field.css?v=20260727-lab-intro-field-v1";
const LAB_INTRO_FIELD_MODULE = "/lab/shared/lab-intro-field.js?v=20260727-lab-intro-field-v1";
const SYSTEM_MAP_CARD_FIELD_CSS = "/lab/shared/system-map-card-field.css?v=20260727-system-map-card-field-v2";
const SYSTEM_MAP_CARD_FIELD_MODULE = "/lab/shared/system-map-card-field.js?v=20260727-system-map-card-field-v2";

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function currentPath() {
  return normalizePath(window.location.pathname);
}

function isSystemSymphonyPath(pathname = currentPath()) {
  return pathname.startsWith(SYSTEM_SYMPHONY_ROUTE);
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function installPrimaryNavigation() {
  const existing = document.querySelector('nav[aria-label="Primary navigation"]');
  const nav = existing || document.createElement("nav");
  nav.setAttribute("aria-label", "Primary navigation");
  nav.replaceChildren();
  const wordmark = document.createElement("a");
  wordmark.className = "wordmark";
  wordmark.href = "/";
  wordmark.dataset.atlasWordmark = "";
  wordmark.append("Atlas");
  const underscore = document.createElement("span");
  underscore.textContent = "_";
  wordmark.append(underscore, "Systems");
  nav.appendChild(wordmark);
  if (!existing) document.body.prepend(nav);
  return nav;
}

function installContextNavigation(primary) {
  let context = document.querySelector('.lab-context-nav[aria-label="Lab navigation"]');
  if (!context) {
    context = document.createElement("nav");
    context.className = "lab-context-nav";
    context.setAttribute("aria-label", "Lab navigation");
    primary.insertAdjacentElement("afterend", context);
  }
  context.replaceChildren();
  const inner = document.createElement("div");
  inner.className = "lab-context-nav-inner";
  for (const route of LAB_ROUTES) {
    const link = document.createElement("a");
    link.href = route.href;
    link.textContent = route.label;
    if (normalizePath(new URL(route.href, window.location.origin).pathname) === currentPath()) {
      link.setAttribute("aria-current", "page");
    }
    inner.appendChild(link);
  }
  context.appendChild(inner);
}

function installFooter() {
  if (document.querySelector("footer.lab-tool-footer")) return;
  const footer = document.createElement("footer");
  footer.className = "lab-tool-footer atlas-footer";
  footer.setAttribute("aria-label", "Lab footer");
  const identity = document.createElement("span");
  identity.textContent = "Atlas Systems // Lab";
  const links = document.createElement("div");
  for (const [label, href] of [
    ["Lab home", "/lab/"],
    ["Systems", "/systems/"],
    ["Status", "https://status.atlas-systems.uk/"],
    ["Estate home", "/"],
  ]) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    links.appendChild(link);
  }
  footer.append(identity, links);
  document.body.appendChild(footer);
}

function ensureMeta(property, content) {
  const attribute = property.startsWith("og:") ? "property" : "name";
  if (document.head.querySelector(`meta[${attribute}="${property}"]`)) return;
  const meta = document.createElement("meta");
  meta.setAttribute(attribute, property);
  meta.content = content;
  document.head.appendChild(meta);
}

function installMetadata() {
  const title = document.title;
  const description = document.head.querySelector('meta[name="description"]')?.content || "Atlas Systems Lab interface.";
  const productionUrl = `${PRODUCTION_ORIGIN}${currentPath()}`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = productionUrl;
    document.head.appendChild(canonical);
  }
  ensureMeta("og:type", "website");
  ensureMeta("og:title", title);
  ensureMeta("og:description", description);
  ensureMeta("og:url", canonical.href || productionUrl);
  ensureMeta("og:site_name", "Atlas Systems");
  ensureMeta("og:image:width", "1200");
  ensureMeta("og:image:height", "630");
  ensureMeta("og:image:alt", "Atlas Systems: audio systems, local AI infrastructure, and deployment automation");
  ensureMeta("twitter:card", "summary_large_image");
  ensureMeta("twitter:title", title);
  ensureMeta("twitter:description", description);
}

async function installLabIntroField() {
  ensureStylesheet(LAB_INTRO_FIELD_CSS);
  try {
    const { mountLabIntroField } = await import(LAB_INTRO_FIELD_MODULE);
    mountLabIntroField();
  } catch (error) {
    const intro = document.querySelector(".page-intro");
    if (intro) intro.dataset.atlasIntroFieldState = "unavailable";
    console.error("Lab intro AtlasField bootstrap unavailable", error);
  }
}

async function installSystemMapCardField() {
  ensureStylesheet(SYSTEM_MAP_CARD_FIELD_CSS);
  try {
    const { mountSystemMapCardField } = await import(SYSTEM_MAP_CARD_FIELD_MODULE);
    mountSystemMapCardField();
  } catch (error) {
    const card = document.querySelector("#system-map.featured");
    if (card) card.dataset.atlasFieldState = "unavailable";
    console.error("System Map card AtlasField bootstrap unavailable", error);
  }
}

async function installLabHomeFields() {
  if (currentPath() !== LAB_HOME_ROUTE) return;
  await Promise.all([
    installLabIntroField(),
    installSystemMapCardField(),
  ]);
}

async function installRouteEnhancements() {
  if (!isSystemSymphonyPath()) return;
  await import("/lab/system-symphony/system-symphony-navigation.js?v=20260728-system-symphony-trace-board-v1");
  if (currentPath() !== SYSTEM_SYMPHONY_ROUTE) return;
  await import("/lab/system-symphony/trace-role-bridge.js?v=20260728-system-symphony-trace-board-v1");
}

async function installLabShell() {
  ensureStylesheet(SEARCH_CSS);
  installMetadata();
  const primary = installPrimaryNavigation();
  installContextNavigation(primary);
  installFooter();
  await import("/static/js/estate-shell.js?v=20260723-interface-v2");
  await import("/static/js/estate-search/global-search.js");
  await installLabHomeFields();
  await installRouteEnhancements();
}

void installLabShell();

export { LAB_ROUTES, isSystemSymphonyPath, normalizePath };
