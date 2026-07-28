import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(
  new URL("../system-symphony/preview-endpoints.js", import.meta.url),
  "utf8",
);

function runPreviewEndpoints({ hostname, search }) {
  const requests = [];
  const window = {
    location: {
      hostname,
      search,
      origin: `https://${hostname}`,
      href: `https://${hostname}/lab/system-symphony-apu/${search}`,
    },
    fetch: async (input) => {
      requests.push(input instanceof Request ? input.url : String(input));
      return { ok: true };
    },
    addEventListener() {},
  };
  const document = {
    documentElement: {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
  };

  class PreviewMutationObserver {
    observe() {}
    disconnect() {}
  }

  vm.runInNewContext(script, {
    document,
    MutationObserver: PreviewMutationObserver,
    Request,
    URL,
    URLSearchParams,
    window,
  });

  return { requests, window };
}

test("production evidence mode requires an exact deployment SHA", async () => {
  const sha = "c678ad4767cc195f202553336e587aca31f7d4b1";
  const { requests, window } = runPreviewEndpoints({
    hostname: "atlas-systems.uk",
    search: `?symphonyPreviewData=1&atlas-deploy=${sha}`,
  });

  assert.equal(window.__ATLAS_SYMPHONY_PREVIEW_DATA__, true);
  await window.fetch("https://api.atlas-systems.uk/sonify");
  assert.deepEqual(requests, [
    "https://atlas-systems.uk/lab/system-symphony/preview-data/sonify.json",
  ]);
});

test("ordinary custom-domain preview query remains live", async () => {
  const { requests, window } = runPreviewEndpoints({
    hostname: "atlas-systems.uk",
    search: "?symphonyPreviewData=1",
  });

  assert.equal(window.__ATLAS_SYMPHONY_PREVIEW_DATA__, undefined);
  await window.fetch("https://api.atlas-systems.uk/sonify");
  assert.deepEqual(requests, ["https://api.atlas-systems.uk/sonify"]);
});

test("malformed deployment identity cannot enable production evidence mode", () => {
  const { window } = runPreviewEndpoints({
    hostname: "atlas-systems.uk",
    search: "?symphonyPreviewData=1&atlas-deploy=main",
  });

  assert.equal(window.__ATLAS_SYMPHONY_PREVIEW_DATA__, undefined);
});

test("existing Pages preview behaviour is preserved", () => {
  const { window } = runPreviewEndpoints({
    hostname: "example.atlas-systems-44t.pages.dev",
    search: "?symphonyPreviewData=1",
  });

  assert.equal(window.__ATLAS_SYMPHONY_PREVIEW_DATA__, true);
});
