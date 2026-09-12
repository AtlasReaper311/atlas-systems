import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { DELIVERY_STAGES, RESULT } from "../../systems/evidence/change-chain.js";
import { projectEstateSubject, projectEstateView } from "../../systems/evidence/estate-profile.js";
import { detailForEstateSubject } from "../../systems/evidence/estate-view.js";
import {
  LIBRARY_RELEASE_DOMAIN_LABELS,
  LIBRARY_SPECIMEN_SUBJECT_ID,
  attachLibrarySpecimen,
  isLibrarySpecimenSubject,
  libraryStageLabel,
  libraryToolkitProjectionProfile,
  projectLibrarySpecimen,
} from "../../systems/evidence/library-profile.js";
import { LIBRARY_SPECIMEN_RECORD } from "../../systems/evidence/library-specimen.js";
import { projectLifecycleStages } from "../../systems/evidence/lifecycle-profile.js";

const NOW = Date.parse("2026-09-12T11:50:00.000Z");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function stageMap(stages) {
  return Object.fromEntries(stages.map((stage) => [stage.stage, stage]));
}

test("Library specimen keeps ADR-0013 order and maps RELEASED onto later stages", () => {
  const chain = projectLibrarySpecimen();
  const stages = stageMap(chain.stages);
  assert.deepEqual(chain.stages.map((stage) => stage.stage), [...DELIVERY_STAGES]);
  assert.equal(chain.liveFeed, false);
  assert.equal(chain.profile.id, "library-toolkit");
  assert.equal(stages.SOURCE.result, RESULT.OBSERVED);
  assert.equal(stages.CHECKED.result, RESULT.OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.OBSERVED);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.OBSERVED);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.match(stages["DEPLOYMENT OBSERVED"].scope, /RELEASED event/);
  assert.match(stages.DEPLOYED.scope, /RELEASED identity/);
  assert.equal(LIBRARY_RELEASE_DOMAIN_LABELS["DEPLOYMENT OBSERVED"], "RELEASED event");
  assert.equal(libraryStageLabel("DEPLOYED"), "DEPLOYED · RELEASED identity");
  assert.equal(chain.nextGap.label, "Later default-branch identity");
  assert.equal(chain.nextGap.result, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("Library runtime and live stay NOT APPLICABLE and are not missing evidence", () => {
  const stages = stageMap(projectLifecycleStages(
    "library-toolkit",
    LIBRARY_SPECIMEN_RECORD.observations,
    { releaseContract: true },
  ));
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["RUNTIME VERIFIED"].gap, null);
  assert.match(stages["RUNTIME VERIFIED"].scope, /NOT APPLICABLE/);
  assert.doesNotMatch(stages["RUNTIME VERIFIED"].scope ?? "", /missing evidence$/);
});

test("Release workflow event does not become released identity or a running service", () => {
  const eventOnly = projectLibrarySpecimen({
    ...LIBRARY_SPECIMEN_RECORD,
    observations: {
      ...LIBRARY_SPECIMEN_RECORD.observations,
      DEPLOYED: undefined,
    },
    extraGaps: [],
  });
  const stages = stageMap(eventOnly.stages);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(stages.DEPLOYED.gap, /UNKNOWN \/ NOT OBSERVED/);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(eventOnly.nextGap.label, "DEPLOYED");
});

test("Estate selection of atlas-interface-kit binds the recorded specimen", () => {
  const subject = projectEstateSubject({
    id: "atlas-interface-kit",
    kind: "repository",
    runtime_service: false,
    source_only: true,
    repo: "https://github.com/AtlasReaper311/atlas-interface-kit",
    repo_name: "atlas-interface-kit",
    lifecycle: "active",
    scope: "public",
    provenance: "original",
  }, { generatedAt: "2026-09-12T09:00:00Z" }, NOW);
  assert.equal(isLibrarySpecimenSubject(subject), true);
  assert.equal(subject.profile.id, "library-toolkit");
  assert.equal(subject.profile.label, "Library / Toolkit");
  assert.equal(subject.releaseContract, true);
  assert.equal(subject.classification.result, RESULT.OBSERVED);
  assert.match(subject.classification.gap, /not DEPLOYMENT OBSERVED, DEPLOYED/);
  assert.equal(subject.latestProvenStage, "DEPLOYED");
  assert.equal(subject.latestProvenResult, RESULT.OBSERVED);
  assert.equal(subject.evidenceKind, "recorded-public-projection");
  assert.equal(subject.specimen.subject.releaseTag, "v0.5.0");
  assert.deepEqual(subject.notApplicableStages, ["RUNTIME VERIFIED", "LIVE VERIFIED"]);
  assert.ok(!subject.notApplicableStages.includes("DEPLOYMENT OBSERVED"));
  assert.ok(!subject.notApplicableStages.includes("DEPLOYED"));
  assert.equal(attachLibrarySpecimen({ id: "worker-meta-kit" }).specimen, undefined);
});

test("Attached kit specimen applicability matches its proven release contract", () => {
  const staleTopology = {
    id: "atlas-interface-kit",
    repository: "AtlasReaper311/atlas-interface-kit",
    profile: { id: "library-toolkit" },
    releaseContract: false,
    notApplicableStages: [
      "DEPLOYMENT OBSERVED",
      "DEPLOYED",
      "RUNTIME VERIFIED",
      "LIVE VERIFIED",
    ],
    stages: [],
  };
  const attached = attachLibrarySpecimen(staleTopology);
  const stages = stageMap(attached.stages);
  assert.equal(attached.releaseContract, true);
  assert.deepEqual(attached.notApplicableStages, ["RUNTIME VERIFIED", "LIVE VERIFIED"]);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.OBSERVED);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.ok(!attached.notApplicableStages.includes("DEPLOYMENT OBSERVED"));
  assert.ok(!attached.notApplicableStages.includes("DEPLOYED"));
});

