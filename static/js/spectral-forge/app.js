"use strict";

import { installFlagshipCounterpart } from "/lab/shared/flagship-counterparts.js?v=20260813-atlas-audio-family-v1";
import "./spectral-field-art.js?v=20260813-field-3";
import "./app-core.js";

const counterpartRail = installFlagshipCounterpart();
const productCopy = document.querySelector(".forge-product-identity p");
const counterpartLink = productCopy?.parentElement?.querySelector(".atlas-audio-family__counterpart");
counterpartLink?.classList.add("forge-counterpart-link");
counterpartRail?.classList.add("lab-flagship-counterpart--field");
