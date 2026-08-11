export const APU_D3_SIGNATURE_GESTURE_BUILD_ID =
  "20260727-system-symphony-pass-d3-signature-gestures-v1";

export const APU_D3_SIGNATURE_PHRASES = Object.freeze({
  variationHandoff: 4,
  prePeakLift: 10,
  recoveryEcho: 14,
});

export const APU_D3_PEAK_PHRASES = Object.freeze([11, 12]);

const STATE_KEYS = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const safeState = (state) => STATE_KEYS.includes(state) ? state : "unknown";
const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;

export const APU_D3_PRE_PEAK_CUTOUT_STARTS = Object.freeze({
  healthy: 24,
  warning: 27,
  critical: 26,
  unknown: 20,
});

export const APU_D3_PEAK_REGISTER_SHIFTS = Object.freeze({
  healthy: -12,
  warning: -12,
  critical: 0,
  unknown: -12,
});

const GESTURES = Object.freeze({
  healthy: Object.freeze({
    variationHandoff: Object.freeze({
      label: "explorer-descending-shimmer",
      direction: "descending",
      steps: Object.freeze([28, 29, 30]),
      offsets: Object.freeze([24, 19, 12]),
      velocities: Object.freeze([0.28, 0.24, 0.22]),
      duration: "32n",
      register: "bright-high-transition",
    }),
    prePeakLift: Object.freeze({
      label: "explorer-ascending-launch",
      direction: "ascending",
      steps: Object.freeze([16, 18, 20, 22]),
      offsets: Object.freeze([0, 4, 7, 12]),
      velocities: Object.freeze([0.20, 0.22, 0.24, 0.26]),
      duration: "32n",
      register: "warm-mid-launch",
    }),
    recoveryEcho: Object.freeze({
      label: "explorer-descending-recall",
      direction: "descending",
      steps: Object.freeze([24, 26, 28, 30]),
      offsets: Object.freeze([12, 7, 4, 0]),
      velocities: Object.freeze([0.20, 0.18, 0.16, 0.15]),
      duration: "32n",
      register: "warm-mid-recovery",
    }),
  }),
  warning: Object.freeze({
    variationHandoff: Object.freeze({
      label: "grid-descending-diagnostic",
      direction: "descending",
      steps: Object.freeze([27, 28, 29, 30]),
      offsets: Object.freeze([15, 10, 6, 3]),
      velocities: Object.freeze([0.24, 0.22, 0.20, 0.18]),
      duration: "32n",
      register: "diagnostic-mid",
    }),
    prePeakLift: Object.freeze({
      label: "grid-ascending-scan",
      direction: "ascending",
      steps: Object.freeze([15, 18, 21, 24]),
      offsets: Object.freeze([0, 3, 6, 10]),
      velocities: Object.freeze([0.18, 0.20, 0.22, 0.24]),
      duration: "32n",
      register: "diagnostic-mid",
    }),
    recoveryEcho: Object.freeze({
      label: "grid-descending-reset",
      direction: "descending",
      steps: Object.freeze([23, 25, 27, 29]),
      offsets: Object.freeze([10, 7, 3, 0]),
      velocities: Object.freeze([0.18, 0.17, 0.15, 0.14]),
      duration: "32n",
      register: "diagnostic-low-mid",
    }),
  }),
  critical: Object.freeze({
    variationHandoff: Object.freeze({
      label: "boss-descending-command",
      direction: "descending",
      steps: Object.freeze([27, 28, 29, 30]),
      offsets: Object.freeze([19, 12, 7, 0]),
      velocities: Object.freeze([0.24, 0.22, 0.20, 0.24]),
      duration: "32n",
      register: "dark-upper-mid",
    }),
    prePeakLift: Object.freeze({
      label: "boss-ascending-warning",
      direction: "ascending",
      steps: Object.freeze([18, 21, 24]),
      offsets: Object.freeze([0, 7, 12]),
      velocities: Object.freeze([0.20, 0.22, 0.25]),
      duration: "16n",
      register: "dark-mid-launch",
    }),
    recoveryEcho: Object.freeze({
      label: "boss-descending-release",
      direction: "descending",
      steps: Object.freeze([24, 27, 30]),
      offsets: Object.freeze([12, 7, 0]),
      velocities: Object.freeze([0.19, 0.17, 0.21]),
      duration: "16n",
      register: "dark-mid-recovery",
    }),
  }),
  unknown: Object.freeze({
    variationHandoff: Object.freeze({
      label: "signal-descending-fragment",
      direction: "descending",
      steps: Object.freeze([24, 26, 28, 30]),
      offsets: Object.freeze([12, 7, 5, 0]),
      velocities: Object.freeze([0.17, 0.15, 0.13, 0.12]),
      duration: "16n",
      register: "distant-mid",
    }),
    prePeakLift: Object.freeze({
      label: "signal-ascending-carrier",
      direction: "ascending",
      steps: Object.freeze([10, 14, 18]),
      offsets: Object.freeze([0, 5, 7]),
      velocities: Object.freeze([0.13, 0.15, 0.17]),
      duration: "8n",
      register: "distant-low-mid",
    }),
    recoveryEcho: Object.freeze({
      label: "signal-descending-echo",
      direction: "descending",
      steps: Object.freeze([20, 25, 30]),
      offsets: Object.freeze([7, 5, 0]),
      velocities: Object.freeze([0.13, 0.12, 0.10]),
      duration: "8n",
      register: "distant-low-mid",
    }),
  }),
});

