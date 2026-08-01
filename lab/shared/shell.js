"use strict";

const LAB_ROUTE_GROUPS = Object.freeze([
  Object.freeze({
    label: "Lab",
    routes: Object.freeze([
      Object.freeze({ label: "Lab home", href: "/lab/" }),
    ]),
  }),
  Object.freeze({
    label: "Experience",
    routes: Object.freeze([
      Object.freeze({ label: "Ramone", href: "https://ramone.atlas-systems.uk/", external: true }),
      Object.freeze({ label: "System Symphony", href: "/lab/system-symphony/", match: "prefix" }),
      Object.freeze({ label: "Signal Garden", href: "/lab/signal/" }),
    ]),
  }),
  Object.freeze({
    label: "Observe",
    routes: Object.freeze([
      Object.freeze({ label: "System Map", href: "/lab/system-map/" }),
      Object.freeze({ label: "Blackbox", href: "/lab/blackbox/" }),
      Object.freeze({ label: "Observability", href: "/systems/observability/" }),
      Object.freeze({ label: "Operations", href: "/lab/console/" }),
    ]),
  }),
  Object.freeze({
    label: "Verify",
    routes: Object.freeze([
      Object.freeze({ label: "Proof Chain", href: "/lab/proof-chain/" }),
      Object.freeze({ label: "Estate Conformance", href: "/lab/conformance/" }),
      Object.freeze({ label: "Reliability", href: "/systems/reliability/" }),
      Object.freeze({ label: "Evidence", href: "/systems/evidence/" }),
    ]),
  }),
  Object.freeze({
    label: "Explore",
    routes: Object.freeze([
      Object.freeze({ label: "Speculum", href: "/lab/speculum/" }),
      Object.freeze({ label: "Almost", href: "/lab/almost/" }),
      Object.freeze({ label: "Drift", href: "/lab/drift/" }),
      Object.freeze({ label: "The Bearing", href: "/lab/bearing/" }),
      Object.freeze({ label: "Shape Detector", href: "/lab/anomaly/" }),
    ]),
  }),
]);

const LAB_ROUTES = Object.freeze(LAB_ROUTE_GROUPS.flatMap(({ routes }) => routes));
const PRODUCTION_ORIGIN = "https://atlas-systems.uk";
const SEARCH_CSS = "/static/css/estate-search.css";
const LAB_CONTEXT_CSS = "/lab/shared/lab-context-navigation.css?v=20260801-phase-11a-v1";
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

function isCurrentLabRoute(route, pathname = currentPath()) {
  if (route.external) return false;
  const routePath = normalizePath(new URL(route.href, window.location.origin).pathname);
  if (route.match === "prefix") return pathname === routePath || pathname.startsWith(routePath);
  return pathname === routePath;
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
  let currentLink = null;

  LAB_ROUTE_GROUPS.forEach((routeGroup, groupIndex) => {
    const group = document.createElement("div");
    group.className = "lab-context-group";
    group.dataset.labContextGroup = routeGroup.label.toLowerCase();
    group.setAttribute("role", "group");

    const label = document.createElement("span");
    label.className = "lab-context-group-label";
    label.id = `lab-context-group-${groupIndex}`;
    label.textContent = routeGroup.label;
    group.setAttribute("aria-labelledby", label.id);
    group.appendChild(label);

    const links = document.createElement("div");
    links.className = "lab-context-group-links";
    for (const route of routeGroup.routes) {
      const link = document.createElement("a");
      link.href = route.href;
      link.textContent = route.label;
      if (isCurrentLabRoute(route)) {
        link.setAttribute("aria-current", "page");
        currentLink = link;
      }
      links.appendChild(link);
    }
    group.appendChild(links);
    inner.appendChild(group);
  });

  context.appendChild(inner);
  if (currentLink && window.matchMedia("(max-width: 860px)").matches) {
    window.requestAnimationFrame(() => {
      currentLink.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    });
  }
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

function installBlackboxDirectoryCard() {
  if (currentPath() !== LAB_HOME_ROUTE) return;
  const operations = document.querySelector('a.directory-card[href="/lab/console/"]');
  if (!operations || operations.parentElement?.querySelector('a[href="/lab/blackbox/"]')) return;

  const card = document.createElement("a");
  card.className = "system-card directory-card";
  card.dataset.family = "observe";
  card.dataset.visual = "console";
  card.dataset.motif = "REC";
  card.href = "/lab/blackbox/";

  const top = document.createElement("div");
  top.className = "card-top";

  const type = document.createElement("span");
  type.className = "type-label";
  type.textContent = "Incident evidence";

  const maturity = document.createElement("span");
  maturity.className = "badge tool";
  maturity.textContent = "Tool";

  const title = document.createElement("h3");
  title.textContent = "Blackbox";

  const description = document.createElement("p");
  description.textContent =
    "Replay the ten-minute evidence window before each sealed failure and open reviewed postmortems.";

  const mode = document.createElement("span");
  mode.className = "data-mode";
  mode.textContent = "Recorded replay";

  const route = document.createElement("span");
  route.className = "card-route";
  route.textContent = "Open recorder →";

  top.append(type, maturity);
  card.append(top, title, description, mode, route);
  operations.insertAdjacentElement("beforebegin", card);
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
  installBlackboxDirectoryCard();
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
  ensureStylesheet(LAB_CONTEXT_CSS);
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

export {
  LAB_ROUTE_GROUPS,
  LAB_ROUTES,
  isCurrentLabRoute,
  isSystemSymphonyPath,
  normalizePath,
};
