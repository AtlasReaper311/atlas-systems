"use strict";

const LAB_ROUTES = [
  { label: "Lab home", href: "/lab/" },
  { label: "System Map", href: "/lab/system-map/" },
  { label: "Operations", href: "/lab/console/" },
  { label: "Proof Chain", href: "/lab/proof-chain/" },
  { label: "Signal Garden", href: "/lab/signal/" },
  { label: "Reliability", href: "/lab/reliability/" },
  { label: "Conformance", href: "/lab/conformance/" },
  { label: "Shape Detector", href: "/lab/anomaly/" },
];

const SEARCH_CSS = "/static/css/estate-search.css";

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

function currentPath() { return normalizePath(window.location.pathname); }

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
    if (normalizePath(new URL(route.href, window.location.origin).pathname) === currentPath()) link.setAttribute("aria-current", "page");
    inner.appendChild(link);
  }
  context.appendChild(inner);
}

function installFooter() {
  if (document.querySelector("footer.lab-tool-footer")) return;
  const footer = document.createElement("footer");
  footer.className = "lab-tool-footer";
  footer.setAttribute("aria-label", "Lab footer");
  const identity = document.createElement("span");
  identity.textContent = "Atlas Systems // Lab";
  const links = document.createElement("div");
  for (const [label, href] of [["Lab home", "/lab/"], ["Systems", "/systems/"], ["Status", "https://status.atlas-systems.uk/"], ["Estate home", "/"]]) {
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
  let meta = document.head.querySelector(`meta[${attribute}="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function installMetadata() {
  const title = document.title;
  const description = document.head.querySelector('meta[name="description"]')?.content || "Atlas Systems Lab interface.";
  const url = window.location.origin + currentPath();
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;
  ensureMeta("og:type", "website");
  ensureMeta("og:title", title);
  ensureMeta("og:description", description);
  ensureMeta("og:url", url);
  ensureMeta("og:site_name", "Atlas Systems");
  ensureMeta("og:image", "https://atlas-systems.uk/og-default.png");
  ensureMeta("og:image:width", "1200");
  ensureMeta("og:image:height", "630");
  ensureMeta("og:image:alt", "Atlas Systems: audio systems, local AI infrastructure, and deployment automation");
  ensureMeta("twitter:card", "summary_large_image");
  ensureMeta("twitter:title", title);
  ensureMeta("twitter:description", description);
  ensureMeta("twitter:image", "https://atlas-systems.uk/og-default.png");
}

async function installLabShell() {
  ensureStylesheet(SEARCH_CSS);
  installMetadata();
  const primary = installPrimaryNavigation();
  installContextNavigation(primary);
  installFooter();
  await import("/static/js/estate-shell.js?v=20260723-interface-v2");
  await import("/static/js/estate-search/global-search.js");
}

void installLabShell();

export { LAB_ROUTES, normalizePath };
