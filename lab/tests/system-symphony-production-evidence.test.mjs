import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR,
  SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP,
  SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS,
  SYSTEM_SYMPHONY_STATE_PAGE_POLICY,
  SYSTEM_SYMPHONY_STATES,
  SYSTEM_SYMPHONY_TRANSITION_ROUTE,
  buildProgrammeSummary,
  buildStateMeasurementPlan,
  buildTransitionSummary,
  transitionPairs,
} from "../../scripts/system-symphony-production-evidence.mjs";

function measurement(state, integratedLufs, sessionTruePeakDbtp, section) {
  return {
    state,
    pagePolicy: SYSTEM_SYMPHONY_STATE_PAGE_POLICY,
    alignmentStep: SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP,
    startSection: section,
    startPosition: "Bars 5-6 / 32",
    measurementBars: SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS,
    metrics: {
      integratedLufs,
      sessionTruePeakDbtp,
      blockCount: 190,
      gatedBlockCount: 180,
    },
    samples: [
      { section, momentaryLufs: integratedLufs - 1, shortTermLufs: integratedLufs, truePeakDbtp: sessionTruePeakDbtp - 1 },
      { section, momentaryLufs: integratedLufs + 1, shortTermLufs: integratedLufs + 0.5, truePeakDbtp: sessionTruePeakDbtp },
    ],
  };
}

const stateMeasurements = [
  measurement("healthy", -26.8, -11.6, "theme-a"),
  measurement("warning", -29.6, -11.2, "theme-a"),
  measurement("critical", -20.9, -4.3, "theme-a"),
  measurement("unknown", -26.9, -11.5, "theme-a"),
];

test("production state plan aligns every state to one fresh-page form window", () => {
  const plan = buildStateMeasurementPlan();
  assert.deepEqual(plan.map(({ state }) => state), [...SYSTEM_SYMPHONY_STATES]);
  assert.equal(new Set(plan.map(({ state }) => state)).size, SYSTEM_SYMPHONY_STATES.length);
  assert.deepEqual([...new Set(plan.map(({ pagePolicy }) => pagePolicy))], [SYSTEM_SYMPHONY_STATE_PAGE_POLICY]);
  assert.deepEqual([...new Set(plan.map(({ alignmentBar }) => alignmentBar))], [SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR]);
  assert.deepEqual([...new Set(plan.map(({ alignmentStep }) => alignmentStep))], [SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP]);
  assert.deepEqual([...new Set(plan.map(({ measurementBars }) => measurementBars))], [SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS]);
  assert.deepEqual([...new Set(plan.map(({ finalBar }) => finalBar))], [
    SYSTEM_SYMPHONY_STATE_ALIGNMENT_BAR + SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS - 1,
  ]);
  assert.throws(() => buildStateMeasurementPlan(["healthy", "healthy"]), /must be unique/);
  assert.throws(() => buildStateMeasurementPlan(["healthy", "missing"]), /Unknown production measurement states/);
});

test("production transition route covers every ordered state pair once", () => {
  const pairs = transitionPairs();
  assert.equal(SYSTEM_SYMPHONY_TRANSITION_ROUTE[0], "healthy");
  assert.equal(SYSTEM_SYMPHONY_TRANSITION_ROUTE.at(-1), "healthy");
  assert.equal(pairs.length, SYSTEM_SYMPHONY_STATES.length * (SYSTEM_SYMPHONY_STATES.length - 1));
  assert.equal(new Set(pairs.map(({ key }) => key)).size, pairs.length);
  for (const from of SYSTEM_SYMPHONY_STATES) {
    for (const to of SYSTEM_SYMPHONY_STATES) {
      if (from !== to) assert.ok(pairs.some((pair) => pair.from === from && pair.to === to));
    }
  }
});

test("programme summary preserves aligned four-state and 32-bar evidence", () => {
  const summary = buildProgrammeSummary(stateMeasurements);
  assert.equal(summary.measuredBars, 32);
  assert.equal(summary.maximumTruePeakDbtp, -4.3);
  assert.deepEqual(summary.pagePolicies, [SYSTEM_SYMPHONY_STATE_PAGE_POLICY]);
  assert.deepEqual(summary.alignmentSteps, [SYSTEM_SYMPHONY_STATE_ALIGNMENT_STEP]);
  assert.deepEqual(summary.alignmentPositions, ["Bars 5-6 / 32"]);
  assert.ok(summary.unknownDeltas.healthy < 1);
  assert.ok(summary.unknownDeltas.warning < 4);
  assert.ok(summary.unknownDeltas.critical < 6.5);
  assert.ok(Math.abs(summary.states.unknown.peakToLoudnessRatioDb - 15.4) < 1e-9);
  assert.deepEqual(summary.sectionExtremes["theme-a"].momentaryLufs, {
    minimum: -30.6,
    maximum: -19.9,
  });
});

test("transition summary rejects a short-term loudness cliff", () => {
  const transitions = [
    {
      from: "healthy",
      to: "unknown",
      policy: "one-bar-decay",
      samples: [
        { shortTermLufs: -27, momentaryLufs: -27 },
        { shortTermLufs: -28, momentaryLufs: -29 },
      ],
    },
    {
      from: "unknown",
      to: "critical",
      policy: "one-bar-decay",
      samples: [
        { shortTermLufs: -38, momentaryLufs: -39 },
      ],
    },
  ];
  const summary = buildTransitionSummary(transitions, stateMeasurements);
  assert.equal(summary.transitions[0].passed, true);
  assert.equal(summary.transitions[1].passed, false);
  assert.equal(summary.allPassed, false);
});
