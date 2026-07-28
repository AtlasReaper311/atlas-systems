export const SYSTEM_SYMPHONY_STATES = Object.freeze([
  "healthy",
  "warning",
  "critical",
  "unknown",
]);

export const SYSTEM_SYMPHONY_STATE_LABELS = Object.freeze({
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
});

export const SYSTEM_SYMPHONY_STATE_WINDOWS = Object.freeze({
  healthy: Object.freeze({ minimum: -31, maximum: -12 }),
  warning: Object.freeze({ minimum: -31, maximum: -12 }),
  critical: Object.freeze({ minimum: -30, maximum: -11 }),
  unknown: Object.freeze({ minimum: -27, maximum: -16 }),
});

export const SYSTEM_SYMPHONY_BAR_DURATION_MS = 2400;
export const SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS = 8;
export const SYSTEM_SYMPHONY_STATE_MEASUREMENT_MS = (
  SYSTEM_SYMPHONY_BAR_DURATION_MS * SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS
);
export const SYSTEM_SYMPHONY_SAMPLE_INTERVAL_MS = 200;
export const SYSTEM_SYMPHONY_TRANSITION_MARGIN_DB = 10;

// Eulerian circuit over the complete directed four-state graph. Every ordered
// transition appears exactly once and the route returns to Healthy.
export const SYSTEM_SYMPHONY_TRANSITION_ROUTE = Object.freeze([
  "healthy",
  "unknown",
  "critical",
  "unknown",
  "warning",
  "unknown",
  "healthy",
  "critical",
  "warning",
  "critical",
  "healthy",
  "warning",
  "healthy",
]);

export function transitionPairs(route = SYSTEM_SYMPHONY_TRANSITION_ROUTE) {
  return Object.freeze(route.slice(1).map((to, index) => Object.freeze({
    from: route[index],
    to,
    key: `${route[index]}->${to}`,
  })));
}

function finiteValues(samples, key) {
  return samples
    .map((sample) => Number(sample?.[key]))
    .filter(Number.isFinite);
}

function range(values) {
  if (!values.length) return Object.freeze({ minimum: null, maximum: null });
  return Object.freeze({
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  });
}

export function buildProgrammeSummary(stateMeasurements) {
  const byState = Object.fromEntries(stateMeasurements.map((measurement) => [
    measurement.state,
    measurement,
  ]));
  const missingStates = SYSTEM_SYMPHONY_STATES.filter((state) => !byState[state]);
  if (missingStates.length) {
    throw new Error(`Missing production state measurements: ${missingStates.join(", ")}`);
  }

  const sectionSamples = new Map();
  for (const measurement of stateMeasurements) {
    for (const sample of measurement.samples ?? []) {
      const section = sample.section ?? "unknown";
      const bucket = sectionSamples.get(section) ?? [];
      bucket.push(sample);
      sectionSamples.set(section, bucket);
    }
  }

  const sectionExtremes = Object.fromEntries([...sectionSamples.entries()].map(([section, samples]) => [
    section,
    Object.freeze({
      sampleCount: samples.length,
      momentaryLufs: range(finiteValues(samples, "momentaryLufs")),
      shortTermLufs: range(finiteValues(samples, "shortTermLufs")),
      truePeakDbtp: range(finiteValues(samples, "truePeakDbtp")),
    }),
  ]));

  const unknownLufs = byState.unknown.metrics.integratedLufs;
  return Object.freeze({
    measuredBars: stateMeasurements.reduce(
      (total, measurement) => total + Number(measurement.measurementBars ?? 0),
      0,
    ),
    states: Object.fromEntries(SYSTEM_SYMPHONY_STATES.map((state) => {
      const measurement = byState[state];
      const integratedLufs = measurement.metrics.integratedLufs;
      const sessionTruePeakDbtp = measurement.metrics.sessionTruePeakDbtp;
      return [state, Object.freeze({
        integratedLufs,
        sessionTruePeakDbtp,
        peakToLoudnessRatioDb: sessionTruePeakDbtp - integratedLufs,
        blockCount: measurement.metrics.blockCount,
        gatedBlockCount: measurement.metrics.gatedBlockCount,
        sections: Object.freeze([...new Set((measurement.samples ?? []).map((sample) => sample.section).filter(Boolean))]),
      })];
    })),
    unknownDeltas: Object.freeze({
      healthy: Math.abs(byState.healthy.metrics.integratedLufs - unknownLufs),
      warning: Math.abs(byState.warning.metrics.integratedLufs - unknownLufs),
      critical: Math.abs(byState.critical.metrics.integratedLufs - unknownLufs),
    }),
    maximumTruePeakDbtp: Math.max(
      ...stateMeasurements.map((measurement) => measurement.metrics.sessionTruePeakDbtp),
    ),
    sectionExtremes: Object.freeze(sectionExtremes),
  });
}

export function buildTransitionSummary(
  transitionMeasurements,
  stateMeasurements,
  { marginDb = SYSTEM_SYMPHONY_TRANSITION_MARGIN_DB } = {},
) {
  const byState = Object.fromEntries(stateMeasurements.map((measurement) => [
    measurement.state,
    measurement,
  ]));
  const missingStates = SYSTEM_SYMPHONY_STATES.filter((state) => !byState[state]);
  if (missingStates.length) {
    throw new Error(`Missing production transition references: ${missingStates.join(", ")}`);
  }

  const transitions = transitionMeasurements.map((transition) => {
    const shortTermValues = finiteValues(transition.samples ?? [], "shortTermLufs");
    const momentaryValues = finiteValues(transition.samples ?? [], "momentaryLufs");
    const referenceLufs = Math.min(
      byState[transition.from].metrics.integratedLufs,
      byState[transition.to].metrics.integratedLufs,
    );
    const permittedFloorLufs = referenceLufs - marginDb;
    const minimumShortTermLufs = shortTermValues.length ? Math.min(...shortTermValues) : null;
    return Object.freeze({
      from: transition.from,
      to: transition.to,
      key: `${transition.from}->${transition.to}`,
      policy: transition.policy,
      sampleCount: transition.samples?.length ?? 0,
      finiteShortTermSamples: shortTermValues.length,
      shortTermLufs: range(shortTermValues),
      momentaryLufs: range(momentaryValues),
      referenceLufs,
      permittedFloorLufs,
      passed: minimumShortTermLufs !== null && minimumShortTermLufs >= permittedFloorLufs,
    });
  });

  return Object.freeze({
    expectedTransitionCount: transitionPairs().length,
    measuredTransitionCount: transitions.length,
    uniqueTransitionCount: new Set(transitions.map(({ key }) => key)).size,
    marginDb,
    allPassed: transitions.every(({ passed }) => passed),
    transitions: Object.freeze(transitions),
  });
}
