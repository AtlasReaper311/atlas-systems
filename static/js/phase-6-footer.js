"use strict";

const FOOTER_STYLESHEET = "/static/css/phase-6-footer.css?v=20260730-phase-6-v2";
const LAB_SHELL_MODULE = "/lab/shared/shell.js?v=20260805-lab-consistency-v1";
const GLOBAL_SEARCH_MODULE = "/static/js/estate-search/global-search.js";
const BEARING_ROUTE = "/lab/bearing/";
const ATLAS_OWNED_HOSTS = new Set([
  "api.atlas-systems.uk",
  "atlas-systems.uk",
  "cv.atlas-systems.uk",
  "ramone.atlas-systems.uk",
  "status.atlas-systems.uk",
]);
const TOOL_PATHS = Object.freeze([
  "/systems/evidence/",
  "/systems/observability/",
  "/systems/reliability/",
]);
const GLOBAL_ROUTES = Object.freeze([
  Object.freeze({ label: "Work", href: "/work/" }),
  Object.freeze({ label: "Writing", href: "/writing/" }),
  Object.freeze({ label: "Lab", href: "/lab/" }),
  Object.freeze({ label: "Systems", href: "/systems/" }),
  Object.freeze({ label: "About", href: "/about/" }),
]);
const BEARING_LAB_GROUPS = Object.freeze([
  Object.freeze({ label: "Experience", routes: Object.freeze([
    Object.freeze({ label: "System Symphony", href: "/lab/system-symphony/" }),
    Object.freeze({ label: "Signal Garden", href: "/lab/signal/" }),
  ]) }),
  Object.freeze({ label: "Observe", routes: Object.freeze([
    Object.freeze({ label: "System Map", href: "/lab/system-map/" }),
    Object.freeze({ label: "Blackbox", href: "/lab/blackbox/" }),
    Object.freeze({ label: "Observability", href: "/systems/observability/" }),
    Object.freeze({ label: "Operations", href: "/lab/console/" }),
  ]) }),
  Object.freeze({ label: "Verify", routes: Object.freeze([
    Object.freeze({ label: "Proof Chain", href: "/lab/proof-chain/" }),
    Object.freeze({ label: "Estate Conformance", href: "/lab/conformance/" }),
    Object.freeze({ label: "Reliability", href: "/systems/reliability/" }),
    Object.freeze({ label: "Evidence", href: "/systems/evidence/" }),
  ]) }),
  Object.freeze({ label: "Explore", routes: Object.freeze([
    Object.freeze({ label: "Speculum", href: "/lab/speculum/" }),
    Object.freeze({ label: "Almost", href: "/lab/almost/" }),
    Object.freeze({ label: "Drift", href: "/lab/drift/" }),
    Object.freeze({ label: "The Bearing", href: BEARING_ROUTE }),
    Object.freeze({ label: "Shape Detector", href: "/lab/anomaly/" }),
  ]) }),
]);

function normalizePath(pathname) {
  const path = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  if (path === "/") return path;
  return path.endsWith("/") ? path : `${path}/`;
}

function isWritingArticle(pathname) {
  const path = normalizePath(pathname);
  return path.startsWith("/writing/") && path !== "/writing/";
}

function isLabPath(pathname) {
  return normalizePath(pathname).startsWith("/lab/");
}

function isExcludedFooterRoute(pathname) {
  return isWritingArticle(pathname);
}

function resolveFooterVariant(pathname) {
  const path = normalizePath(pathname);
  if (isExcludedFooterRoute(path)) return null;
  if (path.startsWith("/lab/") || TOOL_PATHS.includes(path)) return "tool";
  return "estate";
}

function pageIdentity(pathname, title) {
  const variant = resolveFooterVariant(pathname);
  if (variant === "estate") return { name: "Atlas Systems", detail: "Live technical estate" };
  const raw = String(title || "").trim();
  const name = raw
    .replace(/\s*\/\/\s*Atlas Systems\s*$/i, "")
    .replace(/^Atlas Systems\s*\/\/\s*/i, "")
    .trim() || "Atlas Systems Lab";
  return { name, detail: "Atlas Systems Lab instrument" };
}

