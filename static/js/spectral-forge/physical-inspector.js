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

/* Spatial evidence from the material layer. Every row is a value the model
 * genuinely holds and acts on; nothing here exists to make the panel look busy. */
const MATERIAL_KEYS = Object.freeze([
  ["regime", "MATERIAL REGIME"],
  ["supportStrength", "SUPPORT LOSS"],
  ["frontPosition", "PROPAGATION FRONT"],
  ["pressureStrength", "DIRECTIONAL PRESSURE"],
  ["domainDisagreement", "DOMAIN DISAGREEMENT"],
  ["stretchMagnitude", "PERSISTENT STRETCH"],
  ["fractureCharge", "FRACTURE CHARGE"],
  ["damage", "RETAINED DAMAGE"],
  ["returnPull", "RETURN PULL"],
]);

const DEVELOPMENT_KEYS = Object.freeze([
  ["fractureDrive", "FRACTURE DRIVE"],
  ["scarInfluence", "SCAR INFLUENCE"],
  ["activeSiteCount", "ACTIVE SITES"],
  ["organismLifeTime", "ORGANISM LIFE"],
  ["scenarioTime", "SCENARIO TIME"],
  ["fissionPhase", "FISSION PHASE"],
  ["fissionCount", "FISSION COUNT"],
]);

function initialText(key) {
  if (key === "fissionPhase") return "idle";
  if (key === "regime") return "coherent";
  return "0.000";
}

function numberText(value) {
  return Number.isFinite(value) ? Number(value).toFixed(3) : "0.000";
}

/* Which mechanisms are actually doing something right now.
 *
 * The panel showed twenty-odd values at equal weight, and in any given instant
 * most of them read 0.000 - measured, eleven of fifteen - which trains the eye
 * to skip the whole block. The values are all truthful and all still shown; what
 * changes is that the ones the material is currently expressing are legible at a
 * glance and the dormant ones recede. */
const ACTIVE_THRESHOLD = 0.02;

function activityOf(key, value) {
  if (key === "regime" || key === "fissionPhase") {
    return value && value !== "coherent" && value !== "idle" ? "active" : "resting";
  }
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return "resting";
  return Math.abs(numeric) > ACTIVE_THRESHOLD ? "active" : "resting";
}

function markActivity(node, key, text) {
  node.textContent = text;
  const cell = node.parentElement;
  if (cell) cell.dataset.activity = activityOf(key, text);
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

  const cellFor = ([key, text]) => {
    const cell = document.createElement("span");
    const small = document.createElement("small");
    small.textContent = text;
    const strong = document.createElement("strong");
    strong.dataset.physicalEvidence = key;
    strong.textContent = initialText(key);
    cell.append(small, strong);
    cell.dataset.activity = "resting";
    return cell;
  };

  panel.append(...[...MATERIAL_KEYS, ...PHYSICAL_KEYS].map(cellFor));

  /* Complete raw state stays available and truthful, one disclosure away. */
  const detail = document.createElement("details");
  detail.className = "forge-physical-detail";
  const summary = document.createElement("summary");
  summary.textContent = "Complete physical state";
  const grid = document.createElement("div");
  grid.className = "forge-analysis-chain";
  grid.append(...DEVELOPMENT_KEYS.map(cellFor));
  detail.append(summary, grid);

  anchor.insertAdjacentElement("afterend", label);
  label.insertAdjacentElement("afterend", panel);
  panel.insertAdjacentElement("afterend", detail);
}

function updatePanel(evidence) {
  buildPanel();
  if (!evidence) return;
  const physical = evidence.physical ?? {};
  for (const [key] of PHYSICAL_KEYS) {
    const node = document.querySelector(`[data-physical-evidence="${key}"]`);
    if (node) markActivity(node, key, numberText(physical[key]));
  }
  const values = {
    regime: String(evidence.regime ?? "coherent"),
    supportStrength: numberText(evidence.supportStrength),
    frontPosition: numberText(evidence.frontPosition),
    pressureStrength: numberText(evidence.pressureStrength),
    domainDisagreement: numberText(evidence.domainDisagreement),
    stretchMagnitude: numberText(evidence.stretchMagnitude),
    fractureCharge: numberText(evidence.fractureCharge),
    damage: numberText(evidence.damage),
    returnPull: numberText(evidence.returnPull),
    fractureDrive: numberText(evidence.fractureDrive),
    scarInfluence: numberText(evidence.scarInfluence),
    activeSiteCount: String(evidence.activeSiteCount ?? 0),
    organismLifeTime: `${Number(evidence.organismLifeTime ?? 0).toFixed(1)} s`,
    scenarioTime: `${Number(evidence.scenarioTime ?? 0).toFixed(1)} s`,
    fissionPhase: String(evidence.fissionPhase ?? "idle"),
    fissionCount: String(evidence.fissionCount ?? 0),
  };
  for (const [key, value] of Object.entries(values)) {
    const node = document.querySelector(`[data-physical-evidence="${key}"]`);
    if (node) markActivity(node, key, value);
  }
}

export function installPhysicalInspector() {
  buildPanel();
  document.addEventListener("atlas-forge-physical-state", (event) => updatePanel(event.detail));
  const canvas = document.querySelector("#analysis-field");
  if (canvas?.__atlasPhysicalEvidence) updatePanel(canvas.__atlasPhysicalEvidence);
}

if (typeof document !== "undefined") installPhysicalInspector();
