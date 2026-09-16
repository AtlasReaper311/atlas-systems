import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const participatingRoutes = [
  ["Request X-Ray", "../xray/index.html"],
  ["CASCADE", "../cascade/index.html"],
  ["Consensus", "../consensus/index.html"],
  ["Neon Relay", "../neon-relay/index.html"],
  ["Blackbox", "../blackbox/index.html"],
  ["Spectral Forge", "../spectral-forge/index.html"],
  ["System SYMPHONY", "../system-symphony/index.html"],
  ["Evidence Console", "../../systems/evidence/index.html"],
];

const legacyHandoffPattern = /<a\b(?=[^>]*data-failure-laboratory-handoff)(?=[^>]*href="\/lab\/failure-laboratory\/"\s*>)[^>]*>[\s\S]*?<\/a>/g;
const convergence = readFileSync(new URL("../../static/js/surface-convergence.js", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../../_redirects", import.meta.url), "utf8");

test("approved participating routes retain one migration-safe Failure Trace handoff", () => {
  for (const [label, relativePath] of participatingRoutes) {
    const html = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const handoffs = html.match(legacyHandoffPattern) ?? [];
    assert.equal(handoffs.length, 1, `${label} should expose exactly one compatibility handoff`);
    assert.match(handoffs[0], /Failure Laboratory context/i);
    assert.doesNotMatch(handoffs[0], /[?#]/, `${label} handoff must not add scenario state`);
  }

  assert.match(convergence, /const FAILURE_TRACE_ROUTE = "\/lab\/failure-trace\/"/);
  assert.match(convergence, /const LEGACY_FAILURE_TRACE_ROUTE = "\/lab\/failure-laboratory\/"/);
  assert.match(convergence, /function normalizeFailureTraceHandoffs\(documentNode\)/);
  assert.match(convergence, /link\.setAttribute\("href", FAILURE_TRACE_ROUTE\)/);
  assert.match(convergence, /replaceAll\("Failure Laboratory", "Failure Trace"\)/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\s+\/lab\/failure-trace\/\s+301/);
});

test("no-JS compatibility handoffs terminate at the permanent canonical redirect", () => {
  assert.match(redirects, /\/lab\/failure-laboratory\s+\/lab\/failure-trace\/\s+301/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\s+\/lab\/failure-trace\/\s+301/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\*\s+\/lab\/failure-trace\/:splat\s+301/);
});

test("Failure Trace handoffs do not pull Atlas Motion into the journey", () => {
  const motion = readFileSync(new URL("../atlas-motion/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(motion, /failure-laboratory/i);
  assert.doesNotMatch(motion, /failure-trace/i);
});
