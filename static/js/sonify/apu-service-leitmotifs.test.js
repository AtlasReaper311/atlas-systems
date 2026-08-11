import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APU_SERVICE_LEITMOTIFS_BUILD_ID,
  LEITMOTIF_REGISTERS,
  LEITMOTIF_RHYTHMS,
  LEITMOTIF_ROLES,
  LEITMOTIF_STATE_KEYS,
  baseLeitmotifFor,
  buildLeitmotifRegistry,
  describeLeitmotif,
  fnv1a,
  leitmotifFor,
  mutateLeitmotifForState,
  preferredLayerFor,
} from "./apu-service-leitmotifs.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, "apu-service-leitmotifs.js"), "utf8");

const SERVICES = Object.freeze([
  "atlas-corpus",
  "ramone-memory",
  "atlas-notify",
  "atlas-api-public",
  "atlas-api-index",
  "specular-telemetry",
  "specular-edge",
  "atlas-blackbox",
  "atlas-dora",
  "site-pulse",
]);

test("metadata and constants are stable", () => {
  assert.match(APU_SERVICE_LEITMOTIFS_BUILD_ID, /^20260727-/);
  assert.deepEqual(
    [...LEITMOTIF_STATE_KEYS],
    ["healthy", "warning", "critical", "unknown", "recovery"],
  );
  assert.ok(Object.isFrozen(LEITMOTIF_REGISTERS));
  assert.ok(Object.isFrozen(LEITMOTIF_RHYTHMS));
  assert.ok(Object.isFrozen(LEITMOTIF_ROLES));
});

test("hashing is deterministic and non-negative", () => {
  for (const value of ["atlas-corpus", "", "unicode: ⚡", "long-".repeat(20)]) {
    assert.equal(fnv1a(value), fnv1a(value));
    assert.ok(Number.isInteger(fnv1a(value)));
    assert.ok(fnv1a(value) >= 0);
  }
});

for (const service of SERVICES) {
  test(`${service} receives a deterministic frozen base motif`, () => {
    const first = baseLeitmotifFor(service);
    const second = baseLeitmotifFor(service);
    assert.deepEqual(first, second);
    assert.equal(first.service, service);
    assert.equal(first.motif.length, 4);
    assert.equal(first.rhythm.length, 8);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.motif));
    assert.ok(Object.isFrozen(first.rhythm));
    assert.ok(Object.values(LEITMOTIF_ROLES).includes(first.preferredLayer));
  });
}

test("service set contains meaningful motif diversity", () => {
  const identities = new Set(
    SERVICES.map((service) => {
      const motif = baseLeitmotifFor(service);
      return `${motif.role}/${motif.register}/${motif.motifKey}`;
    }),
  );
  assert.ok(identities.size >= 5);
});

test("healthy mutation preserves motif and rhythm", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const healthy = mutateLeitmotifForState(base, "healthy");
  assert.equal(healthy.mutation, "identity");
  assert.deepEqual(healthy.motif, base.motif);
  assert.deepEqual(healthy.rhythm, base.rhythm);
});

test("warning raises only interior notes", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const warning = mutateLeitmotifForState(base, "warning");
  assert.equal(warning.motif[0], base.motif[0]);
  assert.equal(warning.motif.at(-1), base.motif.at(-1));
  for (let index = 1; index < base.motif.length - 1; index += 1) {
    assert.equal(warning.motif[index], base.motif[index] + 1);
  }
});

test("critical keeps the head and one interior note", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const critical = mutateLeitmotifForState(base, "critical");
  assert.equal(critical.mutation, "fragment");
  assert.equal(critical.motif[0], base.motif[0]);
  assert.equal(critical.motif.filter((note) => note !== null).length, 2);
  assert.ok(critical.rhythm.some(Boolean));
});

