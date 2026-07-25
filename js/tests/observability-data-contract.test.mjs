import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildObservedServices,
  deriveCorpusView,
  deriveInfraView,
} from "../../systems/observability/observability.js";

const NOW = Date.parse("2026-07-25T13:00:00.000Z");

const NAMES = [
  "atlas-api-index",
  "atlas-api-public",
  "atlas-blackbox",
  "atlas-dora",
  "atlas-notify",
  "atlas-quota-watch",
  "deploy-watch",
  "github-pulse",
  "ramone-edge",
  "ramone-trigger",
  "site-pulse",
  "specular-edge",
  "specular-sonify",
];

function registryFixture(names = NAMES) {
  return {
    ok: true,
    workers: names.map((name) => ({
      name,
      documented: true,
      version: "1.0.0",
      endpoints: [],
    })),
  };
}

function healthFixture(names = NAMES) {
  return {
    timestamp: "2026-07-25T12:59:30.000Z",
    services: names.map((name) => ({
      name,
      status: name === "specular-edge" ? "degraded" : "healthy",
      health_detail: name === "specular-edge" ? "bounded test warning" : "health contract reports ok",
      evidence_source: `fixture:${name}`,
      measured_at: "2026-07-25T12:59:00.000Z",
      latency_ms: 12,
    })),
  };
}

function topologyFixture(names = NAMES) {
  return {
    components: names.map((name) => ({
      id: name,
      kind: "worker",
      layer: name === "atlas-api-public" || name === "atlas-api-index" ? "public-api" : "observability",
    })),
  };
}

test("public inventory is joined to measured health and topology", () => {
  const view = buildObservedServices(
    registryFixture(),
    healthFixture(),
    topologyFixture(),
  );

  assert.equal(view.totalRegistry, 13);
  assert.equal(view.services.length, 13);
  assert.deepEqual(view.uncovered, []);
  assert.equal(view.currentMeasurements, 13);

  const publicApi = view.services.find((service) => service.name === "atlas-api-public");
  assert.equal(publicApi.layer, "public-api");
  assert.equal(publicApi.state, "healthy");
  assert.equal(publicApi.evidenceSource, "fixture:atlas-api-public");

  const dora = view.services.find((service) => service.name === "atlas-dora");
  assert.equal(dora.state, "healthy");
  assert.equal(dora.layer, "observability");
});

test("inventory entries without a health contract are omitted and reported", () => {
  const healthNames = NAMES.filter((name) => name !== "atlas-dora");
  const view = buildObservedServices(
    registryFixture(),
    healthFixture(healthNames),
    topologyFixture(),
  );

  assert.equal(view.services.length, 12);
  assert.deepEqual(view.uncovered, ["atlas-dora"]);
  assert.equal(view.services.some((service) => service.name === "atlas-dora"), false);
});

test("infra rendering reads components and last_report_at from the real contract", () => {
  const view = deriveInfraView({
    ok: true,
    overall: "down",
    stale: true,
    components: {
      ollama: { ok: false },
      corpus_health: { ok: false },
      corpus_search: { ok: false },
    },
    last_report_at: "2026-07-25T12:30:00.000Z",
  }, NOW);

  assert.equal(view.state, "stale");
  assert.equal(view.checks, 3);
  assert.match(view.detail, /3 local checks/);
  assert.match(view.detail, /report 30m old/);
});

test("cached corpus activity is not promoted to current index health", () => {
  const cached = deriveCorpusView({
    ok: true,
    source: "last-summary",
    queries_last_hour: 0,
    queries_today: 64,
    queries_total: 117,
    last_summary_at: "2026-07-25T12:00:00.000Z",
  }, NOW);

  assert.equal(cached.state, "stale");
  assert.equal(cached.countText, "0 / hour");
  assert.match(cached.detail, /Cached activity summary/);
  assert.match(cached.detail, /does not prove current index health/);

  const live = deriveCorpusView({
    ok: true,
    source: "live",
    queries_last_hour: 2,
    queries_today: 12,
    queries_total: 200,
  }, NOW);
  assert.equal(live.state, "healthy");

  const absent = deriveCorpusView({ ok: true, source: "none" }, NOW);
  assert.equal(absent.state, "unknown");
  assert.match(absent.detail, /No live or cached corpus source/);
});

test("the browser uses health and topology contracts instead of registry status fields", () => {
  const page = readFileSync("systems/observability/index.html", "utf8");
  const script = readFileSync("systems/observability/observability.js", "utf8");
  const endpoints = Object.fromEntries(
    [...script.matchAll(/^\s{2}([a-z]+): "([^"]+)",$/gm)]
      .map((match) => [match[1], match[2]]),
  );

  assert.equal(endpoints.health, "https://api.atlas-systems.uk/sonify");
  assert.equal(endpoints.topology, "https://api.atlas-systems.uk/v1/topology");
  assert.ok(script.includes("health.health_detail"));
  assert.ok(script.includes("topology?.layer"));
  assert.doesNotMatch(script, /entry\?\.(status|state|health)/);
  assert.ok(page.includes("Inventory is not treated as health."));
  assert.ok(page.includes("Health-covered services"));
  assert.ok(page.includes("observability.js?v=20260725-observability-contracts"));
});
