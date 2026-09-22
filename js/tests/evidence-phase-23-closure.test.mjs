import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ARTICLE_DOMAIN_LABELS,
  ARTICLE_SPECIMEN_SUBJECT_ID,
  parseEvidenceSubject,
} from "../../systems/evidence/article-profile.js";
import { DELIVERY_STAGES, RESULT, projectChangeChain } from "../../systems/evidence/change-chain.js";
import { SPECIMEN_256_RECORD } from "../../systems/evidence/change-chain-specimen.js";
import { detailForChangeStage } from "../../systems/evidence/change-view.js";
import {
  ESTATE_PROFILE_ORDER,
  articlePublicationEstateBoundary,
  chooseEstateProfile,
  estateProfileGroups,
  phase23Archetypes,
  projectEstateView,
  topologyRecordFromSettled,
} from "../../systems/evidence/estate-profile.js";
import { detailForEstateSubject } from "../../systems/evidence/estate-view.js";
import { applyEvidenceView } from "../../systems/evidence/evidence-views.js";
import { evidenceClaimHref, parseEvidenceClaim } from "../../systems/evidence/evidence-detail.js";
import { LIBRARY_RELEASE_DOMAIN_LABELS } from "../../systems/evidence/library-profile.js";
import {
  presentLifecycleProfile,
  projectLifecycleStages,
} from "../../systems/evidence/lifecycle-profile.js";
import { isPublicSafeHref } from "../../systems/evidence/public-safe-href.js";

const NOW = Date.parse("2026-09-12T18:00:00.000Z");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function stageMap(stages) {
  return Object.fromEntries(stages.map((stage) => [stage.stage, stage]));
}

function topology() {
  return {
    schema: "atlas-public-topology/v3",
    generated_at: "2026-09-12T17:00:00Z",
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
      {
        id: "atlas-interface-kit",
        kind: "repository",
        runtime_service: false,
        source_only: true,
        repo: "https://github.com/AtlasReaper311/atlas-interface-kit",
        repo_name: "atlas-interface-kit",
      },
    ],
  };
}

