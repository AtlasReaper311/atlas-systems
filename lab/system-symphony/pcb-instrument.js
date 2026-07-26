"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const PCB_STYLESHEET = "/lab/system-symphony/pcb-instrument.css?v=20260726-phase5-pcb-v1";
const ROLE_ORDER = Object.freeze([
  "clock",
  "pulse",
  "signal",
  "recovery",
  "thermal",
  "contention",
  "memory",
]);
const ROLE_LABELS = Object.freeze({
  clock: "CLOCK",
  pulse: "PULSE",
  signal: "SIGNAL",
  recovery: "RECOVERY",
  thermal: "THERMAL",
  contention: "CONTENTION",
  memory: "MEMORY",
});
const ROLE_ZONES = Object.freeze({
  clock: { x: 600, y: 112 },
  pulse: { x: 910, y: 188 },
  signal: { x: 1010, y: 400 },
  recovery: { x: 850, y: 610 },
  thermal: { x: 350, y: 610 },
  contention: { x: 190, y: 400 },
  memory: { x: 290, y: 188 },
});
const APU_CENTER = Object.freeze({ x: 600, y: 378 });

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function ensureStylesheet(href) {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function roleFromText(value) {
  const text = String(value ?? "").toLowerCase();
  if (/pulse|lead|arp/.test(text)) return "pulse";
  if (/contention|counter|diagnostic|fm/.test(text)) return "contention";
  if (/thermal|bass|triangle|foundation/.test(text)) return "thermal";
  if (/signal|noise|drum|hat|rhythm/.test(text)) return "signal";
  if (/memory|pad|carrier|wavetable/.test(text)) return "memory";
  if (/recovery|event|accent|deploy|incident/.test(text)) return "recovery";
  return "signal";
}

function nodeRole(node) {
  return node.dataset.apuRole || roleFromText(node.getAttribute("aria-label"));
}

function nodeIdentity(node) {
  return node.dataset.node || node.querySelector("title")?.textContent?.split(":", 1)[0] || "component";
}

function servicePositions(nodes, zone) {
  const positions = new Map();
  const count = nodes.length;
  if (count === 0) return positions;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const xGap = count > 4 ? 82 : 94;
  const yGap = 64;
  nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(nodeIdentity(node), {
      x: zone.x + (column - (columns - 1) / 2) * xGap,
      y: zone.y + 28 + (row - (rows - 1) / 2) * yGap,
    });
  });
  return positions;
}

function createBoardLayer() {
  const layer = svgElement("g", { class: "pcb-board-layer", "data-pcb-board-layer": "" });
  layer.append(
    svgElement("rect", { class: "pcb-board", x: 18, y: 18, width: 1164, height: 704, rx: 28 }),
    svgElement("path", { class: "pcb-board-cut", d: "M 18 122 H 58 V 92 H 124 V 18 M 1076 18 V 92 H 1142 V 122 H 1182" }),
  );

  for (const [x, y] of [[58, 58], [1142, 58], [58, 682], [1142, 682]]) {
    const mount = svgElement("g", { class: "pcb-mount", transform: `translate(${x} ${y})` });
    mount.append(svgElement("circle", { r: 13 }), svgElement("circle", { r: 4 }));
    layer.appendChild(mount);
  }

  const title = svgElement("text", { class: "pcb-silkscreen pcb-silkscreen--title", x: 72, y: 78 });
  title.textContent = "ATLAS SYSTEMS // APU-01 DIAGNOSTIC MAINBOARD";
  const revision = svgElement("text", { class: "pcb-silkscreen", x: 72, y: 99 });
  revision.textContent = "REV 2026.07 // READ-ONLY TELEMETRY // SAMPLE-FREE";
  layer.append(title, revision);

  const romSlot = svgElement("g", { class: "pcb-rom-slot", transform: "translate(510 40)" });
  romSlot.append(
    svgElement("rect", { x: 0, y: 0, width: 180, height: 46, rx: 5 }),
    svgElement("rect", { class: "pcb-rom-slot__mouth", x: 16, y: 13, width: 148, height: 18, rx: 2 }),
  );
  const romLabel = svgElement("text", { x: 90, y: 29, "text-anchor": "middle" });
  romLabel.textContent = "ROM CARTRIDGE SLOT";
  romSlot.appendChild(romLabel);
  layer.appendChild(romSlot);

  const connector = svgElement("g", { class: "pcb-edge-connector", transform: "translate(342 692)" });
  for (let index = 0; index < 24; index += 1) {
    connector.appendChild(svgElement("rect", { x: index * 22, y: 0, width: 13, height: 26, rx: 1 }));
  }
  layer.appendChild(connector);

  for (const [label, x, y] of [
    ["TP-CLK", 468, 154], ["TP-BUS", 718, 154], ["TP-AUD", 760, 520],
    ["TP-MEM", 410, 520], ["TP-ROM", 722, 80], ["TP-PWR", 104, 640],
  ]) {
    const testPoint = svgElement("g", { class: "pcb-test-point", transform: `translate(${x} ${y})` });
    testPoint.append(svgElement("circle", { r: 6 }));
    const text = svgElement("text", { x: 10, y: 3 });
    text.textContent = label;
    testPoint.appendChild(text);
    layer.appendChild(testPoint);
  }
  return layer;
}

