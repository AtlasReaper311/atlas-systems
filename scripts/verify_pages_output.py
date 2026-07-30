#!/usr/bin/env python3
"""Verify the Cloudflare Pages static output contract."""

from __future__ import annotations

import argparse
from pathlib import Path


SPA_DESTINATIONS = {"/", "/index.html", "index.html"}
REQUIRED_PHASE_6_ASSETS = (
    "static/js/phase-6-footer.js",
    "static/css/phase-6-footer.css",
    "static/js/estate-search/render.js",
)


def _is_catch_all(source: str) -> bool:
    return source in {"/*", "*"} or source.startswith("/*") or ":splat" in source or ":path" in source


def _parse_redirects(path: Path) -> list[tuple[int, str, str, str]]:
    rules: list[tuple[int, str, str, str]] = []
    if not path.exists():
        return rules

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split()
        if len(parts) < 2:
            continue

        source, destination = parts[0], parts[1]
        status = parts[2] if len(parts) >= 3 else "302"
        rules.append((line_number, source, destination, status))

    return rules


def verify(output_dir: Path) -> list[str]:
    errors: list[str] = []

    if not (output_dir / "404.html").is_file():
        errors.append(f"{output_dir / '404.html'} is missing")

    for relative_path in REQUIRED_PHASE_6_ASSETS:
        asset = output_dir / relative_path
        if not asset.is_file():
            errors.append(f"{asset} is missing")

    redirects_path = output_dir / "_redirects"
    for line_number, source, destination, status in _parse_redirects(redirects_path):
        if status == "200" and _is_catch_all(source) and destination in SPA_DESTINATIONS:
            errors.append(
                f"{redirects_path}:{line_number} rewrites catch-all route {source} "
                f"to {destination} with HTTP 200"
            )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "output_dir",
        nargs="?",
        default=".",
        help="Cloudflare Pages output directory to verify",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir).resolve()
    errors = verify(output_dir)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"Pages output verified: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
