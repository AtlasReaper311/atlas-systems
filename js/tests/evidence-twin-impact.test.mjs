import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  TWIN_IMPACT_ENDPOINT,
  isValidTwinImpactProjection,
  renderTwinImpactProjection,
  renderTwinImpactUnavailable,
} from "../../systems/evidence/twin-impact.js";

const LIMITATIONS = [
  "could-be-affected-only",
  "no-merge-approval",
  "no-deployment-claim",
  "no-runtime-claim",
  "no-live-claim",
  "no-publication-claim",
  "no-failure-claim",
  "no-estate-completeness-claim",
  "private-or-unclassified-evidence-may-be-unknown",
];

function projection(overrides = {}) {
  const base = {
    schema_version: "atlas-control-plane/twin-impact-projection/v1",
    projection_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    generated_at: "2026-09-12T22:42:15Z",
    subject: {
      visibility: "public",
      repository: "AtlasReaper311/atlas-api-public",
      base_oid: "1111111111111111111111111111111111111111",
      head_oid: "2222222222222222222222222222222222222222",
    },
    impact: {
      conclusion: "could-be-affected",
      scope: "public-only",
      coverage: "known-public-scope",
      relationships: [
        {
          kind: "repository",
          id: "AtlasReaper311/atlas-api-public",
          relation: "changed",
          evidence_class: "twin-impact",
          identity_authority: "atlas-infra-public-classification",
        },
        {
          kind: "component",
          id: "atlas-systems",
          relation: "direct-consumer",
          evidence_class: "twin-impact",
          identity_authority: "atlas-api-public-topology-exporter",
        },
      ],
      unknowns: [],
    },
    analysis: {
      mode: "offline-twin-analysis",
      passport_schema_version: "atlas-change-passport/v1",
      passport_request_fingerprint: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      passport_generated_at: "2026-09-12T22:40:00Z",
    },
    provenance: {
      producer_id: "atlas-twin",
      producer_version: "1.1.0",
      producer_contract: "atlas-change-passport/v1",
      authority_repository: "AtlasReaper311/atlas-infra",
      authority_commit: "3333333333333333333333333333333333333333",
      classification_source: {
        repository: "AtlasReaper311/atlas-infra",
        path: "policy/public-repository-classifications.json",
        fingerprint: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      topology_source: {
        repository: "AtlasReaper311/atlas-api-public",
        path: "data/estate.manifest.json",
        commit: "4444444444444444444444444444444444444444",
      },
      projection_policy: "ADR-0017",
    },
    distribution: {
      mode: "static-public-projection",
      serving_repository: "AtlasReaper311/atlas-api-public",
      path: "data/twin-impact-projection.json",
      route: "/v1/evidence/twin-impact",
    },
    privacy: {
      mode: "public-safe",
      redaction: "drop-private-or-unclassified",
      public_identities_only: true,
      private_data_excluded: true,
      unknown_data_not_inferred: true,
    },
    limitations: LIMITATIONS,
  };
  return structuredClone({ ...base, ...overrides });
}

function fakeDom() {
  const created = [];
  const nodes = new Map();
  function element(tagName) {
    const node = {
      tagName: tagName.toUpperCase(),
      className: "",
      textContent: "",
      hidden: false,
      dataset: {},
      children: [],
      append(...items) { this.children.push(...items); },
      appendChild(item) { this.children.push(item); return item; },
      replaceChildren(...items) { this.children = [...items]; },
    };
    created.push(node);
    return node;
  }
  nodes.set("twin-impact-content", element("div"));
  nodes.set("twin-impact-status", element("p"));
  nodes.set("twin-impact-fallback", element("details"));
  return {
    created,
    nodes,
    document: {
      getElementById(id) { return nodes.get(id) ?? null; },
      createElement: element,
    },
  };
}

function textOf(node) {
  return `${node.textContent ?? ""}${(node.children ?? []).map(textOf).join("")}`;
}

test("valid Twin projection preserves public impact semantics and authorities", () => {
  const value = projection();
  assert.equal(isValidTwinImpactProjection(value), true);
  assert.equal(value.impact.conclusion, "could-be-affected");
  assert.equal(value.impact.scope, "public-only");
  assert.equal(value.impact.coverage, "known-public-scope");
  assert.deepEqual(value.impact.unknowns, []);
  assert.equal(value.impact.relationships[0].identity_authority, "atlas-infra-public-classification");
  assert.equal(value.impact.relationships[1].identity_authority, "atlas-api-public-topology-exporter");
  assert.equal(TWIN_IMPACT_ENDPOINT, "https://api.atlas-systems.uk/v1/evidence/twin-impact");
});

test("partial and unknown public coverage require explicit unknowns", () => {
  const partial = projection({
    impact: {
      ...projection().impact,
      coverage: "partial-public-scope",
      unknowns: ["private-or-unclassified-evidence"],
    },
  });
  assert.equal(isValidTwinImpactProjection(partial), true);

  const unknown = projection({
    subject: { visibility: "private-or-unknown", repository: null, base_oid: null, head_oid: null },
    impact: {
      ...projection().impact,
      coverage: "unknown",
      relationships: [],
      unknowns: ["private-or-unknown-subject"],
    },
  });
  assert.equal(isValidTwinImpactProjection(unknown), true);
});

test("invalid and lifecycle-strengthening projections fail closed", () => {
  const invalidConclusion = projection({ impact: { ...projection().impact, conclusion: "was-affected" } });
  assert.equal(isValidTwinImpactProjection(invalidConclusion), false);

  const wrongAuthority = projection({
    impact: {
      ...projection().impact,
      relationships: [{ ...projection().impact.relationships[0], identity_authority: "atlas-twin" }],
    },
  });
  assert.equal(isValidTwinImpactProjection(wrongAuthority), false);

  const privateSubjectWithPublicIds = projection({
    subject: {
      visibility: "private-or-unknown",
      repository: "AtlasReaper311/atlas-twin",
      base_oid: "1111111111111111111111111111111111111111",
      head_oid: "2222222222222222222222222222222222222222",
    },
  });
  assert.equal(isValidTwinImpactProjection(privateSubjectWithPublicIds), false);

  const relationshipMembershipIsAuthorityOwned = projection({
    impact: {
      ...projection().impact,
      relationships: [{ ...projection().impact.relationships[0], id: "AtlasReaper311/atlas-twin" }],
    },
  });
  assert.equal(isValidTwinImpactProjection(relationshipMembershipIsAuthorityOwned), true, "membership proof belongs to the named public authority");

  const forbiddenField = projection({ deployment: "live" });
  assert.equal(isValidTwinImpactProjection(forbiddenField), false);
});

test("valid rendering is impact-only, text-safe, and not green status", () => {
  const dom = fakeDom();
  const previousDocument = globalThis.document;
  globalThis.document = dom.document;
  try {
    assert.equal(renderTwinImpactProjection(projection()), true);
    const contentText = textOf(dom.nodes.get("twin-impact-content"));
    assert.match(contentText, /could be affected/);
    assert.match(contentText, /Known public scope/);
    assert.match(contentText, /Identity authority/);
    assert.match(contentText, /Projection fingerprint/);
    assert.match(contentText, /not an observation time/);
    assert.match(contentText, /Contract limitations/);
    assert.match(contentText, /no-deployment-claim/);
    assert.match(contentText, /does not establish merge, deployment, runtime, failure, publication, or live state/);
    assert.equal(dom.nodes.get("twin-impact-status").dataset.state, "unknown");
    assert.equal(dom.nodes.get("twin-impact-fallback").hidden, true);
    assert.equal(dom.created.some((node) => "innerHTML" in node), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("unavailable Twin data remains UNKNOWN / NOT OBSERVED rather than FAILED", () => {
  const dom = fakeDom();
  const previousDocument = globalThis.document;
  globalThis.document = dom.document;
  try {
    renderTwinImpactUnavailable("The public projection is unavailable.");
    const text = textOf(dom.nodes.get("twin-impact-content"));
    assert.match(text, /UNKNOWN \/ NOT OBSERVED/);
    assert.match(text, /No relationship or failure is inferred/);
    assert.doesNotMatch(text, /FAILED/);
    assert.equal(dom.nodes.get("twin-impact-status").dataset.state, "unknown");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("Change View keeps Twin inside the existing Console and preserves CSP/API boundaries", () => {
  const page = fs.readFileSync("systems/evidence/index.html", "utf8");
  const source = fs.readFileSync("systems/evidence/twin-impact.js", "utf8");
  const styles = fs.readFileSync("static/css/systems-evidence-truthfulness.css", "utf8");
  const docs = fs.readFileSync("docs/EVIDENCE-CONSOLE.md", "utf8");
  const headers = fs.readFileSync("_headers", "utf8");
  assert.match(page, /id="twin-impact-context"/);
  assert.match(page, /id="view-change"[\s\S]*id="twin-impact-context"/);
  assert.doesNotMatch(page, /data-evidence-view-tab="twin"/);
  assert.match(page, /systems\/evidence\/twin-impact\.js\?v=20260913-phase24/);
  assert.match(source, /const TWIN_IMPACT_ENDPOINT =/);
  assert.equal(TWIN_IMPACT_ENDPOINT, "https://api.atlas-systems.uk/v1/evidence/twin-impact");
  const connectSrc = (headers.match(/Content-Security-Policy:([^\n]*)/)?.[1] ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === "connect-src" || part.startsWith("connect-src "));
  const connectTokens = connectSrc
    ? connectSrc.slice("connect-src".length).trim().split(/\s+/).filter(Boolean)
    : [];
  assert.equal(connectTokens.some((token) => token === new URL(TWIN_IMPACT_ENDPOINT).origin), true);
  assert.match(styles, /systems-evidence-twin-context/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(docs, /Twin impact context/);
  assert.doesNotMatch(source, /\b(?:was affected|is healthy|is live|safe to merge|safe to deploy)\b/i);
});
