import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const landing = fs.readFileSync("lab/index.html", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const convergence = fs.readFileSync("static/js/surface-convergence.js", "utf8");
const redirects = fs.readFileSync("_redirects", "utf8");
const model = JSON.parse(fs.readFileSync("data/failure-laboratory-model.json", "utf8"));
const interfaceManifest = JSON.parse(fs.readFileSync(".atlas/public-interface.json", "utf8"));
const socialManifest = JSON.parse(fs.readFileSync("scripts/og/manifest.json", "utf8"));
const sitemapSource = fs.readFileSync("scripts/generate_sitemap.py", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");

const CANONICAL_ROUTE = "/lab/failure-trace/";
const LEGACY_ROUTE = "/lab/failure-laboratory/";

const participantSection = landing.match(
  /<section class="content-section lab-participating-section"[\s\S]*?<\/section>/,
)?.[0] ?? "";
const specialSurfaceSection = landing.match(
  /<section class="content-section lab-special-surfaces"[\s\S]*?<\/section>/,
)?.[0] ?? "";
const otherLabsSection = landing.match(
  /<section class="content-section" data-directory-group="other-labs"[\s\S]*?<\/section>/,
)?.[0] ?? "";

const participantRoutes = [
  "/lab/xray/",
  "/lab/cascade/",
  "/lab/consensus/",
  "/lab/neon-relay/",
  "/systems/evidence/",
];

test("the primary guided directory entry uses the canonical Failure Trace identity", () => {
  const ramonePosition = landing.indexOf("lab-ramone-section");
  const failurePosition = landing.indexOf('class="content-section lab-failure-laboratory-section"');
  const audioPosition = landing.indexOf('class="lab-audio-flagships"');

  assert.ok(ramonePosition >= 0 && failurePosition > ramonePosition);
  assert.ok(audioPosition > failurePosition);
  assert.match(landing, /<p class="eyebrow">Primary systems-failure journey<\/p>/);
  assert.match(landing, /<h2 id="failure-laboratory-entry-title">Failure Trace\.<\/h2>/);
  assert.match(landing, /href="\/lab\/failure-trace\/">Enter Failure Trace<\/a>/);
  assert.doesNotMatch(landing, /href="\/lab\/failure-laboratory\/"/);
  assert.doesNotMatch(landing, />Failure Laboratory(?:\.|<)/);
  assert.match(convergence, /const FAILURE_TRACE_ROUTE = "\/lab\/failure-trace\/"/);
  assert.match(convergence, /const LEGACY_FAILURE_TRACE_ROUTE = "\/lab\/failure-laboratory\/"/);
  assert.match(convergence, /function normalizeFailureTraceHandoffs\(documentNode\)/);
  assert.match(convergence, /link\.setAttribute\("href", FAILURE_TRACE_ROUTE\)/);
  assert.match(redirects, /\/lab\/failure-laboratory\/\s+\/lab\/failure-trace\/\s+301/);
});

test("Failure Laboratory implementation class names remain compatibility internals", () => {
  assert.match(landing, /\.lab-failure-laboratory-entry > div, \.lab-failure-laboratory-entry__stages \{ min-width:0; \}/);
  assert.match(landing, /\.lab-failure-laboratory-entry h2 \{[^}]*overflow-wrap:anywhere;/);
  assert.match(landing, /\.lab-failure-laboratory-entry__stages li \{ min-width:0;[^}]*overflow-wrap:anywhere;/);
});

test("the directory records the six canonical journey stages in order", () => {
  const stageNames = [...landing.matchAll(/<li><span>\d{2}<\/span><strong>([^<]+)<\/strong><\/li>/g)]
    .map((match) => match[1]);
  assert.deepEqual(stageNames, [
    "Request",
    "Dependencies",
    "Coordination",
    "Impact",
    "Incident evidence",
    "Recovery",
  ]);
  assert.equal(model.journey.stages.length, 6);
  assert.deepEqual(model.scenarios.map(({ id }) => id), [
    "normal-operation",
    "latency-creep",
    "cache-collapse",
    "dependency-failure",
    "network-partition",
    "cascading-failure",
    "recovery",
  ]);
});

test("participating specialist instruments remain separated from other Lab destinations", () => {
  assert.match(participantSection, /Participating specialist instruments\.<\/h2>/);
  const routes = [...participantSection.matchAll(/<a\b[^>]*data-failure-laboratory-participant[^>]*href="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(routes, participantRoutes);
  assert.doesNotMatch(participantSection, /\/lab\/atlas-motion\//);

  assert.match(specialSurfaceSection, /Atlas Motion stays separate\.<\/h2>/);
  assert.match(specialSurfaceSection, /href="\/lab\/atlas-motion\/"/);
  assert.match(otherLabsSection, /Other Labs and systems tools/);
  for (const route of participantRoutes) {
    assert.doesNotMatch(otherLabsSection, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("the canonical Failure Trace route is first-class without changing specialist indexing", () => {
  const verify = shell.slice(shell.indexOf('label: "Verify"'), shell.indexOf('label: "Explore"'));
  assert.match(verify, /Object\.freeze\(\{ label: "Failure Trace", href: "\/lab\/failure-trace\/" \}\)/);
  assert.doesNotMatch(verify, /href: "\/lab\/failure-laboratory\/"/);
  const landingVerify = landing.slice(
    landing.indexOf('data-lab-context-group="verify"'),
    landing.indexOf('data-lab-context-group="explore"'),
  );
  assert.match(landingVerify, /<a href="\/lab\/failure-trace\/">Failure Trace<\/a>/);
  assert.equal((landingVerify.match(/href="\/lab\/failure-trace\/"/g) || []).length, 1);
  assert.match(sitemapSource, /\("\/lab\/failure-trace\/", "monthly", "0\.7"\)/);
  assert.doesNotMatch(sitemapSource, /\("\/lab\/failure-laboratory\/",/);
  assert.match(sitemap, /<loc>https:\/\/atlas-systems\.uk\/lab\/failure-trace\/<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/atlas-systems\.uk\/lab\/failure-laboratory\/<\/loc>/);
  for (const route of ["/lab/xray/", "/lab/cascade/", "/lab/consensus/", "/lab/neon-relay/"]) {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https:\/\/atlas-systems\\.uk${route.replaceAll("/", "\\/")}<\\/loc>`));
  }
});

test("historical Phase 3 closure evidence remains historical", () => {
  const closure = fs.readFileSync("docs/PHASE-3-FAILURE-LABORATORY-CLOSURE.md", "utf8");
  assert.match(closure, /Phase 3 Failure Laboratory closure/);
  assert.match(closure, /data\/failure-laboratory-model\.json/);
  assert.match(closure, /\/lab\/failure-laboratory\//);
  assert.match(closure, /Atlas Motion/);
  assert.match(closure, /could be affected/);
  assert.match(closure, /Recovery remains intentionally open/);
});

test("current public declarations and social identity use Failure Trace", () => {
  const failureSurface = interfaceManifest.surfaces.find(
    ({ url }) => url === "https://atlas-systems.uk/lab/failure-trace/",
  );
  assert.ok(failureSurface);
  assert.equal(failureSurface.source, "lab/failure-trace/index.html");
  assert.equal(failureSurface.indexing, "index");
  assert.match(failureSurface.footer, /Failure Trace/);
  assert.ok(failureSurface.notes.some((note) => /Atlas Motion is excluded from the Failure Trace participation model/.test(note)));
  assert.equal(interfaceManifest.surfaces.some(({ url }) => url.endsWith(LEGACY_ROUTE)), false);

  const failureSocial = socialManifest.routes.find(({ route }) => route === CANONICAL_ROUTE);
  assert.equal(failureSocial?.html, "lab/failure-trace/index.html");
  assert.equal(failureSocial?.file, "failure-trace");
  assert.deepEqual(failureSocial?.title, ["Failure Trace.", "Trace the [bounded path.]"]);
});
