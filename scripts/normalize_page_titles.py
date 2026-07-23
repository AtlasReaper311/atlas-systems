#!/usr/bin/env python3
"""Normalize served HTML title metadata to the Atlas page-first convention."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

TITLE_RE = re.compile(r"(<title>)(.*?)(</title>)", re.IGNORECASE | re.DOTALL)
OG_TITLE_RE = re.compile(
    r'(<meta\s+property=["\']og:title["\']\s+content=["\'])(.*?)(["\']\s*/?>)',
    re.IGNORECASE | re.DOTALL,
)
TWITTER_TITLE_RE = re.compile(
    r'(<meta\s+name=["\']twitter:title["\']\s+content=["\'])(.*?)(["\']\s*/?>)',
    re.IGNORECASE | re.DOTALL,
)


def desired_title(html: str, path: Path, root: Path) -> str | None:
    relative = path.relative_to(root).as_posix()
    if relative == "index.html":
        return "Atlas Systems"

    og_match = OG_TITLE_RE.search(html)
    if og_match:
        candidate = og_match.group(2).strip()
        if candidate.endswith("// Atlas Systems"):
            return candidate

    title_match = TITLE_RE.search(html)
    if not title_match:
        return None

    current = title_match.group(2).strip()
    if current.endswith("// Atlas Systems"):
        return current
    if " — Atlas Systems" in current:
        return current.replace(" — Atlas Systems", " // Atlas Systems")
    if current.startswith("Atlas Systems // "):
        page = current.removeprefix("Atlas Systems // ").strip()
        return f"{page[:1].upper()}{page[1:]} // Atlas Systems"
    return current


def replace_value(pattern: re.Pattern[str], html: str, value: str) -> str:
    return pattern.sub(lambda match: f"{match.group(1)}{value}{match.group(3)}", html, count=1)


def normalize_file(path: Path, root: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    title = desired_title(original, path, root)
    if not title:
        return False

    updated = replace_value(TITLE_RE, original, title)
    if OG_TITLE_RE.search(updated):
        updated = replace_value(OG_TITLE_RE, updated, title)
    if TWITTER_TITLE_RE.search(updated):
        updated = replace_value(TWITTER_TITLE_RE, updated, title)

    if updated == original:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    changed: list[Path] = []
    for path in sorted(root.rglob("*.html")):
        if ".git" in path.parts:
            continue
        if normalize_file(path, root):
            changed.append(path.relative_to(root))

    if args.check and changed:
        for path in changed:
            print(f"would normalize: {path}")
        return 1

    for path in changed:
        print(f"normalized: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
