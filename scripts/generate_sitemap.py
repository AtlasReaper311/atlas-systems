#!/usr/bin/env python3
"""Build sitemap.xml from public static routes and published writing routes."""
from __future__ import annotations
import argparse
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

BASE_URL = "https://atlas-systems.uk"
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
    ("/lab/system-map/", "monthly", "0.6"),
    ("/lab/proof-chain/", "monthly", "0.6"),
    ("/lab/signal/", "monthly", "0.6"),
    ("/lab/conformance/", "monthly", "0.6"),
    ("/lab/anomaly/", "monthly", "0.6"),
    ("/lab/almost/", "monthly", "0.5"),
    ("/lab/speculum/", "monthly", "0.5"),
    ("/about/", "monthly", "0.6"),
]
ARTICLE_CHANGEFREQ = "monthly"
ARTICLE_PRIORITY = "0.7"

def git_lastmod(path: Path) -> str:
    try:
        result = subprocess.run(["git", "log", "-1", "--format=%aI", "--", str(path)], capture_output=True, text=True, check=True, timeout=5)
        if result.stdout.strip(): return result.stdout.strip()
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
        entries.append((f"{BASE_URL}/writing/{article.parent.name}/", git_lastmod(article), ARTICLE_CHANGEFREQ, ARTICLE_PRIORITY))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, changefreq, priority in entries:
        lines.extend(["  <url>", f"    <loc>{loc}</loc>", f"    <lastmod>{lastmod}</lastmod>", f"    <changefreq>{changefreq}</changefreq>", f"    <priority>{priority}</priority>", "  </url>"])
    lines.append("</urlset>")
    return "\n".join(lines) + "\n", len(entries)

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
        print(f"OK  {count} url(s) would be written to {out}")
        for line in xml_text.splitlines():
            if "<loc>" in line: print(f"  {line.strip()}")
        return 0
    out.write_text(xml_text, encoding="utf-8")
    print(f"Wrote {out}  ({count} urls)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
