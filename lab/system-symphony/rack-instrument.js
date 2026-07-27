"use strict";

import { renderRack } from "./rack-view.js?v=20260727-rack-b-v1";

const HOST_ID = "system-symphony-widget";
const STYLE_URL = "/lab/system-symphony/rack-instrument.css?v=20260727-rack-b-v1";
const WAIT_MS = 5000;

function ensureStyle() {
  if (document.head.querySelector(`link[href="${STYLE_URL}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_URL;
  document.head.append(link);
}

export function installRackInstrument(host) {
  const topology = host.querySelector("[data-topology]");
  if (!topology) return false;
  let container = host.querySelector("[data-rack-instrument]");
  if (!container) {
    container = document.createElement("div");
    container.className = "rack-instrument";
    container.dataset.rackInstrument = "";
    topology.insertAdjacentElement("afterend", container);
  }
  host.classList.add("has-rack-instrument");
  const probes = { A: "", B: "" };
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderRack(host, container, probes);
    });
  };
  const topologyObserver = new MutationObserver(schedule);
  topologyObserver.observe(topology, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-node"] });
  const table = host.querySelector("[data-service-table]");
  const tableObserver = table ? new MutationObserver(schedule) : null;
  tableObserver?.observe(table, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  const hostObserver = new MutationObserver(schedule);
  hostObserver.observe(host, { attributes: true, attributeFilter: ["data-source", "data-running", "data-state"] });
  const roleClick = (event) => { if (event.target.closest?.("[data-apu-role-highlight]")) schedule(); };
  document.addEventListener("click", roleClick);
  let width = -1;
  const resize = new ResizeObserver(([entry]) => {
    const next = Math.round(entry?.contentRect?.width || 0);
    if (next === width) return;
    width = next;
    schedule();
  });
  resize.observe(host.querySelector(".symphony-visual") || container);
  schedule();
  addEventListener("pagehide", () => {
    topologyObserver.disconnect();
    tableObserver?.disconnect();
    hostObserver.disconnect();
    resize.disconnect();
    document.removeEventListener("click", roleClick);
    if (frame) cancelAnimationFrame(frame);
  }, { once: true });
  return true;
}

function initialise() {
  ensureStyle();
  const existing = document.getElementById(HOST_ID);
  if (existing && installRackInstrument(existing)) return;
  const observer = new MutationObserver(() => {
    const host = document.getElementById(HOST_ID);
    if (!host || !installRackInstrument(host)) return;
    observer.disconnect();
    clearTimeout(timeout);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeout = setTimeout(() => observer.disconnect(), WAIT_MS);
}

if (typeof document !== "undefined") initialise();
