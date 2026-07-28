export const APU_ARPEGGIO_COMPOSER_D4_BUILD_ID =
  "20260728-system-symphony-pass-d4-prominent-arps-v2";

export const APU_D4_FEATURE_PHRASES = Object.freeze([1, 3, 4, 6, 8, 10, 14]);
export const APU_D4_PEAK_PHRASES = Object.freeze([11, 12]);
export const APU_D4_CYCLE_ROLES = Object.freeze([
  "statement",
  "development",
  "contrast",
  "reprise",
]);

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);

const ASCENDING_OFFSETS = Object.freeze({
  healthy: Object.freeze([-12, -8, -5, 0, 4, 7, 12, 16, 19, 24, 28, 31, 36, 40, 43, 48]),
  warning: Object.freeze([-12, -9, -5, 0, 3, 7, 10, 12, 15, 19, 22, 24, 27, 31, 34, 36]),
  critical: Object.freeze([-24, -20, -17, -12, -8, -5, 0, 4, 7, 12, 16, 19, 24, 28, 31, 36]),
  unknown: Object.freeze([-24, -19, -17, -12, -7, -5, 0, 5, 7, 12, 17, 19, 24, 29, 31, 36]),
});

const BASE_VELOCITY = Object.freeze({
  healthy: 0.58,
  warning: 0.59,
  critical: 0.60,
  unknown: 0.58,
});

const SHAPES_BY_ROLE = Object.freeze({
  statement: Object.freeze(["down", "up", "tornado", "tornado", "down", "up", "down"]),
  development: Object.freeze(["up", "tornado", "down", "tornado", "up", "tornado", "down"]),
  contrast: Object.freeze(["tornado", "down", "up", "down", "tornado", "up", "tornado"]),
  reprise: Object.freeze(["down", "up", "tornado", "up", "down", "tornado", "down"]),
});

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;
const safeState = (state) => STATES.includes(state) ? state : "unknown";
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function cycleRoleForPhrase(phraseIndex, requestedRole) {
  if (APU_D4_CYCLE_ROLES.includes(requestedRole)) return requestedRole;
  const cycleNumber = Math.max(0, Math.floor(Math.max(0, Number(phraseIndex) || 0) / 16));
  if (cycleNumber === 0) return "statement";
  return ["development", "contrast", "reprise"][modulo(cycleNumber - 1, 3)];
}

function tornado(values) {
  const ascent = values.slice(0, 9);
  const descent = values.slice(1, 8).reverse();
  return Object.freeze([...ascent, ...descent]);
}

function contourFor(state, shape) {
  const ascending = ASCENDING_OFFSETS[state];
  if (shape === "down") return Object.freeze([...ascending].reverse());
  if (shape === "tornado") return tornado(ascending);
  return ascending;
}

function bodyVelocityFor(state, shape, index, length) {
  const base = BASE_VELOCITY[state];
  const progress = length <= 1 ? 0 : index / (length - 1);
  let velocity;
  if (shape === "up") velocity = base - 0.06 + progress * 0.08;
  else if (shape === "down") velocity = base + 0.02 - progress * 0.06;
  else {
    const centre = 1 - Math.abs(progress * 2 - 1);
    velocity = base - 0.04 + centre * 0.06;
  }
  return Number(clamp(velocity, 0.50, 0.60).toFixed(3));
}

function edgeVelocityFor(bodyVelocity) {
  return Number(clamp(bodyVelocity * 0.74, 0.36, 0.44).toFixed(3));
}

function instructionFor({
  voice,
  layer,
  offsetSteps,
  midiOffset,
  velocity,
  duration,
  bar,
  state,
  shape,
  cycleRole,
  cyclePhrase,
  noteIndex,
}) {
  return Object.freeze({
    voice,
    arpLayer: layer,
    noteIndex,
    offsetSteps,
    midiOffset,
    velocity,
    duration,
    ornament: "d4-feature-arp",
    size: "phrase",
    bar,
    state,
    contour: shape,
    cycleRole,
    cyclePhrase,
    additive: true,
    featureArpeggio: true,
    harmonyHalf: 0,
    arpeggioBuildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  });
}

export function d4ArpeggioPlanForPhrase(perfPlan = {}) {
  const phraseIndex = Math.max(0, Math.trunc(perfPlan.phraseIndex ?? 0));
  const cyclePhrase = modulo(phraseIndex, 16);
  const cycleRole = cycleRoleForPhrase(
    phraseIndex,
    perfPlan.songPlan?.cycleRole ?? perfPlan.cycleRole,
  );
  const state = safeState(perfPlan.state ?? perfPlan.songPlan?.state);
  const featureIndex = APU_D4_FEATURE_PHRASES.indexOf(cyclePhrase);
  const active = featureIndex >= 0 && !APU_D4_PEAK_PHRASES.includes(cyclePhrase);

  if (!active) {
    return Object.freeze({
      active: false,
      phraseIndex,
      cyclePhrase,
      cycleRole,
      state,
      contour: "rest",
      noteCount: 0,
      layerCount: 0,
      startStep: null,
      endStep: null,
      instructions: Object.freeze([]),
      buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
    });
  }

  const shape = SHAPES_BY_ROLE[cycleRole][featureIndex];
  const offsets = contourFor(state, shape);
  const bar = perfPlan.bars ?? phraseIndex * 2;
  const instructions = Object.freeze(offsets.flatMap((midiOffset, noteIndex) => {
    const bodyVelocity = bodyVelocityFor(state, shape, noteIndex, offsets.length);
    return Object.freeze([
      instructionFor({
        voice: "primary",
        layer: "body",
        offsetSteps: noteIndex,
        midiOffset,
        velocity: bodyVelocity,
        duration: "16n",
        bar,
        state,
        shape,
        cycleRole,
        cyclePhrase,
        noteIndex,
      }),
      instructionFor({
        voice: "accent",
        layer: "edge",
        offsetSteps: noteIndex,
        midiOffset,
        velocity: edgeVelocityFor(bodyVelocity),
        duration: "32n",
        bar,
        state,
        shape,
        cycleRole,
        cyclePhrase,
        noteIndex,
      }),
    ]);
  }));

  return Object.freeze({
    active: true,
    phraseIndex,
    cyclePhrase,
    cycleRole,
    state,
    contour: shape,
    noteCount: offsets.length,
    layerCount: 2,
    startStep: 0,
    endStep: 15,
    instructions,
    buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  });
}

export function d4ArpeggioInstructionsForPhrase(perfPlan = {}) {
  return d4ArpeggioPlanForPhrase(perfPlan).instructions;
}
