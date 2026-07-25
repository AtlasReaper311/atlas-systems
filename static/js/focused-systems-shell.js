"use strict";

import "./estate-shell.js?v=20260723-interface-v2";
import "./estate-search/global-search.js";

for (const href of [
  "/static/css/estate-search.css",
  "/static/css/batch-h-shell-fixes.css?v=20260725-browser-evidence",
]) {
  if (document.head.querySelector(`link[href="${href}"]`)) continue;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}
