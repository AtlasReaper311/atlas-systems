"use strict";

const TRACE_ROLE_STYLESHEET = "/lab/system-symphony/trace-role-bridge.css?v=20260728-system-symphony-trace-board-v1";
const ROLE_KEYS = Object.freeze([
  "clock",
  "pulse",
  "memory",
  "thermal",
  "signal",
  "contention",
  "recovery",
]);
const ROLE_LABELS = Object.freeze({
  "": "All",
  clock: "Clock",
  pulse: "Pulse",
  memory: "Memory",
  thermal: "Thermal",
  signal: "Signal",
  contention: "Contention",
  recovery: "Recovery",
});
const SCORE_LAW_ROLES = new Set(["thermal", "signal", "contention", "recovery"]);

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
  const button = document.querySelector('button[data-apu-role-highlight][aria-pressed="true"]');
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

function roleCounts(host, roles) {
  const counts = new Map(ROLE_KEYS.map((role) => [role, 0]));
  counts.set("", host.querySelectorAll("[data-service-table] tr").length);
  for (const role of roles.values()) {
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return counts;
}

function updateRoleControls(host, roles) {
  const counts = roleCounts(host, roles);
  for (const button of document.querySelectorAll("button[data-apu-role-highlight]")) {
    const role = button.dataset.apuRoleHighlight ?? "";
    const label = ROLE_LABELS[role] ?? button.dataset.roleLabel ?? button.textContent.trim();
    const count = counts.get(role) ?? 0;
    const scoreLawOnly = SCORE_LAW_ROLES.has(role) && count === 0;
    const countText = role === "clock" ? "bus" : scoreLawOnly ? "law" : String(count);
    button.dataset.roleLabel = label;
    button.classList.toggle("is-role-empty", Boolean(role) && role !== "clock" && count === 0);
    button.classList.toggle("is-score-law-only", scoreLawOnly);
    button.replaceChildren();
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const countNode = document.createElement("strong");
    countNode.textContent = countText;
    button.append(labelNode, countNode);
    button.setAttribute(
      "aria-label",
      role
        ? `${label}, ${countText === "bus" ? "global clock bus" : scoreLawOnly ? "score law only, no service-owned chips" : `${count} service${count === 1 ? "" : "s"}`}`
        : `${label}, ${count} service${count === 1 ? "" : "s"}`,
    );
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
  updateRoleControls(host, roles);
  clearRoleClasses(host);
  delete host.dataset.traceRoleEmpty;

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
    if (matches) {
      const serviceName = row.children[0]?.textContent?.trim();
      if (serviceName) matchingServices.add(serviceName);
    }
  }

  if (matchingServices.size === 0) {
    host.dataset.traceRoleEmpty = "true";
    return;
  }

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
    if (event.target.closest?.("button[data-apu-role-highlight]")) {
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

if (typeof document !== "undefined") initialiseTraceRoleBridge();

export { applyRoleRouting, roleKeyFromLabel };