test("Phase 2.3 keeps one ADR-0013 vocabulary across four archetypes", () => {
  const ids = ["static-public-site", "runtime-worker", "library-toolkit", "article-publication"];
  for (const id of ids) {
    const presentation = presentLifecycleProfile(id);
    assert.equal(presentation.authority, "ADR-0014");
    assert.equal(presentation.id, id);
    assert.match(presentation.expectedPath, /SOURCE → CHECKED → MERGED/);
    assert.doesNotMatch(presentation.label, /Model Promotion|fifth|fleet health/i);
  }
  const site = stageMap(projectLifecycleStages("static-public-site"));
  const worker = stageMap(projectLifecycleStages("runtime-worker"));
  const kit = stageMap(projectLifecycleStages("library-toolkit"));
  const article = stageMap(projectLifecycleStages("article-publication"));
  assert.deepEqual(Object.keys(site), [...DELIVERY_STAGES]);
  assert.equal(site["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(site["RUNTIME VERIFIED"].gap, null);
  assert.equal(site.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(worker["RUNTIME VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(worker["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(kit["DEPLOYMENT OBSERVED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(kit.DEPLOYED.result, RESULT.NOT_APPLICABLE);
  assert.equal(kit["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(article["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(article["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.notEqual(article["RUNTIME VERIFIED"].result, article["LIVE VERIFIED"].result);
});

test("Domain labels map onto ADR-0013 and do not replace it", () => {
  assert.equal(ARTICLE_DOMAIN_LABELS.SOURCE, "AUTHORED");
  assert.equal(ARTICLE_DOMAIN_LABELS.CHECKED, "VALIDATED");
  assert.equal(ARTICLE_DOMAIN_LABELS.MERGED, "SCHEDULED");
  assert.equal(ARTICLE_DOMAIN_LABELS["DEPLOYMENT OBSERVED"], "SCHEDULER EXECUTED");
  assert.equal(ARTICLE_DOMAIN_LABELS.DEPLOYED, "published writing identity");
  assert.equal(LIBRARY_RELEASE_DOMAIN_LABELS["DEPLOYMENT OBSERVED"], "RELEASED event");
  assert.equal(LIBRARY_RELEASE_DOMAIN_LABELS.DEPLOYED, "RELEASED identity");
  assert.equal(Object.keys(ARTICLE_DOMAIN_LABELS).includes("RUNTIME VERIFIED"), false);
});

test("Estate topology counts stay derived and never invent an article subject", () => {
  const projection = projectEstateView(topology(), NOW);
  const groups = estateProfileGroups(projection.subjects);
  const archetypes = phase23Archetypes(projection.subjects);
  const article = archetypes.find((item) => item.id === "article-publication");
  const site = archetypes.find((item) => item.id === "static-public-site");
  assert.equal(site.count, 1);
  assert.equal(article.topologySubject, false);
  assert.equal(article.count, null);
  assert.equal(article.inspectView, "change");
  assert.equal(article.inspectSubject, ARTICLE_SPECIMEN_SUBJECT_ID);
  assert.equal(groups.some((group) => group.id === "article-publication"), false);
  assert.equal(ESTATE_PROFILE_ORDER.includes("article-publication"), false);
  assert.equal(projection.subjects.some((subject) => subject.profile.id === "article-publication"), false);
  assert.equal(chooseEstateProfile({ kind: "article", id: "w-08" }).id, "unknown-subject");
  assert.equal(chooseEstateProfile({
    kind: "repository",
    id: "specular-core-architectural-recovery",
    runtime_service: false,
  }).id, "library-toolkit");
  const boundary = articlePublicationEstateBoundary();
  assert.match(boundary.reason, /not model published writing/);
  assert.equal(boundary.topologySubject, false);
});

test("Selected claim detail keeps proof boundaries for site, worker, kit, and article", () => {
  const merged = detailForChangeStage(projectChangeChain(SPECIMEN_256_RECORD), "MERGED");
  assert.match(merged.doesNotProve, /does not prove deployment, runtime, or live verification/);
  const estate = projectEstateView(topology(), NOW);
  const kitDetail = detailForEstateSubject(estate, "atlas-interface-kit", "DEPLOYED");
  assert.match(kitDetail.assertion, /RELEASED identity/);
  assert.match(kitDetail.doesNotProve, /runtime or live/);
  const siteDetail = detailForEstateSubject(estate, "atlas-systems");
  assert.match(siteDetail.proves, /Classification lifecycle/);
  assert.equal(siteDetail.nextGap.label, "SOURCE");
  assert.equal(siteDetail.nextGap.result, RESULT.UNKNOWN_NOT_OBSERVED);
  const workerDetail = detailForEstateSubject(estate, "atlas-api-public");
  assert.equal(workerDetail.observationResult, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("Deep-link and history helpers keep subject and claim bounded", () => {
  const href = evidenceClaimHref("change", "DEPLOYED", "/systems/evidence/", {
    subject: ARTICLE_SPECIMEN_SUBJECT_ID,
  });
  assert.match(href, /view=change/);
  assert.match(href, /subject=specular-core-architectural-recovery/);
  assert.match(href, /claim=DEPLOYED/);
  assert.equal(
    parseEvidenceSubject({ search: "?subject=specular-core-architectural-recovery" }, [
      "atlas-systems-256",
      ARTICLE_SPECIMEN_SUBJECT_ID,
    ]),
    ARTICLE_SPECIMEN_SUBJECT_ID,
  );
  assert.equal(
    parseEvidenceClaim({ search: "?claim=DEPLOYED" }, ["MERGED", "DEPLOYED"], "MERGED"),
    "DEPLOYED",
  );
});

test("View switching hides inactive panels and does not move focus", () => {
  const tabs = ["change", "service", "estate"].map((name) => ({
    dataset: { evidenceViewTab: name },
    attributes: {},
    setAttribute(key, value) { this.attributes[key] = String(value); },
    removeAttribute(key) { delete this.attributes[key]; },
  }));
  const panels = ["change", "service", "estate"].map((name) => ({
    tagName: "DETAILS",
    dataset: { evidenceView: name },
    hidden: false,
    open: name === "change",
    attributes: {},
    children: [{ tagName: "SUMMARY", hidden: false }],
    querySelector() { return this.children[0]; },
    setAttribute(key, value) { this.attributes[key] = String(value); },
  }));
  const focused = { id: "change-chain-button" };
  const nav = {
    attributes: {},
    dataset: {},
    setAttribute(key, value) { this.attributes[key] = String(value); },
    querySelectorAll(selector) {
      if (selector.includes("data-evidence-view-tab")) return tabs;
      return panels;
    },
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: focused,
    getElementById(id) {
      if (id === "evidence-view-nav") return nav;
      return null;
    },
    querySelectorAll(selector) { return nav.querySelectorAll(selector); },
  };
  try {
    applyEvidenceView("estate", { root: nav, enhanced: true });
    assert.equal(panels[0].hidden, true);
    assert.equal(panels[1].hidden, true);
    assert.equal(panels[2].hidden, false);
    assert.equal(globalThis.document.activeElement, focused);
    assert.equal(tabs[2].attributes["aria-selected"], "true");
    assert.equal(tabs[0].attributes["aria-selected"], "false");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("Malformed or failed estate sources fail closed and #267 roster focus stays isolated", () => {
  const failed = projectEstateView(topologyRecordFromSettled({ status: "rejected" }), NOW);
  const malformed = projectEstateView({ schema: "nope", components: [{ id: "atlas-systems" }] }, NOW);
  assert.equal(failed.fetchFailed, true);
  assert.equal(failed.subjectCount, 0);
  assert.equal(malformed.malformed, true);
  assert.equal(malformed.subjectCount, 0);
  const estateView = read("systems/evidence/estate-view.js");
  assert.match(estateView, /focusTarget === "path"/);
  assert.match(estateView, /focusClaimControl\(body, next\)/);
  assert.match(estateView, /persistFocus = true, stageName = selectedStage, focusTarget = "roster"/);
  assert.doesNotMatch(estateView, /innerHTML\s*=/);
});

test("No-JS fallbacks and public-safe hrefs remain available for all four archetypes", () => {
  const page = read("systems/evidence/index.html");
  assert.match(page, /id="change-detail-fallback"/);
  assert.match(page, /id="change-article-fallback"/);
  assert.match(page, /id="estate-library-fallback"/);
  assert.match(page, /id="estate-archetypes"/);
  assert.match(page, /href="#change-article-fallback"/);
  assert.match(page, /data-archetype="article-publication"/);
  assert.match(page, /Phase 2.3 archetypes/);
  assert.match(page, /Model Promotion is a separate Phase 4 Observatory surface/);
  assert.match(page, /It is not a fourth Console view/);
  assert.doesNotMatch(page, /href="\/systems\/evidence\/\?view=/);
  assert.equal(isPublicSafeHref("https://github.com/AtlasReaper311/atlas-systems"), true);
  assert.equal(isPublicSafeHref("https://atlas-systems.uk/writing/specular-core-architectural-recovery/"), true);
  assert.equal(isPublicSafeHref("https://api.atlas-systems.uk/v1/topology"), true);
  assert.equal(isPublicSafeHref("https://evil.com/?u=https://api.atlas-systems.uk/v1/topology"), false);
});

test("Documentation closure describes the implemented Console without rewriting ADRs", () => {
  const docs = read("docs/EVIDENCE-CONSOLE.md");
  const readme = read("README.md");
  const page = read("systems/evidence/index.html");
  for (const needle of [
    "What the Console is for",
    "Change / Service / Estate",
    "Evidence Detail",
    "ADR-0013",
    "ADR-0014",
    "Static / Public Site",
    "Runtime Worker",
    "Library / Toolkit",
    "Article Publication",
    "AUTHORED",
    "SCHEDULER EXECUTED",
    "public-safe",
    "UNKNOWN / NOT OBSERVED",
    "classification",
    "Model Promotion",
    "Phase 4",
    "answers what proves an operational or public claim",
    "why a model was considered suitable for a named capability",
  ]) {
    assert.ok(docs.includes(needle), `docs missing ${needle}`);
  }
  assert.doesNotMatch(docs, /Model Promotion remains Phase 4 Observatory work/);
  assert.match(docs, /atlas-infra\/blob\/main\/docs\/adrs\/ADR-0013-estate-wide-evidence-lifecycle\.md/);
  assert.match(docs, /atlas-infra\/blob\/main\/docs\/adrs\/ADR-0014-evidence-lifecycle-profiles\.md/);
  assert.doesNotMatch(docs, /this ADR now says|ADR-0013 now requires/i);
  assert.match(readme, /docs\/EVIDENCE-CONSOLE\.md/);
  assert.match(readme, /Article Publication is inspectable in Change View/);
  assert.match(page, /id="estate-archetypes"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="article"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="promotion"/);
});