function ensureStylesheet() {
  if ([...document.head.querySelectorAll('link[rel="stylesheet"][href]')]
    .some((link) => new URL(link.href).pathname === new URL(FOOTER_STYLESHEET, window.location.origin).pathname)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FOOTER_STYLESHEET;
  link.dataset.atlasPhase6FooterStyles = "";
  document.head.appendChild(link);
}

function createLink(definition) {
  const link = document.createElement("a");
  link.href = definition.href;
  link.textContent = definition.label;
  let url;
  try {
    url = new URL(definition.href, window.location.origin);
  } catch {
    return link;
  }
  if ((url.protocol === "http:" || url.protocol === "https:") && !ATLAS_OWNED_HOSTS.has(url.hostname)) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function createSlot(className, items) {
  const slot = document.createElement("div");
  slot.className = className;
  for (const item of items) slot.appendChild(typeof item === "string" ? document.createTextNode(item) : createLink(item));
  return slot;
}

function existingEvidenceText(existing) {
  return existing?.querySelector("#sig-log")?.textContent.trim() || "";
}

function footerConfiguration(pathname, title, evidenceText = "") {
  const path = normalizePath(pathname);
  const variant = resolveFooterVariant(path);
  if (!variant) return null;
  const identity = pageIdentity(path, title);
  if (variant === "tool") {
    return {
      variant,
      label: "Lab tool footer",
      identity,
      context: [
        { label: "Lab home", href: "/lab/" },
        { label: "Systems directory", href: "/systems/" },
      ],
      evidence: [
        ...(evidenceText ? [evidenceText] : []),
        { label: "Estate status", href: "https://status.atlas-systems.uk/" },
      ],
      escape: [{ label: "Atlas Systems home", href: "/" }],
    };
  }
  return {
    variant,
    label: "Atlas Systems footer",
    identity,
    context: [],
    evidence: [
      { label: "Estate status", href: "https://status.atlas-systems.uk/" },
      { label: "GitHub", href: "https://github.com/AtlasReaper311" },
    ],
    escape: path === "/"
      ? [{ label: "Systems directory", href: "/systems/" }]
      : [{ label: "Atlas Systems home", href: "/" }],
  };
}

function buildFooter(configuration) {
  const footer = document.createElement("footer");
  footer.className = `atlas-footer atlas-footer--${configuration.variant} phase-6-footer`;
  footer.setAttribute("aria-label", configuration.label);
  footer.dataset.atlasPhase6Footer = configuration.variant;
  const identity = document.createElement("div");
  identity.className = "atlas-footer__identity";
  const name = document.createElement("strong");
  name.textContent = configuration.identity.name;
  const detail = document.createElement("span");
  detail.textContent = configuration.identity.detail;
  identity.append(name, detail);
  footer.appendChild(identity);
  if (configuration.context.length) footer.appendChild(createSlot("atlas-footer__context", configuration.context));
  if (configuration.evidence.length) footer.appendChild(createSlot("atlas-footer__evidence", configuration.evidence));
  footer.appendChild(createSlot("atlas-footer__escape", configuration.escape));
  return footer;
}

function findExistingFooter() {
  return document.querySelector(
    "footer[data-atlas-phase6-footer], footer.lab-tool-footer, footer.sig, body > footer:not(.article-footer)"
  );
}

function installPhase6Footer() {
  const path = normalizePath(window.location.pathname);
  if (isExcludedFooterRoute(path)) return null;
  ensureStylesheet();
  const current = document.querySelector("footer[data-atlas-phase6-footer]");
  if (current) return current;
  const existing = findExistingFooter();
  const configuration = footerConfiguration(path, document.title, existingEvidenceText(existing));
  if (!configuration) return null;
  const footer = buildFooter(configuration);
  if (existing) existing.replaceWith(footer);
  else {
    const mobileNavigation = document.querySelector('nav[aria-label="Mobile navigation"]');
    if (mobileNavigation?.parentNode) mobileNavigation.parentNode.insertBefore(footer, mobileNavigation);
    else document.body.appendChild(footer);
  }
  return footer;
}

function bearingWordmark() {
  const link = document.createElement("a");
  link.className = "wordmark atlas-wordmark";
  link.href = "/";
  link.dataset.atlasWordmark = "";
  link.append("Atlas");
  const cursor = document.createElement("span");
  cursor.textContent = "_";
  link.append(cursor, "Systems");
  return link;
}

function bearingSearchButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "es-nav-search atlas-search-control";
  button.dataset.estateSearchOpen = "";
  button.setAttribute("aria-label", "Search the estate");
  button.setAttribute("aria-haspopup", "dialog");
  button.textContent = "Search";
  return button;
}

function installBearingHeader() {
  let nav = document.querySelector('nav[aria-label="Primary navigation"]');
  if (!nav) {
    nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Primary navigation");
    document.body.prepend(nav);
  }
  const inner = document.createElement("div");
  inner.className = "atlas-header__inner";
  const brand = document.createElement("div");
  brand.className = "atlas-header__brand atlas-global-header__identity";
  const status = document.createElement("a");
  status.className = "nav-status atlas-status atlas-estate-status";
  status.href = "https://status.atlas-systems.uk/";
  status.textContent = "Status";
  brand.append(bearingWordmark(), status);
  const routes = document.createElement("div");
  routes.className = "atlas-header__nav atlas-global-header__nav";
  routes.setAttribute("aria-label", "Atlas Systems sections");
  for (const route of GLOBAL_ROUTES) {
    const link = createLink(route);
    link.className = "atlas-global-header__link";
    if (route.label === "Lab") link.setAttribute("aria-current", "page");
    routes.appendChild(link);
  }
  const actions = document.createElement("div");
  actions.className = "atlas-header__actions atlas-global-header__actions";
  actions.appendChild(bearingSearchButton());
  inner.append(brand, routes, actions);
  nav.replaceChildren(inner);
  nav.className = "atlas-header atlas-nav-shell atlas-global-header";
  return nav;
}

function installBearingContext(header) {
  const context = document.createElement("nav");
  context.className = "lab-context-nav lab-context-nav--compact bearing-lab-context";
  context.setAttribute("aria-label", "Lab navigation");
  context.dataset.labContextMode = "compact";
  context.dataset.currentLabRoute = "The Bearing";
  const inner = document.createElement("div");
  inner.className = "lab-context-compact";
  const crumbs = document.createElement("div");
  crumbs.className = "lab-context-compact__crumbs";
  crumbs.setAttribute("aria-label", "Current Lab location");
  const home = createLink({ label: "Lab", href: "/lab/" });
  const slash = document.createElement("span");
  slash.textContent = "/";
  slash.setAttribute("aria-hidden", "true");
  const current = document.createElement("span");
  current.className = "lab-context-compact__current";
  current.setAttribute("aria-current", "page");
  current.textContent = "The Bearing";
  crumbs.append(home, slash, current);
  const tools = document.createElement("details");
  tools.className = "lab-context-tools";
  const summary = document.createElement("summary");
  summary.textContent = "All Lab tools";
  const menu = document.createElement("div");
  menu.className = "lab-context-tools__menu";
  for (const definition of BEARING_LAB_GROUPS) {
    const group = document.createElement("div");
    group.className = "lab-context-tools__group";
    const label = document.createElement("strong");
    label.className = "lab-context-tools__group-label";
    label.textContent = definition.label;
    const links = document.createElement("div");
    links.className = "lab-context-tools__links";
    for (const route of definition.routes) {
      const link = createLink(route);
      if (route.href === BEARING_ROUTE) link.setAttribute("aria-current", "page");
      links.appendChild(link);
    }
    group.append(label, links);
    menu.appendChild(group);
  }
  tools.append(summary, menu);
  inner.append(crumbs, tools);
  context.appendChild(inner);
  header.insertAdjacentElement("afterend", context);
  document.addEventListener("click", (event) => {
    if (tools.open && !tools.contains(event.target)) tools.open = false;
  });
  context.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !tools.open) return;
    tools.open = false;
    summary.focus({ preventScroll: true });
  });
  return context;
}

