import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const landing = fs.readFileSync("lab/index.html", "utf8");
const route = fs.readFileSync("lab/speculum/index.html", "utf8");
const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
const sitemap = fs.readFileSync("scripts/generate_sitemap.py", "utf8");
const socialManifest = JSON.parse(fs.readFileSync("scripts/og/manifest.json", "utf8"));

test("Speculum is discoverable from the Explore directory and Lab context navigation", () => {
  assert.match(landing, /data-family="explore"[^>]*data-visual="map"[^>]*data-motif="ATTN"[^>]*href="\/lab\/speculum\//);
  assert.match(landing, /<h3>Speculum<\/h3>/);
  assert.match(landing, /Generated simulation/);
  assert.match(shell, /Speculum", href: "\/lab\/speculum\//);
});

test("Speculum consumes the standard Lab shell without losing its instrument identity", () => {
  assert.match(route, /\/lab\/shared\/systems\.css/);
  assert.match(route, /\/lab\/speculum\/speculum-promotion-v8\.css/);
  assert.match(route, /\/lab\/shared\/shell\.js\?v=20260728-speculum-promotion-v1/);
  assert.match(route, /class="masthead"/);
  assert.match(route, /class="speculum-disclaimer"/);
  assert.doesNotMatch(route, /<footer>/);
});

test("Speculum has complete route metadata and public discovery registration", () => {
  for (const fragment of [
    'property="og:image" content="https://atlas-systems.uk/og/speculum.png"',
    'name="twitter:image" content="https://atlas-systems.uk/og/speculum.png"',
    'property="og:image:alt" content="The estate keeps building eyes. // Atlas Systems"',
    'name="twitter:image:alt" content="The estate keeps building eyes. // Atlas Systems"',
  ]) {
    assert.ok(route.includes(fragment), fragment);
  }
  assert.match(sitemap, /\("\/lab\/speculum\/", "monthly", "0\.5"\)/);
  const entry = socialManifest.routes.find((candidate) => candidate.route === "/lab/speculum/");
  assert.deepEqual(entry, {
    file: "speculum",
    html: "lab/speculum/index.html",
    route: "/lab/speculum/",
    kicker: "Explore / Systems artwork",
    title: ["The estate keeps", "building [eyes.]"],
    tagline: "A time-compressed field of verified public attention paths.",
  });
});
