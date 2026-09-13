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

const handoffPattern = /<a\b(?=[^>]*data-failure-laboratory-handoff)(?=[^>]*href="\/lab\/failure-laboratory\/"\s*>)[^>]*>[\s\S]*?<\/a>/g;

test("approved participating routes expose one route-only Failure Laboratory handoff", () => {
  for (const [label, relativePath] of participatingRoutes) {
    const html = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const handoffs = html.match(handoffPattern) ?? [];

    assert.equal(handoffs.length, 1, `${label} should expose exactly one handoff`);
    assert.match(handoffs[0], /Failure Laboratory context/i);
    assert.doesNotMatch(handoffs[0], /[?#]/, `${label} handoff must not add scenario state`);
  }
});

test("Failure Laboratory handoffs do not pull Atlas Motion into the phase", () => {
  const motion = readFileSync(new URL("../atlas-motion/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(motion, /failure-laboratory/i);
});
