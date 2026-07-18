#!/usr/bin/env bash
# Generate deterministic browser delivery variants from the licensed local
# System SYMPHONY source library. Source WAV files are never modified.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-${REPO_ROOT}/../samples}"
DEST_DIR="${DEST_DIR:-${REPO_ROOT}/static/audio/system-symphony}"
MANIFEST_PATH="${DEST_DIR}/manifest.json"
PROCESS_VERSION="20260718-system-symphony-h1-h8-preview"
STAGE_DIR="$(mktemp -d)"
MANIFEST_ROWS_FILE="$(mktemp)"
EXISTING_ROWS_FILE="$(mktemp)"

cleanup() {
  rm -rf "${STAGE_DIR}"
  rm -f "${MANIFEST_ROWS_FILE}" "${EXISTING_ROWS_FILE}"
}
trap cleanup EXIT

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "! Source directory not found: ${SOURCE_DIR}" >&2
  exit 2
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "! ffmpeg is required. Install it with: brew install ffmpeg" >&2
  exit 2
fi
if ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -q "libopus"; then
  echo "! ffmpeg lacks the libopus encoder" >&2
  exit 2
fi
if ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -qE "^ [A-Z.]+ aac "; then
  echo "! ffmpeg lacks the AAC encoder" >&2
  exit 2
fi

mkdir -p "${DEST_DIR}"

if command -v shasum >/dev/null 2>&1; then
  sha_of() { shasum -a 256 "$1" </dev/null | awk '{print $1}'; }
  sha_of_string() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
else
  sha_of() { sha256sum "$1" </dev/null | awk '{print $1}'; }
  sha_of_string() { printf '%s' "$1" | sha256sum | awk '{print $1}'; }
fi

TABLE="$(cat <<'EOF'
AggresiveKick_849.wav|kick-aggressive|||general
CrispyKick_849.wav|kick-crispy|||general
PunchierKick_849.wav|kick-punchier|||general
SubltleKick_849.wav|kick-subtle|||general
AggresiveClapSnare_849.wav|snare-aggressive|||general
BrightClapSnare_849.wav|snare-bright|||general
ClipClapSnare_849.wav|snare-clip|||general
RegularClapSnare_849.wav|snare-regular|||general
AggresiveHat_849.wav|hat-aggressive|||general
ClassicHat_849.wav|hat-classic|||general
HardHat_02_849.wav|hat-hard|||general
GoodLayerHat_849.wav|hat-layer|||general
SubtleHat_849.wav|hat-subtle|||general
Cymatics - AC Unit Hit 1.wav|perc-ac-unit-1|||general
Cymatics - AC Unit Hit 3.wav|perc-ac-unit-3|||general
Cymatics - AC Unit Hit 6.wav|perc-ac-unit-6|||general
StickPercussion_849.wav|perc-stick|||general
CrispCrash_849.wav|crash-crisp|||general
X_FuturisticTapestop_849.wav|fx-tapestop|||general
Am_TransformerBass_849.wav|bass-transformer-a0|||A0 sub
Fm_AngryArpBass_849.wav|bass-angry-d1|||F root plays as D at -300 cents
Fm_PercussiveBass_849.wav|bass-percussive-d-sharp1|||F root plays as D at -100 cents
Cymatics - BASS Burial - C.wav|bass-burial-c1|0.018||trim leading noise
Cymatics - BASS Deep - C.wav|bass-deep-c1|||general
Cymatics - BASS Doom - C.wav|bass-doom-c1|||general
Cymatics - Geneticist - 96 BPM E Min Distorted Lead.wav|lead-geneticist-96-e-min||18.160|eight-bar loop trim
Cymatics - No Alternative - 100 BPM E Min Distorted Lead.wav|lead-no-alternative-100-e-min|||general
Cymatics - Motherboard Pt 2 - 106 BPM D# Min Atmosphere.wav|atmos-motherboard-106-d-sharp-min||17.587|trim atmosphere tail
Cymatics - Nanotech Pt 2 - 105 BPM G Min Ambience.wav|atmos-nanotech-105-g-min||17.836|trim reverb tail
Cymatics - New Punks - 100 BPM C Min Atmosphere.wav|atmos-new-punks-100-c-min|0.044|18.397|trim lead-in and tail
100_Dm_BackgrndSawsSynth_849.wav|lead-background-saws-100-d-min|||native D minor
100_Em_FutureSynth_01_849.wav|lead-future-synth-100-e-min|||E minor
100_Fm_AcidSynth_849.wav|lead-acid-synth-100-f-min|||F minor
104_D#m_WobblySynth_849.wav|lead-wobbly-synth-104-d-sharp-min|||D-sharp minor
100_F_NeoTokyoBass_849.wav|bassloop-neo-tokyo-100-f|||root and fifth
100_Fm_SequencedBass_849.wav|bassloop-sequenced-100-f-min|||F minor
100_Fm_EvilBass_02_849.wav|bassloop-evil-100-f-min|||F minor
105_F_DistortedGuitarBass_849.wav|bassloop-distorted-guitar-105-f|||critical only
EOF
)"
TOTAL_ROWS="$(printf '%s\n' "${TABLE}" | grep -c '|')"

