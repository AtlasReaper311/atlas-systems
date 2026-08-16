import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MODE_EVENTUAL,
  MODE_QUORUM,
  NETWORK_CLEAN,
  NETWORK_ISOLATE_C,
  NETWORK_SLOW_B,
  advanceConsensus,
  beginWrite,
  canBeginWrite,
  createConsensusState,
  quorumCount,
  replicaLag,
  setNetwork,
  stateSummary,
} from "../consensus/consensus-core.js";

const html = readFileSync(new URL("../consensus/index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../consensus/consensus.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../consensus/consensus.css", import.meta.url), "utf8");

test("baseline starts fully converged", () => {
  const state = createConsensusState();
  assert.equal(state.committedVersion, 0);
  assert.equal(state.convergedVersion, 0);
  assert.equal(quorumCount(state), 3);
  assert.equal(state.transactions.length, 0);
});

test("quorum write emits write and outbound proposals before commit", () => {
  const state = beginWrite(createConsensusState({ mode: MODE_QUORUM }));
  assert.equal(state.transactions[0].status, "proposing");
  assert.equal(state.transactions[0].acks.length, 1);
  assert.equal(state.committedVersion, 0);
  assert.deepEqual(state.events.map((event) => event.type).slice(0, 4), ["write", "append", "proposal-send", "proposal-send"]);
});

test("quorum commits after first follower ack returns", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM }));
  state = advanceConsensus(state, 900);
  assert.equal(state.committedVersion, 1);
  assert.ok(state.transactions[0].acks.length >= 2);
  assert.ok(state.events.some((event) => event.type === "commit"));
});

test("quorum does not report convergence before every replica applies the commit", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_CLEAN }));
  state = advanceConsensus(state, 900);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.convergedVersion, 0);
  state = advanceConsensus(state, 700);
  assert.equal(state.convergedVersion, 1);
});

test("clean network eventually converges all three replicas", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_CLEAN }));
  state = advanceConsensus(state, 2400);
  assert.equal(state.convergedVersion, 1);
  assert.equal(state.nodes.B.version, 1);
  assert.equal(state.nodes.C.version, 1);
  assert.ok(state.events.some((event) => event.type === "converged"));
});

test("slow B allows quorum while B remains visibly behind", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_SLOW_B }));
  state = advanceConsensus(state, 1100);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.nodes.B.version, 0);
  assert.equal(replicaLag(state, "B"), 1);
});

test("isolated C does not block 2 of 3 quorum", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_ISOLATE_C }));
  state = advanceConsensus(state, 1300);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.nodes.C.version, 0);
  assert.ok(state.events.some((event) => event.type === "partition-drop" && event.node === "C"));
});

test("healing isolated C schedules explicit catch-up and convergence", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_ISOLATE_C }));
  state = advanceConsensus(state, 1400);
  state = setNetwork(state, NETWORK_CLEAN);
  assert.ok(state.events.some((event) => event.type === "catchup-send"));
  state = advanceConsensus(state, 1600);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.convergedVersion, 1);
  assert.ok(state.events.some((event) => event.type === "catchup-arrive"));
});

test("eventual mode separates accepted from converged state", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_EVENTUAL, network: NETWORK_SLOW_B }));
  assert.equal(state.acceptedVersion, 1);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.convergedVersion, 0);
  state = advanceConsensus(state, 1200);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.nodes.B.version, 0);
  assert.equal(state.convergedVersion, 0);
});

test("history retains multiple transaction traces", () => {
  let state = beginWrite(createConsensusState());
  state = advanceConsensus(state, 2400);
  assert.equal(canBeginWrite(state), true);
  state = beginWrite(state);
  state = advanceConsensus(state, 2400);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.transactions[0].version, 2);
  assert.equal(state.transactions[1].version, 1);
});

test("state summary names accepted committed and converged truth", () => {
  const summary = stateSummary(beginWrite(createConsensusState()));
  assert.match(summary, /Accepted v1/);
  assert.match(summary, /Committed v0/);
  assert.match(summary, /Converged v0/);
});

test("page describes flow rather than an agreement plane", () => {
  assert.match(html, /PROTOCOL TRACE/);
  assert.match(html, /TIME ↓/);
  assert.match(html, /PROPOSE → ACK → COMMIT → APPLY → CONVERGE/);
  assert.match(html, /data-lane="A"/);
  assert.match(html, /data-lane="B"/);
  assert.match(html, /data-lane="C"/);
  assert.match(html, /id="consensus-stream"/);
  assert.doesNotMatch(html, /AGREEMENT PLANE/);
});

test("browser renderer creates protocol event classes", () => {
  for (const token of ["proposal-send", "ack-arrive", "commit", "catchup-send", "partition-drop"]) assert.match(js, new RegExp(token));
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /document\.hidden/);
  assert.doesNotMatch(js, /Math\.random/);
});

test("visual system contains timeline, packets, partition and responsive rules", () => {
  assert.match(css, /consensus-stream/);
  assert.match(css, /consensus-packet/);
  assert.match(css, /consensus-commit-front/);
  assert.match(css, /consensus-partition/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
