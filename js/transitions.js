/**
 * js/transitions.js
 *
 * Route entry behaviour.
 *
 * This file used to preventDefault same-origin clicks, hold the old
 * document for 190ms behind a full-screen overlay, and only then call
 * location.assign. The overlay could never cover the next page's first
 * paint, because it did not exist until that page's own JavaScript ran.
 * All it produced was a delay, a curtain over the page you were
 * leaving, and a fade over the page you had already arrived on.
 *
 * The old full-screen curtain is gone. Top-level Atlas route changes
 * keep a short terminal-style scan wipe here, without adding shared-shell
 * bytes to every Lab instrument.
 */
(function () {
  "use strict";

  var ROUTE_EXIT_MS = 180;

  if (window.location.pathname === "/about/") {
    void import("/static/js/secondary-surface-fields.js?v=20260728-composition-batch-two-v1");
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) {
    var leaving = false;

    function routeDestination(anchor, event) {
      if (!anchor || event.defaultPrevented || event.button !== 0) return null;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
      if (anchor.target && anchor.target !== "_self") return null;
      if (anchor.hasAttribute("download")) return null;
      var url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return null;
      return url.href;
    }

    function showTerminalWipe() {
      document.documentElement.dataset.atlasRouteTransition = "leaving";
      var wipe = document.createElement("div");
      wipe.setAttribute("aria-hidden", "true");
      wipe.style.cssText = "position:fixed;inset:var(--atlas-header-height,56px) 0 0;z-index:2147483000;pointer-events:none;mix-blend-mode:screen;background:linear-gradient(90deg,transparent 0%,rgba(245,166,35,.08) 22%,rgba(245,166,35,.42) 43%,rgba(74,222,128,.34) 50%,rgba(56,189,248,.18) 58%,transparent 76%),repeating-linear-gradient(180deg,rgba(245,166,35,.16) 0 1px,transparent 1px 6px);opacity:0;transform:translate3d(-120%,0,0)";
      document.body.appendChild(wipe);
      if (wipe.animate) {
        wipe.animate([
          { transform: "translate3d(-120%,0,0)", opacity: 0 },
          { transform: "translate3d(-72%,0,0)", opacity: .86 },
          { transform: "translate3d(44%,0,0)", opacity: .68 },
          { transform: "translate3d(118%,0,0)", opacity: 0 }
        ], { duration: ROUTE_EXIT_MS, easing: "cubic-bezier(.2,.72,.2,1)", fill: "forwards" });
      }
      var main = document.querySelector("body > main");
      if (main && main.animate) {
        main.animate([
          { transform: "translate3d(0,0,0)", filter: "brightness(1)" },
          { transform: "translate3d(0,-10px,0)", filter: "brightness(.9) saturate(1.04)" }
        ], { duration: ROUTE_EXIT_MS, easing: "cubic-bezier(.28,.76,.24,1)", fill: "forwards" });
      }
    }

    document.addEventListener("click", function (event) {
      var anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      var destination = routeDestination(anchor, event);
      if (!destination) return;
      event.preventDefault();
      if (leaving) return;
      leaving = true;
      showTerminalWipe();
      window.setTimeout(function () {
        window.location.href = destination;
      }, ROUTE_EXIT_MS);
    }, { capture: true });

    window.addEventListener("pageshow", function () {
      leaving = false;
      delete document.documentElement.dataset.atlasRouteTransition;
    });
    return;
  }

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
