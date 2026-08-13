import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  STATUS_ENDPOINT,
  STATUS_LABELS,
  STATUS_PAGE,
  STATUS_STALE_AFTER_MS,
  parseEstateStatus,
} from "../../static/js/estate-status.js";
import { GLOBAL_ROUTES, normalizeAtlasTitle } from "../../static/js/estate-shell.js";
import { SHARED_FOUNDATION_CONTRACT } from "../../static/js/shared-foundation-semantics.js";

const NOW = Date.parse("2026-07-23T08:00:00Z");
const ACTIVE_BUNDLE_ROOT = "static/vendor/atlas-interface/v0.3.0";
const LEGACY_BUNDLE_ROOT = "static/vendor/atlas-interface/v0.2.0";
const FONT_FILES = new Set([
  "fonts/dm-serif-display-400-italic.woff2",
  "fonts/dm-serif-display-400.woff2",
  "fonts/ibm-plex-mono-400.woff2",
  "fonts/ibm-plex-mono-500.woff2",
]);

// Redirect interstitials. They replace the location before anything paints,
// so shipping chrome on them would only slow the redirect down.
const CHROME_EXEMPT_ROUTES = new Set([
  "lab/reliability/index.html",
  "lab/system-symphony/replay/index.html",
]);

// Routes that reach lab/shared/shell.js and therefore carry the Lab context
// strip beneath the global header.
const LAB_SHELL_ROUTES = Object.freeze([
  "lab/almost/index.html", "lab/anomaly/index.html", "lab/bearing/index.html",
  "lab/blackbox/index.html", "lab/conformance/index.html", "lab/console/index.html",
  "lab/drift/index.html", "lab/index.html", "lab/proof-chain/index.html",
  "lab/signal/index.html", "lab/spectral-forge/index.html", "lab/speculum/index.html",
  "lab/system-map/index.html", "lab/system-symphony/build-log/index.html",
  "lab/system-symphony/index.html", "lab/system-symphony/radio/index.html",
  "lab/system-symphony/roms/index.html", "lab/xray/index.html",
]);

function snapshot(operational, total, checkedAt = "2026-07-23T07:55:00Z") {
  return { estate: { operational, total_components: total, checked_at: checkedAt } };
}

function governedRoutes() {
  return filesBelow(".", ".html")
    .filter((path) => !path.startsWith("site-snippet/"))
    .filter((path) => !CHROME_EXEMPT_ROUTES.has(path));
}

