# System SYMPHONY audio assets

This directory contains the bounded browser-delivery library for System SYMPHONY:

- 4 kicks, 4 snares and 5 hi-hats;
- 4 industrial percussion hits, 1 crash and 1 tape-stop transition;
- 6 tuned bass one-shots, with per-state filtering for consistent weight;
- 6 mode-normalised lead and synth loops used as granular Healthy phrases;
- 4 rhythmic bass loops triggered as measure-quantised fragments in compatible Demo states;
- 3 atmosphere loops used as selectively crossfaded textures; Ghost uses a procedural bed.

The Atlas Systems owner confirmed that these selected assets are licensed and approved for this project. They are application assets for the System SYMPHONY instrument, not a standalone sample pack or a general redistribution library.

The source library remains in the owner's local sample collection and is not modified by this repository. Delivery copies are available as 128 kbps Opus, 128 kbps AAC and 44.1 kHz stereo signed 16-bit PCM WAV. Opus is preferred, AAC covers Safari-compatible fallback, and WAV remains the universal/local-audition fallback. Musical keys, original tempos, tuning offsets and per-asset gain are declared in `static/js/sonify/samples.js`. The complete source-folder decision record is in `AUDIT.md`.

Files are loaded only after the user presses Start. Tier one makes the core drum and bass palette available; lead, bass-loop and atmosphere tiers continue in the background. Each file has its own bounded failure path, so a missing or undecodable asset falls back to the corresponding procedural voice without blocking the rest of the instrument. Only the selected atmosphere player is started.

## Rebuild runbook

Prerequisites:

- the owner-approved source folder at `../samples`, or an explicit `SOURCE_DIR`;
- `ffmpeg` with `libopus` and AAC encoders;
- Python 3 and the standard macOS shell tools.

From the repository root:

```bash
scripts/prepare_system_symphony_audio.sh
```

The script stages each three-format set before replacing delivery files. It
records source and process hashes in `manifest.json`; a repeat run skips all 38
unchanged sources and leaves the manifest byte-for-byte identical. Existing
untrimmed WAV delivery files are preserved, while the five explicitly trimmed
sources are regenerated from the licensed originals.

Do not run the generator in GitHub Actions: the licensed source collection is
deliberately not stored in CI. CI verifies that every declared delivery variant
and the manifest are already present.

## Failure modes and rollback

- Missing source: the script reports the exact filename and exits non-zero.
- Missing encoder: install a suitable `ffmpeg` build and rerun.
- Partial encode: staged outputs are discarded; incomplete triplets are not
  moved into the delivery directory.
- Browser decode or network failure: the per-asset loader reports the failure
  and keeps the procedural layer active.
- Audible regression: discard the feature branch or restore this directory and
  the `static/js/sonify/` modules from `main`.

Owner: Atlas Reaper. These files remain project application assets and must not
be repackaged as a standalone sample library.