function installBearingMobileNavigation() {
  let nav = document.querySelector('nav[aria-label="Mobile navigation"]');
  if (!nav) {
    nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Mobile navigation");
    document.body.appendChild(nav);
  }
  nav.className = "mobile-nav atlas-mobile-nav atlas-bottom-nav";
  const inner = document.createElement("div");
  inner.className = "mobile-nav-inner atlas-mobile-nav__inner";
  for (const route of GLOBAL_ROUTES) {
    const link = createLink(route);
    link.className = "mobile-nav-item atlas-mobile-nav__item";
    if (route.label === "Lab") link.setAttribute("aria-current", "page");
    inner.appendChild(link);
  }
  nav.replaceChildren(inner);
  document.body.dataset.atlasBottomNav = "true";
  return nav;
}

function installBearingSearch() {
  let loading = null;
  const open = async () => {
    loading ||= import(GLOBAL_SEARCH_MODULE);
    const module = await loading;
    module.open();
  };
  document.querySelector(".atlas-search-control")?.addEventListener("click", (event) => {
    event.preventDefault();
    void open();
  });
  window.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const editable = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) || event.target?.isContentEditable;
    if (((event.metaKey || event.ctrlKey) && key === "k") || (key === "/" && !editable)) {
      event.preventDefault();
      void open();
    }
  });
}

