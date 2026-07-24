import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  applyHealthEvidence,
  healthStatusForNode,
  mapHealthState,
} from "../../static/js/live/system-map-status.js";

const boot = fs.readFileSync(
  new URL("../../static/js/live/lab-system-map-bootstrap.js", import.meta.url),
  "utf8",
);
const layout = fs.readFileSync(
  new URL("../system-map-layout.js", import.meta.url),
  "utf8",
);
const scene = fs.readFileSync(
  new URL("../system-map-scene.js", import.meta.url),
  "utf8",
);

test("uses public topology", () => {
  assert.match(boot, /\/v1\/topology/);
  assert.match(boot, /\/v1\/stats/);
});

test("maps public health evidence onto Workers, sites, and local services", () => {
  const stats = {
    estate: {
      components: {
        specular: false,
        atlas_systems: true,
      },
      component_details: {
        specular: { status: "down" },
        atlas_systems: { status: "healthy" },
      },
    },
  };

  assert.equal(healthStatusForNode("specular-telemetry", stats), "down");
  assert.equal(healthStatusForNode("atlas-systems", stats), "live");
  assert.equal(healthStatusForNode("unknown-node", stats), null);
  assert.equal(mapHealthState("degraded"), "degraded");
  assert.equal(mapHealthState("offline"), "down");
  assert.deepEqual(
    applyHealthEvidence(
      [{ id: "specular-telemetry", status: "static" }],
      stats,
    ),
    [{ id: "specular-telemetry", status: "down" }],
  );
});

test("layout order is deterministic per node", () => {
  assert.match(layout, /String\(a\.id\)\.localeCompare\(String\(b\.id\)\)/);
  assert.match(layout, /members\.sort\(nodeSort\)/);
});

test("3D labels avoid projected collisions", () => {
  assert.match(scene, /function overlaps\(/);
  assert.match(scene, /placed\.some\(\(other\) => overlaps\(box, other\)\)/);
});
