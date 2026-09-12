import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { DELIVERY_STAGES, RESULT, STATIC_PUBLIC_SITE_PROFILE } from "../../systems/evidence/change-chain.js";
import { RUNTIME_WORKER_PROFILE } from "../../systems/evidence/service-profile.js";
import {
  DOCUMENTATION_POLICY_PROFILE,
  ESTATE_TOPOLOGY_URL,
  LIBRARY_TOOLKIT_PROFILE,
  chooseEstateProfile,
  classificationEvidenceMode,
  compactEstateReading,
  estateViewStatus,
  evidenceViewHref,
  parseEvidenceView,
  projectEstateSubject,
  projectEstateView,
  topologyRecordFromSettled,
} from "../../systems/evidence/estate-profile.js";
import { applyEvidenceView } from "../../systems/evidence/evidence-views.js";
import { isPublicSafeHref } from "../../systems/evidence/public-safe-href.js";

const NOW = Date.parse("2026-09-11T17:00:00.000Z");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function topology(overrides = {}) {
  return {
    schema: "atlas-public-topology/v3",
    owner: "AtlasReaper311",
    generated_at: "2026-09-11T16:00:00Z",
    classification_authority: "AtlasReaper311/atlas-infra",
    classification_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    components: [
      {
        id: "atlas-systems",
        kind: "site",
        layer: "surface",
        lifecycle: "production",
        scope: "public",
        provenance: "original",
        runtime_service: true,
        repo: "https://github.com/AtlasReaper311/atlas-systems",
        repo_name: "atlas-systems",
        public_surface: "https://atlas-systems.uk",
        source_only: false,
      },
      {
        id: "atlas-api-public",
        kind: "worker",
        layer: "public-api",
        lifecycle: "production",
        scope: "public",
        provenance: "original",
        runtime_service: true,
        repo: "https://github.com/AtlasReaper311/atlas-api-public",
        repo_name: "atlas-api-public",
        public_surface: "https://api.atlas-systems.uk/v1",
        source_only: false,
      },
      {
        id: "atlas-interface-kit",
        kind: "repository",
        layer: "reusable-kit",
        lifecycle: "active",
        scope: "public",
        provenance: "original",
        runtime_service: false,
        repo: "https://github.com/AtlasReaper311/atlas-interface-kit",
        repo_name: "atlas-interface-kit",
        public_surface: null,
        source_only: true,
      },
      {
        id: "atlas-infra",
        kind: "repository",
        layer: "infra",
        lifecycle: "active",
        scope: "public",
        provenance: "original",
        runtime_service: false,
        repo: "https://github.com/AtlasReaper311/atlas-infra",
        repo_name: "atlas-infra",
        public_surface: null,
        source_only: true,
      },
      {
        id: "atlas-journey-watch",
        kind: "github-actions",
        layer: "observability",
        lifecycle: "active",
        scope: "public",
        provenance: "original",
        runtime_service: false,
        repo: "https://github.com/AtlasReaper311/atlas-journey-watch",
        repo_name: "atlas-journey-watch",
        public_surface: "GitHub Actions scheduled workflow",
        source_only: false,
      },
    ],
    ...overrides,
  };
}

function subjectMap(projection) {
  return Object.fromEntries(projection.subjects.map((subject) => [subject.id, subject]));
}

function stageMap(subject) {
  return Object.fromEntries(subject.stages.map((stage) => [stage.stage, stage]));
}

test("Estate profiles follow ADR-0014 and do not treat every repository as a Worker", () => {
  assert.equal(chooseEstateProfile({ kind: "site", id: "atlas-systems", runtime_service: true }).id, STATIC_PUBLIC_SITE_PROFILE.id);
  assert.equal(chooseEstateProfile({ kind: "worker", id: "atlas-api-public", runtime_service: true }).id, RUNTIME_WORKER_PROFILE.id);
  assert.equal(chooseEstateProfile({ kind: "repository", repo_name: "atlas-interface-kit", runtime_service: false, source_only: true }).id, LIBRARY_TOOLKIT_PROFILE.id);
  assert.equal(chooseEstateProfile({ kind: "repository", repo_name: "atlas-infra", runtime_service: false, source_only: true }).id, DOCUMENTATION_POLICY_PROFILE.id);
  assert.equal(chooseEstateProfile({ kind: "github-actions", repo_name: "atlas-journey-watch", runtime_service: false }).id, DOCUMENTATION_POLICY_PROFILE.id);
});

