import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODES,
  RING_ORDER,
  SNAPSHOT,
  summarise,
} from "../speculum/topology.js";

const html = readFileSync(new URL("../speculum/index.html", import.meta.url), "utf8");
const bootSource = readFileSync(new URL("../speculum/speculum.js", import.meta.url), "utf8");

const byId = new Map(NODES.map((entry) => [entry.id, entry]));

function createCanvasStub() {
  const noop = () => {};
  const context = new Proxy({}, {
    get: (_, key) => {
      if (key === "createRadialGradient") return () => ({ addColorStop: noop });
      return noop;
    },
    set: () => true,
  });

  return {
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1100, height: 720, left: 0, top: 0 }),
  };
}

test("Speculum publishes a dated public-only snapshot", () => {
  assert.equal(SNAPSHOT.reviewedAt, "2026-07-27");
  assert.equal(SNAPSHOT.scope, "public projection only");
  assert.match(SNAPSHOT.classificationAuthority, /atlas-infra/);
  assert.match(SNAPSHOT.topologyAuthority, /atlas-api-public/);

  const serialized = JSON.stringify(NODES);
  for (const privateIdentity of [
    "atlas-vault",
    "atlas-watch",
    "atlas-eval-harness",
    "atlas-postmortem",
    "atlas-article-gen",
    "atlas-scheduler",
    "simple-proxy",
    "atlas-cv",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(privateIdentity));
  }
});

test("topology identifiers and relationships close over the public node set", () => {
  assert.equal(byId.size, NODES.length, "node identifiers must be unique");

  const ordered = new Set(["atlas-systems"]);
  for (const [ring, ids] of Object.entries(RING_ORDER)) {
    for (const id of ids) {
      assert.equal(byId.has(id), true, `${id} must exist`);
      assert.equal(byId.get(id).ring, Number(ring), `${id} must be in its declared ring`);
      assert.equal(ordered.has(id), false, `${id} must appear once in ring order`);
      ordered.add(id);
    }
  }
  assert.equal(ordered.size, NODES.length, "every node must be placed exactly once");

  for (const entry of NODES) {
    for (const target of [...entry.watches, ...entry.reports]) {
      assert.equal(byId.has(target), true, `${entry.id} references missing node ${target}`);
    }
  }
});

test("reviewed periodic cadences match current repository declarations", () => {
  const expected = {
    "atlas-api-public": 600,
    "atlas-api-index": 3600,
    "site-pulse": 86400,
    "deploy-watch": 300,
    "atlas-quota-watch": 86400,
    "atlas-daily-digest": 86400,
    "specular-telemetry": 30,
    "specular-sentinel": 300,
    "atlas-journey-watch": 21600,
    "atlas-dep-audit": 604800,
    "atlas-resource-audit": 604800,
  };

  const emitters = NODES.filter((entry) => entry.cadence > 0);
  assert.equal(emitters.length, Object.keys(expected).length);
  for (const [id, cadence] of Object.entries(expected)) {
    const entry = byId.get(id);
    assert.equal(entry.cadence, cadence, id);
    assert.equal(entry.verified, true, id);
    assert.equal(typeof entry.source, "string", id);
    assert.ok(entry.source.length > 20, id);
  }

  assert.equal(byId.get("github-pulse").cadence, 0, "cache TTL is not a schedule");
  assert.equal(byId.get("atlas-dora").cadence, 0, "request computation is not a schedule");
  assert.equal(byId.get("atlas-gardener").cadence, 0, "manual remediation is not a schedule");
  assert.equal(summarise(NODES).assumed, 0);
});

test("compressed frames preserve every complete sweep", async () => {
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};

  const { createEngine } = await import("../speculum/engine.js");
  const engine = createEngine(createCanvasStub(), NODES, RING_ORDER);
  engine.layout();

  const fired = new Map();
  engine.on("observation", (source, target) => {
    const key = `${source.id}->${target.id}`;
    fired.set(key, (fired.get(key) || 0) + 1);
  });

  const simulatedSeconds = 14 * 24 * 60 * 60;
  const speed = 3600;
  const dt = 1 / 60;
  engine.setSpeed(speed);

  const frames = Math.round(simulatedSeconds / speed / dt);
  for (let frame = 0; frame < frames; frame += 1) engine.advance(dt);

  for (const entry of NODES.filter((candidate) => candidate.cadence > 0)) {
    const expected = simulatedSeconds / entry.cadence;
    for (const target of entry.watches) {
      const actual = fired.get(`${entry.id}->${target}`) || 0;
      assert.ok(actual > 0, `${entry.id} must observe ${target}`);
      assert.ok(
        Math.abs(actual - expected) <= 1.5,
        `${entry.id}->${target} fired ${actual}; expected approximately ${expected}`,
      );
    }
  }
});

test("route uses local assets and states its evidence boundary", () => {
  assert.match(html, /<title>Speculum \/\/ Atlas Systems<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/lab\/speculum\/">/);
  assert.match(html, /\/static\/vendor\/atlas-interface\/v0\.2\.0\/atlas-fonts\.css/);
  assert.match(html, /\/lab\/speculum\/speculum\.css/);
  assert.match(html, /\/lab\/speculum\/speculum\.js/);
  assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(html, /reviewed public snapshot/i);
  assert.match(html, /Private repository identities and private relationships are absent\./);
  assert.match(html, /This is not a live\s+health surface/);
  assert.doesNotMatch(html, /forty-eight|48 nodes/i);
});

test("mount lifecycle removes timers, listeners, observers, and engine subscriptions", () => {
  assert.match(bootSource, /new AbortController\(\)/);
  assert.match(bootSource, /controller\.abort\(\)/);
  assert.match(bootSource, /unsubscribeObservation\(\)/);
  assert.match(bootSource, /clearInterval\(readoutTimer\)/);
  assert.match(bootSource, /clearInterval\(detailTimer\)/);
  assert.match(bootSource, /ro\.disconnect\(\)/);
  assert.match(bootSource, /io\.disconnect\(\)/);
});
