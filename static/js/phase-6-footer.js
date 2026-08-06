"use strict";

const FOOTER_STYLESHEET = "/static/css/phase-6-footer.css?v=20260730-phase-6-v2";
const LAB_SHELL_MODULE = "/lab/shared/shell.js?v=20260806-final-convergence-v1";
const SURFACE_CONVERGENCE_MODULE = "/static/js/surface-convergence.js?v=20260806-final-convergence-v1";
const SURFACE_CONVERGENCE_STYLESHEET = "/static/css/surface-convergence.css?v=20260806-final-convergence-v1";
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
const SURFACE_PATHS = Object.freeze(new Set([
  "/lab/",
  "/lab/system-map/",
  "/lab/blackbox/",
  "/lab/console/",
  "/lab/proof-chain/",
  "/lab/conformance/",
  "/lab/anomaly/",
  "/lab/speculum/",
  "/lab/signal/",
  "/lab/almost/",
  "/lab/drift/",
  "/lab/bearing/",
  "/lab/system-symphony/",
  "/systems/",
  "/systems/observability/",
  "/systems/reliability/",
  "/systems/evidence/",
]));

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

function isSurfaceConvergencePath(pathname) {
  const path = normalizePath(pathname);
  return SURFACE_PATHS.has(path) || path.startsWith("/lab/system-symphony/");
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

function ensureStylesheet(href, dataAttribute = null, moveToEnd = false) {
  const requested = new URL(href, window.location.origin);
  let link = [...document.head.querySelectorAll('link[rel="stylesheet"][href]')]
    .find((candidate) => new URL(candidate.href, window.location.origin).pathname === requested.pathname);
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    if (dataAttribute) link.dataset[dataAttribute] = "";
    document.head.appendChild(link);
  } else if (moveToEnd) {
    document.head.appendChild(link);
  }
  return link;
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
  for (const item of items) {
    slot.appendChild(typeof item === "string" ? document.createTextNode(item) : createLink(item));
  }
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

  if (configuration.context.length) {
    footer.appendChild(createSlot("atlas-footer__context", configuration.context));
  }
  if (configuration.evidence.length) {
    footer.appendChild(createSlot("atlas-footer__evidence", configuration.evidence));
  }
  footer.appendChild(createSlot("atlas-footer__escape", configuration.escape));
  return footer;
}

function findExistingFooter() {
  return document.querySelector(
    "footer[data-atlas-phase6-footer], footer.lab-tool-footer, footer.sig, body > footer:not(.article-footer)",
  );
}

function installPhase6Footer() {
  const path = normalizePath(window.location.pathname);
  if (isExcludedFooterRoute(path)) return null;
  ensureStylesheet(FOOTER_STYLESHEET, "atlasPhase6FooterStyles");
  const current = document.querySelector("footer[data-atlas-phase6-footer]");
  if (current) return current;

  const existing = findExistingFooter();
  const configuration = footerConfiguration(path, document.title, existingEvidenceText(existing));
  if (!configuration) return null;
  const footer = buildFooter(configuration);
  if (existing) {
    existing.replaceWith(footer);
  } else {
    const mobileNavigation = document.querySelector('nav[aria-label="Mobile navigation"]');
    if (mobileNavigation?.parentNode) mobileNavigation.parentNode.insertBefore(footer, mobileNavigation);
    else document.body.appendChild(footer);
  }
  return footer;
}

async function installSurfaceConvergence({ moveStylesheetToEnd = false } = {}) {
  const path = normalizePath(window.location.pathname);
  if (!isSurfaceConvergencePath(path)) return null;
  ensureStylesheet(
    SURFACE_CONVERGENCE_STYLESHEET,
    "atlasSurfaceConvergenceStyles",
    moveStylesheetToEnd,
  );
  const module = await import(SURFACE_CONVERGENCE_MODULE);
  return module.installSurfaceConvergence();
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
  if (hasShellEntrypoint()) return false;

  window.setTimeout(() => {
    void import(LAB_SHELL_MODULE)
      .then(() => installSurfaceConvergence({ moveStylesheetToEnd: true }))
      .catch((error) => {
        console.error("Lab shell bootstrap unavailable", error);
      });
  }, 0);
  return true;
}

function installBearingShell() {
  return bootstrapLabShell();
}

function install() {
  installPhase6Footer();
  void installSurfaceConvergence().catch((error) => {
    console.error("Surface convergence bootstrap unavailable", error);
  });
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
  SURFACE_CONVERGENCE_MODULE,
  SURFACE_CONVERGENCE_STYLESHEET,
  SURFACE_PATHS,
  bootstrapLabShell,
  footerConfiguration,
  installBearingShell,
  installPhase6Footer,
  installSurfaceConvergence,
  isExcludedFooterRoute,
  isLabPath,
  isSurfaceConvergencePath,
  isWritingArticle,
  normalizePath,
  pageIdentity,
  resolveFooterVariant,
};
