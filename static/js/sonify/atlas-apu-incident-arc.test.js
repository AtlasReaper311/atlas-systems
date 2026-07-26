import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAtlasApuScorePlan } from "./atlas-apu-score-plan.js";
import { frameFromBlackBoxCartridge, validateBlackBoxCartridge } from "./atlas-apu-flight-recorder.js";
import {
  ATLAS_APU_INCIDENT_ARC_SCHEMA_VERSION,
  incidentArcSummary,
  materializeIncidentArcArchive,
  replayUrlForIncidentArc,
  validateIncidentArc,
} from "./atlas-apu-incident-arc.js";

function fixtureArchive() {
  return JSON.parse(readFileSync(
    new URL("../../../lab/system-symphony/black-box/incident-arcs.json", import.meta.url),
    "utf8",
  ));
}

test("incident arc archive materializes the Phase 10 boss-track schema", () => {
  const archive = materializeIncidentArcArchive(fixtureArchive(), {
    origin: "https://atlas-systems.uk",
  });
  const [arc] = archive.incidentArcs;

  assert.equal(archive.source, "fixture");
  assert.equal(archive.incidentArcs.length, 1);
  assert.equal(arc.schemaVersion, ATLAS_APU_INCIDENT_ARC_SCHEMA_VERSION);
  assert.equal(arc.incidentId, "INC-APU-20260726-001");
  assert.equal(arc.title, "Public API Interrupt And Recovery");
  assert.equal(arc.routeMode, "REPLAY");
  assert.equal(arc.replaySeed, "B055");
  assert.deepEqual(arc.stateTransitionPath, ["warning", "critical", "warning", "healthy"]);
  assert.equal(arc.frameCount, 4);
  assert.equal(arc.source, "fixture");
  assert.match(arc.replayUrl, /\/lab\/system-symphony\/replay\/\?incident=INC-APU-20260726-001/);
  assert.deepEqual(validateIncidentArc(arc), {
    valid: true,
    missing: [],
    invalidCartridges: [],
  });
});

test("incident arc frames remain deterministic saved cartridges", () => {
  const [arc] = materializeIncidentArcArchive(fixtureArchive(), {
    origin: "https://atlas-systems.uk",
  }).incidentArcs;

  for (const cartridge of arc.frameCartridges) {
    assert.equal(validateBlackBoxCartridge(cartridge).valid, true);
    assert.equal(cartridge.source, "fixture");
    assert.equal(cartridge.sampleFreeGuardStatus, "yes / score-plan");
    assert.deepEqual(
      buildAtlasApuScorePlan(frameFromBlackBoxCartridge(cartridge), {
        sourceMode: cartridge.source,
      }),
      cartridge.scorePlan,
    );
  }
});

test("incident arcs expose affected services and a recovery marker", () => {
  const [arc] = materializeIncidentArcArchive(fixtureArchive(), {
    origin: "https://atlas-systems.uk",
  }).incidentArcs;
  const affectedNames = arc.affectedServices.map((service) => service.name);

  assert.ok(affectedNames.includes("atlas-api-public"));
  assert.ok(affectedNames.includes("specular-sonify"));
  assert.ok(affectedNames.includes("atlas-dep-audit"));
  assert.equal(arc.recoveryMarker.index, 3);
  assert.equal(arc.recoveryMarker.state, "healthy");
  assert.equal(arc.recoveryMarker.label, "Recovered");
  assert.match(incidentArcSummary(arc), /warning -> critical -> warning -> healthy/);
});

test("incident replay URLs are deterministic and fixture-labelled", () => {
  assert.equal(
    replayUrlForIncidentArc({
      origin: "https://atlas-systems.uk",
      incidentId: "INC-APU-20260726-001",
      replaySeed: "b055",
      source: "preview",
    }),
    "https://atlas-systems.uk/lab/system-symphony/replay/?incident=INC-APU-20260726-001&seed=B055&source=fixture",
  );
});