test("critical answer rhythms never collapse to silence", () => {
  const base = baseLeitmotifFor("atlas-notify");
  assert.equal(base.role, "counter");
  assert.equal(base.rhythm[0], 0);
  const critical = mutateLeitmotifForState(base, "critical");
  assert.equal(critical.rhythm[2], 1);
  assert.equal(critical.rhythm.filter(Boolean).length, 1);
});

test("unknown preserves only outer motif notes", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const unknown = mutateLeitmotifForState(base, "unknown");
  assert.equal(unknown.mutation, "sparse");
  assert.equal(unknown.motif[0], base.motif[0]);
  assert.equal(unknown.motif.at(-1), base.motif.at(-1));
  assert.equal(unknown.motif[1], null);
  assert.equal(unknown.motif[2], null);
});

test("recovery rises to the upper tonic", () => {
  const recovery = leitmotifFor("atlas-corpus", "recovery");
  assert.equal(recovery.mutation, "resolve");
  assert.equal(recovery.motif.at(-1), 7);
});

test("unrecognised states fail closed to unknown", () => {
  const motif = leitmotifFor("atlas-corpus", "broken");
  assert.equal(motif.state, "unknown");
  assert.equal(motif.mutation, "sparse");
});

test("mutations remain deterministic across services and states", () => {
  for (const service of SERVICES) {
    for (const state of LEITMOTIF_STATE_KEYS) {
      assert.deepEqual(
        leitmotifFor(service, state),
        leitmotifFor(service, state),
      );
    }
  }
});

test("state family produces distinct motif shapes", () => {
  const shapes = new Set(
    LEITMOTIF_STATE_KEYS.map(
      (state) => JSON.stringify(leitmotifFor("atlas-corpus", state).motif),
    ),
  );
  assert.ok(shapes.size >= 4);
});

test("mutation rejects a missing base motif", () => {
  assert.throws(
    () => mutateLeitmotifForState(null, "healthy"),
    /base required/,
  );
});

test("description exposes provenance", () => {
  const motif = leitmotifFor("atlas-corpus", "warning");
  const description = describeLeitmotif(motif);
  assert.equal(description.service, "atlas-corpus");
  assert.equal(description.mutation, "tenseShift");
  assert.ok(description.describe.includes("atlas-corpus"));
  assert.ok(description.describe.includes(motif.role));
  assert.ok(description.describe.includes(motif.motifKey));
});

test("missing description returns a complete unknown shape", () => {
  assert.deepEqual(describeLeitmotif(null), {
    service: "unknown",
    role: "unknown",
    register: "unknown",
    rhythmName: "unknown",
    motifKey: "unknown",
    mutation: "unknown",
    describe: "no leitmotif",
  });
});

test("registry filters invalid services and applies state", () => {
  const registry = buildLeitmotifRegistry(
    ["atlas-corpus", "", null, 42, "atlas-notify"],
    "warning",
  );
  assert.equal(registry.size, 2);
  assert.equal(registry.get("atlas-corpus").state, "warning");
  assert.equal(registry.get("atlas-notify").state, "warning");
});

test("empty registry inputs remain empty", () => {
  assert.equal(buildLeitmotifRegistry([], "healthy").size, 0);
  assert.equal(buildLeitmotifRegistry(undefined, "healthy").size, 0);
});

test("preferred layers are valid and missing names return null", () => {
  assert.equal(preferredLayerFor(""), null);
  assert.equal(preferredLayerFor(null), null);
  assert.ok(
    Object.values(LEITMOTIF_ROLES).includes(
      preferredLayerFor("atlas-corpus", "critical"),
    ),
  );
});

test("source remains pure, deterministic, and sample-free", () => {
  assert.doesNotMatch(SOURCE, /Math\.random|Date\.now/);
  assert.doesNotMatch(SOURCE, /AudioContext|createOscillator|createBufferSource/);
  assert.doesNotMatch(SOURCE, /\bTone\./);
  assert.doesNotMatch(SOURCE, /\.(?:wav|mp3|ogg)\b/i);
});
