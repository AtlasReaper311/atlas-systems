"use strict";

let forgeLoaded = false;
let analyseLoaded = false;

async function loadForgeWorkbench() {
  if (forgeLoaded) return;
  forgeLoaded = true;
  const [{ installPatchBay }, { installDeltaSurface }, { installPresetTransfer }] = await Promise.all([
    import("./forge-patch-bay.js?v=20260813-instrument-22"),
    import("./forge-delta.js?v=20260813-instrument-22"),
    import("./forge-preset-transfer.js?v=20260813-instrument-22"),
  ]);
  installPatchBay();
  installDeltaSurface();
  installPresetTransfer();
}

async function loadAnalyseTools() {
  if (analyseLoaded) return;
  analyseLoaded = true;
  const { installAnalysisSnapshot } = await import("./forge-analysis-snapshot.js?v=20260813-instrument-22");
  installAnalysisSnapshot();
}

function activate(depth) {
  if (depth === "FORGE") void loadForgeWorkbench();
  if (depth === "ANALYSE") void loadAnalyseTools();
}

for (const button of document.querySelectorAll("[data-depth]")) {
  button.addEventListener("click", () => activate(button.dataset.depth));
}

const active = [...document.querySelectorAll("[data-depth]")].find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.depth;
if (active) activate(active);
