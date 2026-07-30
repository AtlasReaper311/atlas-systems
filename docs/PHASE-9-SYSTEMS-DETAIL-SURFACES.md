# Phase 9 Systems detail surfaces

## Scope

Phase 9 refactors the presentation hierarchy of:

- `/systems/observability/`;
- `/systems/reliability/`;
- `/systems/evidence/`.

The pages now expose one explicit analytical sequence:

1. observe what is happening;
2. evaluate whether it is reliable;
3. verify what proves the claim.

## Changed presentation

Each route now has:

- semantic Systems breadcrumbs;
- a route-specific evidence-boundary panel;
- the shared three-question Systems detail sequence;
- one dominant analytical area instead of a uniform stack of sections;
- clearer separation between primary state, supporting context, and raw sources;
- responsive single-column ordering at narrow widths;
- a repository-local Phase 9 stylesheet layered after the existing Systems foundation.

## Preserved contracts

This change does not alter:

- endpoint URLs, methods, fetch timing, or response parsing;
- fixed field allowlists and `textContent` rendering;
- stale, malformed, unavailable, unmeasured, or insufficient-evidence states;
- script-owned dynamic element identifiers;
- table semantics or dense-data overflow wrappers;
- footer installation or the tool footer variant;
- exact-route AtlasField compositions, seeds, host selectors, pointer behaviour, or reduced-motion state;
- workflows, provider settings, bindings, secrets, generated Writing output, publication, or deployment behaviour.

## Validation boundary

The pull request must pass repository-native HTML, JavaScript, Lab, System SYMPHONY, sitemap, static performance, Pages-output, interface-bundle, social-preview, JSON, whitespace, and offline-link validation.

A visual pull request remains blocked until Atlas separately approves the isolated interface preview and deterministic Chrome and Firefox evidence. Merge and production deployment remain separate later approvals.
