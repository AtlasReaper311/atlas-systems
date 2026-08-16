import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MODE_EVENTUAL,
  MODE_QUORUM,
  NETWORK_CLEAN,
  NETWORK_ISOLATE_C,
  NETWORK_SLOW_B,
  acknowledgementCount,
  advanceConsensus,
  beginWrite,
  createConsensusState,
  localReplicaView,
  logWindow,
  messageProgress,
  nodePhase,
  setMode,
  setNetwork,
} from "../consensus/consensus-core.js";

const html = readFileSync(new URL("../consensus/index.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../consensus/consensus.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../consensus/consensus.css", import.meta.url), "utf8");

test("baseline is deterministic and fully converged", () => {
  const first = createConsensusState();
  const second = createConsensusState();
  assert.deepEqual(first, second);
  assert.equal(first.committedValue, "0x2A");
  assert.equal(first.convergedValue, "0x2A");
  assert.equal(first.nodes.A.version, 0);
  assert.equal(first.nodes.B.version, 0);
  assert.equal(first.nodes.C.version, 0);
});

test("quorum write starts with leader proposal and one acknowledgement", () => {
  const state = beginWrite(createConsensusState());
  assert.equal(state.write.status, "proposing");
  assert.deepEqual(state.write.acks, ["A"]);
  assert.equal(state.committedVersion, 0);
  assert.equal(state.nodes.A.version, 1);
  assert.equal(state.inflight.filter((message) => message.kind === "proposal").length, 2);
  assert.equal(nodePhase(state, "A"), "proposal");
});

test("quorum does not commit until an acknowledgement returns", () => {
  let state = beginWrite(createConsensusState());
  state = advanceConsensus(state, 700);
  assert.equal(state.nodes.B.version, 1);
  assert.equal(state.committedVersion, 0);
  assert.equal(acknowledgementCount(state), 1);
  state = advanceConsensus(state, 280);
  assert.equal(state.committedVersion, 1);
  assert.ok(acknowledgementCount(state) >= 2);
});

test("eventual exposes accepted truth before full convergence", () => {
  let state = setMode(createConsensusState(), MODE_EVENTUAL);
  state = beginWrite(state);
  assert.equal(state.acceptedVersion, 1);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.convergedVersion, 0);
  assert.equal(state.write.status, "accepted");
  state = advanceConsensus(state, 2200);
  state = advanceConsensus(state, 500);
  assert.equal(state.convergedVersion, 1);
  assert.equal(state.write.status, "settled");
});

test("slow B allows C to satisfy quorum while B remains stale", () => {
  let state = setNetwork(createConsensusState(), NETWORK_SLOW_B);
  state = beginWrite(state);
  state = advanceConsensus(state, 1200);
  state = advanceConsensus(state, 320);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.nodes.B.version, 0);
  assert.equal(state.committedVersion, 1);
  assert.equal(nodePhase(state, "B"), "delayed");
  assert.equal(state.convergedVersion, 0);
});

test("isolated C remains stale while A and B form quorum", () => {
  let state = setNetwork(createConsensusState(), NETWORK_ISOLATE_C);
  state = beginWrite(state);
  state = advanceConsensus(state, 1200);
  state = advanceConsensus(state, 300);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.nodes.B.version, 1);
  assert.equal(state.nodes.C.version, 0);
  assert.equal(nodePhase(state, "C"), "isolated");
  assert.equal(state.convergedVersion, 0);
});

test("healing an isolated replica schedules reconciliation and restores convergence", () => {
  let state = setNetwork(createConsensusState(), NETWORK_ISOLATE_C);
  state = beginWrite(state);
  state = advanceConsensus(state, 1300);
  state = setNetwork(state, NETWORK_CLEAN);
  assert.ok(state.inflight.some((message) => message.kind === "reconcile" && message.to === "C"));
  state = advanceConsensus(state, 1800);
  state = advanceConsensus(state, 500);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.convergedVersion, 1);
  assert.equal(state.write.status, "settled");
});

test("acknowledgement packets travel back toward the leader", () => {
  let state = beginWrite(createConsensusState());
  state = advanceConsensus(state, 700);
  const ack = state.inflight.find((message) => message.kind === "ack" && message.from === "B");
  assert.ok(ack);
  assert.equal(ack.to, "A");
  assert.ok(messageProgress(state, ack) >= 0 && messageProgress(state, ack) <= 1);
});

test("replica log window exposes missing versions during partition", () => {
  let state = setNetwork(createConsensusState(), NETWORK_ISOLATE_C);
  state = beginWrite(state);
  state = advanceConsensus(state, 1300);
  const cLog = logWindow(state, "C");
  assert.equal(cLog.at(-1).version, 1);
  assert.equal(cLog.at(-1).status, "missing");
});

test("local replica view distinguishes local truth from committed truth", () => {
  let state = setNetwork(createConsensusState(), NETWORK_ISOLATE_C);
  state = beginWrite(state);
  state = advanceConsensus(state, 1600);
  state = advanceConsensus(state, 300);
  const view = localReplicaView(state, "C");
  assert.equal(view.localVersion, 0);
  assert.equal(view.committedVersion, 1);
  assert.equal(view.lag, 1);
  assert.equal(view.phase, "isolated");
});

test("mode changes are blocked while a write is active", () => {
  const state = beginWrite(createConsensusState());
  const changed = setMode(state, MODE_EVENTUAL);
  assert.equal(changed.mode, MODE_QUORUM);
});

test("deterministic replay produces identical state", () => {
  const run = () => {
    let state = setNetwork(createConsensusState(), NETWORK_SLOW_B);
    state = beginWrite(state);
    state = advanceConsensus(state, 1200);
    state = advanceConsensus(state, 2400);
    return state;
  };
  assert.deepEqual(run(), run());
});

test("page teaches the protocol and exposes local replica inspection", () => {
  assert.match(html, /WRITE STATE\. BREAK A LINK\. WATCH THE CLUSTER DECIDE WHAT COUNTS AS TRUE\./);
  assert.match(html, /PROPOSE/);
  assert.match(html, /ACK/);
  assert.match(html, /COMMIT/);
  assert.match(html, /CONVERGE/);
  assert.match(html, /LATEST ACCEPTED/);
  assert.match(html, /FULLY CONVERGED/);
  assert.match(html, /data-local-view="C"/);
  assert.doesNotMatch(html, /consensus-proposal/);
  assert.doesNotMatch(html, /\/lab\/xray\//);
});

test("browser layer animates proposal, acknowledgement, reconciliation, and phase coherence", () => {
  assert.match(source, /message\.kind === "ack"/);
  assert.match(source, /message\.kind === "reconcile"/);
  assert.match(source, /drawPacket/);
  assert.match(source, /drawWave/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /document\.hidden/);
  assert.match(css, /consensus-node-orbit/);
  assert.match(css, /data-network="slow-b"/);
  assert.match(css, /data-phase="isolated"/);
  assert.match(css, /consensus-quorum-ring/);
});
