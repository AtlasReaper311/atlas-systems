from __future__ import annotations

from pathlib import Path

LAB_PATH = Path("lab/index.html")
DECISIONS_PATH = Path("decisions.md")
SELF_PATH = Path(__file__)

PUBLIC_PIPELINE_REPOS = '''      const PGRID_REPOS = [
        { id: "atlas-api-index", aliases: ["atlas-api-index"] },
        { id: "atlas-api-public", aliases: ["atlas-api-public"] },
        { id: "atlas-blackbox", aliases: ["atlas-blackbox"] },
        { id: "atlas-corpus", aliases: ["atlas-corpus"] },
        { id: "atlas-daily-digest", aliases: ["atlas-daily-digest"] },
        { id: "atlas-doc-viewer", aliases: ["atlas-doc-viewer", "cv.atlas-systems.uk"] },
        { id: "atlas-dora", aliases: ["atlas-dora"] },
        { id: "atlas-notify", aliases: ["atlas-notify"] },
        { id: "atlas-quota-watch", aliases: ["atlas-quota-watch"] },
        { id: "atlas-systems", aliases: ["atlas-systems", "atlas-systems.uk"] },
        { id: "deploy-watch", aliases: ["deploy-watch"] },
        { id: "github-pulse", aliases: ["github-pulse"] },
        { id: "ramone-edge", aliases: ["ramone-edge", "ramone.atlas-systems.uk"] },
        { id: "ramone-voice-trigger", aliases: ["ramone-voice-trigger", "ramone-trigger"] },
        { id: "site-pulse", aliases: ["site-pulse"] },
        { id: "specular-sonify", aliases: ["specular-sonify"] },
        { id: "specular-telemetry", aliases: ["specular-telemetry", "specular-edge"] },
        { id: "status", aliases: ["status", "status.atlas-systems.uk"] },
      ];
'''


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


def clean_lab() -> None:
    text = LAB_PATH.read_text(encoding="utf-8")
    text = replace_between(
        text,
        "      const PGRID_REPOS = [",
        "      const PGRID_RECENT_MS",
        PUBLIC_PIPELINE_REPOS,
    )
    text = replace_between(
        text,
        "      function labDisplayText(value) {",
        "      function opsText(id, value) {",
        '''      function labDisplayText(value) {
        return String(value == null ? "" : value);
      }
''',
    )

    excluded_start = "      const API_SURFACE_EXCLUDED_WORKERS = new Set("
    if excluded_start in text:
        start = text.index(excluded_start)
        end = text.index(";", start) + 1
        text = text[:start] + "      const API_SURFACE_EXCLUDED_WORKERS = new Set();" + text[end:]

    LAB_PATH.write_text(text, encoding="utf-8")


def clean_decisions() -> None:
    text = DECISIONS_PATH.read_text(encoding="utf-8")
    start_marker = "**Consequences.**\n- Worker repos:"
    static_marker = "- Static repos:"
    start = text.index(start_marker)
    worker_start = start + len("**Consequences.**\n")
    static_start = text.index(static_marker, worker_start)
    replacement = (
        "- Worker repos: public Worker repositories use the shared deployment workflow; "
        "private callers remain source-owned and are not enumerated on public surfaces.\n"
    )
    text = text[:worker_start] + replacement + text[static_start:]
    DECISIONS_PATH.write_text(text, encoding="utf-8")


def main() -> None:
    clean_lab()
    clean_decisions()
    SELF_PATH.unlink()
    print("PR #45 public-source cleanup applied; the one-shot helper removed itself.")


if __name__ == "__main__":
    main()
