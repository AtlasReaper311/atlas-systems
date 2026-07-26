import assert from "node:assert/strict";
import test from "node:test";

import {
  ROLE_ORDER,
  ROLE_ZONES,
  nodeRole,
  roleFromText,
  routePath,
  servicePositions,
} from "../system-symphony/pcb-instrument.js";

function fakeNode(name, role = "") {
  return {
    dataset: { node: name, apuRole: role },
    getAttribute(attribute) {
      return attribute === "aria-label" ? `${name}, Healthy, ${role}` : "";
    },
    querySelector(selector) {
      if (selector === "title") return { textContent: `${name}: Healthy / ${role}` };
      return null;
    },
  };
}

test("the Atlas APU exposes seven stable motherboard buses", () => {
  assert.deepEqual(ROLE_ORDER, [
    "clock",
    "pulse",
    "signal",
    "recovery",
    "thermal",
    "contention",
    "memory",
  ]);
  for (const role of ROLE_ORDER) {
    assert.equal(typeof ROLE_ZONES[role].x, "number");
    assert.equal(typeof ROLE_ZONES[role].y, "number");
  }
});

test("service voices resolve to deterministic APU role zones", () => {
  assert.equal(roleFromText("Pulse clock lead"), "pulse");
  assert.equal(roleFromText("Memory wavetable carrier"), "memory");
  assert.equal(roleFromText("Thermal triangle bass"), "thermal");
  assert.equal(roleFromText("Signal noise drums"), "signal");
  assert.equal(roleFromText("Contention diagnostic FM"), "contention");
  assert.equal(roleFromText("Recovery deployment accent"), "recovery");
  assert.equal(roleFromText("unclassified service"), "signal");
  assert.equal(nodeRole(fakeNode("atlas-api", "memory")), "memory");
});

test("chip placement is deterministic and centred on each role socket", () => {
  const nodes = [
    fakeNode("alpha"),
    fakeNode("beta"),
    fakeNode("gamma"),
    fakeNode("delta"),
  ];
  const zone = { x: 500, y: 250 };
  const first = servicePositions(nodes, zone);
  const second = servicePositions(nodes, zone);
  assert.deepEqual([...first], [...second]);
  assert.equal(first.size, nodes.length);
  for (const position of first.values()) {
    assert.ok(Math.abs(position.x - zone.x) <= 100);
    assert.ok(Math.abs(position.y - zone.y) <= 100);
  }
});

test("dependency copper uses orthogonal and bevelled PCB routing", () => {
  const path = routePath({ x: 100, y: 200 }, { x: 420, y: 380 });
  assert.match(path, /^M 100 200 H /);
  assert.match(path, / L /);
  assert.match(path, / H 420$/);
});
