import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

function ids(source) {
  return [...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
}

function projectBlocks(source) {
  return [...source.matchAll(/<article class="project-entry"[\s\S]*?<\/article>/g)]
    .map((match) => match[0]);
}

function cardContracts(source) {
  const contracts = new Map();
  for (const match of source.matchAll(/<a\b([^>]*\bclass="[^"]*\bsystem-card\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)) {
    const attributes = match[1];
    const href = attributes.match(/\bhref="([^"]+)"/)?.[1];
    if (!href || contracts.has(href)) continue;
    contracts.set(href, {
      visual: attributes.match(/\bdata-visual="([^"]+)"/)?.[1],
      motif: attributes.match(/\bdata-motif="([^"]+)"/)?.[1],
      maturity: match[2].match(/<span class="badge [^"]+">([^<]+)<\/span>/)?.[1],
    });
  }
  return contracts;
}

test("Work keeps scheduler ownership and permanent source anchors", () => {
  const work = read("work/index.html");
  assert.equal((work.match(/<!-- WORK_CARDS_INSERT_POINT -->/g) || []).length, 1);
  assert.match(work, /id="ramone" data-project-id="ramone"/);
  assert.match(work, /id="slampunk" data-project-id="slampunk"/);
  assert.match(work, /id="sonin" data-project-id="sonin"/);
  assert.match(work, /id="local-ai"/);

  const allIds = ids(work);
  assert.equal(new Set(allIds).size, allIds.length, "Work IDs must remain unique");

  for (const anchor of ["ramone", "sonin", "slampunk"]) {
    assert.match(work, new RegExp(`href="#${anchor}"`));
    assert.ok(allIds.includes(anchor), `featured link #${anchor} must resolve`);
  }
});

