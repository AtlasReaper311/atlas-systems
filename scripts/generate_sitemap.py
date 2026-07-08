#!/usr/bin/env python3
"""generate_sitemap.py: builds sitemap.xml from the site's static routes
plus every published writing/<slug>/index.html found on disk.

The writing directory is the single source of truth. A published
article is any subdirectory of writing/ containing an index.html; no
separate manifest is consulted, so this script cannot drift from what
is actually live at atlas-systems.uk/writing/.

lastmod is read from git's last commit touching each file, falling
back to today's date if the file is untracked or git is unavailable.
A shallow checkout (fetch-depth: 1) still returns a real date for any
file present in that single commit, so this only degrades further on
a non-git checkout.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

BASE_URL = "https://atlas-systems.uk"

# (route, changefreq, priority) — order is the order URLs are written.
STATIC_ROUTES: list[tuple[str, str, str]] = [
    ("/", "weekly", "1.0"),
    ("/work/", "weekly", "0.8"),
    ("/writing/", "weekly", "0.8"),
    ("/lab/", "monthly", "0.6"),
    ("/about/", "monthly", "0.6"),
]

ARTICLE_CHANGEFREQ = "monthly"
ARTICLE_PRIORITY = "0.7"


def git_lastmod(path: Path) -> str:
    """ISO date of the last commit touching `path`, else today (UTC)."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%aI", "--", str(path)],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        out = result.stdout.strip()
        if out:
            return out
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def discover_articles(root: Path) -> list[Path]:
    """Every writing/<slug>/index.html on disk, sorted for stable diffs."""
    writing_dir = root / "writing"
    if not writing_dir.exists():
        return []
    return sorted(writing_dir.glob("*/index.html"))


def route_file(root: Path, route: str) -> Path:
    if route == "/":
        return root / "index.html"
    return root / route.strip("/") / "index.html"


def build_sitemap(root: Path) -> tuple[str, int]:
    entries: list[tuple[str, str, str, str]] = []

    for route, changefreq, priority in STATIC_ROUTES:
        file_path = route_file(root, route)
        lastmod = git_lastmod(file_path) if file_path.exists() else date.today().isoformat()
        entries.append((f"{BASE_URL}{route}", lastmod, changefreq, priority))

    for article in discover_articles(root):
        slug = article.parent.name
        lastmod = git_lastmod(article)
        entries.append(
            (f"{BASE_URL}/writing/{slug}/", lastmod, ARTICLE_CHANGEFREQ, ARTICLE_PRIORITY)
        )

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, lastmod, changefreq, priority in entries:
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append(f"    <changefreq>{changefreq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n", len(entries)


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate sitemap.xml for atlas-systems.uk")
    ap.add_argument("--root", type=Path, default=Path("."), help="site root (default: cwd)")
    ap.add_argument("--out", type=Path, default=None, help="output path (default: <root>/sitemap.xml)")
    ap.add_argument("--check-only", action="store_true", help="build and print summary, write nothing")
    args = ap.parse_args()

    root = args.root.resolve()
    out = args.out or root / "sitemap.xml"

    xml_text, count = build_sitemap(root)

    if args.check_only:
        print(f"OK  {count} url(s) would be written to {out}")
        for line in xml_text.splitlines():
            if "<loc>" in line:
                print(f"  {line.strip()}")
        return 0

    out.write_text(xml_text, encoding="utf-8")
    print(f"Wrote {out}  ({count} urls)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
