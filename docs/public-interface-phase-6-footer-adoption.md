# Public interface Phase 6 footer adoption

## Authority

This consumer implementation follows:

- `atlas-infra/docs/adrs/ADR-0008-public-interface-programme-governance.md`;
- `atlas-infra/docs/adrs/ADR-0009-classic-writing-article-footer-exception.md`;
- `atlas-infra/policy/public-interface-footer-extension-v1.json` at contract version `1.1.0`;
- immutable `atlas-interface-kit v0.4.0` footer structure and responsive behaviour.

The existing site foundation remains on its accepted v0.3.0 presentation layer. `static/css/phase-6-footer.css` carries only the footer selectors needed by this consumer so v0.4.0 does not become an accidental site-wide overlay.

## Route ownership

`static/js/phase-6-footer.js` resolves each route into one of three states:

| Route family | Result |
|---|---|
| estate pages such as `/`, `/work/`, `/writing/`, `/systems/`, `/about/`, and `404.html` | `atlas-footer--estate` |
| Lab instruments and focused Systems tools | `atlas-footer--tool` |
| `/writing/<slug>/` | excluded under ADR-0009 |
| `/lab/console/` | deferred to Phase 11 |

Estate footers contain identity, context, evidence, and estate escape. Tool footers contain identity, tool context, evidence, and estate escape. Neither profile contains an editorial sequence slot.

The shared estate-search renderer imports the footer installer because that renderer is already present on the public portfolio, directory, error, Lab-shell, and generated Writing surfaces. The installer is idempotent and checks the route before touching the document. The Bearing loads the same installer directly because it is a deliberately self-contained Lab instrument outside the shared shell.

## Writing boundary

W-01 through W-07 remain byte-owned by the generator and scheduler pipeline. The route resolver returns no footer profile for article-detail routes, so the browser leaves each existing `<div class="article-footer">` and its previous/next sequence untouched.

No generated article HTML, metadata, publication-plan state, scheduler queue state, dates, or publication state are changed by this adoption.

## Console boundary

`/lab/console/` remains the preserved legacy operations route. It continues to load the shared estate modules, but the route resolver returns no footer profile. Retirement, redirection, or full shell integration belongs to Phase 11.

## Assets and links

- `static/css/phase-6-footer.css` is a consumer-owned footer-only layer derived from immutable `atlas-interface-kit v0.4.0` selectors.
- Atlas-owned destinations remain same-tab.
- External destinations use `target="_blank"` with `rel="noopener noreferrer"`.
- Interactive footer links retain the 44px minimum target, visible focus, mobile single-column layout, safe-area padding, and reduced-motion handling.

## Validation

`js/tests/phase-6-footer-contract.test.mjs` verifies:

- estate, tool, Writing, and console route resolution;
- the required footer slots for estate and tool variants;
- route coverage through the existing shared module path;
- the footer-only v0.4.0 selector contract;
- preservation of W-01 through W-07 classic footers;
- direct adoption by The Bearing;
- explicit console deferral.

The normal public-interface workflow runs HTML validation, all Node tests, local bundle verification, sitemap checks, performance checks, Pages-output verification, offline link checks, and diff checks. Browser evidence remains behind the separate `interface-preview-approved` provider-write gate.

## Rollback

Before deployment, rollback is branch deletion or pull-request closure.

After an approved deployment, rollback removes the import of `phase-6-footer.js`, removes The Bearing's direct module include, and removes the two Phase 6 footer files. The legacy page footers remain in source and become visible again where they previously existed. Article pages and `/lab/console/` require no rollback because this change never modifies them at runtime.
