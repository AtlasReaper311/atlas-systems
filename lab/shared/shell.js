"use strict";

const SYSTEM_SYMPHONY_ROUTE = "/lab/system-symphony/";
const SYSTEM_SYMPHONY_SCOPED_ROUTES = Object.freeze([
  Object.freeze({ label: "APU ROMs", href: "/lab/system-symphony/roms/" }),
  Object.freeze({ label: "Build log", href: "/lab/system-symphony/build-log/" }),
  Object.freeze({ label: "Radio", href: "/lab/system-symphony/radio/" }),
  Object.freeze({ label: "Replay", href: "/lab/system-symphony/replay/" }),
]);

const LAB_ROUTE_GROUPS = Object.freeze([
  Object.freeze({
    label: "Experience",
    routes: Object.freeze([
      Object.freeze({ label: "System Symphony", href: "/lab/system-symphony/" }),
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
const LAB_CONTEXT_CSS = "/lab/shared/lab-context-navigation.css?v=20260805-lab-consistency-v1";
const LAB_LAYOUT_CSS = "/lab/shared/lab-shell-layout.css?v=20260805-lab-consistency-v1";
const LAB_SHELL_CONTRACT = "/lab/shared/lab-shell-contract.js?v=20260805-lab-consistency-v1";
const TARGET_CONTRACT = "/static/js/interaction-target-contract.js?v=20260805-lab-consistency-v1";
const PHASE6_FOOTER = "/static/js/phase-6-footer.js?v=20260805-lab-consistency-v1";
const LAB_HOME_ROUTE = "/lab/";
const LAB_INTRO_FIELD_CSS = "/lab/shared/lab-intro-field.css?v=20260727-lab-intro-field-v1";
const LAB_INTRO_FIELD_MODULE = "/lab/shared/lab-intro-field.js?v=20260727-lab-intro-field-v1";
const SYSTEM_MAP_CARD_FIELD_CSS = "/lab/shared/system-map-card-field.css?v=20260727-system-map-card-field-v2";
const SYSTEM_MAP_CARD_FIELD_MODULE = "/lab/shared/system-map-card-field.js?v=20260727-system-map-card-field-v2";
const LEGACY_ROUTE_ALIASES = Object.freeze(new Map([
  ["/lab/reliability/", "/systems/reliability/"],
]));
const ROUTE_TITLE_OVERRIDES = Object.freeze(new Map([
  ["/lab/console/", "Operations // Atlas Systems"],
]));
const IMMERSIVE_ROUTES = Object.freeze(new Set([
  "/lab/almost/",
  "/lab/bearing/",
  "/lab/drift/",
]));

let shellResizeObserver = null;

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

function labLayoutForPath(pathname = currentPath()) {
  if (pathname === LAB_HOME_ROUTE) return "directory";
  if (isSystemSymphonyPath(pathname)) return "product";
  if (IMMERSIVE_ROUTES.has(pathname)) return "immersive";
  return "standard";
}

function labRouteForPath(pathname = currentPath()) {
  if (pathname === LAB_HOME_ROUTE) return "lab";
  if (isSystemSymphonyPath(pathname)) return "system-symphony";
  return pathname
    .replace(/^\/lab\//, "")
    .replace(/\/$/, "")
    .split("/")[0] || "lab";
}

function isCurrentLabRoute(route, pathname = currentPath()) {
  const routePath = normalizePath(new URL(route.href, window.location.origin).pathname);
  if (routePath === SYSTEM_SYMPHONY_ROUTE) {
    return pathname === routePath || SYSTEM_SYMPHONY_SCOPED_ROUTES.some(({ href }) => pathname === href);
  }
  return pathname === routePath;
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function installLabIdentity() {
  const path = currentPath();
  document.documentElement.dataset.labShell = "";
  document.body.dataset.labShell = "";
  document.body.dataset.labLayout = labLayoutForPath(path);
  document.body.dataset.labRoute = labRouteForPath(path);
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
  if (currentLink && window.matchMedia("(max-width: 1099px)").matches) {
    window.requestAnimationFrame(() => {
      currentLink.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    });
  }
  return context;
}

function ensureMeta(property, content) {
  const attribute = property.startsWith("og:") ? "property" : "name";
  let meta = document.head.querySelector(`meta[${attribute}="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, property);
    document.head.appendChild(meta);
  }
  meta.content = content;
  return meta;
}

function installMetadata() {
  const path = currentPath();
  const override = ROUTE_TITLE_OVERRIDES.get(path);
  if (override) document.title = override;
  const title = document.title;
  const description = document.head.querySelector('meta[name="description"]')?.content || "Atlas Systems Lab interface.";
  const productionUrl = `${PRODUCTION_ORIGIN}${path}`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = productionUrl;
  ensureMeta("og:type", "website");
  ensureMeta("og:title", title);
  ensureMeta("og:description", description);
  ensureMeta("og:url", productionUrl);
  ensureMeta("og:site_name", "Atlas Systems");
  ensureMeta("og:image:width", "1200");
  ensureMeta("og:image:height", "630");
  ensureMeta("og:image:alt", "Atlas Systems: audio systems, local AI infrastructure, and deployment automation");
  ensureMeta("twitter:card", "summary_large_image");
  ensureMeta("twitter:title", title);
  ensureMeta("twitter:description", description);
}

function normalizeLegacyRouteLinks(root = document) {
  for (const anchor of root.querySelectorAll("a[href]")) {
    const raw = anchor.getAttribute("href");
    if (!raw) continue;
    let path;
    try {
      path = normalizePath(new URL(raw, window.location.origin).pathname);
    } catch {
      continue;
    }
    const replacement = LEGACY_ROUTE_ALIASES.get(path);
    if (replacement && new URL(raw, window.location.origin).origin === window.location.origin) {
      anchor.href = replacement;
    }
  }
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

function installMeasuredShell(header, context) {
  const root = document.documentElement;
  const update = () => {
    const headerHeight = Math.max(0, Math.round(header?.getBoundingClientRect().height || 56));
    const contextHeight = Math.max(0, Math.round(context?.getBoundingClientRect().height || 0));
    root.style.setProperty("--lab-shell-header-height", `${headerHeight}px`);
    root.style.setProperty("--lab-shell-context-height", `${contextHeight}px`);
    root.style.setProperty("--lab-shell-stack-height", `${headerHeight + contextHeight}px`);
    root.dataset.labShellReady = "";
  };

  shellResizeObserver?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    shellResizeObserver = new ResizeObserver(() => window.requestAnimationFrame(update));
    if (header) shellResizeObserver.observe(header);
    if (context) shellResizeObserver.observe(context);
  }
  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("pagehide", () => shellResizeObserver?.disconnect(), { once: true });
  window.requestAnimationFrame(() => window.requestAnimationFrame(update));
}

async function installGovernedFooter() {
  const { installPhase6Footer } = await import(PHASE6_FOOTER);
  return installPhase6Footer();
}

async function installLabShell() {
  installLabIdentity();
  ensureStylesheet(SEARCH_CSS);
  ensureStylesheet(LAB_CONTEXT_CSS);
  ensureStylesheet(LAB_LAYOUT_CSS);
  installMetadata();
  const primary = installPrimaryNavigation();
  const context = installContextNavigation(primary);
  normalizeLegacyRouteLinks();

  await import("/static/js/estate-shell.js?v=20260723-interface-v2");
  await import("/static/js/estate-search/global-search.js");
  await installGovernedFooter();
  await installLabHomeFields();
  await installRouteEnhancements();

  const header = document.querySelector(".atlas-header");
  installMeasuredShell(header, context);
  await import(TARGET_CONTRACT);
  await import(LAB_SHELL_CONTRACT);
}

void installLabShell();

export {
  LAB_ROUTE_GROUPS,
  LAB_ROUTES,
  SYSTEM_SYMPHONY_SCOPED_ROUTES,
  isCurrentLabRoute,
  isSystemSymphonyPath,
  labLayoutForPath,
  labRouteForPath,
  normalizeLegacyRouteLinks,
  normalizePath,
};
