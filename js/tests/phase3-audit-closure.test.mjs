import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("index.html", "utf8");
const systems = fs.readFileSync("systems/index.html", "utf8");
const directoryCss = fs.readFileSync("static/css/v2-directory-pages.css", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");
const sitemapGenerator = fs.readFileSync("scripts/generate_sitemap.py", "utf8");
const robots = fs.readFileSync("robots.txt", "utf8");
const security = fs.readFileSync(".well-known/security.txt", "utf8");
const performance = JSON.parse(fs.readFileSync("data/performance-baseline.json", "utf8"));

test("Atlas-owned Status navigation stays in the current tab", () => {
  const link = home.match(/<a href="https:\/\/status\.atlas-systems\.uk" class="nav-status"[^>]*>/)?.[0];
  assert.ok(link);
  assert.doesNotMatch(link, /target=/);
});

test("approved public Lab and focused Systems routes are sitemap-owned", () => {
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  const routes = [
    "/lab/system-map/",
    "/lab/proof-chain/",
    "/lab/signal/",
    "/lab/system-symphony/",
    "/lab/conformance/",
    "/lab/anomaly/",
    "/systems/observability/",
    "/systems/reliability/",
    "/systems/evidence/",
  ];
  for (const route of routes) {
    const url = `https://atlas-systems.uk${route}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${url} missing from sitemap.xml`);
    assert.ok(sitemapGenerator.includes(`"${route}"`), `${route} missing from generator authority`);
  }
  assert.ok(!sitemap.includes("<loc>https://atlas-systems.uk/lab/reliability/</loc>"));
  assert.ok(!sitemapGenerator.includes('("/lab/reliability/"'));
});

test("maturity semantics use distinct shapes without replacing labels", () => {
  for (const label of ["Production", "Tool", "Preview", "Experiment"]) {
    assert.ok(systems.includes(`>${label}</span>`));
  }
  assert.match(directoryCss, /\.badge\.production::before/);
  assert.match(directoryCss, /\.badge\.tool::before/);
  assert.match(directoryCss, /\.badge\.preview::before/);
  assert.match(directoryCss, /\.badge\.experiment::before/);
});

test("security contact remains canonical and time-bounded", () => {
  assert.match(security, /^Contact: mailto:atlas@atlas-systems\.uk$/m);
  assert.match(security, /^Expires: 2027-07-24T23:59:59Z$/m);
  assert.match(security, /^Canonical: https:\/\/atlas-systems\.uk\/\.well-known\/security\.txt$/m);
});

test("performance evidence is non-blocking and covers representative routes", () => {
  assert.equal(performance.schema_version, "atlas-systems/static-performance-baseline/v1");
  assert.equal(performance.blocking_thresholds, false);
  assert.deepEqual(
    performance.routes.map(({ route }) => route),
    ["/", "/systems/", "/lab/", "/lab/signal/", "/lab/almost/", "/writing/"],
  );
  for (const route of performance.routes) {
    assert.ok(route.html_bytes > 0);
    assert.ok(route.first_party_request_count > 0);
    assert.ok(route.total_static_bytes >= route.html_bytes);
  }
});
