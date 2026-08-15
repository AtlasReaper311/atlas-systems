"use strict";

let forgeLoaded = false;
let analyseLoaded = false;

async function loadForgeWorkbench() {
  if (forgeLoaded) return;
  forgeLoaded = true;
  const [{ installPatchBay }, { installDeltaSurface }, { installPresetTransfer }] = await Promise.all([
    import("./forge-patch-bay.js"),
    import("./forge-delta.js"),
    import("./forge-preset-transfer.js"),
  ]);
  installPatchBay();
  installDeltaSurface();
  installPresetTransfer();
}

async function loadAnalyseTools() {
  if (analyseLoaded) return;
  analyseLoaded = true;
  const { installAnalysisSnapshot } = await import("./forge-analysis-snapshot.js");
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
