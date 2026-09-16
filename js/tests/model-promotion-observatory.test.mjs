import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAPABILITIES, validateProjection } from "../../systems/model-promotion/model-promotion.js";

const HTML = readFileSync("systems/model-promotion/index.html", "utf8");
const CSS = readFileSync("static/css/systems-model-promotion.css", "utf8");
const SCRIPT = readFileSync("systems/model-promotion/model-promotion.js", "utf8");
const MANIFEST = JSON.parse(readFileSync(".atlas/public-interface.json", "utf8"));
const SITEMAP = readFileSync("sitemap.xml", "utf8");
const SITEMAP_GENERATOR = readFileSync("scripts/generate_sitemap.py", "utf8");

const CURRENT_RECEIPTS = Object.freeze({
  "ramone-rag-generation": {
    fingerprint: "b92b3faa8d75a6869dbf72b0b9cf80c214cba272e23b3a12f859ed32c4deeba5",
    sha256: "506d179ac2d5ad6f6aacb7520e256ff40aed29723b43ad4d9c4c1f1a293bf511",
    result: [3, 3, 0],
  },
  "ramone-live-chat": {
    fingerprint: "9d8d70d7577eb4e307852ca5b552370d02754d5d27205097b1393277a61c074e",
    sha256: "d998eb991e72fbe1853b245186f57e5c1fd32ae12585fbd50a04823c5d53eafd",
    result: [3, 3, 0],
  },
  "corpus-retrieval": {
    fingerprint: "8b6ffc407bc02af7cc01596c99856dba03112c1345d2875feb587fa3c87503aa",
    sha256: "cd4c9576453decf280d566d3138e0d3897aec84457be176049a39b5f5ecf1dc2",
    result: [5, 5, 0],
  },
  "daily-digest-synthesis": {
    fingerprint: "3e1dbfba5a3c9c643791b91b608810651f42212a019962275895f25eba21bdf3",
    sha256: "398668f3979574ada4ffa0fbb0dd0b54399e6acbbb88bce06fc186765fe8c202",
    result: [3, 2, 1],
  },
  "postmortem-drafting": {
    fingerprint: "b049801c77b15a8efccf7a59bac0aaf41bae63f12bd4bb460bf5de662223053f",
    sha256: "efa05f061ccec0ee006a9af4d70a23a5af111bc6d4d7a03c916aa34e23d9f758",
    result: [7, 6, 1],
  },
});

const HISTORICAL_PATH = "systems/model-promotion/evidence/f80ade07d8025fa751f59f8e667fa1adb2905d194fa1f1c90fc316730a94b3c3.json";
const HISTORICAL_SHA256 = "8051066a080dded96f5fd742182a224a95595758a4a8d75a4d505a31ecaeca75";

function receiptFor(capability) {
  const path = `systems/model-promotion/evidence/${capability.fingerprint}.json`;
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const projection = JSON.parse(bytes.toString("utf8"));
  return { bytes, path, projection, sha256 };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the Observatory contains exactly the five accepted current capability identities", () => {
  assert.deepEqual(CAPABILITIES.map(({ id }) => id), [
    "ramone-rag-generation",
    "ramone-live-chat",
    "corpus-retrieval",
    "daily-digest-synthesis",
    "postmortem-drafting",
  ]);
  assert.deepEqual(Object.fromEntries(CAPABILITIES.map(({ id, fingerprint }) => [id, fingerprint])),
    Object.fromEntries(Object.entries(CURRENT_RECEIPTS).map(([id, { fingerprint }]) => [id, fingerprint])));
});

test("all five current receipts keep their transferred bytes, filename identity, and accepted shape", () => {
  for (const capability of CAPABILITIES) {
    const expected = CURRENT_RECEIPTS[capability.id];
    const { projection, sha256 } = receiptFor(capability);
    assert.equal(sha256, expected.sha256, `${capability.id} bytes changed after transfer`);
    assert.equal(projection.projection_fingerprint, `sha256:${expected.fingerprint}`);
    assert.deepEqual(projection.evaluation.result && [
      projection.evaluation.result.case_count,
      projection.evaluation.result.passed_count,
      projection.evaluation.result.failed_count,
    ], expected.result);
    assert.equal(validateProjection(projection, expected.fingerprint, capability.id).ok, true);
  }
});

