"use strict";

import { installFlagshipCounterpart } from "/lab/shared/flagship-counterparts.js?v=20260813-atlas-audio-family-v1";
import "./spectral-field-art.js?v=20260813-field-3";
import "./sonic-identity-install.js?v=20260813-sonic-22";
import "./app-core.js";
import "./forge-instrument-enhancements.js?v=20260813-instrument-22";
import "./sonic-identity-surface.js?v=20260813-sonic-22";

const counterpartRail = installFlagshipCounterpart();
const productCopy = document.querySelector(".forge-product-identity p");
const counterpartLink = productCopy?.parentElement?.querySelector(".atlas-audio-family__counterpart");
counterpartLink?.classList.add("forge-counterpart-link");
counterpartRail?.classList.add("lab-flagship-counterpart--field");
