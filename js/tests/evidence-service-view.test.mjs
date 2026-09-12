import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { RESULT } from "../../systems/evidence/change-chain.js";
import {
  SERVICE_FACTS,
  compactServiceReading,
  observationsFromPublicSources,
  projectServiceView,
  serviceEvidenceMode,
  serviceViewStatus,
} from "../../systems/evidence/service-profile.js";
import { SERVICE_SPECIMEN } from "../../systems/evidence/service-specimen.js";
import { isPublicSafeHref } from "../../systems/evidence/public-safe-href.js";

const NOW = Date.parse("2026-09-11T10:05:00.000Z");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function fulfilled(value) {
  return { status: "fulfilled", value };
}

function rejected() {
  return { status: "rejected", reason: new Error("network") };
}

function publicSources(overrides = {}) {
  return {
    topology: fulfilled({
      owner: "AtlasReaper311",
      classification_authority: "AtlasReaper311/atlas-infra",
      generated_at: "2026-09-11T10:00:00Z",
      components: [{
        id: "atlas-api-public",
        kind: "worker",
        layer: "public-api",
        lifecycle: "production",
        scope: "public",
        runtime_service: true,
        public_surface: "https://api.atlas-systems.uk/v1",
        meta_url: "https://api.atlas-systems.uk/v1/_meta",
      }],
    }),
    registry: fulfilled({
      generated_at: "2026-09-11T10:00:00Z",
      workers: [{ name: "atlas-api-public", version: "1.4.0", documented: true }],
    }),
    meta: fulfilled({
      name: "atlas-api-public",
      version: "1.4.0",
      status: "live",
      endpoints: [
        { method: "GET", path: "/v1" },
        { method: "GET", path: "/v1/docs" },
      ],
    }),
    live: fulfilled({
      ok: true,
      service: "atlas-api-public",
      version: "1.4.0",
      generated_at: "2026-09-11T10:00:00Z",
    }),
    reliability: fulfilled({
      ok: true,
      result: {
        service_id: "atlas-api-public",
        state: "unmeasured",
        control_plane_state: "unknown",
        reasons: [
          "The evaluator runs inside this service, so self-probing would not provide independent availability evidence; no external objective is approved.",
        ],
      },
    }),
    ...overrides,
  };
}

function factMap(projection) {
  return Object.fromEntries(projection.facts.map((fact) => [fact.fact, fact]));
}

function readingMap(projection) {
  return Object.fromEntries(projection.reading.lines.map((line) => [line.label, line]));
}

test("Service projector keeps runtime-worker fact order", () => {
  const record = observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, NOW);
  const projection = projectServiceView(record, undefined, NOW);
  assert.deepEqual(projection.facts.map((fact) => fact.fact), [...SERVICE_FACTS]);
  assert.equal(projection.liveFeed, true);
  assert.equal(projection.subject.id, "atlas-api-public");
  assert.equal(projection.profile.id, "runtime-worker");
});