test("Work results stay visible while supporting detail is semantic and collapsed", () => {
  const work = read("work/index.html");
  const projects = projectBlocks(work);
  assert.ok(projects.length >= 3, "Work must retain the three source-owned projects and accept scheduler additions");
  for (const project of projects) {
    assert.match(project, /class="project-result"/);
    assert.match(project, /<details class="project-disclosure">/);
    assert.doesNotMatch(project, /<details[^>]*\bopen\b/);
    assert.ok(project.indexOf('class="project-result"') < project.indexOf("<details"));
    assert.ok(project.indexOf("</details>") < project.indexOf('class="project-links"'));
  }
  assert.match(work, /id="ramone-gallery"/);
  assert.match(work, /id="slampunk-gallery"/);
  assert.match(work, /id="sonin-gallery"/);
  assert.match(work, /toggleAudio/);
  assert.match(work, /class="filter-btn/);
  assert.match(work, /\/js\/card-search\.js/);
});

test("Writing preserves scheduler markers, order, and series source attributes", () => {
  const writing = read("writing/index.html");
  assert.equal((writing.match(/<!-- ARTICLES_INSERT_POINT -->/g) || []).length, 1);
  for (let number = 1; number <= 7; number += 1) {
    assert.match(writing, new RegExp(`<!-- W-0${number}:`));
  }
  const seriesCards = writing.match(
    /<a\b[^>]*class="article-entry(?: coming-soon)?"[^>]*data-series="pipeline-observability"[^>]*>/g,
  ) || [];
  assert.equal(seriesCards.length, 3);
  assert.equal((writing.match(/id="series-pipeline-observability"/g) || []).length, 1);
  assert.ok(
    writing.indexOf('id="series-pipeline-observability"') <
      writing.indexOf('data-series="pipeline-observability"'),
  );
  for (const part of ["1", "2", "3"]) {
    assert.match(writing, new RegExp(`data-series-part="${part}"`));
  }
  for (const card of seriesCards.filter((card) => card.includes("coming-soon"))) {
    assert.match(card, /href="#"/);
    assert.match(card, /aria-disabled="true" tabindex="-1"/);
  }
  assert.match(writing, /data-series-note="3 parts · 26–30 July 2026"/);
  assert.doesNotMatch(writing, /<span class="article-date">(?:26|28|30) July 2026<\/span>/);
});

test("Writing type filters compose with card search and series visibility", () => {
  const directory = read("writing/directory.js");
  const search = read("js/card-search.js");
  const series = read("writing/series.js");
  assert.match(directory, /filter-hidden/);
  assert.match(directory, /search-hidden/);
  assert.match(directory, /data-writing-filter/);
  assert.match(search, /atlas:card-search/);
  assert.match(series, /filter-hidden/);
  assert.match(series, /Part " \+ info\.part \+ " of " \+ info\.total/);
  assert.doesNotMatch(series, /day:\s*"numeric"/);
});

test("primary source remains navigable, branded, and readable without JavaScript", () => {
  const primaryPages = [
    "index.html",
    "lab/index.html",
    "systems/index.html",
    "work/index.html",
    "writing/index.html",
    "about/index.html",
    "404.html",
  ];
  const requiredIcons = [
    "/favicon.ico",
    "/favicon-16x16.png",
    "/favicon-32x32.png",
    "/apple-touch-icon.png",
    "/site.webmanifest",
  ];
  for (const path of primaryPages) {
    const source = read(path);
    assert.match(source, /<nav\b[^>]*aria-label="Primary navigation"/, path);
    assert.match(source, /href="\/systems\/"/, `${path} must expose Systems in source navigation`);
    assert.match(source, /\/static\/css\/estate-shell\.css/, `${path} must load the source shell stylesheet`);
    for (const icon of requiredIcons) {
      assert.ok(source.includes(`href="${icon}"`), `${path} must declare ${icon}`);
    }
  }

  const work = read("work/index.html");
  const writing = read("writing/index.html");
  const css = read("static/css/editorial-surfaces-v2.css");
  assert.match(work, /\.project-entry\{[^}]*opacity:1;[^}]*transform:none/);
  assert.match(work, /\.js \.project-entry\{[^}]*opacity:0/);
  assert.match(writing, /\.article-entry\{[^}]*opacity:1;[^}]*transform:none/);
  assert.match(writing, /\.js \.article-entry\{[^}]*opacity:0/);
  assert.match(css, /\.article-tags\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(work, /\/static\/js\/enable-enhancements\.js/);
  assert.match(writing, /\/static\/js\/enable-enhancements\.js/);
});

test("Lab and Systems shared destinations cannot drift in visual, motif, or maturity", () => {
  const lab = cardContracts(read("lab/index.html"));
  const systems = cardContracts(read("systems/index.html"));
  const shared = [
    "https://ramone.atlas-systems.uk/",
    "https://status.atlas-systems.uk/",
    "https://api.atlas-systems.uk/v1/docs",
    "/lab/system-map/",
    "/lab/proof-chain/",
    "/lab/conformance/",
    "/systems/observability/",
    "/systems/reliability/",
    "/systems/evidence/",
    "/lab/system-symphony/",
    "/lab/signal/",
    "/lab/anomaly/",
  ];
  for (const href of shared) {
    assert.ok(lab.has(href), `Lab must declare ${href}`);
    assert.ok(systems.has(href), `Systems must declare ${href}`);
    assert.deepEqual(systems.get(href), lab.get(href), `${href} card contract drifted`);
  }
});

test("About contains the accepted identity, priorities, principles, and reduced-motion topology", () => {
  const about = read("about/index.html");
  const css = read("static/css/editorial-surfaces-v2.css");
  const roles = [
    "Systems Engineer",
    "Software and AI Engineer",
    "Audio Systems Specialist",
    "Game Developer",
  ];
  let position = -1;
  for (const role of roles) {
    const next = about.indexOf(role);
    assert.ok(next > position, `${role} must appear in accepted order`);
    position = next;
  }
  for (const priority of [
    "Automation and governance",
    "Local AI and grounded retrieval",
    "Observability and evidence",
    "Portfolio-grade infrastructure",
    "Interactive audio systems",
  ]) {
    assert.ok(about.includes(priority), priority);
  }
  assert.match(about, /class="about-topology" aria-hidden="true"/);
  assert.doesNotMatch(about, /Scotland/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.js \.project-entry[\s\S]*opacity:\s*1/);
  assert.match(css, /\.about-topology-path[\s\S]*animation:\s*none/);
});

test("active public surfaces use the canonical accessible faint-text token", () => {
  const paths = [
    "css/home-v2-base.css",
    "static/css/estate-shell.css",
    "static/css/v2-directory-pages.css",
    "work/index.html",
    "writing/index.html",
    "about/index.html",
    "404.html",
  ];
  for (const path of paths) {
    const source = read(path);
    assert.match(source, /--text-faint:\s*#888894/);
    assert.doesNotMatch(source, /#555560|#858590/);
  }
});

test("Homepage source routes point to canonical Systems and System Map destinations", () => {
  const home = read("index.html");
  assert.match(home, /href="\/systems\/"/);
  assert.match(home, /href="\/systems\/index\.html#ramone"/);
  assert.match(home, /href="\/lab\/system-map\/"/);
  assert.doesNotMatch(home, /href="\/lab\/index\.html#ramone-card"/);
  assert.doesNotMatch(home, /href="\/lab\/index\.html#system-map"/);
  for (const hook of ["terminal-text", "terminal-output", "truth-strip", "estate-latest-deploy"]) {
    assert.match(home, new RegExp(`id="${hook}"`));
  }
});

test("editorial assets remain mutable and preview evidence covers changed surfaces", () => {
  const headers = read("_headers");
  const preview = read(".github/workflows/interface-preview.yml");
  const capture = read("scripts/capture_interface_evidence.mjs");
  assert.match(headers, /\/\*[\s\S]*Cache-Control: no-cache, max-age=0, must-revalidate/);
  assert.doesNotMatch(headers, /\/static\/css\/editorial-surfaces-v2\.css[\s\S]*immutable/);
  for (const path of ["work/**", "writing/**", "about/**", "static/css/editorial-surfaces-v2.css"]) {
    assert.ok(preview.includes(`"${path}"`), path);
  }
  assert.doesNotMatch(preview, /agent\/public-interface-system-v2-primary-site/);
  assert.match(preview, /SOURCE_BRANCH/);
  for (const route of ["/work/", "/writing/", "/about/", "/writing/overclocking-specular-core/", "/404.html"]) {
    assert.ok(capture.includes(`"${route}"`), route);
  }
  assert.match(capture, /visibleWorkProjectCount/);
  assert.match(capture, /Number\.parseFloat\(style\.opacity\) > 0/);
});

test("representative article and 404 evidence targets retain mobile and link accessibility fixes", () => {
  const article = read("writing/overclocking-specular-core/index.html");
  const notFound = read("404.html");
  assert.match(article, /\.article-body\{min-width:0/);
  assert.match(article, /\.prose\{width:100%;min-width:0;/);
  assert.match(article, /overflow-wrap:anywhere/);
  assert.match(article, /\.model-table\{display:block;overflow-x:auto\}/);
  assert.match(notFound, /\.err-hint a\{[^}]*text-decoration:underline/);
});
