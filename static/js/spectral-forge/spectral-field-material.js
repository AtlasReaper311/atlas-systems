"use strict";

import { clamp } from "./domain.js";
import { deterministicUnit } from "./spectral-field-model.js";

/*
 * Spatial material layer for the Spectral Forge organism.
 *
 * The scalar physical state answers "how much". This module answers "where,
 * which way, and by what mechanism". Without it every condition reaches the
 * renderer as the same handful of global scalars, so every condition eventually
 * performs the same deformations at different amplitudes.
 *
 * Two rules make the regimes genuinely exclusive rather than merely louder:
 *
 *   1. A regime is classified from numeric telemetry evidence only - never from
 *      a scenario name - with dwell hysteresis so it does not flicker.
 *   2. A regime PERMITS a bounded set of physical mechanisms. A mechanism that
 *      is not permitted cannot fire however long the condition runs. Compression
 *      cannot become a fracture; viscous elongation cannot become a support
 *      collapse; oscillation cannot become sustained structural failure.
 *
 * All state is preallocated and mutated in place. Nothing here allocates per
 * frame, and nothing here calls Math.random().
 */

export const MATERIAL_REGIMES = Object.freeze([
  "coherent",
  "compressed",
  "support-loss",
  "oscillating",
  "viscous",
  "structural-failure",
  "reassembly",
]);

/* Which mechanisms each regime may express. This table is the exclusivity
 * contract: it is why a long Traffic Spike never becomes a Cache Collapse. */
const REGIME_PERMITS = Object.freeze({
  coherent: Object.freeze({
    pressureAxis: false, supportOrigin: false, domainSplit: false,
    persistentStretch: false, fracture: false, fission: false, recoveryPull: false,
  }),
  compressed: Object.freeze({
    pressureAxis: true, supportOrigin: false, domainSplit: false,
    persistentStretch: false, fracture: false, fission: false, recoveryPull: false,
  }),
  "support-loss": Object.freeze({
    pressureAxis: true, supportOrigin: true, domainSplit: false,
    persistentStretch: false, fracture: false, fission: false, recoveryPull: false,
  }),
  oscillating: Object.freeze({
    pressureAxis: false, supportOrigin: false, domainSplit: true,
    persistentStretch: false, fracture: false, fission: false, recoveryPull: false,
  }),
  viscous: Object.freeze({
    pressureAxis: false, supportOrigin: false, domainSplit: false,
    persistentStretch: true, fracture: false, fission: false, recoveryPull: false,
  }),
  "structural-failure": Object.freeze({
    pressureAxis: true, supportOrigin: true, domainSplit: true,
    persistentStretch: true, fracture: true, fission: true, recoveryPull: false,
  }),
  reassembly: Object.freeze({
    pressureAxis: false, supportOrigin: false, domainSplit: false,
    persistentStretch: false, fracture: false, fission: false, recoveryPull: true,
  }),
});

export const MATERIAL_SITE_COUNT = 7;
const MAX_SCARS = 4;

/* A challenger must lead the incumbent by this margin for this long before the
 * material changes regime. Short enough to be recognised inside the 3-8s
 * window, long enough that Flapping's 5.2s cycle does not thrash the model. */
const REGIME_MARGIN = 0.045;
const REGIME_DWELL = 0.75;

/* Structural failure has to be earned by stress the body could not absorb, not
 * merely reached by a high instantaneous reading. */
const FRACTURE_CHARGE = 1.0;
const FISSION_CHARGE = 1.85;

/* Severe damage stays visible for roughly 20-30 seconds of organism life. */
const DAMAGE_HALF_LIFE = 7.5;

/* Normalised signal velocity that counts as a full-strength trend. The synthetic
 * scenarios move slowly - a recovering deployment sheds latency at roughly
 * 0.02/s - so raw velocities must be scaled before they can drive a regime. */
const TREND_SCALE = 0.05;

/* A trend excursion below this is not a direction, so it cannot start or end a
 * reversal. Reversals are counted between significant excursions rather than
 * between consecutive frames, where the signal is near zero at the crossing. */
const REVERSAL_THRESHOLD = 0.06;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function approach(current, target, dt, tau) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / Math.max(0.02, tau)));
}

function setUnit(target, x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  target.x = x / length;
  target.y = y / length;
  target.z = z / length;
  return target;
}

