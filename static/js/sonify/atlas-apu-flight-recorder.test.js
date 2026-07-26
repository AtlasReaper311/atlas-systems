import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildHybridFrame, deriveEstateFromServices } from "./apu-hybrid-state.js";
import {
  ATLAS_APU_BLACK_BOX_SCHEMA_VERSION,
  buildReplayScorePlanFromBlackBoxCartridge,
  cartridgeSummary,
  createAtlasApuBlackBoxCartridge,
  frameFromBlackBoxCartridge,
  materializeBlackBoxArchive,
  replayUrlForBlackBoxCartridge,
  telemetrySnapshotForFrame,
  validateBlackBoxCartridge,
} from "./atlas-apu-flight-recorder.js";
import { buildAtlasApuScorePlan } from "./atlas-apu-score-plan.js";
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

function frameFor(services, overrides = {}) {
  const merged = {
    timestamp: "2026-07-26T13:22:04.000Z",
    preview: true,
    stale: false,
    estate: deriveEstateFromServices(services),
    services,
    ...overrides,
  };
  return buildHybridFrame(computeFrame(merged), merged);
}

const fixtureFrame = () => frameFor([
  service("atlas-systems", "healthy"),
  service("atlas-api-public", "degraded", {
    depends_on: ["github-pulse"],
    latency_ms: 240,
    error_rate: 0.012,
  }),
  service("atlas-dep-audit", "unknown", {
    evidence_source: null,
    measured_at: null,
    latency_ms: null,
    uptime_pct: null,
    error_rate: null,
  }),
]);

test("black-box cartridges contain the Phase 9 replay and audit schema", () => {
  const frame = fixtureFrame();
  const cartridge = createAtlasApuBlackBoxCartridge({
    frame,
    source: "fixture",
    routeMode: "TRACE",
    replaySeed: "BEEF",
    engineVersion: "20260726-system-symphony-atlas-apu-live-v7",
    commit: "c41d7624df550652c93373f60238a1259bafbf7a",
  });

  assert.equal(cartridge.schemaVersion, ATLAS_APU_BLACK_BOX_SCHEMA_VERSION);
  assert.equal(cartridge.title, "ATLAS APU BLACK BOX CARTRIDGE");
  assert.match(cartridge.cartridgeId, /^APU-[0-9A-F]{8}$/);
  assert.equal(cartridge.frameTime, "2026-07-26T13:22:04.000Z");
  assert.equal(cartridge.source, "fixture");
  assert.equal(cartridge.routeMode, "TRACE");
  assert.equal(cartridge.replaySeed, "BEEF");
  assert.match(cartridge.replayUrl, /\/lab\/system-symphony\/replay\/\?cartridge=APU-/);
  assert.equal(cartridge.engineVersion, "20260726-system-symphony-atlas-apu-live-v7");
  assert.equal(cartridge.commit, "c41d762");
  assert.equal(cartridge.commitBuild.fullCommit, "c41d7624df550652c93373f60238a1259bafbf7a");
  assert.equal(cartridge.sampleFreeGuardStatus, "yes / score-plan");
  assert.equal(cartridge.scorePlan.seed, cartridge.seed);
  assert.equal(cartridge.movementName, cartridge.scorePlan.movement);
  assert.equal(cartridge.transition.id, cartridge.scorePlan.transition.id);
  assert.equal(cartridge.telemetrySnapshot.voices.length, 3);
  assert.deepEqual(cartridge.telemetrySnapshot.voices[1].depends_on, ["github-pulse"]);
  assert.deepEqual(validateBlackBoxCartridge(cartridge), { valid: true, missing: [] });
});

test("saved cartridge input deterministically reproduces its score plan", () => {
  const frame = fixtureFrame();
  const original = createAtlasApuBlackBoxCartridge({
    frame,
    source: "fixture",
    routeMode: "PLAY",
    replaySeed: "A7A5",
    engineVersion: "20260726-system-symphony-atlas-apu-live-v7",
  });
  const replayFrame = frameFromBlackBoxCartridge(original);
  const rebuilt = buildAtlasApuScorePlan(replayFrame, { sourceMode: original.source });

  assert.deepEqual(rebuilt, original.scorePlan);
  assert.deepEqual(buildReplayScorePlanFromBlackBoxCartridge(original), original.scorePlan);
  assert.deepEqual(
    createAtlasApuBlackBoxCartridge({
      frame: replayFrame,
      source: original.source,
      routeMode: original.routeMode,
      replaySeed: original.replaySeed,
      engineVersion: original.engineVersion,
    }).scorePlan,
    original.scorePlan,
  );
});

test("replay URLs and summaries are deterministic and source-labelled", () => {
  const url = replayUrlForBlackBoxCartridge({
    origin: "https://atlas-systems.uk",
    cartridgeId: "APU-ABCDEF12",
    frameSeed: "APU-ABCDEF12",
    replaySeed: "beef",
    dominantState: "warning",
    source: "preview",
  });
  assert.equal(
    url,
    "https://atlas-systems.uk/lab/system-symphony/replay/?cartridge=APU-ABCDEF12&frame=APU-ABCDEF12&seed=BEEF&state=warning&source=fixture",
  );

  const cartridge = createAtlasApuBlackBoxCartridge({
    frame: fixtureFrame(),
    source: "fixture",
    routeMode: "REPLAY",
    replaySeed: "BEEF",
    engineVersion: "20260726-system-symphony-atlas-apu-live-v7",
  });
  assert.match(cartridgeSummary(cartridge), /fixture \/ APU-[0-9A-F]{8}/);
});

test("telemetry snapshots keep absence explicit without promoting fixture data to live", () => {
  const frame = fixtureFrame();
  const snapshot = telemetrySnapshotForFrame(frame);

  assert.equal(snapshot.evidenceMode, "preview");
  assert.equal(snapshot.scoreState, frame.scoreState);
  assert.equal(snapshot.totalComponents, 3);
  assert.equal(snapshot.measuredComponents, 2);
  assert.equal(snapshot.unknownCount, 1);
  assert.equal(snapshot.voices[2].evidenceSource, null);
  assert.equal(snapshot.voices[2].measuredAt, null);
});

test("static Phase 9 archive materializes into deterministic cartridges", () => {
  const archive = JSON.parse(readFileSync(
    new URL("../../../lab/system-symphony/black-box/archive.json", import.meta.url),
    "utf8",
  ));
  const materialized = materializeBlackBoxArchive(archive, {
    origin: "https://atlas-systems.uk",
  });

  assert.equal(materialized.source, "fixture");
  assert.equal(materialized.cartridges.length, 2);
  assert.deepEqual(
    materialized.cartridges.map((cartridge) => cartridge.dominantState),
    ["healthy", "critical"],
  );
  for (const cartridge of materialized.cartridges) {
    assert.equal(validateBlackBoxCartridge(cartridge).valid, true);
    assert.equal(cartridge.source, "fixture");
    assert.equal(cartridge.sampleFreeGuardStatus, "yes / score-plan");
    assert.match(cartridge.replayUrl, /source=fixture/);
    assert.deepEqual(
      buildAtlasApuScorePlan(frameFromBlackBoxCartridge(cartridge), {
        sourceMode: cartridge.source,
      }),
      cartridge.scorePlan,
    );
  }
});