function createApuPackage() {
  const group = svgElement("g", {
    class: "pcb-apu-package",
    transform: `translate(${APU_CENTER.x} ${APU_CENTER.y})`,
    "data-pcb-apu": "",
  });
  group.append(
    svgElement("rect", { class: "pcb-apu-shadow", x: -111, y: -82, width: 222, height: 164, rx: 12 }),
    svgElement("rect", { class: "pcb-apu-body", x: -102, y: -74, width: 204, height: 148, rx: 9 }),
  );
  for (let index = 0; index < 11; index += 1) {
    const offset = -84 + index * 17;
    group.append(
      svgElement("line", { class: "pcb-apu-pin", x1: offset, y1: -90, x2: offset, y2: -74 }),
      svgElement("line", { class: "pcb-apu-pin", x1: offset, y1: 74, x2: offset, y2: 90 }),
    );
  }
  for (let index = 0; index < 7; index += 1) {
    const offset = -51 + index * 17;
    group.append(
      svgElement("line", { class: "pcb-apu-pin", x1: -118, y1: offset, x2: -102, y2: offset }),
      svgElement("line", { class: "pcb-apu-pin", x1: 102, y1: offset, x2: 118, y2: offset }),
    );
  }
  const label = svgElement("text", { class: "pcb-apu-label", y: -8, "text-anchor": "middle" });
  label.textContent = "ATLAS APU";
  const sublabel = svgElement("text", { class: "pcb-apu-sublabel", y: 17, "text-anchor": "middle" });
  sublabel.textContent = "7-BUS GENERATIVE PROCESSOR";
  const state = svgElement("text", { class: "pcb-apu-state", y: 43, "text-anchor": "middle", "data-pcb-apu-state": "" });
  state.textContent = "AWAITING FRAME";
  group.append(label, sublabel, state);

  const heatsink = svgElement("g", { class: "pcb-heatsink" });
  for (let index = -4; index <= 4; index += 1) {
    heatsink.appendChild(svgElement("line", { x1: index * 16, y1: -56, x2: index * 16, y2: 56 }));
  }
  group.appendChild(heatsink);
  return group;
}

