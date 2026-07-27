/**
 * Listener-led Pass D1A state orchestration.
 *
 * This module is pure data. It adds state-shaped movement around the existing
 * Pass C score without choosing estate state, changing transport tempo, or
 * owning audio nodes. Every instruction is deterministic and phrase bounded.
 */

export const APU_STATE_ORCHESTRATION_D1A_BUILD_ID = "20260727-system-symphony-pass-d1a-state-orchestration-v1";

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const PHASES = Object.freeze(["intro", "groove", "pressure", "rupture", "recovery", "afterglow"]);

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;
const safeState = (state) => STATES.includes(state) ? state : "unknown";
const safePhase = (phase) => PHASES.includes(phase) ? phase : "groove";

const PHASE_GAIN = Object.freeze({
  intro: 0.76,
  groove: 1,
  pressure: 1.04,
  rupture: 1.06,
  recovery: 0.9,
  afterglow: 0.74,
});

const STATE_PROFILES = Object.freeze({
  healthy: Object.freeze({
    label: "Explorer",
    arpFunction: Object.freeze(["connector", "lift", "answer", "reprise"]),
    contours: Object.freeze([
      Object.freeze([0, 4, 7, 12, 16, 7]),
      Object.freeze([0, 4, 7, 11, 12, 16]),
      Object.freeze([12, 7, 4, 0, 4, 7]),
      Object.freeze([0, 7, 12, 16, 12, 7]),
    ]),
    starts: Object.freeze([1, 17]),
    spacing: 2,
    duration: "32n",
    velocity: 0.23,
    register: "bright-wide",
  }),
  warning: Object.freeze({
    label: "Grid Pressure",
    arpFunction: Object.freeze(["fracture", "diagnostic-lift", "interrupted-answer", "pressure-cell"]),
    contours: Object.freeze([
      Object.freeze([0, 3, 7, 10, 14]),
      Object.freeze([0, 3, 7, 10, 7]),
      Object.freeze([10, 7, 3, 7, 10]),
      Object.freeze([0, 3, 6, 10, 13]),
    ]),
    starts: Object.freeze([1, 15]),
    spacing: 3,
    duration: "32n",
    velocity: 0.215,
    register: "narrow-rising",
  }),
  critical: Object.freeze({
    label: "Boss Protocol",
    arpFunction: Object.freeze(["boss-cell", "octave-pressure", "upper-ostinato", "alarm-answer"]),
    contours: Object.freeze([
      Object.freeze([12, 19, 24, 19]),
      Object.freeze([12, 19, 24, 31]),
      Object.freeze([24, 19, 12, 19]),
      Object.freeze([12, 24, 19, 31]),
    ]),
    starts: Object.freeze([5, 21]),
    spacing: 2,
    duration: "32n",
    velocity: 0.205,
    register: "upper-power",
  }),
  unknown: Object.freeze({
    label: "Lost Signal",
    arpFunction: Object.freeze(["drift", "mirrored-fragment", "delayed-echo", "outer-note-fragment"]),
    contours: Object.freeze([
      Object.freeze([12, 7, 0, 5]),
      Object.freeze([0, 7, 5, 12]),
      Object.freeze([12, 5, 7, 0]),
      Object.freeze([0, 5, 12, 7]),
    ]),
    starts: Object.freeze([4]),
    spacing: 8,
    duration: "8n",
    velocity: 0.17,
    register: "distant-mid",
  }),
});

export const D1A_STATE_ORCHESTRATION_PROFILES = STATE_PROFILES;

function freezeInstruction(instruction) {
  return Object.freeze({ ...instruction });
}

function phraseContext(perfPlan = {}) {
  const phraseIndex = Math.max(0, Math.trunc(perfPlan.phraseIndex ?? 0));
  const state = safeState(perfPlan.state);
  const phase = safePhase(perfPlan.phase);
  const profile = STATE_PROFILES[state];
  const variant = modulo(phraseIndex, profile.contours.length);
  return Object.freeze({
    phraseIndex,
    state,
    phase,
    profile,
    variant,
    bar: perfPlan.bars ?? phraseIndex * 2,
    density: clamp(perfPlan.density ?? 0.5, 0, 1),
  });
}

