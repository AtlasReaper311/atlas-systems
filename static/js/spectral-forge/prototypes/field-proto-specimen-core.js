"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

export function draw(timestamp = performance.now()) {
  drawOrganism("specimen", this, timestamp);
}
