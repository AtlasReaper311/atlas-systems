"use strict";

import "./estate-shell.js?v=20260723-interface-v2";
import "./estate-search/global-search.js";

const SEARCH_STYLESHEET = "/static/css/estate-search.css";

if (!document.head.querySelector(`link[href="${SEARCH_STYLESHEET}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = SEARCH_STYLESHEET;
  document.head.appendChild(link);
}