/* Deterministic direction from a stable seed lane. Origins therefore vary by
 * run without ever becoming permanent anatomy. */
function seededAxis(target, seed, lane) {
  const angle = deterministicUnit(seed, lane) * Math.PI * 2;
  const y = deterministicUnit(seed, lane + 1) * 1.4 - 0.7;
  const radius = Math.sqrt(Math.max(0.06, 1 - y * y));
  return setUnit(target, Math.cos(angle) * radius, y, 0.24 + Math.sin(angle) * radius * 0.6);
}

/* Rotates an axis toward a target no faster than `rate` radians per second, so
 * a persistent direction reads as one sustained axis rather than per-frame
 * noise. */
function rotateToward(axis, tx, ty, tz, dt, rate) {
  const step = clamp(rate * dt, 0, 1);
  return setUnit(axis, axis.x + (tx - axis.x) * step, axis.y + (ty - axis.y) * step, axis.z + (tz - axis.z) * step);
}

function vec() {
  return { x: 0, y: 1, z: 0 };
}

export function createMaterialState(seed = 0.731) {
  const scars = [];
  for (let i = 0; i < MAX_SCARS; i += 1) {
    scars.push({ x: 0, y: 1, z: 0, strength: 0, createdAt: 0, halfLife: 12, active: false });
  }
  const sites = [];
  for (let i = 0; i < MATERIAL_SITE_COUNT; i += 1) {
    sites.push({ x: 0, y: 1, z: 0, polarity: 1, strength: 0, extent: 0.9, kind: "idle" });
  }
  return {
    seed,
    lastTime: null,

    regime: "coherent",
    regimeAge: 0,
    candidate: "coherent",
    candidateAge: 0,
    permits: REGIME_PERMITS.coherent,
    scores: {
      coherent: 1, compressed: 0, "support-loss": 0, oscillating: 0,
      viscous: 0, "structural-failure": 0, reassembly: 0,
    },

    oscillation: 0,
    lastTrendSign: 0,
    stretchPersistence: 0,
    accumulatedStress: 0,
    damage: 0,

    supportOrigin: vec(),
    supportStrength: 0,
    supportSet: false,
    supportSetAt: 0,
    frontPosition: 0,
    frontStrength: 0,

    stretchAxis: vec(),
    stretchMagnitude: 0,

    pressureAxis: vec(),
    pressureStrength: 0,

    domainA: vec(),
    domainB: vec(),
    domainDisagreement: 0,
    domainPhase: 0,

    fractureAxis: vec(),
    fractureCharge: 0,
    fractureReady: false,

    returnPull: 0,
    scars,
    scarInfluence: 0,
    sites,
    activeSiteCount: 0,
  };
}

export function resetMaterialState(model) {
  if (!model) return model;
  const fresh = createMaterialState(model.seed);
  for (const key of Object.keys(fresh)) {
    const value = fresh[key];
    if (Array.isArray(value) || (value && typeof value === "object" && !Object.isFrozen(value))) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) Object.assign(model[key][i], value[i]);
        continue;
      }
      Object.assign(model[key], value);
      continue;
    }
    model[key] = value;
  }
  return model;
}

