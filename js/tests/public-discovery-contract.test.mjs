import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const parseStructuredData = (path) => {
  const source = read(path);
  const match = source.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
  );

  assert.ok(match, `${path} must expose JSON-LD`);
  return JSON.parse(match[1]);
};

test("the estate homepage declares its public WebSite identity", () => {
  const data = parseStructuredData("index.html");

  assert.equal(data["@type"], "WebSite");
  assert.equal(data.url, "https://atlas-systems.uk/");
  assert.equal(data.author?.name, "Atlas Reaper");
  assert.deepEqual(data.sameAs, [
    "https://github.com/AtlasReaper311",
    "https://linkedin.atlas-systems.uk",
  ]);
});

test("the About page declares the public Person identity and knowledge domains", () => {
  const data = parseStructuredData("about/index.html");

  assert.equal(data["@type"], "Person");
  assert.equal(data.jobTitle, "Systems Engineer");
  assert.equal(data.email, "mailto:atlas@atlas-systems.uk");
  assert.ok(data.knowsAbout.includes("Infrastructure engineering"));
  assert.ok(data.knowsAbout.includes("Audio systems"));
});

const articles = [
  [
    "writing/sonin-generative-system/index.html",
    "2026-03-31",
    "SONIN — Generative Audio-Visual System",
  ],
  [
    "writing/slampunk-dynamic-mix-engine/index.html",
    "2026-04-30",
    "SlamPunk — Dynamic Mix Engine",
  ],
  [
    "writing/ramone-local-ai-system/index.html",
    "2026-05-27",
    "Ramone — Local AI System",
  ],
  [
    "writing/overclocking-specular-core/index.html",
    "2026-06-22",
    "SPECULAR-CORE: Hardware Tuning",
  ],
];

for (const [path, datePublished, headline] of articles) {
  test(`${path} declares Article discovery metadata`, () => {
    const source = read(path);
    const data = parseStructuredData(path);

    assert.equal(data["@type"], "Article");
    assert.equal(data.headline, headline);
    assert.equal(data.datePublished, datePublished);
    assert.equal(data.author?.name, "Atlas Reaper");
    assert.equal(data.publisher?.name, "Atlas Systems");
    assert.match(
      source,
      new RegExp(
        `<meta property="article:published_time" content="${datePublished}">`,
      ),
    );
  });
}

test("security.txt exposes a durable public reporting route", () => {
  const lines = read(".well-known/security.txt").trim().split("\n");

  assert.deepEqual(lines, [
    "Contact: mailto:atlas@atlas-systems.uk",
    "Expires: 2027-07-24T23:59:59Z",
    "Preferred-Languages: en",
    "Canonical: https://atlas-systems.uk/.well-known/security.txt",
  ]);
});

test("only the active workflows directory contains workflow definitions", () => {
  assert.throws(
    () => readFileSync(join(new URL("../../", import.meta.url).pathname, ".github/workflow/deploy.yml")),
    { code: "ENOENT" },
  );
});
