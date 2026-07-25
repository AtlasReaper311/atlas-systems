#!/usr/bin/env python3
"""Measure deterministic first-party asset weight for representative static routes."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROUTES = ["/", "/systems/", "/lab/", "/lab/signal/", "/writing/"]
ASSET_PATTERN = re.compile(r'''(?:href|src)=["']([^"']+)["']''', re.IGNORECASE)
REPORT_PATH = Path("data/performance-baseline.json")


def route_file(root: Path, route: str) -> Path:
    return root / "index.html" if route == "/" else root / route.strip("/") / "index.html"


def local_asset(root: Path, value: str) -> Path | None:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith(("#", "mailto:", "data:")):
        return None
    clean = parsed.path
    if not clean or clean.endswith("/"):
        return None
    candidate = root / clean.lstrip("/")
    return candidate if candidate.is_file() else None


def measure(root: Path) -> dict:
    routes = []
    for route in ROUTES:
        html_path = route_file(root, route)
        html = html_path.read_text(encoding="utf-8")
        assets: dict[str, int] = {}
        for value in ASSET_PATTERN.findall(html):
            asset = local_asset(root, value)
            if asset is None:
                continue
            assets[asset.relative_to(root).as_posix()] = asset.stat().st_size
        html_bytes = html_path.stat().st_size
        asset_bytes = sum(assets.values())
        largest = max(assets.items(), key=lambda item: item[1], default=(None, 0))
        routes.append({
            "route": route,
            "html_bytes": html_bytes,
            "first_party_request_count": 1 + len(assets),
            "referenced_asset_bytes": asset_bytes,
            "total_static_bytes": html_bytes + asset_bytes,
            "largest_referenced_asset": largest[0],
            "largest_referenced_asset_bytes": largest[1],
        })
    payload = {
        "schema_version": "atlas-systems/static-performance-baseline/v1",
        "measurement": "repository-local HTML plus directly referenced first-party assets",
        "blocking_thresholds": False,
        "routes": routes,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload["sha256"] = hashlib.sha256(canonical).hexdigest()
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    report = measure(args.root.resolve())
    rendered = json.dumps(report, indent=2) + "\n"
    if args.check_only:
        if not REPORT_PATH.exists() or REPORT_PATH.read_text(encoding="utf-8") != rendered:
            print("static performance baseline is stale", file=sys.stderr)
            print("Expected candidate:", file=sys.stderr)
            print(rendered, file=sys.stderr, end="")
            return 1
        print(f"OK  {len(report['routes'])} representative route baselines")
        return 0
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(rendered, encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
