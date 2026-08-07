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
const GLOBAL_ROUTES = Object.freeze([
  Object.freeze({ label: "Work", href: "/work/" }),
  Object.freeze({ label: "Writing", href: "/writing/" }),
  Object.freeze({ label: "Lab", href: "/lab/" }),
  Object.freeze({ label: "Systems", href: "/systems/" }),
  Object.freeze({ label: "About", href: "/about/" }),
]);

const PRODUCTION_ORIGIN = "https://atlas-systems.uk";
const STATUS_PAGE = "https://status.atlas-systems.uk/";
const SEARCH_CSS = "/static/css/estate-search.css";
const LAB_CONTEXT_CSS = "/lab/shared/lab-context-navigation.css?v=20260806-lab-consistency-v2";
const LAB_LAYOUT_CSS = "/lab/shared/lab-shell-layout.css?v=20260806-lab-consistency-v2";
const LAB_SHELL_CONTRACT = "bundled:lab-shell-contract";
const TARGET_CONTRACT = "bundled:interaction-target-contract";
const PHASE6_FOOTER = "/static/js/phase-6-footer.js";
const ESTATE_SHELL = "/static/js/estate-shell.js";
const GLOBAL_SEARCH = "/static/js/estate-search/global-search.js";
const LAB_HOME_ROUTE = "/lab/";
const LAB_INTRO_FIELD_CSS = "/lab/shared/lab-intro-field.css?v=20260807-signature-position";
const LAB_INTRO_FIELD_MODULE = "/lab/shared/lab-intro-field.js?v=20260727-lab-intro-field-v1";
const SYSTEM_MAP_CARD_FIELD_CSS = "/lab/shared/system-map-card-field.css?v=20260807-signature-position";
const SYSTEM_MAP_CARD_FIELD_MODULE = "/lab/shared/system-map-card-field.js?v=20260807-signature-position";
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

const TARGET_MINIMUM = 44;
const TARGET_STABILITY_MS = 240;
const SHELL_STABILITY_MS = 280;
const SHELL_TOLERANCE_PX = 2;
const TARGET_SELECTOR = [
  "button:not([disabled])",
  "summary",
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[role='button']:not([aria-disabled='true'])",
  "[role='tab']:not([aria-disabled='true'])",
  ".focus-action",
  ".nav-links a",
  ".wordmark",
  ".lab-context-nav a",
  ".lab-tool-footer a",
  ".atlas-header__nav a",
  ".atlas-header__brand a",
  ".atlas-header__actions a",
  ".atlas-mobile-nav a",
  ".symphony-product-link",
  ".symphony-product-mode-link",
  ".symphony-proof-open",
].join(",");

let shellResizeObserver = null;
let contextAbortController = null;
let targetAuditTimer = null;
let targetStabilityTimer = null;
let targetPendingKey = "";
let targetConfirmedKey = "";
let targetObserver = null;
let shellAuditTimer = null;
let shellStabilityTimer = null;
let shellPendingKey = "";
let shellConfirmedKey = "";
let shellObserver = null;

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

function routePath(href) {
  return normalizePath(new URL(href, window.location.origin).pathname);
}

function isCurrentLabRoute(route, pathname = currentPath()) {
  const routePath = normalizePath(new URL(route.href, window.location.origin).pathname);
  if (routePath === SYSTEM_SYMPHONY_ROUTE) {
    return pathname === routePath || SYSTEM_SYMPHONY_SCOPED_ROUTES.some(
      ({ href }) => pathname === normalizePath(new URL(href, window.location.origin).pathname),
    );
  }
  return pathname === routePath;
}

