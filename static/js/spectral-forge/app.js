"use strict";

import { installFlagshipCounterpart } from "/lab/shared/flagship-counterparts.js?v=20260813-spectral-forge";
import "./app-core.js";

function placeForgeCounterpart() {
  const counterpart = installFlagshipCounterpart();
  const playField = document.querySelector('[data-depth-panel="PLAY"] .forge-field-stage');
  if (counterpart && playField) {
    counterpart.classList.add("lab-flagship-counterpart--field");
    playField.insertAdjacentElement("afterend", counterpart);
  }

  const identityCopy = document.querySelector(".forge-product-identity p");
  if (!identityCopy || identityCopy.querySelector(".forge-counterpart-link")) return;
  const link = document.createElement("a");
  link.className = "forge-counterpart-link";
  link.href = "/lab/system-symphony/";
  link.setAttribute("aria-label", "Open audio counterpart System SYMPHONY");
  link.textContent = "AUDIO COUNTERPART · System SYMPHONY →";
  identityCopy.append(link);
}

placeForgeCounterpart();