test("Topology classification cannot become deployment, runtime, or live evidence", () => {
  const projection = projectEstateView(topology(), NOW);
  const subjects = subjectMap(projection);
  const site = stageMap(subjects["atlas-systems"]);
  const worker = stageMap(subjects["atlas-api-public"]);
  assert.equal(subjects["atlas-systems"].classification.result, RESULT.OBSERVED);
  assert.equal(subjects["atlas-systems"].classification.lifecycle, "production");
  assert.equal(site.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(site.MERGED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(site["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(site.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(site["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(site["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(worker["RUNTIME VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(worker["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(subjects["atlas-systems"].latestProvenStage, null);
  assert.equal(subjects["atlas-api-public"].nextApplicableMissing, "SOURCE");
  assert.notEqual(estateViewStatus(projection), "healthy");
});

test("Library and documentation profiles keep runtime and live distinct from unknown", () => {
  const projection = projectEstateView(topology(), NOW);
  const kitSubject = subjectMap(projection)["atlas-interface-kit"];
  const kit = stageMap(kitSubject);
  const infra = stageMap(subjectMap(projection)["atlas-infra"]);
  assert.equal(kit["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(kit["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(kit["DEPLOYMENT OBSERVED"].result, RESULT.OBSERVED);
  assert.equal(kit.DEPLOYED.result, RESULT.OBSERVED);
  assert.equal(kitSubject.latestProvenStage, "DEPLOYED");
  assert.equal(kitSubject.nextApplicableMissing, "Later default-branch identity");
  assert.equal(infra["RUNTIME VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(infra["LIVE VERIFIED"].result, RESULT.NOT_APPLICABLE);
  assert.equal(infra.SOURCE.result, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("FAILED topology fetch is distinct from UNKNOWN / NOT OBSERVED", () => {
  const failed = projectEstateView(topologyRecordFromSettled({ status: "rejected" }), NOW);
  const unknown = projectEstateView(topology({ components: [] }), NOW);
  assert.equal(failed.fetchFailed, true);
  assert.equal(unknown.fetchFailed, false);
  assert.equal(estateViewStatus(failed), "failure");
  assert.equal(estateViewStatus(unknown), "warning");
  assert.notEqual(estateViewStatus(failed), estateViewStatus(unknown));
  assert.equal(failed.subjectCount, 0);
  assert.equal(failed.reading.lines[0].result, RESULT.FAILED);
  assert.match(failed.reading.lines[0].scope, /FAILED is distinct from UNKNOWN \/ NOT OBSERVED/);
  assert.equal(unknown.reading.lines[0].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.notEqual(failed.reading.lines[0].result, unknown.reading.lines[0].result);
});

test("Malformed or non-v3 topology fails closed without inventing a healthy fleet", () => {
  const malformed = projectEstateView({ schema: "nope", components: [{ id: "atlas-systems", kind: "site" }] }, NOW);
  assert.equal(malformed.malformed, true);
  assert.equal(malformed.subjectCount, 0);
  assert.equal(estateViewStatus(malformed), "warning");
  assert.equal(malformed.reading.lines.find((line) => line.label === "Estate health score").result, RESULT.NOT_APPLICABLE);
});

test("Stale topology keeps classification observed without washing later unknown delivery stages", () => {
  const staleNow = Date.parse("2026-09-13T17:00:00.000Z");
  const projection = projectEstateView(topology(), staleNow);
  const site = subjectMap(projection)["atlas-systems"];
  assert.equal(site.classification.result, RESULT.OBSERVED);
  assert.equal(site.classification.evidenceMode, "stale-measured");
  assert.equal(stageMap(site).DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(classificationEvidenceMode(RESULT.OBSERVED, "2026-09-11T16:00:00Z", staleNow), "stale-measured");
});

test("Compact estate reading refuses a green fleet badge", () => {
  const projection = projectEstateView(topology(), NOW);
  const labels = compactEstateReading(projection.subjects, projection.extraGaps).lines
    .map((line) => `${line.label}: ${line.result}`);
  assert.ok(labels.includes("Public topology roster: OBSERVED"));
  assert.ok(labels.includes("Proven ADR-0013 delivery stage: UNKNOWN / NOT OBSERVED"));
  assert.ok(labels.includes("Estate health score: NOT APPLICABLE"));
  assert.ok(labels.includes("Estate-wide delivery snapshot: UNKNOWN / NOT OBSERVED"));
  assert.equal(estateViewStatus(projection), "warning");
});

test("View parser supports query and hash deep links and rejects unknown views", () => {
  assert.equal(parseEvidenceView({ search: "?view=estate", hash: "" }), "estate");
  assert.equal(parseEvidenceView({ search: "", hash: "#view-service" }), "service");
  assert.equal(parseEvidenceView({ search: "?view=nope", hash: "#view-change" }), "change");
  assert.equal(parseEvidenceView({ search: "", hash: "" }), "change");
  assert.equal(evidenceViewHref("estate"), "/systems/evidence/?view=estate#view-estate");
});

test("Enhanced view navigation shows one major view and keeps keyboard tab roles", () => {
  const created = [];
  function element(tag, attrs = {}) {
    const children = [];
    const node = {
      tagName: String(tag).toUpperCase(),
      className: "",
      hidden: false,
      open: attrs.open === true,
      dataset: { ...(attrs.dataset || {}) },
      attributes: {},
      children,
      textContent: "",
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name]; },
      removeAttribute(name) { delete this.attributes[name]; },
      querySelector(selector) {
        if (selector === ":scope > summary" || selector === "summary") {
          return this.children.find((child) => child.tagName === "SUMMARY") ?? null;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector.includes("data-evidence-view-tab")) return this._tabs ?? [];
        if (selector.includes("data-evidence-view")) return this._panels ?? [];
        if (selector === ".systems-evidence-views") return this._nav ? [this._nav] : [];
        return [];
      },
      closest() { return null; },
    };
    Object.assign(node, attrs);
    created.push(node);
    return node;
  }
  const tabs = ["change", "service", "estate"].map((name) => {
    const tab = element("a", { dataset: { evidenceViewTab: name } });
    tab.dataset.evidenceViewTab = name;
    return tab;
  });
  const panels = ["change", "service", "estate"].map((name, index) => {
    const details = element("details", { dataset: { evidenceView: name }, open: index === 0 });
    details.dataset.evidenceView = name;
    details.appendChild = (child) => { details.children.push(child); return child; };
    details.appendChild(element("summary"));
    return details;
  });
  const nav = element("nav");
  nav._tabs = tabs;
  nav._panels = panels;
  nav._nav = nav;
  nav.querySelectorAll = (selector) => {
    if (selector.includes("data-evidence-view-tab")) return tabs;
    if (selector.includes("details[data-evidence-view]") || selector.includes("data-evidence-view")) return panels;
    return [];
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      if (id === "evidence-view-nav") return nav;
      if (id === "supporting-records") return null;
      return null;
    },
    querySelector() { return nav; },
    querySelectorAll(selector) { return nav.querySelectorAll(selector); },
  };
  try {
    applyEvidenceView("estate", { root: nav, enhanced: true });
    assert.equal(tabs[2].attributes["aria-selected"], "true");
    assert.equal(tabs[0].attributes["aria-selected"], "false");
    assert.equal(tabs[2].attributes.tabindex, "0");
    assert.equal(tabs[0].attributes.tabindex, "-1");
    assert.equal(panels[2].hidden, false);
    assert.equal(panels[0].hidden, true);
    assert.equal(panels[2].open, true);
    assert.equal(nav.attributes.role, "tablist");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("Estate renderer writes subjects without innerHTML and without a healthy gap wash", async () => {
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
      colSpan: 1,
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
    "estate-rows", "estate-reading", "estate-provenance",
    "estate-view-status", "source-estate-view",
  ]) {
    nodes.set(id, element(id.includes("rows") ? "tbody" : (id.includes("reading") ? "ol" : "div")));
  }
  globalThis.document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
    createElement: element,
  };
  try {
    const { renderEstateView } = await import("../../systems/evidence/estate-view.js");
    const projection = renderEstateView(topology());
    assert.equal(projection.subjects.length, 5);
    assert.equal(nodes.get("estate-rows").children.length, 5);
    const textOf = (node) => {
      if (!node) return "";
      if (node.children?.length) return node.children.map(textOf).join("");
      return node.textContent ?? "";
    };
    const readingText = nodes.get("estate-reading").children.map(textOf).join("\n");
    assert.match(readingText, /Proven ADR-0013 delivery stage: UNKNOWN \/ NOT OBSERVED/);
    assert.match(readingText, /Estate health score: NOT APPLICABLE/);
    assert.equal(nodes.get("estate-view-status").dataset.state, "warning");
    assert.match(nodes.get("source-estate-view").textContent, /not health/);
    assert.equal(created.some((node) => "innerHTML" in node && node.innerHTML), false);
  } finally {
    delete globalThis.document;
  }
});

test("Public href allowlist still rejects host spoofing for estate sources", () => {
  assert.equal(isPublicSafeHref(ESTATE_TOPOLOGY_URL), true);
  assert.equal(isPublicSafeHref("https://github.com/AtlasReaper311/atlas-infra"), true);
  assert.equal(isPublicSafeHref("https://api.atlas-systems.uk.evil/v1/topology"), false);
  assert.equal(isPublicSafeHref("https://evil.com/?u=https://api.atlas-systems.uk/v1/topology"), false);
});

test("Evidence Console keeps Change and Service Views and adds Estate navigation without secrets", () => {
  const page = read("systems/evidence/index.html");
  const view = read("systems/evidence/estate-view.js");
  const projector = read("systems/evidence/estate-profile.js");
  const nav = read("systems/evidence/evidence-views.js");
  const service = read("systems/evidence/service-view.js");
  const change = read("systems/evidence/change-view.js");
  const css = read("static/css/systems-evidence-estate-view.css");

  for (const section of [
    "First source-to-live chain",
    "First runtime service evidence",
    "First public estate evidence overview",
    "Evidence summary",
    "Ninety days of public commit evidence",
    "Latest bounded deployment record",
    "Recent CI and deployment events",
    "Published assurance records",
    "Freshness and provenance",
    "Supporting public records",
  ]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
  for (const id of [
    "change-view-title", "change-reading", "change-chain",
    "service-view-title", "service-reading", "service-facts",
    "estate-view-title", "estate-view-status", "estate-reading",
    "estate-rows", "estate-provenance", "source-estate-view", "estate-profiles",
    "estate-subject-profile", "estate-expected-path",
    "evidence-view-nav", "supporting-records",
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /systems\/evidence\/change-view\.js\?v=20260912-profile/);
  assert.match(page, /systems\/evidence\/service-view\.js\?v=20260912-profile/);
  assert.match(page, /systems\/evidence\/estate-view\.js\?v=20260912-library/);
  assert.match(page, /systems\/evidence\/evidence-views\.js\?v=20260911-visual/);
  assert.match(page, /systems-evidence-estate-view\.css\?v=20260911-visual/);
  assert.match(css, /\[aria-selected="true"\] span/);
  assert.match(css, /color:\s*var\(--text-dim\)/);
  assert.match(css, /\.systems-evidence-view-summary\[hidden\]/);
  assert.match(page, /href="#view-change"/);
  assert.match(page, /href="#view-service"/);
  assert.match(page, /href="#view-estate"/);
  assert.doesNotMatch(page, /href="\/systems\/evidence\/\?view=/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /min-height: 72px/);

  for (const source of [view, projector, nav, service, change]) {
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
  assert.match(view, /textContent/);
  assert.match(view, /Promise\.allSettled/);
  assert.match(view, /ESTATE_TOPOLOGY_URL/);
  assert.doesNotMatch(view, /\/v1\/stats/);
  assert.match(projector, /\/v1\/stats probes other public components/);
  assert.match(projector, /reports\/estate-snapshot\.json/);
  assert.match(nav, /ArrowRight/);
  assert.match(nav, /pushState/);
});

test("projectEstateSubject keeps ADR-0013 stage order", () => {
  const subject = projectEstateSubject({
    id: "atlas-api-public",
    kind: "worker",
    runtime_service: true,
    repo_name: "atlas-api-public",
  }, { generatedAt: "2026-09-11T16:00:00Z" }, NOW);
  assert.deepEqual(subject.stages.map((stage) => stage.stage), [...DELIVERY_STAGES]);
  assert.equal(subject.profile.id, "runtime-worker");
});