function ensureStylesheet(href) {
  const requested = new URL(href, window.location.origin);
  const exists = [...document.head.querySelectorAll('link[rel="stylesheet"][href]')]
    .some((link) => {
      const present = new URL(link.href, window.location.origin);
      return present.pathname === requested.pathname;
    });
  if (exists) return;
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

function createWordmark(className = "wordmark") {
  const wordmark = document.createElement("a");
  wordmark.className = className;
  wordmark.href = "/";
  wordmark.dataset.atlasWordmark = "";
  wordmark.append("Atlas");
  const underscore = document.createElement("span");
  underscore.textContent = "_";
  wordmark.append(underscore, "Systems");
  return wordmark;
}

function installPrimaryNavigation() {
  const existing = document.querySelector('nav[aria-label="Primary navigation"]');
  if (existing) return existing;
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Primary navigation");
  nav.appendChild(createWordmark());
  document.body.prepend(nav);
  return nav;
}

function currentGlobalRouteLabel() {
  const path = currentPath();
  return GLOBAL_ROUTES.find(({ href }) => path === href || path.startsWith(href))?.label || null;
}

function createSearchButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "es-nav-search atlas-search-control";
  button.dataset.estateSearchOpen = "";
  button.setAttribute("aria-label", "Search the estate");
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.2" y2="16.2"></line></svg><span class="atlas-search-control__label">Search</span><kbd data-estate-search-kbd>ctrl k</kbd>';
  return button;
}

function installFallbackHeader(nav) {
  const inner = document.createElement("div");
  inner.className = "atlas-header__inner";

  const brand = document.createElement("div");
  brand.className = "atlas-header__brand atlas-global-header__identity";
  const wordmark = createWordmark("wordmark atlas-wordmark");
  const status = document.createElement("a");
  status.className = "nav-status atlas-status atlas-estate-status";
  status.href = STATUS_PAGE;
  status.dataset.state = "unknown";
  status.setAttribute("aria-label", "Atlas Systems status");
  status.innerHTML = '<span class="status-dot atlas-status__dot" aria-hidden="true"></span><span class="atlas-estate-status-label">Status</span>';
  brand.append(wordmark, status);

  const routes = document.createElement("div");
  routes.className = "atlas-header__nav atlas-global-header__nav";
  routes.setAttribute("aria-label", "Atlas Systems sections");
  const current = currentGlobalRouteLabel();
  for (const route of GLOBAL_ROUTES) {
    const link = document.createElement("a");
    link.className = "atlas-global-header__link";
    link.href = route.href;
    link.textContent = route.label;
    if (route.label === current) link.setAttribute("aria-current", "page");
    routes.appendChild(link);
  }

  const actions = document.createElement("div");
  actions.className = "atlas-header__actions atlas-global-header__actions";
  actions.appendChild(createSearchButton());
  inner.append(brand, routes, actions);

  nav.replaceChildren(inner);
  nav.classList.add("atlas-header", "atlas-nav-shell", "atlas-global-header");
  nav.removeAttribute("style");
  return nav;
}

function installFallbackMobileNavigation() {
  let nav = document.querySelector('nav[aria-label="Mobile navigation"]');
  if (!nav) {
    nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Mobile navigation");
    document.body.appendChild(nav);
  }
  document.body.dataset.atlasBottomNav = "true";
  nav.className = "mobile-nav atlas-mobile-nav atlas-bottom-nav";
  const inner = document.createElement("div");
  inner.className = "mobile-nav-inner atlas-mobile-nav__inner";
  const current = currentGlobalRouteLabel();
  for (const route of GLOBAL_ROUTES) {
    const link = document.createElement("a");
    link.href = route.href;
    link.className = "mobile-nav-item atlas-mobile-nav__item";
    link.textContent = route.label;
    if (route.label === current) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
    inner.appendChild(link);
  }
  nav.replaceChildren(inner);
  return nav;
}

function ensureGovernedHeader(primary) {
  const header = document.querySelector(".atlas-header") || primary;
  const complete = Boolean(
    header?.querySelector(".atlas-header__brand")
    && header.querySelector(".atlas-header__nav")
    && header.querySelector(".atlas-header__actions")
    && header.querySelector(".atlas-search-control")
  );
  if (!complete) installFallbackHeader(header);
  if (!document.querySelector('nav[aria-label="Mobile navigation"]')) installFallbackMobileNavigation();
  return document.querySelector(".atlas-header") || header;
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
      if (isCurrentLabRoute(route)) link.setAttribute("aria-current", "page");
      links.appendChild(link);
    }
    group.appendChild(links);
    inner.appendChild(group);
  });
  context.appendChild(inner);
  return context;
}

