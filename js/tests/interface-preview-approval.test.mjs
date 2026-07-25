import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/interface-preview.yml", "utf8");

test("interface validation remains automatic while Pages publication is opt-in", () => {
  assert.match(workflow, /types:\s*\[opened, synchronize, reopened, labeled, unlabeled\]/);
  assert.match(workflow, /validate:\s*[\s\S]*if: github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(
    workflow,
    /deploy-preview:\s*[\s\S]*contains\(github\.event\.pull_request\.labels\.\*\.name, 'interface-preview-approved'\)/,
  );
  assert.match(workflow, /test "\$\{SOURCE_BRANCH\}" != "main"/);
  assert.match(workflow, /test "\$\{PAGES_BRANCH\}" != "production"/);
});

test("preview evidence cannot run unless the guarded deployment completes", () => {
  const deployBlock = workflow.match(/\n  deploy-preview:\n([\s\S]*?)\n  capture-evidence:/)?.[1];
  assert.ok(deployBlock, "deploy-preview job block");
  assert.doesNotMatch(deployBlock, /if:\s*always\(\)/);
  assert.match(workflow, /capture-evidence:\s*[\s\S]*needs: deploy-preview/);
});
