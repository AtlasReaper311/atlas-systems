"use strict";

import "./estate-shell.js?v=20260723-interface-v2";
import "./estate-search/global-search.js";
import { installSurfaceConvergence } from "./surface-convergence.js?v=20260806-final-convergence-v1";

if ([
  "/systems/reliability/",
  "/systems/observability/",
  "/systems/evidence/",
].includes(window.location.pathname)) {
  void import("./secondary-surface-fields.js?v=20260728-evidence-surfaces-v1");
}

for (const href of [
  "/static/css/estate-search.css",
  "/static/css/batch-h-shell-fixes.css?v=20260725-browser-evidence",
  "/static/css/surface-convergence.css?v=20260806-final-convergence-v1",
]) {
  if (document.head.querySelector(`link[href="${href}"]`)) continue;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

installSurfaceConvergence();