function scoreRegimes(model, e) {
  const s = model.scores;

  /* Demand-led loading with the dependency layer intact. */
  s.compressed = clamp(
    (e.demand * 0.56 + e.cpu * 0.16 + e.queue * 0.12 + e.requestRise * 0.16)
    * (1 - e.supportLoss * 0.75)
    * (1 - e.errors * 0.6),
  );

  /* Support failed here first and downstream has not caught up yet. The lead
   * term is what makes this readable as a local origin rather than global load. */
  const lead = clamp(e.supportLoss - e.downstream * 0.85);
  s["support-loss"] = clamp(e.supportLoss * (0.34 + lead * 0.66) + e.supportLossRise * 0.28);

  /* Repeated reversal with the dependency layer intact and demand steady. */
  s.oscillating = clamp(
    (e.oscillation * 0.66 + e.errors * 0.22 + e.downstream * 0.12)
    * (1 - e.supportLoss * 0.8)
    * (1 - e.demand * 0.4),
  );

  /* Delay and backlog accumulating without error escalation or reversal. */
  s.viscous = clamp(
    (e.latency * 0.46 + e.queue * 0.24 + e.persistence * 0.3)
    * (1 - e.errors * 2.1)
    * (1 - e.oscillation * 0.85)
    * (1 - e.supportLoss * 0.7),
  );

  /* Multi-layer severity the body has already failed to absorb. Error
   * escalation is the gate: heavy load that the dependency layer is still
   * serving without erroring is pressure, not structural failure. */
  const failureCore = clamp(e.errors * 0.46 + e.queue * 0.24 + e.latency * 0.18 + e.cpu * 0.12);
  s["structural-failure"] = clamp(
    failureCore
      * clamp(0.15 + e.errors * 1.5)
      * clamp(0.3 + model.accumulatedStress * 0.7)
    + model.damage * e.errors * 0.3,
  );

  /* Conditions improving while the body still carries consequence. A body that
   * keeps re-failing is not recovering, so reversal energy suppresses this:
   * otherwise every downswing of an alternating condition reads as healing. */
  s.reassembly = clamp(e.settling * (0.72 + model.damage * 0.75) * (1 - e.oscillation * 0.9));

  /* Reassembly is excluded from severity: it is what replaces the coherent
   * reading, not evidence of it. A body carrying damage or actively re-cohering
   * is not in the steady reference regime, which is what keeps residual history
   * visible after a failure instead of snapping back to healthy. */
  let severity = 0;
  for (const key of MATERIAL_REGIMES) {
    if (key !== "coherent" && key !== "reassembly") severity = Math.max(severity, s[key]);
  }
  s.coherent = clamp(1 - severity * 1.32)
    * clamp(1 - model.damage * 0.85)
    * clamp(1 - e.settling * 1.35);
  return s;
}

function selectRegime(model, dt) {
  const s = model.scores;
  let best = MATERIAL_REGIMES[0];
  let bestScore = -Infinity;
  for (const key of MATERIAL_REGIMES) {
    if (s[key] > bestScore) {
      bestScore = s[key];
      best = key;
    }
  }

  if (best === model.regime) {
    model.candidate = best;
    model.candidateAge = 0;
    model.regimeAge += dt;
    return;
  }

  if (bestScore < s[model.regime] + REGIME_MARGIN) {
    model.candidateAge = 0;
    model.regimeAge += dt;
    return;
  }

  model.candidateAge = model.candidate === best ? model.candidateAge + dt : 0;
  model.candidate = best;
  if (model.candidateAge < REGIME_DWELL) {
    model.regimeAge += dt;
    return;
  }

  model.regime = best;
  model.permits = REGIME_PERMITS[best];
  model.regimeAge = 0;
  model.candidateAge = 0;
}

