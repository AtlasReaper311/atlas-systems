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
  /* A/B keeps its footprint only once it has something to say. The surface used
   * to occupy 106px at the top of the panel to report that no comparison had
   * been made yet; it now sits compact under the comparison control and expands
   * when the candidate actually diverges from the baseline. */
  const compare = $(".forge-compare");
  const bar = compare ?? $(".forge-preset-bar");
  if (!bar || $(".forge-delta-surface")) return;
  const style = document.createElement("style");
  style.textContent = `.forge-delta-surface{margin-top:8px;padding:9px 12px;display:grid;gap:8px;border:1px solid var(--forge-border);border-radius:6px;background:rgba(17,17,24,.5)}.forge-delta-surface[data-delta-state=identical]{padding:6px 12px}.forge-delta-surface[data-delta-state=identical] .forge-delta-grid{display:none}.forge-delta-surface[data-delta-state=identical] h3{font-size:13px}.forge-delta-surface[data-delta-state=changed]{border-color:var(--forge-amber)}.forge-delta-surface h3{margin:0;font:400 15px/1.1 "DM Serif Display",Georgia,serif}.forge-delta-surface p{margin:6px 0 0;color:var(--forge-faint);font-size:10px}.forge-delta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--forge-border)}.forge-delta-grid span{padding:9px;background:var(--forge-deep);display:grid;gap:3px}.forge-delta-grid small{color:var(--forge-faint);font-size:8px}.forge-delta-grid strong,.forge-delta-grid i{font-size:9px;font-weight:400;font-style:normal}.forge-delta-grid i{color:var(--forge-amber)}@media(max-width:900px){.forge-delta-grid{grid-template-columns:repeat(2,1fr)}}`;
  document.head.append(style);
  const section = document.createElement("section");
  section.className = "forge-delta-surface";
  section.innerHTML = `<div><span class="forge-micro-label">A / B CONSEQUENCE</span><h3>What changed?</h3><p data-delta-summary>Select the same route in A and B.</p></div><div class="forge-delta-grid" data-delta-grid></div>`;
  bar.after(section);
  section.dataset.deltaState = "identical";
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
      section.dataset.deltaState = "identical";
      summary.textContent = `Captured ${variant}. Select this route in ${variant === "A" ? "B" : "A"} to compare.`;
      return;
    }
    const rows = [["TRANSFORM", a.transform, b.transform], ["POLARITY", a.polarity, b.polarity], ["SMOOTHING", a.smoothing, b.smoothing], ["OUTPUT", a.range, b.range]];
    /* Identical baselines have nothing to show, so the surface stays compact
     * until the candidate genuinely diverges. */
    const changed = rows.some(([, before, after]) => before !== after);
    section.dataset.deltaState = changed ? "changed" : "identical";
    grid.replaceChildren(...rows.map(([label, before, after]) => {
      const span = document.createElement("span");
      span.innerHTML = `<small>${label}</small><strong>${before}</strong><i>${before === after ? "UNCHANGED" : `→ ${after}`}</i>`;
      return span;
    }));
    summary.textContent = changed
      ? `Telemetry identical · visual consequence: ${VISUAL_TARGET_GRAMMAR[b.targetId]?.label ?? "mapped geometry"}.`
      : "Baseline and candidate agree on this route.";
  };
  $("#variant-a")?.addEventListener("click", () => queueMicrotask(capture));
  $("#variant-b")?.addEventListener("click", () => queueMicrotask(capture));
  $("#route-list")?.addEventListener("click", () => queueMicrotask(capture));
  $(".forge-route-inspector")?.addEventListener("change", () => queueMicrotask(capture));
  capture();
}
