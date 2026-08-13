#!/usr/bin/env python3
"""Build sitemap.xml from public static routes and published writing routes."""
from __future__ import annotations

import argparse
import difflib
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path

BASE_URL = "https://atlas-systems.uk"
SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
SITEMAP_TAG = f"{{{SITEMAP_NAMESPACE}}}"
STATIC_ROUTES: list[tuple[str, str, str]] = [
    ("/", "weekly", "1.0"),
    ("/work/", "weekly", "0.8"),
    ("/writing/", "weekly", "0.8"),
    ("/lab/", "monthly", "0.7"),
    ("/systems/", "monthly", "0.7"),
    ("/systems/observability/", "monthly", "0.7"),
    ("/systems/reliability/", "monthly", "0.7"),
    ("/systems/evidence/", "monthly", "0.7"),
    ("/lab/system-symphony/", "monthly", "0.7"),
    ("/lab/spectral-forge/", "monthly", "0.7"),
    ("/lab/system-map/", "monthly", "0.6"),
    ("/lab/blackbox/", "monthly", "0.6"),
    ("/lab/proof-chain/", "monthly", "0.6"),
    ("/lab/signal/", "monthly", "0.6"),
    ("/lab/conformance/", "monthly", "0.6"),
    ("/lab/anomaly/", "monthly", "0.6"),
    ("/lab/almost/", "monthly", "0.5"),
    ("/lab/drift/", "monthly", "0.5"),
    ("/lab/bearing/", "monthly", "0.5"),
    ("/lab/speculum/", "monthly", "0.5"),
    ("/about/", "monthly", "0.6"),
]
ARTICLE_CHANGEFREQ = "monthly"
ARTICLE_PRIORITY = "0.7"


def git_lastmod(path: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%aI", "--", str(path)],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        if result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def discover_articles(root: Path) -> list[Path]:
    writing_dir = root / "writing"
    return sorted(writing_dir.glob("*/index.html")) if writing_dir.exists() else []


def route_file(root: Path, route: str) -> Path:
    return root / "index.html" if route == "/" else root / route.strip("/") / "index.html"


def build_sitemap(root: Path) -> tuple[str, int]:
    entries: list[tuple[str, str, str, str]] = []
    for route, changefreq, priority in STATIC_ROUTES:
        file_path = route_file(root, route)
        lastmod = git_lastmod(file_path) if file_path.exists() else date.today().isoformat()
        entries.append((f"{BASE_URL}{route}", lastmod, changefreq, priority))
    for article in discover_articles(root):
        entries.append(
            (
                f"{BASE_URL}/writing/{article.parent.name}/",
                git_lastmod(article),
                ARTICLE_CHANGEFREQ,
                ARTICLE_PRIORITY,
            )
        )
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{SITEMAP_NAMESPACE}">',
    ]
    for loc, lastmod, changefreq, priority in entries:
        lines.extend(
            [
                "  <url>",
                f"    <loc>{loc}</loc>",
                f"    <lastmod>{lastmod}</lastmod>",
                f"    <changefreq>{changefreq}</changefreq>",
                f"    <priority>{priority}</priority>",
                "  </url>",
            ]
        )
    lines.append("</urlset>")
    return "\n".join(lines) + "\n", len(entries)


def _required_text(node: ET.Element, field: str, source: str, index: int) -> str:
    matches = node.findall(f"{SITEMAP_TAG}{field}")
    if len(matches) != 1:
        raise ValueError(
            f"{source}: url entry {index} must contain exactly one <{field}> element"
        )
    value = (matches[0].text or "").strip()
    if not value:
        raise ValueError(f"{source}: url entry {index} has an empty <{field}> element")
    return value


def _validate_lastmod(value: str, source: str, index: int) -> None:
    try:
        if "T" not in value:
            date.fromisoformat(value)
            return
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(
            f"{source}: url entry {index} has invalid <lastmod> value {value!r}"
        ) from error
    if parsed.tzinfo is None:
        raise ValueError(
            f"{source}: url entry {index} timestamp <lastmod> must include a UTC offset"
        )


def sitemap_contract(xml_text: str, source: str) -> list[tuple[str, str, str]]:
    """Return merge-stable route metadata while validating every lastmod value.

    Exact Git author timestamps are intentionally excluded from the comparable
    contract. GitHub squash merges create a new commit timestamp after pull
    request checks have completed, so requiring byte-for-byte equality makes a
    valid reviewed sitemap fail only after merge.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as error:
        raise ValueError(f"{source}: invalid XML: {error}") from error

    if root.tag != f"{SITEMAP_TAG}urlset":
        raise ValueError(f"{source}: root element must be sitemap <urlset>")

    entries: list[tuple[str, str, str]] = []
    seen_locations: set[str] = set()
    for index, node in enumerate(list(root), start=1):
        if node.tag != f"{SITEMAP_TAG}url":
            raise ValueError(f"{source}: unexpected child element {node.tag!r}")
        loc = _required_text(node, "loc", source, index)
        lastmod = _required_text(node, "lastmod", source, index)
        changefreq = _required_text(node, "changefreq", source, index)
        priority = _required_text(node, "priority", source, index)
        _validate_lastmod(lastmod, source, index)
        if loc in seen_locations:
            raise ValueError(f"{source}: duplicate sitemap location {loc}")
        seen_locations.add(loc)
        entries.append((loc, changefreq, priority))
    return entries


def comparison_mode(current: str, generated: str) -> str:
    """Return exact, lastmod-only, or structural after full validation."""
    current_contract = sitemap_contract(current, "committed sitemap")
    generated_contract = sitemap_contract(generated, "generated sitemap")
    if current == generated:
        return "exact"
    if current_contract == generated_contract:
        return "lastmod-only"
    return "structural"


def _write_candidate_and_diff(out: Path, current: str, generated: str) -> None:
    candidate = Path(os.environ.get("SITEMAP_CANDIDATE_PATH", "sitemap.generated.xml"))
    candidate.write_text(generated, encoding="utf-8")
    print(f"sitemap.xml is stale; generated candidate: {candidate}", file=sys.stderr)
    diff = difflib.unified_diff(
        current.splitlines(),
        generated.splitlines(),
        fromfile=str(out),
        tofile=str(candidate),
        lineterm="",
    )
    for line in diff:
        print(line, file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    out = args.out or root / "sitemap.xml"
    xml_text, count = build_sitemap(root)
    if args.check_only:
        if not out.exists():
            print(f"sitemap is missing: {out}", file=sys.stderr)
            return 1
        current = out.read_text(encoding="utf-8")
        try:
            mode = comparison_mode(current, xml_text)
        except ValueError as error:
            _write_candidate_and_diff(out, current, xml_text)
            print(f"sitemap validation failed: {error}", file=sys.stderr)
            return 1
        if mode == "structural":
            _write_candidate_and_diff(out, current, xml_text)
            return 1
        if mode == "lastmod-only":
            print(
                f"OK  {count} current url(s) in {out}; "
                "valid lastmod values differ only because Git history was rewritten by merge"
            )
            return 0
        print(f"OK  {count} current url(s) in {out}")
        return 0
    out.write_text(xml_text, encoding="utf-8")
    print(f"Wrote {out}  ({count} urls)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())