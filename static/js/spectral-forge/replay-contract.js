"use strict";

/*
 * REPLAY repeats the selected finite telemetry scenario on the same living
 * organism. RESET RUN remains the only control that deliberately restarts the
 * specimen and audio safety state.
 */

function typingTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function replayCurrentScenario(root = document) {
  const select = root.querySelector("#scenario-select");
  const playback = root.querySelector("#playback-state");
  if (!select || !playback || playback.textContent?.trim() !== "COMPLETE") return false;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function installReplayContract(root = document) {
  if (!root || root.documentElement?.dataset.forgeReplayContract === "ready") return false;
  if (root.documentElement) root.documentElement.dataset.forgeReplayContract = "ready";

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("#play-toggle") : null;
    if (!target) return;
    const playback = root.querySelector("#playback-state");
    if (playback?.textContent?.trim() !== "COMPLETE") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    replayCurrentScenario(root);
  }, { capture: true });

  root.defaultView?.addEventListener("keydown", (event) => {
    if (event.key !== " " || typingTarget(event.target) || root.querySelector("dialog[open]")) return;
    const playback = root.querySelector("#playback-state");
    if (playback?.textContent?.trim() !== "COMPLETE") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    replayCurrentScenario(root);
  }, { capture: true });
  return true;
}

if (typeof document !== "undefined") installReplayContract(document);
