(() => {
  "use strict";

  const PREVIEW_HOST = "system-symphony-pr-43.atlas-systems-44t.pages.dev";
  if (window.location.hostname !== PREVIEW_HOST) return;

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

  window.__ATLAS_SYMPHONY_PREVIEW_DATA__ = true;
})();