test("Topology and registry do not become deployment or deployed identity", () => {
  const projection = projectServiceView(
    observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const facts = factMap(projection);
  assert.equal(facts.OWNERSHIP.result, RESULT.OBSERVED);
  assert.equal(facts["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(facts.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(facts["DEPLOYMENT OBSERVED"].gap, /deploy-watch/);
  assert.match(facts.DEPLOYED.gap, /declared \/_meta version/i);
  const reading = readingMap(projection);
  assert.equal(reading.Deployment.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(reading["Expected deployed identity"].result, RESULT.UNKNOWN_NOT_OBSERVED);
});

test("Declared metadata version is not DEPLOYED, and _meta.status live is not LIVE VERIFIED by itself", () => {
  const liveMissing = publicSources({
    live: fulfilled({ ok: false, service: "other" }),
  });
  const projection = projectServiceView(
    observationsFromPublicSources(liveMissing, SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const facts = factMap(projection);
  assert.equal(facts["RUNTIME VERIFIED"].result, RESULT.OBSERVED);
  assert.equal(facts["LIVE VERIFIED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(facts["RUNTIME VERIFIED"].scope, /status field is ignored/);
  const versionLine = projection.reading.lines.find((line) => line.label === "Declared metadata version");
  assert.equal(versionLine.result, RESULT.OBSERVED);
  assert.match(versionLine.scope, /not the expected deployed identity/);
  assert.equal(facts.DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(serviceEvidenceMode(RESULT.OBSERVED, "2026-09-11T10:00:00Z", NOW), "measured");
  assert.notEqual(serviceEvidenceMode(RESULT.OBSERVED, "2026-09-11T10:00:00Z", NOW), "recorded-replay");
});

test("RUNTIME VERIFIED does not imply LIVE VERIFIED, and LIVE does not fill runtime", () => {
  const runtimeOnly = projectServiceView(
    observationsFromPublicSources(publicSources({
      live: rejected(),
    }), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const liveOnly = projectServiceView(
    observationsFromPublicSources(publicSources({
      meta: rejected(),
    }), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  assert.equal(factMap(runtimeOnly)["RUNTIME VERIFIED"].result, RESULT.OBSERVED);
  assert.equal(factMap(runtimeOnly)["LIVE VERIFIED"].result, RESULT.FAILED);
  assert.equal(factMap(liveOnly)["LIVE VERIFIED"].result, RESULT.OBSERVED);
  assert.equal(factMap(liveOnly)["RUNTIME VERIFIED"].result, RESULT.FAILED);
  assert.equal(factMap(liveOnly)["EXPECTED CONTRACT"].result, RESULT.FAILED);
});

test("FAILED is distinct from UNKNOWN / NOT OBSERVED", () => {
  const projection = projectServiceView(
    observationsFromPublicSources(publicSources({
      topology: rejected(),
      meta: fulfilled({ name: "atlas-api-public", version: "1.4.0", status: "live", endpoints: [{ method: "GET", path: "/v1" }] }),
    }), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const facts = factMap(projection);
  assert.equal(facts.OWNERSHIP.result, RESULT.FAILED);
  assert.equal(facts["DEPLOYMENT OBSERVED"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(facts.OWNERSHIP.evidenceMode, "unavailable");
  assert.equal(facts["DEPLOYMENT OBSERVED"].evidenceMode, "unknown");
  assert.notEqual(facts.OWNERSHIP.result, facts["DEPLOYMENT OBSERVED"].result);
  assert.equal(serviceViewStatus(projection), "failure");
});

test("Unmeasured reliability and stats probes cannot mint a healthy service badge", () => {
  const projection = projectServiceView(
    observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const reading = readingMap(projection);
  assert.equal(reading["Independent availability objective"].result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.match(reading["Independent availability objective"].scope, /self-probing/);
  assert.equal(reading["Estate component probes"].result, RESULT.NOT_APPLICABLE);
  assert.equal(serviceViewStatus(projection), "warning");
  assert.notEqual(serviceViewStatus(projection), "healthy");
  assert.equal(factMap(projection)["RUNTIME VERIFIED"].evidenceMode, "measured");
});

test("Stale topology keeps ownership observed without washing later unknown facts", () => {
  const staleNow = Date.parse("2026-09-13T10:05:00.000Z");
  const projection = projectServiceView(
    observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, staleNow),
    undefined,
    staleNow,
  );
  const ownership = factMap(projection).OWNERSHIP;
  assert.equal(ownership.result, RESULT.OBSERVED);
  assert.equal(ownership.evidenceMode, "stale-measured");
  assert.equal(factMap(projection).DEPLOYED.result, RESULT.UNKNOWN_NOT_OBSERVED);
  assert.equal(serviceViewStatus(projection), "warning");
});

test("Compact reading keeps unknown later facts visible beside observed runtime", () => {
  const projection = projectServiceView(
    observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, NOW),
    undefined,
    NOW,
  );
  const labels = compactServiceReading(projection.facts, projection.extraGaps).lines
    .map((line) => `${line.label}: ${line.result}`);
  assert.ok(labels.includes("Runtime verification: OBSERVED"));
  assert.ok(labels.includes("Live verification: OBSERVED"));
  assert.ok(labels.includes("Deployment: UNKNOWN / NOT OBSERVED"));
  assert.ok(labels.includes("Expected deployed identity: UNKNOWN / NOT OBSERVED"));
});

test("Public href allowlist accepts api.atlas-systems.uk and rejects host spoofing", () => {
  assert.equal(isPublicSafeHref("https://api.atlas-systems.uk/v1/_meta"), true);
  assert.equal(isPublicSafeHref("https://github.com/AtlasReaper311/atlas-api-public"), true);
  assert.equal(isPublicSafeHref("https://atlas-systems.uk/systems/evidence/"), true);
  assert.equal(isPublicSafeHref("https://api.atlas-systems.uk.evil/v1"), false);
  assert.equal(isPublicSafeHref("https://evil.com/?u=https://api.atlas-systems.uk/v1"), false);
  assert.equal(isPublicSafeHref("https://api.github.com/repos/AtlasReaper311/atlas-api-public"), false);
  assert.equal(isPublicSafeHref("http://api.atlas-systems.uk/v1"), false);
});

test("Service view renderer writes facts without innerHTML and without a healthy gap wash", async () => {
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
    "service-facts", "service-reading", "service-provenance",
    "service-view-status", "source-service-view",
  ]) {
    nodes.set(id, element(id.includes("facts") || id.includes("reading") ? "ol" : "div"));
  }
  globalThis.document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
    createElement: element,
  };
  try {
    const { renderServiceView } = await import("../../systems/evidence/service-view.js");
    const record = observationsFromPublicSources(publicSources(), SERVICE_SPECIMEN, NOW);
    const projection = renderServiceView(record);
    assert.equal(projection.facts.length, 6);
    assert.equal(nodes.get("service-facts").children.length, 6);
    const textOf = (node) => {
      if (!node) return "";
      if (node.children?.length) return node.children.map(textOf).join("");
      return node.textContent ?? "";
    };
    const readingText = nodes.get("service-reading").children.map(textOf).join("\n");
    assert.match(readingText, /Runtime verification: OBSERVED/);
    assert.match(readingText, /Deployment: UNKNOWN \/ NOT OBSERVED/);
    assert.match(readingText, /Expected deployed identity: UNKNOWN \/ NOT OBSERVED/);
    assert.equal(nodes.get("service-view-status").dataset.state, "warning");
    assert.match(nodes.get("source-service-view").textContent, /live public projection/);
    assert.equal(created.some((node) => "innerHTML" in node && node.innerHTML), false);
  } finally {
    delete globalThis.document;
  }
});

test("Evidence Console keeps Phase 2.1 Change View and adds the Service View without secrets", () => {
  const page = read("systems/evidence/index.html");
  const view = read("systems/evidence/service-view.js");
  const projector = read("systems/evidence/service-profile.js");
  const specimen = read("systems/evidence/service-specimen.js");
  const changeView = read("systems/evidence/change-view.js");
  const css = read("static/css/systems-evidence-truthfulness.css");

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
  ]) {
    assert.ok(page.includes(section), `missing ${section}`);
  }
  for (const id of [
    "change-view-title", "change-reading", "change-chain",
    "service-view-title", "service-view-status", "service-reading",
    "service-facts", "service-provenance", "source-service-view",
    "service-profile", "service-expected-path",
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /systems\/evidence\/change-view\.js\?v=20260912-article/);
  assert.match(page, /systems\/evidence\/service-view\.js\?v=20260912-profile/);
  assert.match(page, /systems-evidence-truthfulness\.css\?v=20260912-profile/);
  assert.match(page, /atlas-api-public/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /systems-service-reading-scope/);
  assert.match(css, /min-height: 44px/);

  for (const source of [view, projector, specimen, changeView]) {
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
  assert.match(view, /textContent/);
  assert.match(view, /Promise\.allSettled/);
  assert.match(projector, /status field is ignored/);
  assert.match(specimen, /atlas-api-public/);
});