function createRoleBuses() {
  const group = svgElement("g", { class: "pcb-role-buses", "data-pcb-role-buses": "" });
  for (const role of ROLE_ORDER) {
    const zone = ROLE_ZONES[role];
    const dx = zone.x - APU_CENTER.x;
    const direction = Math.sign(dx || 1);
    const bend = Math.min(78, Math.max(34, Math.abs(dx) * 0.23));
    const path = svgElement("path", {
      class: "pcb-role-bus",
      d: `M ${APU_CENTER.x + direction * 112} ${APU_CENTER.y} H ${APU_CENTER.x + direction * (112 + bend)} L ${zone.x - direction * bend} ${zone.y} H ${zone.x}`,
      "data-role": role,
    });
    group.appendChild(path);

    const socket = svgElement("g", { class: "pcb-role-socket", transform: `translate(${zone.x} ${zone.y - 38})`, "data-role": role });
    socket.append(svgElement("rect", { x: -50, y: -14, width: 100, height: 28, rx: 4 }));
    const text = svgElement("text", { y: 4, "text-anchor": "middle" });
    text.textContent = `${ROLE_LABELS[role]} BUS`;
    socket.appendChild(text);
    group.appendChild(socket);
  }
  return group;
}

function routePath(from, to) {
  const direction = Math.sign(to.x - from.x || 1);
  const bend = Math.min(72, Math.max(28, Math.abs(to.x - from.x) * 0.22));
  return `M ${from.x} ${from.y} H ${from.x + direction * bend} L ${to.x - direction * bend} ${to.y} H ${to.x}`;
}

function chipGeometry(node, role, pinned) {
  if (node.querySelector(".pcb-chip__body")) return;
  node.classList.add("pcb-chip");
  node.dataset.apuRole = role;
  if (pinned) node.classList.add("is-pinned");

  const title = node.querySelector("title");
  const firstGraphic = title?.nextSibling ?? node.firstChild;
  const body = svgElement("rect", { class: "pcb-chip__body", x: -40, y: -18, width: 80, height: 36, rx: 4 });
  node.insertBefore(body, firstGraphic);

  const pins = svgElement("g", { class: "pcb-chip__pins", "aria-hidden": "true" });
  for (const y of [-12, -4, 4, 12]) {
    pins.append(
      svgElement("line", { x1: -48, y1: y, x2: -40, y2: y }),
      svgElement("line", { x1: 40, y1: y, x2: 48, y2: y }),
    );
  }
  node.insertBefore(pins, body.nextSibling);

  const led = svgElement("circle", { class: "pcb-chip__led", cx: 31, cy: -10, r: 3 });
  node.appendChild(led);
  const roleText = svgElement("text", { class: "pcb-chip__role", y: 29, "text-anchor": "middle" });
  roleText.textContent = ROLE_LABELS[role] ?? "SERVICE";
  node.appendChild(roleText);
  const serviceText = node.querySelector(":scope > text:not(.pcb-chip__role)");
  if (serviceText) {
    serviceText.setAttribute("y", "4");
    serviceText.setAttribute("text-anchor", "middle");
    serviceText.classList.add("pcb-chip__label");
  }
}

function replaceDependencyLines(topology, positions) {
  for (const line of [...topology.querySelectorAll("line.symphony-edge")]) {
    const from = positions.get(line.dataset.from);
    const to = positions.get(line.dataset.to);
    if (!from || !to) continue;
    const path = svgElement("path", {
      class: line.getAttribute("class") || "symphony-edge",
      d: routePath(from, to),
      "data-from": line.dataset.from,
      "data-to": line.dataset.to,
      "marker-end": line.getAttribute("marker-end") || "url(#symphony-arrow)",
    });
    line.replaceWith(path);
  }
}