function currentRouteDescriptor(pathname = currentPath()) {
  if (isSystemSymphonyPath(pathname)) {
    const child = SYSTEM_SYMPHONY_SCOPED_ROUTES.find(({ href }) => routePath(href) === pathname);
    return child || { label: "System Symphony", href: SYSTEM_SYMPHONY_ROUTE };
  }
  for (const group of LAB_ROUTE_GROUPS) {
    const route = group.routes.find(({ href }) => routePath(href) === pathname);
    if (route) return route;
  }
  const heading = document.querySelector("main h1")?.textContent?.trim();
  return { label: heading || document.title.split("//")[0].trim() || "Lab tool", href: pathname };
}

function createGroupedInventory(pathname) {
  const inventory = document.createElement("div");
  inventory.className = "lab-context-tools__menu";
  inventory.setAttribute("aria-label", "All Lab tools");
  LAB_ROUTE_GROUPS.forEach((routeGroup, groupIndex) => {
    const group = document.createElement("div");
    group.className = "lab-context-tools__group";
    group.dataset.labContextGroup = routeGroup.label.toLowerCase();
    group.setAttribute("role", "group");

    const label = document.createElement("span");
    label.className = "lab-context-tools__group-label";
    label.id = `lab-context-tools-group-${groupIndex}`;
    label.textContent = routeGroup.label;
    group.setAttribute("aria-labelledby", label.id);

    const links = document.createElement("div");
    links.className = "lab-context-tools__links";
    for (const route of routeGroup.routes) {
      const link = document.createElement("a");
      link.href = route.href;
      link.textContent = route.label;
      if (isCurrentLabRoute(route, pathname)) link.setAttribute("aria-current", "page");
      links.appendChild(link);
    }
    group.append(label, links);
    inventory.appendChild(group);
  });
  return inventory;
}

function installContextBehavior(context, details, summary) {
  contextAbortController?.abort();
  contextAbortController = new AbortController();
  const { signal } = contextAbortController;
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (details.open && target && !details.contains(target)) details.open = false;
  }, { signal });
  context.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !details.open) return;
    event.preventDefault();
    event.stopPropagation();
    details.open = false;
    summary.focus({ preventScroll: true });
  }, { signal });
  window.addEventListener("pagehide", () => contextAbortController?.abort(), { once: true, signal });
}

function installCompactLabContext(context) {
  const pathname = currentPath();
  if (pathname === LAB_HOME_ROUTE) {
    context.classList.remove("lab-context-nav--compact");
    context.classList.add("lab-context-nav--directory");
    context.dataset.labContextMode = "directory";
    return context;
  }

  const descriptor = currentRouteDescriptor(pathname);
  const inner = document.createElement("div");
  inner.className = "lab-context-compact";
  const crumbs = document.createElement("div");
  crumbs.className = "lab-context-compact__crumbs";
  crumbs.setAttribute("aria-label", "Current Lab location");
  const home = document.createElement("a");
  home.href = LAB_HOME_ROUTE;
  home.textContent = "Lab";
  const separator = document.createElement("span");
  separator.className = "lab-context-compact__separator";
  separator.textContent = "/";
  separator.setAttribute("aria-hidden", "true");
  const current = document.createElement("span");
  current.className = "lab-context-compact__current";
  current.textContent = descriptor.label;
  current.setAttribute("aria-current", "page");
  crumbs.append(home, separator, current);

  const tools = document.createElement("details");
  tools.className = "lab-context-tools";
  const summary = document.createElement("summary");
  summary.textContent = "All Lab tools";
  tools.append(summary, createGroupedInventory(pathname));
  inner.append(crumbs, tools);
  context.replaceChildren(inner);
  context.classList.remove("lab-context-nav--directory");
  context.classList.add("lab-context-nav--compact");
  context.dataset.labContextMode = "compact";
  context.dataset.currentLabRoute = descriptor.label;
  installContextBehavior(context, tools, summary);
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
    let url;
    try {
      url = new URL(raw, window.location.origin);
    } catch {
      continue;
    }
    const replacement = LEGACY_ROUTE_ALIASES.get(normalizePath(url.pathname));
    if (replacement && url.origin === window.location.origin) anchor.href = replacement;
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
  description.textContent = "Replay the ten-minute evidence window before each sealed failure and open reviewed postmortems.";
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
  await Promise.all([installLabIntroField(), installSystemMapCardField()]);
}