export const APU_D3_SIGNATURE_GESTURES = GESTURES;

function momentForPhrase(cyclePhrase) {
  for (const [moment, phrase] of Object.entries(APU_D3_SIGNATURE_PHRASES)) {
    if (cyclePhrase === phrase) return moment;
  }
  return null;
}

export function isPeakPhraseIndex(phraseIndex) {
  return APU_D3_PEAK_PHRASES.includes(modulo(phraseIndex ?? 0, 16));
}

export function prePeakCutoutStartStep(perfPlan = {}) {
  const cyclePhrase = modulo(perfPlan.phraseIndex ?? 0, 16);
  if (cyclePhrase !== APU_D3_SIGNATURE_PHRASES.prePeakLift) return null;
  return APU_D3_PRE_PEAK_CUTOUT_STARTS[safeState(perfPlan.state)];
}

export function isPrePeakCutoutStep(perfPlan = {}, stepIndex = 0) {
  const start = prePeakCutoutStartStep(perfPlan);
  if (!Number.isFinite(start)) return false;
  const localStep = modulo(stepIndex, 32);
  return localStep >= start;
}

export function peakRegisterShiftForState(state) {
  return APU_D3_PEAK_REGISTER_SHIFTS[safeState(state)];
}

export function signatureGestureInstructionsForPhrase(perfPlan = {}) {
  const cyclePhrase = modulo(perfPlan.phraseIndex ?? 0, 16);
  const moment = momentForPhrase(cyclePhrase);
  if (!moment) return Object.freeze([]);

  const state = safeState(perfPlan.state);
  const gesture = GESTURES[state][moment];
  const bar = perfPlan.bars ?? Math.max(0, Math.trunc(perfPlan.phraseIndex ?? 0)) * 2;

  return Object.freeze(gesture.steps.map((offsetSteps, index) => Object.freeze({
    voice: "primary",
    offsetSteps,
    midiOffset: gesture.offsets[index],
    velocity: gesture.velocities[index],
    duration: gesture.duration,
    ornament: "signature-gesture",
    size: "phrase",
    bar,
    state,
    signatureGesture: gesture.label,
    gestureMoment: moment,
    direction: gesture.direction,
    register: gesture.register,
    signatureGestureBuildId: APU_D3_SIGNATURE_GESTURE_BUILD_ID,
  })));
}
