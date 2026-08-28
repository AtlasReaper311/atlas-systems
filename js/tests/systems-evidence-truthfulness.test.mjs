import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  deriveCorpusEvidence,
  deriveInfraEvidence,
  deriveTelemetryEvidence,
} from "../../systems/observability/evidence-mode.js";
import {
  budgetRemainingLabel,
  calendarDayAgeLabel,
  doraPresentation,
  failureHistory,
  reliabilityEvidenceText,
} from "../../systems/reliability/evidence-mode.js";
import {
  activityDisclosureLabel,
  assuranceStateSummary,
  availabilityRows,
  denseActivityDays,
  deploymentReceipt,
} from "../../systems/evidence/receipts.js";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Observe keeps local runtime state separate from evidence freshness", () => {
  const telemetry = deriveTelemetryEvidence({
    online: false,
    last_seen: "2026-08-09T10:00:00.000Z",
    telemetry: { sampled_at: "2026-08-09T10:00:00.000Z" },
  }, NOW);
  assert.equal(telemetry.runtime, "down");
  assert.equal(telemetry.evidenceMode, "stale-measured");

  const infra = deriveInfraEvidence({
    overall: "down",
    stale: true,
    last_report_at: "2026-08-09T10:00:00.000Z",
    components: { ollama: { ok: true }, corpus_health: { ok: true }, corpus_search: { ok: true } },
  }, NOW);
  assert.equal(infra.runtime, "down");
  assert.equal(infra.evidenceMode, "stale-measured");
  assert.equal(infra.passing, 3);

  const corpus = deriveCorpusEvidence({
    source: "last-summary",
    queries_last_hour: 0,
    queries_today: 8,
    queries_total: 120,
    last_summary_at: "2026-08-09T10:00:00.000Z",
  }, NOW);
  assert.equal(corpus.evidenceMode, "stale-measured");
  assert.equal(corpus.countText, "0 / hour");

  const unavailableCorpus = deriveCorpusEvidence({
    source: "none",
    queries_last_hour: 0,
    queries_today: 0,
    queries_total: 0,
  }, NOW);
  assert.equal(unavailableCorpus.evidenceMode, "unavailable");
  assert.equal(unavailableCorpus.countText, "—");
});

test("Reliability receipts include raw failure span and evaluation age", () => {
  const slo = {
    components: {
      github_pulse: {
        days: {
          "2026-07-22": { ok: 140, total: 144 },
          "2026-07-23": { ok: 142, total: 144 },
          "2026-07-24": { ok: 144, total: 144 },
        },
      },
    },
  };
  const history = failureHistory(slo, "github_pulse", NOW);
  assert.deepEqual(
    { failedProbes: history.failedProbes, firstDay: history.firstDay, lastDay: history.lastDay },
    { failedProbes: 6, firstDay: "2026-07-22", lastDay: "2026-07-23" },
  );
  assert.equal(history.lastAge, "18 days ago");
  const text = reliabilityEvidenceText(
    { reasons: ["the error budget for the window is exhausted"] },
    { evaluated_at: "2026-08-10T11:55:00.000Z" },
    history,
    NOW,
  );
  assert.match(text, /error budget/);
  assert.match(text, /6 failed probes/);
  assert.match(text, /last failed day 18 days ago/);
  assert.match(text, /evaluated 5m old/);
});

test("Reliability date-only receipts do not turn the current day into a future 0-second timestamp", () => {
  assert.equal(calendarDayAgeLabel("2026-08-10", NOW), "today");
  assert.equal(calendarDayAgeLabel("2026-08-09", NOW), "1 day ago");
});

test("Reliability budget labels distinguish remaining budget from overspend", () => {
  assert.equal(budgetRemainingLabel(0.42), "42.0%");
  assert.equal(budgetRemainingLabel(0), "0.0% remaining");
  assert.equal(budgetRemainingLabel(-2.361), "0.0% remaining");
  const text = reliabilityEvidenceText(
    { budget: { remaining_fraction: -2.361 }, reasons: ["the error budget for the window is exhausted"] },
    { evaluated_at: "2026-08-10T11:55:00.000Z" },
    null,
    NOW,
    { indicator: "availability", windowDays: 30 },
  );
  assert.match(text, /30-day availability objective/);
  assert.match(text, /236\.1% beyond the error budget/);
});

test("DORA presentation withholds unstable weekly extrapolation from a short event window", () => {
  const short = doraPresentation({
    computedAt: "2026-08-10T11:55:00.000Z",
    window: { days: 0.13 },
    deploymentFrequency: { perWeek: 52.42, totalInWindow: 1 },
    degraded: false,
  });
  assert.equal(short.statusState, "warning");
  assert.equal(short.frequencyLabel, "Observed deployments");
  assert.equal(short.frequencyValue, "1");
  assert.match(short.frequencyBasis, /52\.42\/week/);
  assert.match(short.statusText, /withheld/);

  const stable = doraPresentation({
    computedAt: "2026-08-10T11:55:00.000Z",
    window: { days: 14 },
    deploymentFrequency: { perWeek: 3.5, totalInWindow: 7 },
    degraded: false,
  });
  assert.equal(stable.statusState, "healthy");
  assert.equal(stable.frequencyLabel, "Deploys per week");
  assert.equal(stable.frequencyValue, "3.50");
  assert.match(stable.frequencyBasis, /7 deployments across 14 days/);
});