async function installRouteEnhancements() {
  if (!isSystemSymphonyPath()) return;
  await import("/lab/system-symphony/system-symphony-navigation.js?v=20260728-system-symphony-trace-board-v1");
  if (currentPath() === SYSTEM_SYMPHONY_ROUTE) {
    await import("/lab/system-symphony/trace-role-bridge.js?v=20260728-system-symphony-trace-board-v1");
  }
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

function selectorFor(element) {
  if (!element) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const classes = [...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join("");
  return `${element.tagName.toLowerCase()}${classes}`;
}

function visible(element) {
  if (!element || element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function measureInteractionTargets(root = document) {
  return [...root.querySelectorAll(TARGET_SELECTOR)]
    .filter((element) => !(element instanceof SVGElement))
    .filter(visible)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: selectorFor(element),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    })
    .filter(({ width, height }) => width + 0.1 < TARGET_MINIMUM || height + 0.1 < TARGET_MINIMUM);
}

function auditInteractionTargets(root = document) {
  const failures = measureInteractionTargets(root);
  const documentElement = root.documentElement || document.documentElement;
  const key = JSON.stringify(failures);
  if (!failures.length) {
    window.clearTimeout(targetStabilityTimer);
    targetPendingKey = "";
    targetConfirmedKey = "";
    documentElement.dataset.atlasTargetContract = "pass";
    return failures;
  }
  if (key !== targetPendingKey) {
    targetPendingKey = key;
    documentElement.dataset.atlasTargetContract = "pending";
    window.clearTimeout(targetStabilityTimer);
    targetStabilityTimer = window.setTimeout(() => auditInteractionTargets(root), TARGET_STABILITY_MS);
    return failures;
  }
  documentElement.dataset.atlasTargetContract = "fail";
  if (key !== targetConfirmedKey) {
    console.error(`[interaction-target-contract] ${failures.length} visible target(s) are smaller than ${TARGET_MINIMUM}px: ${key}`);
    targetConfirmedKey = key;
  }
  return failures;
}

function roundedRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    selector: selectorFor(element),
    top: Math.round(rect.top * 10) / 10,
    right: Math.round(rect.right * 10) / 10,
    bottom: Math.round(rect.bottom * 10) / 10,
    left: Math.round(rect.left * 10) / 10,
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10,
  };
}

function inspectLabShell(root = document) {
  const path = currentPath();
  const header = root.querySelector(".atlas-header");
  const context = root.querySelector('.lab-context-nav[aria-label="Lab navigation"]');
  const main = root.querySelector("main");
  const heading = [...root.querySelectorAll("main h1")].find(visible) || null;
  const search = root.querySelector(".atlas-search-control");
  const footer = root.querySelector("footer[data-atlas-phase6-footer], footer.lab-tool-footer");
  const current = context?.querySelector('[aria-current="page"], .symphony-lab-crumbs__current') || null;
  const toolsTrigger = context?.querySelector(".lab-context-tools > summary") || null;
  const headerRect = roundedRect(header);
  const contextRect = roundedRect(context);
  const headingRect = roundedRect(heading);
  const bodyPaddingTop = Number.parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  const layout = document.body.dataset.labLayout || "";
  const contextMode = context?.dataset.labContextMode || "";
  const failures = [];
  if (!header) failures.push({ rule: "header-present" });
  if (!context) failures.push({ rule: "context-navigation-present" });
  if (!main) failures.push({ rule: "main-present" });
  if (!heading) failures.push({ rule: "visible-h1-present" });
  if (!search) failures.push({ rule: "search-present" });
  if (!footer) failures.push({ rule: "footer-present" });
  if (!layout) failures.push({ rule: "layout-mode-present" });
  if (!contextMode) failures.push({ rule: "context-navigation-mode-present" });
  if (path === LAB_HOME_ROUTE && contextMode && contextMode !== "directory") {
    failures.push({ rule: "directory-navigation-home-only", contextMode });
  }
  if (path !== LAB_HOME_ROUTE && contextMode && contextMode !== "compact") {
    failures.push({ rule: "compact-navigation-individual-routes", contextMode });
  }
  if (path !== LAB_HOME_ROUTE && context && !current) failures.push({ rule: "current-lab-route-present" });
  if (path !== LAB_HOME_ROUTE && !toolsTrigger) failures.push({ rule: "compact-tools-trigger-present" });
  if (toolsTrigger && !visible(toolsTrigger)) failures.push({ rule: "compact-tools-trigger-visible" });
  if (headerRect && bodyPaddingTop + SHELL_TOLERANCE_PX < headerRect.height) {
    failures.push({ rule: "fixed-header-reserved-in-flow", bodyPaddingTop, header: headerRect });
  }
  if (headerRect && contextRect) {
    if (contextRect.top < headerRect.bottom - SHELL_TOLERANCE_PX) {
      failures.push({ rule: "context-navigation-below-header", header: headerRect, context: contextRect });
    }
    if (contextRect.top > headerRect.bottom + SHELL_TOLERANCE_PX) {
      failures.push({ rule: "no-gap-between-header-and-context-navigation", header: headerRect, context: contextRect });
    }
  }
  if (contextRect && headingRect && headingRect.top < contextRect.bottom + 8) {
    failures.push({ rule: "heading-clears-context-navigation", context: contextRect, heading: headingRect });
  }
  return {
    path,
    layout,
    contextMode,
    bodyPaddingTop,
    header: headerRect,
    context: contextRect,
    main: roundedRect(main),
    heading: headingRect,
    current: roundedRect(current),
    toolsTrigger: roundedRect(toolsTrigger),
    failures,
  };
}

