import assert from "node:assert/strict";
import test from "node:test";

import {
  filterServices,
  normalizeTraceDetail,
  normalizeTraceIndex,
  topologyLabel,
} from "../proof-chain/proof-chain-model.mjs";

const NODE_A = `node:sha256:${"a".repeat(64)}`;
const NODE_B = `node:sha256:${"b".repeat(64)}`;
const NODE_C = `node:sha256:${"c".repeat(64)}`;
const EDGE_A = `edge:sha256:${"d".repeat(64)}`;
const EDGE_B = `edge:sha256:${"e".repeat(64)}`;

function indexFixture() {
  return {
    schema: "atlas-public-trace-index/v1",
    authority: "AtlasReaper311/atlas-infra",
    classification_fingerprint: `sha256:${"f".repeat(64)}`,
    live_topology: {
      state: "unavailable",
      producer: "atlas-resource-audit",
      reason: "live evidence not published",
    },
    services: [
      {
        service_id: "specular-edge",
        repository: "AtlasReaper311/specular-telemetry",
        kind: "worker",
        lifecycle: "production",
        governance_count: 0,
        proof_chain: "/v1/trace/services/specular-edge",
      },
      {
        service_id: "atlas-api-public",
        repository: "AtlasReaper311/atlas-api-public",
        kind: "worker",
        lifecycle: "production",
        governance_count: 2,
        proof_chain: "/v1/trace/services/atlas-api-public",
      },
      {
        service_id: "not valid!",
        repository: "private/repository",
        governance_count: 100,
      },
    ],
  };
}

function detailFixture() {
  return {
    schema: "atlas-public-trace-service/v1",
    subject: {
      service_id: "atlas-api-public",
      repository: "AtlasReaper311/atlas-api-public",
      kind: "worker",
      layer: "public-api",
      lifecycle: "production",
      public_surface: "https://api.atlas-systems.uk/v1",
      metadata_url: "https://api.atlas-systems.uk/v1/_meta",
    },
    graph: {
      nodes: [
        {
          node_id: NODE_A,
          kind: "repository",
          identity: {
            key: "AtlasReaper311/atlas-api-public",
            repository: "AtlasReaper311/atlas-api-public",
          },
          evidence_state: "verified",
          evidence: [],
        },
        {
          node_id: NODE_B,
          kind: "service",
          identity: {
            key: "service:atlas-api-public",
            repository: "AtlasReaper311/atlas-api-public",
            service_id: "atlas-api-public",
          },
          evidence_state: "verified",
          evidence: [],
        },
        {
          node_id: NODE_C,
          kind: "adr",
          identity: {
            key: "adr:ADR-0003",
            external_id: "ADR-0003",
          },
          evidence_state: "verified",
          evidence: [],
        },
        {
          node_id: `node:sha256:${"9".repeat(64)}`,
          kind: "model",
          identity: { key: "model:private" },
          evidence_state: "verified",
          evidence: [],
        },
      ],
      edges: [
        {
          edge_id: EDGE_A,
          from_node: NODE_A,
          relation: "SOURCE_OF",
          to_node: NODE_B,
          basis: { rationale: "exact public source identity" },
          evidence: [],
        },
        {
          edge_id: EDGE_B,
          from_node: NODE_B,
          relation: "GOVERNED_BY",
          to_node: NODE_C,
          basis: { rationale: "accepted ADR scope" },
          evidence: [],
        },
        {
          edge_id: `edge:sha256:${"8".repeat(64)}`,
          from_node: NODE_B,
          relation: "DEPENDS_ON",
          to_node: NODE_C,
          basis: { rationale: "must not render" },
          evidence: [],
        },
      ],
    },
    live_topology: {
      state: "unavailable",
      producer: "atlas-resource-audit",
      reason: "sanitized observation not published",
    },
    sources: {
      classification: "https://example.invalid/classification",
    },
  };
}

test("Trace index keeps only valid bounded public identifiers", () => {
  const result = normalizeTraceIndex(indexFixture());
  assert.deepEqual(
    result.services.map((service) => service.serviceId),
    ["atlas-api-public", "specular-edge"],
  );
  assert.equal(result.services[0].governanceCount, 2);
  assert.equal(topologyLabel(result.liveTopology), "unavailable");
});

test("service filter matches service or repository without changing source order", () => {
  const services = normalizeTraceIndex(indexFixture()).services;
  assert.deepEqual(
    filterServices(services, "specular").map((service) => service.serviceId),
    ["specular-edge"],
  );
  assert.deepEqual(
    filterServices(services, "atlasreaper311/atlas-api-public").map(
      (service) => service.serviceId,
    ),
    ["atlas-api-public"],
  );
});

test("Trace detail requires verified repository to service proof", () => {
  const result = normalizeTraceDetail(detailFixture());
  assert.equal(result.repositoryNode.kind, "repository");
  assert.equal(result.serviceNode.serviceId, "atlas-api-public");
  assert.equal(result.sourceEdge.relation, "SOURCE_OF");
  assert.equal(result.governance.length, 1);
  assert.equal(result.governance[0].node.externalId, "ADR-0003");
});

test("unbounded relation and node kinds are ignored", () => {
  const result = normalizeTraceDetail(detailFixture());
  assert.equal(result.governance.length, 1);
  assert.ok(!result.governance.some((item) => item.edge.relation === "DEPENDS_ON"));
});

test("missing source proof fails closed", () => {
  const fixture = detailFixture();
  fixture.graph.edges = fixture.graph.edges.filter(
    (edge) => edge.relation !== "SOURCE_OF",
  );
  assert.throws(
    () => normalizeTraceDetail(fixture),
    /missing its SOURCE_OF proof/,
  );
});

test("unsupported Trace document versions fail closed", () => {
  assert.throws(
    () => normalizeTraceIndex({ ...indexFixture(), schema: "atlas-public-trace-index/v2" }),
    /unsupported public Trace index/,
  );
  assert.throws(
    () => normalizeTraceDetail({ ...detailFixture(), schema: "atlas-public-trace-service/v2" }),
    /unsupported public Trace service document/,
  );
});
