"use strict";

const TRACE_ROLE_STYLESHEET = "/lab/system-symphony/trace-role-bridge.css?v=20260726-phase-d-role-routing-v1";
const ROLE_KEYS = Object.freeze([
  "clock",
  "pulse",
  "memory",
  "thermal",
  "signal",
  "contention",
  "recovery",
]);

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
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
  const direct = node?.dataset.node?.trim();
  if (direct) return direct;
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
    const serviceName = serviceIdentityForNode(node);
    const role = roles.get(serviceName) ?? "";
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

initialiseTraceRoleBridge();

export { applyRoleRouting, roleKeyFromLabel };
