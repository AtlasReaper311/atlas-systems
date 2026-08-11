/**
 * Atlas APU mix graph and directive wiring.
 *
 * The engine constructs every bus through createMixBus, so filters, ducking
 * gains, spatial nodes, main outputs, and auxiliary sends are explicit. No
 * existing connection is removed or guessed after graph construction.
 */

export const APU_MIX_WIRING_BUILD_ID = "20260727-apu-mix-wiring-v2";

const BUS_NAMES = Object.freeze([
  "primary", "secondary", "bass", "pad", "services", "drums", "accent",
]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const dbToGain = (db) => Math.pow(10, -clamp(db, 0, 24) / 20);

function connect(source, target) {
  if (!source || !target || typeof source.connect !== "function") {
    throw new Error("apu-mix-wiring: graph endpoint is not connectable");
  }
  source.connect(target);
}

function makeSpatialNode(Tone, busName) {
  if ((busName === "pad" || busName === "accent") && typeof Tone.StereoWidener === "function") {
    return { node: new Tone.StereoWidener(0.5), kind: "widener" };
  }
  return { node: new Tone.Gain(1), kind: "unity" };
}

/**
 * Build a complete bus insert without disconnecting any existing route.
 */
export function createMixBus(Tone, {
  name,
  downstream,
  initialGain = 0,
  auxiliarySends = [],
} = {}) {
  if (!BUS_NAMES.includes(name)) throw new Error(`apu-mix-wiring: unknown bus ${name}`);
  if (!downstream) throw new Error(`apu-mix-wiring: ${name} downstream is required`);
  const input = new Tone.Gain(initialGain);
  const highcut = new Tone.Filter({ type: "lowpass", frequency: 12000, Q: 0.5, rolloff: -12 });
  const duck = new Tone.Gain(1);
  const spatial = makeSpatialNode(Tone, name);
  input.chain(highcut, duck, spatial.node);
  connect(spatial.node, downstream);
  for (const send of auxiliarySends) connect(spatial.node, send);

  let disposed = false;
  return Object.freeze({
    name,
    input,
    highcut,
    duck,
    spatial: spatial.node,
    spatialKind: spatial.kind,
    downstream,
    auxiliarySends: Object.freeze([...auxiliarySends]),
    dispose() {
      if (disposed) return;
      disposed = true;
      input.dispose?.();
      highcut.dispose?.();
      duck.dispose?.();
      spatial.node.dispose?.();
    },
  });
}

function centsToDepthHz(centreHz, depthCents) {
  const centre = clamp(centreHz, 20, 20000);
  return centre * (Math.pow(2, clamp(depthCents, 0, 200) / 1200) - 1);
}

function setParam(parameter, value, duration, at, safeRamp) {
  if (!parameter) return;
  safeRamp(parameter, value, duration, at);
}

/**
 * Attach directive ownership to an already explicit graph.
 */
export function attachMixWiring(Tone, {
  buses,
  masterFilter,
  softenerShelf,
  compressor,
  primaryPanner = null,
  secondaryPanner = null,
  servicePanners = [],
} = {}) {
  for (const name of BUS_NAMES) {
    if (!buses?.[name]) throw new Error(`apu-mix-wiring: missing ${name} bus`);
  }
  if (!masterFilter?.frequency || !compressor) {
    throw new Error("apu-mix-wiring: master nodes are incomplete");
  }

  const wobbleLfo = new Tone.LFO({ frequency: 0.22, min: -1, max: 1, type: "sine" });
  const wobbleDepth = new Tone.Gain(0);
  wobbleLfo.connect(wobbleDepth);
  wobbleDepth.connect(masterFilter.frequency);
  wobbleLfo.start();

  let gainMultipliers = Object.freeze({});
  let rulesBySource = new Map();
  let disposed = false;
  const lastApplied = { directive: null, compression: null };

  function configureSpatial(busName, width, duration, at, safeRamp) {
    const bounded = clamp(width, 0, 1);
    if (busName === "primary") setParam(primaryPanner?.pan, -0.42 * bounded, duration, at, safeRamp);
    if (busName === "secondary") setParam(secondaryPanner?.pan, 0.42 * bounded, duration, at, safeRamp);
    if (busName === "services") {
      for (const entry of servicePanners) {
        const base = clamp(entry.basePan ?? 0, -1, 1);
        setParam(entry.panner?.pan, base * bounded, duration, at, safeRamp);
      }
    }
    const handle = buses[busName];
    if (handle.spatialKind === "widener") setParam(handle.spatial.width, bounded, duration, at, safeRamp);
  }

  const handle = Object.freeze({
    buildId: APU_MIX_WIRING_BUILD_ID,
    buses,
    wobbleLfo,
    wobbleDepth,

    applyDirective(directive, {
      at = undefined,
      duration = 0.18,
      compressionTarget = null,
      safeRamp,
    } = {}) {
      if (!directive || typeof safeRamp !== "function") {
        return Object.freeze({ applied: [], skipped: ["directive"] });
      }
      const applied = [];
      const multipliers = {};
      for (const name of BUS_NAMES) {
        const spec = directive.buses?.[name];
        if (!spec) continue;
        multipliers[name] = clamp(spec.gainMul, 0.3, 1.2);
        setParam(buses[name].highcut.frequency, clamp(spec.highcutHz, 200, 20000), duration, at, safeRamp);
        configureSpatial(name, spec.width, duration, at, safeRamp);
        applied.push(`bus:${name}`);
      }
      gainMultipliers = Object.freeze(multipliers);

      const nextRules = new Map();
      for (const rule of directive.ducking ?? []) {
        if (!buses[rule.target]) continue;
        const source = String(rule.source);
        if (!nextRules.has(source)) nextRules.set(source, []);
        nextRules.get(source).push(Object.freeze({
          source,
          target: rule.target,
          depthDb: clamp(rule.depthDb, 0, 6),
          releaseMs: clamp(rule.releaseMs, 20, 400),
        }));
      }
      rulesBySource = nextRules;
      applied.push(`ducking:${[...nextRules.values()].flat().length}`);

      const baseThreshold = clamp(compressionTarget?.threshold ?? -18, -30, 0);
      const baseRatio = clamp(compressionTarget?.ratio ?? 1.7, 1, 8);
      const transient = directive.transientSoftener ?? {};
      const resolvedThreshold = clamp(baseThreshold * 0.78 + clamp(transient.thresholdDb, -30, 0) * 0.22, -30, 0);
      const resolvedRatio = clamp(Math.max(baseRatio, transient.ratio ?? 1), 1, 8);
      const resolvedAttack = clamp(compressionTarget?.attack ?? 0.022, 0.001, 1);
      const resolvedRelease = clamp(compressionTarget?.release ?? 0.24, 0.02, 2);
      setParam(compressor.threshold, resolvedThreshold, duration, at, safeRamp);
      setParam(compressor.ratio, resolvedRatio, duration, at, safeRamp);
      setParam(compressor.attack, resolvedAttack, duration, at, safeRamp);
      setParam(compressor.release, resolvedRelease, duration, at, safeRamp);
      if (softenerShelf) {
        setParam(softenerShelf.frequency, clamp(transient.freqHz, 500, 12000), duration, at, safeRamp);
        const shaveDb = -clamp((resolvedRatio - 1) * 0.75, 0, 3.5);
        setParam(softenerShelf.gain, shaveDb, duration, at, safeRamp);
      }
      applied.push("master:dynamics");

      const wobble = directive.chipWobble ?? {};
      setParam(wobbleLfo.frequency, clamp(wobble.rateHz, 0.05, 4), duration, at, safeRamp);
      const centre = Number(masterFilter.frequency.value) || 8000;
      setParam(wobbleDepth.gain, centsToDepthHz(centre, wobble.depthCents), duration, at, safeRamp);
      applied.push("master:wobble");
      lastApplied.directive = directive;
      lastApplied.compression = Object.freeze({
        threshold: resolvedThreshold,
        ratio: resolvedRatio,
        attack: resolvedAttack,
        release: resolvedRelease,
      });
      return Object.freeze({ applied: Object.freeze(applied), skipped: Object.freeze([]) });
    },

    duckOnHit(source, time) {
      if (disposed || !Number.isFinite(time)) return 0;
      const rules = rulesBySource.get(String(source)) ?? [];
      for (const rule of rules) {
        const parameter = buses[rule.target].duck.gain;
        const targetGain = dbToGain(rule.depthDb);
        const attackEnd = time + 0.006;
        const releaseEnd = attackEnd + rule.releaseMs / 1000;
        parameter.cancelAndHoldAtTime?.(time);
        if (typeof parameter.setValueAtTime === "function") {
          const current = Number.isFinite(parameter.value) ? parameter.value : 1;
          parameter.setValueAtTime(current, time);
        }
        parameter.linearRampToValueAtTime?.(targetGain, attackEnd);
        if (typeof parameter.exponentialRampToValueAtTime === "function") {
          parameter.exponentialRampToValueAtTime(1, releaseEnd);
        } else {
          parameter.linearRampToValueAtTime?.(1, releaseEnd);
        }
      }
      return rules.length;
    },

    getGainMultiplier(name) {
      return clamp(gainMultipliers[name] ?? 1, 0.3, 1.2);
    },

    getRulesForSource(source) {
      return Object.freeze([...(rulesBySource.get(String(source)) ?? [])]);
    },

    getLastApplied() {
      return Object.freeze({ ...lastApplied });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      wobbleLfo.stop?.();
      wobbleLfo.dispose?.();
      wobbleDepth.dispose?.();
      rulesBySource = new Map();
    },
  });
  return handle;
}

export function translationNotes() {
  return Object.freeze({
    primaryWidth: "single owner: primary voice panner",
    secondaryWidth: "single owner: secondary voice panner",
    serviceWidth: "scales deterministic service-pool pan positions",
    padWidth: "Tone.StereoWidener when available",
    accentWidth: "Tone.StereoWidener when available",
    bassWidth: "mono by design",
    drumsWidth: "centred by design",
    ducking: "one gain per target bus; every source rule automates that shared gain",
    effects: "auxiliary sends connect from the explicit post-insert bus output",
  });
}
