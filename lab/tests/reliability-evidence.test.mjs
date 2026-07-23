import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const reportPath =
  "lab/reliability/evidence/specular-route-503-live-2026-07-15.json";

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

test("archived Reliability evidence is the source-linked live canary", () => {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const canonical = structuredClone(report);
  delete canonical.fingerprint;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(sortValue(canonical)))
    .digest("hex");

  assert.equal(report.schema, "atlas-chaos-report-set/v1");
  assert.equal(report.fingerprint, fingerprint);
  assert.equal(report.summary.experiments, 1);
  assert.equal(report.passed, true);

  const [experiment] = report.experiments;
  assert.equal(experiment.experiment_id, "specular-route-503-v1");
  assert.equal(experiment.mode, "live");
  assert.equal(experiment.passed, true);
  assert.equal(
    experiment.source.run_url,
    "https://github.com/AtlasReaper311/atlas-infra/actions/runs/29454982522",
  );
  for (const stage of ["injection", "detection", "notification", "recovery"]) {
    assert.equal(experiment.stages[stage].ok, true);
    assert.ok(experiment.stages[stage].latency_ms > 0);
  }
});

test("Reliability verifies the live archive against public history", () => {
  const source = fs.readFileSync(
    "lab/reliability/reliability-core.js",
    "utf8",
  );
  assert.match(source, /HISTORY_ENDPOINT = `\$\{ENDPOINT\}\?history=1`/);
  assert.match(source, /item\.fingerprint === report\.fingerprint/);
  assert.match(source, /experiment\.mode !== "live"/);
});

test("Proof Chain hides inactive loading and detail states", () => {
  const css = fs.readFileSync("lab/proof-chain/proof-chain.css", "utf8");
  assert.match(css, /\.proof-detail-empty\[hidden\]/);
  assert.match(css, /#proof-detail-content\[hidden\]/);
  assert.match(css, /display:\s*none/);
});
