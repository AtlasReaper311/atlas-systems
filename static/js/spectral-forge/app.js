"use strict";

import { installFlagshipCounterpart } from "/lab/shared/flagship-counterparts.js";
import "./sonic-identity-install.js";
import "./replay-contract.js";
import "./app-core.js";
import "./forge-instrument-enhancements.js";
import "./sonic-identity-surface.js";

const counterpartRail = installFlagshipCounterpart();
const productCopy = document.querySelector(".forge-product-identity p");
const counterpartLink = productCopy?.parentElement?.querySelector(".atlas-audio-family__counterpart");
counterpartLink?.classList.add("forge-counterpart-link");
counterpartRail?.classList.add("lab-flagship-counterpart--field");
