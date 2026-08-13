"use strict";

const ROUTE = "/lab/spectral-forge/";
const LABEL = "Spectral Forge";

function ensureProductLayout() {
  document.body.dataset.labLayout = "product";
  document.body.dataset.labRoute = "spectral-forge";
}

function ensureCurrentRouteInInventory() {
  const group = document.querySelector('.lab-context-tools__group[data-lab-context-group="experience"] .lab-context-tools__links');
  if (!group || group.querySelector(`a[href="${ROUTE}"]`)) return Boolean(group);
  const link = document.createElement("a");
  link.href = ROUTE;
  link.textContent = LABEL;
  link.setAttribute("aria-current", "page");
  group.appendChild(link);
  return true;
}

function install() {
  ensureProductLayout();
  if (ensureCurrentRouteInInventory()) return;
  const observer = new MutationObserver(() => {
    ensureProductLayout();
    if (!ensureCurrentRouteInInventory()) return;
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 5000);
}

install();
