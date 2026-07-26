"use strict";

const ROOT_ROUTE = "/lab/system-symphony/";
const MODES = Object.freeze([
  { key: "play", label: "Play" },
  { key: "trace", label: "Trace" },
  { key: "replay", label: "Replay" },
]);

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function modeHref(mode) {
  const key = MODES.some((entry) => entry.key === mode) ? mode : "play";
  return key === "play" ? ROOT_ROUTE : `${ROOT_ROUTE}?symphonyMode=${key}`;
}

function installSystemSymphonyModeLinks() {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (normalizePath(window.location.pathname) !== ROOT_ROUTE) return false;

  const flagship = document.querySelector("[data-symphony-flagship]");
  const destinations = document.querySelector(
    "[data-symphony-product-bar] .symphony-product-bar__destinations",
  );
  const tabs = destinations?.querySelector(".symphony-mode-tabs");
  if (!flagship || !destinations || !tabs) return false;
  if (destinations.querySelector("[data-symphony-mode-links]")) return true;

  const links = document.createElement("div");
  links.className = "symphony-product-mode-links";
  links.dataset.symphonyModeLinks = "";
  links.setAttribute("aria-label", "System Symphony modes");

  for (const mode of MODES) {
    const control = tabs.querySelector(`[data-symphony-mode-tab="${mode.key}"]`);
    if (!control) continue;

    control.dataset.symphonyModeControl = mode.key;
    control.removeAttribute("data-symphony-mode-tab");

    const link = document.createElement("a");
    link.className = "symphony-product-mode-link";
    link.href = modeHref(mode.key);
    link.textContent = mode.label;
    link.dataset.symphonyModeTab = mode.key;
    link.dataset.symphonyModeRoute = mode.key;
    link.setAttribute("role", "tab");
    link.setAttribute("aria-controls", control.getAttribute("aria-controls") || "");
    link.setAttribute("aria-selected", control.getAttribute("aria-selected") || "false");
    link.tabIndex = control.tabIndex;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      control.click();
      window.requestAnimationFrame(() => {
        const active = String(flagship.dataset.symphonyMode ?? "play").toLowerCase();
        if (active !== mode.key) window.location.assign(link.href);
      });
    });
    links.appendChild(link);
  }

  tabs.hidden = true;
  tabs.setAttribute("aria-hidden", "true");
  tabs.style.display = "none";
  (flagship.querySelector(".symphony-flagship__top") ?? flagship).appendChild(tabs);
  destinations.prepend(links);

  const syncCurrentMode = () => {
    const current = String(flagship.dataset.symphonyMode ?? "play").toLowerCase();
    for (const link of links.querySelectorAll("[data-symphony-mode-route]")) {
      const selected = link.dataset.symphonyModeRoute === current;
      link.setAttribute("aria-selected", String(selected));
      link.tabIndex = selected ? 0 : -1;
      if (selected) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  };

  const observer = new MutationObserver(syncCurrentMode);
  observer.observe(flagship, { attributes: true, attributeFilter: ["data-symphony-mode"] });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  syncCurrentMode();
  return true;
}

if (typeof document !== "undefined") installSystemSymphonyModeLinks();

export { installSystemSymphonyModeLinks, modeHref, normalizePath };