test("Verify renders exactly ninety calendar days without turning unknown truncation into zero", () => {
  const dense = denseActivityDays({
    days: { "2026-08-10": 3, "2026-08-08": 1 },
    truncated: false,
  }, NOW);
  assert.equal(dense.length, 90);
  assert.equal(dense.at(-1).date, "2026-08-10");
  assert.equal(dense.at(-1).count, 3);
  assert.equal(dense.find((day) => day.date === "2026-08-09").count, 0);

  const truncated = denseActivityDays({
    days: { "2026-08-10": 3 },
    truncated: true,
    truncatedRepos: ["atlas-infra"],
  }, NOW);
  assert.equal(truncated.find((day) => day.date === "2026-08-09").count, null);
  assert.equal(truncated.find((day) => day.date === "2026-08-09").evidenceMode, "unknown");
});

test("Verify keeps the full activity ledger accessible without making it the default page length", () => {
  assert.equal(activityDisclosureLabel({ truncated: false }), "Show complete 90-day evidence table");
  assert.match(
    activityDisclosureLabel({ truncated: true, truncatedRepos: ["atlas-systems"] }),
    /unknown source-capped days/,
  );
});

test("Verify supplementary receipts isolate unavailable sources instead of leaking rejected fetches", () => {
  const receipts = read("systems/evidence/receipts.js");
  assert.match(receipts, /Promise\.allSettled/);
  assert.match(receipts, /renderAvailabilityUnavailable/);
  assert.doesNotMatch(receipts, /await Promise\.all\(\[/);
});

test("Verify deployment receipt consumes deploy-watch camelCase contract", () => {
  const receipt = deploymentReceipt({
    status: "success",
    branch: "main",
    commitSha: "abcdef0",
    commitUrl: "https://github.com/AtlasReaper311/atlas-systems/commit/abcdef0123456789",
    deployId: "deployment-1",
    createdOn: "2026-08-10T11:00:00.000Z",
    endedOn: "2026-08-10T11:01:15.000Z",
    checkedAt: "2026-08-10T11:01:30.000Z",
  });
  assert.equal(receipt.repository, "atlas-systems");
  assert.equal(receipt.branch, "main");
  assert.equal(receipt.commit, "abcdef0");
  assert.equal(receipt.duration, 75);
  assert.equal(receipt.checked, "2026-08-10T11:01:30.000Z");
});

test("Verify availability rows expose coverage, probes, percentage, and latency", () => {
  const rows = availabilityRows({
    window_days: 30,
    components: {
      github_pulse: { days_observed: 22, ok: 3100, total: 3168, avg_ms: 264, first_day: "2026-07-20" },
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "github-pulse");
  assert.equal(rows[0].observed, 22);
  assert.equal(rows[0].window, 30);
  assert.equal(rows[0].availability, "97.85%");
  assert.equal(rows[0].avgMs, 264);
});

test("Assurance freshness cannot promote an unknown report verdict to healthy", () => {
  assert.deepEqual(assuranceStateSummary(["pass", "pass"]), {
    total: 2,
    failures: 0,
    unknown: 0,
    state: "healthy",
  });
  assert.equal(assuranceStateSummary(["unknown", "pass"]).state, "warning");
  assert.equal(assuranceStateSummary(["failure", "pass"]).state, "failure");
});

test("Systems detail routes consume Interface Kit v0.5.0 evidence semantics", () => {
  const routes = {
    observability: read("systems/observability/index.html"),
    reliability: read("systems/reliability/index.html"),
    evidence: read("systems/evidence/index.html"),
  };
  for (const html of Object.values(routes)) {
    assert.match(html, /\/static\/vendor\/atlas-interface\/v0\.5\.0\/atlas-interface-kit\.css/);
    assert.match(html, /\/static\/css\/systems-evidence-truthfulness\.css/);
  }
  assert.match(routes.observability, /Public endpoint state/);
  assert.match(routes.observability, /corpus-state" class="atlas-evidence-mode"/);
  assert.match(routes.observability, /systems\/observability\/evidence-mode\.js/);
  assert.match(routes.reliability, /\/v1\/slo/);
  assert.match(routes.reliability, /systems\/reliability\/evidence-mode\.js/);
  for (const id of [
    "availability-status", "availability-rows", "availability-note", "source-availability",
    "deploy-branch", "deploy-started", "deploy-finished", "deploy-duration", "deployment-evidence-mode",
  ]) {
    assert.match(routes.evidence, new RegExp(`id="${id}"`));
  }
  assert.match(routes.evidence, /systems\/evidence\/receipts\.js/);
  assert.match(routes.evidence, /\/v1\/stats/);
  assert.match(routes.evidence, /\/v1\/slo/);
  assert.match(routes.evidence, /systems-evidence-truthfulness\.css\?v=20260811-heatmap-density/);
});

test("Evidence layout corrections remove desktop clipping without deleting accessible detail", () => {
  const css = read("static/css/systems-evidence-truthfulness.css");
  const observe = read("systems/observability/evidence-mode.js");
  const receipts = read("systems/evidence/receipts.js");
  assert.match(css, /systems-evidence-disclosure/);
  assert.match(css, /table-layout:\s*fixed/);
  assert.match(css, /data-systems-detail="reliability"/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?max-width:\s*100vw/);
  assert.match(css, /max-width:\s*calc\(100vw - 32px\)/);
  assert.doesNotMatch(
    css,
    /data-systems-detail="evidence"[\s\S]*?overflow-x:\s*clip/,
    "evidence mobile fallback must not clip document overflow to skirt Batch H",
  );
  assert.match(observe, /registry-scope-status/);
  assert.match(receipts, /document\.createElement\("details"\)/);
  assert.match(receipts, /Freshness does not promote an unknown assurance verdict to healthy/);
});

test("Correction modules keep public rendering bounded and secret-free", () => {
  for (const path of [
    "systems/observability/evidence-mode.js",
    "systems/reliability/evidence-mode.js",
    "systems/evidence/receipts.js",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.doesNotMatch(source, /Authorization|Bearer|secret|token/i);
  }
});
