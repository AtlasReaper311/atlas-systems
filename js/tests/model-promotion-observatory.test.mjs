import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  CAPABILITIES,
  COMPARISON_CANDIDATES,
  candidateFor,
  validateCandidateProjection,
  validateProjection,
} from "../../systems/model-promotion/model-promotion.js";

const HTML = readFileSync("systems/model-promotion/index.html", "utf8");
const CSS = readFileSync("static/css/systems-model-promotion.css", "utf8");
const SCRIPT = readFileSync("systems/model-promotion/model-promotion.js", "utf8");
const EVIDENCE_DIR = "systems/model-promotion/evidence";
const EVIDENCE_FILES = readdirSync(EVIDENCE_DIR).filter((name) => name.endsWith(".json")).sort();
const MANIFEST = JSON.parse(readFileSync(".atlas/public-interface.json", "utf8"));
const SITEMAP = readFileSync("sitemap.xml", "utf8");
const SITEMAP_GENERATOR = readFileSync("scripts/generate_sitemap.py", "utf8");

const EXPECTED_FINGERPRINTS = Object.freeze({
  "qwen3.5-mtp": {
    "ramone-rag-generation": "b92b3faa8d75a6869dbf72b0b9cf80c214cba272e23b3a12f859ed32c4deeba5",
    "ramone-live-chat": "9d8d70d7577eb4e307852ca5b552370d02754d5d27205097b1393277a61c074e",
    "corpus-retrieval": "8b6ffc407bc02af7cc01596c99856dba03112c1345d2875feb587fa3c87503aa",
    "daily-digest-synthesis": "3e1dbfba5a3c9c643791b91b608810651f42212a019962275895f25eba21bdf3",
    "postmortem-drafting": "b049801c77b15a8efccf7a59bac0aaf41bae63f12bd4bb460bf5de662223053f",
  },
  "qwen3:14b": {
    "ramone-rag-generation": "78eac8ff3e2e0aedc4ad6c8442c9d17d2d73890f06e914481d6d4e577ed9d83f",
    "ramone-live-chat": "ae8fd23f04ae11f8d617aabc981a955180384e06f901d090bf64d7eed799e665",
    "corpus-retrieval": "79c2b00ce3c3ab2c6759481f63b1a3bf9b6eef1194bd72d715f0b40a318d79c3",
    "daily-digest-synthesis": "9756936d47899afab0a2718ef4eb34d2a0239cb56da3675ad19a368e1950cb14",
    "postmortem-drafting": "acfce7f868020a9c0b633b92494f1825bcd52f2eddb1f429481da56ecf69837a",
  },
});

const EXPECTED_BYTES = Object.freeze({
  "b92b3faa8d75a6869dbf72b0b9cf80c214cba272e23b3a12f859ed32c4deeba5": "506d179ac2d5ad6f6aacb7520e256ff40aed29723b43ad4d9c4c1f1a293bf511",
  "9d8d70d7577eb4e307852ca5b552370d02754d5d27205097b1393277a61c074e": "d998eb991e72fbe1853b245186f57e5c1fd32ae12585fbd50a04823c5d53eafd",
  "8b6ffc407bc02af7cc01596c99856dba03112c1345d2875feb587fa3c87503aa": "cd4c9576453decf280d566d3138e0d3897aec84457be176049a39b5f5ecf1dc2",
  "3e1dbfba5a3c9c643791b91b608810651f42212a019962275895f25eba21bdf3": "398668f3979574ada4ffa0fbb0dd0b54399e6acbbb88bce06fc186765fe8c202",
  "b049801c77b15a8efccf7a59bac0aaf41bae63f12bd4bb460bf5de662223053f": "efa05f061ccec0ee006a9af4d70a23a5af111bc6d4d7a03c916aa34e23d9f758",
  "78eac8ff3e2e0aedc4ad6c8442c9d17d2d73890f06e914481d6d4e577ed9d83f": "ae6bf03e29474753302ecf6043267982b0be738a92de7318987a5ea42434583d",
  "ae8fd23f04ae11f8d617aabc981a955180384e06f901d090bf64d7eed799e665": "588e4340037eedaabcc2a2946c17effd737a95b116cf32ae54ae74634eb5b394",
  "79c2b00ce3c3ab2c6759481f63b1a3bf9b6eef1194bd72d715f0b40a318d79c3": "cf7ed65898b9751e80b627e74bba3f6e3e77a5a203dad6f89c312220212ecffe",
  "9756936d47899afab0a2718ef4eb34d2a0239cb56da3675ad19a368e1950cb14": "39e3e368c953120b99bbb1d5d52150b3c598d38469b66ec8de7a8624f8d07d9a",
  "acfce7f868020a9c0b633b92494f1825bcd52f2eddb1f429481da56ecf69837a": "f55f83d1b02fea1c46dc88ad73c08b774bcf075a7b08bcbae37264295bc430e8",
});

