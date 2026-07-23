"use strict";

const STATUS_ENDPOINT = "https://api.atlas-systems.uk/v1/stats";
const STATUS_PAGE = "https://status.atlas-systems.uk/";
const STATUS_STALE_AFTER_MS = 1_200_000;
const STATUS_TIMEOUT_MS = 6_000;
const SHELL_STYLESHEET = "/static/css/estate-shell.css?v=20260723-interface-v1";

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

function ensureStylesheet() {
  if (document.querySelector(`link[href="${SHELL_STYLESHEET}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = SHELL_STYLESHEET;
  document.head.appendChild(link);
}

function ensureIcons() {
  for (const definition of ICON_LINKS) {
    const selector = `link[rel="${definition.rel}"][href="${definition.href}"]`;
    if (document.head.querySelector(selector)) continue;
    const link = document.createElement("link");
    for (const [name, value] of Object.entries(definition)) {
      link.setAttribute(name, value);
    }
    document.head.appendChild(link);
  }
}

function isHttpUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

function normalizeLink(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return;
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
  if (root instanceof HTMLAnchorElement) normalizeLink(root);
  if (!(root instanceof Element || root instanceof Document)) return;
  root.querySelectorAll("a[href]").forEach(normalizeLink);
}

function observeLinks() {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) normalizeLinks(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function findPrimaryNav() {
  return document.querySelector('nav[aria-label="Primary navigation"]') ||
    document.querySelector("body > nav");
}

function findWordmark(nav) {
  return nav.querySelector(".nav-wordmark, .wordmark, [data-atlas-wordmark]");
}

function ensureBrandCluster(nav, wordmark) {
  const existing = wordmark.closest(".atlas-brand-cluster");
  if (existing) return existing;
  const cluster = document.createElement("div");
  cluster.className = "atlas-brand-cluster";
  wordmark.before(cluster);
  cluster.appendChild(wordmark);
  return cluster;
}

function createStatusChip(cluster) {
  let chip = cluster.querySelector(".atlas-estate-status");
  if (chip) return chip;

  chip = document.createElement("a");
  chip.className = "atlas-estate-status";
  chip.href = STATUS_PAGE;
  chip.dataset.state = "checking";
  chip.setAttribute("aria-label", "Atlas Systems status: checking");

  const dot = document.createElement("span");
  dot.className = "atlas-estate-status-dot";
  dot.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "atlas-estate-status-label";
  label.textContent = "checking";

  chip.append(dot, label);
  cluster.appendChild(chip);
  return chip;
}

function setChipState(chip, state, detail) {
  chip.dataset.state = state;
  const label = chip.querySelector(".atlas-estate-status-label");
  if (label) label.textContent = state;
  chip.setAttribute("aria-label", `Atlas Systems status: ${state}`);
  chip.title = detail || `Atlas Systems status: ${state}`;
}

function parseStatus(data) {
  const estate = data && data.estate;
  const operational = Number(estate && estate.operational);
  const total = Number(estate && estate.total_components);
  const checkedAt = Date.parse(estate && estate.checked_at);

  if (!Number.isFinite(operational) || !Number.isFinite(total) || total <= 0 ||
      !Number.isFinite(checkedAt)) {
    return { state: "unknown", detail: "Status evidence is unavailable." };
  }

  const age = Date.now() - checkedAt;
  if (age < 0 || age > STATUS_STALE_AFTER_MS) {
    return {
      state: "unknown",
      detail: `Status evidence is stale. Last checked ${new Date(checkedAt).toISOString()}.`,
    };
  }

  if (operational === total) {
    return {
      state: "nominal",
      detail: `${operational} of ${total} monitored components operational.`,
    };
  }
  if (operational > total / 2) {
    return {
      state: "degraded",
      detail: `${operational} of ${total} monitored components operational.`,
    };
  }
  return {
    state: "unavailable",
    detail: `${operational} of ${total} monitored components operational.`,
  };
}

async function refreshStatusChip(chip) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(STATUS_ENDPOINT, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = parseStatus(await response.json());
    setChipState(chip, result.state, result.detail);
  } catch {
    setChipState(chip, "unknown", "Status evidence could not be loaded.");
  } finally {
    window.clearTimeout(timer);
  }
}

function installStatusChip() {
  if (window.location.hostname === "atlas-systems.uk" && window.location.pathname === "/") return;
  const nav = findPrimaryNav();
  if (!nav) return;
  const wordmark = findWordmark(nav);
  if (!wordmark) return;
  const cluster = ensureBrandCluster(nav, wordmark);
  const chip = createStatusChip(cluster);
  void refreshStatusChip(chip);
}

function install() {
  ensureStylesheet();
  ensureIcons();
  normalizeLinks(document);
  observeLinks();
  installStatusChip();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}

export { ATLAS_OWNED_HOSTS, normalizeLink, normalizeLinks, parseStatus };
