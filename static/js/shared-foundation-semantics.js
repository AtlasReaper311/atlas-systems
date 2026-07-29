"use strict";

const BREADCRUMB_ROOTS = Object.freeze({
  "/lab/": "Lab",
  "/systems/": "Systems",
});

const BREADCRUMB_EXCLUSIONS = Object.freeze([
  "/lab/console/",
  "/lab/system-symphony/",
  "/writing/",
]);

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function pageLabel() {
  const title = String(document.title || "").trim();
  if (!title) return "Current page";
  return title.split(" // ", 1)[0].trim() || "Current page";
}

function breadcrumbRoot(pathname) {
  for (const [root, label] of Object.entries(BREADCRUMB_ROOTS)) {
    if (pathname !== root && pathname.startsWith(root)) return { root, label };
  }
  return null;
}

function breadcrumbsExcluded(pathname) {
  return BREADCRUMB_EXCLUSIONS.some((prefix) => pathname.startsWith(prefix));
}

function installBreadcrumbs() {
  const pathname = normalizePath(window.location.pathname);
  if (pathname === "/" || breadcrumbsExcluded(pathname)) return;
  const parent = breadcrumbRoot(pathname);
  if (!parent || document.querySelector(".atlas-breadcrumbs")) return;

  const main = document.querySelector("main");
  if (!main) return;

  const nav = document.createElement("nav");
  nav.className = "atlas-breadcrumbs";
  nav.setAttribute("aria-label", "Breadcrumb");
  nav.dataset.atlasGeneratedBreadcrumb = "true";

  const list = document.createElement("ol");
  const parentItem = document.createElement("li");
  const parentLink = document.createElement("a");
  parentLink.href = parent.root;
  parentLink.textContent = parent.label;
  parentItem.appendChild(parentLink);

  const currentItem = document.createElement("li");
  currentItem.setAttribute("aria-current", "page");
  currentItem.textContent = pageLabel();

  list.append(parentItem, currentItem);
  nav.appendChild(list);
  main.prepend(nav);
}

function ensureStatusAnnouncement() {
  let announcement = document.querySelector("[data-atlas-status-announcement]");
  if (announcement) return announcement;

  announcement = document.createElement("p");
  announcement.className = "atlas-status-announcement atlas-status-announcement--visually-hidden";
  announcement.dataset.atlasStatusAnnouncement = "true";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  document.body.appendChild(announcement);
  return announcement;
}

function installStatusAnnouncements() {
  const chip = document.querySelector("[data-atlas-status], .atlas-estate-status");
  const label = chip?.querySelector("[data-atlas-status-label], .atlas-estate-status-label");
  if (!chip || !label) return;

  chip.setAttribute("aria-live", "off");
  const announcement = ensureStatusAnnouncement();
  let previous = label.textContent.trim();
  let initialPollSettled = previous.toLowerCase() !== "checking";

  new MutationObserver(() => {
    const next = label.textContent.trim();
    if (!next || next === previous) return;
    previous = next;
    if (!initialPollSettled) {
      initialPollSettled = true;
      return;
    }
    announcement.textContent = `Atlas Systems status changed to ${next}.`;
  }).observe(label, { childList: true, characterData: true, subtree: true });
}

function generatedOverflowLabel(region) {
  const caption = region.querySelector("caption");
  if (caption?.textContent.trim()) return `Scrollable table: ${caption.textContent.trim()}`;

  const section = region.closest("section, article, main");
  const heading = section?.querySelector("h1, h2, h3, h4");
  if (heading?.textContent.trim()) return `Scrollable data for ${heading.textContent.trim()}`;

  return "Scrollable data region";
}

function updateDenseRegion(region) {
  const overflowing = region.scrollWidth > region.clientWidth + 1;
  if (overflowing) {
    region.dataset.overflow = "true";
    region.setAttribute("tabindex", "0");
    if (!region.hasAttribute("aria-label") && !region.hasAttribute("aria-labelledby")) {
      region.setAttribute("aria-label", region.dataset.overflowLabel || generatedOverflowLabel(region));
      region.dataset.atlasGeneratedOverflowLabel = "true";
    }
    return;
  }

  delete region.dataset.overflow;
  region.removeAttribute("tabindex");
  if (region.dataset.atlasGeneratedOverflowLabel === "true") {
    region.removeAttribute("aria-label");
    delete region.dataset.atlasGeneratedOverflowLabel;
  }
}

function denseRegions(root = document) {
  const regions = [];
  if (root instanceof Element && root.matches(".atlas-table-wrap, [data-atlas-dense-region]")) {
    regions.push(root);
  }
  if (root instanceof Element || root instanceof Document) {
    regions.push(...root.querySelectorAll(".atlas-table-wrap, [data-atlas-dense-region]"));
  }
  return regions;
}

function installDenseOverflow() {
  const tracked = new Set();
  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((entries) => entries.forEach(({ target }) => updateDenseRegion(target)));

  const register = (root) => {
    for (const region of denseRegions(root)) {
      if (tracked.has(region)) continue;
      tracked.add(region);
      updateDenseRegion(region);
      resizeObserver?.observe(region);
    }
  };

  register(document);
  window.addEventListener("resize", () => tracked.forEach(updateDenseRegion), { passive: true });
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) register(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

export function installSharedFoundationSemantics() {
  installBreadcrumbs();
  installStatusAnnouncements();
  installDenseOverflow();
}

export const SHARED_FOUNDATION_CONTRACT = Object.freeze({
  activeBundle: "0.3.0",
  foundationExtension: "1.0.0",
  reportingOnlyViewport: 1920,
});
