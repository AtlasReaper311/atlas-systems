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
test -f "${publish_directory}/og/home.png"
test ! -e "${publish_directory}/package.json"
test ! -e "${publish_directory}/package-lock.json"
test ! -e "${publish_directory}/scripts"

echo "Pages publish directory prepared: ${publish_directory}"
