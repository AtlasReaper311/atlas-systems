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
const SOURCE = fs.readFileSync(path.join(HERE, "apu-service-leitmotifs.js"), "utf-8");

const SAMPLE_SERVICES = Object.freeze([
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

// ---------------------------------------------------------------------------
// Build metadata and constants
// ---------------------------------------------------------------------------

test("build id and constants are frozen", () => {
  assert.equal(typeof APU_SERVICE_LEITMOTIFS_BUILD_ID, "string");
  assert.ok(APU_SERVICE_LEITMOTIFS_BUILD_ID.length > 0);
  assert.ok(Object.isFrozen(LEITMOTIF_REGISTERS));
  assert.ok(Object.isFrozen(LEITMOTIF_RHYTHMS));
  assert.ok(Object.isFrozen(LEITMOTIF_ROLES));
});

test("state keys cover healthy through recovery", () => {
  assert.deepEqual(
    [...LEITMOTIF_STATE_KEYS],
    ["healthy", "warning", "critical", "unknown", "recovery"],
  );
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("baseLeitmotifFor is deterministic per service name", () => {
  for (const service of SAMPLE_SERVICES) {
    const a = baseLeitmotifFor(service);
    const b = baseLeitmotifFor(service);
    assert.deepEqual(a, b, `${service} base leitmotif is unstable`);
  }
});

test("different services get distinct leitmotifs", () => {
  const keys = SAMPLE_SERVICES.map((service) => {
    const l = baseLeitmotifFor(service);
    return `${l.role}/${l.register}/${l.motifKey}`;
  });
  const unique = new Set(keys);
  // Not every service will differ on every axis, but the tuple across
  // ten services should have meaningful variety.
  assert.ok(unique.size >= 5,
    `expected >= 5 distinct role/register/motif tuples across ten services, got ${unique.size}`);
});

test("leitmotifFor is deterministic across state combinations", () => {
  for (const service of SAMPLE_SERVICES) {
    for (const state of LEITMOTIF_STATE_KEYS) {
      const a = leitmotifFor(service, state);
      const b = leitmotifFor(service, state);
      assert.deepEqual(a, b);
    }
  }
});

test("fnv1a is deterministic and returns non-negative integers", () => {
  for (const text of ["atlas-corpus", "", "unicode: ⚡", "long-".repeat(100)]) {
    const a = fnv1a(text);
    const b = fnv1a(text);
    assert.equal(a, b);
    assert.ok(Number.isInteger(a));
    assert.ok(a >= 0);
  }
});

// ---------------------------------------------------------------------------
// Base leitmotif shape
// ---------------------------------------------------------------------------

test("base leitmotif has all required fields", () => {
  const l = baseLeitmotifFor("atlas-corpus");
  assert.equal(l.service, "atlas-corpus");
  assert.ok(typeof l.role === "string");
  assert.ok(typeof l.register === "string");
  assert.ok(Array.isArray(l.rhythm));
  assert.equal(l.rhythm.length, 8);
  assert.ok(Array.isArray(l.motif));
  assert.equal(l.motif.length, 4);
  assert.ok(typeof l.motifKey === "string");
  assert.ok(typeof l.octaveOffset === "number");
  assert.ok(typeof l.preferredLayer === "string");
  assert.ok(Object.isFrozen(l));
});

test("base motif degrees are finite integers", () => {
  for (const service of SAMPLE_SERVICES) {
    const l = baseLeitmotifFor(service);
    for (const degree of l.motif) {
      assert.ok(Number.isFinite(degree), `${service} degree ${degree} is not finite`);
    }
  }
});

test("preferredLayer matches a known APU role", () => {
  const validLayers = new Set(Object.values(LEITMOTIF_ROLES));
  for (const service of SAMPLE_SERVICES) {
    const l = baseLeitmotifFor(service);
    assert.ok(validLayers.has(l.preferredLayer),
      `${service} preferredLayer ${l.preferredLayer} not in known roles`);
  }
});

// ---------------------------------------------------------------------------
// State mutations
// ---------------------------------------------------------------------------

test("healthy state returns identity mutation with unchanged motif", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const healthy = mutateLeitmotifForState(base, "healthy");
  assert.equal(healthy.mutation, "identity");
  assert.deepEqual([...healthy.motif], [...base.motif]);
});

test("warning tenseShift keeps first and last degrees, shifts interior", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const warning = mutateLeitmotifForState(base, "warning");
  assert.equal(warning.mutation, "tenseShift");
  assert.equal(warning.motif[0], base.motif[0]);
  assert.equal(warning.motif[warning.motif.length - 1], base.motif[base.motif.length - 1]);
  // Interior notes shift up by one
  for (let i = 1; i < base.motif.length - 1; i += 1) {
    assert.equal(warning.motif[i], base.motif[i] + 1);
  }
});

test("critical fragment drops notes deterministically and preserves note 0", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const critical = mutateLeitmotifForState(base, "critical");
  assert.equal(critical.mutation, "fragment");
  assert.equal(critical.motif[0], base.motif[0]);
  const kept = critical.motif.filter((n) => n !== null).length;
  const dropped = critical.motif.length - kept;
  assert.ok(dropped > 0, "critical should drop at least one note");
});

test("unknown sparse keeps only first and last motif notes", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const unknown = mutateLeitmotifForState(base, "unknown");
  assert.equal(unknown.mutation, "sparse");
  assert.equal(unknown.motif[0], base.motif[0]);
  assert.equal(unknown.motif[unknown.motif.length - 1], base.motif[base.motif.length - 1]);
  for (let i = 1; i < unknown.motif.length - 1; i += 1) {
    assert.equal(unknown.motif[i], null);
  }
});

