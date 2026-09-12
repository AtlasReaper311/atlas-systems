import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  RESULT,
  nextApplicableGap,
  projectChangeChain,
} from "../../systems/evidence/change-chain.js";
import { SPECIMEN_256_RECORD } from "../../systems/evidence/change-chain-specimen.js";
import {
  DEFAULT_CHANGE_CLAIM,
  RESULT_ASSISTANCE,
  claimElementId,
  evidenceClaimHref,
  evidenceDetailRows,
  focusClaimControl,
  formatFriendlyUtc,
  parseEvidenceClaim,
  projectEvidenceDetail,
  renderAnswerFirst,
  renderEvidenceDetail,
  resultMark,
  shortenIdentifier,
  syncEvidenceClaimUrl,
} from "../../systems/evidence/evidence-detail.js";
import { estateProfileGroups } from "../../systems/evidence/estate-profile.js";
import { observationsFromPublicSources, projectServiceView } from "../../systems/evidence/service-profile.js";
import { SERVICE_SPECIMEN } from "../../systems/evidence/service-specimen.js";
import { projectEstateView } from "../../systems/evidence/estate-profile.js";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function changeDetail(chain, stageName) {
  const stage = chain.stages.find((item) => item.stage === stageName) ?? chain.stages[0];
  return projectEvidenceDetail({
    view: "change",
    subject: {
      repository: chain.subject.repository,
      pullRequest: chain.subject.pullRequest,
      label: chain.subject.pullRequest
        ? `${chain.subject.repository}#${chain.subject.pullRequest}`
        : chain.subject.repository,
    },
    stage: stage.stage,
    result: stage.result,
    evidenceType: "recorded-public-projection",
    classification: chain.classification,
    identifier: stage.identifier,
    observedAt: stage.observedAt,
    recordedAt: chain.recordedAt,
    provenance: stage.provenance,
    scope: stage.scope ?? stage.gap,
    evidenceMode: stage.evidenceMode,
    sourceUrl: stage.sourceUrl,
    nextGap: chain.nextGap,
  });
}

test("MERGED is the first Evidence Detail specimen and keeps a public-safe exact identity", () => {
  assert.equal(DEFAULT_CHANGE_CLAIM, "MERGED");
  const chain = projectChangeChain(SPECIMEN_256_RECORD);
  const merged = chain.stages.find((stage) => stage.stage === "MERGED");
  const detail = changeDetail(chain, "MERGED");
  assert.equal(merged.result, RESULT.OBSERVED);
  assert.equal(detail.observationResult, RESULT.OBSERVED);
  assert.equal(detail.lifecycleStage, "MERGED");
  assert.equal(detail.identifier, "db82da52f13a441a5f88344be6211be71ea2d92e");
  assert.equal(detail.evidenceType, "recorded-public-projection");
  assert.match(detail.proves, /source integration only/);
  assert.match(detail.doesNotProve, /does not prove deployment, runtime, or live verification/);
  assert.equal(detail.nextGap.label, "Current production identity");
  assert.equal(detail.nextGap.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(detail.sourceUrl, "https://github.com/AtlasReaper311/atlas-systems/commit/db82da52f13a441a5f88344be6211be71ea2d92e");
  assert.equal(claimElementId("MERGED", "change"), "claim-merged");
  assert.equal(claimElementId("DEPLOYED", "change"), "claim-change-deployed");
  assert.equal(claimElementId("OWNERSHIP", "service"), "claim-service-ownership");
  assert.equal(
    evidenceClaimHref("change", "DEPLOYED"),
    "/systems/evidence/?view=change&claim=DEPLOYED#claim-change-deployed",
  );
  assert.equal(
    evidenceClaimHref("change", "MERGED"),
    "/systems/evidence/?view=change&claim=MERGED#claim-merged",
  );
  assert.equal(
    syncEvidenceClaimUrl("service", "OWNERSHIP", { pushState() {} }, {
      href: "https://atlas-systems.uk/systems/evidence/?view=service",
      pathname: "/systems/evidence/",
      search: "?view=service",
      hash: "",
    }),
    "/systems/evidence/?view=service&claim=OWNERSHIP#claim-service-ownership",
  );
});

test("focusClaimControl prefers the inner ladder button over the wrapper", () => {
  const focused = [];
  const button = {
    tagName: "BUTTON",
    dataset: { claim: "MERGED" },
    matches: (selector) => selector.includes("button"),
    focus() { focused.push("button"); },
  };
  const row = {
    tagName: "LI",
    dataset: { claim: "MERGED" },
    matches: () => false,
    querySelector: () => button,
  };
  focusClaimControl({ querySelectorAll: () => [row, button] }, "MERGED");
  assert.deepEqual(focused, ["button"]);
});

test("Evidence Detail cannot promote a claim beyond the underlying record", () => {
  const chain = projectChangeChain({
    classification: "recorded-public-projection",
    subject: { repository: "AtlasReaper311/atlas-systems", pullRequest: 1 },
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "pr-1", scope: "source exists" },
      MERGED: { result: RESULT.OBSERVED, identifier: "merge-1", scope: "The exact head is on main." },
    },
  });
  const merged = changeDetail(chain, "MERGED");
  const deployed = changeDetail(chain, "DEPLOYED");
  assert.equal(merged.observationResult, RESULT.OBSERVED);
  assert.doesNotMatch(merged.proves, /DEPLOYED|RUNTIME VERIFIED|LIVE VERIFIED/);
  assert.match(merged.doesNotProve, /does not prove deployment, runtime, or live verification/);
  assert.equal(deployed.observationResult, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(deployed.proves, /UNKNOWN \/ NOT OBSERVED/);
  assert.match(deployed.doesNotProve, /does not create evidence/);
  assert.equal(deployed.identifier, null);
});

