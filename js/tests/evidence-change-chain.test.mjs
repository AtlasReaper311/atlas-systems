import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DELIVERY_STAGES,
  RESULT,
  STATIC_PUBLIC_SITE_PROFILE,
  compactReading,
  evidenceModeForResult,
  projectChangeChain,
} from "../../systems/evidence/change-chain.js";
import { SPECIMEN_256_RECORD } from "../../systems/evidence/change-chain-specimen.js";
import { isPublicSafeHref } from "../../systems/evidence/change-view.js";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function stageMap(chain) {
  return Object.fromEntries(chain.stages.map((stage) => [stage.stage, stage]));
}

function mergedOnlyRecord() {
  return {
    classification: "recorded-public-projection",
    recordedAt: "2026-09-11T08:32:02Z",
    observations: {
      SOURCE: {
        result: RESULT.OBSERVED,
        identifier: "pr-1",
        provenance: "public GitHub",
        observedAt: "2026-09-10T21:56:09Z",
        scope: "A named source change exists.",
      },
      CHECKED: {
        result: RESULT.OBSERVED,
        identifier: "head-1",
        provenance: "public GitHub checks",
        observedAt: "2026-09-10T21:56:52Z",
        scope: "Required checks ran on that exact head.",
      },
      MERGED: {
        result: RESULT.OBSERVED,
        identifier: "merge-1",
        provenance: "public GitHub merge",
        observedAt: "2026-09-11T08:32:02Z",
        scope: "The exact head is on main.",
      },
    },
  };
}

test("Change-chain projector keeps ADR-0013 stage order", () => {
  const chain = projectChangeChain(mergedOnlyRecord());
  assert.deepEqual(chain.stages.map((stage) => stage.stage), [...DELIVERY_STAGES]);
  assert.equal(chain.liveFeed, false);
});

test("CHECKED does not imply MERGED, and MERGED does not fill later stages", () => {
  const checkedOnly = projectChangeChain({
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "pr-1", scope: "source exists" },
      CHECKED: { result: RESULT.OBSERVED, identifier: "head-1", scope: "checks ran" },
    },
  });
  const stages = stageMap(checkedOnly);
  assert.equal(stages.CHECKED.result, RESULT.OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(stages.MERGED.gap, /UNKNOWN \/ NOT OBSERVED/);
});

test("Merged change with no deploy evidence keeps the required public reading", () => {
  const chain = projectChangeChain(mergedOnlyRecord());
  const reading = chain.reading.lines.map((line) => `${line.label}${line.kind === "proven" ? "" : `: ${line.result}`}`);
  assert.equal(reading[0], "MERGED");
  assert.ok(reading.includes("Deployment: UNKNOWN / NOT OBSERVED"));
  assert.ok(reading.includes("Live verification: UNKNOWN / NOT OBSERVED"));
  assert.equal(chain.reading.provenStage, "MERGED");
  assert.equal(evidenceModeForResult(RESULT.UNKNOWN_NOT_OBSERVED), "unknown");
  assert.notEqual(evidenceModeForResult(RESULT.UNKNOWN_NOT_OBSERVED), "recorded-replay");
});

test("FAILED is distinct from UNKNOWN / NOT OBSERVED", () => {
  const chain = projectChangeChain({
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "pr-1", scope: "source exists" },
      CHECKED: {
        result: RESULT.FAILED,
        identifier: "head-1",
        provenance: "public GitHub checks",
        observedAt: "2026-09-10T21:56:52Z",
        scope: "Required checks ran and did not hold.",
      },
    },
  });
  const stages = stageMap(chain);
  assert.equal(stages.CHECKED.result, RESULT.FAILED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.CHECKED.evidenceMode, "unavailable");
  assert.equal(stages.MERGED.evidenceMode, "unknown");
  assert.notEqual(stages.CHECKED.result, stages.MERGED.result);
});

test("DEPLOYMENT OBSERVED does not imply DEPLOYED", () => {
  const chain = projectChangeChain({
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "pr-1", scope: "source exists" },
      CHECKED: { result: RESULT.OBSERVED, identifier: "head-1", scope: "checks ran" },
      MERGED: { result: RESULT.OBSERVED, identifier: "merge-1", scope: "merged" },
      "DEPLOYMENT OBSERVED": {
        result: RESULT.OBSERVED,
        identifier: "run-1",
        provenance: "public GitHub Deploy workflow",
        observedAt: "2026-09-11T08:32:59Z",
        scope: "A named deploy event was seen.",
      },
    },
  });
  const stages = stageMap(chain);
  assert.equal(stages["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(stages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  const reading = compactReading(chain.stages).lines.map((line) => `${line.label}: ${line.result}`);
  assert.ok(reading.includes("Deployed identity: UNKNOWN / NOT OBSERVED"));
  assert.ok(reading.includes("Live verification: UNKNOWN / NOT OBSERVED"));
});

