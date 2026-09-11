import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { RESULT } from "../../systems/evidence/change-chain.js";
import { observationsFromPublicSources } from "../../systems/evidence/service-profile.js";
import { SERVICE_SPECIMEN } from "../../systems/evidence/service-specimen.js";

const read = (path) => fs.readFileSync(path, "utf8");
const fulfilled = (value) => ({ status: "fulfilled", value });
const rejected = () => ({ status: "rejected", reason: new Error("network") });

test("expected contract never promotes a specimen URL when topology was not observed", () => {
  const record = observationsFromPublicSources({
    topology: rejected(),
    registry: fulfilled({ workers: [{ name: "atlas-api-public", version: "1.4.0" }] }),
    meta: fulfilled({
      name: "atlas-api-public",
      version: "1.4.0",
      endpoints: [{ method: "GET", path: "/v1" }],
    }),
    live: fulfilled({ ok: true, service: "atlas-api-public" }),
    reliability: fulfilled({ result: { state: "unmeasured", reasons: ["unmeasured"] } }),
  }, SERVICE_SPECIMEN, Date.parse("2026-09-11T15:00:00Z"));

  const ownership = record.observations.OWNERSHIP;
  const contract = record.observations["EXPECTED CONTRACT"];

  assert.equal(ownership.result, RESULT.FAILED);
  assert.equal(contract.result, RESULT.OBSERVED);
  assert.equal(contract.provenance, "public GET /v1/_meta");
  assert.doesNotMatch(contract.identifier, /public surface/i);
  assert.doesNotMatch(contract.identifier, new RegExp(SERVICE_SPECIMEN.endpoints.live.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(contract.scope, /No topology public_surface was observed/);
});

test("Service View provenance links expose bounded touch targets and narrow wrapping", () => {
  const view = read("systems/evidence/service-view.js");
  const css = read("static/css/systems-evidence-service-view.css");

  assert.match(view, /systems-evidence-service-view\.css\?v=20260911-recovery/);
  assert.match(view, /link\.className = "systems-service-source"/);
  assert.match(css, /systems-service-view[\s\S]*systems-change-sources a[\s\S]*min-height:\s*44px/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width:\s*360px\)[\s\S]*\.focus-table[\s\S]*min-width:\s*100%/);
});

test("merged Phase 2.1 Change View still renders extra-gap scope", () => {
  const view = read("systems/evidence/change-view.js");
  assert.match(view, /if \(line\.scope\) \{[\s\S]*appendText\(item, "p", "systems-change-scope", line\.scope\)/);
});
