import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACCEPTED_EVIDENCE_MODES,
  RELATIONSHIP_TYPES,
  SCENARIO_IDS,
  STAGE_IDS,
  loadFailureLaboratoryModel,
  serializeFailureLaboratoryModel,
  validateFailureLaboratoryModel,
} from "../failure-laboratory-model.mjs";

const model = loadFailureLaboratoryModel();
const modelText = readFileSync(new URL("../../data/failure-laboratory-model.json", import.meta.url), "utf8");
const instrumentIds = model.instruments.map((instrument) => instrument.id);
const instrumentMap = new Map(model.instruments.map((instrument) => [instrument.id, instrument]));

function cloneModel() {
  return structuredClone(model);
}

function relationship(scenarioId, instrumentId) {
  return model.scenarios
    .find((scenario) => scenario.id === scenarioId)
    .relationships.find((candidate) => candidate.instrumentId === instrumentId);
}

test("the checked-in model is valid and every stage identifier is unique", () => {
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
  assert.equal(model.authority.futureRoute, "/lab/failure-laboratory/");
  assert.equal(model.authority.futureRouteStatus, "implemented");
  assert.deepEqual(model.journey.sequence, STAGE_IDS);
  assert.deepEqual(model.journey.stages.map((stage) => stage.id), STAGE_IDS);
  assert.equal(new Set(model.journey.stages.map((stage) => stage.id)).size, STAGE_IDS.length);
});

test("the reserved lifecycle marker cannot coexist with an implemented route", () => {
  const invalid = cloneModel();
  invalid.authority.futureRouteStatus = "reserved-not-implemented";
  assert.throws(() => validateFailureLaboratoryModel(invalid), /while reserved/);
});

test("stage ordering and safe next-stage links are deterministic", () => {
  assert.deepEqual(model.journey.stages.map((stage) => stage.order), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    model.journey.stages.map((stage) => stage.nextStageId),
    ["dependencies", "coordination", "impact", "incident-evidence", "recovery", null],
  );
});

test("all seven scenario identifiers exist exactly once and remain stable", () => {
  assert.deepEqual(model.scenarios.map((scenario) => scenario.id), SCENARIO_IDS);
  assert.equal(new Set(model.scenarios.map((scenario) => scenario.id)).size, SCENARIO_IDS.length);
});

