# Route social previews

Generates a distinct 1200×630 Open Graph / Twitter card per route, so a shared
link unfurls with its own title on WhatsApp, Slack, iMessage, LinkedIn, X, etc.
Cards are rendered from the estate's own tokens and self-hosted faces with a
deterministic rasteriser — no browser, no network, no screenshots, no live-state.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Curated copy per route: `kicker`, `title` lines (`[word]` = amber italic accent), `tagline`. |
| `routes.mjs` | Resolves the route set (manifest + auto-discovered articles). Dependency-free. |
| `lib.mjs` | Font prep (woff2→TTF), fontkit auto-fit, SVG builder, resvg render. |
| `build.mjs` | `npm run og:build` — renders every route's PNG into `/og/`. |
| `wire.mjs` | `npm run og:wire` — points each route's `og:image`/`twitter:image`/`og:image:alt` at its card. |
| `verify.mjs` | `npm run og:verify` — CI gate. Dependency-free (no `npm install`). |

## Publishing a new article

New writing is auto-discovered — you do **not** have to touch anything for a card
to exist. After the article's `writing/<slug>/index.html` is in place:

```bash
npm install        # first time only
npm run og         # build + wire + verify in one step
```

This generates `og/<slug>.png` from the article's own title/description and wires
its tags. Commit the new PNG and the modified HTML.

The card is intentionally functional-but-plain when auto-derived. To make it as
punchy as the flagship routes, add a curated entry to `manifest.json` (a manifest
entry overrides the auto-derived one) and re-run `npm run og`.

## Safety net

`og:verify` runs in CI (`.github/workflows/ci.yml`). It fails the build if any
route lacks a committed 1200×630 card, if a card is not wired into both
`og:image` and `twitter:image`, or if any page declares `og:image` without a
card — so a new post can never silently ship with the generic shared image.

## Not shipped as site content

The generator, `node_modules`, and `package.json` are excluded from the
Cloudflare Pages upload via `.assetsignore`; only `/og/*.png` is served.
