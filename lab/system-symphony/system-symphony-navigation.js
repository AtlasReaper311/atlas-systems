"use strict";

const ROOT_ROUTE = "/lab/system-symphony/";
const NAV_STYLESHEET = "/lab/system-symphony/system-symphony-navigation.css?v=20260727-stage-2a-polish-fixes";
const MODE_NAMES = new Set(["play", "trace", "replay"]);

let trustReturnTarget = null;
let lastMode = "";

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function currentPath() {
  return normalizePath(window.location.pathname);
}

function isRootRoute() {
  return currentPath() === ROOT_ROUTE;
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function routeLabel(pathname = currentPath()) {
  if (pathname === ROOT_ROUTE) return "Instrument";
  if (pathname.startsWith(`${ROOT_ROUTE}roms/`)) return "ROM Library";
  if (pathname.startsWith(`${ROOT_ROUTE}build-log/`)) return "Build Log Synth";
  if (pathname.startsWith(`${ROOT_ROUTE}radio/`)) return "Signal Radio";
  if (pathname.startsWith(`${ROOT_ROUTE}replay/`)) return "Replay";
  return "System Symphony";
}

function currentMode() {
  const flagship = document.querySelector("[data-symphony-flagship]");
  const value = String(flagship?.dataset.symphonyMode ?? "play").toLowerCase();
  return MODE_NAMES.has(value) ? value : "play";
}

function syncProductModeLinks(mode = currentMode()) {
  for (const link of document.querySelectorAll(".symphony-product-mode-link")) {
    const linkMode = link.dataset.symphonyModeRoute ?? link.dataset.symphonyModeTab;
    if (!MODE_NAMES.has(linkMode)) continue;
    const selected = linkMode === mode;
    link.setAttribute("aria-selected", String(selected));
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function createTextLink(label, href, { current = false, className = "" } = {}) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  if (className) link.className = className;
  if (current) link.setAttribute("aria-current", "page");
  return link;
}

function compactLabNavigation() {
  const context = document.querySelector('.lab-context-nav[aria-label="Lab navigation"]');
  if (!context || context.dataset.symphonyCompact === "true") return;

  const existingLinks = [...context.querySelectorAll("a")].map((link) => ({
    href: link.href,
    label: link.textContent?.trim() === "APU ROMs" ? "ROM Library" : link.textContent?.trim() || link.href,
    current: link.getAttribute("aria-current") === "page",
  }));

  const inner = document.createElement("div");
  inner.className = "symphony-lab-context-inner";

  const crumbs = document.createElement("div");
  crumbs.className = "symphony-lab-crumbs";
  crumbs.append(
    createTextLink("Lab", "/lab/"),
    Object.assign(document.createElement("span"), { textContent: "/" }),
    createTextLink("System Symphony", ROOT_ROUTE, { current: currentPath() === ROOT_ROUTE }),
  );
  if (currentPath() !== ROOT_ROUTE) {
    crumbs.append(
      Object.assign(document.createElement("span"), { textContent: "/" }),
      Object.assign(document.createElement("span"), {
        className: "symphony-lab-crumbs__current",
        textContent: routeLabel(),
      }),
    );
  }

  const tools = document.createElement("details");
  tools.className = "symphony-lab-tools";
  const summary = document.createElement("summary");
  summary.textContent = "All Lab tools";
  const menu = document.createElement("div");
  menu.className = "symphony-lab-tools__menu";
  for (const route of existingLinks) {
    const link = createTextLink(route.label, route.href, { current: route.current });
    menu.appendChild(link);
  }
  tools.append(summary, menu);
  inner.append(crumbs, tools);
  context.replaceChildren(inner);
  context.dataset.symphonyCompact = "true";
}

function createMoreMenu({ root = false } = {}) {
  const details = document.createElement("details");
  details.className = "symphony-more-menu";

  const summary = document.createElement("summary");
  summary.textContent = "More";

  const menu = document.createElement("div");
  menu.className = "symphony-more-menu__menu";

  for (const item of [
    { label: "Build Log Synth", href: `${ROOT_ROUTE}build-log/`, meta: "Prototype" },
    { label: "Signal Radio", href: `${ROOT_ROUTE}radio/`, meta: "Prototype" },
    { label: "About, accessibility & evidence", href: root ? "#symphony-support" : `${ROOT_ROUTE}#symphony-support`, meta: "Guide" },
  ]) {
    const link = document.createElement("a");
    link.href = item.href;
    const label = document.createElement("span");
    label.textContent = item.label;
    const meta = document.createElement("small");
    meta.textContent = item.meta;
    link.append(label, meta);
    menu.appendChild(link);
  }

  details.append(summary, menu);
  return details;
}

function createProductStatus() {
  const status = document.createElement("div");
  status.className = "symphony-product-status";
  status.setAttribute("aria-label", "Current System Symphony state");

  const dot = document.createElement("span");
  dot.className = "symphony-product-status__dot";
  dot.setAttribute("aria-hidden", "true");

  const state = document.createElement("span");
  state.dataset.productState = "";
  state.textContent = "Unknown";

  const separator = document.createElement("span");
  separator.className = "symphony-product-status__separator";
  separator.textContent = "/";
  separator.setAttribute("aria-hidden", "true");

  const source = document.createElement("span");
  source.dataset.productSource = "";
  source.textContent = "connecting";

  status.append(dot, state, separator, source);
  return status;
}

function createModeLink(label, mode) {
  const url = new URL(ROOT_ROUTE, window.location.origin);
  if (mode !== "play") url.searchParams.set("symphonyMode", mode);
  const link = createTextLink(label, `${url.pathname}${url.search}`, {
    className: "symphony-product-mode-link",
  });
  link.dataset.symphonyModeRoute = mode;
  return link;
}

function installProductBar() {
  if (document.querySelector("[data-symphony-product-bar]")) return;

  const main = document.querySelector("main");
  const root = isRootRoute();
  const flagship = document.querySelector("[data-symphony-flagship]");
  const routeHero = main?.querySelector("header");
  const anchor = flagship ?? routeHero;
  if (!main || !anchor) return;

  const bar = document.createElement("nav");
  bar.className = "symphony-product-bar";
  bar.dataset.symphonyProductBar = "";
  bar.setAttribute("aria-label", "System Symphony navigation");

  const identity = createTextLink("System Symphony", ROOT_ROUTE, {
    className: "symphony-product-bar__identity",
    current: root,
  });
  bar.appendChild(identity);

  const destinations = document.createElement("div");
  destinations.className = "symphony-product-bar__destinations";

  if (root) {
    const modeTabs = flagship.querySelector(".symphony-mode-tabs");
    if (modeTabs) {
      modeTabs.classList.add("symphony-product-bar__modes");
      destinations.appendChild(modeTabs);
    }
  } else {
    destinations.append(
      createModeLink("Play", "play"),
      createModeLink("Trace", "trace"),
      createModeLink("Replay", "replay"),
    );
  }

  destinations.appendChild(createTextLink("ROM Library", `${ROOT_ROUTE}roms/`, {
    className: "symphony-product-link",
    current: currentPath().startsWith(`${ROOT_ROUTE}roms/`),
  }));
  destinations.appendChild(createMoreMenu({ root }));
  bar.appendChild(destinations);

  const utilities = document.createElement("div");
  utilities.className = "symphony-product-bar__utilities";
  utilities.appendChild(createProductStatus());

  if (root) {
    const audio = document.querySelector("[data-page-audio-toggle]");
    if (audio) {
      audio.classList.add("symphony-product-audio");
      utilities.appendChild(audio);
    }
  }
  bar.appendChild(utilities);

  anchor.insertAdjacentElement("beforebegin", bar);
}

function collapseSupportingSections() {
  if (!isRootRoute() || document.getElementById("symphony-support")) return;
  const sections = ["mapping-title", "controls-title", "sources-title"]
    .map((id) => document.getElementById(id)?.closest(".focus-section"))
    .filter(Boolean);
  if (sections.length === 0) return;

  const details = document.createElement("details");
  details.id = "symphony-support";
  details.className = "symphony-support";

  const summary = document.createElement("summary");
  const title = document.createElement("span");
  title.textContent = "About, accessibility & evidence";
  const copy = document.createElement("small");
  copy.textContent = "How the score works, keyboard controls, and source links";
  summary.append(title, copy);

  const body = document.createElement("div");
  body.className = "symphony-support__body";
  sections[0].insertAdjacentElement("beforebegin", details);
  for (const section of sections) body.appendChild(section);
  details.append(summary, body);
}

function configureRootWorkspace() {
  if (!isRootRoute()) return;
  const flagship = document.querySelector("[data-symphony-flagship]");
  if (!flagship) return;

  const breadcrumb = flagship.querySelector(".focus-breadcrumb");
  if (breadcrumb) breadcrumb.textContent = "Lab / System Symphony / Instrument";

  flagship.querySelector(".symphony-destination-nav")?.remove();

  const top = flagship.querySelector(".symphony-flagship__top");
  top?.classList.add("symphony-flagship__intro");

  const stage = flagship.querySelector(".symphony-stage");
  if (stage) {
    stage.id = "symphony-workspace";
    stage.dataset.symphonyWorkspace = "";
  }

  const host = flagship.querySelector("[data-symphony-page-host]");
  const summary = flagship.querySelector(".symphony-page-summary");
  const sourceStatus = flagship.querySelector("#page-source-status");
  const proofConsole = flagship.querySelector("[data-proof-console]");
  const trustLayer = flagship.querySelector("[data-trust-layer]");

  if (host) host.dataset.modeSurface = "trace";
  if (summary) summary.dataset.modeSurface = "trace";
  if (sourceStatus) sourceStatus.dataset.modeSurface = "trace";
  if (proofConsole) {
    proofConsole.dataset.modeSurface = "trace replay";
    const proofHeading = proofConsole.querySelector("h2");
    if (proofHeading) proofHeading.tabIndex = -1;
  }

  if (trustLayer) {
    trustLayer.setAttribute("role", "complementary");
    trustLayer.setAttribute("aria-label", "System Symphony proof drawer");
  }

  // The board is the subject of the workspace, not the payoff underneath the
  // score and proof surfaces, so it sits directly beneath the controls that
  // drive it. The evidence surfaces keep their existing position.
  if (host && stage) stage.after(host);

  const insertionAnchor = trustLayer ?? flagship.querySelector(".symphony-proof-strip");
  if (insertionAnchor) {
    const ordered = [summary, sourceStatus, proofConsole].filter(Boolean);
    insertionAnchor.after(...ordered);
  }
}

function modeSurfaceMatches(node, mode) {
  return String(node.dataset.modeSurface ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(mode);
}

function selectProofTab(panel) {
  const tab = document.querySelector(`[data-proof-tab="${panel}"]`);
  if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
}

function syncModeSurfaces({ userInitiated = false } = {}) {
  if (!isRootRoute()) return;
  const mode = currentMode();
  syncProductModeLinks(mode);
  for (const surface of document.querySelectorAll("[data-mode-surface]")) {
    surface.hidden = !modeSurfaceMatches(surface, mode);
  }

  document.body.dataset.symphonyMode = mode;
  if (mode !== lastMode) {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("symphonyProof")) {
      if (mode === "replay") selectProofTab("incident");
      if (mode === "trace" && lastMode === "replay") selectProofTab("cartridge");
    }
    lastMode = mode;
  }

  if (userInitiated) {
    const workspace = document.querySelector("[data-symphony-workspace]");
    window.requestAnimationFrame(() => workspace?.scrollIntoView({ block: "start", behavior: "auto" }));
  }
}

function normalizeState(value) {
  const state = String(value ?? "unknown").split("/")[0].trim().toLowerCase();
  if (["healthy", "warning", "critical", "unknown"].includes(state)) return state;
  return "unknown";
}

function syncProductStatus() {
  const stateNode = document.querySelector("[data-page-now-state]") ?? document.getElementById("page-score-state");
  const sourceNode = document.getElementById("page-proof-source") ?? document.querySelector("[data-page-source-label]");
  const stateText = stateNode?.textContent?.trim() || routeLabel();
  const sourceText = sourceNode?.textContent?.trim() || (isRootRoute() ? "connecting" : "lab route");
  const status = document.querySelector(".symphony-product-status");
  const state = document.querySelector("[data-product-state]");
  const source = document.querySelector("[data-product-source]");
  if (state && state.textContent !== stateText) state.textContent = stateText;
  if (source && source.textContent !== sourceText) source.textContent = sourceText;
  const stateKey = normalizeState(stateText);
  if (status && status.dataset.state !== stateKey) status.dataset.state = stateKey;
}

function setTrustDrawer(open, { restoreFocus = true } = {}) {
  const layer = document.querySelector("[data-trust-layer]");
  const toggles = [...document.querySelectorAll("[data-trust-toggle]")];
  const toggle = toggles[0];
  if (!layer) return;

  if (open) {
    trustReturnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
    layer.hidden = false;
    document.body.classList.add("symphony-trust-open");
    for (const trustToggle of toggles) trustToggle.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => layer.querySelector("[data-trust-close]")?.focus({ preventScroll: true }));
    return;
  }

  layer.hidden = true;
  document.body.classList.remove("symphony-trust-open");
  for (const trustToggle of toggles) trustToggle.setAttribute("aria-expanded", "false");
  if (restoreFocus && trustReturnTarget?.isConnected) {
    trustReturnTarget.focus({ preventScroll: true });
  }
  trustReturnTarget = null;
}

function installTrustDrawerControls() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const toggle = target.closest("[data-trust-toggle]");
    if (toggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const layer = document.querySelector("[data-trust-layer]");
      setTrustDrawer(layer?.hidden !== false);
      return;
    }

    const close = target.closest("[data-trust-close]");
    if (close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setTrustDrawer(false);
      return;
    }

    const proofOpen = target.closest("[data-proof-open]");
    if (proofOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const modeTab = document.querySelector('[data-symphony-mode-tab="trace"]');
      modeTab?.click();
      selectProofTab(proofOpen.dataset.proofOpen || "cartridge");
      setTrustDrawer(false, { restoreFocus: false });
      window.requestAnimationFrame(() => {
        const consoleNode = document.querySelector("[data-proof-console]");
        consoleNode?.scrollIntoView({ block: "start", behavior: "auto" });
        consoleNode?.querySelector("h2")?.focus?.({ preventScroll: true });
      });
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const layer = document.querySelector("[data-trust-layer]");
    if (layer?.hidden === false) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setTrustDrawer(false);
    }
  }, true);
}