function installBoardChrome(host, topology, pinnedServices) {
  topology.setAttribute("viewBox", "0 0 1200 740");
  topology.setAttribute("aria-label", "Atlas APU motherboard with service chips and declared dependency traces");
  topology.classList.add("pcb-topology");

  const defs = topology.querySelector("defs");
  const board = createBoardLayer();
  defs?.insertAdjacentElement("afterend", board) ?? topology.prepend(board);
  board.insertAdjacentElement("afterend", createRoleBuses());
  topology.appendChild(createApuPackage());

  const nodes = [...topology.querySelectorAll("[data-node]:not(.symphony-node--external)")];
  const externalNodes = [...topology.querySelectorAll(".symphony-node--external[data-node]")];
  const byRole = new Map(ROLE_ORDER.map((role) => [role, []]));
  for (const node of nodes) byRole.get(nodeRole(node))?.push(node);

  const positions = new Map();
  for (const role of ROLE_ORDER) {
    const roleNodes = byRole.get(role).sort((left, right) => nodeIdentity(left).localeCompare(nodeIdentity(right)));
    const rolePositions = servicePositions(roleNodes, ROLE_ZONES[role]);
    for (const node of roleNodes) {
      const identity = nodeIdentity(node);
      const position = rolePositions.get(identity);
      if (!position) continue;
      positions.set(identity, position);
      node.setAttribute("transform", `translate(${position.x} ${position.y})`);
      chipGeometry(node, role, pinnedServices.has(identity));
    }
  }

  externalNodes.forEach((node, index) => {
    const position = { x: 180 + index * Math.min(150, 840 / Math.max(1, externalNodes.length - 1)), y: 666 };
    const identity = nodeIdentity(node);
    positions.set(identity, position);
    node.setAttribute("transform", `translate(${position.x} ${position.y})`);
    node.classList.add("pcb-external-port");
  });

  replaceDependencyLines(topology, positions);
  topology.dataset.pcbReady = "true";
  host.classList.add("has-pcb-instrument");
}

function createToolbar(host, topology, pinnedServices) {
  const visual = topology.closest(".symphony-visual");
  if (!visual || visual.querySelector("[data-pcb-toolbar]")) return;

  const toolbar = document.createElement("div");
  toolbar.className = "pcb-toolbar";
  toolbar.dataset.pcbToolbar = "";
  toolbar.innerHTML = `
    <div class="pcb-toolbar__identity">
      <span>ATLAS APU // MAINBOARD</span>
      <strong data-pcb-selection>No chip selected</strong>
    </div>
    <div class="pcb-toolbar__actions">
      <button type="button" data-pcb-pin disabled>Pin chip</button>
      <button type="button" data-pcb-solo disabled>Solo chip</button>
      <button type="button" data-pcb-mute disabled>Mute chip</button>
      <button type="button" data-pcb-clear disabled>Clear pins</button>
    </div>
    <div class="pcb-compare-tray" data-pcb-compare aria-live="polite">Comparison bus empty</div>
  `;
  visual.prepend(toolbar);

  const selection = toolbar.querySelector("[data-pcb-selection]");
  const pinButton = toolbar.querySelector("[data-pcb-pin]");
  const clearButton = toolbar.querySelector("[data-pcb-clear]");
  const soloButton = toolbar.querySelector("[data-pcb-solo]");
  const muteButton = toolbar.querySelector("[data-pcb-mute]");
  const compare = toolbar.querySelector("[data-pcb-compare]");

  const selectedNode = () => topology.querySelector("[data-node].is-selected");
  const refresh = () => {
    const selected = selectedNode();
    const identity = selected ? nodeIdentity(selected) : "";
    selection.textContent = identity || "No chip selected";
    pinButton.disabled = !identity;
    pinButton.textContent = identity && pinnedServices.has(identity) ? "Unpin chip" : "Pin chip";
    clearButton.disabled = pinnedServices.size === 0;
    const demoAvailable = host.dataset.source === "demo" && Boolean(identity);
    soloButton.disabled = !demoAvailable;
    muteButton.disabled = !demoAvailable;
    compare.textContent = pinnedServices.size
      ? `Comparison bus: ${[...pinnedServices].join(" ↔ ")}`
      : "Comparison bus empty";
    for (const node of topology.querySelectorAll("[data-node]")) {
      node.classList.toggle("is-pinned", pinnedServices.has(nodeIdentity(node)));
    }
  };

  pinButton.addEventListener("click", () => {
    const selected = selectedNode();
    if (!selected) return;
    const identity = nodeIdentity(selected);
    if (pinnedServices.has(identity)) pinnedServices.delete(identity);
    else {
      if (pinnedServices.size >= 2) pinnedServices.delete(pinnedServices.values().next().value);
      pinnedServices.add(identity);
    }
    refresh();
  });
  clearButton.addEventListener("click", () => {
    pinnedServices.clear();
    refresh();
  });
  soloButton.addEventListener("click", () => host.querySelector("[data-demo-solo]")?.click());
  muteButton.addEventListener("click", () => host.querySelector("[data-demo-mute]")?.click());
  topology.addEventListener("click", () => window.requestAnimationFrame(refresh));
  const observer = new MutationObserver(refresh);
  observer.observe(host, { attributes: true, attributeFilter: ["data-source", "data-running"] });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  refresh();
}