test("Chronology demotes later observations when deployment identity is unknown and retains support", () => {
  const chain = projectChangeChain({
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "source-1", scope: "source exists" },
      CHECKED: { result: RESULT.OBSERVED, identifier: "checks-1", scope: "checks passed" },
      MERGED: { result: RESULT.OBSERVED, identifier: "merge-1", scope: "merge exists" },
      "DEPLOYMENT OBSERVED": { result: RESULT.UNKNOWN_NOT_OBSERVED, gap: "deploy event unavailable" },
      DEPLOYED: {
        result: RESULT.OBSERVED,
        identifier: "endpoint-1",
        provenance: "public endpoint observation",
        observedAt: "2026-09-11T09:00:00Z",
        scope: "The endpoint answered with the expected route.",
      },
      "LIVE VERIFIED": {
        result: RESULT.OBSERVED,
        identifier: "live-1",
        provenance: "public live observation",
        scope: "The public page answered.",
      },
    },
  });
  const stages = stageMap(chain);
  assert.equal(stages.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.DEPLOYED.supportingObservation.identifier, "endpoint-1");
  assert.match(stages.DEPLOYED.scope, /supporting observation retained/i);
  assert.match(stages["LIVE VERIFIED"].gap, /DEPLOYMENT OBSERVED is UNKNOWN/);
  assert.equal(chain.nextGap.label, "DEPLOYMENT OBSERVED");
});

test("A failed predecessor also blocks later promotion without discarding its observation", () => {
  const chain = projectChangeChain({
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "source-1" },
      CHECKED: { result: RESULT.FAILED, identifier: "checks-1", scope: "checks failed" },
      MERGED: { result: RESULT.OBSERVED, identifier: "merge-1", scope: "merge record exists" },
    },
  });
  const stages = stageMap(chain);
  assert.equal(stages.CHECKED.result, RESULT.FAILED);
  assert.equal(stages.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(stages.MERGED.supportingObservation.identifier, "merge-1");
  assert.match(stages.MERGED.scope, /not promoted because CHECKED is FAILED/);
});

test("Static public-site profile makes RUNTIME VERIFIED NOT APPLICABLE even if an observation is supplied", () => {
  const chain = projectChangeChain({
    observations: {
      SOURCE: { result: RESULT.OBSERVED, identifier: "pr-1", scope: "source exists" },
      "RUNTIME VERIFIED": {
        result: RESULT.OBSERVED,
        identifier: "health-1",
        scope: "A worker health probe should not apply here.",
      },
    },
  }, STATIC_PUBLIC_SITE_PROFILE);
  const runtime = stageMap(chain)["RUNTIME VERIFIED"];
  assert.equal(runtime.result, RESULT.NOT_APPLICABLE);
  assert.equal(runtime.evidenceMode, "not-applicable-unscored");
  assert.match(runtime.scope, /NOT APPLICABLE/);
  assert.equal(runtime.identifier, null);
});

test("Public href allowlist rejects host spoofing", () => {
  assert.equal(isPublicSafeHref("https://github.com/AtlasReaper311/atlas-systems/pull/256"), true);
  assert.equal(isPublicSafeHref("https://atlas-systems.uk/systems/evidence/"), true);
  assert.equal(isPublicSafeHref("https://evil.com/?u=https://github.com/AtlasReaper311/atlas-systems"), false);
  assert.equal(isPublicSafeHref("https://github.com.evil.com/AtlasReaper311/atlas-systems"), false);
  assert.equal(isPublicSafeHref("https://github.com/AtlasReaper311.evil/atlas-systems"), false);
  assert.equal(isPublicSafeHref("https://api.github.com/repos/AtlasReaper311/atlas-systems"), false);
  assert.equal(isPublicSafeHref("http://github.com/AtlasReaper311/atlas-systems"), false);
});

