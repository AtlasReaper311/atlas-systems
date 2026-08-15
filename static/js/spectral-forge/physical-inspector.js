"use strict";

const PHYSICAL_KEYS = Object.freeze([
  ["pressure", "PRESSURE"],
  ["compression", "COMPRESSION"],
  ["stretch", "STRETCH"],
  ["viscosity", "VISCOSITY"],
  ["cohesion", "COHESION"],
  ["instability", "INSTABILITY"],
  ["propagation", "PROPAGATION"],
  ["peakRecruitment", "PEAK RECRUITMENT"],
  ["surfaceTension", "SURFACE TENSION"],
  ["recovery", "RECOVERY"],
  ["memory", "MEMORY"],
]);

const DEVELOPMENT_KEYS = Object.freeze([
  ["fractureDrive", "FRACTURE DRIVE"],
  ["dominantEvent", "DOMINANT EVENT"],
  ["activeEventCount", "ACTIVE EVENTS"],
  ["scarInfluence", "SCAR INFLUENCE"],
  ["organismLifeTime", "ORGANISM LIFE"],
  ["scenarioTime", "SCENARIO TIME"],
  ["fissionPhase", "FISSION PHASE"],
  ["fissionCount", "FISSION COUNT"],
]);

function numberText(value) {
  return Number.isFinite(value) ? Number(value).toFixed(3) : "0.000";
}

function buildPanel() {
  const anchor = document.querySelector("#analysis-chain");
  if (!anchor || document.querySelector("#analysis-physical-state")) return;
  const label = document.createElement("span");
  label.className = "forge-micro-label";
  label.id = "analysis-physical-state-title";
  label.textContent = "PHYSICAL STATE";

  const panel = document.createElement("div");
  panel.id = "analysis-physical-state";
  panel.className = "forge-analysis-chain";
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-labelledby", label.id);

  const rows = [...PHYSICAL_KEYS, ...DEVELOPMENT_KEYS].map(([key, text]) => {
    const cell = document.createElement("span");
    const small = document.createElement("small");
    small.textContent = text;
    const strong = document.createElement("strong");
    strong.dataset.physicalEvidence = key;
    strong.textContent = key === "fissionPhase" || key === "dominantEvent" ? "none" : "0.000";
    cell.append(small, strong);
    return cell;
  });
  panel.append(...rows);
  anchor.insertAdjacentElement("afterend", label);
  label.insertAdjacentElement("afterend", panel);
}

function updatePanel(evidence) {
  buildPanel();
  if (!evidence) return;
  const physical = evidence.physical ?? {};
  for (const [key] of PHYSICAL_KEYS) {
    const node = document.querySelector(`[data-physical-evidence="${key}"]`);
    if (node) node.textContent = numberText(physical[key]);
  }
  const values = {
    fractureDrive: numberText(evidence.fractureDrive),
    dominantEvent: String(evidence.dominantEvent?.kind ?? "none"),
    activeEventCount: String(evidence.activeEventCount ?? 0),
    scarInfluence: numberText(evidence.scarInfluence),
    organismLifeTime: `${Number(evidence.organismLifeTime ?? 0).toFixed(1)} s`,
    scenarioTime: `${Number(evidence.scenarioTime ?? 0).toFixed(1)} s`,
    fissionPhase: String(evidence.fissionPhase ?? "idle"),
    fissionCount: String(evidence.fissionCount ?? 0),
  };
  for (const [key, value] of Object.entries(values)) {
    const node = document.querySelector(`[data-physical-evidence="${key}"]`);
    if (node) node.textContent = value;
  }
}

export function installPhysicalInspector() {
  buildPanel();
  document.addEventListener("atlas-forge-physical-state", (event) => updatePanel(event.detail));
  const canvas = document.querySelector("#analysis-field");
  if (canvas?.__atlasPhysicalEvidence) updatePanel(canvas.__atlasPhysicalEvidence);
}

if (typeof document !== "undefined") installPhysicalInspector();