if [ -f "${MANIFEST_PATH}" ]; then
  MANIFEST_IN="${MANIFEST_PATH}" python3 - <<'PY' >"${EXISTING_ROWS_FILE}"
import json
import os

try:
    with open(os.environ["MANIFEST_IN"], encoding="utf-8") as source:
        manifest = json.load(source)
except (OSError, ValueError):
    manifest = {}
for asset in manifest.get("assets", []):
    print(f"{asset.get('slug', '')}|{asset.get('process_sha256', '')}")
PY
fi

existing_hash_for() {
  awk -F'|' -v slug="$1" '$1 == slug { print $2; exit }' "${EXISTING_ROWS_FILE}"
}

encoded=0
skipped=0
failed=0

encode_row() {
  local source_name="$1" slug="$2" start="$3" end="$4" note="$5"
  local source_path="${SOURCE_DIR}/${source_name}"
  if [ ! -f "${source_path}" ]; then
    echo "  ! missing source: ${source_name}"
    failed=$((failed + 1))
    return
  fi

  local source_hash process_hash prior_hash
  source_hash="$(sha_of "${source_path}")"
  process_hash="$(sha_of_string "${PROCESS_VERSION}|${source_hash}|${start}|${end}|opus128|aac128|wav-preserve-v2")"
  prior_hash="$(existing_hash_for "${slug}")"

  if [ "${prior_hash}" = "${process_hash}" ] \
    && [ -f "${DEST_DIR}/${slug}.opus" ] \
    && [ -f "${DEST_DIR}/${slug}.m4a" ] \
    && [ -f "${DEST_DIR}/${slug}.wav" ]; then
    echo "  . ${slug} unchanged"
    skipped=$((skipped + 1))
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "${slug}" "${source_name}" "${source_hash}" "${process_hash}" "${note}" \
      >>"${MANIFEST_ROWS_FILE}"
    return
  fi

  local filter="" fade_start=""
  if [ -n "${start}" ] && [ -n "${end}" ]; then
    fade_start="$(python3 -c "print(max(0.0, float('${end}') - 0.1 - float('${start}')))" </dev/null)"
    filter="atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,afade=t=out:st=${fade_start}:d=0.1"
  elif [ -n "${start}" ]; then
    filter="atrim=start=${start},asetpts=PTS-STARTPTS"
  elif [ -n "${end}" ]; then
    fade_start="$(python3 -c "print(max(0.0, float('${end}') - 0.1))" </dev/null)"
    filter="atrim=end=${end},asetpts=PTS-STARTPTS,afade=t=out:st=${fade_start}:d=0.1"
  fi

  local audio_filter=()
  if [ -n "${filter}" ]; then audio_filter=(-af "${filter}"); fi

  echo "  + ${slug} <- ${source_name}"
  local opus_out="${STAGE_DIR}/${slug}.opus"
  local aac_out="${STAGE_DIR}/${slug}.m4a"
  local wav_out="${STAGE_DIR}/${slug}.wav"
  local opus_ok=1 aac_ok=1 wav_ok=1
  local write_wav=0
  if [ -n "${start}" ] || [ -n "${end}" ] || [ ! -f "${DEST_DIR}/${slug}.wav" ]; then
    write_wav=1
  fi
  ffmpeg -hide_banner -loglevel error -y -i "${source_path}" "${audio_filter[@]}" \
    -map_metadata -1 -fflags +bitexact -ar 48000 -ac 2 \
    -c:a libopus -b:a 128k -vbr on -application audio "${opus_out}" </dev/null || opus_ok=0
  ffmpeg -hide_banner -loglevel error -y -i "${source_path}" "${audio_filter[@]}" \
    -map_metadata -1 -fflags +bitexact -ar 44100 -ac 2 \
    -c:a aac -b:a 128k -movflags +faststart "${aac_out}" </dev/null || aac_ok=0
  if [ "${write_wav}" -eq 1 ]; then
    ffmpeg -hide_banner -loglevel error -y -i "${source_path}" "${audio_filter[@]}" \
      -map_metadata -1 -fflags +bitexact -ar 44100 -ac 2 \
      -c:a pcm_s16le "${wav_out}" </dev/null || wav_ok=0
  fi

  if [ "${opus_ok}" -eq 1 ] && [ "${aac_ok}" -eq 1 ] && [ "${wav_ok}" -eq 1 ]; then
    mv -f "${opus_out}" "${DEST_DIR}/${slug}.opus"
    mv -f "${aac_out}" "${DEST_DIR}/${slug}.m4a"
    if [ "${write_wav}" -eq 1 ]; then
      mv -f "${wav_out}" "${DEST_DIR}/${slug}.wav"
    fi
    encoded=$((encoded + 1))
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "${slug}" "${source_name}" "${source_hash}" "${process_hash}" "${note}" \
      >>"${MANIFEST_ROWS_FILE}"
  else
    echo "    ! encode failed opus=${opus_ok} m4a=${aac_ok} wav=${wav_ok}"
    failed=$((failed + 1))
  fi
}