test("DEPLOYMENT OBSERVED detail cannot become expected-identity DEPLOYED", () => {
  const chain = projectChangeChain({
    observations: {
      MERGED: { result: RESULT.OBSERVED, identifier: "merge-1", scope: "merged" },
      "DEPLOYMENT OBSERVED": {
        result: RESULT.OBSERVED,
        identifier: "run-1",
        scope: "A named deploy event was seen.",
      },
    },
  });
  const detail = changeDetail(chain, "DEPLOYMENT OBSERVED");
  assert.equal(detail.observationResult, RESULT.OBSERVED);
  assert.match(detail.doesNotProve, /expected identity was the deployed identity/);
  assert.equal(changeDetail(chain, "DEPLOYED").observationResult, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("FAILED and NOT APPLICABLE remain themselves when opened", () => {
  const chain = projectChangeChain({
    observations: {
      CHECKED: {
        result: RESULT.FAILED,
        identifier: "head-1",
        scope: "Required checks ran and did not hold.",
      },
    },
  });
  const failed = changeDetail(chain, "CHECKED");
  const na = changeDetail(chain, "RUNTIME VERIFIED");
  assert.equal(failed.observationResult, RESULT.FAILED);
  assert.match(failed.doesNotProve, /does not change FAILED/);
  assert.equal(na.observationResult, RESULT.NOT_APPLICABLE);
  assert.match(na.doesNotProve, /does not make the stage apply/);
  assert.equal(na.identifier, null);
});

test("Stale classification remains stale in Evidence Detail", () => {
  const detail = projectEvidenceDetail({
    stage: "OWNERSHIP",
    result: RESULT.OBSERVED,
    evidenceMode: "stale-measured",
    observedAt: "2026-09-10T00:00:00Z",
    scope: "Owner observed. Classification is not delivery.",
  });
  assert.equal(detail.stale, true);
  assert.match(detail.freshness, /Stale evidence remains stale/);
});

test("Detail rows omit unsupported fields and do not invent source links", () => {
  const detail = projectEvidenceDetail({
    stage: "DEPLOYED",
    result: RESULT.UNKNOWN_NOT_OBSERVED,
    subject: { repository: "AtlasReaper311/atlas-systems" },
  });
  const labels = evidenceDetailRows(detail).map(([label]) => label);
  assert.ok(labels.includes("Lifecycle stage"));
  assert.ok(labels.includes("Observation result"));
  assert.equal(labels.includes("Exact identifier"), false);
  assert.equal(labels.includes("Source time"), false);
  assert.equal(detail.sourceUrl, null);
});

test("nextApplicableGap prefers the first unknown stage then extra gaps", () => {
  const chain = projectChangeChain(SPECIMEN_256_RECORD);
  assert.equal(chain.nextGap.label, "Current production identity");
  assert.equal(nextApplicableGap(chain.stages, []), null);
  const mergedOnly = projectChangeChain({
    observations: {
      MERGED: { result: RESULT.OBSERVED, identifier: "merge-1" },
    },
  });
  assert.equal(mergedOnly.nextGap.label, "SOURCE");
});

test("Result assistance does not rename canonical states", () => {
  assert.match(RESULT_ASSISTANCE[RESULT.OBSERVED], /observed/);
  assert.match(RESULT_ASSISTANCE[RESULT.UNKNOWN_NOT_OBSERVED], /No approved evidence/);
  assert.equal(parseEvidenceClaim({ search: "?view=change&claim=MERGED", hash: "#view-change" }, ["MERGED", "SOURCE"], "SOURCE"), "MERGED");
  assert.equal(parseEvidenceClaim({ search: "", hash: "#claim-merged" }, ["MERGED", "SOURCE"], "SOURCE"), "MERGED");
});

test("Service facts stay reusable through the same detail projector", () => {
  const record = observationsFromPublicSources({
    topology: { status: "fulfilled", value: { components: [{ id: "atlas-api-public", runtime_service: true, kind: "worker" }], generated_at: "2026-09-11T16:00:00Z" } },
    registry: { status: "fulfilled", value: { workers: [{ name: "atlas-api-public", version: "1" }] } },
    meta: { status: "fulfilled", value: { name: "atlas-api-public", version: "1", endpoints: ["/v1"] } },
    live: { status: "fulfilled", value: { ok: true, service: "atlas-api-public" } },
    reliability: { status: "fulfilled", value: { result: { state: "unmeasured", reasons: ["unmeasured"] } } },
  }, SERVICE_SPECIMEN, Date.parse("2026-09-11T17:00:00.000Z"));
  const projection = projectServiceView(record);
  const ownership = projection.facts.find((fact) => fact.fact === "OWNERSHIP");
  const deployed = projection.facts.find((fact) => fact.fact === "DEPLOYED");
  const ownershipDetail = projectEvidenceDetail({
    view: "service",
    stage: ownership.fact,
    result: ownership.result,
    scope: ownership.scope,
  });
  const deployedDetail = projectEvidenceDetail({
    view: "service",
    stage: deployed.fact,
    result: deployed.result,
    scope: deployed.gap,
  });
  assert.equal(ownershipDetail.observationResult, RESULT.OBSERVED);
  assert.match(ownershipDetail.doesNotProve, /not a deployment event/);
  assert.equal(deployedDetail.observationResult, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(deployedDetail.proves, /not DEPLOYED identity/);
  assert.match(deployedDetail.doesNotProve, /does not create evidence/);
});

test("Estate Detail cannot turn classification into a proven delivery stage", () => {
  const projection = projectEstateView({
    schema: "atlas-public-topology/v3",
    generated_at: "2026-09-11T16:00:00Z",
    classification_authority: "AtlasReaper311/atlas-infra",
    components: [{
      id: "atlas-systems",
      kind: "site",
      layer: "surface",
      lifecycle: "production",
      scope: "public",
      provenance: "original",
      runtime_service: true,
      repo: "https://github.com/AtlasReaper311/atlas-systems",
      repo_name: "atlas-systems",
    }],
  }, Date.parse("2026-09-11T17:00:00.000Z"));
  const subject = projection.subjects[0];
  const detail = projectEvidenceDetail({
    view: "estate",
    subject: { id: subject.id, repository: subject.repository, label: subject.id },
    stage: subject.latestProvenStage ?? "No proven ADR-0013 stage",
    result: subject.latestProvenResult,
    scope: subject.classification.gap,
    nextGap: {
      label: subject.nextApplicableMissing,
      result: RESULT.UNKNOWN_NOT_OBSERVED,
    },
  });
  assert.equal(detail.observationResult, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(detail.proves, /not DEPLOYMENT OBSERVED|UNKNOWN \/ NOT OBSERVED/);
  assert.equal(detail.nextGap.label, "SOURCE");
  assert.equal(detail.nextGap.result, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("Identifier shortening is presentation-only and avoids collisions", () => {
  const full = "db82da52f13a441a5f88344be6211be71ea2d92e";
  assert.equal(shortenIdentifier(full), "db82da52…a2d92e");
  assert.equal(shortenIdentifier("short-id"), "short-id");
  const twin = "db82da52aaaaaaaaaaaaaaaaaaaaea2d92e";
  assert.notEqual(shortenIdentifier(full, [twin]), shortenIdentifier(twin, [full]));
  assert.equal(formatFriendlyUtc("2026-09-11T08:32:02Z"), "11 Sep 2026 · 08:32 UTC");
  assert.equal(resultMark(RESULT.OBSERVED), "●");
  assert.equal(resultMark(RESULT.FAILED), "×");
  assert.equal(resultMark(RESULT.NOT_APPLICABLE), "/");
  assert.equal(resultMark(RESULT.UNKNOWN_NOT_OBSERVED), "?");
});

test("Receipt rendering keeps the same values and moves machine fields behind disclosure", () => {
  const chain = projectChangeChain(SPECIMEN_256_RECORD);
  const detail = changeDetail(chain, "MERGED");
  const children = [];
  const createElement = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      className: "",
      id: "",
      href: "",
      target: "",
      rel: "",
      title: "",
      dateTime: "",
      hidden: false,
      type: "",
      textContent: "",
      dataset: {},
      childNodes: [],
      classList: { add() {} },
      setAttribute() {},
      addEventListener() {},
      appendChild(child) {
        this.childNodes.push(child);
        return child;
      },
      append(...nodes) {
        this.childNodes.push(...nodes);
      },
    };
    children.push(node);
    return node;
  };
  const target = createElement("section");
  target.replaceChildren = function replaceChildren() {
    this.childNodes.length = 0;
  };
  renderEvidenceDetail(target, detail, { createElement, titleId: "change-detail-title" });
  const text = JSON.stringify(target);
  assert.match(text, /Claim \/ result/);
  assert.match(text, /What this proves/);
  assert.match(text, /What this does not prove/);
  assert.match(text, /Technical provenance/);
  assert.match(text, /db82da52…a2d92e/);
  assert.match(text, /db82da52f13a441a5f88344be6211be71ea2d92e/);
  assert.match(text, /11 Sep 2026 · 08:32 UTC/);
  assert.match(text, /2026-09-11T08:32:02Z/);
  assert.equal(detail.identifier, "db82da52f13a441a5f88344be6211be71ea2d92e");
  assert.equal(detail.observationResult, RESULT.OBSERVED);
  const summary = createElement("div");
  summary.replaceChildren = function replaceChildren() {
    this.childNodes.length = 0;
  };
  renderAnswerFirst(summary, {
    proven: "LIVE VERIFIED",
    provenResult: RESULT.OBSERVED,
    nextGap: "Current production identity — UNKNOWN / NOT OBSERVED",
    nextGapResult: RESULT.UNKNOWN_NOT_OBSERVED,
    evidence: "Recorded public projection",
  }, createElement);
  assert.match(JSON.stringify(summary), /focus-metric/);
  assert.match(JSON.stringify(summary), /LIVE VERIFIED/);
});

test("Estate profile groups are counted from the current projection", () => {
  const projection = projectEstateView({
    schema: "atlas-public-topology/v3",
    generated_at: "2026-09-11T16:00:00Z",
    classification_authority: "AtlasReaper311/atlas-infra",
    components: [
      { id: "atlas-systems", kind: "site", runtime_service: true, repo_name: "atlas-systems" },
      { id: "atlas-api-public", kind: "worker", runtime_service: true, repo_name: "atlas-api-public" },
      { id: "atlas-interface-kit", kind: "repository", runtime_service: false, repo_name: "atlas-interface-kit" },
    ],
  }, Date.parse("2026-09-11T17:00:00.000Z"));
  const groups = estateProfileGroups(projection.subjects);
  assert.deepEqual(groups.map((group) => group.id).sort(), ["library-toolkit", "runtime-worker", "static-public-site"]);
  assert.equal(groups.find((group) => group.id === "runtime-worker").count, 1);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), projection.subjects.length);
});

test("Evidence Console registers the reusable detail surface without secrets", () => {
  const page = read("systems/evidence/index.html");
  const detail = read("systems/evidence/evidence-detail.js");
  const changeView = read("systems/evidence/change-view.js");
  const css = read("static/css/systems-evidence-detail.css");
  for (const id of [
    "change-summary", "change-detail", "change-detail-fallback", "claim-merged",
    "service-summary", "service-detail", "service-map", "service-boundaries",
    "change-profile", "service-profile", "service-expected-path",
    "estate-summary", "estate-detail", "estate-secondary", "estate-profiles",
    "estate-subject-profile", "estate-expected-path", "estate-library-fallback",
    "how-to-read-evidence",
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /How to read this evidence/);
  assert.match(page, /Inspect MERGED without JavaScript/);
  assert.match(page, /Technical provenance/);
  assert.match(page, /db82da52f13a441a5f88344be6211be71ea2d92e/);
  assert.match(page, /systems-evidence-detail\.css\?v=20260912-profile/);
  assert.match(page, /Latest proven/);
  assert.match(page, /colspan="5"/);
  assert.match(changeView, /detailForChangeStage/);
  assert.match(detail, /claimElementId\(claim, view\)/);
  assert.match(detail, /export function focusClaimControl/);
  assert.match(changeView, /focusClaimControl\(list, next\)/);
  assert.match(changeView, /parseEvidenceView\(window\.location\) !== "change"/);
  assert.match(read("systems/evidence/service-view.js"), /parseEvidenceView\(window\.location\) !== "service"/);
  assert.match(read("systems/evidence/estate-view.js"), /parseEvidenceView\(window\.location\) !== "estate"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /position: sticky/);
  assert.match(css, /scroll-padding-top/);
  assert.match(css, /systems-evidence-proof-pair/);
  assert.match(css, /systems-evidence-chain-mark/);
  assert.match(css, /\.systems-evidence-proof p \{[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.systems-evidence-receipt-assertion \{[\s\S]*overflow-wrap: anywhere/);
  assert.doesNotMatch(detail, /innerHTML\s*=/);
  assert.doesNotMatch(detail, /Authorization|Bearer|secret|token/i);
});
