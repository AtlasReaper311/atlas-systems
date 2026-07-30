# Public interface Phase 7 browser identity

## Scope

This branch strengthens browser-identity verification for repository-owned Atlas Systems routes. It changes no page presentation, route content, generated article, footer, social-card image, sitemap entry, provider setting, or deployment configuration.

## Existing implementation

The site already maintains:

- a curated and auto-discovered social-card route graph;
- committed 1200 by 630 PNG cards;
- page titles and descriptions;
- canonical URLs;
- Open Graph and Twitter metadata;
- local browser icons and manifest;
- route social-card verification;
- sitemap validation;
- a dedicated noindex 404 route.

The existing verifier checked that metadata fields were non-empty and that social-image values matched the route card. It did not prove that:

- the canonical URL matched the resolved route;
- `og:url` matched that canonical route;
- document, Open Graph, and Twitter titles agreed;
- description, Open Graph description, and Twitter description agreed;
- theme colour matched the accepted Atlas value;
- all required icon declarations were present on every discovered route;
- JSON-LD was parseable;
- the 404 route remained outside canonical and social-card graphs.

A page could therefore contain internally inconsistent or wrong browser identity while keeping every required field non-empty.

## Exact browser-identity contract

`scripts/og/verify.mjs` now requires every local resolved route to expose:

- its exact `https://atlas-systems.uk<route>` canonical URL;
- matching `og:url`;
- one non-empty document title;
- matching Open Graph and Twitter titles;
- one non-empty description;
- matching Open Graph and Twitter descriptions;
- theme colour `#0a0a0f`;
- route-specific 1200 by 630 social image;
- matching Open Graph and Twitter image alt text;
- the complete local favicon, Apple touch icon, and manifest declarations;
- parseable JSON-LD when structured data is present.

The 404 route is verified separately. It must:

- use `404 // Atlas Systems`;
- expose a description and accepted theme colour;
- include `noindex` in robots metadata;
- include the local icon declarations;
- omit a canonical URL because the requested path is arbitrary;
- remain outside the social-card graph.

## Generated Writing boundary

Published Writing pages remain scheduler-owned output. This branch validates their committed browser identity but does not edit them.

`atlas-article-gen` Phase 7 PR #39 is the upstream source change for future generated article metadata. Existing W-05 through W-07 structured-data gaps, if retained after generator review, require a later generator and scheduler-owned refresh. They must not be corrected by hand in this repository.

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

This branch stops at a draft pull request. A later merge would trigger the normal `atlas-systems` production workflow and therefore requires separate merge and rollout approval, even though the intended change is validation-only.
