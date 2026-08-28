#!/usr/bin/env python3
"""Validate repository-local links and fragments without network access."""

from __future__ import annotations

import argparse
import html.parser
import posixpath
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit


TEXT_EXTENSIONS = {".css", ".html", ".md", ".svg"}
SKIP_DIRS = {
    ".git",
    ".github",
    ".pytest_cache",
    "__pycache__",
    "node_modules",
    "vendor",
}
SKIP_SCHEMES = {"data", "http", "https", "javascript", "mailto", "tel"}

HTML_LINK_ATTRS = {"href", "poster", "src"}
HTML_SRCSET_ATTRS = {"imagesrcset", "srcset"}
MARKDOWN_LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
MARKDOWN_REFERENCE_RE = re.compile(r"^\s*\[[^\]]+\]:\s*(\S+)", re.MULTILINE)
CSS_URL_RE = re.compile(r"url\(([^)]+)\)")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$", re.MULTILINE)


@dataclass(frozen=True)
class Link:
    source: Path
    target: str
    line: int


class LinkParser(html.parser.HTMLParser):
    def __init__(self, source: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.source = source
        self.links: list[Link] = []
        self.fragments: set[str] = set()

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        line, _ = self.getpos()
        for name, value in attrs:
            if value is None:
                continue
            normalized = name.lower()
            if normalized in {"id", "name"} and value:
                self.fragments.add(value)
            elif normalized in HTML_LINK_ATTRS:
                self.links.append(Link(self.source, value, line))
            elif normalized in HTML_SRCSET_ATTRS:
                for candidate in parse_srcset(value):
                    self.links.append(Link(self.source, candidate, line))


def parse_srcset(value: str) -> list[str]:
    result: list[str] = []
    for item in value.split(","):
        candidate = item.strip().split()
        if candidate:
            result.append(candidate[0])
    return result


def iter_files(root: Path) -> list[Path]:
    result: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        result.append(path)
    return result


def markdown_anchor(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[^\w\- ]+", "", text.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", "-", text.strip())


def collect(root: Path) -> tuple[list[Link], dict[Path, set[str]]]:
    links: list[Link] = []
    fragments: dict[Path, set[str]] = {}
    for path in iter_files(root):
        relative = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        file_fragments: set[str] = set()
        if path.suffix.lower() in {".html", ".svg"}:
            parser = LinkParser(relative)
            parser.feed(text)
            links.extend(parser.links)
            file_fragments.update(parser.fragments)
        if path.suffix.lower() == ".md":
            for pattern in (MARKDOWN_LINK_RE, MARKDOWN_IMAGE_RE, MARKDOWN_REFERENCE_RE):
                for match in pattern.finditer(text):
                    links.append(Link(relative, match.group(1), line_for(text, match.start())))
            file_fragments.update(
                anchor
                for anchor in (markdown_anchor(match.group(2)) for match in HEADING_RE.finditer(text))
                if anchor
            )
        if path.suffix.lower() == ".css":
            for match in CSS_URL_RE.finditer(text):
                target = match.group(1).strip("'\" ")
                links.append(Link(relative, target, line_for(text, match.start())))
        fragments[relative] = file_fragments
    return links, fragments


def line_for(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def target_path(root: Path, source: Path, target: str) -> tuple[Path | None, str]:
    split = urlsplit(target)
    if split.scheme in SKIP_SCHEMES or split.netloc:
        return None, ""
    path = unquote(split.path)
    if not path:
        return source, unquote(split.fragment)
    if path.startswith("/"):
        relative = Path(path.lstrip("/"))
    else:
        source_directory = source.parent.as_posix()
        joined = posixpath.normpath(posixpath.join(source_directory, path))
        relative = Path("" if joined == "." else joined)
    candidate = root / relative
    if candidate.is_dir():
        relative = relative / "index.html"
    return relative, unquote(split.fragment)


def validate(root: Path) -> list[str]:
    links, fragments = collect(root)
    errors: list[str] = []
    for link in links:
        target, fragment = target_path(root, link.source, link.target)
        if target is None:
            continue
        target_file = root / target
        if not target_file.is_file():
            errors.append(
                f"{link.source}:{link.line}: missing local target {link.target!r}"
            )
            continue
        if fragment and fragment not in fragments.get(target, set()):
            errors.append(
                f"{link.source}:{link.line}: missing fragment #{fragment} in {target}"
            )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--output")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    errors = validate(root)
    report = "\n".join(errors) if errors else "Offline repository link check passed."
    print(report)
    if args.output:
        Path(args.output).write_text(report + "\n", encoding="utf-8")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
