import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  modeHref,
  roleKeyFromLabel,
} from "../system-symphony/trace-role-bridge.js";

const bridge = readFileSync("lab/system-symphony/trace-role-bridge.js", "utf8");

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

test("System Symphony mode controls expose reliable product links", () => {
  assert.equal(modeHref("play"), "/lab/system-symphony/");
  assert.equal(modeHref("trace"), "/lab/system-symphony/?symphonyMode=trace");
  assert.equal(modeHref("replay"), "/lab/system-symphony/?symphonyMode=replay");
  assert.equal(modeHref("invalid"), "/lab/system-symphony/");
  assert.ok(bridge.includes("upgradeProductModeLinks"));
  assert.ok(bridge.includes("link.dataset.symphonyModeTab = mode.key"));
  assert.ok(bridge.includes("control.removeAttribute(\"data-symphony-mode-tab\")"));
  assert.ok(bridge.includes("control.click()"));
  assert.ok(bridge.includes("window.location.assign(link.href)"));
});
