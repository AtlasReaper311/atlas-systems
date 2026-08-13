"use strict";

import { SIGNALS, SIGNAL_BY_ID, TARGETS } from "./domain.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function ensurePatchStyles() {
  if ($("#forge-patch-bay-style")) return;
  const style = document.createElement("style");
  style.id = "forge-patch-bay-style";
  style.textContent = `.forge-patch-bay{margin-top:12px;padding:16px 18px;display:grid;grid-template-columns:1fr auto 1fr;gap:16px;border:1px solid var(--forge-border);background:rgba(17,17,24,.62)}.forge-patch-bay header{grid-column:1/-1;display:flex;justify-content:space-between;gap:16px}.forge-patch-bay h3{margin:4px 0 0;font:400 22px/1 "DM Serif Display",Georgia,serif}.forge-patch-bay p{margin:0;color:var(--forge-faint);font-size:10px}.forge-patch-bank{display:flex;flex-wrap:wrap;gap:7px;align-content:start}.forge-patch-bank>span{width:100%;color:var(--forge-faint);font-size:9px}.forge-patch-point{min-height:38px;padding:0 10px;border:1px solid var(--forge-border-hi);border-radius:18px;background:var(--forge-deep);color:var(--forge-dim);font-size:9px}.forge-patch-point[data-selected=true],.forge-patch-point[data-drop=ready]{border-color:var(--forge-amber);color:var(--forge-amber)}.forge-patch-point:disabled{opacity:.34}.forge-patch-arrow{align-self:center;color:var(--forge-amber)}@media(max-width:980px){.forge-patch-bay{grid-template-columns:1fr}.forge-patch-arrow{display:none}}`;
  document.head.append(style);
}

export function installPatchBay() {
  const workspace = $(".forge-workspace");
  if (!workspace || $(".forge-patch-bay")) return;
  ensurePatchStyles();
  const section = document.createElement("section");
  section.className = "forge-patch-bay";
  section.innerHTML = `<header><div><span class="forge-micro-label">PATCH BAY</span><h3>Patch signal into sound.</h3></div><p>Drag on desktop, or choose a source then target. Native route controls remain below.</p></header><div class="forge-patch-bank" data-sources><span>SIGNALS</span></div><span class="forge-patch-arrow" aria-hidden="true">→</span><div class="forge-patch-bank" data-targets><span>SONIC TARGETS</span></div>`;
  workspace.before(section);
  let chosen = "";
  for (const signal of SIGNALS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "forge-patch-point";
    button.draggable = true;
    button.dataset.signal = signal.id;
    button.textContent = signal.label;
    button.addEventListener("click", () => {
      chosen = signal.id;
      $$('[data-signal]', section).forEach((node) => { node.dataset.selected = String(node === button); });
      $("#route-source").value = signal.id;
    });
    button.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/x-atlas-forge-signal", signal.id));
    $("[data-sources]", section).append(button);
  }
  for (const target of TARGETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "forge-patch-point";
    button.dataset.target = target.id;
    button.textContent = target.label;
    const patch = (source) => {
      if (!source || button.disabled) return;
      $("#route-source").value = source;
      $("#route-target").value = target.id;
      $("#route-create-confirm")?.click();
      const notice = $("#forge-notice");
      if (notice) notice.textContent = `${SIGNAL_BY_ID[source].label} patched to ${target.label} in candidate B`;
    };
    button.addEventListener("click", () => patch(chosen));
    button.addEventListener("dragover", (event) => { if (!button.disabled) { event.preventDefault(); button.dataset.drop = "ready"; } });
    button.addEventListener("dragleave", () => { delete button.dataset.drop; });
    button.addEventListener("drop", (event) => { event.preventDefault(); delete button.dataset.drop; patch(event.dataTransfer?.getData("text/x-atlas-forge-signal")); });
    $("[data-targets]", section).append(button);
  }
  const sync = () => {
    const select = $("#route-target");
    if (!select) return;
    $$('[data-target]', section).forEach((button) => {
      button.disabled = Boolean([...select.options].find((option) => option.value === button.dataset.target)?.disabled);
    });
  };
  new MutationObserver(sync).observe($("#route-list"), { childList: true, subtree: true, attributes: true });
  sync();
}
