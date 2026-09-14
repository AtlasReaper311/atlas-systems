import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const landing = fs.readFileSync("lab/index.html", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const model = JSON.parse(fs.readFileSync("data/failure-laboratory-model.json", "utf8"));
const interfaceManifest = JSON.parse(fs.readFileSync(".atlas/public-interface.json", "utf8"));
const socialManifest = JSON.parse(fs.readFileSync("scripts/og/manifest.json", "utf8"));
const sitemapSource = fs.readFileSync("scripts/generate_sitemap.py", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");

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

test("Failure Laboratory is the primary guided directory entry", () => {
  const ramonePosition = landing.indexOf("lab-ramone-section");
  const failurePosition = landing.indexOf('class="content-section lab-failure-laboratory-section"');
  const audioPosition = landing.indexOf('class="lab-audio-flagships"');

  assert.ok(ramonePosition >= 0 && failurePosition > ramonePosition);
  assert.ok(audioPosition > failurePosition);
  assert.match(landing, /<p class="eyebrow">Primary systems-failure journey<\/p>/);
  assert.match(landing, /<h2 id="failure-laboratory-entry-title">Failure Laboratory\.<\/h2>/);
  assert.match(landing, /href="\/lab\/failure-laboratory\/">Enter Failure Laboratory<\/a>/);
  assert.match(landing, /Scenario context<\/strong> \/ not a live incident/);
  assert.match(landing, /independent instruments, not a shared incident trace/);
  assert.doesNotMatch(landing, /scenario selection == current production incident/i);
  assert.doesNotMatch(landing, /simulated failure == observed failure/i);
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

test("participating specialist instruments are separated from other Lab destinations", () => {
  assert.match(participantSection, /Participating specialist instruments\.<\/h2>/);
  const routes = [...participantSection.matchAll(/<a\b[^>]*data-failure-laboratory-participant[^>]*href="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(routes, participantRoutes);
  assert.doesNotMatch(participantSection, /\/lab\/atlas-motion\//);

  assert.match(specialSurfaceSection, /Mini-flagship \/ special product surface/);
  assert.match(specialSurfaceSection, /Atlas Motion stays separate\.<\/h2>/);
  assert.match(specialSurfaceSection, /href="\/lab\/atlas-motion\/"/);
  assert.match(specialSurfaceSection, /not a Failure Laboratory stage or participating instrument/);

  assert.match(otherLabsSection, /Other Labs and systems tools/);
  assert.match(otherLabsSection, /Grouped by purpose\.<\/h2>/);
  assert.match(otherLabsSection, /data-motif="REC"[^>]*href="\/lab\/blackbox\/"/);
  for (const route of participantRoutes) {
    assert.doesNotMatch(otherLabsSection, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(otherLabsSection, /href="\/lab\/signal\/"/);
  assert.doesNotMatch(otherLabsSection, /href="https:\/\/ramone\.atlas-systems\.uk\//);
  assert.doesNotMatch(otherLabsSection, /href="\/lab\/system-symphony\/"/);
  assert.doesNotMatch(otherLabsSection, /href="\/lab\/spectral-forge\/"/);
});

test("the Lab home rail makes the journey first-class without changing indexing", () => {
  const verify = shell.slice(shell.indexOf('label: "Verify"'), shell.indexOf('label: "Explore"'));
  assert.doesNotMatch(verify, /Failure Laboratory/);
  const landingVerify = landing.slice(
    landing.indexOf('data-lab-context-group="verify"'),
    landing.indexOf('data-lab-context-group="explore"'),
  );
  assert.match(landingVerify, /<a href="\/lab\/failure-laboratory\/">Failure Laboratory<\/a>/);
  assert.match(shell, /const LAB_ROUTES = Object\.freeze\(LAB_ROUTE_GROUPS\.flatMap/);
  assert.match(sitemapSource, /\("\/lab\/failure-laboratory\/", "monthly", "0\.7"\)/);
  assert.match(sitemap, /<loc>https:\/\/atlas-systems\.uk\/lab\/failure-laboratory\/<\/loc>/);
  for (const route of ["/lab/xray/", "/lab/cascade/", "/lab/consensus/", "/lab/neon-relay/"]) {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https:\/\/atlas-systems\\.uk${route.replaceAll("/", "\\/")}<\\/loc>`));
  }
});

test("route metadata and public declarations retain the accepted identity boundaries", () => {
  assert.match(landing, /<title>Lab \/\/ Atlas Systems<\/title>/);
  assert.match(landing, /href="https:\/\/atlas-systems\.uk\/lab\/"/);
  assert.match(landing, /og:description/);
  assert.match(landing, /Failure Laboratory journey/);

  const failureSurface = interfaceManifest.surfaces.find(
    ({ url }) => url === "https://atlas-systems.uk/lab/failure-laboratory/",
  );
  assert.ok(failureSurface);
  assert.equal(failureSurface.source, "lab/failure-laboratory/index.html");
  assert.equal(failureSurface.indexing, "index");
  assert.ok(failureSurface.notes.some((note) => /Atlas Motion is excluded/.test(note)));

  const failureSocial = socialManifest.routes.find(
    ({ route }) => route === "/lab/failure-laboratory/",
  );
  assert.equal(failureSocial?.html, "lab/failure-laboratory/index.html");
  assert.equal(failureSocial?.file, "failure-laboratory");
});