const HISTORICAL_PATH = "systems/model-promotion/evidence/f80ade07d8025fa751f59f8e667fa1adb2905d194fa1f1c90fc316730a94b3c3.json";
const HISTORICAL_SHA256 = "8051066a080dded96f5fd742182a224a95595758a4a8d75a4d505a31ecaeca75";

function projectionFor(capability, model) {
  const candidate = candidateFor(capability, model);
  const path = `systems/model-promotion/evidence/${candidate.fingerprint}.json`;
  return { candidate, path, projection: JSON.parse(readFileSync(path, "utf8")) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function articleFor(model, capability) {
  const marker = `data-candidate-certificate="${model}" data-capability-id="${capability}"`;
  const start = HTML.indexOf(marker);
  assert.notEqual(start, -1, `${model} ${capability} certificate is present`);
  const end = HTML.indexOf("</article>", start);
  return HTML.slice(start, end);
}

test("five capabilities each bind exactly two supported comparison candidates", () => {
  assert.deepEqual(COMPARISON_CANDIDATES, ["qwen3.5-mtp", "qwen3:14b"]);
  assert.equal(CAPABILITIES.length, 5);
  for (const capability of CAPABILITIES) {
    assert.deepEqual(Object.keys(capability.candidates).sort(), ["qwen3.5-mtp", "qwen3:14b"]);
    for (const model of COMPARISON_CANDIDATES) {
      assert.equal(candidateFor(capability, model).model, model);
      assert.equal(candidateFor(capability, model).fingerprint, EXPECTED_FINGERPRINTS[model][capability.id]);
    }
  }
  assert.equal((HTML.match(/data-capability-comparison=/g) || []).length, 5);
  assert.equal((HTML.match(/data-candidate-certificate=/g) || []).length, 10);
});

test("all ten current public receipts pin filename, projection fingerprint, bytes, capability, and candidate identity", () => {
  for (const capability of CAPABILITIES) {
    for (const model of COMPARISON_CANDIDATES) {
      const { candidate, path, projection } = projectionFor(capability, model);
      const bytes = readFileSync(path);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      assert.equal(sha256, EXPECTED_BYTES[candidate.fingerprint], `${model} ${capability.id} bytes changed`);
      assert.equal(projection.projection_fingerprint, `sha256:${candidate.fingerprint}`);
      assert.equal(validateCandidateProjection(projection, capability, model).ok, true);
    }
  }
});

test("unsupported identities, cross-capability receipts, wrong fingerprints, unknown fields, and malformed counts fail closed", () => {
  const capability = CAPABILITIES[0];
  const valid = projectionFor(capability, "qwen3:14b").projection;
  assert.equal(validateProjection(null, capability.candidates["qwen3:14b"].fingerprint, capability.id, "qwen3:14b").ok, false);
  assert.equal(validateCandidateProjection({ ...clone(valid), extra: true }, capability, "qwen3:14b").ok, false);
  assert.equal(validateCandidateProjection({ ...clone(valid), model: { public_id: "unsupported-model" } }, capability, "qwen3:14b").ok, false);
  assert.equal(validateCandidateProjection({ ...clone(valid), evaluation: { ...valid.evaluation, result: { ...valid.evaluation.result, passed_count: 4 } } }, capability, "qwen3:14b").ok, false);
  assert.equal(validateCandidateProjection(valid, CAPABILITIES[1], "qwen3:14b").ok, false);
  assert.equal(validateProjection(valid, "0".repeat(64), capability.id, "qwen3:14b").ok, false);
  assert.match(SCRIPT, /renderUnavailable/);
  assert.match(HTML, /UNKNOWN \/ UNAVAILABLE evidence/);
});

test("RAG lifecycle differences remain capability-scoped", () => {
  const qwen35 = articleFor("qwen3.5-mtp", "ramone-rag-generation");
  const qwen3 = articleFor("qwen3:14b", "ramone-rag-generation");
  assert.match(qwen35, /3 \/ 3 passed/);
  assert.match(qwen35, /Promotion approved/);
  assert.match(qwen3, /3 \/ 3 passed/);
  assert.match(qwen3, /Promotion not approved/);
  assert.match(qwen3, /Human review pending/);
  assert.match(HTML, /PROMOTION APPROVED ≠ DEPLOYED/);
});

test("Daily Digest exposes 2/3 versus 1/3 without calculating a winner", () => {
  assert.match(articleFor("qwen3.5-mtp", "daily-digest-synthesis"), /2 \/ 3 passed/);
  assert.match(articleFor("qwen3:14b", "daily-digest-synthesis"), /1 \/ 3 passed/);
  assert.match(HTML, /The accepted records show 2 \/ 3 versus 1 \/ 3/);
  for (const forbidden of [/overall winner/i, /best model/i, /rank #1/i, /qwen3 wins/i, /qwen3\.5 wins/i]) assert.doesNotMatch(HTML, forbidden);
});

test("Postmortem exposes equal 6/7 results and qwen3 public regression category", () => {
  assert.match(articleFor("qwen3.5-mtp", "postmortem-drafting"), /6 \/ 7 passed/);
  assert.match(articleFor("qwen3:14b", "postmortem-drafting"), /6 \/ 7 passed/);
  assert.match(articleFor("qwen3:14b", "postmortem-drafting"), /Format contract failure/);
  assert.match(HTML, /accepted evaluation recorded a format-contract violation/);
  assert.doesNotMatch(HTML, /raw output|private scorer|chain.of.thought|prompt content/i);
});

test("Regression Microscope keeps none, unknown, known, and not-applicable states distinct", () => {
  assert.match(HTML, /<strong class="microscope-state">None recorded<\/strong>/);
  assert.match(HTML, /UNKNOWN \/ NOT OBSERVED/);
  assert.match(HTML, /<strong class="microscope-state microscope-state--known">Known regression<\/strong>/);
  assert.match(HTML, /future accepted receipt is <strong>NOT APPLICABLE<\/strong>/);
  assert.match(SCRIPT, /"unknown-not-observed": "UNKNOWN \/ NOT OBSERVED"/);
  assert.match(SCRIPT, /"not-applicable": "NOT APPLICABLE"/);
});

test("comparison has no timing or global-ranking surface", () => {
  assert.match(HTML, /Performance timing is not compared here/);
  assert.match(HTML, /accepted public receipts do not establish a comparable runtime protocol/);
  assert.match(HTML, /No combined score is calculated/);
  assert.doesNotMatch(HTML, /latency bar|tokens\/s|faster candidate|performance graph|global ranking/i);
});

test("no-JS document contains all candidates, lifecycle boundary, failures, and microscope records", () => {
  assert.equal((HTML.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((HTML.match(/aria-pressed="false"/g) || []).length, 4);
  assert.equal((HTML.match(/data-microscope-entry/g) || []).length, 10);
  assert.match(HTML, /JavaScript is disabled, so all five comparison chambers/);
  assert.match(HTML, /EVAL PREPARED/);
  assert.match(HTML, /EVALUATION PASSED/);
  assert.match(HTML, /EVALUATION FAILED/);
  assert.match(HTML, /HUMAN REVIEW PENDING/);
  assert.match(HTML, /PROMOTION NOT APPROVED/);
  assert.match(HTML, /PROMOTION APPROVED ≠ DEPLOYED/);
});

test("selector and responsive contracts preserve keyboard, focus, stacking, and reduced motion", () => {
  assert.equal((HTML.match(/aria-controls="comparison-/g) || []).length, 5);
  assert.match(SCRIPT, /ArrowRight/);
  assert.match(SCRIPT, /ArrowLeft/);
  assert.match(SCRIPT, /event\.key === "Home"/);
  assert.match(SCRIPT, /event\.key === "End"/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(CSS, /\.comparison-candidates,\s*\.microscope-list \{ grid-template-columns: 1fr; \}/);
  assert.match(CSS, /button\[data-evaluation="failed"\]\[aria-pressed="true"\]\s+\.capability-nav-state\s*\{\s*color:\s*var\(--text\)/);
  assert.match(CSS, /prefers-reduced-motion: reduce/);
});

test("the historical RAG receipt remains byte-identical and is visibly preserved", () => {
  const bytes = readFileSync(HISTORICAL_PATH);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), HISTORICAL_SHA256);
  const historical = JSON.parse(bytes.toString("utf8"));
  assert.equal(historical.projection_fingerprint, "sha256:f80ade07d8025fa751f59f8e667fa1adb2905d194fa1f1c90fc316730a94b3c3");
  assert.equal(historical.state, "review-pending");
  assert.equal(historical.promotion.state, "not-approved");
  assert.match(HTML, /Historical qwen3\.5 receipt/);
  assert.match(HTML, /Supersession changes evidence lineage, not deployment or runtime state/);
});

test("public surface remains registered and discoverable", () => {
  const route = "https://atlas-systems.uk/systems/model-promotion/";
  const systemsDirectory = readFileSync("systems/index.html", "utf8");
  const surface = MANIFEST.surfaces.find((candidate) => candidate.url === route);
  assert.ok(surface);
  assert.equal(surface.source, "systems/model-promotion/index.html");
  assert.equal(surface.kind, "product");
  assert.equal(surface.indexing, "index");
  assert.ok(SITEMAP.includes(`<loc>${route}</loc>`));
  assert.match(SITEMAP_GENERATOR, /\("\/systems\/model-promotion\/", "monthly", "0\.7"\)/);
  assert.match(HTML, /<link rel="canonical" href="https:\/\/atlas-systems\.uk\/systems\/model-promotion\/">/);
  assert.match(systemsDirectory, /href="\/systems\/model-promotion\/"/);
  assert.match(readFileSync("systems/evidence/index.html", "utf8"), /href="\/systems\/model-promotion\/">Model Promotion Observatory/);
});

test("closure wording keeps the two Systems surfaces distinct and deployment claims separate", () => {
  const evidencePage = readFileSync("systems/evidence/index.html", "utf8");
  const evidenceDocs = readFileSync("docs/EVIDENCE-CONSOLE.md", "utf8");
  assert.match(HTML, /Phase 4 \/\/ Closure/);
  assert.doesNotMatch(HTML, /Phase 4\.5/);
  assert.match(HTML, /The Evidence Console answers what proves an operational or public claim/);
  assert.match(HTML, /A website deployment is separate from model deployment/);
  assert.match(evidencePage, /href="\/systems\/model-promotion\/">Model Promotion Observatory/);
  assert.match(evidencePage, /It is not a fourth Console view/);
  assert.match(evidenceDocs, /PROMOTION APPROVED != DEPLOYED/);
});

test("all shipped Observatory source and evidence files contain no private or deployment evidence", () => {
  const shipped = [HTML, CSS, SCRIPT, ...EVIDENCE_FILES.map((name) => readFileSync(`${EVIDENCE_DIR}/${name}`, "utf8"))].join("\n");
  for (const forbidden of ["eval-harness", "chain-of-thought", "raw answer", "127.0.0.1", "localhost", "C:\\\\", "L:\\\\", "/mnt/", "/home/", "private/evidence", "api.atlas-systems.uk"]) {
    assert.equal(shipped.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.ok(EVIDENCE_FILES.length >= 11, "historical and current public receipts are present");
  for (const name of EVIDENCE_FILES) {
    const projection = JSON.parse(readFileSync(`${EVIDENCE_DIR}/${name}`, "utf8"));
    assert.deepEqual(Object.keys(projection).sort(), [
      "capability", "current_model_observation", "deployment_boundary", "evaluation", "freshness", "generated_at", "gaps", "human_review", "model", "privacy", "projection_fingerprint", "promotion", "schema_version", "state",
    ].sort(), `${name} has an unexpected public field`);
    assert.equal(projection.deployment_boundary.promotion_is_not_deployment, true, `${name} loses deployment boundary`);
    assert.equal(projection.current_model_observation.state, "not-represented", `${name} exposes runtime identity`);
    assert.equal(Object.hasOwn(projection, "prompt"), false, `${name} exposes prompt`);
    assert.equal(Object.hasOwn(projection, "answer"), false, `${name} exposes answer`);
    assert.equal(Object.hasOwn(projection, "reasoning"), false, `${name} exposes reasoning`);
  }
  for (const capability of CAPABILITIES) {
    for (const model of COMPARISON_CANDIDATES) {
      const { projection } = projectionFor(capability, model);
      assert.equal(projection.deployment_boundary.promotion_is_not_deployment, true);
      assert.equal(projection.current_model_observation.state, "not-represented");
      assert.deepEqual(Object.keys(projection).sort(), [
        "capability", "current_model_observation", "deployment_boundary", "evaluation", "freshness", "gaps", "generated_at", "human_review", "model", "privacy", "projection_fingerprint", "promotion", "schema_version", "state",
      ]);
      assert.equal(Object.hasOwn(projection, "prompt"), false);
      assert.equal(Object.hasOwn(projection, "answer"), false);
      assert.equal(Object.hasOwn(projection, "reasoning"), false);
    }
  }
  assert.match(HTML, /public certification records/);
  assert.match(HTML, /Runtime identity/);
  assert.match(HTML, /Not represented in this receipt/);
});
