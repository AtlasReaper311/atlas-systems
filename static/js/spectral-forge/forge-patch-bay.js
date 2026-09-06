"use strict";

import { SIGNALS, SIGNAL_BY_ID, TARGETS } from "./domain.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function ensurePatchStyles() {
  if ($("#forge-patch-bay-style")) return;
  const style = document.createElement("style");
  style.id = "forge-patch-bay-style";
  style.textContent = `.forge-patch-bay{margin:0;padding:2px 14px 12px;display:grid;gap:9px;border-top:1px solid var(--forge-border);background:transparent}.forge-patch-bay:not([open]){padding-bottom:2px}.forge-patch-bay p{margin:0;color:var(--forge-faint);font-size:9px;line-height:1.45}.forge-patch-bank{display:flex;flex-wrap:wrap;gap:5px;align-content:start}.forge-patch-bank>span{width:100%;color:var(--forge-faint);font-size:8px;letter-spacing:.12em}.forge-patch-point{min-height:30px;padding:0 9px;border:1px solid var(--forge-border-hi);border-radius:15px;background:var(--forge-deep);color:var(--forge-dim);font-size:8.5px;cursor:pointer}.forge-patch-point:hover{border-color:var(--forge-dim)}.forge-patch-point[data-selected=true],.forge-patch-point[data-drop=ready]{border-color:var(--forge-amber);color:var(--forge-amber)}.forge-patch-point:disabled{opacity:.34;cursor:default}.forge-patch-arrow{justify-self:center;color:var(--forge-amber);font-size:11px}`;
  document.head.append(style);
}

export function installPatchBay() {
  /* The patch bay belongs to the routes, not to the page. As a full-width block
   * above the workspace it pushed the instrument itself 1082px down the page to
   * show a grid of buttons whose one directional cue - the arrow between the
   * banks - measured 9.6px wide. Docked in the route rail it sits beside the
   * routes it creates, and the explicit route controls remain the primary and
   * fully keyboard-accessible way to patch. */
  const rack = $(".forge-route-rack");
  const workspace = $(".forge-workspace");
  const host = rack ?? workspace;
  if (!host || $(".forge-patch-bay")) return;
  ensurePatchStyles();
  /* A disclosure, not a catalogue: collapsed the rail stays about the height
   * of the routes it lists, and the explicit route controls above remain the
   * primary path with full keyboard access. */
  const section = document.createElement("details");
  section.className = "forge-patch-bay";
  section.innerHTML = `<summary>Patch signal into sound</summary><p>Choose a source, then a target. The route controls above stay the primary path.</p><div class="forge-patch-bank" data-sources><span>SIGNALS</span></div><span class="forge-patch-arrow" aria-hidden="true">↓</span><div class="forge-patch-bank" data-targets><span>SONIC TARGETS</span></div>`;
  if (rack) rack.append(section);
  else workspace.before(section);
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
