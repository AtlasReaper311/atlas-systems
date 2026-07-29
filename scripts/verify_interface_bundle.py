#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
VENDOR_ROOT = ROOT / "static/vendor/atlas-interface"
ACTIVE_VERSION = "0.3.0"
LEGACY_VERSION = "0.2.0"
ACTIVE_ROOT = VENDOR_ROOT / f"v{ACTIVE_VERSION}"
LEGACY_ROOT = VENDOR_ROOT / f"v{LEGACY_VERSION}"
MANIFEST_PATH = ACTIVE_ROOT / "manifest.json"
FONT_FILES = {
    "fonts/dm-serif-display-400-italic.woff2",
    "fonts/dm-serif-display-400.woff2",
    "fonts/ibm-plex-mono-400.woff2",
    "fonts/ibm-plex-mono-500.woff2",
}
DEDUPLICATED_FILES = FONT_FILES | {
    "atlas-fonts.css",
    "licenses/DM-Serif-Display-OFL.txt",
    "licenses/IBM-Plex-Mono-OFL.txt",
}
EXPECTED_FILES = {
    "atlas-fonts.css",
    "atlas-interface-kit.css",
    "components.json",
    *FONT_FILES,
    "licenses/DM-Serif-Display-OFL.txt",
    "licenses/IBM-Plex-Mono-OFL.txt",
    "semantics.json",
    "tokens.json",
}
OBSOLETE_FILES = {
    "atlas-interface.css",
    "atlas-interface.js",
    "tokens.schema.json",
}


class BundleVerificationError(ValueError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise BundleVerificationError(f"JSON object required: {path}")
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise BundleVerificationError(message)


def release_path(name: str) -> Path:
    active = ACTIVE_ROOT / name
    if active.is_file():
        return active
    require(name in DEDUPLICATED_FILES, f"active bundle file is missing: {name}")
    fallback = LEGACY_ROOT / name
    require(fallback.is_file(), f"byte-identical legacy asset fallback is missing: {name}")
    return fallback


def verify() -> dict[str, Any]:
    version_directories = {
        path.name
        for path in VENDOR_ROOT.iterdir()
        if path.is_dir()
    }
    require(
        version_directories == {f"v{LEGACY_VERSION}", f"v{ACTIVE_VERSION}"},
        "expected the generated-content v0.2.0 compatibility bundle and active v0.3.0 bundle; "
        f"found {sorted(version_directories)}",
    )
    require(MANIFEST_PATH.is_file(), f"bundle manifest is missing: {MANIFEST_PATH}")
    manifest = load_json(MANIFEST_PATH)
    require(
        manifest.get("schema_version") == "atlas-interface-kit/bundle/v1",
        "unsupported interface bundle schema",
    )
    require(manifest.get("version") == ACTIVE_VERSION, "unexpected interface bundle version")
    require(manifest.get("contract_version") == "2.0.0", "unexpected public interface contract version")
    require(manifest.get("foundation_extension_version") == "1.0.0", "unexpected foundation extension version")
    require(manifest.get("semantic_contract_count") == 3, "unexpected semantic contract count")
    require(manifest.get("component_role_count") == 27, "unexpected component role count")

    files = manifest.get("files")
    require(isinstance(files, dict), "manifest files must be an object")
    require(set(files) == EXPECTED_FILES, "interface bundle file set drifted")

    active_files = {
        path.relative_to(ACTIVE_ROOT).as_posix()
        for path in ACTIVE_ROOT.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    require(
        active_files == EXPECTED_FILES - DEDUPLICATED_FILES,
        "active vendored overlay must contain each changed v0.3.0 asset and only deduplicate byte-identical unchanged assets",
    )

    legacy_manifest = load_json(LEGACY_ROOT / "manifest.json")
    legacy_files = legacy_manifest.get("files", {})
    for name, record in files.items():
        require(isinstance(record, dict), f"manifest record must be an object: {name}")
        path = release_path(name)
        require(path.stat().st_size == record.get("bytes"), f"byte count mismatch: {name}")
        require(sha256(path) == record.get("sha256"), f"SHA-256 mismatch: {name}")
        if name in DEDUPLICATED_FILES:
            require(legacy_files.get(name) == record, f"legacy asset is not byte-identical to v0.3.0: {name}")

    for name in OBSOLETE_FILES:
        require(not (ACTIVE_ROOT / name).exists(), f"obsolete interface file remains: {name}")

    css = (ACTIVE_ROOT / "atlas-interface-kit.css").read_text(encoding="utf-8")
    font_css = release_path("atlas-fonts.css").read_text(encoding="utf-8")
    require("http://" not in css and "https://" not in css, "bundle CSS has a remote runtime dependency")
    require("http://" not in font_css and "https://" not in font_css, "font CSS has a remote runtime dependency")
    require(":focus-visible" in css, "bundle CSS is missing visible focus")
    require("prefers-reduced-motion" in css, "bundle CSS is missing reduced-motion handling")
    require(".atlas-breadcrumbs" in css, "bundle CSS is missing breadcrumb foundations")
    require(".atlas-status-announcement" in css, "bundle CSS is missing announcement foundations")
    require(".atlas-table-wrap[data-overflow='true']" in css, "bundle CSS is missing overflow focus foundations")
    require(font_css.count("@font-face") == 4, "font CSS does not declare the approved faces")
    require(font_css.count("font-display: swap") == 4, "font CSS does not preserve swap rendering")

    components = load_json(ACTIVE_ROOT / "components.json")
    roles = components.get("roles")
    require(isinstance(roles, list), "component roles must be a list")
    require(len(roles) == manifest["component_role_count"], "component role count does not match manifest")
    role_names = {item.get("role") for item in roles if isinstance(item, dict)}
    require(len(role_names) == len(roles), "component roles are not unique")
    require("breadcrumb-navigation" in role_names, "breadcrumb role is missing")
    require("status-announcement" in role_names, "status announcement role is missing")

    semantics = load_json(ACTIVE_ROOT / "semantics.json")
    require(semantics.get("version") == ACTIVE_VERSION, "semantic contract version does not match manifest")
    require(semantics.get("authority", {}).get("foundation_extension_version") == "1.0.0", "semantic authority drifted")
    require(semantics.get("status_announcement", {}).get("global_header_status_remains_aria_live_off") is True, "global status live-region boundary drifted")
    require(semantics.get("dense_data_overflow", {}).get("when_not_overflowing", {}).get("unnecessary_tab_stop_forbidden") is True, "dense overflow tab-stop boundary drifted")
    require(semantics.get("evidence", {}).get("reporting_only_viewports_px") == [1920], "1920 evidence boundary drifted")
    distribution = semantics.get("distribution", {})
    require(distribution.get("repository_local_assets_required") is True, "repository-local asset boundary drifted")
    require(distribution.get("remote_runtime_dependency_forbidden") is True, "remote runtime dependency boundary drifted")
    require(distribution.get("shared_runtime_javascript_forbidden") is True, "shared runtime JavaScript boundary drifted")

    tokens = load_json(ACTIVE_ROOT / "tokens.json")
    require(tokens.get("version") == manifest["version"], "token version does not match manifest")
    require(tokens.get("contract_version") == manifest["contract_version"], "token contract version does not match manifest")
    require(tokens.get("colour", {}).get("text_faint") == "#888894", "accessible faint-text token drifted")
    return manifest


def main() -> int:
    manifest = verify()
    print(
        "Atlas interface bundle verified: "
        f"v{manifest['version']} / contract {manifest['contract_version']} / "
        f"extension {manifest['foundation_extension_version']} / "
        f"{len(manifest['files'])} files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
