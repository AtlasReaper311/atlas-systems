# System Symphony Pass C v3 manifest

## Verified target

- Repository: `AtlasReaper311/atlas-systems`
- Pull request: `#128`
- Branch: `feat/system-symphony-apu-chip-foundation`
- Expected head: `0c62169b873431929da5a9fa97ec90d7fe6e5bcf`
- Expected engine Git blob: `0a72a1baa6c5222966fc72740d03764d84cb65ae`
- Expected controller Git blob: `ce606438153c881a04ab639d532af21ef87705d1`
- Expected hybrid HTML Git blob: `3ca426c936282923501f418a28ad35b385aa2a1e`

## Production files added

| File | Responsibility |
|---|---|
| `static/js/sonify/apu-master-stage-profiles.js` | Bounded per-state DAC and clipper profile |
| `static/js/sonify/apu-chip-voice-adapter.js` | Public raw Web Audio chip voice bridge |
| `static/js/sonify/apu-performance-conductor.js` | Silence, density activity, and ornament instructions |
| `static/js/sonify/apu-service-voice-conductor.js` | Tonal, rhythmic, state-mutated service motif performance |
| `static/js/sonify/apu-mix-wiring.js` | Explicit buses, effects sends, width, ducking, wobble, and dynamics |
| `static/js/sonify/apu-replay-song.js` | Ordered evidence plan, bar cursor, score overlay, and movement phase |

## Production files modified

| File | Responsibility |
|---|---|
| `static/js/sonify/apu-track-engine-v3.js` | Full Pass C v3 audio and replay integration |
| `lab/system-symphony-apu/system-symphony-apu-hybrid.js` | Activates v3 and exposes build and replay API |
| `lab/system-symphony-apu/index.html` | Updates controller cache identity |

## Tests added

- `apu-master-stage-profiles.test.js`
- `apu-chip-voice-adapter.test.js`
- `apu-performance-conductor.test.js`
- `apu-service-voice-conductor.test.js`
- `apu-mix-wiring.test.js`
- `apu-replay-song.test.js`
- `apu-track-engine-v3.import-and-integration.test.js`
- `tests/test_pass_c_v3_controller_patch.py`

## Review and operation files

- `apply-pass-c-v3.sh`
- `rollback-pass-c-v3.sh`
- `scripts/apply-pass-c-v3-patches.py`
- `scripts/system-symphony-pass-c-v3-smoke.mjs`
- `docs/system-symphony-pass-c-v3-architecture.md`
- `docs/system-symphony-pass-c-v3-listener-notes.md`
- `docs/system-symphony-pass-c-v3-manifest.md`
- `review/pass-c-v3-engine.diff`

## Local validation completed

- Seven Pass C v3 production sources passed `node --check`.
- 222 existing, Part 1, Pass A, Pass B, and helper tests passed.
- Six executable engine import and integration tests passed in a disposable repository-shaped testbed.
- Three controller and HTML patch tests passed.
- Total locally executed assertions: 231 tests, all passing.
- Both shell scripts passed `bash -n`.
- Source-policy scan passed for production JavaScript.

The 222-test run used the current PR #128 module copies previously retrieved into the disposable testbed. The six engine tests used repository-compatible stubs for dependencies that were not downloadable through the shell environment. The apply script reruns those engine tests against the real repository modules before staging.

## Apply-time repository validation

The controlled apply script reproduces the current Pull request CI checks after focused Pass C validation:

- README contract checks
- HTML validation with `html-validate@9.7.1`
- public-interface contract tests
- remaining main-site tests with serial execution
- Lab tests
- the complete System Symphony test glob
- normalized page-title drift check
- sitemap check
- static-performance baseline check
- Pages output and filtered publish-artifact checks
- social-preview tests and verifier
- committed JSON parsing
- whitespace validation
- offline link validation when the `lychee` CLI is available locally; GitHub CI remains the required authority otherwise

No repository-wide or browser claim is made until those commands run in the exact checkout and the numbered preview completes.

## Preview-only validation

Run after the branch is updated and the numbered Pages preview exists:

```bash
ATLAS_APU_PREVIEW_URL="https://system-symphony-pr-128.atlas-systems-44t.pages.dev/lab/system-symphony-apu/" \
node scripts/system-symphony-pass-c-v3-smoke.mjs
```

This requires the repository's pinned Playwright environment. It was not run during package construction because no V3 branch preview exists yet.

## Rollback

Before commit, run `rollback-pass-c-v3.sh`. It unstages additions, restores the three modified files from `HEAD`, and removes new V3 files without rewriting history.

After commit, use a normal `git revert` commit. Never force-push PR #128.
