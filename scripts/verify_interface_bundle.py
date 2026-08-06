#!/usr/bin/env python3
"""Verify the pinned repository-local Atlas Interface Kit release."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR_ROOT = ROOT / "static/vendor/atlas-interface"
ACTIVE_VERSION = "0.5.0"
ACTIVE_ROOT = VENDOR_ROOT / f"v{ACTIVE_VERSION}"
PREVIOUS_ROOT = VENDOR_ROOT / "v0.4.0"
FOUNDATION_ROOT = VENDOR_ROOT / "v0.3.0"
LEGACY_ROOT = VENDOR_ROOT / "v0.2.0"
EXPECTED_DIRECTORIES = ["v0.2.0", "v0.3.0", "v0.4.0", "v0.5.0"]
UNCHANGED_ASSETS = {
    "atlas-fonts.css",
    "fonts/dm-serif-display-400-italic.woff2",
    "fonts/dm-serif-display-400.woff2",
    "fonts/ibm-plex-mono-400.woff2",
    "fonts/ibm-plex-mono-500.woff2",
    "licenses/DM-Serif-Display-OFL.txt",
    "licenses/IBM-Plex-Mono-OFL.txt",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    directories = sorted(path.name for path in VENDOR_ROOT.iterdir() if path.is_dir())
    require(directories == EXPECTED_DIRECTORIES, f"unexpected interface-kit directories: {directories}")

    manifest = read_json(ACTIVE_ROOT / "manifest.json")
    require(manifest.get("schema_version") == "atlas-interface-kit/bundle/v1", "invalid v0.5.0 manifest schema")
    require(manifest.get("version") == ACTIVE_VERSION, "v0.5.0 manifest version drifted")
    require(manifest.get("contract_version") == "2.0.0", "base interface contract version drifted")
    require(manifest.get("foundation_extension_version") == "1.0.0", "foundation extension version drifted")
    require(manifest.get("footer_extension_version") == "1.0.0", "footer extension version drifted")
    require(manifest.get("evidence_mode_extension_version") == "1.0.0", "evidence-mode extension version drifted")
    require(manifest.get("component_role_count") == 30, "component role count drifted")
    require(manifest.get("semantic_contract_count") == 5, "semantic contract count drifted")
    require(manifest.get("evidence_mode_count") == 7, "evidence mode count drifted")
    require(manifest.get("evidence_selector_count") == 3, "evidence selector count drifted")

    expected_files = set(manifest.get("files", {}))
    actual_files = {
        str(path.relative_to(ACTIVE_ROOT)).replace("\\", "/")
        for path in ACTIVE_ROOT.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    require(actual_files == expected_files, f"v0.5.0 file set drifted: {sorted(actual_files ^ expected_files)}")

    for relative, record in manifest["files"].items():
        path = ACTIVE_ROOT / relative
        require(path.stat().st_size == record["bytes"], f"byte size drifted for {relative}")
        require(sha256(path) == record["sha256"], f"fingerprint drifted for {relative}")

    previous_manifest = read_json(PREVIOUS_ROOT / "manifest.json")
    for relative in UNCHANGED_ASSETS:
        require(
            manifest["files"][relative] == previous_manifest["files"][relative],
            f"unchanged asset record drifted between v0.4.0 and v0.5.0: {relative}",
        )
        require(
            (ACTIVE_ROOT / relative).read_bytes() == (PREVIOUS_ROOT / relative).read_bytes(),
            f"unchanged asset bytes drifted between v0.4.0 and v0.5.0: {relative}",
        )

    components = read_json(ACTIVE_ROOT / "components.json")
    require(components.get("version") == ACTIVE_VERSION, "component contract version drifted")
    evidence = components.get("evidence_mode", {})
    require(evidence.get("mode_attribute") == "data-evidence-mode", "evidence-mode attribute drifted")
    require(evidence.get("mode_label_selector") == ".atlas-evidence-mode", "evidence label selector drifted")
    require(evidence.get("surface_selector") == ".atlas-evidence-surface", "evidence surface selector drifted")
    require(evidence.get("value_selector") == ".atlas-evidence-value", "evidence value selector drifted")
    require(set(evidence.get("mode_selectors", {})) == {
        "measured",
        "stale-measured",
        "recorded-replay",
        "simulated",
        "unavailable",
        "unknown",
        "not-applicable-unscored",
    }, "evidence mode selector set drifted")

    semantics = read_json(ACTIVE_ROOT / "semantics.json")
    authority = semantics.get("evidence_mode_authority", {})
    require(semantics.get("version") == ACTIVE_VERSION, "semantic contract version drifted")
    require(authority.get("visible_mode_label_required") is True, "visible evidence labels are no longer required")
    require(authority.get("machine_readable_mode_required") is True, "machine-readable evidence mode is no longer required")
    require(authority.get("zero_may_not_represent") == [
        "unavailable",
        "unknown",
        "not-applicable-unscored",
    ], "zero prohibition drifted")
    require(authority.get("directory_and_destination_vocabulary_must_agree") is True, "directory vocabulary contract drifted")
    require(authority.get("fallback_mode_must_remain_visible_across_primary_state_metrics_tables_and_charts") is True, "fallback visibility contract drifted")

    tokens = read_json(ACTIVE_ROOT / "tokens.json")
    require(tokens.get("version") == ACTIVE_VERSION, "token version drifted")
    require(tokens.get("control_px", {}).get("touch_min") == 44, "44px touch minimum drifted")

    css = (ACTIVE_ROOT / "atlas-interface-kit.css").read_text(encoding="utf-8")
    for fragment in (
        "Atlas Interface Kit v0.5.0",
        ".atlas-evidence-mode",
        ".atlas-evidence-surface",
        ".atlas-evidence-value",
        "data-evidence-mode='simulated'",
        "data-evidence-mode='unavailable'",
        "--atlas-touch-min: 44px",
    ):
        require(fragment in css, f"v0.5.0 CSS contract missing {fragment}")
    require("url(http" not in css.lower(), "remote runtime CSS dependency detected")

    shell = (ROOT / "static/js/estate-shell.js").read_text(encoding="utf-8")
    require("/static/vendor/atlas-interface/v0.3.0/atlas-interface-kit.css" in shell, "global shell foundation changed outside this bounded adoption")
    require("/static/vendor/atlas-interface/v0.5.0/atlas-interface-kit.css" not in shell, "v0.5.0 must remain bounded to evidence surfaces")

    require((LEGACY_ROOT / "manifest.json").exists(), "legacy v0.2.0 evidence is missing")
    require((FOUNDATION_ROOT / "manifest.json").exists(), "foundation v0.3.0 evidence is missing")
    print("Atlas Interface Kit v0.5.0 bundle verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
