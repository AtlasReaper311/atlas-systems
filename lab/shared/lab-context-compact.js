"use strict";

import {
  LAB_ROUTE_GROUPS,
  SYSTEM_SYMPHONY_SCOPED_ROUTES,
  isCurrentLabRoute,
  isSystemSymphonyPath,
  normalizePath,
} from "./shell.js";

const LAB_HOME_ROUTE = "/lab/";
const COMPACT_CONTEXT_STYLESHEET =
  "/lab/shared/lab-context-compact.css?v=20260806-lab-context-v1";

let contextAbortController = null;

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

function routePath(href) {
  return normalizePath(new URL(href, window.location.origin).pathname);
}

function currentRouteDescriptor(pathname = currentPath()) {
  if (isSystemSymphonyPath(pathname)) {
    const child = SYSTEM_SYMPHONY_SCOPED_ROUTES.find(
      ({ href }) => routePath(href) === pathname,
    );
    if (child) return child;
    return { label: "System Symphony", href: "/lab/system-symphony/" };
  }

  for (const group of LAB_ROUTE_GROUPS) {
    const route = group.routes.find(({ href }) => routePath(href) === pathname);
    if (route) return route;
  }

  const heading = document.querySelector("main h1")?.textContent?.trim();
  return {
    label: heading || document.title.split("//")[0].trim() || "Lab tool",
    href: pathname,
  };
}

function createRouteLink(route, pathname) {
  const link = document.createElement("a");
  link.href = route.href;
  link.textContent = route.label;
  if (isCurrentLabRoute(route, pathname)) link.setAttribute("aria-current", "page");
  return link;
}

function createGroupedInventory(pathname) {
  const inventory = document.createElement("div");
  inventory.className = "lab-context-tools__menu";
  inventory.setAttribute("aria-label", "All Lab tools");

  LAB_ROUTE_GROUPS.forEach((routeGroup, groupIndex) => {
    const group = document.createElement("div");
    group.className = "lab-context-tools__group";
    group.dataset.labContextGroup = routeGroup.label.toLowerCase();
    group.setAttribute("role", "group");

    const label = document.createElement("span");
    label.className = "lab-context-tools__group-label";
    label.id = `lab-context-tools-group-${groupIndex}`;
    label.textContent = routeGroup.label;
    group.setAttribute("aria-labelledby", label.id);

    const links = document.createElement("div");
    links.className = "lab-context-tools__links";
    for (const route of routeGroup.routes) {
      links.appendChild(createRouteLink(route, pathname));
    }

    group.append(label, links);
    inventory.appendChild(group);
  });

  return inventory;
}

function installContextBehavior(context, details, summary) {
  contextAbortController?.abort();
  contextAbortController = new AbortController();
  const { signal } = contextAbortController;

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (details.open && target && !details.contains(target)) details.open = false;
    },
    { signal },
  );

  context.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !details.open) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      summary.focus({ preventScroll: true });
    },
    { signal },
  );

  window.addEventListener(
    "pagehide",
    () => contextAbortController?.abort(),
    { once: true, signal },
  );
}

function installDirectoryMode(context) {
  context.classList.remove("lab-context-nav--compact");
  context.classList.add("lab-context-nav--directory");
  context.dataset.labContextMode = "directory";
}

function installCompactMode(context, pathname) {
  const descriptor = currentRouteDescriptor(pathname);
  const inner = document.createElement("div");
  inner.className = "lab-context-compact";

  const crumbs = document.createElement("div");
  crumbs.className = "lab-context-compact__crumbs";
  crumbs.setAttribute("aria-label", "Current Lab location");

  const home = document.createElement("a");
  home.href = LAB_HOME_ROUTE;
  home.textContent = "Lab";

  const separator = document.createElement("span");
  separator.className = "lab-context-compact__separator";
  separator.textContent = "/";
  separator.setAttribute("aria-hidden", "true");

  const current = document.createElement("span");
  current.className = "lab-context-compact__current";
  current.textContent = descriptor.label;
  current.setAttribute("aria-current", "page");

  crumbs.append(home, separator, current);

  const tools = document.createElement("details");
  tools.className = "lab-context-tools";
  const summary = document.createElement("summary");
  summary.textContent = "All Lab tools";
  tools.append(summary, createGroupedInventory(pathname));

  inner.append(crumbs, tools);
  context.replaceChildren(inner);
  context.classList.remove("lab-context-nav--directory");
  context.classList.add("lab-context-nav--compact");
  context.dataset.labContextMode = "compact";
  context.dataset.currentLabRoute = descriptor.label;
  installContextBehavior(context, tools, summary);
}

function installCompactLabContext(root = document) {
  const context = root.querySelector('.lab-context-nav[aria-label="Lab navigation"]');
  if (!context) return null;

  ensureStylesheet(COMPACT_CONTEXT_STYLESHEET);
  const pathname = currentPath();
  if (pathname === LAB_HOME_ROUTE) {
    installDirectoryMode(context);
    return context;
  }

  installCompactMode(context, pathname);
  return context;
}

export {
  COMPACT_CONTEXT_STYLESHEET,
  currentRouteDescriptor,
  installCompactLabContext,
};
