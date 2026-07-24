"use strict";

import {
  STATUS_ENDPOINT,
  STATUS_LABELS,
  STATUS_PAGE,
  parseEstateStatus,
} from "./estate-status.js";

const STATUS_TIMEOUT_MS = 6_000;
const KIT_STYLESHEET = "/static/vendor/atlas-interface/v0.2.0/atlas-interface-kit.css";
const SHELL_STYLESHEET = "/static/css/estate-shell.css?v=20260723-interface-v2";

const GLOBAL_ROUTES = Object.freeze([
  { label: "Work", href: "/work/" },
  { label: "Writing", href: "/writing/" },
  { label: "Lab", href: "/lab/" },
  { label: "Systems", href: "/systems/" },
  { label: "About", href: "/about/" },
]);

const ATLAS_OWNED_HOSTS = new Set([
  "api.atlas-systems.uk",
  "atlas-systems.uk",
  "cv.atlas-systems.uk",
  "ramone.atlas-systems.uk",
  "status.atlas-systems.uk",
]);

const ICON_LINKS = [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", href: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
  { rel: "icon", href: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  { rel: "manifest", href: "/site.webmanifest" },
];

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function normalizeAtlasTitle(value) {
  const title = String(value || "").trim();
  if (!title || title === "Atlas Systems") return title;
  if (title.endsWith(" // Atlas Systems")) return title;
  const atlasFirst = title.match(/^Atlas Systems\s*(?:\/\/|—|-)\s*(.+)$/);
  if (atlasFirst) return `${atlasFirst[1].trim()} // Atlas Systems`;
  const pageFirst = title.match(/^(.+?)\s*(?:—|-)\s*Atlas Systems$/);
  if (pageFirst) return `${pageFirst[1].trim()} // Atlas Systems`;
  return title;
}

function normalizePageMetadata() {
  const title = normalizeAtlasTitle(document.title);
  if (!title) return;
  document.title = title;
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    const meta = document.head.querySelector(selector);
    if (meta) meta.content = title;
  }
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function ensureIcons() {
  for (const definition of ICON_LINKS) {
    const selector = `link[rel="${definition.rel}"][href="${definition.href}"]`;
    if (document.head.querySelector(selector)) continue;
    const link = document.createElement("link");
    for (const [name, value] of Object.entries(definition)) link.setAttribute(name, value);
    document.head.appendChild(link);
  }
}

function isHttpUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

function normalizeLink(anchor) {
  if (typeof HTMLAnchorElement === "undefined" || !(anchor instanceof HTMLAnchorElement)) return;
  if (!anchor.hasAttribute("href") || anchor.hasAttribute("download")) return;
  const raw = anchor.getAttribute("href").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return;

  let url;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  if (!isHttpUrl(url)) return;

  if (ATLAS_OWNED_HOSTS.has(url.hostname)) {
    anchor.removeAttribute("target");
    const remaining = (anchor.getAttribute("rel") || "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((value) => value !== "noopener" && value !== "noreferrer");
    if (remaining.length) anchor.setAttribute("rel", remaining.join(" "));
    else anchor.removeAttribute("rel");
    return;
  }

  anchor.target = "_blank";
  const relations = new Set((anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
  relations.add("noopener");
  relations.add("noreferrer");
  anchor.rel = Array.from(relations).join(" ");
}

function normalizeLinks(root) {
  if (typeof HTMLAnchorElement !== "undefined" && root instanceof HTMLAnchorElement) normalizeLink(root);
  if (typeof Element === "undefined" || typeof Document === "undefined") return;
  if (!(root instanceof Element || root instanceof Document)) return;
  root.querySelectorAll("a[href]").forEach(normalizeLink);
}

function replaceHeading(element, tagName) {
  const replacement = document.createElement(tagName);
  for (const attribute of element.attributes) {
    replacement.setAttribute(attribute.name, attribute.value);
  }
  replacement.append(...element.childNodes);
  element.replaceWith(replacement);
  return replacement;
}

function normalizeLegacySemantics(root = document) {
  if (!(root instanceof Element || root instanceof Document)) return;

  if (normalizePath(window.location.pathname) === "/lab/console/") {
    const ramoneHeading = document.getElementById("ramone-greet");
    if (ramoneHeading?.tagName === "H1") replaceHeading(ramoneHeading, "h2");
  }

  const maps = [];
  if (root instanceof Element && root.matches(".smap-city-svg[role='img']")) maps.push(root);
  maps.push(...root.querySelectorAll(".smap-city-svg[role='img']"));
  for (const map of maps) {
    map.setAttribute("role", "group");
    map.setAttribute("aria-label", "Interactive district map of the Atlas Systems estate");
  }
}

function observeDynamicContent() {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        normalizeLinks(node);
        normalizeLegacySemantics(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function findPrimaryNav() {
  return document.querySelector('nav[aria-label="Primary navigation"]') || document.querySelector("body > nav");
}

function findWordmark(nav) {
  return nav.querySelector(".nav-wordmark, .wordmark, [data-atlas-wordmark]");
}

function createWordmark() {
  const link = document.createElement("a");
  link.href = "/";
  link.className = "nav-wordmark atlas-wordmark";
  link.dataset.atlasWordmark = "";
  link.append("Atlas");
  const cursor = document.createElement("span");
  cursor.className = "atlas-wordmark__cursor";
  cursor.textContent = "_";
  link.append(cursor, "Systems");
  return link;
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

function currentRouteLabel() {
  const path = normalizePath(window.location.pathname);
  return GLOBAL_ROUTES.find((route) => path === route.href || (route.href !== "/" && path.startsWith(route.href)))?.label || null;
}

function createRouteNav() {
  const container = document.createElement("div");
  container.className = "atlas-header__nav atlas-global-header__nav";
  container.setAttribute("aria-label", "Atlas Systems sections");
  const current = currentRouteLabel();
  for (const route of GLOBAL_ROUTES) {
    const link = document.createElement("a");
    link.className = "atlas-global-header__link";
    link.href = route.href;
    link.textContent = route.label;
    if (route.label === current) link.setAttribute("aria-current", "page");
    container.appendChild(link);
  }
  return container;
}

function createAggregateStatus() {
  const chip = document.createElement("a");
  chip.className = "nav-status atlas-status atlas-estate-status";
  chip.href = STATUS_PAGE;
  chip.dataset.state = "checking";
  chip.dataset.atlasStatus = "";
  chip.setAttribute("aria-label", "Atlas Systems status: Checking");
  const dot = document.createElement("span");
  dot.className = "status-dot atlas-status__dot";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "atlas-estate-status-label";
  label.dataset.atlasStatusLabel = "";
  label.textContent = STATUS_LABELS.checking;
  chip.append(dot, label);
  return chip;
}

function translateHomepageStatus(label) {
  const value = label.textContent.trim().toLowerCase();
  let publicLabel = null;
  if (value === "systems nominal" || value === "operational") publicLabel = "Operational";
  else if (/^\d+\/\d+ operational$/.test(value) || value === "degraded") publicLabel = "Degraded";
  else if (value === "major outage" || value === "unavailable") publicLabel = "Unavailable";
  else if (value.startsWith("checking")) publicLabel = "Checking";
  else if (value === "unknown") publicLabel = "Unknown";
  if (publicLabel && label.textContent !== publicLabel) label.textContent = publicLabel;
}

function preserveHomepageStatus(nav) {
  const status = nav.querySelector(".nav-status") || createAggregateStatus();
  status.classList.add("atlas-status", "atlas-estate-status");
  status.href = STATUS_PAGE;
  const dot = status.querySelector(".status-dot") || document.createElement("span");
  dot.classList.add("status-dot", "atlas-status__dot");
  dot.setAttribute("aria-hidden", "true");
  if (!dot.parentElement) status.prepend(dot);
  const label = status.querySelector("#nav-build-status, [data-atlas-status-label], .atlas-estate-status-label");
  if (label) {
    label.removeAttribute("id");
    label.dataset.atlasStatusLabel = "";
    label.classList.add("atlas-estate-status-label");
    translateHomepageStatus(label);
    new MutationObserver(() => translateHomepageStatus(label)).observe(label, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  return status;
}

function setStatus(chip, result) {
  chip.dataset.state = result.state;
  const dot = chip.querySelector(".status-dot");
  if (dot) dot.dataset.state = result.state;
  const label = chip.querySelector("[data-atlas-status-label], .atlas-estate-status-label");
  if (label) label.textContent = result.label;
  chip.setAttribute("aria-label", `Atlas Systems status: ${result.label}`);
  chip.title = result.detail;
}

async function refreshStatus(chip) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(STATUS_ENDPOINT, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setStatus(chip, parseEstateStatus(await response.json()));
  } catch {
    setStatus(chip, {
      state: "unknown",
      label: STATUS_LABELS.unknown,
      detail: "Status evidence could not be loaded.",
    });
  } finally {
    window.clearTimeout(timer);
  }
}

function installHeader() {
  const nav = findPrimaryNav();
  if (!nav) return;
  const isHomepage = normalizePath(window.location.pathname) === "/";
  const wordmark = findWordmark(nav) || createWordmark();
  wordmark.classList.add("atlas-wordmark");
  const status = isHomepage ? preserveHomepageStatus(nav) : createAggregateStatus();
  const search = nav.querySelector("[data-estate-search-open]") || createSearchButton();
  search.classList.add("atlas-search-control");

  const inner = document.createElement("div");
  inner.className = "atlas-header__inner";
  const brand = document.createElement("div");
  brand.className = "atlas-header__brand atlas-global-header__identity";
  brand.append(wordmark, status);
  const actions = document.createElement("div");
  actions.className = "atlas-header__actions atlas-global-header__actions";
  actions.append(search);
  inner.append(brand, createRouteNav(), actions);

  nav.replaceChildren(inner);
  nav.classList.add("atlas-header", "atlas-nav-shell", "atlas-global-header");
  nav.removeAttribute("style");
  void refreshStatus(status);
}

function mobileIcon(label) {
  const paths = {
    Work: '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',
    Writing: '<path d="M4 4h16v16H4z"></path><line x1="8" y1="9" x2="16" y2="9"></line><line x1="8" y1="13" x2="16" y2="13"></line>',
    Lab: '<path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9"></path><path d="M14 3h7v7"></path>',
    Systems: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>',
    About: '<circle cx="12" cy="8" r="4"></circle><path d="M20 21a8 8 0 10-16 0"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[label]}</svg>`;
}

function installMobileNavigation() {
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
  const current = currentRouteLabel();
  for (const route of GLOBAL_ROUTES) {
    const link = document.createElement("a");
    link.href = route.href;
    link.className = "mobile-nav-item atlas-mobile-nav__item";
    link.innerHTML = `${mobileIcon(route.label)}<span>${route.label}</span>`;
    if (route.label === current) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
    inner.appendChild(link);
  }
  nav.replaceChildren(inner);
}

function install() {
  document.documentElement.setAttribute("data-atlas-interface", "");
  normalizePageMetadata();
  ensureStylesheet(KIT_STYLESHEET);
  ensureStylesheet(SHELL_STYLESHEET);
  ensureIcons();
  installHeader();
  installMobileNavigation();
  normalizeLinks(document);
  normalizeLegacySemantics(document);
  observeDynamicContent();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

export {
  ATLAS_OWNED_HOSTS,
  GLOBAL_ROUTES,
  normalizeAtlasTitle,
  normalizeLegacySemantics,
  normalizeLink,
  normalizeLinks,
  preserveHomepageStatus,
};
