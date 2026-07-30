# Public interface programme Phase 8 accessibility and responsive corrections

Status: implementation candidate for exact-head pull-request validation and isolated browser evidence.

Recorded: 30 July 2026.

## Measured source

This branch is based on current `atlas-systems/main` at:

```text
d797cd945dcd79b12fb94f2ccbc596ff4317b8e0
```

The Phase 8 candidate set was derived from the latest complete main-site browser evidence available before implementation:

| Field | Value |
| --- | --- |
| Reviewed implementation head | `39c7a504e7c34bd758577c2928edd43c47ce6cd0` |
| Preview workflow run | `30527631163` |
| Evidence artifact | `8753822018` |
| Evidence digest | `sha256:f30b0fae8e597d79321657b49145d83215c70f4963c6dbc15cb8d7f8d86f1ff4` |
| Route, browser and viewport results | 348 |
| Post-reconciliation blockers | 0 |

The historical Phase 2 reporting baseline remained intentionally visible through later phases. Current source and later evidence were inspected before implementation so Phase 8 does not reopen findings already corrected by the Phase 5 shared semantics layer.

## Corrections

The branch makes five measured corrections:

1. The mobile terminal launcher moves above the governed 64-pixel bottom navigation, so it no longer overlaps the About destination at 320 pixels.
2. Shared wordmark, status, desktop navigation and search controls use the accepted 44-pixel minimum target. The existing tablet layout is compacted between 768 and 900 pixels without changing the accepted base breakpoint authority.
3. Signal Garden layer labels retain their active and inactive state classes but no longer reduce the opacity of the text itself below accessible contrast.
4. Drift removes its decorative title scrim below 861 pixels, where the negative decorative inset widened the document beyond the viewport.
5. Almost stacks its afterword below 821 pixels, before the three-column minimum widths can exceed the available inline size.

The reporting baseline removes the resolved accessibility and horizontal-overflow signatures. A recurrence of any removed signature is therefore blocking. Reviewed console diagnostics remain reporting-only and are not hidden or reclassified as fixed.

## Changed paths

- `static/css/estate-shell.css`
- `scripts/interface-evidence/reporting-baseline.json`
- `js/tests/phase-8-accessibility-responsive.test.mjs`
- `docs/public-interface-phase-8-accessibility-responsive.md`

## Protected boundaries

This branch does not change:

- generated Writing or article HTML, metadata, dates, sequencing or scheduler state;
- System Symphony audio, topology, mappings, consent, playback or evidence fixtures;
- Signal Garden synthesis, AudioWorklet, parameter mapping, lifecycle or performance logic;
- Drift simulation, node state, keyboard controls or policy-mode behaviour;
- Almost timing, seed, drawing, capture or local-only behaviour;
- estate-search requests or response handling;
- aggregate-status parsing, endpoint, timeout or fallback semantics;
- provider settings, bindings, secrets, workflows or production routes.

## Repository history note

During branch setup, the contents API created a temporary file named `__phase8_branch_probe__` directly on `main` in commit `4912b760f8946b78b46cc285d65aeb218f3f9300`. It contained only `probe` and was immediately removed in `d797cd945dcd79b12fb94f2ccbc596ff4317b8e0` before this feature branch was created. The two commits remain visible in repository history, but the resulting product tree is unchanged from the preceding article-refresh commit.

## Validation boundary

Repository-native pull-request checks and the existing labelled interface-preview workflow are authoritative for the exact branch head. The preview must cover Chrome and Firefox at 320, 375, 768, 1024, 1440 and reporting-only 1920 pixels. Changed Work, Writing, Signal Garden, Drift and Almost routes require direct review.

This branch does not authorise the `interface-preview-approved` label, merge, production deployment, Corpus refresh or any provider write.

## Rollback

Before merge, close the pull request and delete the branch. After a separately approved merge, revert the Phase 8 consumer commit and verify the resulting production deployment and representative live routes.
