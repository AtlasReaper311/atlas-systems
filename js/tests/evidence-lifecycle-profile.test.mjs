import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { DELIVERY_STAGES, RESULT, projectChangeChain } from "../../systems/evidence/change-chain.js";
import { SPECIMEN_256_RECORD } from "../../systems/evidence/change-chain-specimen.js";
import {
  ESTATE_PROFILE_LABELS,
  projectEstateView,
} from "../../systems/evidence/estate-profile.js";
import {
  LIFECYCLE_PROFILE_PRESENTATION,
  presentLifecycleProfile,
  projectLifecycleStages,
  projectProfileIdentity,
} from "../../systems/evidence/lifecycle-profile.js";
import {
  observationsFromPublicSources,
  projectServiceView,
} from "../../systems/evidence/service-profile.js";
import { SERVICE_SPECIMEN } from "../../systems/evidence/service-specimen.js";

const NOW = Date.parse("2026-09-12T10:00:00.000Z");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function topology() {
  return {
    schema: "atlas-public-topology/v3",
    generated_at: "2026-09-12T09:00:00Z",
    classification_authority: "AtlasReaper311/atlas-infra",
    components: [
      {
        id: "atlas-systems",
        kind: "site",
        runtime_service: true,
        repo: "https://github.com/AtlasReaper311/atlas-systems",
        repo_name: "atlas-systems",
      },
      {
        id: "atlas-api-public",
        kind: "worker",
        runtime_service: true,
        repo: "https://github.com/AtlasReaper311/atlas-api-public",
        repo_name: "atlas-api-public",
      },
    ],
  };
}

function publicSources() {
  return {
    topology: {
      status: "fulfilled",
      value: {
        generated_at: "2026-09-12T09:00:00Z",
        components: [{ id: "atlas-api-public", kind: "worker", runtime_service: true }],
      },
    },
    registry: { status: "fulfilled", value: { workers: [{ name: "atlas-api-public", version: "1.4.0" }] } },
    meta: {
      status: "fulfilled",
      value: { name: "atlas-api-public", version: "1.4.0", endpoints: [{ method: "GET", path: "/v1" }] },
    },
    live: {
      status: "fulfilled",
      value: { ok: true, service: "atlas-api-public", generated_at: "2026-09-12T09:00:00Z" },
    },
    reliability: { status: "fulfilled", value: { result: { state: "unmeasured", reasons: ["unmeasured"] } } },
  };
}

function stageMap(stages) {
  return Object.fromEntries(stages.map((stage) => [stage.stage, stage]));
}

test("Static / Public Site and Runtime Worker keep ADR-0014 applicability", () => {
  const site = presentLifecycleProfile("static-public-site");
  const worker = presentLifecycleProfile("runtime-worker");
  const kit = presentLifecycleProfile("library-toolkit");
  assert.equal(site.label, "Static / Public Site");
  assert.equal(worker.label, "Runtime Worker");
  assert.equal(kit.label, "Library / Toolkit");
  assert.deepEqual(site.notApplicableStages, ["RUNTIME VERIFIED"]);
  assert.deepEqual(worker.notApplicableStages, []);
  assert.deepEqual(kit.notApplicableStages, ["RUNTIME VERIFIED", "LIVE VERIFIED"]);
  assert.match(site.expectedPath, /LIVE VERIFIED/);
  assert.doesNotMatch(site.expectedPath, /RUNTIME VERIFIED/);
  assert.match(worker.expectedPath, /RUNTIME VERIFIED → LIVE VERIFIED/);
  assert.match(kit.expectedPath, /DEPLOYED/);
  assert.doesNotMatch(kit.expectedPath, /RUNTIME VERIFIED|LIVE VERIFIED/);
  assert.match(kit.expectedSummary, /GitHub Release artifact/);
  assert.equal(ESTATE_PROFILE_LABELS["static-public-site"], "Static / Public Site");
  assert.equal(ESTATE_PROFILE_LABELS["runtime-worker"], "Runtime Worker");
  assert.equal(ESTATE_PROFILE_LABELS["library-toolkit"], "Library / Toolkit");
});

