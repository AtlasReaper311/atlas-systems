(() => {
  "use strict";

  const PREVIEW_HOST_PATTERN = /^system-symphony-pr-\d+\.atlas-systems-44t\.pages\.dev$/;
  const search = new URLSearchParams(window.location.search);
  const numberedPreview = PREVIEW_HOST_PATTERN.test(window.location.hostname);
  const explicitAtomicPreview =
    window.location.hostname.endsWith(".pages.dev")
    && search.has("symphonyPreviewData");
  if (!numberedPreview && !explicitAtomicPreview) return;

  const endpointMap = new Map([
    ["https://api.atlas-systems.uk/sonify", "/lab/system-symphony/preview-data/sonify.json"],
    ["https://api.atlas-systems.uk/v1/topology", "/lab/system-symphony/preview-data/topology.json"],
    ["https://api.atlas-systems.uk/deploy-watch/latest", "/lab/system-symphony/preview-data/deployment.json"],
    ["https://api.atlas-systems.uk/v1/reliability/objectives", "/lab/system-symphony/preview-data/objectives.json"],
  ]);
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const requestUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const previewPath = endpointMap.get(requestUrl);
    if (!previewPath) return nativeFetch(input, init);

    const previewUrl = new URL(previewPath, window.location.origin).href;
    if (input instanceof Request) {
      return nativeFetch(new Request(previewUrl, input), init);
    }
    return nativeFetch(previewUrl, init);
  };

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node && node.textContent !== value) node.textContent = value;
  }

  function enforcePreviewLabels() {
    const host = document.getElementById("system-symphony-widget");
    if (!host) return;
    if (host.dataset.source !== "preview") host.dataset.source = "preview";
    setText("[data-source-badge]", "Preview data");
    setText("[data-dialog-source]", "Preview data");
    setText(
      "[data-source-explanation]",
      "Bounded same-origin preview data. This branch does not claim to display current production telemetry.",
    );
    const important = host.querySelector("[data-important-status]");
    if (important?.textContent?.startsWith("LIVE.")) {
      important.textContent = important.textContent.replace(/^LIVE\./, "PREVIEW DATA.");
    }
  }

  const labelObserver = new MutationObserver(enforcePreviewLabels);
  labelObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-source"],
    childList: true,
    subtree: true,
  });
  enforcePreviewLabels();
  window.addEventListener("pagehide", () => labelObserver.disconnect(), { once: true });

  window.__ATLAS_SYMPHONY_PREVIEW_DATA__ = true;
})();