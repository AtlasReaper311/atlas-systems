#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
VENDOR_ROOT = ROOT / "static/vendor/atlas-interface"
VERSION = "0.1.1"
BUNDLE_ROOT = VENDOR_ROOT / f"v{VERSION}"
MANIFEST_PATH = BUNDLE_ROOT / "manifest.json"
EXPECTED_FILES = {
    "atlas-interface-kit.css",
    "components.json",
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


def verify() -> dict[str, Any]:
    version_directories = {
        path.name
        for path in VENDOR_ROOT.iterdir()
        if path.is_dir()
    }
    require(
        version_directories == {f"v{VERSION}"},
        f"expected only v{VERSION}; found {sorted(version_directories)}",
    )
    require(MANIFEST_PATH.is_file(), f"bundle manifest is missing: {MANIFEST_PATH}")
    manifest = load_json(MANIFEST_PATH)
    require(
        manifest.get("schema_version") == "atlas-interface-kit/bundle/v1",
        "unsupported interface bundle schema",
    )
    require(manifest.get("version") == VERSION, "unexpected interface bundle version")
    require(
        manifest.get("contract_version") == "2.0.0",
        "unexpected public interface contract version",
    )
    require(
        manifest.get("component_role_count") == 25,
        "unexpected component role count",
    )

    files = manifest.get("files")
    require(isinstance(files, dict), "manifest files must be an object")
    require(set(files) == EXPECTED_FILES, "interface bundle file set drifted")

    actual_files = {
        path.name
        for path in BUNDLE_ROOT.iterdir()
        if path.is_file() and path.name != "manifest.json"
    }
    require(actual_files == EXPECTED_FILES, "vendored interface directory contains drift")
    for name in OBSOLETE_FILES:
        require(not (BUNDLE_ROOT / name).exists(), f"obsolete interface file remains: {name}")

    for name, record in files.items():
        require(isinstance(record, dict), f"manifest record must be an object: {name}")
        path = BUNDLE_ROOT / name
        require(path.is_file(), f"manifest file is missing: {name}")
        require(path.stat().st_size == record.get("bytes"), f"byte count mismatch: {name}")
        require(sha256(path) == record.get("sha256"), f"SHA-256 mismatch: {name}")

    css = (BUNDLE_ROOT / "atlas-interface-kit.css").read_text(encoding="utf-8")
    require("http://" not in css and "https://" not in css, "bundle CSS has a remote runtime dependency")
    require(":focus-visible" in css, "bundle CSS is missing visible focus")
    require("prefers-reduced-motion" in css, "bundle CSS is missing reduced-motion handling")

    components = load_json(BUNDLE_ROOT / "components.json")
    roles = components.get("roles")
    require(isinstance(roles, list), "component roles must be a list")
    require(len(roles) == manifest["component_role_count"], "component role count does not match manifest")
    require(len({item.get("role") for item in roles if isinstance(item, dict)}) == len(roles), "component roles are not unique")

    tokens = load_json(BUNDLE_ROOT / "tokens.json")
    require(tokens.get("version") == manifest["version"], "token version does not match manifest")
    require(tokens.get("contract_version") == manifest["contract_version"], "token contract version does not match manifest")
    require(tokens.get("colour", {}).get("text_faint") == "#888894", "accessible faint-text token drifted")
    return manifest


def main() -> int:
    manifest = verify()
    print(
        "Atlas interface bundle verified: "
        f"v{manifest['version']} / contract {manifest['contract_version']} / "
        f"{len(manifest['files'])} files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
