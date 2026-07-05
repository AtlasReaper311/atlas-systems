(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) return;

  var style = document.createElement("style");
  style.textContent = [
    "#page-overlay{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:1;background:#0a0a0f;transition:opacity .22s ease}",
    "#page-overlay::before{content:'';position:absolute;top:0;bottom:0;left:-32%;width:32%;background:linear-gradient(90deg,transparent,rgba(245,166,35,.18),transparent);animation:route-scan .46s ease both}",
    "#page-overlay::after{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(245,166,35,.22);opacity:.7}",
    "body.route-ready #page-overlay{opacity:0}",
    "body.route-closing #page-overlay{opacity:1}",
    "body.route-closing #page-overlay::before{animation:route-scan-out .28s ease both}",
    "@keyframes route-scan{from{transform:translateX(0)}to{transform:translateX(410%)}}",
    "@keyframes route-scan-out{from{transform:translateX(0)}to{transform:translateX(410%)}}"
  ].join("");
  document.head.appendChild(style);

  var overlay = document.createElement("div");
  overlay.id = "page-overlay";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.body.classList.add("route-ready");
    });
  });

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var anchor = event.target.closest("a");
    if (!anchor) return;

    var href = anchor.getAttribute("href");
    if (!href) return;

    var url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    if (
      anchor.target === "_blank" ||
      anchor.hasAttribute("download") ||
      anchor.dataset.noTransition === "true" ||
      url.origin !== window.location.origin ||
      (url.pathname === window.location.pathname && url.hash)
    ) {
      return;
    }

    event.preventDefault();
    document.body.classList.remove("route-ready");
    document.body.classList.add("route-closing");

    window.setTimeout(function () {
      window.location.href = url.href;
    }, 190);
  });
})();
