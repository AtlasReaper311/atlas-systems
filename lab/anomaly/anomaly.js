import "../shared/shell.js";
import "../../static/js/interaction-target-contract.js";
import { mountLabSound } from "../shared/lab-explore-sound.js?v=20260811-sound-v2";
import "./anomaly-core.js";

const soundButton = document.querySelector("#sound-button");
const exploreSound = mountLabSound({ voice: "shape", button: soundButton });

const sourceStatus = document.querySelector("#source-status");
if (sourceStatus && typeof MutationObserver !== "undefined") {
  let lastMode = sourceStatus.dataset.evidenceMode || "";
  const observer = new MutationObserver(() => {
    const mode = sourceStatus.dataset.evidenceMode || "";
    if (mode === lastMode) return;
    lastMode = mode;
    if (mode === "simulated") exploreSound.cue("warn");
    else if (mode === "measured") exploreSound.cue("mark");
  });
  observer.observe(sourceStatus, { attributes: true, attributeFilter: ["data-evidence-mode"] });
}
