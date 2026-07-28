import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_STATE_ORCHESTRATION_D1A_BUILD_ID,
  describeD1AStateOrchestration,
  stateArpeggioInstructionsForPhrase,
  stateFeatureInstructionsForPhrase,
} from "./apu-state-orchestration-d1a.js";
import { mixDirectiveFor } from "./apu-mix-director.js";
import { ornamentInstructionsForPhrase } from "./apu-performance-conductor.js";

const plan = (state, phraseIndex = 0, phase = "groove") => ({
  state,
  phraseIndex,
  phase,
  bars: phraseIndex * 2,
  density: 0.72,
  silenceBudget: 0.2,
  ornaments: [],
});

test("D1A build id is explicit", () => {
  assert.match(APU_STATE_ORCHESTRATION_D1A_BUILD_ID, /pass-d1a/);
});

test("every state receives deterministic structural arpeggios", () => {
  const signatures = new Set();
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const first = stateArpeggioInstructionsForPhrase(plan(state, 3));
    const second = stateArpeggioInstructionsForPhrase(plan(state, 3));
    assert.deepEqual(first, second);
    assert.ok(first.length >= 4, state);
    assert.ok(Object.isFrozen(first));
    assert.ok(first.every(Object.isFrozen));
    assert.ok(first.every((event) => event.offsetSteps >= 0 && event.offsetSteps < 32));
    assert.ok(first.every((event) => event.velocity >= 0.1 && event.velocity <= 0.3));
    signatures.add(JSON.stringify(first.map((event) => [event.offsetSteps, event.midiOffset])));
  }
  assert.equal(signatures.size, 4);
});

test("Explorer has the fastest and widest arpeggio treatment", () => {
  const explorer = stateArpeggioInstructionsForPhrase(plan("healthy", 0));
  const lost = stateArpeggioInstructionsForPhrase(plan("unknown", 0));
  assert.ok(explorer.length > lost.length);
  assert.ok(explorer[1].offsetSteps - explorer[0].offsetSteps < lost[1].offsetSteps - lost[0].offsetSteps);
  assert.ok(Math.max(...explorer.map((event) => event.midiOffset)) > Math.max(...lost.map((event) => event.midiOffset)));
});

test("Grid Pressure climbs without resolving directly home", () => {
  const grid = stateArpeggioInstructionsForPhrase(plan("warning", 0));
  assert.notEqual(grid.at(-1).midiOffset, 0);
  assert.ok(grid.some((event, index) => index > 0 && event.offsetSteps - grid[index - 1].offsetSteps === 3));
});

test("Boss Protocol adds upper-register syncopated power chords", () => {
  const boss = stateFeatureInstructionsForPhrase(plan("critical", 0, "rupture"));
  const chords = boss.filter((event) => event.ornament === "boss-power-chord");
  assert.equal(chords.length, 4);
  assert.ok(chords.every((event) => event.midiOffset >= 12));
  assert.deepEqual([...new Set(chords.map((event) => event.offsetSteps))], [2, 18]);
  assert.ok(chords.some((event) => event.voice === "primary"));
  assert.ok(chords.some((event) => event.voice === "secondary"));
});

test("Lost Signal gains slow notes and delayed echoes without becoming fast", () => {
  const lost = stateFeatureInstructionsForPhrase(plan("unknown", 2));
  const arps = lost.filter((event) => event.ornament === "state-arp");
  const echoes = lost.filter((event) => event.ornament === "lost-signal-echo");
  assert.equal(arps.length, 4);
  assert.equal(echoes.length, 2);
  assert.ok(arps.every((event) => event.duration === "8n"));
  assert.ok(arps.slice(1).every((event, index) => event.offsetSteps - arps[index].offsetSteps === 8));
});

test("D1A remains inspectable while D4 owns major feature phrases", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    assert.ok(stateArpeggioInstructionsForPhrase(plan(state, 4)).length >= 4);

    const feature = ornamentInstructionsForPhrase(plan(state, 4));
    assert.ok(feature.some((event) => event.ornament === "d4-feature-arp"));
    assert.ok(!feature.some((event) => event.ornament === "connective-arp"));
    assert.ok(!feature.some((event) => event.ornament === "state-arp"));

    const connective = ornamentInstructionsForPhrase(plan(state, 2));
    assert.ok(connective.some((event) => event.ornament === "connective-arp"));
    assert.ok(connective.some((event) => event.ornament === "state-arp"));
  }
});

test("Boss low-end buses are lower than Explorer while lead weight remains", () => {
  const explorer = mixDirectiveFor({ state: "healthy", phase: "groove" });
  const boss = mixDirectiveFor({ state: "critical", phase: "groove" });
  assert.ok(boss.buses.bass.gainMul < explorer.buses.bass.gainMul * 0.75);
  assert.ok(boss.buses.pad.gainMul < explorer.buses.pad.gainMul * 0.6);
  assert.ok(boss.buses.primary.gainMul > explorer.buses.primary.gainMul);
  assert.ok(boss.buses.secondary.gainMul > explorer.buses.secondary.gainMul);
});

test("Lost Signal is no longer pad-dominant in the state mix", () => {
  const lost = mixDirectiveFor({ state: "unknown", phase: "groove" });
  assert.ok(lost.buses.primary.gainMul > lost.buses.pad.gainMul);
  assert.ok(lost.buses.secondary.gainMul > lost.buses.pad.gainMul);
  assert.match(describeD1AStateOrchestration(plan("unknown", 0)), /Lost Signal/);
});

test("Boss power chords enter after intro and clear for afterglow", () => {
  const intro = stateFeatureInstructionsForPhrase(plan("critical", 0, "intro"));
  const groove = stateFeatureInstructionsForPhrase(plan("critical", 0, "groove"));
  const afterglow = stateFeatureInstructionsForPhrase(plan("critical", 0, "afterglow"));
  assert.equal(intro.filter((event) => event.ornament === "boss-power-chord").length, 0);
  assert.equal(groove.filter((event) => event.ornament === "boss-power-chord").length, 4);
  assert.equal(afterglow.filter((event) => event.ornament === "boss-power-chord").length, 0);
});