test("every referenced instrument resolves to one canonical public identity and route", () => {
  assert.equal(instrumentIds.length, new Set(instrumentIds).size);
  for (const stage of model.journey.stages) {
    for (const association of stage.instrumentAssociations) {
      assert.ok(instrumentMap.has(association.instrumentId));
    }
  }
  for (const scenario of model.scenarios) {
    assert.deepEqual(
      scenario.relationships.map((relationship) => relationship.instrumentId).sort(),
      [...instrumentIds].sort(),
    );
  }
  for (const instrument of model.instruments) {
    assert.equal(instrument.canonical.repository, "AtlasReaper311/atlas-systems");
    assert.match(instrument.canonical.route, /^\/[^?#]+\/$/);
    assert.match(instrument.canonical.sourcePath, /\/index\.html$/);
  }
});

test("every destination is an existing offline local route and no machine path enters the model", () => {
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /(?:file:\/\/|\/Users\/|\/private\/tmp|https?:\/\/[^\"]*github)/i);
  assert.doesNotMatch(serialized, /(?:\.\.\/|\.\.\\)/);
});

test("every scenario/instrument relationship has an explicit support type", () => {
  for (const scenario of model.scenarios) {
    for (const relationship of scenario.relationships) {
      assert.ok(RELATIONSHIP_TYPES.includes(relationship.supportType));
      assert.ok(Array.isArray(relationship.evidenceModes));
    }
  }
});

test("unsupported relationships cannot silently become supported", () => {
  const invalid = cloneModel();
  const target = invalid.scenarios[0].relationships.find((item) => item.supportType === "unsupported");
  target.supportType = "contextual";
  assert.throws(
    () => validateFailureLaboratoryModel(invalid),
    /supported relationships require evidence readings/,
  );
});

test("supported and contextual relationships carry accepted evidence modes and proof boundaries", () => {
  for (const scenario of model.scenarios) {
    for (const relationship of scenario.relationships) {
      assert.ok(relationship.proofBoundary);
      assert.ok(relationship.nonClaims.length > 0);
      for (const mode of relationship.evidenceModes) assert.ok(ACCEPTED_EVIDENCE_MODES.includes(mode));
      if (relationship.supportType !== "unsupported") {
        assert.ok(relationship.readings.length > 0);
        for (const reading of relationship.readings) {
          assert.ok(ACCEPTED_EVIDENCE_MODES.includes(reading.evidenceMode));
          assert.ok(reading.demonstrates);
          assert.ok(reading.doesNotProve.length > 0);
        }
      }
    }
  }
});

test("Twin wording stays could be affected and cannot become observed incident impact", () => {
  const twin = instrumentMap.get("atlas-twin-context");
  assert.equal(twin.claimLanguage, "could be affected");
  assert.match(twin.question, /could be affected/);
  for (const scenario of model.scenarios) {
    assert.equal(relationship(scenario.id, "atlas-twin-context").supportType, "unsupported");
  }

  const invalid = cloneModel();
  invalid.constraints.twinImpactClaim = "was affected";
  assert.throws(() => validateFailureLaboratoryModel(invalid), /accepted Twin wording/);
});

test("normal-operation cannot encode current estate health", () => {
  const normal = model.scenarios.find((scenario) => scenario.id === "normal-operation");
  assert.ok(normal.interpretationBoundary.neverMeans.some((value) => /current Atlas estate is healthy/i.test(value)));

  const invalid = cloneModel();
  const reading = invalid.scenarios[0].relationships[0].readings[0];
  reading.demonstrates = "The current Atlas estate is healthy.";
  assert.throws(() => validateFailureLaboratoryModel(invalid), /current estate health/);
});

test("network-partition cannot encode a real observed Atlas partition", () => {
  const partition = model.scenarios.find((scenario) => scenario.id === "network-partition");
  assert.ok(partition.interpretationBoundary.neverMeans.some((value) => /real network partition/i.test(value)));

  const invalid = cloneModel();
  const reading = invalid.scenarios[4].relationships[2].readings[0];
  reading.demonstrates = "An observed Atlas network partition occurred.";
  assert.throws(() => validateFailureLaboratoryModel(invalid), /real observed Atlas partition/);
});

test("recorded replay cannot be relabelled as current measured state", () => {
  const invalid = cloneModel();
  const reading = invalid.scenarios[5].relationships[5].readings[0];
  const relationshipRecord = invalid.scenarios[5].relationships[5];
  reading.evidenceMode = "measured";
  relationshipRecord.evidenceModes = ["measured"];
  assert.throws(() => validateFailureLaboratoryModel(invalid), /recorded readings must be recorded-replay/);
});

test("Atlas Motion is neither a required journey instrument nor a shared scenario target", () => {
  assert.equal(model.constraints.atlasMotion.participation, "excluded");
  assert.equal(model.constraints.atlasMotion.requiredJourneyInstrument, false);
  assert.equal(model.constraints.atlasMotion.sharedScenarioTarget, false);
  assert.ok(!instrumentIds.some((id) => id.includes("motion")));
  assert.ok(!model.journey.stages.flatMap((stage) => stage.instrumentAssociations).some((item) => item.instrumentId.includes("motion")));
});

test("supported scenario relationships appear on the journey stages they name", () => {
  for (const scenario of model.scenarios) {
    for (const relationship of scenario.relationships) {
      if (relationship.supportType === "unsupported") continue;
      for (const stageId of relationship.stageIds) {
        const stage = model.journey.stages.find((candidate) => candidate.id === stageId);
        assert.ok(
          stage.instrumentAssociations.some((association) => association.instrumentId === relationship.instrumentId),
          `${scenario.id}/${relationship.instrumentId} names ${stageId} without a journey association`,
        );
      }
    }
  }
});

test("recovery can remain unsupported, unknown, and contextual without failing validation", () => {
  const recovery = model.scenarios.find((scenario) => scenario.id === "recovery");
  assert.ok(recovery.relationships.some((item) => item.supportType === "unsupported"));
  assert.ok(recovery.relationships.some((item) => item.supportType === "contextual"));
  assert.ok(recovery.relationships.some((item) => item.evidenceModes.includes("unknown")));
  assert.equal(model.journey.stages.at(-1).evidenceGap.status, "no-single-authority");
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
});

test("cross-cutting instruments never become mandatory linear stages", () => {
  for (const instrument of model.instruments.filter((item) => item.journeyRole === "cross-cutting")) {
    for (const stage of model.journey.stages) {
      for (const association of stage.instrumentAssociations.filter((item) => item.instrumentId === instrument.id)) {
        assert.equal(association.required, false);
        assert.equal(association.relationshipType, "cross-cutting");
      }
    }
  }
  for (const narrative of model.narratives) {
    for (const step of narrative.steps) {
      if (instrumentMap.get(step.instrumentId).journeyRole === "cross-cutting") assert.equal(step.required, false);
    }
  }
});

test("the model serializes deterministically and stays consumable without network access", () => {
  assert.equal(serializeFailureLaboratoryModel(model), modelText);
  assert.doesNotThrow(() => validateFailureLaboratoryModel(JSON.parse(modelText)));
});

test("the first coherent narratives use explicit mappings and keep omitted stages visible", () => {
  const dependencyNarrative = model.narratives.find((narrative) => narrative.id === "dependency-to-recovery");
  assert.deepEqual(
    dependencyNarrative.steps.map((step) => step.scenarioId),
    ["normal-operation", "dependency-failure", "cascading-failure", "cascading-failure", "recovery"],
  );
  assert.deepEqual(dependencyNarrative.omittedStageIds, ["coordination", "impact"]);
  const partitionNarrative = model.narratives.find((narrative) => narrative.id === "partition-to-recovery");
  assert.deepEqual(partitionNarrative.omittedStageIds, ["dependencies", "impact", "incident-evidence"]);
  assert.doesNotThrow(() => validateFailureLaboratoryModel(model));
});
