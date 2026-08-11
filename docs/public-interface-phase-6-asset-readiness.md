# Public interface programme Phase 6 asset readiness

Status: implementation candidate for exact-head pull-request validation.

Recorded: 29 July 2026.

## Scope

This branch adds the immutable `atlas-interface-kit v0.4.0` release to the repository-local asset tree required by the editorial publication pipeline. It does not switch any existing `atlas-systems` route from the established v0.3.0 presentation foundations.

The source release is:

```text
v0.4.0 -> c38b5b3edd631999dfad838c4fb70e505a9860cf
release workflow run -> 30458258099
```

The published release assets remain bound to these SHA-256 values:

```text
6b72d8acb07230f0b25d4b78b5c5b081ab09a296f11ad3ac1b1f5cb493cac9b9  atlas-interface-kit-0.4.0.tar.gz
86fcd399a451f99175cffc8e44abf4f404495f409fc1bfd751d95dfd1b86bbb3  atlas-interface-kit-0.4.0.release-manifest.json
```

## Repository-local distribution

The complete v0.4.0 bundle is stored under:

```text
static/vendor/atlas-interface/v0.4.0/
```

The repository verifier and focused Node contract test require the exact release file set, byte counts, and SHA-256 values recorded by the bundle manifest. The checks also prove the footer role, four variants, five slots, scheduler ownership of article sequencing, repository-local distribution, and the prohibition on remote runtime dependencies and shared runtime JavaScript.

The four font binaries, font stylesheet, and two font licences remain byte-identical to the existing repository copies. No font or licence content is regenerated or reformatted.

## Presentation boundary

`static/js/estate-shell.js` remains pinned to:

```text
/static/vendor/atlas-interface/v0.3.0/atlas-interface-kit.css
```

This stage exposes immutable v0.4.0 files at stable same-origin paths without changing page HTML, navigation, footer content, Writing output, Work output, Lab presentation, or existing estate-shell behaviour.

## Publication dependency

The queued generator-owned editorial shells reference repository-local v0.4.0 CSS and font paths. Adding those assets to `atlas-systems` satisfies the static-asset dependency required before any queued article can be published safely.

This stage does not publish an article. Publication still requires scheduler execution, an exact `atlas-systems` write, a successful production deployment for that commit, and live verification.

## Protected boundaries

This phase does not:

- edit generated article HTML or metadata;
- alter canonical article Markdown, prose, dates, ordering, or Work-card configuration;
- change scheduler queue state, sequence rendering, refresh requests, or receipts;
- change `static/js/estate-shell.js` to v0.4.0;
- change page HTML, navigation, footer content, deployment configuration, provider settings, or secrets;
- add the `interface-preview-approved` label;
- merge or deploy the consumer change.

## Validation boundary

The exact pull-request head must pass the repository-native validation path in `.github/workflows/interface-preview.yml`, including HTML validation, JavaScript syntax checks, the complete Node test suite, `scripts/verify_interface_bundle.py`, sitemap validation, static-performance validation, Pages-output validation, JSON parsing, offline link checks, and `git diff --check`.

Changes under `static/vendor/atlas-interface/**`, `js/tests/*.test.mjs`, or `scripts/verify_interface_bundle.py` may require approved browser evidence. Adding `interface-preview-approved` publishes an isolated non-production Cloudflare Pages preview and remains a separate provider-write approval gate.

## Rollback

Before merge, close the pull request and delete the feature branch. After merge, revert the asset-readiness squash commit and verify the resulting production deployment. Existing routes remain on v0.3.0 throughout this stage, so rollback removes only the additional v0.4.0 static asset surface and its verification records.
