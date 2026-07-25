# Estate social previews

This generator creates deterministic 1200×630 Open Graph and Twitter cards for
Atlas Systems routes and selected external Atlas surfaces. It uses repository
fonts and brand tokens without browser screenshots, network calls, timestamps,
or live-state indicators.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Curated local routes and external satellites. Square brackets mark the amber italic accent. |
| `routes.mjs` | Resolves routes, discovers Writing articles, validates entry identity, and owns metadata helpers. |
| `lib.mjs` | Prepares fonts, measures title width, builds SVG, and renders PNG output. |
| `build.mjs` | Renders every local and external card into `/og/`. |
| `wire.mjs` | Materialises complete static metadata for local routes only. |
| `verify.mjs` | Enforces card dimensions, unique ownership, local metadata, alt text, and bidirectional coverage. |

## Local routes and satellites

Entries in `manifest.routes` own HTML inside `atlas-systems`. Each entry has a
card file, HTML path, route, kicker, one or two title lines, and a tagline.

Entries in `manifest.satellites` are render-only. Their HTML belongs to another
repository, so this project generates and verifies the PNG but does not edit the
satellite page. The current satellites are Ramone, Status, Public API Docs, and
the CV viewer.

## Commands

```bash
npm install
npm run og
```

`npm run og` renders the images, wires every local page, and runs the verifier.
The wiring step is idempotent and inserts missing canonical, Open Graph, and
Twitter metadata before applying the route-specific image and alt text.

New Writing articles are discovered from `writing/<slug>/index.html`. Their card
copy is derived from the article metadata until a curated manifest entry is
added.

## Validation contract

`npm run og:verify` fails when:

- a card file, route, or local HTML path is duplicated;
- required copy or ownership fields are missing;
- a local or external PNG is missing, invalid, or not 1200×630;
- local canonical, Open Graph, or Twitter metadata is incomplete;
- image URLs, dimensions, or alt text do not match the resolved card;
- a local page still references `og-default.png`;
- HTML declares a static social image without a resolved local card.

The generic image remains only as the JavaScript fallback in
`lab/shared/shell.js`. Static route metadata takes precedence for crawlers.

## Publishing boundary

Generator source, package metadata, tests, and dependencies are excluded from
the Cloudflare Pages artifact through `.pagesignore`. Only the generated images
and normal public site files are published.

Deploy the central image first. Update a satellite repository to reference its
new URL only after the image is live and independently verified.