function auditBearingShell() {
  const failures = [];
  for (const [rule, selector] of [
    ["header-present", ".atlas-header"],
    ["context-navigation-present", ".lab-context-nav[data-lab-context-mode='compact']"],
    ["search-present", ".atlas-search-control"],
    ["footer-present", "footer[data-atlas-phase6-footer]"],
  ]) {
    if (!document.querySelector(selector)) failures.push({ rule });
  }
  const undersized = [...document.querySelectorAll("a, button, summary")]
    .filter((element) => !element.closest("[hidden], [aria-hidden='true']"))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, width: rect.width, height: rect.height };
    })
    .filter(({ width, height }) => width > 0 && height > 0 && (width < 43.9 || height < 43.9));
  document.documentElement.dataset.labShellContract = failures.length ? "fail" : "pass";
  document.documentElement.dataset.atlasTargetContract = undersized.length ? "fail" : "pass";
  if (failures.length) console.error(`[lab-shell-contract] ${failures.length} stable shell failure(s): ${JSON.stringify(failures)}`);
  if (undersized.length) {
    console.error(`[interaction-target-contract] ${undersized.length} visible target(s) are smaller than 44px`);
  }
}

function installBearingStyles() {
  if (document.getElementById("bearing-governed-shell-styles")) return;
  const style = document.createElement("style");
  style.id = "bearing-governed-shell-styles";
  style.textContent = `
:root{--lab-shell-header-height:56px;--lab-shell-context-height:55px;--lab-shell-stack-height:111px}
body[data-lab-route="bearing"]{padding-top:56px!important}
body[data-lab-route="bearing"]>.atlas-header{position:fixed;inset:0 0 auto;z-index:150;height:56px;background:rgba(7,7,11,.98);border-bottom:1px solid var(--rule);font-family:var(--f-data)}
.atlas-header__inner{width:min(1280px,calc(100% - 32px));height:100%;margin:auto;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px}
.atlas-header__brand,.atlas-header__nav,.atlas-header__actions{display:flex;align-items:center;gap:8px}
.atlas-header__nav{justify-content:center}.atlas-header a,.atlas-header button{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;color:#aaa9b5;text-decoration:none;background:none;border:1px solid transparent;font:600 10px/1 var(--f-data);letter-spacing:.06em;text-transform:uppercase}
.atlas-header .wordmark{color:#e9e7dc;font-size:12px;text-transform:none}.atlas-header .wordmark span{color:#f5a623}.atlas-header a:hover,.atlas-header a:focus-visible,.atlas-header button:hover,.atlas-header button:focus-visible{color:#fff;border-color:#f5a623;outline:2px solid #f5a623;outline-offset:1px}.atlas-estate-status{font-size:9px!important}
.bearing-lab-context{position:sticky;top:56px;z-index:120;min-height:55px;background:rgba(10,10,15,.98);border-bottom:1px solid #33343e;font-family:var(--f-data)}
.lab-context-compact{position:relative;width:min(1280px,calc(100% - 32px));min-height:55px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
.lab-context-compact__crumbs{min-width:0;display:flex;align-items:center;gap:8px;color:#aaa9b5;font:600 10px/1.2 var(--f-data);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.lab-context-compact__crumbs a,.lab-context-tools summary,.lab-context-tools__links a{min-width:44px;min-height:44px;display:flex;align-items:center;color:#c7c6bd;text-decoration:none}.lab-context-compact__current{overflow:hidden;color:#ffbe55;text-overflow:ellipsis}.lab-context-tools{position:relative}.lab-context-tools summary{padding:0 12px;justify-content:center;border:1px solid #454651;border-radius:4px;background:#0a0a0f;cursor:pointer;font:600 10px/1 var(--f-data);list-style:none}.lab-context-tools summary::-webkit-details-marker{display:none}.lab-context-tools summary:after{content:"+";margin-left:8px;color:#f5a623}.lab-context-tools[open] summary:after{content:"−"}
.lab-context-tools__menu{position:absolute;top:calc(100% + 8px);right:0;z-index:180;width:min(760px,calc(100vw - 24px));max-height:70svh;padding:10px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;overflow:auto;background:#0a0a0f;border:1px solid #454651;box-shadow:0 22px 70px #000}.lab-context-tools__group{padding:8px;border:1px solid #292a34}.lab-context-tools__group-label{display:block;margin-bottom:6px;color:#aaa9b5;font:600 8px/1.2 var(--f-data);letter-spacing:.14em;text-transform:uppercase}.lab-context-tools__links{display:grid;gap:2px}.lab-context-tools__links a{padding:0 9px;font:500 9px/1.2 var(--f-data);text-transform:uppercase}.lab-context-tools__links a:hover,.lab-context-tools__links a:focus-visible,.lab-context-tools__links a[aria-current="page"]{color:#fff;background:#2b2110;outline:2px solid #f5a623}
body[data-lab-route="bearing"] main{width:100%;max-width:none;margin:0;padding:0!important}body[data-lab-route="bearing"] .bearing{height:calc(100svh - 111px);min-height:560px}.atlas-mobile-nav{display:none}.atlas-footer{position:relative;z-index:2}.atlas-footer,.atlas-footer *{font-family:var(--f-data)!important;font-weight:400!important}
@media(max-width:767px){.atlas-header__nav{display:none}.atlas-header__inner{grid-template-columns:1fr auto}.atlas-estate-status{display:none}.lab-context-tools__menu{grid-template-columns:1fr;max-height:calc(100svh - 127px)}.atlas-mobile-nav{position:fixed;inset:auto 0 0;z-index:200;height:64px;display:block;background:#07070b;border-top:1px solid #33343e}.atlas-mobile-nav__inner{height:100%;display:grid;grid-template-columns:repeat(5,1fr)}.atlas-mobile-nav a{min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;color:#aaa9b5;font:600 9px/1 var(--f-data);text-decoration:none}.atlas-mobile-nav a[aria-current="page"]{color:#f5a623}body[data-atlas-bottom-nav="true"]{padding-bottom:64px!important}body[data-lab-route="bearing"] .bearing{height:auto;min-height:max(560px,calc(100svh - 111px))}}
`;
  document.head.appendChild(style);
}

