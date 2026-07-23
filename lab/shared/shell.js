"use strict";

const GLOBAL_ROUTES = [
  { label: "Work", href: "/work/" },
  { label: "Writing", href: "/writing/" },
  { label: "Lab", href: "/lab/" },
  { label: "About", href: "/about/" },
];

const LAB_ROUTES = [
  { label: "Lab home", href: "/lab/" },
  { label: "System Map", href: "/lab/#system-map" },
  { label: "Proof Chain", href: "/lab/proof-chain/" },
  { label: "Signal", href: "/lab/signal/" },
  { label: "Reliability", href: "/lab/reliability/" },
  { label: "Conformance", href: "/lab/conformance/" },
  { label: "Anomaly", href: "/lab/anomaly/" },
];

const SEARCH_CSS = "/static/css/estate-search.css";

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

function currentPath() {
  return normalizePath(window.location.pathname);
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function globalLink(route) {
  const link = document.createElement("a");
  link.href = route.href;
  link.textContent = route.label;
  if (route.label === "Lab") link.setAttribute("aria-current", "page");
  return link;
}

function searchButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "es-nav-search lab-global-search";
  button.dataset.estateSearchOpen = "";
  button.setAttribute("aria-label", "Search the estate");
  button.setAttribute("aria-haspopup", "dialog");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "11");
  circle.setAttribute("cy", "11");
  circle.setAttribute("r", "7");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "21");
  line.setAttribute("y1", "21");
  line.setAttribute("x2", "16.2");
  line.setAttribute("y2", "16.2");
  icon.append(circle, line);

  const text = document.createElement("span");
  text.textContent = "Search";
  const key = document.createElement("kbd");
  key.dataset.estateSearchKbd = "";
  key.textContent = "ctrl k";
  button.append(icon, text, key);
  return button;
}

function installPrimaryNavigation() {
  const existing = document.querySelector('nav[aria-label="Primary navigation"]');
  const nav = existing || document.createElement("nav");
  nav.setAttribute("aria-label", "Primary navigation");
  nav.classList.add("lab-global-nav");
  nav.replaceChildren();

  const wordmark = document.createElement("a");
  wordmark.className = "wordmark";
  wordmark.href = "/";
  wordmark.dataset.atlasWordmark = "";
  wordmark.append("Atlas");
  const underscore = document.createElement("span");
  underscore.textContent = "_";
  wordmark.append(underscore, "Systems");

  const links = document.createElement("div");
  links.className = "nav-links lab-global-links";
  for (const route of GLOBAL_ROUTES) links.appendChild(globalLink(route));
  links.appendChild(searchButton());

  nav.append(wordmark, links);
  if (!existing) document.body.prepend(nav);
  return nav;
}

function contextualLink(route) {
  const link = document.createElement("a");
  link.href = route.href;
  link.textContent = route.label;
  const routePath = normalizePath(new URL(route.href, window.location.origin).pathname);
  if (route.href.includes("#system-map")) {
    if (currentPath() === "/lab/" && window.location.hash === "#system-map") {
      link.setAttribute("aria-current", "location");
    }
  } else if (routePath === currentPath()) {
    link.setAttribute("aria-current", "page");
  }
  return link;
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
  for (const route of LAB_ROUTES) inner.appendChild(contextualLink(route));
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
  const lab = document.createElement("a");
  lab.href = "/lab/";
  lab.textContent = "Lab home";
  const status = document.createElement("a");
  status.href = "https://status.atlas-systems.uk/";
  status.textContent = "Status";
  const home = document.createElement("a");
  home.href = "/";
  home.textContent = "Estate home";
  links.append(lab, status, home);
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

function ensureCanonical() {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = window.location.origin + currentPath();
}

function installMetadata() {
  const title = document.title;
  const description = document.head.querySelector('meta[name="description"]')?.content || "Atlas Systems Lab interface.";
  const url = window.location.origin + currentPath();
  ensureCanonical();
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
  await import("/static/js/estate-shell.js?v=20260723-interface-v1");
  await import("/static/js/estate-search/global-search.js");
}

void installLabShell();

export { GLOBAL_ROUTES, LAB_ROUTES, normalizePath };