test("Evidence Detail for the kit specimen preserves exact release provenance", () => {
  const projection = projectEstateView({
    schema: "atlas-public-topology/v3",
    generated_at: "2026-09-12T09:00:00Z",
    classification_authority: "AtlasReaper311/atlas-infra",
    components: [{
      id: LIBRARY_SPECIMEN_SUBJECT_ID,
      kind: "repository",
      runtime_service: false,
      repo: "https://github.com/AtlasReaper311/atlas-interface-kit",
      repo_name: "atlas-interface-kit",
    }],
  }, NOW);
  const deployed = detailForEstateSubject(projection, "atlas-interface-kit", "DEPLOYED");
  assert.equal(deployed.observationResult, RESULT.OBSERVED);
  assert.equal(deployed.lifecycleStage, "DEPLOYED");
  assert.match(deployed.identifier, /v0\.5\.0/);
  assert.match(deployed.identifier, /00171c91963094fb028a124636db355ab0deb844f661e60590e89672e2379a94/);
  assert.equal(deployed.sourceUrl, "https://github.com/AtlasReaper311/atlas-interface-kit/releases/tag/v0.5.0");
  assert.match(deployed.proves, /RELEASED identity/);
  assert.match(deployed.doesNotProve, /runtime or live/);
  assert.equal(deployed.nextGap.label, "Later default-branch identity");
  const runtime = detailForEstateSubject(projection, "atlas-interface-kit", "RUNTIME VERIFIED");
  assert.equal(runtime.observationResult, RESULT.NOT_APPLICABLE);
  assert.match(runtime.proves, /cannot apply/);
});