function updateSpatial(model, e, dt, lifeTime) {
  const permits = model.permits;
  const seed = model.seed;

  /* Directional pressure region: one dominant loaded direction that holds while
   * demand holds, so Traffic reads as loading rather than noise. */
  if (permits.pressureAxis && e.demand + e.cpu > 0.5) {
    if (model.pressureStrength < 0.02) seededAxis(model.pressureAxis, seed, 3100 + Math.floor(lifeTime / 30) * 2);
    model.pressureStrength = approach(model.pressureStrength, clamp(e.demand * 0.7 + e.cpu * 0.3), dt, 1.4);
  } else {
    model.pressureStrength = approach(model.pressureStrength, 0, dt, 2.6);
  }

  /* Support-loss origin: chosen once, held long enough to be perceptible, with
   * a front that travels away from it. */
  if (permits.supportOrigin && e.supportLoss > 0.34) {
    if (!model.supportSet) {
      seededAxis(model.supportOrigin, seed, 4100 + Math.floor(lifeTime / 41) * 2);
      model.supportSet = true;
      model.supportSetAt = lifeTime;
      model.frontPosition = 0;
    }
    model.supportStrength = approach(model.supportStrength, clamp(e.supportLoss), dt, 0.9);
    model.frontPosition = clamp(model.frontPosition + dt * (0.1 + e.supportLossRise * 0.22 + e.downstream * 0.14));
    model.frontStrength = clamp(model.supportStrength * (1 - Math.abs(model.frontPosition - 0.5) * 0.9));
  } else {
    model.supportStrength = approach(model.supportStrength, 0, dt, 4.5);
    model.frontStrength = approach(model.frontStrength, 0, dt, 3.2);
    if (model.supportStrength < 0.05) model.supportSet = false;
  }

  /* Persistent elongation axis: rotates slowly so late Creep has one long
   * silhouette rather than a direction that changes every few frames. */
  if (permits.persistentStretch && e.latency > 0.2) {
    if (model.stretchMagnitude < 0.02) seededAxis(model.stretchAxis, seed, 5100 + Math.floor(lifeTime / 53) * 2);
    else rotateToward(model.stretchAxis, model.stretchAxis.x, model.stretchAxis.y, model.stretchAxis.z, dt, 0.04);
    model.stretchMagnitude = approach(model.stretchMagnitude, clamp(e.latency * 0.68 + e.queue * 0.32), dt, 3.4);
  } else {
    model.stretchMagnitude = approach(model.stretchMagnitude, 0, dt, 9);
  }

  /* Competing domains: two axes that fall out of phase and repeatedly weaken
   * and restore the boundary between them. */
  if (permits.domainSplit && e.oscillation > 0.12) {
    if (model.domainDisagreement < 0.02) {
      seededAxis(model.domainA, seed, 6100);
      setUnit(model.domainB, -model.domainA.x * 0.86 + 0.2, -model.domainA.y * 0.9, -model.domainA.z * 0.7 + 0.3);
    }
    model.domainPhase += dt * (0.62 + e.oscillation * 0.9);
    model.domainDisagreement = approach(model.domainDisagreement, clamp(e.oscillation * 0.72 + e.errors * 0.28), dt, 0.55);
  } else {
    model.domainDisagreement = approach(model.domainDisagreement, 0, dt, 1.6);
  }

  /* Fracture candidate: charges only while the regime permits it and only from
   * stress the body could not absorb. */
  if (permits.fracture) {
    if (model.fractureCharge < 0.02) seededAxis(model.fractureAxis, seed, 7100 + Math.floor(lifeTime / 67) * 2);
    /* Error escalation is what turns absorbed load into propagating structural
     * damage, so it accelerates the charge rather than merely permitting it. */
    model.fractureCharge = Math.min(3, model.fractureCharge + dt * clamp(e.unabsorbed) * (1.15 + e.errors * 1.1));
  } else {
    model.fractureCharge = Math.max(0, model.fractureCharge - dt * 0.5);
  }
  model.fractureReady = permits.fracture && model.fractureCharge >= FRACTURE_CHARGE;

  model.returnPull = permits.recoveryPull
    ? approach(model.returnPull, clamp(e.settling * 0.72 + model.damage * 0.28), dt, 1.1)
    : approach(model.returnPull, 0, dt, 3.4);
}

function updateScars(model, lifeTime) {
  let influence = 0;
  for (const scar of model.scars) {
    if (!scar.active) continue;
    const age = Math.max(0, lifeTime - scar.createdAt);
    const current = scar.strength * (2 ** (-age / Math.max(1, scar.halfLife)));
    if (current < 0.03) {
      scar.active = false;
      continue;
    }
    influence += current * 0.45;
  }
  model.scarInfluence = clamp(influence);
}

export function recordMaterialScar(model, axis, strength, lifeTime, halfLife = 12) {
  if (!model || !axis || strength < 0.2) return null;
  let slot = model.scars.find((scar) => !scar.active);
  if (!slot) {
    slot = model.scars[0];
    for (const scar of model.scars) if (scar.createdAt < slot.createdAt) slot = scar;
  }
  slot.x = axis.x;
  slot.y = axis.y;
  slot.z = axis.z;
  slot.strength = clamp(strength);
  slot.createdAt = lifeTime;
  slot.halfLife = halfLife;
  slot.active = true;
  return slot;
}

function pushSite(model, index, axis, polarity, strength, extent, kind) {
  if (index >= MATERIAL_SITE_COUNT || strength <= 0.004) return index;
  const site = model.sites[index];
  site.x = axis.x;
  site.y = axis.y;
  site.z = axis.z;
  site.polarity = polarity;
  site.strength = clamp(strength);
  site.extent = extent;
  site.kind = kind;
  return index + 1;
}