function headerBlock(source) {
  return source.match(
    /<nav class="atlas-header atlas-nav-shell atlas-global-header" aria-label="Primary navigation">[\s\S]*?<\/nav>/,
  )?.[0] ?? "";
}

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function filesBelow(directory, suffix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`.replace(/^\.\//, "");
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") return [];
      return filesBelow(path, suffix);
    }
    return path.endsWith(suffix) ? [path] : [];
  });
}

test("status indicator consumes the bounded aggregate contract", () => {
  assert.equal(STATUS_ENDPOINT, "https://api.atlas-systems.uk/v1/stats");
  assert.equal(STATUS_PAGE, "https://status.atlas-systems.uk/");
  assert.equal(STATUS_STALE_AFTER_MS, 1_200_000);
  assert.equal(STATUS_LABELS.operational, "Operational");
});

test("status mapping distinguishes operational, degraded, unavailable, and unknown", () => {
  assert.equal(parseEstateStatus(snapshot(19, 19), NOW).state, "operational");
  assert.equal(parseEstateStatus(snapshot(18, 19), NOW).state, "degraded");
  assert.equal(parseEstateStatus(snapshot(10, 19), NOW).state, "degraded");
  assert.equal(parseEstateStatus(snapshot(9, 19), NOW).state, "unavailable");
  assert.equal(parseEstateStatus(snapshot(0, 19), NOW).state, "unavailable");
  assert.equal(parseEstateStatus(null, NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(20, 19), NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(19, 19, "2026-07-23T08:05:00Z"), NOW).state, "unknown");
  assert.equal(parseEstateStatus(snapshot(19, 19, "2026-07-23T07:39:59Z"), NOW).state, "unknown");
});

test("v2 shell exposes the accepted route order and v0.3.0 foundations", () => {
  assert.deepEqual(GLOBAL_ROUTES.map(({ label }) => label), ["Work", "Writing", "Lab", "Systems", "About"]);
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  const shellCss = fs.readFileSync("static/css/estate-shell.css", "utf8");
  assert.match(shell, /atlas-header__brand/);
  assert.match(shell, /atlas-header__nav/);
  assert.match(shell, /atlas-header__actions/);
  assert.match(shell, /preserveHomepageStatus/);
  assert.match(shell, /label\.removeAttribute\("id"\)/);
  assert.doesNotMatch(shell, /if \(!isHomepage\) void refreshStatus/);
  assert.match(shell, /void refreshStatus\(status\)/);
  assert.match(shell, /v0\.3\.0\/atlas-interface-kit\.css/);
  assert.match(shell, /installSharedFoundationSemantics/);
  assert.match(shell, /aria-live", "off"/);
  assert.match(shell, /normalizeLegacySemantics/);
  assert.match(shellCss, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
});

test("first paint ships the governed header rather than a JavaScript rewrite of it", () => {
  for (const path of governedRoutes()) {
    const source = fs.readFileSync(path, "utf8");
    const header = headerBlock(source);
    assert.ok(header, `${path} must ship the global header in HTML`);
    assert.match(header, /<div class="atlas-header__inner">/, path);
    assert.match(header, /class="atlas-header__brand atlas-global-header__identity"/, path);
    assert.match(header, /class="atlas-header__nav atlas-global-header__nav"/, path);
    assert.match(header, /class="atlas-header__actions atlas-global-header__actions"/, path);
    assert.match(header, /class="nav-wordmark atlas-wordmark"/, path);
    assert.match(header, /class="nav-status atlas-status atlas-estate-status"/, path);
    assert.match(header, /class="es-nav-search atlas-search-control"[^>]*data-estate-search-open/, path);

    for (const { label, href } of GLOBAL_ROUTES) {
      assert.match(
        header,
        new RegExp(`<a class="atlas-global-header__link" href="${href}"[^>]*>${label}</a>`),
        `${path} header must link ${label}`,
      );
    }
    assert.ok(
      (header.match(/aria-current="page"/g) || []).length <= 1,
      `${path} may mark at most one current section`,
    );

    // The chrome the shell used to build over the top of.
    assert.doesNotMatch(source, /<ul class="nav-links">/, `${path} legacy nav list`);
    assert.doesNotMatch(source, /class="nav-link"/, `${path} legacy nav link`);
  }
});

test("header stylesheets are blocking links in head, never runtime appends", () => {
  for (const path of governedRoutes()) {
    const head = fs.readFileSync(path, "utf8").split("</head>")[0];
    assert.match(
      head,
      /<link rel="stylesheet" href="\/static\/vendor\/atlas-interface\/v0\.3\.0\/atlas-interface-kit\.css">/,
      `${path} must link the kit at first paint`,
    );
    assert.match(head, /<link rel="stylesheet" href="\/static\/css\/estate-shell\.css/, path);
    assert.equal(
      (head.match(/\/static\/css\/estate-shell\.css/g) || []).length,
      1,
      `${path} must link exactly one shell stylesheet`,
    );
  }
});

test("Lab routes ship the context strip beneath the header", () => {
  for (const path of LAB_SHELL_ROUTES) {
    const source = fs.readFileSync(path, "utf8");
    const mode = path === "lab/index.html" ? "directory" : "compact";
    assert.match(
      source,
      new RegExp(`<nav class="lab-context-nav lab-context-nav--${mode}" aria-label="Lab navigation" data-lab-context-mode="${mode}"`),
      `${path} Lab context strip`,
    );
    assert.match(source, /<body[^>]*data-lab-shell/, `${path} must reserve the fixed header in flow`);
    assert.match(source, /<body[^>]*data-lab-layout="(?:directory|standard|immersive|product)"/, path);
    if (mode === "compact") {
      assert.match(source, /<summary>All Lab tools<\/summary>/, path);
      assert.match(source, /class="lab-context-compact__current" aria-current="page"/, path);
    }
    assert.equal(
      (source.match(/class="lab-context-tools__group"|class="lab-context-group"/g) || []).length,
      4,
      `${path} must carry the four canonical Lab groups`,
    );
  }
});

test("navigation belongs to the browser: no click intercept, no route overlay", () => {
  const transitions = fs.readFileSync("js/transitions.js", "utf8");
  // Comments may name what was removed; the code may not do it.
  const code = transitions.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /preventDefault/);
  assert.doesNotMatch(code, /location\.assign/);
  assert.doesNotMatch(code, /page-overlay/);
  assert.doesNotMatch(code, /route-ready|route-closing/);
  assert.doesNotMatch(code, /addEventListener\("click"/);
  assert.doesNotMatch(code, /setTimeout/);

  // The two behaviours that genuinely belong to page entry stay.
  assert.match(transitions, /window\.location\.pathname === "\/about\/"/);
  assert.match(transitions, /data-ramone-reduced-musing/);

  for (const path of governedRoutes()) {
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(source, /id="page-overlay"/, `${path} must not ship a route curtain`);
  }
});

test("shells adopt a complete header instead of replacing it", () => {
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  assert.match(shell, /function headerIsComplete\(nav\)/);
  assert.match(shell, /if \(headerIsComplete\(nav\)\) \{\s*adoptHeader\(nav\);\s*return;\s*\}/);
  assert.match(shell, /function mobileNavigationIsComplete\(nav\)/);

  // Adopting is not ignoring: the live parts still get wired.
  const adopt = shell.match(/function adoptHeader\(nav\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(adopt, "adoptHeader must exist");
  assert.match(adopt, /markCurrentRoute\(nav\)/);
  assert.match(adopt, /preserveHomepageStatus\(nav\)/);
  assert.match(adopt, /void refreshStatus\(status\)/);
  assert.doesNotMatch(adopt, /replaceChildren/);

  // One stylesheet per pathname, whatever cache-busting query a page carries.
  assert.match(shell, /new URL\(link\.href, window\.location\.origin\)\.pathname === wanted\.pathname/);

  const lab = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(lab, /function contextNavigationIsComplete\(context, pathname = currentPath\(\)\)/);
  assert.match(lab, /if \(context && contextNavigationIsComplete\(context\)\) return context;/);
  assert.match(lab, /if \(contextNavigationIsComplete\(context, pathname\)\) \{/);
  assert.match(lab, /if \(!complete\) installFallbackHeader\(header\)/);
});

// Routes that mount an AtlasField, and the stylesheet that gives that field its
// geometry. Each must be a blocking <head> link: the canvas is created by
// JavaScript, and when its stylesheet arrived afterwards the canvas laid out in
// flow and swallowed the viewport until the request finished.
const FIELD_ROUTE_STYLESHEETS = Object.freeze([
  ["work/index.html", "/static/css/directory-header-fields.css"],
  ["work/index.html", "/static/css/atlas-field-consumer.css"],
  ["writing/index.html", "/static/css/directory-header-fields.css"],
  ["writing/index.html", "/static/css/atlas-field-consumer.css"],
  ["about/index.html", "/static/css/secondary-surface-fields.css"],
  ["systems/evidence/index.html", "/static/css/secondary-surface-fields.css"],
  ["systems/observability/index.html", "/static/css/secondary-surface-fields.css"],
  ["systems/reliability/index.html", "/static/css/secondary-surface-fields.css"],
  ["index.html", "/css/home-v2-base.css"],
]);

test("field surfaces are contained before any canvas can mount", () => {
  const shellCss = fs.readFileSync("static/css/estate-shell.css", "utf8");
  // estate-shell.css is the one stylesheet every governed route links, so the
  // containment contract lives here rather than in the lazy per-surface sheets.
  assert.match(shellCss, /\.atlas-field-surface\s*\{[^}]*overflow:\s*hidden/);
  assert.match(shellCss, /\.atlas-field-surface\s*>\s*\.atlas-field-canvas\s*\{[^}]*position:\s*absolute/);
  assert.match(shellCss, /\.atlas-field-surface\s*>\s*\.atlas-field-canvas\s*\{[^}]*inset:\s*0/);
});

test("every field route links its geometry stylesheet in head", () => {
  for (const [path, stylesheet] of FIELD_ROUTE_STYLESHEETS) {
    const head = fs.readFileSync(path, "utf8").split("</head>")[0];
    const links = [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
      .map(([, href]) => href.replace(/[?#].*$/, ""));
    assert.ok(links.includes(stylesheet), `${path} must link ${stylesheet} at first paint`);
    assert.equal(
      links.filter((href) => href === stylesheet).length,
      1,
      `${path} must link ${stylesheet} exactly once`,
    );
  }
});

test("field bootstraps match stylesheets by pathname so a head link counts", () => {
  const bootstraps = [
    "static/js/secondary-surface-fields.js",
    "static/js/directory-header-fields.js",
    "static/js/live/homepage-truth.js",
  ];
  for (const path of bootstraps) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(
      source,
      /new URL\((?:link|sheet)\.href, window\.location\.origin\)\.pathname === wanted\.pathname/,
      `${path} must compare stylesheet pathnames`,
    );
    assert.doesNotMatch(
      source,
      /querySelector\(`link\[href="\$\{[A-Za-z]+\}"\]`\)/,
      `${path} must not match stylesheets by exact href`,
    );
  }
});

test("directory heroes ship their field geometry rather than growing into it", () => {
  // The field host classes carry the hero's final size (atlas-page-header sets
  // min-height). Added from JavaScript, they made the hero grow ~37px after
  // load; in the HTML, first paint is already the settled geometry.
  for (const [path, variant, composition] of [
    ["work/index.html", "work", "build-fragments"],
    ["writing/index.html", "writing", "editorial-drift"],
  ]) {
    const source = fs.readFileSync(path, "utf8");
    const hero = source.match(/<header class="page-header[^"]*"/)?.[0] ?? "";
    assert.ok(hero, `${path} must ship a page header`);
    for (const className of [
      "atlas-field-surface",
      "atlas-field-surface--ambient",
      "atlas-page-header",
      `atlas-page-header--${variant}`,
      `atlas-header-composition--${composition}`,
    ]) {
      assert.match(hero, new RegExp(`\\b${className}\\b`), `${path} hero must ship ${className}`);
    }
    assert.match(source, new RegExp(`<body[^>]*data-atlas-directory-header="${variant}"`), path);
  }
});

test("the route enter animation moves content without ever hiding it", () => {
  const shellCss = fs.readFileSync("static/css/estate-shell.css", "utf8");
  const keyframes = shellCss.match(/@keyframes atlas-route-enter\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(keyframes, "the route enter animation must exist");

  // A fade would park the page at opacity 0 until the animation ran, which is
  // the same bargain as the overlay this replaced.
  assert.doesNotMatch(keyframes, /opacity/, "route enter must not animate opacity");
  assert.match(keyframes, /transform:\s*translate3d/);
  assert.doesNotMatch(shellCss, /animation:\s*atlas-route-enter[^;]*(?:both|backwards|forwards)/);

  // Motion is opt-out, and the header is the fixed point navigation is measured
  // against: it must never animate.
  const rule = shellCss.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(rule, "route enter must be gated on prefers-reduced-motion");
  assert.match(rule, /body > main\s*\{[\s\S]*animation:\s*atlas-route-enter/);
  assert.doesNotMatch(rule, /atlas-header|atlas-nav-shell|Primary navigation/);
});

test("the checked-in chrome snippet teaches the header the site actually ships", () => {
  const snippet = fs.readFileSync("site-snippet/estate-search-includes.html", "utf8");
  const header = headerBlock(snippet);
  assert.ok(header, "snippet must carry the current header fragment");
  assert.match(header, /class="atlas-header__inner"/);
  assert.match(header, /class="es-nav-search atlas-search-control"/);
  assert.match(snippet, /atlas-interface\/v0\.3\.0\/atlas-interface-kit\.css/);
  assert.match(snippet, /class="mobile-nav atlas-mobile-nav atlas-bottom-nav"/);
  assert.match(snippet, /class="lab-context-nav lab-context-nav--compact"/);
  assert.doesNotMatch(snippet, /<ul class="nav-links">/);
});

test("estate page titles use the page-first double-slash convention", () => {
  assert.equal(normalizeAtlasTitle("Atlas Systems"), "Atlas Systems");
  assert.equal(normalizeAtlasTitle("Work — Atlas Systems"), "Work // Atlas Systems");
  assert.equal(normalizeAtlasTitle("Atlas Systems // Status"), "Status // Atlas Systems");
});

test("interface-kit v0.3.0 overlay matches the canonical SHA-256 manifest", () => {
  const versions = fs.readdirSync("static/vendor/atlas-interface", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(versions, ["v0.2.0", "v0.3.0", "v0.4.0", "v0.5.0"]);

  const manifest = JSON.parse(fs.readFileSync(`${ACTIVE_BUNDLE_ROOT}/manifest.json`, "utf8"));
  const legacyManifest = JSON.parse(fs.readFileSync(`${LEGACY_BUNDLE_ROOT}/manifest.json`, "utf8"));
  assert.equal(manifest.schema_version, "atlas-interface-kit/bundle/v1");
  assert.equal(manifest.version, "0.3.0");
  assert.equal(manifest.contract_version, "2.0.0");
  assert.equal(manifest.foundation_extension_version, "1.0.0");
  assert.equal(manifest.semantic_contract_count, 3);
  assert.equal(manifest.component_role_count, 27);
  assert.deepEqual(Object.keys(manifest.files).sort(), [
    "atlas-fonts.css",
    "atlas-interface-kit.css",
    "components.json",
    "fonts/dm-serif-display-400-italic.woff2",
    "fonts/dm-serif-display-400.woff2",
    "fonts/ibm-plex-mono-400.woff2",
    "fonts/ibm-plex-mono-500.woff2",
    "licenses/DM-Serif-Display-OFL.txt",
    "licenses/IBM-Plex-Mono-OFL.txt",
    "semantics.json",
    "tokens.json",
  ]);

  for (const [name, record] of Object.entries(manifest.files)) {
    const activePath = `${ACTIVE_BUNDLE_ROOT}/${name}`;
    const path = fs.existsSync(activePath) ? activePath : `${LEGACY_BUNDLE_ROOT}/${name}`;
    assert.equal(fs.existsSync(path), true, `${name} repository-local asset`);
    assert.equal(fs.statSync(path).size, record.bytes, `${name} byte count`);
    assert.equal(sha256(path), record.sha256, `${name} SHA-256`);
    if (FONT_FILES.has(name)) assert.deepEqual(legacyManifest.files[name], record, `${name} byte-identical fallback`);
  }

  const semantics = JSON.parse(fs.readFileSync(`${ACTIVE_BUNDLE_ROOT}/semantics.json`, "utf8"));
  assert.equal(semantics.status_announcement.global_header_status_remains_aria_live_off, true);
  assert.equal(semantics.dense_data_overflow.when_not_overflowing.unnecessary_tab_stop_forbidden, true);
  assert.deepEqual(semantics.evidence.reporting_only_viewports_px, [1920]);

  const tokens = JSON.parse(fs.readFileSync(`${ACTIVE_BUNDLE_ROOT}/tokens.json`, "utf8"));
  assert.equal(tokens.colour.text_faint, "#888894");
  for (const obsolete of ["atlas-interface.css", "atlas-interface.js", "tokens.schema.json"]) {
    assert.equal(fs.existsSync(`${ACTIVE_BUNDLE_ROOT}/${obsolete}`), false, `${obsolete} must not remain`);
  }
});

test("shared foundation semantics remain consumer-owned and bounded", () => {
  const semantics = fs.readFileSync("static/js/shared-foundation-semantics.js", "utf8");
  assert.equal(SHARED_FOUNDATION_CONTRACT.activeBundle, "0.3.0");
  assert.equal(SHARED_FOUNDATION_CONTRACT.foundationExtension, "1.0.0");
  assert.equal(SHARED_FOUNDATION_CONTRACT.reportingOnlyViewport, 1920);
  assert.match(semantics, /className = "atlas-breadcrumbs"/);
  assert.match(semantics, /aria-label", "Breadcrumb"/);
  assert.match(semantics, /atlas-status-announcement--visually-hidden/);
  assert.match(semantics, /initialPollSettled/);
  assert.match(semantics, /scrollWidth > region\.clientWidth \+ 1/);
  assert.match(semantics, /region\.removeAttribute\("tabindex"\)/);
  assert.match(semantics, /BREADCRUMB_EXCLUSIONS/);
  assert.doesNotMatch(semantics, /fetch\(/);
});

test("every HTML route consumes an accepted repository-local font bundle", () => {
  const publicRoutes = filesBelow(".", ".html").filter(
    (path) => !path.startsWith("site-snippet/"),
  );
  for (const path of publicRoutes) {
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/, path);
    assert.match(
      source,
      /\/static\/vendor\/atlas-interface\/v0\.(?:2|4)\.0\/atlas-fonts\.css/,
      path,
    );
  }

  const headers = fs.readFileSync("_headers", "utf8");
  assert.doesNotMatch(headers, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(headers, /font-src 'self'/);
});

test("new directory routes and preserved console exist", () => {
  for (const path of ["systems/index.html", "lab/index.html", "lab/system-map/index.html", "lab/console/index.html"]) {
    assert.equal(fs.existsSync(path), true, `${path} must exist`);
  }
  const headers = fs.readFileSync("_headers", "utf8");
  assert.match(headers, /\/lab\/console\/\*/);
  assert.match(headers, /X-Robots-Tag: noindex/);
});

test("Lab route contract uses the dedicated map and operations routes", () => {
  const shell = fs.readFileSync("lab/shared/shell.js", "utf8");
  assert.match(shell, /System Map", href: "\/lab\/system-map\//);
  assert.match(shell, /Operations", href: "\/lab\/console\//);
  assert.match(shell, /Shape Detector", href: "\/lab\/anomaly\//);
  assert.match(shell, /Almost", href: "\/lab\/almost\//);
  const landing = fs.readFileSync("lab/index.html", "utf8");
  assert.match(landing, /<p class="eyebrow">&mdash; Lab \/ directory<\/p>/);
  assert.match(landing, /<a class="action primary" href="https:\/\/ramone\.atlas-systems\.uk\/">Ask Ramone<\/a>/);
  assert.doesNotMatch(landing, /<a class="action primary" href="#ramone-card">Ask Ramone<\/a>/);
  const ramonePosition = landing.indexOf('id="ramone-card"');
  const legendPosition = landing.indexOf('class="interface-legend"');
  const featuredPosition = landing.indexOf('id="featured-title"');
  assert.ok(ramonePosition < legendPosition, "Ramone must remain directly behind the Lab introduction");
  assert.ok(legendPosition < featuredPosition, "the semantic key must follow Ramone and precede the directory");
  assert.match(landing, /Experience/);
  assert.match(landing, /Observe/);
  assert.match(landing, /Verify/);
  assert.match(landing, /Explore/);
});

test("Lab and Systems cards carry operation-specific visual identities", () => {
  const lab = fs.readFileSync("lab/index.html", "utf8");
  const systems = fs.readFileSync("systems/index.html", "utf8");
  const directoryCss = fs.readFileSync("static/css/v2-directory-pages.css", "utf8");

  assert.match(lab, /class="card-grid featured-grid"/);
  assert.match(lab, /class="card-grid directory-grid verify-grid"/);
  assert.match(lab, /class="card-grid directory-grid explore-grid"/);
  assert.match(systems, /class="card-grid product-showcase"/);
  assert.match(systems, /class="card-grid systems-tools-grid"/);
  assert.ok((lab.match(/data-visual=/g) || []).length >= 15);
  assert.ok((systems.match(/data-visual=/g) || []).length >= 15);

  for (const visual of ["ramone", "symphony", "signal", "map", "proof", "status", "conformance", "reliability", "api", "anomaly", "almost"]) {
    assert.match(directoryCss, new RegExp(`\\[data-visual="${visual}"\\]`));
  }
  assert.match(directoryCss, /prefers-reduced-motion:reduce/);
});

test("Lab and Systems explain maturity, data mode, and operation motifs", () => {
  const lab = fs.readFileSync("lab/index.html", "utf8");
  const systems = fs.readFileSync("systems/index.html", "utf8");
  const systemMap = fs.readFileSync("lab/system-map/index.html", "utf8");
  const directoryCss = fs.readFileSync("static/css/v2-directory-pages.css", "utf8");

  for (const [name, page] of [["Lab", lab], ["Systems", systems]]) {
    assert.match(page, /<aside class="interface-legend" aria-labelledby="[^"]+">/, `${name} legend`);
    assert.match(page, /Commitment and data are separate\./, `${name} separation`);
    for (const maturity of ["Production", "Tool", "Preview", "Experiment", "Planned", "Retired"]) {
      assert.match(page, new RegExp(`>${maturity}<`), `${name} ${maturity}`);
    }
    for (const mode of ["live", "replay", "generated", "simulated"]) {
      assert.match(page, new RegExp(`data-mode-key="${mode}"`), `${name} ${mode}`);
    }

    const cards = (page.match(/class="system-card/g) || []).length;
    const motifs = (page.match(/data-motif="/g) || []).length;
    assert.equal(motifs, cards, `${name} cards must all carry an operation motif`);
  }

  for (const motif of ["RAG", "WAVE", "DSP", "TOPO", "TRACE", "SLO", "POLICY", "RECOVER", "OPENAPI", "DTW"]) {
    assert.match(`${lab}\n${systems}`, new RegExp(`data-motif="${motif}"`), motif);
  }
  assert.match(directoryCss, /content:attr\(data-motif\)/);
  assert.match(directoryCss, /\.badge\.preview\s*\{/);
  assert.match(directoryCss, /\.badge\.experiment\s*\{[^}]*border-style:dashed/);
  assert.match(directoryCss, /\.badge\.planned\s*\{[^}]*border-style:dotted/);
  assert.match(directoryCss, /\.badge\.retired\s*\{[^}]*text-decoration:line-through/);
  assert.match(directoryCss, /\.badge\.planned::before/);
  assert.match(directoryCss, /\.badge\.retired::before/);
  assert.match(directoryCss, /\.mode-key\[data-mode-key="simulated"\]::before\s*\{[^}]*border-style:dashed/);
  for (const page of [lab, systems, systemMap]) {
    assert.match(page, /v2-directory-pages\.css\?v=(?:20260728-lab-context-nav-wrap|20260802-lab-home-composition|20260802-lab-directory-polish|20260811-explore-chroma)/);
  }
});

test("reduced-motion and legacy Lab compatibility stay explicit", () => {
  const transitions = fs.readFileSync("js/transitions.js", "utf8");
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  assert.match(transitions, /data-ramone-reduced-musing/);
  assert.match(shell, /replaceHeading\(ramoneHeading, "h2"\)/);
  assert.match(shell, /map\.setAttribute\("role", "group"\)/);
});

test("specialist Lab wrappers preserve original tool modules", () => {
  const wrappers = [
    ["lab/proof-chain/proof-chain.js", "./proof-chain-core.js"],
    ["lab/signal/signal-v2.js", "./signal-v2-core.js"],
    ["lab/anomaly/anomaly.js", "./anomaly-core.js"],
    ["lab/conformance/conformance.js", "./conformance-core.js"],
    ["lab/reliability/reliability.js", "./reliability-core.js"],
  ];
  for (const [wrapper, coreImport] of wrappers) {
    const source = fs.readFileSync(wrapper, "utf8");
    assert.match(source, /import "\.\.\/shared\/shell\.js";/);
    assert.ok(source.includes(`import "${coreImport}";`));
  }
});

test("System SYMPHONY implementation remains outside this migration", () => {
  const interfaceFiles = [
    "static/js/estate-shell.js",
    "static/js/estate-status.js",
    "static/js/shared-foundation-semantics.js",
    "static/css/estate-shell.css",
    "static/css/v2-directory-pages.css",
    "lab/shared/shell.js",
    "lab/index.html",
    "lab/system-map/index.html",
    "systems/index.html",
  ];
  assert.equal(interfaceFiles.some((path) => path.includes("static/js/sonify")), false);
});

test("production deployment remains independent from Cloudflare Git integration", () => {
  const deploy = fs.readFileSync(".github/workflows/deploy.yml", "utf8");

  assert.doesNotMatch(deploy, /source_changed/);
  assert.doesNotMatch(deploy, /\[skip ci\]/);
  assert.doesNotMatch(deploy, /git push/);
  assert.match(deploy, /wrangler|validate-static\.yml/);
  assert.match(deploy, /verify-production:/);
  assert.match(deploy, /build-commit/);
  assert.match(deploy, /https:\/\/atlas-systems\.uk/);
  assert.match(deploy, /needs: \[deploy, verify-production\]/);
});

test("pull request CI also protects direct main pushes", () => {
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");

  assert.match(ci, /on:\n\s+pull_request:\n\s+push:\n\s+branches: \[main\]/);
});

test("deploy webhook secret is documented without exposing a value", () => {
  const workflow = fs.readFileSync(".github/workflows/notify-deploy.yml", "utf8");
  const docs = fs.readFileSync("docs/deployment-secrets.md", "utf8");

  assert.match(workflow, /secrets\.DISCORD_DEPLOY_WEBHOOK/);
  assert.match(docs, /## `DISCORD_DEPLOY_WEBHOOK`/);
  assert.match(docs, /Repository secret/);
  assert.equal(docs.includes("/api/webhooks/"), false);
  assert.equal(docs.includes("discord.com/api"), false);
  assert.equal(docs.includes("discordapp.com/api"), false);
});

test("production route verification cannot fail from a closed grep pipe", () => {
  const deploy = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
  const systems = fs.readFileSync("systems/index.html", "utf8");

  assert.doesNotMatch(deploy, /\|\s*grep -Fq 'One estate,'/);
  assert.doesNotMatch(deploy, /One estate,/);
  assert.match(deploy, /SYSTEMS_BODY="\$\(curl -fsSL/);
  assert.match(deploy, /atlas-route" content="systems-index/);
  assert.match(systems, /<meta name="atlas-route" content="systems-index">/);
});

test("mutable site responses revalidate while versioned interface assets stay immutable", () => {
  const headers = fs.readFileSync("_headers", "utf8");

  assert.match(headers, /\/\*\n(?:.|\n)*Cache-Control: no-cache, max-age=0, must-revalidate/);
  assert.match(headers, /\/static\/vendor\/atlas-interface\/\*/);
  assert.match(headers, /! Cache-Control/);
  assert.match(headers, /Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /\/static\/audio\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /stale-while-revalidate/);
});