function installModeObservers() {
  const flagship = document.querySelector("[data-symphony-flagship]");
  if (!flagship) return;

  for (const tab of flagship.querySelectorAll("[data-symphony-mode-tab]")) {
    tab.addEventListener("click", () => {
      window.requestAnimationFrame(() => syncModeSurfaces({ userInitiated: true }));
    });
  }

  const observer = new MutationObserver(() => syncModeSurfaces());
  observer.observe(flagship, { attributes: true, attributeFilter: ["data-symphony-mode"] });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  syncModeSurfaces();
}

function installStatusObserver() {
  const flagship = document.querySelector("[data-symphony-flagship]");
  syncProductStatus();
  if (!flagship) return;
  const observer = new MutationObserver(syncProductStatus);
  observer.observe(flagship, { childList: true, characterData: true, subtree: true });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

function installMenuBehavior() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const supportLink = target.closest('a[href$="#symphony-support"]');
    if (supportLink && isRootRoute()) {
      const support = document.getElementById("symphony-support");
      if (support instanceof HTMLDetailsElement) support.open = true;
    }

    for (const details of document.querySelectorAll(".symphony-more-menu, .symphony-lab-tools")) {
      if (target.closest("details") !== details) details.removeAttribute("open");
    }
  });
}

function initialiseNavigation() {
  if (!currentPath().startsWith(ROOT_ROUTE)) return;
  document.body.classList.add("symphony-system-route");
  ensureStylesheet(NAV_STYLESHEET);
  compactLabNavigation();
  configureRootWorkspace();
  collapseSupportingSections();
  installProductBar();
  installTrustDrawerControls();
  installModeObservers();
  installStatusObserver();
  installMenuBehavior();
}

if (typeof document !== "undefined") initialiseNavigation();

export {
  currentMode,
  modeSurfaceMatches,
  normalizePath,
  routeLabel,
};
