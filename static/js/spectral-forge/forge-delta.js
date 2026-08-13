"use strict";

import { VISUAL_TARGET_GRAMMAR } from "./spectral-field-model.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function currentSnapshot() {
  const route = $('#route-list button[data-mapping-id][aria-pressed="true"]');
  const labels = route ? $$('strong', route).map((node) => node.textContent.trim()) : [];
  if (!route || labels.length < 2) return null;
  return {
    key: labels.join("->"),
    targetId: [...$("#route-target").options].find((option) => option.textContent.trim() === labels[1])?.value ?? "",
    transform: $("#mapping-transform")?.value ?? "",
    polarity: $("#mapping-polarity")?.value ?? "",
    smoothing: $("#mapping-smoothing")?.value ?? "",
    range: `${$("#mapping-output-min")?.value ?? ""}…${$("#mapping-output-max")?.value ?? ""}`,
  };
}

export function installDeltaSurface() {
  const bar = $(".forge-preset-bar");
  if (!bar || $(".forge-delta-surface")) return;
  const style = document.createElement("style");
  style.textContent = `.forge-delta-surface{margin-top:1px;padding:13px 18px;display:grid;grid-template-columns:190px 1fr;gap:16px;border:1px solid var(--forge-border);background:rgba(17,17,24,.62)}.forge-delta-surface h3{margin:4px 0 0;font:400 22px/1 "DM Serif Display",Georgia,serif}.forge-delta-surface p{margin:6px 0 0;color:var(--forge-faint);font-size:10px}.forge-delta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--forge-border)}.forge-delta-grid span{padding:9px;background:var(--forge-deep);display:grid;gap:3px}.forge-delta-grid small{color:var(--forge-faint);font-size:8px}.forge-delta-grid strong,.forge-delta-grid i{font-size:9px;font-weight:400;font-style:normal}.forge-delta-grid i{color:var(--forge-amber)}@media(max-width:900px){.forge-delta-surface{grid-template-columns:1fr}.forge-delta-grid{grid-template-columns:repeat(2,1fr)}}`;
  document.head.append(style);
  const section = document.createElement("section");
  section.className = "forge-delta-surface";
  section.innerHTML = `<div><span class="forge-micro-label">A / B CONSEQUENCE</span><h3>What changed?</h3><p data-delta-summary>Select the same route in A and B.</p></div><div class="forge-delta-grid" data-delta-grid></div>`;
  bar.before(section);
  const snapshots = { A: new Map(), B: new Map() };
  const capture = () => {
    const variant = $("#variant-b")?.getAttribute("aria-pressed") === "true" ? "B" : "A";
    const state = currentSnapshot();
    if (!state) return;
    snapshots[variant].set(state.key, state);
    const a = snapshots.A.get(state.key);
    const b = snapshots.B.get(state.key);
    const grid = $("[data-delta-grid]", section);
    const summary = $("[data-delta-summary]", section);
    if (!a || !b) {
      grid.replaceChildren();
      summary.textContent = `Captured ${variant}. Select this route in ${variant === "A" ? "B" : "A"} to compare.`;
      return;
    }
    const rows = [["TRANSFORM", a.transform, b.transform], ["POLARITY", a.polarity, b.polarity], ["SMOOTHING", a.smoothing, b.smoothing], ["OUTPUT", a.range, b.range]];
    grid.replaceChildren(...rows.map(([label, before, after]) => {
      const span = document.createElement("span");
      span.innerHTML = `<small>${label}</small><strong>${before}</strong><i>${before === after ? "UNCHANGED" : `→ ${after}`}</i>`;
      return span;
    }));
    summary.textContent = `Telemetry identical · visual consequence: ${VISUAL_TARGET_GRAMMAR[b.targetId]?.label ?? "mapped geometry"}.`;
  };
  $("#variant-a")?.addEventListener("click", () => queueMicrotask(capture));
  $("#variant-b")?.addEventListener("click", () => queueMicrotask(capture));
  $("#route-list")?.addEventListener("click", () => queueMicrotask(capture));
  $(".forge-route-inspector")?.addEventListener("change", () => queueMicrotask(capture));
  capture();
}
