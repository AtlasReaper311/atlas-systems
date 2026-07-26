import assert from "node:assert/strict";
import test from "node:test";

import { buildHybridFrame, deriveEstateFromServices } from "./apu-hybrid-state.js";
import {
  ATLAS_APU_CHIP_ID,
  ATLAS_APU_GRID,
  ATLAS_APU_ROLE_KEYS,
  ATLAS_APU_SCORE_PLAN_BUILD_ID,
  buildAtlasApuScorePlan,
  transitionSignatureForStates,
} from "./atlas-apu-score-plan.js";
import {
  ATLAS_APU_STATE_THEME_KEYS,
  ATLAS_APU_STATE_THEMES_BUILD_ID,
  themeForState,
} from "./atlas-apu-state-themes.js";
import { computeFrame } from "./mapping.js";

function service(name, status, overrides = {}) {
  return {
    name,
    status,
    measured: true,
    evidence_source: `preview:${name}`,
    measured_at: "2026-07-26T13:22:04.000Z",
    latency_ms: 35,
    uptime_pct: 99.95,
    error_rate: 0,
    ...overrides,
  };
}

const mixedFixture = Object.freeze([
  ...Array.from({ length: 18 }, (_, index) => service(`healthy-${index}`, "healthy")),
  service("warning-0", "degraded", {
    depends_on: ["atlas-api-public"],
    latency_ms: 280,
    error_rate: 0.01,
  }),
  service("unknown-0", "unknown", { evidence_source: null, measured_at: null }),
  service("unknown-1", "unknown", { evidence_source: null, measured_at: null }),
]);

function hybridFrame(overrides = {}) {
  const merged = {
    timestamp: "2026-07-26T13:22:04.000Z",
    preview: true,
    stale: false,
    estate: deriveEstateFromServices(mixedFixture),
    services: mixedFixture,
    ...overrides,
  };
  return buildHybridFrame(computeFrame(merged), merged);
}

test("hybrid frames expose an auditable Atlas APU score plan", () => {
  const frame = hybridFrame();
  const plan = frame.scorePlan;

  assert.match(ATLAS_APU_SCORE_PLAN_BUILD_ID, /score-plan-v2$/);
  assert.match(plan.themesBuildId, /state-themes-v1$/);
  assert.equal(plan.chip, ATLAS_APU_CHIP_ID);
  assert.equal(plan.engine, "Atlas APU");
  assert.equal(plan.source, "preview");
  assert.equal(plan.dominantState, "healthy");
  assert.equal(plan.movement, "Green Clock");
  assert.equal(plan.theme.emotionalIntent, "open, heroic, stable");
  assert.match(plan.theme.harmonicColor, /Dorian\/Lydian-ish/);
  assert.equal(plan.tempo.bpm, 100);
  assert.equal(plan.tempo.grid, ATLAS_APU_GRID);
  assert.equal(plan.tempo.lockedTransport, true);
  assert.equal(plan.sampleFreeTarget, true);
  assert.ok(plan.seed.startsWith("APU-"));
  assert.equal(plan.motif.degrees.length, 8);
  assert.equal(plan.motif.name, plan.theme.motif.name);
  assert.deepEqual(Object.keys(plan.roles), ATLAS_APU_ROLE_KEYS);
  assert.equal(plan.roles.clock.lane, "strict pulse ostinato");
  assert.equal(plan.roles.pulse.dutyCycle, 0.5);
  assert.equal(plan.roles.memory.evidence, 4);
  assert.equal(plan.roles.contention.alerts, 1);
  assert.ok(plan.confidence > 0.8);
  assert.equal(plan.evidence.warningCount, 1);
  assert.equal(plan.evidence.unknownCount, 2);
  assert.match(plan.evidence.reason, /Healthy supplies the harmonic grammar/);
});

test("state themes define distinct authored zones instead of generic presets", () => {
  assert.deepEqual(ATLAS_APU_STATE_THEME_KEYS, [
    "healthy",
    "warning",
    "critical",
    "unknown",
    "recovery",
  ]);
  assert.match(ATLAS_APU_STATE_THEMES_BUILD_ID, /state-themes-v1$/);

  const themes = ATLAS_APU_STATE_THEME_KEYS.map(themeForState);
  assert.equal(new Set(themes.map((theme) => theme.movement)).size, 5);
  assert.equal(new Set(themes.map((theme) => theme.bassPattern)).size, 5);
  assert.equal(new Set(themes.map((theme) => theme.noisePattern)).size, 5);
  assert.equal(new Set(themes.map((theme) => theme.counterline)).size, 5);
  assert.ok(themes.every((theme) => theme.constraints.length >= 3));
  assert.ok(themes.every((theme) => theme.evidenceFocus.length >= 3));
});

test("critical is urgent and sparse while unknown is beautiful and uneasy", () => {
  const healthy = themeForState("healthy");
  const critical = themeForState("critical");
  const unknown = themeForState("unknown");

  assert.equal(unknown.emotionalIntent, "beautiful and uneasy");
  assert.ok(unknown.range.beauty > critical.range.beauty);
  assert.ok(unknown.range.urgency < critical.range.urgency);
  assert.match(unknown.constraints.join(" "), /never pretend certainty/);
  assert.ok(critical.range.urgency > 0.9);
  assert.ok(critical.motif.degrees.length < healthy.motif.degrees.length);
  assert.match(critical.motif.notePolicy, /few notes/);
});

test("score plans replay deterministically for the same frame", () => {
  const frame = hybridFrame();
  assert.deepEqual(
    buildAtlasApuScorePlan(frame),
    buildAtlasApuScorePlan(frame),
  );

  const changed = hybridFrame({
    services: [
      ...mixedFixture.slice(0, -1),
      service("critical-0", "down", { latency_ms: null, uptime_pct: 93, error_rate: 0.04 }),
    ],
  });
  assert.notEqual(frame.scorePlan.seed, changed.scorePlan.seed);
  assert.equal(changed.scorePlan.dominantState, "critical");
  assert.equal(changed.scorePlan.movement, "Critical Choke");
});

test("transition signatures encode the Atlas APU chapter change", () => {
  assert.deepEqual(transitionSignatureForStates("healthy", "warning"), {
    from: "healthy",
    to: "warning",
    id: "pressure-ramp",
    label: "Healthy -> Warning",
    gesture: "duty cycle tightens, noise doubles, counterline enters",
  });

  const recovered = buildAtlasApuScorePlan(hybridFrame(), { previousState: "critical" });
  assert.equal(recovered.transition.id, "recovery-bloom");
  assert.equal(recovered.transitionTheme.movement, "Recovery Bloom");
  assert.equal(recovered.transitionTheme.chapterRole, "state improvement accent, not a permanent health claim");
  assert.equal(recovered.roles.recovery.active, true);
  assert.match(recovered.transition.gesture, /bright rising arpeggio/);
});

test("stale frames fail closed into an unknown score plan with low confidence", () => {
  const stale = hybridFrame({ stale: true });
  const plan = stale.scorePlan;

  assert.equal(plan.dominantState, "unknown");
  assert.equal(plan.movement, "Unknown Drift");
  assert.equal(plan.theme.emotionalIntent, "beautiful and uneasy");
  assert.equal(plan.confidence, 0);
  assert.equal(plan.roles.memory.state, "stale takeover");
  assert.equal(plan.evidence.stale, true);
  assert.deepEqual(plan.stateVector, {
    healthy: 0,
    warning: 0,
    critical: 0,
    unknown: 1,
  });
});