test("Generic Library / Toolkit subjects without a release contract mark release stages not applicable", () => {
  const subject = projectEstateSubject({
    id: "ollama-rag-kit",
    kind: "repository",
    runtime_service: false,
    source_only: true,
    repo: "https://github.com/AtlasReaper311/ollama-rag-kit",
    repo_name: "ollama-rag-kit",
  }, { generatedAt: "2026-09-12T09:00:00Z" }, NOW);
  const stages = stageMap(subject.stages);
  assert.equal(subject.profile.id, "library-toolkit");
  assert.equal(subject.releaseContract, false);
  assert.deepEqual(libraryToolkitProjectionProfile().notApplicableStages, [
    "DEPLOYMENT OBSERVED",
    "DEPLOYED",
    "RUNTIME VERIFIED",
    "LIVE VERIFIED",
  ]);
  assert.equal(stages.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.CHECKED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages.DEPLOYED.result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["DEPLOYMENT OBSERVED"].gap, null);
  assert.match(stages["DEPLOYMENT OBSERVED"].scope, /NOT APPLICABLE/);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.deepEqual(subject.notApplicableStages, [
    "DEPLOYMENT OBSERVED",
    "DEPLOYED",
    "RUNTIME VERIFIED",
    "LIVE VERIFIED",
  ]);
  assert.equal(subject.specimen, undefined);
  assert.equal(subject.nextApplicableMissing, "SOURCE");
});

test("Library release contract with missing event or identity stays UNKNOWN / NOT OBSERVED", () => {
  const unobserved = projectLibrarySpecimen({
    ...LIBRARY_SPECIMEN_RECORD,
    observations: {
      SOURCE: LIBRARY_SPECIMEN_RECORD.observations.SOURCE,
      CHECKED: LIBRARY_SPECIMEN_RECORD.observations.CHECKED,
      MERGED: LIBRARY_SPECIMEN_RECORD.observations.MERGED,
    },
    extraGaps: [],
  });
  const unobservedStages = stageMap(unobserved.stages);
  assert.equal(libraryToolkitProjectionProfile({ releaseContract: true }).releaseContract, true);
  assert.equal(unobservedStages["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(unobservedStages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(unobservedStages["DEPLOYMENT OBSERVED"].gap, /UNKNOWN \/ NOT OBSERVED/);
  assert.match(unobservedStages.DEPLOYED.gap, /UNKNOWN \/ NOT OBSERVED/);
  assert.equal(unobservedStages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(unobservedStages["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(unobserved.nextGap.label, "DEPLOYMENT OBSERVED");

  const estateContract = projectEstateSubject({
    id: "worker-meta-kit",
    kind: "repository",
    runtime_service: false,
    source_only: true,
    releaseContract: true,
    repo: "https://github.com/AtlasReaper311/worker-meta-kit",
    repo_name: "worker-meta-kit",
  }, { generatedAt: "2026-09-12T09:00:00Z" }, NOW);
  const estateStages = stageMap(estateContract.stages);
  assert.equal(estateContract.releaseContract, true);
  assert.deepEqual(estateContract.notApplicableStages, ["RUNTIME VERIFIED", "LIVE VERIFIED"]);
  assert.equal(estateStages["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(estateStages["DEPLOYMENT OBSERVED"].gap, /release-event/);
  assert.equal(estateStages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(estateStages.DEPLOYED.gap, /released-identity/);
  assert.equal(estateStages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(estateContract.specimen, undefined);
});

test("Recorded library specimen stays public-safe and secret-free", () => {
  const page = read("systems/evidence/index.html");
  const specimen = read("systems/evidence/library-specimen.js");
  const profile = read("systems/evidence/library-profile.js");
  assert.match(page, /Inspect atlas-interface-kit DEPLOYED without JavaScript/);
  assert.match(page, /00171c91963094fb028a124636db355ab0deb844f661e60590e89672e2379a94/);
  assert.match(specimen, /21a1a168e3b25e916555ce4edd4229bd7c061ecb/);
  assert.doesNotMatch(page, /data-evidence-view-tab="library"/);
  assert.match(specimen, /recorded-public-projection/);
  assert.match(specimen, /not a live feed/);
  assert.match(specimen, /cd3f7223960a75e9344116e3960e613cdf267d90/);
  for (const source of [specimen, profile]) {
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
});
