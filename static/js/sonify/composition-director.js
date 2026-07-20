import { clamp, stableHash } from "./mapping.js?v=20260720-system-symphony-loop-production-v2";

/**
 * Phrase-level musical direction for live System SYMPHONY playback.
 *
 * Raw telemetry never enters this module. It consumes only the bounded score
 * frame produced by mapping.js and the smoothed modulation vector produced by
 * modulation.js. The director converts those controls into musical intention,
 * phrase phases and repeatable motif transformations.
 */

export const COMPOSITION_DIRECTOR_VERSION = 1;
export const LIVE_COMPOSITION_SEED = "ATLAS-SYSTEMS-LIVE";
export const PHRASE_STEPS = 32;
// The live transport runs at one fixed tempo for every state. See livePerformanceFields.
export const LOCKED_TRANSPORT_BPM = 100;
export const ATLAS_MOTIF_DEGREES = Object.freeze([0, 2, 4, 1, 5, 4, 2, 0]);
export const MUSICAL_PHASES = Object.freeze([
  "establish",
  "develop",
  "intensify",
  "destabilise",
  "peak",
  "release",
  "recover",
  "breathe",
]);

const STATE_BASE = Object.freeze({
  healthy: Object.freeze({ tension: 0.14, urgency: 0.12, density: 0.48, instability: 0.08, brightness: 0.86, rhythm: 0.46 }),
  warning: Object.freeze({ tension: 0.5, urgency: 0.5, density: 0.65, instability: 0.42, brightness: 0.58, rhythm: 0.7 }),
  critical: Object.freeze({ tension: 0.92, urgency: 0.94, density: 0.82, instability: 0.76, brightness: 0.4, rhythm: 0.9 }),
  unknown: Object.freeze({ tension: 0.28, urgency: 0.12, density: 0.24, instability: 0.34, brightness: 0.32, rhythm: 0.2 }),
});

export const PHASE_MIX = Object.freeze({
  establish: Object.freeze({ drums: 0.72, bass: 0.76, pad: 1.08, melody: 0.72, texture: 0.88, services: 0.82, accent: 0.4, filter: 0.9, drive: 0.7 }),
  develop: Object.freeze({ drums: 0.92, bass: 0.94, pad: 0.94, melody: 0.94, texture: 0.92, services: 0.94, accent: 0.55, filter: 1, drive: 0.86 }),
  intensify: Object.freeze({ drums: 1.04, bass: 1.02, pad: 0.86, melody: 1.04, texture: 0.96, services: 1, accent: 0.7, filter: 1.06, drive: 1 }),
  destabilise: Object.freeze({ drums: 1.06, bass: 1.04, pad: 0.72, melody: 0.92, texture: 1.1, services: 0.88, accent: 0.82, filter: 0.9, drive: 1.12 }),
  peak: Object.freeze({ drums: 1.12, bass: 1.08, pad: 0.64, melody: 1, texture: 1.04, services: 0.9, accent: 1, filter: 0.96, drive: 1.2 }),
  release: Object.freeze({ drums: 0.68, bass: 0.76, pad: 1.04, melody: 0.72, texture: 1, services: 0.72, accent: 0.45, filter: 0.86, drive: 0.72 }),
  recover: Object.freeze({ drums: 0.78, bass: 0.82, pad: 1.14, melody: 1.08, texture: 0.88, services: 0.82, accent: 0.55, filter: 1.08, drive: 0.68 }),
  breathe: Object.freeze({ drums: 0.44, bass: 0.54, pad: 1.16, melody: 0.52, texture: 1.08, services: 0.58, accent: 0.3, filter: 0.78, drive: 0.52 }),
});

const PHASE_MIN_AGE = Object.freeze({
  establish: 1,
  develop: 1,
  intensify: 1,
  destabilise: 1,
  peak: 1,
  release: 1,
  recover: 1,
  breathe: 1,
});

const PHASE_MAX_AGE = Object.freeze({
  establish: 3,
  develop: 4,
  intensify: 3,
  destabilise: 3,
  peak: 2,
  release: 2,
  recover: 3,
  breathe: 2,
});

