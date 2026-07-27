import {
  APU_MIX_BUSES,
  APU_MIX_DIRECTOR_BUILD_ID as D1A_MIX_DIRECTOR_BUILD_ID,
  APU_MIX_LISTENER_POLISH,
  describeIntent,
  mixDirectiveFor as d1aMixDirectiveFor,
  safetyEnvelope,
} from "./apu-mix-director-d1a-baseline.js?v=20260727-system-symphony-pass-d1a-state-orchestration-v1";

export {
  APU_MIX_BUSES,
  APU_MIX_LISTENER_POLISH,
  describeIntent,
  safetyEnvelope,
};

// Preserve the established build contract for existing diagnostics. The D3
// listener correction publishes its own identifier alongside it.
export const APU_MIX_DIRECTOR_BUILD_ID = D1A_MIX_DIRECTOR_BUILD_ID;
export const APU_D3_DYNAMICS_BUILD_ID =
  "20260727-system-symphony-pass-d3-dynamics-v1";

const BASE_PHASE_GAIN = Object.freeze({
  intro: 0.82,
  groove: 1,
  pressure: 1.04,
  rupture: 1.08,
  recovery: 0.94,
  afterglow: 0.75,
});

// The original phase curve multiplied with density velocity scaling. The
// combined result made the opening deceptively quiet and the middle much
// louder at the same user volume. Keep the arc, but narrow it to a listener-
// safe envelope across every state.
const SMOOTH_PHASE_GAIN = Object.freeze({
  intro: 0.93,
  groove: 0.98,
  pressure: 1,
  rupture: 1.02,
  recovery: 0.97,
  afterglow: 0.9,
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

export function mixDirectiveFor(input = {}) {
  const baseline = d1aMixDirectiveFor(input);
  const phase = SMOOTH_PHASE_GAIN[baseline.phase] ? baseline.phase : "groove";
  const ratio = SMOOTH_PHASE_GAIN[phase] / BASE_PHASE_GAIN[phase];
  const envelope = safetyEnvelope();
  const buses = {};

  for (const busName of APU_MIX_BUSES) {
    const bus = baseline.buses[busName];
    buses[busName] = Object.freeze({
      ...bus,
      gainMul: clamp(
        bus.gainMul * ratio,
        envelope.gainMulMin,
        envelope.gainMulMax,
      ),
    });
  }

  return Object.freeze({
    ...baseline,
    provenance: `${baseline.provenance}; d3-dynamics:${phase}`,
    buses: Object.freeze(buses),
    dynamicsEnvelope: Object.freeze({
      buildId: APU_D3_DYNAMICS_BUILD_ID,
      phase,
      baselineGain: BASE_PHASE_GAIN[phase],
      targetGain: SMOOTH_PHASE_GAIN[phase],
      ratio,
    }),
  });
}
