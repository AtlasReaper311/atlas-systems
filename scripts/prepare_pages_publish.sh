#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publish_directory="${1:?usage: prepare_pages_publish.sh OUTPUT_DIRECTORY}"

if [ -e "${publish_directory}" ]; then
  test -d "${publish_directory}"
  if find "${publish_directory}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    echo "ERROR: publish directory must be empty: ${publish_directory}" >&2
    exit 1
  fi
else
  mkdir -p "${publish_directory}"
fi

rsync -a \
  --exclude=".git/" \
  --exclude-from="${repo_root}/.pagesignore" \
  "${repo_root}/" "${publish_directory}/"

test -f "${publish_directory}/index.html"

mapfile -t social_cards < <(
  cd "${repo_root}"
  node --input-type=module <<'NODE'
  import { loadManifest, resolveRoutes, resolveSatellites } from "./scripts/og/routes.mjs";

  const manifest = loadManifest();
  const entries = [
    ...resolveRoutes(manifest),
    ...resolveSatellites(manifest),
  ];
  for (const entry of entries) console.log(`og/${entry.file}.png`);
NODE
)

test "${#social_cards[@]}" -gt 0
for card in "${social_cards[@]}"; do
  if [ ! -f "${publish_directory}/${card}" ]; then
    echo "ERROR: filtered Pages artifact is missing ${card}" >&2
    exit 1
  fi
done

test ! -e "${publish_directory}/package.json"
test ! -e "${publish_directory}/package-lock.json"
test ! -e "${publish_directory}/scripts"

echo "Pages publish directory prepared: ${publish_directory} (${#social_cards[@]} social cards)"