test("the historical RAG receipt remains byte-identical and is not treated as current promotion evidence", () => {
  const bytes = readFileSync(HISTORICAL_PATH);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), HISTORICAL_SHA256);
  const historical = JSON.parse(bytes.toString("utf8"));
  assert.equal(historical.projection_fingerprint, "sha256:f80ade07d8025fa751f59f8e667fa1adb2905d194fa1f1c90fc316730a94b3c3");
  assert.equal(historical.state, "review-pending");
  assert.equal(historical.promotion.state, "not-approved");
  assert.match(HTML, /Previous receipt · review pending/);
  assert.match(HTML, /Supersession changes the evidence lineage, not deployment or runtime state/);
});

test("the page is capability-first and keeps all five stories in the no-JS document", () => {
  assert.match(HTML, /<h1 class="focus-title">Why this model\.<br>For this capability\.<\/h1>/);
  assert.equal((HTML.match(/data-capability-switch=/g) || []).length, 5);
  assert.equal((HTML.match(/data-capability-receipt=/g) || []).length, 5);
  assert.equal((HTML.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((HTML.match(/aria-pressed="false"/g) || []).length, 4);
  assert.doesNotMatch(HTML, /data-capability-receipt="[^"]+"[^>]* hidden/);
  assert.match(HTML, /JavaScript is disabled, so all five capability receipts remain expanded/);
  assert.match(SCRIPT, /receipt\.hidden = !active/);
});

test("every aggregate has capability, case count, passed result, and threshold context", () => {
  for (const [cases, passed] of Object.values(CURRENT_RECEIPTS).map(({ result }) => result)) {
    assert.match(HTML, new RegExp(`${passed} \/ ${cases} passed`));
    assert.match(HTML, new RegExp(`required threshold ${cases} \/ ${cases}`, "i"));
  }
  assert.doesNotMatch(HTML, />100%<|>66\.67%<|>85\.71%</);
});

test("accepted lifecycle states remain visibly distinct and failed evaluations remain evaluation failures", () => {
  assert.match(HTML, /EVALUATION PASSED/);
  assert.match(HTML, /EVALUATION FAILED/);
  assert.match(HTML, /HUMAN REVIEWED/);
  assert.match(HTML, /HUMAN REVIEW PENDING/);
  assert.match(HTML, /HUMAN REVIEW NOT REQUIRED/);
  assert.match(HTML, /PROMOTION APPROVED/);
  assert.match(HTML, /PROMOTION NOT APPROVED/);
  assert.match(HTML, /not a service failure/);
  assert.match(CSS, /data-trail-state="terminal"/);
});

test("passing evaluation, human review, and promotion remain separate validation gates", () => {
  const rag = clone(receiptFor(CAPABILITIES[0]).projection);
  rag.state = "review-pending";
  rag.human_review = { state: "pending", reviewed_at: null };
  rag.promotion = { state: "not-approved", approved_at: null, supersedes_projection_fingerprint: rag.promotion.supersedes_projection_fingerprint, superseded_by_projection_fingerprint: null };
  assert.equal(validateProjection(rag, CURRENT_RECEIPTS[rag.capability.id].fingerprint, rag.capability.id).ok, true);

  const reviewed = clone(receiptFor(CAPABILITIES[0]).projection);
  reviewed.state = "evaluated-passed";
  reviewed.promotion = { ...reviewed.promotion, state: "not-approved", approved_at: null, superseded_by_projection_fingerprint: null };
  assert.equal(validateProjection(reviewed, CURRENT_RECEIPTS[reviewed.capability.id].fingerprint, reviewed.capability.id).ok, true);

  const approved = receiptFor(CAPABILITIES[0]).projection;
  assert.equal(approved.promotion.state, "approved");
  assert.equal(approved.current_model_observation.state, "not-represented");
  assert.equal(approved.deployment_boundary.deployed, "not-applicable");
  assert.match(HTML, /PROMOTION APPROVED ≠ DEPLOYED/);
  assert.doesNotMatch(HTML, /\bONLINE\b|\bUPTIME\b|>ACTIVE<|current routing is verified/i);
});

test("missing, malformed, incompatible, or incomplete evidence fails closed instead of becoming FAIL", () => {
  const valid = receiptFor(CAPABILITIES[1]).projection;
  assert.equal(validateProjection(null, CAPABILITIES[1].fingerprint, CAPABILITIES[1].id).ok, false);
  assert.equal(validateProjection({ ...clone(valid), unexpected: true }, CAPABILITIES[1].fingerprint, CAPABILITIES[1].id).ok, false);
  assert.equal(validateProjection({ ...clone(valid), model: { public_id: "other-model" } }, CAPABILITIES[1].fingerprint, CAPABILITIES[1].id).ok, false);
  const incomplete = clone(valid);
  incomplete.evaluation.result = null;
  assert.equal(validateProjection(incomplete, CAPABILITIES[1].fingerprint, CAPABILITIES[1].id).ok, false);
  assert.match(SCRIPT, /renderUnavailable/);
  assert.match(HTML, /UNKNOWN \/ UNAVAILABLE evidence/);
});

test("stale evidence remains explicitly stale", () => {
  const stale = clone(receiptFor(CAPABILITIES[0]).projection);
  stale.state = "stale-evidence";
  stale.freshness.state = "stale";
  stale.gaps = [...stale.gaps, "stale-evidence"];
  assert.equal(validateProjection(stale, CAPABILITIES[0].fingerprint, CAPABILITIES[0].id).ok, true);
  assert.match(SCRIPT, /This receipt is not presented as current promotion evidence/);
  assert.match(CSS, /data-state="stale"/);
});

test("selector semantics provide labelled controls, focus movement, and reduced-motion coverage", () => {
  assert.equal((HTML.match(/data-capability-switch=/g) || []).length, 5);
  assert.equal((HTML.match(/aria-controls="receipt-/g) || []).length, 5);
  assert.match(SCRIPT, /ArrowRight/);
  assert.match(SCRIPT, /ArrowLeft/);
  assert.match(SCRIPT, /event\.key === "Home"/);
  assert.match(SCRIPT, /event\.key === "End"/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /prefers-reduced-motion: reduce/);
});

test("the public surface is registered, discoverable, metadata-complete, and linked from Evidence Console", () => {
  const route = "https://atlas-systems.uk/systems/model-promotion/";
  const surface = MANIFEST.surfaces.find((candidate) => candidate.url === route);
  assert.ok(surface);
  assert.equal(surface.source, "systems/model-promotion/index.html");
  assert.equal(surface.kind, "product");
  assert.equal(surface.indexing, "index");
  assert.equal(surface.global_header, true);
  assert.equal(surface.search, true);
  assert.ok(SITEMAP.includes(`<loc>${route}</loc>`));
  assert.match(SITEMAP_GENERATOR, /\("\/systems\/model-promotion\/", "monthly", "0\.7"\)/);
  assert.match(HTML, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/systems\/model-promotion\/">/);
  assert.match(HTML, /og\/model-promotion\.png/);
  assert.match(readFileSync("systems/index.html", "utf8"), /href="\/systems\/model-promotion\/"/);
  assert.match(readFileSync("systems/evidence/index.html", "utf8"), /href="\/systems\/model-promotion\/">Model Promotion Observatory/);
});

test("static output contains only public-safe projection language and no runtime or private evidence material", () => {
  const output = `${HTML}\n${SCRIPT}`;
  for (const forbidden of ["eval-harness", "chain-of-thought", "raw answer", "127.0.0.1", "localhost", "C:\\\\", "L:\\\\", "private/evidence", "api.atlas-systems.uk"]) {
    assert.equal(output.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.match(HTML, /public-safe projection/i);
  assert.match(HTML, /Runtime model identity[\s\S]*Not represented in this receipt/);
  assert.match(HTML, /PROMOTION APPROVED ≠ DEPLOYED/);
});