test("First specimen projection is a recorded public chain for atlas-systems#256", () => {
  const chain = projectChangeChain(SPECIMEN_256_RECORD);
  const stages = stageMap(chain);
  assert.equal(chain.classification, "recorded-public-projection");
  assert.equal(chain.liveFeed, false);
  assert.equal(chain.subject.pullRequest, 256);
  assert.equal(chain.subject.sourceHead, "cb91d9282543b2ab4a2c59a87d5d428692eda856");
  assert.equal(chain.subject.mergeCommit, "db82da52f13a441a5f88344be6211be71ea2d92e");
  assert.equal(stages.SOURCE.result, RESULT.OBSERVED);
  assert.equal(stages.CHECKED.result, RESULT.OBSERVED);
  assert.equal(stages.MERGED.result, RESULT.OBSERVED);
  assert.equal(stages["DEPLOYMENT OBSERVED"].identifier, "Deploy run 34579657571 / run number 387");
  assert.equal(stages.DEPLOYED.result, RESULT.OBSERVED);
  assert.equal(stages["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(stages["LIVE VERIFIED"].result, RESULT.OBSERVED);
  assert.equal(chain.reading.provenStage, "LIVE VERIFIED");
  assert.equal(chain.review.existed, true);
  assert.equal(chain.review.approved, false);
  const reading = chain.reading.lines.map((line) => `${line.label}${line.kind === "proven" ? "" : `: ${line.result}`}`);
  assert.equal(reading[0], "LIVE VERIFIED");
  assert.ok(reading.includes("Runtime verification: NOT APPLICABLE"));
  assert.ok(reading.includes("Current production identity: UNKNOWN / NOT OBSERVED"));
  assert.equal(reading.includes("Live verification: UNKNOWN / NOT OBSERVED"), false);
  assert.equal(stages["LIVE VERIFIED"].evidenceMode, "recorded-replay");
  assert.equal(stages["RUNTIME VERIFIED"].evidenceMode, "not-applicable-unscored");
});

test("Change view renderer writes one stage per ADR-0013 step without innerHTML", async () => {
  const created = [];
  const nodes = new Map();
  function element(tag) {
    const children = [];
    const node = {
      tagName: String(tag).toUpperCase(),
      className: "",
      href: "",
      target: "",
      rel: "",
      hidden: false,
      dataset: {},
      textContent: "",
      children,
      replaceChildren(...next) {
        children.length = 0;
        children.push(...next);
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      append(...next) {
        children.push(...next);
      },
    };
    created.push(node);
    return node;
  }
  for (const id of [
    "change-chain", "change-reading", "change-review",
    "change-provenance", "change-view-status", "source-change-chain",
  ]) {
    nodes.set(id, element(id.includes("change-chain") || id.includes("reading") ? "ol" : "div"));
  }
  globalThis.document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
    createElement: element,
  };
  try {
    const { renderChangeView } = await import("../../systems/evidence/change-view.js");
    const chain = renderChangeView();
    assert.equal(chain.stages.length, 7);
    assert.equal(nodes.get("change-chain").children.length, 7);
    const textOf = (node) => {
      if (!node) return "";
      if (node.children?.length) return node.children.map(textOf).join("");
      return node.textContent ?? "";
    };
    const readingText = nodes.get("change-reading").children.map(textOf).join("\n");
    assert.match(readingText, /^LIVE VERIFIED/m);
    assert.match(readingText, /Runtime verification: NOT APPLICABLE/);
    assert.match(readingText, /Current production identity: UNKNOWN \/ NOT OBSERVED/);
    assert.equal(nodes.get("change-view-status").dataset.state, "warning");
    assert.match(nodes.get("source-change-chain").textContent, /not a live feed/);
    assert.equal(created.some((node) => "innerHTML" in node && node.innerHTML), false);
  } finally {
    delete globalThis.document;
  }
});

test("Evidence Console keeps existing public records and adds the change view without secrets", () => {
  const page = read("systems/evidence/index.html");
  const evidence = read("systems/evidence/evidence.js");
  const receipts = read("systems/evidence/receipts.js");
  const view = read("systems/evidence/change-view.js");
  const projector = read("systems/evidence/change-chain.js");
  const specimen = read("systems/evidence/change-chain-specimen.js");
  const href = read("systems/evidence/public-safe-href.js");
  const css = read("static/css/systems-evidence-truthfulness.css");

  for (const section of [
    "Evidence summary",
    "Ninety days of public commit evidence",
    "Latest bounded deployment record",
    "Recent CI and deployment events",
    "Published assurance records",
    "Freshness and provenance",
    "First source-to-live chain",
  ]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
  for (const id of [
    "change-view-title", "change-view-status", "change-reading", "change-chain",
    "change-review", "change-provenance", "source-change-chain", "change-profile",
    "change-subjects", "change-article-fallback",
    "summary-commits", "summary-deployment", "pipeline-list", "report-rows",
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /systems\/evidence\/change-view\.js\?v=20260913-phase25/);
  assert.match(page, /systems-evidence-truthfulness\.css\?v=20260913-phase25/);
  assert.match(page, /data-evidence-mode="recorded-replay"/);
  assert.match(page, /not a live feed/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /systems-change-reading-line\[data-result="UNKNOWN \/ NOT OBSERVED"\]/);
  assert.match(css, /min-height: 44px/);

  for (const endpoint of [
    "https://api.atlas-systems.uk/pulse/heatmap",
    "https://api.atlas-systems.uk/deploy-watch/latest",
    "https://api.atlas-systems.uk/notify/recent",
    "https://api.atlas-systems.uk/v1/evidence",
    "https://api.atlas-systems.uk/v1/slo",
  ]) {
    assert.ok(evidence.includes(endpoint) || receipts.includes(endpoint) || page.includes(endpoint), endpoint);
  }

  for (const source of [view, projector, specimen, evidence, receipts, href]) {
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
  assert.equal(view.includes("fetch("), false);
  assert.match(href, /new URL\(value\)/);
  assert.match(view, /textContent/);
  assert.match(specimen, /cb91d9282543b2ab4a2c59a87d5d428692eda856/);
  assert.match(specimen, /34579657571/);
});