/* Publishes the regime as a bounded set of spatial sites the renderer maps onto
 * its existing field slots. This is what makes the regime visible without
 * introducing a second renderer or a scenario-keyed pose. */
function updateSites(model, e) {
  let index = 0;

  if (model.supportStrength > 0.05) {
    /* Negative polarity: material is pulled in where support was lost. */
    index = pushSite(model, index, model.supportOrigin, -1, model.supportStrength * 0.95, 0.62, "support-loss");
    if (model.frontStrength > 0.05) {
      const travel = model.frontPosition * 2 - 1;
      const front = model.sites[Math.min(index, MATERIAL_SITE_COUNT - 1)];
      front.x = -model.supportOrigin.x * travel;
      front.y = -model.supportOrigin.y * travel;
      front.z = -model.supportOrigin.z * travel;
      front.polarity = 1;
      front.strength = clamp(model.frontStrength * 0.8);
      front.extent = 0.78 + model.frontPosition * 0.3;
      front.kind = "propagation-front";
      index = Math.min(index + 1, MATERIAL_SITE_COUNT);
    }
  }

  if (model.pressureStrength > 0.05) {
    index = pushSite(model, index, model.pressureAxis, 1, model.pressureStrength * 0.7, 0.95, "pressure-front");
  }

  if (model.domainDisagreement > 0.05) {
    /* Two domains trading dominance, not one domain changing its mind.
     *
     * This previously took the sign of sin(domainPhase) as the polarity while
     * holding strength at half disagreement or more. At the zero crossing the
     * polarity inverted in a single frame with the force still at half
     * amplitude, so the shader field went from a substantial outward push to a
     * substantial inward pull between two frames - the visible snap in Service
     * Flapping.
     *
     * Each domain now keeps its own fixed polarity and its own axis, and only
     * the share of the disagreement moves between them. Every value is
     * continuous through the crossing, where both sites sit at half strength
     * pulling against each other, which is what disagreement physically is. The
     * material stays as unstable and indecisive as before; nothing teleports. */
    const swing = Math.sin(model.domainPhase);
    const share = 0.5 + swing * 0.5;
    /* Both domains stay engaged throughout - the argument never stops, only its
     * balance moves - and the whole disagreement breathes with the swing so the
     * body still surges rather than merely leaning. Sharing the disagreement
     * without these terms halved the visible excursion, which would have traded
     * the snap for a duller Flapping. */
    const breath = 0.78 + Math.abs(swing) * 0.42;
    index = pushSite(model, index, model.domainA, 1, model.domainDisagreement * (0.5 + share * 0.5) * breath, 0.85, "domain");
    index = pushSite(model, index, model.domainB, -1, model.domainDisagreement * (1 - share * 0.5) * breath, 0.85, "domain");
  }

  if (model.stretchMagnitude > 0.05) {
    index = pushSite(model, index, model.stretchAxis, 1, model.stretchMagnitude * 0.6, 1.35, "elongation");
  }

  if (model.fractureCharge > 0.25) {
    index = pushSite(model, index, model.fractureAxis, -1, clamp(model.fractureCharge / FRACTURE_CHARGE) * 0.8, 0.55, "fracture");
  }

  for (const scar of model.scars) {
    if (!scar.active || index >= MATERIAL_SITE_COUNT) continue;
    index = pushSite(model, index, scar, 1, scar.strength * 0.3, 0.5, "scar");
  }

  for (let i = index; i < MATERIAL_SITE_COUNT; i += 1) {
    model.sites[i].strength = 0;
    model.sites[i].kind = "idle";
  }
  model.activeSiteCount = index;
  return index;
}