echo "System SYMPHONY delivery pipeline: ${TOTAL_ROWS} licensed sources"
while IFS='|' read -r source_name slug start end note; do
  [ -z "${source_name}" ] && continue
  encode_row "${source_name}" "${slug}" "${start}" "${end}" "${note}"
done <<<"${TABLE}"

MANIFEST_ROWS_PATH="${MANIFEST_ROWS_FILE}" \
MANIFEST_OUT="${MANIFEST_PATH}" \
PROCESS_VERSION_VALUE="${PROCESS_VERSION}" \
python3 - <<'PY'
import json
import os

assets = []
with open(os.environ["MANIFEST_ROWS_PATH"], encoding="utf-8") as rows:
    for row in rows:
        parts = row.rstrip("\n").split("\t")
        if len(parts) != 5:
            continue
        slug, source, source_hash, process_hash, note = parts
        assets.append({
            "formats": ["opus", "m4a", "wav"],
            "note": note,
            "process_sha256": process_hash,
            "slug": slug,
            "source": source,
            "source_sha256": source_hash,
        })
assets.sort(key=lambda asset: asset["slug"])
manifest = {
    "asset_count": len(assets),
    "assets": assets,
    "version": os.environ["PROCESS_VERSION_VALUE"],
}
with open(os.environ["MANIFEST_OUT"], "w", encoding="utf-8") as output:
    json.dump(manifest, output, indent=2, sort_keys=True)
    output.write("\n")
PY

echo "Summary: encoded=${encoded} skipped=${skipped} failed=${failed}"
if [ "${failed}" -gt 0 ]; then
  echo "Pipeline finished with failures. Fix before previewing." >&2
  exit 1
fi

exit 0
