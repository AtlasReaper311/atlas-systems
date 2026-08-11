import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routes = {
  reliability: fs.readFileSync("systems/reliability/index.html", "utf8"),
  observability: fs.readFileSync("systems/observability/index.html", "utf8"),
  evidence: fs.readFileSync("systems/evidence/index.html", "utf8"),
};
const css = fs.readFileSync("static/css/systems-detail-surfaces.css", "utf8");

const requiredIds = {
  reliability: [
    "reliability-status", "objective-count", "measured-count", "unmeasured-count", "risk-count",
    "objectives-status", "objective-rows", "budget-rows", "dora-status", "dora-frequency",
    "dora-frequency-basis", "dora-cfr", "dora-cfr-basis", "dora-mttr", "dora-mttr-basis",
    "dora-window", "chaos-status", "chaos-list",
  ],
  observability: [
    "observation-status", "summary-telemetry", "summary-services", "summary-failures", "summary-corpus",
    "telemetry-state", "metric-gpu", "metric-gpu-temp", "metric-cpu", "metric-ram", "telemetry-detail",
    "registry-status", "registry-rows", "incident-status", "failure-feed", "infra-state", "infra-detail",
    "corpus-state", "corpus-detail",
  ],
  evidence: [
    "evidence-status", "summary-commits", "summary-deployment", "summary-events", "summary-reports",
    "activity-status", "activity-heatmap", "activity-rows", "deployment-status", "deploy-outcome",
    "deploy-repository", "deploy-commit", "deploy-id", "deploy-time", "pipeline-status", "pipeline-list",
    "reports-status", "report-rows", "source-provenance", "source-activity", "source-deployment",
    "source-pipeline", "source-reports",
  ],
};

test("Phase 9 routes expose one shared analytical sequence", () => {
  for (const [name, html] of Object.entries(routes)) {
    assert.match(html, /class="systems-detail-page"/);
    assert.match(html, /class="systems-detail-sequence" aria-label="Systems evidence sequence"/);
    assert.match(html, />What is happening\?<\/strong>/);
    assert.match(html, />Is it reliable\?<\/strong>/);
    assert.match(html, />What proves it\?<\/strong>/);
    assert.match(html, new RegExp(`href="/systems/${name}/" aria-current="page"`));
  }
});

test("Phase 9 routes use governed semantic breadcrumbs", () => {
  for (const html of Object.values(routes)) {
    assert.match(html, /<nav class="atlas-breadcrumbs systems-detail-breadcrumbs" aria-label="Breadcrumb">/);
    assert.match(html, /<ol>/);
    assert.match(html, /<li><a href="\/systems\/">Systems<\/a><\/li>/);
    assert.match(html, /<li aria-current="page">/);
  }
});

test("route scripts retain every dynamic rendering target", () => {
  for (const [name, ids] of Object.entries(requiredIds)) {
    for (const id of ids) {
      assert.match(routes[name], new RegExp(`id="${id}"`), `${name} lost #${id}`);
    }
  }
});

test("Phase 9 preserves exact-route AtlasField host continuity", () => {
  for (const html of Object.values(routes)) {
    assert.equal((html.match(/<header class="focus-hero">/g) || []).length, 1);
    assert.doesNotMatch(html, /<canvas/i);
    assert.match(html, /\/static\/js\/focused-systems-shell\.js\?v=20260725-batch-h-fixes/);
  }
});

test("Phase 9 stylesheet supplies responsive and reduced-motion hierarchy", () => {
  assert.match(css, /\.systems-detail-hero-grid/);
  assert.match(css, /\.systems-detail-workbench/);
  assert.match(css, /\.systems-detail-sequence a\[aria-current="page"\]/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Systems detail workbenches stack full-width to avoid empty side columns", () => {
  assert.match(
    css,
    /\.systems-detail-workbench,\s*\n\.systems-detail-workbench--support \{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    css,
    /data-systems-detail="evidence"[\s\S]*?\.focus-heatmap \{[\s\S]*?grid-auto-columns:\s*11px/,
  );
  assert.match(
    css,
    /data-systems-detail="evidence"[\s\S]*?\.focus-heatmap \{[\s\S]*?justify-content:\s*start/,
  );
  assert.match(
    css,
    /data-systems-detail="evidence"[\s\S]*?\.focus-heatmap-cell \{[\s\S]*?width:\s*11px/,
  );
  for (const html of Object.values(routes)) {
    assert.match(html, /systems-detail-surfaces\.css\?v=20260811-heatmap-compact/);
  }
});
