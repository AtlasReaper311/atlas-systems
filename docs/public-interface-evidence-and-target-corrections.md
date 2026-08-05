# Public interface evidence and target corrections

Status: implementation candidate on `interface/evidence-target-corrections-v0.5.0`. Merge and production rollout remain separately approval-gated.

## Authority and release

This batch consumes the immutable `AtlasReaper311/atlas-interface-kit` release `v0.5.0`.

Release evidence:

- source merge: `21a1a168e3b25e916555ce4edd4229bd7c061ecb`;
- tag: `v0.5.0`;
- release workflow run: `31031935772`;
- archive SHA-256: `00171c91963094fb028a124636db355ab0deb844f661e60590e89672e2379a94`;
- release-manifest SHA-256: `9cf1f70988e013fe93c541f968c4dd50dc676d651308a5dff2fbc00b85202725`.

The governing authority is `AtlasReaper311/atlas-infra` commit `c5b4261a0c4b267ec995a499df0a65ac461885a6` and `policy/public-interface-evidence-mode-extension-v1.json`.

## Bounded adoption

The global estate shell remains on the previously accepted Interface Kit foundation. Version `0.5.0` is vendored as a complete repository-local release and is loaded only by the corrected Conformance and Shape Detector evidence surfaces.

That boundary prevents an unrelated estate-wide restyle while allowing the published evidence selectors and machine-readable contracts to govern the affected routes.

## Corrected behaviour

Estate Conformance:

- unavailable evidence no longer becomes zero errors, zero warnings, zero unknowns, or zero repositories;
- absent values render as an em dash and the score remains explicitly unscored;
- primary state, summary values, tables, rule catalogue, findings, and provenance share `data-evidence-mode="unavailable"`;
- successful API evidence uses `data-evidence-mode="measured"`;
- runtime state remains separate through `data-runtime-state`.

Shape Detector:

- browser-generated fallback telemetry is labelled Simulated rather than recorded replay;
- the simulation uses a dedicated schema identifier;
- primary state, score, chart, metric explanation, and table retain the Simulated boundary;
- synthetic runtime-state words remain visible but use neutral visual treatment;
- the simulated chart uses neutral bands and a dashed neutral score line;
- successful endpoint evidence remains Measured.

Directories:

- Lab and Systems describe Shape Detector as Live and simulated;
- both cards use one shared normalization function so wording cannot drift independently.

Interaction targets:

- Conformance, Shape Detector, and System SYMPHONY load an executable browser geometry contract;
- control-like navigation links, buttons, summaries, form controls, tabs, and product actions must render at least 44 by 44 pixels;
- System SYMPHONY receives route-local target corrections for its previously undersized summaries, menu links, tabs, status controls, audio controls, general buttons, and collapse control;
- a rendered failure emits a stable console error, which is blocking in the existing deterministic browser-evidence workflow.

## Preserved contracts

This batch does not change:

- telemetry, anomaly, or conformance endpoint URLs;
- anomaly score or conformance score calculation;
- persistence, routing, Cloudflare settings, or provider state;
- System SYMPHONY audio, scenario, runtime-state, or evidence behaviour;
- global navigation structure;
- homepage or directory layout;
- publication timing or article output.

## Validation

The branch must pass:

- complete Node test discovery;
- Python Interface Kit bundle verification;
- public-interface conformance checks;
- CodeQL and OpenSSF checks;
- isolated preview publication;
- Chromium and Firefox route evidence at the blocking viewports;
- manual visual review of `/lab/conformance/`, `/lab/anomaly/`, `/lab/`, `/systems/`, and `/lab/system-symphony/`.

## Rollback

Revert the consumer pull request. The immutable Interface Kit `v0.5.0` release remains valid and does not require deletion. No provider rollback, secret rotation, data migration, endpoint rollback, or release rollback is required.
