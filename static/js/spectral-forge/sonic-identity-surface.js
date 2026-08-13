"use strict";

import { effectiveStereoWidth } from "./sonic-profile.js";

function valueFor(label) {
  for (const node of document.querySelectorAll("#audio-parameter-list span")) {
    if (node.querySelector("small")?.textContent.trim() !== label) continue;
    return Number.parseFloat(node.querySelector("strong")?.textContent ?? "0") || 0;
  }
  return 0;
}

function render(node) {
  const width = valueFor("STEREO WIDTH");
  const instability = valueFor("INSTABILITY");
  const effective = effectiveStereoWidth({ stereo_width: width, instability });
  node.textContent = `${Math.round(effective * 100)}% effective side · ${width.toFixed(0)}% mapped width × ${instability.toFixed(1)} ct instability`;
}

export function installSonicIdentitySurface() {
  const panel = document.querySelector(".forge-audio-parameters");
  if (!panel || panel.querySelector("[data-sonic-width-proof]")) return;
  const row = document.createElement("div");
  row.className = "forge-audio-boundary";
  row.innerHTML = `<div><small>SPATIAL MACRO</small><strong data-sonic-width-proof>—</strong></div><div><small>COMPARE TRANSITION</small><strong>100 ms minimum for abrupt mapped changes</strong></div>`;
  panel.append(row);
  const output = row.querySelector("[data-sonic-width-proof]");
  new MutationObserver(() => render(output)).observe(document.querySelector("#audio-parameter-list"), { childList: true, subtree: true, characterData: true });
  render(output);
}

queueMicrotask(installSonicIdentitySurface);
