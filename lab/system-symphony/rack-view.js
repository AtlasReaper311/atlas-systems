"use strict";

import { FIXED_SERVICES, NARROW_BREAKPOINT, ROLE_META, ROLE_ORDER, STATUS_TOKEN, cordPath, readEstate, routesForSelection } from "./rack-model.js?v=20260727-rack-b-v1";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}
function selectedRole() {
  const value = document.querySelector('[data-apu-role-highlight][aria-pressed="true"]')?.dataset.apuRoleHighlight || "";
  return ROLE_ORDER.includes(value) ? value : "";
}
function activateRole(role) { document.querySelector(`[data-apu-role-highlight="${role}"]`)?.click(); }
function activateService(host, id) {
  const item = readEstate(host).services.find((entry) => entry.id === id);
  if (item?.node && !item.external) item.node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  else item?.row?.querySelector("button")?.click();
}
function readout(kicker, value, detail, attrs = {}) {
  return el("div", { class: "rack-readout" }, [el("span", { class: "rack-kicker", text: kicker }),
    el("strong", { class: "rack-readout__value", text: value, ...attrs }),
    el("span", { class: "rack-readout__detail", text: detail, "data-freshness": attrs["data-freshness"] })]);
}
function controller(estate) {
  const fixed = estate.services.filter((item) => FIXED_SERVICES.includes(item.id) && !item.external);
  const counts = fixed.reduce((acc, item) => { const key = item.measured ? item.status : "unmeasured"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const measured = fixed.filter((item) => item.measured).length;
  return el("section", { class: "rack-controller", "aria-label": "Atlas APU rack controller" }, [
    readout("Controller", "ATLAS APU-01", "MODEL RK-7 / REV B / 7-BUS"),
    readout("Estate state", estate.state.key.toUpperCase(), `${counts.healthy || 0} healthy / ${counts.degraded || 0} degraded / ${counts.down || 0} down / ${counts.unknown || 0} unknown / ${counts.unmeasured || 0} unmeasured`, { "data-state": estate.state.key }),
    readout("Source", estate.source.label, estate.source.detail, { "data-source": estate.source.key, "data-freshness": estate.source.key }),
    readout("Audio bus", estate.running ? "RUNNING" : "IDLE", "Start Listening owns consent", { "data-running": estate.running ? "1" : "0" }),
    readout("Measured coverage", `${measured} / ${FIXED_SERVICES.length}`, `${measured} of ${FIXED_SERVICES.length} fixed services measured`),
  ]);
}
function chip(host, item, context) {
  const wrap = el("div", { class: "rack-chip", "data-rack-chip": item.id, "data-status": item.measured ? item.status : "unmeasured",
    "data-selected": context.selected === item.id ? "1" : "0", "data-dimmed": context.dimmed.has(item.id) ? "1" : "0",
    "data-route": context.out.has(item.id) ? "out" : context.inn.has(item.id) ? "in" : "none" });
  const button = el("button", { type: "button", class: "rack-chip__body", "aria-pressed": context.selected === item.id,
    "data-focus-key": `chip:${item.id}` }, [
    el("span", { class: "rack-chip__top" }, [el("strong", { class: "rack-chip__name", text: item.name }), el("i", { class: "rack-chip__led", "aria-hidden": "true" })]),
    el("span", { class: "rack-chip__tokens" }, [el("b", { class: "rack-chip__status", text: STATUS_TOKEN[item.measured ? item.status : "unmeasured"] }), el("span", { text: item.measured ? (context.stale ? "MEASURED / STALE" : "MEASURED") : "UNMEASURED" })]),
    el("span", { class: "rack-chip__facts", text: item.evidence || "no evidence source" }),
  ]);
  button.addEventListener("click", () => activateService(host, item.id));
  wrap.append(button);
  return wrap;
}
function lane(host, role, items, context) {
  const meta = ROLE_META[role];
  const select = el("button", { type: "button", class: "rack-lane__button", "aria-pressed": context.role === role,
    "data-focus-key": `role:${role}` }, [el("strong", { text: meta[0] }), el("span", { text: meta[1] }), el("small", { text: meta[2] })]);
  select.addEventListener("click", () => activateRole(role));
  const bay = el("div", { class: "rack-lane__bay" });
  if (role === "clock") for (const card of [["SONIFY", "~4 S POLL"], ["TOPOLOGY", "~5 MIN REFRESH"], ["DEPLOY", "~12 S REFRESH"]]) bay.append(el("div", { class: "rack-feed" }, [el("span", { text: card[0] }), el("strong", { text: card[1] })]));
  if (role === "recovery") bay.append(el("div", { class: "rack-feed" }, [el("span", { text: "DEPLOYMENT IDENTITY" }), el("strong", { text: host.querySelector('[data-metric="deployment"]')?.textContent?.trim() || "UNKNOWN" })]));
  for (const item of items) bay.append(chip(host, item, context));
  if (!items.length && role !== "clock" && role !== "recovery") bay.append(el("span", { class: "rack-empty", text: "No modules mapped. Nothing invented." }));
  return el("section", { class: "rack-lane", "data-role": role, "data-selected": context.role === role ? "1" : "0" }, [select, bay]);
}
function boundary(items, context) {
  if (!items.length) return null;
  return el("section", { class: "rack-boundary", "aria-label": "External topology boundary" }, [
    el("div", { class: "rack-boundary__plate" }, [el("strong", { text: "External boundary" }), el("span", { text: "Topology only. No health claim." })]),
    el("div", { class: "rack-boundary__ports" }, items.map((item) => el("div", { class: "rack-boundary__port", "data-rack-chip": item.id,
      "data-route": context.out.has(item.id) ? "out" : context.inn.has(item.id) ? "in" : "none", "data-dimmed": context.dimmed.has(item.id) ? "1" : "0" }, [el("strong", { text: item.name }), el("small", { text: "TOPOLOGY ONLY" })])))
  ]);
}
function facts(rows) { const list = el("dl", { class: "rack-facts" }); for (const [term, value] of rows) list.append(el("dt", { text: term }), el("dd", { text: value })); return list; }
function deck(estate, context, probes, rerender) {
  const byId = new Map(estate.services.map((item) => [item.id, item]));
  const selected = byId.get(context.selected);
  const inspector = el("section", { class: "rack-deck__panel" }, [el("h3", { text: "Inspector" }), el("strong", { class: "rack-deck__subject", text: selected?.name || "Nothing selected" })]);
  const assign = el("div", { class: "rack-assign", role: "group", "aria-label": "Probe assignment" });
  for (const slot of ["A", "B"]) {
    const button = el("button", { type: "button", class: "rack-assign__button", "data-focus-key": `assign:${slot}`, text: `Assign to probe ${slot}`, "aria-pressed": selected && probes[slot] === selected.id });
    button.disabled = !selected;
    button.addEventListener("click", () => { if (!selected) return; probes[slot] = probes[slot] === selected.id ? "" : selected.id; const other = slot === "A" ? "B" : "A"; if (probes[other] === probes[slot]) probes[other] = ""; rerender(); });
    assign.append(button);
  }
  inspector.append(assign, facts(selected ? [["Lane", ROLE_META[selected.role]?.[0] || selected.role], ["Status", selected.measured ? `${STATUS_TOKEN[selected.status]} ${selected.status}` : "UNMEASURED"], ["Evidence", selected.evidence || "none"], ["Outbound", selected.deps.join(", ") || "none"], ["Inbound", selected.dependents.join(", ") || "none"], ["Caveat", "Declared dependencies, not observed traffic."]] : [["Hint", "Select a lane or service module."]]));
  const links = el("nav", { class: "rack-deck__links", "aria-label": "Evidence routes" });
  for (const [label, href] of [["ROMs", "/lab/system-symphony/roms/"], ["Replay", "/lab/system-symphony/replay/"], ["Reliability", "/systems/reliability/"], ["Console", "/lab/console/"]]) links.append(el("a", { href, text: label }));
  inspector.append(links);
  const bay = el("section", { class: "rack-deck__panel" }, [el("h3", { text: "Two-channel probe bay" })]);
  const channels = el("div", { class: "rack-channels" });
  for (const slot of ["A", "B"]) {
    const item = byId.get(probes[slot]);
    const eject = el("button", { type: "button", class: "rack-channel__eject", "data-focus-key": `eject:${slot}`, text: "Eject" });
    eject.disabled = !item;
    eject.addEventListener("click", () => { probes[slot] = ""; rerender(); });
    channels.append(el("article", { class: "rack-channel", "data-seated": item ? "1" : "0" }, [el("div", { class: "rack-channel__head" }, [el("span", { text: `CH ${slot}` }), eject]), el("strong", { text: item?.name || "Empty socket" }), facts(item ? [["Role", ROLE_META[item.role]?.[0] || item.role], ["Status", item.measured ? item.status : "unmeasured"], ["Source", item.evidence || "none"], ["Dependencies", item.deps.join(", ") || "none"]] : [["Instruction", `Assign a selected module to probe ${slot}.`]])]));
  }
  bay.append(channels);
  return el("div", { class: "rack-deck" }, [inspector, bay]);
}
function cordLayer() { const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "rack-cords"); svg.setAttribute("aria-hidden", "true"); svg.dataset.rackCords = ""; const group = document.createElementNS(svg.namespaceURI, "g"); group.dataset.rackCordLayer = ""; svg.append(group); return svg; }
function paintCords(container, routes) {
  const svg = container.querySelector("[data-rack-cords]"); const chassis = container.querySelector(".rack-chassis"); if (!svg || !chassis || container.dataset.narrow === "1") return;
  const base = chassis.getBoundingClientRect(); svg.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`); const group = svg.querySelector("[data-rack-cord-layer]"); group.replaceChildren();
  const point = (id, bottom) => { const node = chassis.querySelector(`[data-rack-chip="${CSS.escape(id)}"]`); if (!node) return null; const box = node.getBoundingClientRect(); return { x: box.left - base.left + box.width / 2, y: (bottom ? box.bottom : box.top) - base.top }; };
  for (const route of routes) { const from = point(route.from, true); const to = point(route.to, false); if (!from || !to) continue; const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", cordPath(from, to)); path.setAttribute("class", `rack-cord rack-cord--${route.direction}`); group.append(path); }
}

export function renderRack(host, container, probes) {
  const estate = readEstate(host); const role = selectedRole(); const selected = estate.selected; const byId = new Map(estate.services.map((item) => [item.id, item]));
  const out = new Set(byId.get(selected)?.deps || []); const inn = new Set(byId.get(selected)?.dependents || []); const related = new Set([selected, ...out, ...inn].filter(Boolean));
  const dimmed = new Set(estate.services.filter((item) => selected ? !related.has(item.id) : role && role !== "clock" ? item.role !== role : false).map((item) => item.id));
  const routes = routesForSelection(estate.services, selected, role); const context = { selected, role, out, inn, dimmed, stale: estate.stale };
  const active = document.activeElement; const focusKey = active instanceof HTMLElement && container.contains(active) ? active.dataset.focusKey || "" : ""; const rerender = () => renderRack(host, container, probes);
  const stack = el("div", { class: "rack-stack" }, [controller(estate), el("p", { class: "rack-status", "aria-live": "polite", text: selected ? `${selected} selected. ${out.size} outbound and ${inn.size} inbound declared routes.` : role ? `${ROLE_META[role][0]} lane selected.` : "No selection. Select a lane or service module." })]);
  for (const key of ROLE_ORDER) stack.append(lane(host, key, estate.services.filter((item) => !item.external && item.role === key).sort((a, b) => a.id.localeCompare(b.id)), context));
  const ext = boundary(estate.services.filter((item) => item.external), context); if (ext) stack.append(ext);
  const chassis = el("div", { class: "rack-chassis" }, [stack, cordLayer()]); const fragment = document.createDocumentFragment(); fragment.append(chassis, deck(estate, context, probes, rerender));
  container.dataset.narrow = container.getBoundingClientRect().width < NARROW_BREAKPOINT ? "1" : "0"; container.replaceChildren(fragment); container.dataset.source = estate.source.key; container.dataset.running = estate.running ? "1" : "0"; paintCords(container, routes);
  if (focusKey) { const escaped = globalThis.CSS?.escape ? CSS.escape(focusKey) : focusKey; container.querySelector(`[data-focus-key="${escaped}"]`)?.focus({ preventScroll: true }); }
}