test("Static-site RUNTIME VERIFIED is NOT APPLICABLE and is not treated as missing", () => {
  const chain = projectChangeChain(SPECIMEN_256_RECORD);
  const stages = projectLifecycleStages("static-public-site", Object.fromEntries(
    chain.stages.map((stage) => [stage.stage, stage]),
  ));
  const runtime = stageMap(stages)["RUNTIME VERIFIED"];
  assert.equal(runtime.result, RESULT.NOT_APPLICABLE);
  assert.match(runtime.scope, /not missing evidence/);
  assert.equal(runtime.gap, null);
  assert.equal(stageMap(stages).SOURCE.result, RESULT.OBSERVED);
  assert.equal(stageMap(stages)["LIVE VERIFIED"].result, RESULT.OBSERVED);
});

test("Worker lifecycle stages stay independent of runtime and live observations", () => {
  const projection = projectServiceView(
    observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const stages = stageMap(projection.lifecycleStages);
  assert.deepEqual(projection.lifecycleStages.map((stage) => stage.stage), [...DELIVERY_STAGES]);
  assert.equal(stages.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.CHECKED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.OBSERVED);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.OBSERVED);
  assert.match(stages.SOURCE.gap, /UNKNOWN \/ NOT OBSERVED/);
  assert.notEqual(stages["RUNTIME VERIFIED"].result, stages.DEPLOYED.result);
});

test("Estate selection keeps classification separate from the expected delivery path", () => {
  const projection = projectEstateView(topology(), NOW);
  const site = projection.subjects.find((subject) => subject.id === "atlas-systems");
  const worker = projection.subjects.find((subject) => subject.id === "atlas-api-public");
  assert.equal(site.profile.label, "Static / Public Site");
  assert.equal(worker.profile.label, "Runtime Worker");
  assert.equal(stageMap(site.stages)["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stageMap(site.stages).SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stageMap(worker.stages)["RUNTIME VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(site.classification.result, RESULT.OBSERVED);
  assert.notEqual(site.classification.result, stageMap(site.stages).MERGED.result);
});

test("Profile identity names the subject without inventing a later stage", () => {
  const identity = projectProfileIdentity({
    subject: "AtlasReaper311/atlas-systems#256",
    profileId: "static-public-site",
  });
  assert.equal(identity.profileLabel, "Static / Public Site");
  assert.equal(identity.authority, "ADR-0014");
  assert.match(identity.expectedSummary, /NOT APPLICABLE/);
  assert.doesNotMatch(identity.expectedSummary, /healthy|complete|score/i);
  assert.equal(LIFECYCLE_PROFILE_PRESENTATION["runtime-worker"].label, "Runtime Worker");
});

test("Evidence Console presents 2.3a and 2.3b specimens without a new top-level tab", () => {
  const page = read("systems/evidence/index.html");
  const profile = read("systems/evidence/lifecycle-profile.js");
  const change = read("systems/evidence/change-view.js");
  const service = read("systems/evidence/service-view.js");
  const estate = read("systems/evidence/estate-view.js");
  const detail = read("systems/evidence/evidence-detail.js");
  const library = read("systems/evidence/library-profile.js");

  assert.match(page, /data-evidence-view-tab="change"/);
  assert.match(page, /data-evidence-view-tab="service"/);
  assert.match(page, /data-evidence-view-tab="estate"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="profile"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="library"/);
  assert.match(page, /Static \/ Public Site/);
  assert.match(page, /Runtime Worker/);
  assert.match(page, /Library \/ Toolkit/);
  assert.match(page, /atlas-interface-kit/);
  assert.match(page, /id="change-profile"/);
  assert.match(page, /id="service-expected-path"/);
  assert.match(page, /id="estate-expected-path"/);
  assert.match(page, /id="estate-library-fallback"/);
  assert.match(change, /renderProfileIdentity/);
  assert.match(service, /renderExpectedPath/);
  assert.match(estate, /renderSelectedProfile/);
  assert.match(estate, /renderSpecimenPath/);
  assert.match(detail, /export function renderProfileIdentity/);
  assert.match(detail, /export function renderExpectedPath/);
  assert.match(profile, /not missing evidence/);
  assert.match(library, /RELEASED event/);
  for (const source of [profile, change, service, estate, detail, library]) {
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
});
