/**
 * js/transitions.js
 *
 * Route entry behaviour, not route interception.
 *
 * This file used to preventDefault same-origin clicks, hold the old
 * document for 190ms behind a full-screen overlay, and only then call
 * location.assign. The overlay could never cover the next page's first
 * paint, because it did not exist until that page's own JavaScript ran.
 * All it produced was a delay, a curtain over the page you were
 * leaving, and a fade over the page you had already arrived on.
 *
 * Navigation is now the browser's. Clicks start the next document
 * immediately, and first paint is already the real chrome because the
 * header ships in the HTML. What stays here is the per-route work that
 * genuinely belongs to page entry.
 */
(function () {
  "use strict";

  if (window.location.pathname === "/about/") {
    void import("/static/js/secondary-surface-fields.js?v=20260728-composition-batch-two-v1");
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) return;

  var ramoneMusing = document.getElementById("ramone-musing");
  if (!ramoneMusing) return;

  ramoneMusing.removeAttribute("id");
  ramoneMusing.setAttribute("data-ramone-reduced-musing", "");
  document.addEventListener("DOMContentLoaded", function () {
    ramoneMusing.id = "ramone-musing";
    ramoneMusing.innerHTML = "How can I assist?<span class=\"ramone-musing-cursor\"></span>";
    ramoneMusing.classList.add("in");
  }, { once: true });
})();
