import assert from "node:assert/strict";
import test from "node:test";

import { roleKeyFromLabel } from "../system-symphony/trace-role-bridge.js";

test("TRACE maps rendered APU labels to stable role keys", () => {
  const cases = new Map([
    ["Pulse clock", "pulse"],
    ["Memory field", "memory"],
    ["Thermal rail", "thermal"],
    ["Signal noise", "signal"],
    ["Contention bus", "contention"],
    ["Recovery bus", "recovery"],
  ]);

  for (const [label, expected] of cases) {
    assert.equal(roleKeyFromLabel(label), expected);
    assert.equal(roleKeyFromLabel(label.toUpperCase()), expected);
  }
});

test("TRACE does not invent a service-owned clock role", () => {
  assert.equal(roleKeyFromLabel("Clock"), "");
  assert.equal(roleKeyFromLabel("Topology only"), "");
  assert.equal(roleKeyFromLabel(null), "");
});
