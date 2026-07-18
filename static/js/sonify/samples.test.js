import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ATMOSPHERE_LOOPS,
  ASSET_TIERS,
  BASS_LOOPS,
  BASS_SAMPLES,
  DRUM_SAMPLES,
  LEAD_LOOPS,
  SAMPLE_ASSET_VERSION,
  SAMPLE_LIBRARY,
  allSampleAssets,
  leadSliceForStep,
  resolveSamplePalette,
  sampleIdForEvent,
  sectionForPhrase,
} from "./samples.js";

test("the hybrid library exposes every prepared audio asset with a versioned URL", () => {
  const assets = allSampleAssets();
  const manifestUrl = new URL(
    "../../audio/system-symphony/manifest.json",
    import.meta.url,
  );
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  assert.equal(assets.length, 38);
  assert.equal(Object.keys(SAMPLE_LIBRARY).length, 38);
  assert.equal(Object.keys(DRUM_SAMPLES).length, 19);
  assert.equal(Object.keys(BASS_SAMPLES).length, 6);
  assert.equal(Object.keys(LEAD_LOOPS).length, 6);
  assert.equal(Object.keys(ATMOSPHERE_LOOPS).length, 3);
  assert.equal(Object.keys(BASS_LOOPS).length, 4);
  assert.equal(new Set(assets.map((asset) => asset.id)).size, assets.length);
  assert.equal(manifest.asset_count, assets.length);
  assert.equal(manifest.assets.length, assets.length);
  assert.deepEqual(
    new Set(manifest.assets.map((asset) => asset.slug)),
    new Set(assets.map((asset) => asset.file)),
  );
  for (const asset of assets) {
    assert.match(asset.url, new RegExp(`\\?v=${SAMPLE_ASSET_VERSION}$`));
    for (const extension of ["opus", "m4a", "wav"]) {
      const localAsset = new URL(
        `../../audio/system-symphony/${asset.file}.${extension}`,
        import.meta.url,
      );
      assert.equal(existsSync(localAsset), true, `${asset.file}.${extension} must exist`);
    }
  }
  const tierIds = Object.values(ASSET_TIERS).flat().map((asset) => asset.id);
  assert.equal(tierIds.length, assets.length);
  assert.equal(new Set(tierIds).size, assets.length);
});

test("every score state resolves a complete deterministic sample palette", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const first = resolveSamplePalette(state, null, 0);
    const second = resolveSamplePalette(state, null, 0);
    assert.deepEqual(first, second);
    for (const kind of ["kick", "snare", "hat", "metal", "bass", "bassLoop", "lead", "atmosphere"]) {
      const optional = (kind === "lead" && state !== "healthy")
        || (kind === "atmosphere" && state === "unknown")
        || kind === "bassLoop";
      if (optional && first[kind] === null) {
        assert.equal(first[kind], null, `${state} must use its mode-safe procedural lead`);
      } else {
        assert.ok(SAMPLE_LIBRARY[first[kind]], `${state} ${kind} must reference a real asset`);
      }
    }
    assert.equal(typeof first.section, "string");
    assert.equal(typeof first.signature, "string");
  }
});

test("seeded timbre controls change audible sample choices", () => {
  const base = {
    energy: 0.68,
    sectionVariant: 0,
    kickTimbre: 0,
    snareTimbre: 0,
    hatTimbre: 0,
    metalTimbre: 0,
    bassTimbre: 0,
    bassLoopTimbre: 0,
    leadTimbre: 0,
    atmosphereTimbre: 0,
    leadSliceVariant: 0,
  };
  const alternate = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, key === "energy" ? value : value + 1]),
  );
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const first = resolveSamplePalette(state, base, 0);
    const second = resolveSamplePalette(state, alternate, 0);
    assert.notEqual(first.signature, second.signature, `${state} timbre seed must be audible`);
  }
});

test("seeded hits stay inside the selected state pools", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    for (const kind of ["kick", "snare", "hat", "metal", "bass"]) {
      const choices = new Set(
        Array.from({ length: 32 }, (_, step) => (
          sampleIdForEvent(kind, state, step, 3, null)
        )),
      );
      assert.ok(choices.size >= 1);
      assert.ok([...choices].every((id) => SAMPLE_LIBRARY[id]));
    }
  }
});

