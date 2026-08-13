"use strict";

const STYLESHEET = "/lab/shared/flagship-counterparts.css?v=20260813-spectral-forge";
const ROUTES = Object.freeze({
  "/lab/system-symphony/": Object.freeze({
    href: "/lab/spectral-forge/",
    title: "Spectral Forge",
    thesis: "Design how a system becomes sound.",
    source: "System SYMPHONY",
  }),
  "/lab/spectral-forge/": Object.freeze({
    href: "/lab/system-symphony/",
    title: "System SYMPHONY",
    thesis: "Listen to a system.",
    source: "Spectral Forge",
  }),
});

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function ensureStylesheet() {
  if (document.head.querySelector(`link[href^="${STYLESHEET.split("?")[0]}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  document.head.appendChild(link);
}

function insertionAnchor(pathname) {
  if (pathname === "/lab/spectral-forge/") return document.querySelector(".forge-product-header");
  if (pathname === "/lab/system-symphony/") {
    return document.querySelector("[data-symphony-product-bar]")
      ?? document.querySelector("[data-symphony-flagship]");
  }
  return null;
}

export function installFlagshipCounterpart() {
  const pathname = normalizePath(window.location.pathname);
  const counterpart = ROUTES[pathname];
  if (!counterpart || document.querySelector("[data-flagship-counterpart]")) return null;
  const anchor = insertionAnchor(pathname);
  if (!anchor) return null;

  ensureStylesheet();
  const aside = document.createElement("aside");
  aside.className = "lab-flagship-counterpart";
  aside.dataset.flagshipCounterpart = "";
  aside.setAttribute("aria-label", `${counterpart.source} counterpart`);

  const label = document.createElement("span");
  label.className = "lab-flagship-counterpart__label";
  label.textContent = "Audio counterpart";

  const link = document.createElement("a");
  link.className = "lab-flagship-counterpart__link";
  link.href = counterpart.href;

  const title = document.createElement("strong");
  title.textContent = counterpart.title;
  const thesis = document.createElement("span");
  thesis.textContent = counterpart.thesis;
  const route = document.createElement("span");
  route.className = "lab-flagship-counterpart__route";
  route.textContent = "Open counterpart →";
  link.append(title, thesis, route);
  aside.append(label, link);
  anchor.insertAdjacentElement("afterend", aside);
  return aside;
}
