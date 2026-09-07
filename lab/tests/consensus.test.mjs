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

test("quorum convergence remains later than commit", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_CLEAN }));
  state = advanceConsensus(state, 900);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.convergedVersion, 0);
  state = advanceConsensus(state, 700);
  assert.equal(state.convergedVersion, 1);
});

test("slow B allows quorum while B remains stale", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_SLOW_B }));
  state = advanceConsensus(state, 1100);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.nodes.B.version, 0);
  assert.equal(replicaLag(state, "B"), 1);
});

test("isolated C does not block two-of-three quorum", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_ISOLATE_C }));
  state = advanceConsensus(state, 1300);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.nodes.C.version, 0);
  assert.ok(state.events.some((event) => event.type === "partition-drop" && event.node === "C"));
});

test("healing C performs explicit catch-up before convergence", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_QUORUM, network: NETWORK_ISOLATE_C }));
  state = advanceConsensus(state, 1400);
  state = setNetwork(state, NETWORK_CLEAN);
  assert.ok(state.events.some((event) => event.type === "catchup-send"));
  state = advanceConsensus(state, 1600);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.convergedVersion, 1);
});

test("eventual mode separates accepted from converged truth", () => {
  let state = beginWrite(createConsensusState({ mode: MODE_EVENTUAL, network: NETWORK_SLOW_B }));
  assert.equal(state.acceptedVersion, 1);
  assert.equal(state.committedVersion, 1);
  assert.equal(state.convergedVersion, 0);
  state = advanceConsensus(state, 1200);
  assert.equal(state.nodes.C.version, 1);
  assert.equal(state.nodes.B.version, 0);
  assert.equal(state.convergedVersion, 0);
});

test("bounded history retains multiple writes", () => {
  let state = beginWrite(createConsensusState());
  state = advanceConsensus(state, 2400);
  assert.equal(canBeginWrite(state), true);
  state = beginWrite(state);
  state = advanceConsensus(state, 2400);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.transactions[0].version, 2);
});

test("state summary still names accepted committed and converged truth", () => {
  const summary = stateSummary(beginWrite(createConsensusState()));
  assert.match(summary, /Accepted v1/);
  assert.match(summary, /Committed v0/);
  assert.match(summary, /Converged v0/);
});

test("page uses the approved hybrid cluster and protocol rail", () => {
  assert.match(html, /CLUSTER VIEW \/ FIXED LEADER/);
  assert.match(html, /PROPOSE → APPEND → ACK → COMMIT → APPLY → CONVERGE/);
  assert.match(html, /class="consensus-cluster"/);
  assert.match(html, /data-node="A"/);
  assert.match(html, /data-node="B"/);
  assert.match(html, /data-node="C"/);
  assert.match(html, /class="consensus-protocol__rail"/);
  assert.match(html, /id="consensus-history"/);
  assert.doesNotMatch(html, /PROTOCOL TRACE/);
  assert.doesNotMatch(html, /TIME ↓/);
});

test("eventual mode has a separate accepted versus converged core", () => {
  assert.match(html, /LATEST ACCEPTED/);
  assert.match(html, /FULLY CONVERGED/);
  assert.match(html, /consensus-core__eventual-mode/);
  assert.match(js, /MODE_EVENTUAL/);
  assert.match(js, /Leader advances/);
});

test("browser renderer drives packets, node inspection, rail and bounded history", () => {
  assert.match(js, /getPointAtLength/);
  assert.match(js, /proposal-arrive/);
  assert.match(js, /ack-arrive/);
  assert.match(js, /catchup-arrive/);
  assert.match(js, /renderProtocol/);
  assert.match(js, /renderHistory/);
  assert.match(js, /renderInspector/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /document\.hidden/);
  assert.doesNotMatch(js, /Math\.random/);
});

test("visual system is calm by default and stronger only for slow or isolated links", () => {
  assert.match(css, /consensus-node--a/);
  assert.match(css, /consensus-core/);
  assert.match(css, /consensus-protocol__rail/);
  assert.match(css, /consensus-history-card/);
  assert.match(css, /data-network="slow-b"/);
  assert.match(css, /data-network="isolate-c"/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("packet glow stays on the HTML SVG filter instead of a CSS fragment URL", () => {
  assert.match(html, /<filter id="consensus-glow"/);
  assert.match(js, /dot\.setAttribute\("filter", "url\(#consensus-glow\)"\)/);
  assert.doesNotMatch(css, /url\(#/);
});

test("Consensus remains a reviewed non-indexed Lab route", () => {
  const headers = readFileSync(new URL("../../_headers", import.meta.url), "utf8");
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(headers, /\/lab\/consensus\/\*[\s\S]*X-Robots-Tag: noindex, follow/);
  assert.doesNotMatch(html, /property="og:image"/);
  assert.doesNotMatch(html, /name="twitter:image"/);
  assert.match(css, /--c-faint:#888894/);
});
