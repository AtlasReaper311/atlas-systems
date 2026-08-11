import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const BUNDLE_ROOT = "static/vendor/atlas-interface/v0.4.0";
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

function filesBelow(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(absolutePath, relativePath) : [relativePath];
  });
}

test("interface-kit v0.4.0 assets match the immutable release contract", () => {
  const manifest = JSON.parse(fs.readFileSync(`${BUNDLE_ROOT}/manifest.json`, "utf8"));

  assert.equal(manifest.schema_version, "atlas-interface-kit/bundle/v1");
  assert.equal(manifest.version, "0.4.0");
  assert.equal(manifest.contract_version, "2.0.0");
  assert.equal(manifest.foundation_extension_version, "1.0.0");
  assert.equal(manifest.footer_extension_version, "1.0.0");
  assert.equal(manifest.semantic_contract_count, 4);
  assert.equal(manifest.footer_slot_count, 5);
  assert.equal(manifest.footer_variant_count, 4);
  assert.deepEqual(Object.keys(manifest.files).sort(), [...EXPECTED_RELEASE_FILES].sort());
  assert.deepEqual(
    filesBelow(BUNDLE_ROOT).sort(),
    ["manifest.json", ...EXPECTED_RELEASE_FILES].sort(),
    "the vendored directory must contain the complete release and no extra files",
  );

  for (const [name, record] of Object.entries(manifest.files)) {
    const path = `${BUNDLE_ROOT}/${name}`;
    assert.equal(fs.existsSync(path), true, `${name} must exist`);
    assert.equal(fs.statSync(path).size, record.bytes, `${name} byte count`);
    assert.equal(sha256(path), record.sha256, `${name} SHA-256`);
  }
});

test("interface-kit v0.4.0 exposes the accepted semantic footer contract", () => {
  const components = JSON.parse(fs.readFileSync(`${BUNDLE_ROOT}/components.json`, "utf8"));
  const semantics = JSON.parse(fs.readFileSync(`${BUNDLE_ROOT}/semantics.json`, "utf8"));
  const footerRole = components.roles.find(({ role }) => role === "footer");

  assert.deepEqual(footerRole, { role: "footer", selector: ".atlas-footer" });
  assert.equal(components.footer.base_selector, ".atlas-footer");
  assert.deepEqual(components.footer.variant_selectors, {
    editorial: ".atlas-footer--editorial",
    estate: ".atlas-footer--estate",
    product: ".atlas-footer--product",
    tool: ".atlas-footer--tool",
  });
  assert.deepEqual(components.footer.slot_selectors, {
    context: ".atlas-footer__context",
    estate_escape: ".atlas-footer__escape",
    evidence: ".atlas-footer__evidence",
    identity: ".atlas-footer__identity",
    sequence: ".atlas-footer__sequence",
  });

  const footer = semantics.footer_authority;
  assert.equal(footer.role, "footer");
  assert.equal(footer.selector, ".atlas-footer");
  assert.deepEqual(
    Object.fromEntries(Object.entries(footer.variants).map(([name, value]) => [name, value.selector])),
    {
      editorial: ".atlas-footer--editorial",
      estate: ".atlas-footer--estate",
      product: ".atlas-footer--product",
      tool: ".atlas-footer--tool",
    },
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(footer.slots).map(([name, value]) => [name, value.selector])),
    {
      context: ".atlas-footer__context",
      estate_escape: ".atlas-footer__escape",
      evidence: ".atlas-footer__evidence",
      identity: ".atlas-footer__identity",
      sequence: ".atlas-footer__sequence",
    },
  );
  assert.equal(footer.ownership.article_sequence_owner, "AtlasReaper311/atlas-scheduler");
  assert.equal(footer.slots.sequence.article_owner, "AtlasReaper311/atlas-scheduler");
  assert.equal(semantics.distribution.repository_local_assets_required, true);
  assert.equal(semantics.distribution.remote_runtime_dependency_forbidden, true);
  assert.equal(semantics.distribution.shared_runtime_javascript_forbidden, true);

  const bundleCss = fs.readFileSync(`${BUNDLE_ROOT}/atlas-interface-kit.css`, "utf8");
  const fontCss = fs.readFileSync(`${BUNDLE_ROOT}/atlas-fonts.css`, "utf8");
  assert.doesNotMatch(bundleCss, /https?:\/\//);
  assert.doesNotMatch(fontCss, /https?:\/\//);
});

test("asset readiness does not switch the live estate shell from v0.3.0", () => {
  const shell = fs.readFileSync("static/js/estate-shell.js", "utf8");
  assert.match(shell, /\/static\/vendor\/atlas-interface\/v0\.3\.0\/atlas-interface-kit\.css/);
  assert.doesNotMatch(shell, /\/static\/vendor\/atlas-interface\/v0\.4\.0\/atlas-interface-kit\.css/);
});