const MOTIF_PATTERNS = Object.freeze([
  Object.freeze([0, 3, 6, 10, 16, 19, 22, 26]),
  Object.freeze([0, 4, 7, 11, 16, 20, 23, 27]),
  Object.freeze([0, 3, 8, 11, 16, 19, 24, 27]),
  Object.freeze([0, 5, 7, 12, 16, 21, 23, 28]),
]);

function bounded(value) {
  return Number(clamp(value, 0, 1).toFixed(4));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizedState(value) {
  return STATE_BASE[value] ? value : "unknown";
}

function deterministicUnit(seed) {
  return stableHash(seed) / 0xffffffff;
}

function modulo(value, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  return ((Math.trunc(value) % length) + length) % length;
}

export function deriveMusicalIntent(frame = {}) {
  const state = normalizedState(frame.scoreState);
  const base = STATE_BASE[state];
  const modulation = frame.modulation ?? {};
  const pressure = bounded(finite(modulation.pressure, frame.tension ?? base.tension));
  const incidentPressure = bounded(finite(modulation.incidentPressure, frame.activeIncidents > 0 ? 0.5 : 0));
  const errorPressure = bounded(finite(modulation.errorPressure));
  const latencyPressure = bounded(finite(modulation.latencyPressure));
  const healthPressure = bounded(finite(modulation.healthPressure, 1 - finite(frame.overallHealth, 1)));
  const coveragePressure = bounded(finite(modulation.coveragePressure, state === "unknown" ? 0.5 : 0));
  const deploymentEnergy = bounded(finite(modulation.deploymentEnergy));
  const spectralOpenness = bounded(finite(modulation.spectralOpenness, 1 - latencyPressure));
  const staleDecay = bounded(finite(modulation.staleDecay, frame.stale ? 1 : 0));

  const tension = bounded(Math.max(base.tension, pressure * 0.86 + incidentPressure * 0.18));
  const urgency = bounded(Math.max(base.urgency, pressure * 0.72 + incidentPressure * 0.42 + deploymentEnergy * 0.08));
  const confidence = bounded(1 - Math.max(coveragePressure * 0.8, staleDecay, state === "unknown" ? 0.58 : 0));
  const density = bounded(base.density + pressure * 0.24 + deploymentEnergy * 0.06 - staleDecay * 0.18);
  const instability = bounded(Math.max(base.instability, errorPressure * 0.72 + latencyPressure * 0.26 + healthPressure * 0.32));
  const brightness = bounded(base.brightness * 0.62 + spectralOpenness * 0.38 + deploymentEnergy * 0.08 - instability * 0.12);
  const rhythmicPressure = bounded(base.rhythm + urgency * 0.26 + incidentPressure * 0.18 - staleDecay * 0.12);
  const harmonicTension = bounded(tension * 0.72 + instability * 0.28);
  const transitionPressure = bounded(
    pressure * 0.48
      + Math.abs(finite(frame.tension, base.tension) - base.tension) * 0.12
      + incidentPressure * 0.2
      + deploymentEnergy * 0.08
      + staleDecay * 0.12,
  );
  const intensity = bounded(tension * 0.36 + urgency * 0.28 + density * 0.2 + rhythmicPressure * 0.16);

  return Object.freeze({
    state,
    tension,
    urgency,
    confidence,
    density,
    instability,
    brightness,
    rhythmicPressure,
    harmonicTension,
    transitionPressure,
    deploymentEnergy,
    pressure,
    spectralOpenness,
    staleDecay,
    recoveryEnergy: 0,
    intensity,
  });
}

export function phaseMixFor(phase, state, intent = {}) {
  const name = PHASE_MIX[phase] ? phase : "breathe";
  const mix = PHASE_MIX[name];
  const normalized = normalizedState(state);
  const pressure = bounded(intent.pressure ?? 0);
  const confidence = bounded(intent.confidence ?? 0.5);
  const unknownAttenuation = normalized === "unknown" ? 0.68 : 1;
  const criticalRestraint = normalized === "critical" ? 0.94 : 1;
  return Object.freeze({
    drums: bounded(mix.drums * (0.82 + pressure * 0.18) * unknownAttenuation),
    bass: bounded(mix.bass * (0.88 + pressure * 0.12) * criticalRestraint),
    pad: bounded(mix.pad * (0.88 + confidence * 0.12)),
    melody: bounded(mix.melody * (0.74 + confidence * 0.26) * unknownAttenuation),
    texture: bounded(mix.texture * (0.82 + (1 - confidence) * 0.18)),
    services: bounded(mix.services * (0.82 + confidence * 0.18)),
    accent: bounded(mix.accent * (0.76 + pressure * 0.24)),
    filter: bounded(mix.filter * (0.86 + finite(intent.brightness, 0.5) * 0.14)),
    drive: bounded(mix.drive * (0.78 + finite(intent.harmonicTension, 0.2) * 0.22)),
  });
}

function desiredPhaseFor(state, intent, currentPhase, phaseAge, recoveryEnergy) {
  if (state === "unknown") {
    if (currentPhase === "breathe" && phaseAge < 2) return "breathe";
    return currentPhase === "release" ? "breathe" : "release";
  }

  if (recoveryEnergy >= 0.18 && state === "healthy") {
    return currentPhase === "recover" && phaseAge < 3 ? "recover" : "recover";
  }

  if (state === "critical") {
    if (intent.urgency >= 0.88 && intent.transitionPressure >= 0.68) {
      return currentPhase === "peak" && phaseAge < 2 ? "peak" : "peak";
    }
    if (["establish", "develop", "recover", "breathe", "release"].includes(currentPhase)) {
      return "intensify";
    }
    return currentPhase === "intensify" && phaseAge >= 1 ? "destabilise" : currentPhase;
  }

  if (state === "warning") {
    if (intent.transitionPressure >= 0.62) {
      return currentPhase === "destabilise" && phaseAge < 3 ? "destabilise" : "destabilise";
    }
    if (["establish", "develop", "recover", "breathe", "release"].includes(currentPhase)) {
      return "intensify";
    }
    if (currentPhase === "peak") return "release";
    return currentPhase;
  }

  if (["peak", "destabilise", "intensify"].includes(currentPhase)) return "release";
  if (currentPhase === "release") return phaseAge >= 1 ? "recover" : "release";
  if (currentPhase === "recover") return phaseAge >= 2 ? "establish" : "recover";
  if (currentPhase === "establish") return phaseAge >= 2 ? "develop" : "establish";
  if (currentPhase === "develop") {
    if (phaseAge >= 3 && intent.transitionPressure < 0.24) return "breathe";
    return "develop";
  }
  if (currentPhase === "breathe") return phaseAge >= 1 ? "develop" : "breathe";
  return "establish";
}

function transformedMotif(state, variant, recoveryEnergy) {
  const rotation = modulo(variant, ATLAS_MOTIF_DEGREES.length);
  const rotated = ATLAS_MOTIF_DEGREES.map(
    (_, index) => ATLAS_MOTIF_DEGREES[(index + rotation) % ATLAS_MOTIF_DEGREES.length],
  );
  if (state === "healthy" || recoveryEnergy >= 0.2) return rotated;
  if (state === "warning") {
    return rotated.map((degree, index) => (index % 3 === 2 ? rotated[Math.max(0, index - 1)] : degree));
  }
  if (state === "critical") {
    return rotated.map((degree, index) => rotated[index % 4] ?? degree);
  }
  return rotated.filter((_, index) => index % 2 === 0);
}

function selectMotifVariant(seed, phraseIndex, recentVariants, state, recoveryEnergy) {
  if (state === "healthy" && recoveryEnergy >= 0.2) return 0;
  const initial = stableHash(`${seed}:${phraseIndex}:${state}:motif`) % MOTIF_PATTERNS.length;
  for (let offset = 0; offset < MOTIF_PATTERNS.length; offset += 1) {
    const candidate = modulo(initial + offset, MOTIF_PATTERNS.length);
    if (!recentVariants.slice(-2).includes(candidate)) return candidate;
  }
  return initial;
}

function motifPatternFor(state, variant, phase, intent) {
  const base = MOTIF_PATTERNS[modulo(variant, MOTIF_PATTERNS.length)];
  if (state === "unknown") return Object.freeze(base.filter((_, index) => index === 0 || index === 4));
  if (state === "warning") {
    const displacement = intent.rhythmicPressure >= 0.72 ? 1 : 0;
    return Object.freeze(base
      .filter((_, index) => phase !== "breathe" || index % 2 === 0)
      .map((step) => modulo(step + displacement, PHRASE_STEPS))
      .sort((left, right) => left - right));
  }
  if (state === "critical") {
    const extra = phase === "peak" ? [2, 14, 18, 30] : [14, 30];
    return Object.freeze([...new Set([...base, ...extra])].sort((left, right) => left - right));
  }
  if (phase === "breathe") return Object.freeze(base.filter((_, index) => index % 2 === 0));
  return base;
}

function livePerformanceFields(seed, phraseIndex, state, phase, stateAgePhrases, intent, motifVariant, recoveryEnergy) {
  const phraseSeed = stableHash(`${seed}:${phraseIndex}:${state}:${phase}`);
  const energy = bounded(intent.intensity);
  const motion = bounded(intent.rhythmicPressure * 0.68 + intent.instability * 0.32);
  const grit = bounded(intent.harmonicTension * 0.72 + intent.instability * 0.28);
  const space = bounded((1 - intent.density) * 0.52 + intent.confidence * 0.48);
  // Single locked transport tempo for every live state. The loop foundation is
  // a set of native 100 BPM F/Fm samples, so a constant 100 BPM keeps them at
  // playbackRate 1.0 (no pitch shift, no drift). State contrast is carried by
  // harmony, density, orchestration, filtering and tension, not tempo.
  const targetBpm = LOCKED_TRANSPORT_BPM;
  const stableEnoughForDrop = state !== "unknown" && stateAgePhrases >= 7;
  const dropCycle = stateAgePhrases % 8;
  const dropStage = stableEnoughForDrop && dropCycle === 7
    ? "build"
    : stableEnoughForDrop && dropCycle === 0
      ? "drop"
      : "none";
  return {
    liveDirected: true,
    seed,
    phase,
    energy,
    motion,
    grit,
    space,
    targetBpm: Number(targetBpm.toFixed(3)),
    densityMultiplier: Number(clamp(0.86 + intent.density * 0.42, 0.72, 1.34).toFixed(4)),
    drumMultiplier: Number(clamp(0.76 + intent.rhythmicPressure * 0.46, 0.62, 1.18).toFixed(4)),
    bassMultiplier: Number(clamp(0.82 + intent.intensity * 0.28, 0.72, 1.12).toFixed(4)),
    counterlineMultiplier: Number(clamp(0.72 + intent.confidence * 0.34, 0.62, 1.08).toFixed(4)),
    padMultiplier: Number(clamp(0.62 + space * 0.38, 0.56, 1).toFixed(4)),
    droneMultiplier: Number(clamp(state === "unknown" ? 0.58 : 0.34 + space * 0.3, 0.26, 0.64).toFixed(4)),
    textureMultiplier: Number(clamp(0.82 + intent.instability * 0.5, 0.78, 1.32).toFixed(4)),
    terminalGain: Number(clamp(state === "unknown" ? 0.16 : 0.24 + intent.confidence * 0.24, 0.12, 0.52).toFixed(4)),
    terminalDensity: Number(clamp(state === "unknown" ? 0.12 : 0.24 + motion * 0.42, 0.1, 0.68).toFixed(4)),
    riffGain: Number(clamp(state === "unknown" ? 0.08 : 0.14 + intent.harmonicTension * 0.24, 0.06, 0.4).toFixed(4)),
    serviceFilterMultiplier: Number(clamp(0.78 + intent.brightness * 0.22, 0.72, 1).toFixed(4)),
    distortionWet: Number(clamp(0.02 + intent.harmonicTension * 0.16, 0.02, 0.2).toFixed(4)),
    delayWet: Number(clamp(0.06 + space * 0.14, 0.05, 0.2).toFixed(4)),
    reverbWet: Number(clamp(0.1 + space * 0.22, 0.08, 0.32).toFixed(4)),
    chordOffset: phraseSeed % 4,
    // Pinned to the PR #38 pad progression (variant 0). Per-phrase progression
    // switching wandered the harmony and is held back until the core baseline is
    // approved, then can be reintroduced as a deliberate, listened-to change.
    chordProgression: 0,
    bassPattern: phraseSeed % 8,
    bassShift: state === "warning" ? 1 : 0,
    bassDegreeOffset: motifVariant,
    bassOctaveShift: 0,
    percussionVariant: (phraseSeed >>> 3) % 8,
    melodyOffset: motifVariant,
    terminalPattern: (phraseSeed >>> 5) % 8,
    phraseStride: 1 + ((phraseSeed >>> 7) % 2),
    kickTimbre: (phraseSeed >>> 9) % 3,
    snareTimbre: (phraseSeed >>> 11) % 3,
    hatTimbre: (phraseSeed >>> 13) % 3,
    metalTimbre: (phraseSeed >>> 15) % 3,
    bassTimbre: (phraseSeed >>> 17) % 5,
    bassLoopTimbre: (phraseSeed >>> 19) % 4,
    bassLoopSliceVariant: (phraseSeed >>> 21) % 4,
    leadTimbre: (phraseSeed >>> 23) % 4,
    atmosphereTimbre: (phraseSeed >>> 25) % 2,
    leadSliceVariant: (phraseSeed >>> 27) % 4,
    sectionVariant: phraseIndex % 8,
    padVoicingLabel: state === "healthy" ? "quartal" : state === "warning" ? "sus2" : state === "critical" ? "sus4" : "quartal",
    filterAutomationLabel: state === "warning" ? "slow-close" : state === "critical" ? "rhythmic-8n" : state === "unknown" ? "slow-close" : "slow-open",
    arpDirectionLabel: state === "warning" ? "upDown" : state === "critical" ? "seeded" : state === "unknown" ? "down" : "up",
    patternRotation: motifVariant + phraseIndex,
    riffPattern: motifVariant,
    riffContour: (phraseSeed >>> 4) % 4,
    riffTimbre: (phraseSeed >>> 6) % 3,
    arpOctaveSpan: state === "critical" ? 1 : 0,
    arpGate: state === "critical" ? 0 : state === "warning" ? 1 : 2,
    hatDensityLabel: state === "critical" ? "dense" : state === "warning" ? "standard" : state === "unknown" ? "sparse" : "standard",
    recoveryEnergy,
    stateAgePhrases,
    dropStage,
  };
}

export function motifEventForStep(plan, scale, step) {
  if (!plan || !Number.isInteger(step) || step < 0 || step >= PHRASE_STEPS) return null;
  const activeSteps = plan.motifPattern ?? [];
  const eventIndex = activeSteps.indexOf(step);
  if (eventIndex === -1) return null;
  const safeScale = Array.isArray(scale) && scale.length ? scale : [0];
  const degrees = plan.motifDegrees?.length ? plan.motifDegrees : ATLAS_MOTIF_DEGREES;
  const degree = degrees[eventIndex % degrees.length];
  const octave = plan.state === "critical" && plan.phase === "peak" && eventIndex % 4 === 3 ? 12 : 0;
  const root = plan.state === "unknown" ? 53 : 57;
  return Object.freeze({
    midi: Math.min(74, root + safeScale[modulo(degree, safeScale.length)] + octave),
    duration: plan.state === "critical" ? "16n" : plan.state === "warning" ? "8n" : plan.state === "unknown" ? "2n" : "8n",
    velocity: Number(clamp(
      plan.state === "critical" ? 0.46 : plan.state === "warning" ? 0.4 : plan.state === "unknown" ? 0.2 : 0.36,
      0.16,
      0.5,
    ).toFixed(4)),
  });
}

export function createCompositionDirector({ seed = LIVE_COMPOSITION_SEED } = {}) {
  let phraseIndex = -1;
  let currentPhase = "establish";
  let phaseAge = 0;
  let latestIntent = deriveMusicalIntent({ scoreState: "unknown", stale: true });
  let currentState = "unknown";
  let lastPlanState = "unknown";
  let stateAgePhrases = 0;
  let lastCommittedPressure = latestIntent.pressure;
  let recentPhases = [];
  let recentMotifVariants = [];
  let currentPlan = null;

  function observe(frame) {
    latestIntent = deriveMusicalIntent(frame);
    currentState = latestIntent.state;
    return latestIntent;
  }

  function advancePhrase() {
    phraseIndex += 1;
    if (currentState === lastPlanState) stateAgePhrases += 1;
    else {
      lastPlanState = currentState;
      stateAgePhrases = 0;
    }
    const recoveryEnergy = bounded(Math.max(0, lastCommittedPressure - latestIntent.pressure) * 1.8);
    const intent = Object.freeze({ ...latestIntent, recoveryEnergy });
    const requested = desiredPhaseFor(currentState, intent, currentPhase, phaseAge, recoveryEnergy);
    const minimumAge = PHASE_MIN_AGE[currentPhase] ?? 1;
    const maximumAge = PHASE_MAX_AGE[currentPhase] ?? 3;
    const pressureReady = intent.transitionPressure >= 0.42 || requested === "recover" || requested === "release";
    const forced = phaseAge >= maximumAge;
    const canMove = requested !== currentPhase && (phaseAge >= minimumAge) && (pressureReady || forced || currentState === "unknown");

    if (canMove) {
      currentPhase = requested;
      phaseAge = 0;
    } else {
      phaseAge += 1;
    }

    if (currentState === "critical" && currentPhase === "peak" && phaseAge >= 2) {
      currentPhase = intent.pressure >= 0.72 ? "destabilise" : "release";
      phaseAge = 0;
    }

    const motifVariant = selectMotifVariant(
      seed,
      phraseIndex,
      recentMotifVariants,
      currentState,
      recoveryEnergy,
    );
    const motifDegrees = Object.freeze(transformedMotif(currentState, motifVariant, recoveryEnergy));
    const motifPattern = motifPatternFor(currentState, motifVariant, currentPhase, intent);
    const phaseMix = phaseMixFor(currentPhase, currentState, intent);
    const performanceFields = livePerformanceFields(
      seed,
      phraseIndex,
      currentState,
      currentPhase,
      stateAgePhrases,
      intent,
      motifVariant,
      recoveryEnergy,
    );

    recentPhases = [...recentPhases.slice(-5), currentPhase];
    recentMotifVariants = [...recentMotifVariants.slice(-3), motifVariant];
    lastCommittedPressure = latestIntent.pressure;

    currentPlan = Object.freeze({
      ...performanceFields,
      id: `live:${COMPOSITION_DIRECTOR_VERSION}:${seed}:${phraseIndex}:${currentState}:${currentPhase}:${motifVariant}`,
      scoreState: currentState,
      state: currentState,
      phraseIndex,
      phase: currentPhase,
      phaseAge,
      phaseMix,
      intent,
      motifVariant,
      motifDegrees,
      motifPattern,
      recentPhases: Object.freeze([...recentPhases]),
      recentMotifVariants: Object.freeze([...recentMotifVariants]),
      patternSignature: `${currentState}:${currentPhase}:${motifVariant}:${motifPattern.join("-")}`,
      deterministicJitter: deterministicUnit(`${seed}:${phraseIndex}:jitter`),
    });
    return currentPlan;
  }

  return Object.freeze({
    observe,
    advancePhrase,
    getIntent: () => latestIntent,
    getPlan: () => currentPlan,
    getSnapshot: () => Object.freeze({
      phraseIndex,
      currentPhase,
      phaseAge,
      currentState,
      stateAgePhrases,
      lastCommittedPressure,
      recentPhases: Object.freeze([...recentPhases]),
      recentMotifVariants: Object.freeze([...recentMotifVariants]),
      plan: currentPlan,
    }),
    reset() {
      phraseIndex = -1;
      currentPhase = "establish";
      phaseAge = 0;
      latestIntent = deriveMusicalIntent({ scoreState: "unknown", stale: true });
      currentState = "unknown";
      lastPlanState = "unknown";
      stateAgePhrases = 0;
      lastCommittedPressure = latestIntent.pressure;
      recentPhases = [];
      recentMotifVariants = [];
      currentPlan = null;
    },
  });
}