export function stateArpeggioInstructionsForPhrase(perfPlan) {
  if (!perfPlan) return Object.freeze([]);
  const context = phraseContext(perfPlan);
  const { profile } = context;
  const contour = profile.contours[context.variant];
  const start = profile.starts[modulo(context.phraseIndex, profile.starts.length)];
  const phaseGain = PHASE_GAIN[context.phase];
  const densityGain = 0.88 + context.density * 0.12;
  const baseVelocity = clamp(profile.velocity * phaseGain * densityGain, 0.11, 0.29);

  return Object.freeze(contour.map((midiOffset, index) => freezeInstruction({
    voice: "primary",
    offsetSteps: start + index * profile.spacing,
    midiOffset,
    velocity: Number(clamp(baseVelocity - index * 0.008, 0.1, 0.3).toFixed(3)),
    duration: context.phase === "afterglow" ? "16n" : profile.duration,
    ornament: "state-arp",
    size: "phrase",
    bar: context.bar,
    state: context.state,
    arpFunction: profile.arpFunction[context.variant],
    contour: context.variant,
    register: profile.register,
  })));
}

function bossPowerChordInstructions(context) {
  if (["intro", "afterglow"].includes(context.phase)) return [];
  const roots = context.phraseIndex % 2 === 0 ? [2, 18] : [10, 26];
  const velocity = context.phase === "rupture" ? 0.32 : context.phase === "pressure" ? 0.29 : 0.26;
  const instructions = [];
  for (const offsetSteps of roots) {
    instructions.push(
      freezeInstruction({
        voice: "primary",
        offsetSteps,
        midiOffset: 12,
        velocity,
        duration: "8n",
        ornament: "boss-power-chord",
        size: "phrase",
        bar: context.bar,
        state: context.state,
        feature: "power-root",
        register: "upper-power",
      }),
      freezeInstruction({
        voice: "secondary",
        offsetSteps,
        midiOffset: 19,
        velocity: Number((velocity * 0.84).toFixed(3)),
        duration: "8n",
        ornament: "boss-power-chord",
        size: "phrase",
        bar: context.bar,
        state: context.state,
        feature: "power-fifth",
        register: "upper-power",
      }),
    );
  }
  return instructions;
}

function stateResponseInstructions(context) {
  if (context.state === "healthy") {
    return [freezeInstruction({
      voice: "secondary",
      offsetSteps: context.phraseIndex % 2 === 0 ? 29 : 13,
      midiOffset: context.phraseIndex % 2 === 0 ? 19 : 12,
      velocity: 0.18,
      duration: "16n",
      ornament: "explorer-sparkle-answer",
      size: "phrase",
      bar: context.bar,
      state: context.state,
      feature: "answer",
    })];
  }
  if (context.state === "warning") {
    return [15, 31].map((offsetSteps, index) => freezeInstruction({
      voice: "secondary",
      offsetSteps,
      midiOffset: index === 0 ? 15 : 10,
      velocity: 0.17,
      duration: "32n",
      ornament: "grid-diagnostic-response",
      size: "phrase",
      bar: context.bar,
      state: context.state,
      feature: "diagnostic-response",
    }));
  }
  if (context.state === "critical") return bossPowerChordInstructions(context);
  return [
    freezeInstruction({
      voice: "secondary",
      offsetSteps: 15,
      midiOffset: 12,
      velocity: 0.13,
      duration: "8n",
      ornament: "lost-signal-echo",
      size: "phrase",
      bar: context.bar,
      state: context.state,
      feature: "delayed-echo",
    }),
    freezeInstruction({
      voice: "secondary",
      offsetSteps: 31,
      midiOffset: 7,
      velocity: 0.11,
      duration: "8n",
      ornament: "lost-signal-echo",
      size: "phrase",
      bar: context.bar,
      state: context.state,
      feature: "delayed-echo",
    }),
  ];
}

export function stateFeatureInstructionsForPhrase(perfPlan) {
  if (!perfPlan) return Object.freeze([]);
  const context = phraseContext(perfPlan);
  const instructions = [
    ...stateArpeggioInstructionsForPhrase(perfPlan),
    ...stateResponseInstructions(context),
  ];
  return Object.freeze(instructions);
}

export function describeD1AStateOrchestration(perfPlan) {
  if (!perfPlan) return "d1a orchestration idle";
  const context = phraseContext(perfPlan);
  const instructions = stateFeatureInstructionsForPhrase(perfPlan);
  const arps = instructions.filter((instruction) => instruction.ornament === "state-arp").length;
  const features = instructions.length - arps;
  return `${context.profile.label}: ${context.profile.arpFunction[context.variant]}, arps=${arps}, features=${features}`;
}
