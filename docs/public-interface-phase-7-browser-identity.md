# Public interface Phase 7 browser identity

## Scope

This branch completes and strengthens browser identity for repository-owned Atlas Systems routes. It changes no body presentation, route content, generated article, footer, social-card image, sitemap entry, provider setting, or deployment configuration.

## Existing implementation

The site already maintained:

- a curated and auto-discovered social-card route graph;
- committed 1200 by 630 PNG cards;
- page titles and descriptions;
- canonical URLs;
- Open Graph and Twitter metadata;
- repository-local browser assets;
- route social-card verification;
- sitemap validation;
- a dedicated noindex 404 route.

The existing verifier checked that metadata fields were non-empty and that social-image values matched the route card. It did not prove exact canonical ownership, local icon completeness, JSON-LD parseability, or the 404 exclusion contract.

The Phase 7 inspection also found nine Lab routes without the complete icon and manifest declarations. Eight are current instruments or compatibility routes. `/lab/console/` is the accepted legacy operations route already deferred to Phase 11.

## Exact browser-identity contract

`scripts/og/verify.mjs` now requires every non-exempt local resolved route to expose:

- the exact route canonical URL, including any explicitly declared alias target;
- matching `og:url`;
- one non-empty document title;
- matching Open Graph and Twitter titles;
- non-empty standard, Open Graph, and Twitter descriptions;
- a non-empty theme colour;
- a route-specific 1200 by 630 social image;
- matching Open Graph and Twitter image alt text;
- the complete local favicon, Apple touch icon, and manifest declarations;
- parseable JSON-LD when structured data is present.

Social descriptions and theme colours remain product-owned. The verifier requires their presence and route consistency without forcing every route to use identical editorial copy or one visual accent.

## Route aliases

`scripts/og/manifest.json` records two intentional canonical aliases:

- `/lab/console/` canonicalizes to `/lab/`;
- `/lab/reliability/` canonicalizes to `/systems/reliability/`.

The verifier requires `og:url` to match the accepted canonical target rather than assuming every compatibility route is self-canonical.

## Local icon corrections

The complete local icon and manifest declarations are now present in committed source for:

- System Map;
- Proof Chain;
- Signal Garden;
- the Reliability compatibility route;
- Estate Conformance;
- Telemetry Anomaly Detector;
- Almost;
- Drift.

Only `<head>` declarations changed. Instrument bodies, scripts, audio, telemetry, evidence, canvas, timing, deterministic-state, and redirect behavior remain unchanged.

## Bounded console exception

`scripts/og/browser-identity-exceptions.json` records one exception:

- path: `lab/console/index.html`;
- scope: complete icon declarations only;
- required robots state: `noindex`;
- required canonical: `https://atlas-systems.uk/lab/`;
- resume phase: Phase 11.

The exception schema is fail-closed. Unknown fields, unsupported scope, invalid phase, duplicate paths, absent resolved routes, weak reasons, changed robots state, or changed canonical target fail validation. The route still passes all title, description, Open Graph, Twitter, social-image, and JSON-LD checks. No other route may inherit the exception.

## 404 contract

The 404 route is verified separately. It must:

- use `404 // Atlas Systems`;
- expose a description and theme colour;
- include `noindex` in robots metadata;
- include the local icon declarations;
- omit a canonical URL because the requested path is arbitrary;
- remain outside the social-card graph.

## Generated Writing boundary

Published Writing pages remain scheduler-owned output. This branch validates their committed browser identity but does not edit them.

`atlas-article-gen` Phase 7 PR #39 is the upstream source change for future generated article metadata. Any published-article refresh remains generator and scheduler-owned and must not be corrected by hand in this repository.

## Validation

The repository-native pull-request workflow runs the strengthened verifier together with:

- HTML validation;
- all main-site, Lab, and System Symphony tests;
- title normalization drift checks;
- sitemap checks;
- static performance checks;
- complete and filtered Pages-output verification;
- committed JSON parsing;
- offline link validation;
- public-interface conformance;
- CodeQL and Scorecard.

Browser preview publication remains behind `interface-preview-approved`. This branch does not add that label.

## Security and rollout boundary

The verifier reads committed files only. It makes no network request and performs no mutation.

This branch stops at a draft pull request. A later merge would trigger the normal `atlas-systems` production workflow and therefore requires separate merge and rollout approval.