test("recovery resolve lifts the final motif note upward to sound bright", () => {
  const base = baseLeitmotifFor("atlas-corpus");
  const recovery = mutateLeitmotifForState(base, "recovery");
  assert.equal(recovery.mutation, "resolve");
  // Final note lands one octave above tonic so recovery reads as opening
  // regardless of whether the base motif ended low.
  assert.equal(recovery.motif[recovery.motif.length - 1], 7);
});

test("mutation is deterministic across repeated calls", () => {
  for (const service of SAMPLE_SERVICES) {
    for (const state of LEITMOTIF_STATE_KEYS) {
      const a = leitmotifFor(service, state);
      const b = leitmotifFor(service, state);
      assert.deepEqual(a, b);
    }
  }
});

test("mutation across states produces meaningfully different motifs per service", () => {
  const service = "atlas-corpus";
  const shapes = LEITMOTIF_STATE_KEYS.map((state) => {
    const l = leitmotifFor(service, state);
    return JSON.stringify(l.motif);
  });
  const unique = new Set(shapes);
  assert.ok(unique.size >= 4,
    `expected >= 4 distinct motif shapes across states, got ${unique.size}: ${[...unique].join(" | ")}`);
});

test("unknown state falls back for unrecognised state name", () => {
  const l = leitmotifFor("atlas-corpus", "chaotic");
  assert.equal(l.state, "unknown");
});

test("mutateLeitmotifForState throws on missing base", () => {
  assert.throws(() => mutateLeitmotifForState(null, "healthy"), /base required/);
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

test("describeLeitmotif returns a human-readable summary", () => {
  const l = leitmotifFor("atlas-corpus", "warning");
  const desc = describeLeitmotif(l);
  assert.equal(desc.service, "atlas-corpus");
  assert.ok(desc.describe.includes("atlas-corpus"));
  assert.ok(desc.describe.includes(l.role));
  assert.ok(desc.describe.includes(l.register));
  assert.ok(desc.describe.includes(desc.rhythmName));
  assert.ok(desc.describe.includes(l.motifKey));
  assert.equal(desc.mutation, "tenseShift");
});

test("describeLeitmotif handles missing input gracefully", () => {
  const desc = describeLeitmotif(null);
  assert.equal(desc.service, "unknown");
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

test("buildLeitmotifRegistry returns a Map keyed by service name", () => {
  const registry = buildLeitmotifRegistry(SAMPLE_SERVICES, "warning");
  assert.equal(registry.size, SAMPLE_SERVICES.length);
  for (const service of SAMPLE_SERVICES) {
    const l = registry.get(service);
    assert.ok(l, `${service} in registry`);
    assert.equal(l.service, service);
    assert.equal(l.state, "warning");
  }
});

test("buildLeitmotifRegistry ignores empty and non-string entries", () => {
  const registry = buildLeitmotifRegistry(["atlas-corpus", "", null, undefined, 42, "atlas-notify"], "healthy");
  assert.equal(registry.size, 2);
  assert.ok(registry.has("atlas-corpus"));
  assert.ok(registry.has("atlas-notify"));
});

test("buildLeitmotifRegistry handles empty and missing lists", () => {
  assert.equal(buildLeitmotifRegistry([], "healthy").size, 0);
  assert.equal(buildLeitmotifRegistry(undefined, "healthy").size, 0);
});

test("preferredLayerFor returns null for missing service name", () => {
  assert.equal(preferredLayerFor(null), null);
  assert.equal(preferredLayerFor(""), null);
});

test("preferredLayerFor returns a valid role string for known service", () => {
  const layer = preferredLayerFor("atlas-corpus", "healthy");
  const validLayers = new Set(Object.values(LEITMOTIF_ROLES));
  assert.ok(validLayers.has(layer));
});

// ---------------------------------------------------------------------------
// Source-level negative controls
// ---------------------------------------------------------------------------

test("source does not use Math.random or Date.now for variation", () => {
  // Doc comments contain the phrase "no Math.random", so restrict to a
  // code-shape match (call expression or property access outside prose).
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /Math\.random\s*\(/);
  assert.doesNotMatch(codeOnly, /Date\.now\s*\(/);
});

test("source does not import Tone.js or any Web Audio node factory", () => {
  const codeOnly = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /\bfrom\s+["'][^"']*tone/i);
  assert.doesNotMatch(codeOnly, /\bnew\s+Tone\./);
  assert.doesNotMatch(codeOnly, /AudioContext/);
  assert.doesNotMatch(codeOnly, /createOscillator|createBufferSource|createGain\b/);
});

test("source does not reference sample assets", () => {
  assert.doesNotMatch(SOURCE, /\.wav\b/i);
  assert.doesNotMatch(SOURCE, /\.mp3\b/i);
  assert.doesNotMatch(SOURCE, /\.ogg\b/i);
});