function installBearingShell() {
  installBearingStyles();
  document.documentElement.dataset.labShell = "";
  document.body.dataset.labShell = "";
  document.body.dataset.labLayout = "immersive";
  document.body.dataset.labRoute = "bearing";
  const header = installBearingHeader();
  const context = installBearingContext(header);
  installBearingMobileNavigation();
  installBearingSearch();
  const update = () => {
    const headerHeight = Math.round(header.getBoundingClientRect().height || 56);
    const contextHeight = Math.round(context.getBoundingClientRect().height || 55);
    document.documentElement.style.setProperty("--lab-shell-header-height", `${headerHeight}px`);
    document.documentElement.style.setProperty("--lab-shell-context-height", `${contextHeight}px`);
    document.documentElement.style.setProperty("--lab-shell-stack-height", `${headerHeight + contextHeight}px`);
    document.documentElement.dataset.labShellReady = "";
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    update();
    auditBearingShell();
  }));
  window.addEventListener("resize", update, { passive: true });
  return true;
}

function hasShellEntrypoint() {
  return [...document.querySelectorAll("script[src]")].some((script) => {
    try {
      return new URL(script.src, window.location.origin).pathname === "/lab/shared/shell.js";
    } catch {
      return false;
    }
  });
}

function bootstrapLabShell() {
  const path = normalizePath(window.location.pathname);
  if (!isLabPath(path)) return false;
  if (document.documentElement.hasAttribute("data-lab-shell")) return false;
  if (path === BEARING_ROUTE) return installBearingShell();
  if (hasShellEntrypoint()) return false;
  window.setTimeout(() => {
    void import(LAB_SHELL_MODULE).catch((error) => {
      console.error("Lab shell bootstrap unavailable", error);
    });
  }, 0);
  return true;
}

function install() {
  if (normalizePath(window.location.pathname) === BEARING_ROUTE) installBearingStyles();
  installPhase6Footer();
  bootstrapLabShell();
}

function autoInstall() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

autoInstall();

export {
  BEARING_ROUTE,
  FOOTER_STYLESHEET,
  LAB_SHELL_MODULE,
  bootstrapLabShell,
  footerConfiguration,
  installBearingShell,
  installPhase6Footer,
  isExcludedFooterRoute,
  isLabPath,
  isWritingArticle,
  normalizePath,
  pageIdentity,
  resolveFooterVariant,
};
