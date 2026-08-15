import test from "node:test";
import assert from "node:assert/strict";

import {
  MODE_EVENTUAL,
  MODE_QUORUM,
  NETWORK_CLEAN,
  NETWORK_ISOLATE_C,
  NETWORK_SLOW_B,
  advanceConsensus,
  agreementCount,
  beginWrite,
  canBeginWrite,
  committedAgreementCount,
  createConsensusState,
  distinctReplicaVersions,
  nextWriteValue,
  nodePhase,
  setMode,
  setNetwork,
} from "../consensus/consensus-core.js";

test("starts with three replicas in agreement", () => {
  const state = createConsensusState();
  assert.equal(state.committedValue, "0x2A");
  assert.equal(agreementCount(state), 3);
  assert.equal(committedAgreementCount(state), 3);
  assert.equal(distinctReplicaVersions(state), 1);
});

test("quorum write remains uncommitted on leader acknowledgement alone", () => {
  const state = beginWrite(createConsensusState({ mode: MODE_QUORUM }));
  assert.equal(state.nodes.A.version, 1);
  assert.equal(state.committedVersion, 0);
  assert.equal(state.write.status, "pending");
  assert.equal(agreementCount(state), 1);
  assert.equal(canBeginWrite(state), false);
});

test("clean quorum commits after the first follower receives the write", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_CLEAN }));
  state = advanceConsensus(state, 800);
  assert.equal(state.nodes.B.version, 1);
  assert.equal(state.nodes.C.version, 0);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.write.status, "propagating");
});

test("clean links converge after both follower deliveries", () => {
  let state = beginWrite(createConsensusState());
  state = advanceConsensus(state, 1200);
  assert.equal(agreementCount(state), 3);
  assert.equal(committedAgreementCount(state), 3);
  assert.equal(state.write.status, "settled");
  assert.equal(canBeginWrite(state), true);
});

test("slow B does not block quorum when C can acknowledge", () => {
  let state = beginWrite(createConsensusState({ network: NETWORK_SLOW_B }));
  state = advanceConsensus(state, 1000);
  assert.equal(state.nodes.B.version, 0);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.committedVersion, 1);
  assert.equal(nodePhase(state, "B"), "delayed");
});

test("isolating C still permits a 2-of-3 quorum through A and B", () => {
  let state = beginWrite(createConsensusState({ network: NETWORK_ISOLATE_C }));
  state = advanceConsensus(state, 800);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.nodes.B.version, 1);
  assert.equal(state.nodes.C.version, 0);
  assert.equal(nodePhase(state, "C"), "isolated");
  assert.equal(committedAgreementCount(state), 2);
});

test("healing an isolated replica schedules catch-up to the latest leader value", () => {
  let state = beginWrite(createConsensusState({ network: NETWORK_ISOLATE_C }));
  state = advanceConsensus(state, 900);
  state = setNetwork(state, NETWORK_CLEAN);
  assert.equal(state.inflight.some((message) => message.to === "C" && message.version === 1), true);
  state = advanceConsensus(state, 1200);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(committedAgreementCount(state), 3);
});

test("eventual mode accepts the leader write before follower convergence", () => {
  const state = beginWrite(createConsensusState({ mode: MODE_EVENTUAL }));
  assert.equal(state.committedVersion, 1);
  assert.equal(state.committedValue, state.nodes.A.value);
  assert.equal(committedAgreementCount(state), 1);
  assert.equal(state.write.status, "propagating");
});

test("eventual mode with slow B visibly diverges before converging", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_EVENTUAL, network: NETWORK_SLOW_B }));
  state = advanceConsensus(state, 1000);
  assert.equal(distinctReplicaVersions(state), 2);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.nodes.B.version, 0);
  state = advanceConsensus(state, 2000);
  assert.equal(agreementCount(state), 3);
  assert.equal(state.write.status, "settled");
});

test("mode changes affect the next write without rewriting current replica state", () => {
  const initial = createConsensusState();
  const changed = setMode(initial, MODE_EVENTUAL);
  assert.equal(changed.mode, MODE_EVENTUAL);
  assert.equal(changed.nodes.A.version, 0);
  assert.equal(changed.committedVersion, 0);
  assert.equal(initial.mode, MODE_QUORUM);
});

test("write values advance deterministically and wrap through the fixed sequence", () => {
  let state = createConsensusState();
  assert.equal(nextWriteValue(state), "0x7C");

  for (let index = 0; index < 8; index += 1) {
    state = beginWrite(state);
    state = advanceConsensus(state, 4000);
  }

  assert.equal(state.nodes.A.version, 8);
  assert.equal(state.nodes.A.value, "0x2A");
  assert.equal(nextWriteValue(state), "0x7C");
});
