import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_SYMPHONY_STATE_MEASUREMENT_BARS,
  SYSTEM_SYMPHONY_STATES,
  SYSTEM_SYMPHONY_TRANSITION_ROUTE,
  buildProgrammeSummary,
  buildTransitionSummary,
  transitionPairs,
} from "../../scripts/system-symphony-production-evidence.mjs";

function measurement(state, integratedLufs, sessionTruePeakDbtp, section) {
  return {
    state,
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
  measurement("healthy", -26.8, -11.6, "intro"),
  measurement("warning", -29.6, -11.2, "theme-a"),
  measurement("critical", -20.9, -4.3, "peak"),
  measurement("unknown", -26.9, -11.5, "theme-b"),
];

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

test("programme summary preserves four-state and 32-bar evidence", () => {
  const summary = buildProgrammeSummary(stateMeasurements);
  assert.equal(summary.measuredBars, 32);
  assert.equal(summary.maximumTruePeakDbtp, -4.3);
  assert.ok(summary.unknownDeltas.healthy < 1);
  assert.ok(summary.unknownDeltas.warning < 4);
  assert.ok(summary.unknownDeltas.critical < 6.5);
  assert.ok(Math.abs(summary.states.unknown.peakToLoudnessRatioDb - 15.4) < 1e-9);
  assert.deepEqual(summary.sectionExtremes.intro.momentaryLufs, {
    minimum: -27.8,
    maximum: -25.8,
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
