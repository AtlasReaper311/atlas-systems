"use strict";

const FOOTER_STYLESHEET = "/static/css/phase-6-footer.css?v=20260730-phase-6-v1";
const ATLAS_OWNED_HOSTS = new Set([
  "api.atlas-systems.uk",
  "atlas-systems.uk",
  "cv.atlas-systems.uk",
  "ramone.atlas-systems.uk",
  "status.atlas-systems.uk",
]);
const GLOBAL_CONTEXT = Object.freeze([
  { label: "Work", href: "/work/" },
  { label: "Writing", href: "/writing/" },
  { label: "Lab", href: "/lab/" },
  { label: "Systems", href: "/systems/" },
  { label: "About", href: "/about/" },
]);
const TOOL_PATHS = Object.freeze([
  "/systems/evidence/",
  "/systems/observability/",
  "/systems/reliability/",
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

function isExcludedFooterRoute(pathname) {
  const path = normalizePath(pathname);
  return path === "/lab/console/" || isWritingArticle(path);
}

function resolveFooterVariant(pathname) {
  const path = normalizePath(pathname);
  if (isExcludedFooterRoute(path)) return null;
  if (path.startsWith("/lab/") || TOOL_PATHS.includes(path)) return "tool";
  return "estate";
}

function pageIdentity(pathname, title) {
  const variant = resolveFooterVariant(pathname);
  if (variant === "estate") {
    return { name: "Atlas Systems", detail: "Live technical estate" };
  }
  const raw = String(title || "").trim();
  const name = raw
    .replace(/\s*\/\/\s*Atlas Systems\s*$/i, "")
    .replace(/^Atlas Systems\s*\/\/\s*/i, "")
    .trim() || "Atlas Systems Lab";
  return { name, detail: "Atlas Systems Lab instrument" };
}

function ensureStylesheet() {
  if (document.head.querySelector(`link[href="${FOOTER_STYLESHEET}"]`)) return;
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
  for (const item of items) {
    slot.appendChild(typeof item === "string" ? document.createTextNode(item) : createLink(item));
  }
  return slot;
}

function existingEvidenceText(existing) {
  if (!existing) return "";
  const session = existing.querySelector("#sig-log");
  return session ? session.textContent.trim() : "";
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
    context: GLOBAL_CONTEXT,
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
    "footer[data-atlas-phase6-footer], footer.lab-tool-footer, footer.sig, body > footer:not(.article-footer)"
  );
}

function installPhase6Footer() {
  const path = normalizePath(window.location.pathname);
  if (isExcludedFooterRoute(path)) return null;
  const current = document.querySelector("footer[data-atlas-phase6-footer]");
  if (current) return current;

  const existing = findExistingFooter();
  const configuration = footerConfiguration(path, document.title, existingEvidenceText(existing));
  if (!configuration) return null;

  ensureStylesheet();
  const footer = buildFooter(configuration);
  if (existing) {
    existing.replaceWith(footer);
  } else {
    const mobileNavigation = document.querySelector('nav[aria-label="Mobile navigation"]');
    if (mobileNavigation && mobileNavigation.parentNode) {
      mobileNavigation.parentNode.insertBefore(footer, mobileNavigation);
    } else {
      document.body.appendChild(footer);
    }
  }
  return footer;
}

function autoInstall() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPhase6Footer, { once: true });
  } else {
    installPhase6Footer();
  }
}

autoInstall();

export {
  FOOTER_STYLESHEET,
  footerConfiguration,
  installPhase6Footer,
  isExcludedFooterRoute,
  isWritingArticle,
  normalizePath,
  pageIdentity,
  resolveFooterVariant,
};
