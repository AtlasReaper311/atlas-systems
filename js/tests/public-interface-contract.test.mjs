import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { SHARED_FOUNDATION_CONTRACT } from "../../static/js/shared-foundation-semantics.js";

const LEGACY_BUNDLE_ROOT = "static/vendor/atlas-interface/v0.2.0";
const FOUNDATION_BUNDLE_ROOT = "static/vendor/atlas-interface/v0.3.0";
const ACTIVE_BUNDLE_ROOT = FOUNDATION_BUNDLE_ROOT;
const RELEASE_MANIFEST = `${ACTIVE_BUNDLE_ROOT}/manifest.json`;
const EXPECTED_RELEASE_FILES = [
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
];

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function filesBelow(root, suffix = "") {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    if (entry.name === ".git" || entry.name === "node_modules") return [];
    return entry.isDirectory()
      ? filesBelow(path, suffix)
      : suffix === "" || entry.name.endsWith(suffix)
        ? [path.replace(/^\.\//, "")]
        : [];
  });
}

test("active interface bundle matches the immutable release manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(RELEASE_MANIFEST, "utf8"));
  assert.equal(manifest.schema_version, "atlas-interface-kit/bundle/v1");
  assert.equal(manifest.version, "0.3.0");
  assert.equal(manifest.contract_version, "2.0.0");
  assert.equal(manifest.foundation_extension_version, "1.0.0");
  assert.deepEqual(Object.keys(manifest.files).sort(), [...EXPECTED_RELEASE_FILES].sort());

  for (const [name, record] of Object.entries(manifest.files)) {
    const path = `${ACTIVE_BUNDLE_ROOT}/${name}`;
    assert.equal(fs.existsSync(path), true, `${name} must exist`);
    assert.equal(fs.statSync(path).size, record.bytes, `${name} byte count`);
    assert.equal(sha256(path), record.sha256, `${name} SHA-256`);
  }
});

test("v0.2.0 compatibility assets remain byte-identical where required", () => {
  const activeManifest = JSON.parse(fs.readFileSync(RELEASE_MANIFEST, "utf8"));
  const legacyManifest = JSON.parse(
    fs.readFileSync(`${LEGACY_BUNDLE_ROOT}/manifest.json`, "utf8"),
  );
  const sharedFiles = [
    "atlas-fonts.css",
    "fonts/dm-serif-display-400-italic.woff2",
    "fonts/dm-serif-display-400.woff2",
    "fonts/ibm-plex-mono-400.woff2",
    "fonts/ibm-plex-mono-500.woff2",
    "licenses/DM-Serif-Display-OFL.txt",
    "licenses/IBM-Plex-Mono-OFL.txt",
  ];
  for (const name of sharedFiles) {
    assert.equal(
      legacyManifest.files[name].sha256,
      activeManifest.files[name].sha256,
      `${name} release identity`,
    );
    assert.equal(
      sha256(`${LEGACY_BUNDLE_ROOT}/${name}`),
      sha256(`${ACTIVE_BUNDLE_ROOT}/${name}`),
      `${name} checked-in bytes`,
    );
  }
});

test("consumer points to one local active interface overlay", () => {
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  assert.match(
    shell,
    /const INTERFACE_KIT_STYLESHEET = "\/static\/vendor\/atlas-interface\/v0\.3\.0\/atlas-interface-kit\.css"/,
  );
  assert.doesNotMatch(shell, /v0\.2\.0\/atlas-interface-kit\.css/);
  assert.doesNotMatch(shell, /atlas-interface-kit\.js/);
  assert.doesNotMatch(shell, /unpkg|jsdelivr|cdnjs/);
});

test("active bundle exposes accepted semantic roles", () => {
  const components = JSON.parse(
    fs.readFileSync(`${ACTIVE_BUNDLE_ROOT}/components.json`, "utf8"),
  );
  assert.deepEqual(
    components.roles.map(({ role }) => role),
    ["breadcrumbs", "skip-link", "status-announcement"],
  );
  assert.equal(components.breadcrumbs.list_selector, ".atlas-breadcrumbs__list");
  assert.equal(
    components.status_announcement.visually_hidden_selector,
    ".atlas-status-announcement--visually-hidden",
  );

  const semantics = JSON.parse(fs.readFileSync(`${ACTIVE_BUNDLE_ROOT}/semantics.json`, "utf8"));
  assert.equal(semantics.breadcrumb_authority.separator_text, "/");
  assert.equal(semantics.breadcrumb_authority.current_page_aria_current, "page");
  assert.equal(semantics.skip_link_authority.target_id, "main-content");
  assert.equal(
    semantics.status_announcement_authority.initial_poll_quiet,
    true,
  );

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

test("every HTML route consumes approved repository-local fonts without generated output edits", () => {
  const publicRoutes = filesBelow(".", ".html").filter(
    (path) => !path.startsWith("site-snippet/"),
  );
  for (const path of publicRoutes) {
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/, path);
    assert.match(
      source,
      /\/static\/vendor\/atlas-interface\/v(?:0\.2\.0|0\.3\.0|0\.4\.0)\/atlas-fonts\.css/,
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
  const ramonePosition = landing.indexOf('id="ramone-card"');
  const legendPosition = landing.indexOf('class="interface-legend"');
  const featuredPosition = landing.indexOf('id="featured-title"');
  assert.ok(ramonePosition >= 0);
  assert.ok(legendPosition > ramonePosition);
  assert.ok(featuredPosition > legendPosition);
});
