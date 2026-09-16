import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ARTIFACT_PATH = "systems/model-promotion/evidence/f80ade07d8025fa751f59f8e667fa1adb2905d194fa1f1c90fc316730a94b3c3.json";
const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));

test("public model promotion evidence keeps the accepted public-safe shape", () => {
  assert.deepEqual(Object.keys(artifact).sort(), [
    "capability",
    "current_model_observation",
    "deployment_boundary",
    "evaluation",
    "freshness",
    "gaps",
    "generated_at",
    "human_review",
    "model",
    "privacy",
    "projection_fingerprint",
    "promotion",
    "schema_version",
    "state",
  ]);
  assert.equal(artifact.capability.id, "ramone-rag-generation");
  assert.equal(artifact.model.public_id, "qwen3.5-mtp");
  assert.equal(
    artifact.projection_fingerprint,
    "sha256:f80ade07d8025fa751f59f8e667fa1adb2905d194fa1f1c90fc316730a94b3c3",
  );
  assert.equal(artifact.state, "review-pending");
  assert.equal(artifact.evaluation.state, "evaluated-passed");
  assert.deepEqual(artifact.evaluation.result, {
    case_count: 3,
    failed_count: 0,
    minimum_pass_rate: 1.0,
    pass_rate: 1.0,
    passed_count: 3,
  });
  assert.equal(artifact.human_review.state, "pending");
  assert.equal(artifact.promotion.state, "not-approved");
  assert.equal(artifact.current_model_observation.state, "not-represented");
  assert.equal(artifact.deployment_boundary.promotion_is_not_deployment, true);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(artifact.deployment_boundary).filter(([key]) => key !== "promotion_is_not_deployment"),
    ),
    {
      deployed: "not-applicable",
      deployment_observed: "not-applicable",
      live_verified: "not-applicable",
      runtime_verified: "not-applicable",
    },
  );
  assert.deepEqual(artifact.privacy, {
    mode: "public-safe-allowlist",
    private_evidence_uris_excluded: true,
    private_inputs_excluded: true,
    raw_answers_excluded: true,
    runtime_configuration_excluded: true,
    unknown_fields_rejected: true,
  });
});