export function stepMaterialState(model, {
  signals,
  trends,
  physical,
  lifeTime,
  dt,
} = {}) {
  if (!model) return null;
  const now = Math.max(0, finite(lifeTime));
  const step = clamp(finite(dt, 0.016), 0.001, 0.05);
  if (model.lastTime != null && now + 0.0001 < model.lastTime) resetMaterialState(model);
  model.lastTime = now;

  const demand = clamp(signals.request_rate);
  const latency = clamp(signals.latency_ms);
  const errors = clamp(signals.error_rate);
  const queue = clamp(signals.queue_depth);
  const supportLoss = clamp(1 - signals.cache_hit_rate);
  const cpu = clamp(signals.cpu_load);

  const downstream = clamp(latency * 0.4 + queue * 0.36 + errors * 0.24);
  const rise = (value) => clamp(Math.max(0, value) / TREND_SCALE);
  const fall = (value) => clamp(Math.max(0, -value) / TREND_SCALE);
  const requestRise = rise(trends.request_rate);
  const supportLossRise = fall(trends.cache_hit_rate);

  /* Reversal energy separates alternating conditions from monotonic ones.
   * Reversals are measured between significant excursions, because a smooth
   * signal is momentarily near zero at the crossing itself. */
  const downstreamTrend = trends.latency_ms * 0.5 + trends.error_rate * 0.5;
  if (Math.abs(downstreamTrend) > REVERSAL_THRESHOLD) {
    const sign = Math.sign(downstreamTrend);
    if (model.lastTrendSign !== 0 && sign !== model.lastTrendSign) {
      model.oscillation = clamp(model.oscillation + 0.45);
    }
    model.lastTrendSign = sign;
  }
  /* Decays slower than the fastest alternation so a sustained cycle holds the
   * regime through its own quiet half rather than flickering with it. */
  model.oscillation = clamp(model.oscillation - step / 11);

  /* Monotonic accumulation separates creeping delay from oscillation. */
  const growing = latency > 0.18 && trends.latency_ms >= -0.04 && errors < 0.14;
  model.stretchPersistence = clamp(growing
    ? model.stretchPersistence + step / 14
    : model.stretchPersistence - step / 4);

  const settling = clamp(
    fall(trends.latency_ms) * 0.42
    + fall(trends.error_rate) * 0.46
    + fall(trends.queue_depth) * 0.34
    + rise(trends.cache_hit_rate) * 0.38,
  );

  /* Stress the body could not absorb. Surface tension and cohesion set the
   * absorbing capacity, so an already-damaged body fails sooner. */
  const load = clamp(errors * 0.3 + queue * 0.22 + supportLoss * 0.2 + latency * 0.16 + cpu * 0.12);
  const capacity = clamp(clamp(physical?.cohesion ?? 1) * 0.6 + clamp(physical?.surfaceTension ?? 1) * 0.4);
  const unabsorbed = clamp((load - capacity * 0.78) * 2.2);
  model.accumulatedStress = Math.min(3, Math.max(0, model.accumulatedStress + step * (unabsorbed * 1.1 - (unabsorbed > 0 ? 0 : 0.24))));

  /* Persistent damage: accumulates from unabsorbed stress, decays over roughly
   * 20-30 seconds so the next condition acts on a body that still remembers. */
  const damageTarget = clamp(unabsorbed * 0.9 + clamp(1 - (physical?.cohesion ?? 1)) * 0.5);
  model.damage = damageTarget > model.damage
    ? approach(model.damage, damageTarget, step, 1.6)
    : Math.max(0, model.damage * (2 ** (-step / DAMAGE_HALF_LIFE)));

  const evidence = {
    demand, latency, errors, queue, supportLoss, cpu,
    downstream, requestRise, supportLossRise, settling, unabsorbed,
    oscillation: model.oscillation,
    persistence: model.stretchPersistence,
  };

  scoreRegimes(model, evidence);
  selectRegime(model, step);
  updateSpatial(model, evidence, step, now);
  updateScars(model, now);
  updateSites(model, evidence);
  return model;
}

export function materialFissionReady(model) {
  return Boolean(model?.permits?.fission) && (model?.fractureCharge ?? 0) >= FISSION_CHARGE;
}

export function materialEvidence(model) {
  if (!model) return null;
  return {
    regime: model.regime,
    regimeAge: model.regimeAge,
    damage: model.damage,
    accumulatedStress: model.accumulatedStress,
    oscillation: model.oscillation,
    persistence: model.stretchPersistence,
    supportStrength: model.supportStrength,
    frontPosition: model.frontPosition,
    domainDisagreement: model.domainDisagreement,
    stretchMagnitude: model.stretchMagnitude,
    pressureStrength: model.pressureStrength,
    fractureCharge: model.fractureCharge,
    fractureReady: model.fractureReady,
    returnPull: model.returnPull,
    scarInfluence: model.scarInfluence,
    activeSiteCount: model.activeSiteCount,
  };
}