function createMobileModules(topology) {
  const visual = topology.closest(".symphony-visual");
  if (!visual || visual.querySelector("[data-pcb-mobile-modules]")) return;
  const container = document.createElement("div");
  container.className = "pcb-mobile-modules";
  container.dataset.pcbMobileModules = "";
  container.setAttribute("aria-label", "Atlas APU role modules");

  for (const role of ROLE_ORDER) {
    const nodes = [...topology.querySelectorAll(`[data-node][data-apu-role="${role}"]`)];
    if (role !== "clock" && nodes.length === 0) continue;
    const section = document.createElement("section");
    const heading = document.createElement("h4");
    heading.textContent = `${ROLE_LABELS[role]} BUS`;
    const list = document.createElement("div");
    for (const node of nodes) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = nodeIdentity(node);
      button.addEventListener("click", () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      list.appendChild(button);
    }
    if (nodes.length === 0) {
      const empty = document.createElement("span");
      empty.textContent = "Master timing network";
      list.appendChild(empty);
    }
    section.append(heading, list);
    container.appendChild(section);
  }
  topology.insertAdjacentElement("afterend", container);
}

function syncBoardState(host, topology) {
  const state = host.querySelector('[data-metric="state"]')?.textContent?.trim() || "Unknown";
  const stateNode = topology.querySelector("[data-pcb-apu-state]");
  if (stateNode) stateNode.textContent = state.toUpperCase();
  topology.dataset.pcbState = state.split("/")[0].trim().toLowerCase();
  topology.classList.toggle("is-audible", host.dataset.running === "1");
}

function enhanceTopology(host, topology, pinnedServices) {
  if (!topology.querySelector("[data-node]")) return;
  if (!topology.querySelector("[data-pcb-board-layer]")) {
    installBoardChrome(host, topology, pinnedServices);
    createToolbar(host, topology, pinnedServices);
    createMobileModules(topology);
  }
  syncBoardState(host, topology);
}

function installPcbInstrument(host) {
  const topology = host.querySelector("[data-topology]");
  if (!topology) return false;
  const pinnedServices = new Set();
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      enhanceTopology(host, topology, pinnedServices);
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(topology, { childList: true, subtree: true });
  const hostObserver = new MutationObserver(schedule);
  hostObserver.observe(host, { attributes: true, attributeFilter: ["data-running", "data-source", "data-state"] });
  schedule();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    hostObserver.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  }, { once: true });
  return true;
}

function initialisePcbInstrument() {
  ensureStylesheet(PCB_STYLESHEET);
  const existing = document.getElementById("system-symphony-widget");
  if (existing && installPcbInstrument(existing)) return;
  const observer = new MutationObserver(() => {
    const host = document.getElementById("system-symphony-widget");
    if (!host || !installPcbInstrument(host)) return;
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== "undefined") initialisePcbInstrument();

export { ROLE_ORDER, ROLE_ZONES, nodeRole, roleFromText, routePath, servicePositions };
