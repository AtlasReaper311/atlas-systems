import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const activeRoot = path.join(root, "static/vendor/atlas-interface/v0.5.0");
const previousRoot = path.join(root, "static/vendor/atlas-interface/v0.4.0");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("Interface Kit v0.5.0 is a complete pinned release with exact fingerprints", () => {
  const manifest = readJson("static/vendor/atlas-interface/v0.5.0/manifest.json");
  assert.equal(manifest.version, "0.5.0");
  assert.equal(manifest.evidence_mode_extension_version, "1.0.0");
  assert.equal(manifest.evidence_mode_count, 7);
  assert.equal(manifest.evidence_selector_count, 3);
  assert.equal(manifest.component_role_count, 30);
  assert.equal(manifest.semantic_contract_count, 5);

  const actualFiles = fs.readdirSync(activeRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(activeRoot, path.join(entry.parentPath ?? entry.path, entry.name)).replaceAll(path.sep, "/"))
    .filter((relative) => relative !== "manifest.json")
    .sort();
  assert.deepEqual(actualFiles, Object.keys(manifest.files).sort());

  for (const [relative, record] of Object.entries(manifest.files)) {
    const file = path.join(activeRoot, relative);
    assert.equal(fs.statSync(file).size, record.bytes, `${relative} byte size`);
    assert.equal(digest(file), record.sha256, `${relative} fingerprint`);
  }
});

test("Interface Kit v0.5.0 publishes the accepted evidence contract", () => {
  const components = readJson("static/vendor/atlas-interface/v0.5.0/components.json");
  const semantics = readJson("static/vendor/atlas-interface/v0.5.0/semantics.json");
  const tokens = readJson("static/vendor/atlas-interface/v0.5.0/tokens.json");
  const css = read("static/vendor/atlas-interface/v0.5.0/atlas-interface-kit.css");

  assert.equal(components.version, "0.5.0");
  assert.deepEqual(new Set(Object.keys(components.evidence_mode.mode_selectors)), new Set([
    "measured",
    "stale-measured",
    "recorded-replay",
    "simulated",
    "unavailable",
    "unknown",
    "not-applicable-unscored",
  ]));
  assert.equal(semantics.evidence_mode_authority.visible_mode_label_required, true);
  assert.equal(semantics.evidence_mode_authority.machine_readable_mode_required, true);
  assert.deepEqual(semantics.evidence_mode_authority.zero_may_not_represent, [
    "unavailable",
    "unknown",
    "not-applicable-unscored",
  ]);
  assert.equal(tokens.control_px.touch_min, 44);
  for (const selector of [".atlas-evidence-mode", ".atlas-evidence-surface", ".atlas-evidence-value"]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
});

test("unchanged fonts and licences remain byte-identical to v0.4.0", () => {
  for (const relative of [
    "atlas-fonts.css",
    "fonts/dm-serif-display-400-italic.woff2",
    "fonts/dm-serif-display-400.woff2",
    "fonts/ibm-plex-mono-400.woff2",
    "fonts/ibm-plex-mono-500.woff2",
    "licenses/DM-Serif-Display-OFL.txt",
    "licenses/IBM-Plex-Mono-OFL.txt",
  ]) {
    assert.deepEqual(
      fs.readFileSync(path.join(activeRoot, relative)),
      fs.readFileSync(path.join(previousRoot, relative)),
      relative,
    );
  }
});

test("v0.5.0 adoption remains bounded to the corrected evidence surfaces", () => {
  const shell = read("static/js/estate-shell.js");
  assert.match(shell, /v0\.3\.0\/atlas-interface-kit\.css/);
  assert.doesNotMatch(shell, /v0\.5\.0\/atlas-interface-kit\.css/);
  assert.match(read("lab/anomaly/anomaly.css"), /v0\.5\.0\/atlas-interface-kit\.css/);
  assert.match(read("lab/conformance/conformance.css"), /v0\.5\.0\/atlas-interface-kit\.css/);
});