test("each phrase holds one coherent drum kit and bass voice", () => {
  const performance = {
    sectionVariant: 0,
    kickTimbre: 2,
    snareTimbre: 3,
    hatTimbre: 4,
    metalTimbre: 5,
    bassTimbre: 6,
  };
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    for (const kind of ["kick", "snare", "hat", "metal", "bass"]) {
      const choices = new Set(
        Array.from({ length: 32 }, (_, step) => (
          sampleIdForEvent(kind, state, step, 0, performance)
        )),
      );
      assert.equal(choices.size, 1, `${state} ${kind} should not swap mid-phrase`);
    }
  }
});

test("every active bass palette uses only the six audited one-shots", () => {
  const selected = new Set([
    "bass-transformer",
    "bass-angry",
    "bass-percussive",
    "bass-burial",
    "bass-deep",
    "bass-doom",
  ]);
  assert.deepEqual(new Set(Object.keys(BASS_SAMPLES)), selected);
  assert.equal(BASS_SAMPLES["bass-transformer"].rootNote, "A0");
  assert.equal(BASS_SAMPLES["bass-burial"].rootNote, "C1");
  assert.equal(BASS_SAMPLES["bass-deep"].rootNote, "C1");
  assert.equal(BASS_SAMPLES["bass-doom"].rootNote, "C1");
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    for (let timbre = 0; timbre < 16; timbre += 1) {
      const id = sampleIdForEvent("bass", state, 0, 0, { bassTimbre: timbre });
      assert.equal(selected.has(id), true, `${state} selected ${id}`);
    }
  }
});

test("tonal loops stay inside their declared state compatibility", () => {
  const unknownLeads = new Set();
  for (let timbre = 0; timbre < 16; timbre += 1) {
    for (const state of ["healthy", "warning", "critical", "unknown"]) {
      const id = sampleIdForEvent("lead", state, 0, 0, { leadTimbre: timbre });
      if (id) assert.equal(LEAD_LOOPS[id].stateCompatibility.includes(state), true);
      if (state === "critical") assert.equal(id, null);
      if (state === "unknown") unknownLeads.add(id);
    }
    assert.equal(
      sampleIdForEvent("atmosphere", "unknown", 0, 0, { atmosphereTimbre: timbre }),
      null,
    );
  }
  assert.deepEqual(unknownLeads, new Set([null, "geneticist"]));
});

test("rhythmic bass loops are curated per state and exclude wobble and siren sources", () => {
  const selected = new Set([
    "neo-tokyo",
    "sequenced-bass",
    "evil-bass",
    "distorted-guitar",
  ]);
  assert.deepEqual(new Set(Object.keys(BASS_LOOPS)), selected);
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    for (let timbre = 0; timbre < 24; timbre += 1) {
      const id = sampleIdForEvent("bassLoop", state, 0, 0, {
        bassLoopTimbre: timbre,
      });
      assert.equal(id === null || selected.has(id), true, `${state} selected ${id}`);
    }
  }
  assert.equal(sampleIdForEvent("bassLoop", "unknown", 0, 0, null), null);
  assert.equal(
    allSampleAssets().some((sample) => /wobble|siren|megacorp/i.test(sample.file)),
    false,
  );
});

test("state section cycles and lead phrases remain distinct", () => {
  const expectedLeadCounts = { healthy: 4, warning: 2, critical: 0, unknown: 2 };
  const sectionSignatures = new Set();
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const sections = Array.from({ length: 8 }, (_, phrase) => (
      sectionForPhrase(state, phrase, null)
    ));
    sectionSignatures.add(sections.join(":"));
    const leadEvents = Array.from({ length: 32 }, (_, step) => (
      leadSliceForStep(state, step, 0, null)
    )).filter(Boolean);
    assert.equal(leadEvents.length, expectedLeadCounts[state]);
    assert.ok(leadEvents.every((event) => event.sourceBeat >= 0 && event.sourceBeat <= 28));
  }
  assert.equal(sectionSignatures.size, 4);
});
