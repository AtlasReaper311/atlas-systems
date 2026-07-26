"use strict";

const TRACE_ROLE_STYLESHEET = "/lab/system-symphony/trace-role-bridge.css?v=20260726-phase-d-role-routing-v1";
const ROOT_ROUTE = "/lab/system-symphony/";
const PRODUCT_MODES = Object.freeze([
  { key: "play", label: "Play" },
  { key: "trace", label: "Trace" },
  { key: "replay", label: "Replay" },
]);
const ROLE_KEYS = Object.freeze([
  "clock",
  "pulse",
  "memory",
  "thermal",
  "signal",
  "contention",
  "recovery",
]);

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function modeHref(mode) {
  const key = PRODUCT_MODES.some((entry) => entry.key === mode) ? mode : "play";
  return key === "play" ? ROOT_ROUTE : `${ROOT_ROUTE}?symphonyMode=${key}`;
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function upgradeProductModeLinks() {
  if (typeof window === "undefined") return false;
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
  links.setAttribute("role", "tablist");
  links.setAttribute("aria-label", "System Symphony modes");
  links.style.display = "flex";
  links.style.alignItems = "center";
  links.style.gap = "6px";

  const controls = new Map();
  for (const mode of PRODUCT_MODES) {
    const control = tabs.querySelector(`[data-symphony-mode-tab="${mode.key}"]`);
    if (!control) continue;

    controls.set(mode.key, control);
    control.dataset.symphonyModeControl = mode.key;
    control.removeAttribute("data-symphony-mode-tab");

    const controlId = control.id || `symphony-mode-${mode.key}`;
    control.id = `${controlId}-control`;

    const link = document.createElement("a");
    link.id = controlId;
    link.className = "symphony-product-mode-link";
    link.href = modeHref(mode.key);
    link.textContent = mode.label;
    link.dataset.symphonyModeTab = mode.key;
    link.dataset.symphonyModeRoute = mode.key;
    link.setAttribute("role", "tab");
    link.setAttribute("aria-controls", control.getAttribute("aria-controls") || "");
    link.setAttribute("aria-selected", control.getAttribute("aria-selected") || "false");
    link.tabIndex = control.tabIndex;

    const panelId = link.getAttribute("aria-controls");
    if (panelId) document.getElementById(panelId)?.setAttribute("aria-labelledby", link.id);

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

  links.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const entries = [...links.querySelectorAll("[data-symphony-mode-tab]")];
    const current = entries.indexOf(document.activeElement);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = entries[(current + offset + entries.length) % entries.length];
    next?.focus();
    next?.click();
  });

  tabs.hidden = true;
  tabs.setAttribute("aria-hidden", "true");
  tabs.style.display = "none";
  (flagship.querySelector(".symphony-flagship__top") ?? flagship).appendChild(tabs);
  destinations.prepend(links);

  const sync = () => {
    const current = String(flagship.dataset.symphonyMode ?? "play").toLowerCase();
    for (const link of links.querySelectorAll("[data-symphony-mode-tab]")) {
      const selected = link.dataset.symphonyModeTab === current;
      link.setAttribute("aria-selected", String(selected));
      link.tabIndex = selected ? 0 : -1;
      if (selected) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(flagship, { attributes: true, attributeFilter: ["data-symphony-mode"] });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  sync();
  return true;
}

function roleKeyFromLabel(value) {
  const label = String(value ?? "").toLowerCase();
  if (label.includes("pulse")) return "pulse";
  if (label.includes("memory")) return "memory";
  if (label.includes("thermal")) return "thermal";
  if (label.includes("signal")) return "signal";
  if (label.includes("contention")) return "contention";
  if (label.includes("recovery")) return "recovery";
  return "";
}

function selectedRole() {
  const button = document.querySelector('[data-apu-role-highlight][aria-pressed="true"]');
  const role = button?.dataset.apuRoleHighlight ?? "";
  return ROLE_KEYS.includes(role) ? role : "";
}

function serviceIdentityForNode(node) {
  return node?.dataset.node?.trim() ?? "";
}

function displayIdentityForNode(node) {
  const title = node?.querySelector("title")?.textContent ?? "";
  return title.split(":", 1)[0].trim();
}

function serviceRoleMap(host) {
  const roles = new Map();
  for (const row of host.querySelectorAll("[data-service-table] tr")) {
    const serviceName = row.children[0]?.textContent?.trim() ?? "";
    const role = roleKeyFromLabel(row.children[4]?.textContent);
    if (!serviceName || !role) continue;
    roles.set(serviceName, role);
    row.dataset.apuRole = role;
  }
  return roles;
}

function decorateTopology(host, roles) {
  for (const node of host.querySelectorAll("[data-node]")) {
    const role = roles.get(serviceIdentityForNode(node))
      ?? roles.get(displayIdentityForNode(node))
      ?? "";
    if (role) node.dataset.apuRole = role;
    else delete node.dataset.apuRole;
  }
}

function clearRoleClasses(host) {
  for (const element of host.querySelectorAll(
    ".is-role-highlight, .is-role-dimmed, .is-role-route",
  )) {
    element.classList.remove("is-role-highlight", "is-role-dimmed", "is-role-route");
  }
}

function applyRoleRouting(host) {
  const roles = serviceRoleMap(host);
  decorateTopology(host, roles);
  clearRoleClasses(host);

  const role = selectedRole();
  if (!role) {
    delete host.dataset.traceRole;
    return;
  }

  host.dataset.traceRole = role;
  if (role === "clock") return;

  const matchingServices = new Set();
  for (const row of host.querySelectorAll("[data-service-table] tr")) {
    const matches = row.dataset.apuRole === role;
    row.classList.toggle("is-role-highlight", matches);
    row.classList.toggle("is-role-dimmed", !matches);
    if (matches) {
      const serviceName = row.children[0]?.textContent?.trim();
      if (serviceName) matchingServices.add(serviceName);
    }
  }

  for (const node of host.querySelectorAll("[data-node]")) {
    const matches = node.dataset.apuRole === role;
    node.classList.toggle("is-role-highlight", matches);
    node.classList.toggle("is-role-dimmed", !matches);
    if (matches) matchingServices.add(serviceIdentityForNode(node));
  }

  for (const edge of host.querySelectorAll(".symphony-edge")) {
    const connected = matchingServices.has(edge.dataset.from) || matchingServices.has(edge.dataset.to);
    edge.classList.toggle("is-role-route", connected);
    edge.classList.toggle("is-role-dimmed", !connected);
  }
}

function syncRoleFromSelectedService(host) {
  const selected = host.querySelector("[data-service-table] tr.is-selected");
  const role = selected?.dataset.apuRole ?? "";
  if (!role) return;
  const button = document.querySelector(`[data-apu-role-highlight="${role}"]`);
  if (button && button.getAttribute("aria-pressed") !== "true") button.click();
}

function installBridge(host) {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      applyRoleRouting(host);
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(host, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-apu-role-highlight]")) {
      window.requestAnimationFrame(() => applyRoleRouting(host));
      return;
    }
    if (!event.target.closest?.("[data-node], [data-service-table] tr")) return;
    window.requestAnimationFrame(() => {
      applyRoleRouting(host);
      syncRoleFromSelectedService(host);
    });
  });

  applyRoleRouting(host);
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  }, { once: true });
}

function initialiseTraceRoleBridge() {
  ensureStylesheet(TRACE_ROLE_STYLESHEET);
  upgradeProductModeLinks();
  const existing = document.getElementById("system-symphony-widget");
  if (existing) {
    installBridge(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const host = document.getElementById("system-symphony-widget");
    if (!host) return;
    observer.disconnect();
    installBridge(host);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== "undefined") initialiseTraceRoleBridge();

export { applyRoleRouting, modeHref, roleKeyFromLabel, upgradeProductModeLinks };