function auditLabShell(root = document) {
  const result = inspectLabShell(root);
  const documentElement = root.documentElement || document.documentElement;
  const key = JSON.stringify(result.failures);
  if (!result.failures.length) {
    window.clearTimeout(shellStabilityTimer);
    shellPendingKey = "";
    shellConfirmedKey = "";
    documentElement.dataset.labShellContract = "pass";
    return result;
  }
  if (key !== shellPendingKey) {
    shellPendingKey = key;
    documentElement.dataset.labShellContract = "pending";
    window.clearTimeout(shellStabilityTimer);
    shellStabilityTimer = window.setTimeout(() => auditLabShell(root), SHELL_STABILITY_MS);
    return result;
  }
  documentElement.dataset.labShellContract = "fail";
  if (key !== shellConfirmedKey) {
    console.error(`[lab-shell-contract] ${result.failures.length} stable shell failure(s): ${JSON.stringify(result)}`);
    shellConfirmedKey = key;
  }
  return result;
}

function scheduleContracts() {
  window.clearTimeout(targetAuditTimer);
  window.clearTimeout(shellAuditTimer);
  targetAuditTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => auditInteractionTargets()));
  }, 120);
  shellAuditTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => auditLabShell()));
  }, 120);
}

async function startContracts() {
  if (document.readyState !== "complete") {
    await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  }
  try {
    await document.fonts?.ready;
  } catch {
    // Font readiness improves stability; rendered geometry remains authoritative.
  }
  scheduleContracts();
  window.addEventListener("resize", scheduleContracts, { passive: true });
  if (typeof MutationObserver !== "undefined" && document.body) {
    targetObserver = new MutationObserver(scheduleContracts);
    targetObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "aria-disabled", "style", "open"],
    });
    shellObserver = targetObserver;
  }
  window.addEventListener("pagehide", () => {
    targetObserver?.disconnect();
    if (shellObserver !== targetObserver) shellObserver?.disconnect();
  }, { once: true });
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

  await import("/static/js/estate-shell.js");
  const header = ensureGovernedHeader(primary);
  if (context.previousElementSibling !== header) header.insertAdjacentElement("afterend", context);
  await import("/static/js/estate-search/global-search.js");
  await installGovernedFooter();
  await installLabHomeFields();
  await installRouteEnhancements();
  installCompactLabContext(context);
  installMeasuredShell(header, context);
  void startContracts();
}

void installLabShell();

export {
  LAB_ROUTE_GROUPS,
  LAB_ROUTES,
  SYSTEM_SYMPHONY_SCOPED_ROUTES,
  auditInteractionTargets,
  auditLabShell,
  inspectLabShell,
  isCurrentLabRoute,
  isSystemSymphonyPath,
  labLayoutForPath,
  labRouteForPath,
  measureInteractionTargets,
  normalizeLegacyRouteLinks,
  normalizePath,
};
