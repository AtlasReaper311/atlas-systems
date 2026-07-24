# Card signatures

The Public Interface v2 Lab and Systems directories use one first-party SVG
signature vocabulary to distinguish the operation behind each card without
turning maturity or runtime state into decoration.

## Scope and ownership

- Owner: Atlas Systems
- Routes: `/lab/` and `/systems/`
- Current coverage: 30 card instances and 16 unique signatures
- Cost: no external service, package, build step, or runtime dependency
- Licence: first-party visual assets distributed under this repository's MIT
  licence

Repeated destinations deliberately share a signature across both pages. For
example, System Map always uses `TOPO`, Proof Chain always uses `TRACE`, and
Ramone always uses `RAG`.

## Files

- `static/media/card-signatures.svg` contains the local SVG symbol sprite.
- `static/js/card-signatures.js` maps approved `data-visual` values to symbols
  and adds decorative, assistive-technology-hidden signature markup.
- `static/css/card-signatures.css` owns signature presentation and the card
  layout safety rules.
- `js/tests/card-signatures.test.mjs` enforces coverage, asset loading, layout
  contracts, and governed preview ownership.

## Interface contract

Every `.system-card` on the governed pages must carry:

```html
data-visual="map" data-motif="TOPO"
```

`data-visual` selects a registered SVG symbol. `data-motif` supplies the short
operation label and remains the CSS-only fallback.

The JavaScript fetches the sprite from the same origin, injects it once, and
marks successfully enhanced cards with `data-card-signature-ready="true"`.
Signatures are decorative and use `aria-hidden="true"`.

## Layout policy

- Text, metadata, and actions must never sit underneath signature artwork.
- Directory cards reserve a lower visual zone before positioning the signature.
- Featured cards place the signature in its own final grid row.
- Actions remain one line and retain their complete visitor-facing wording.
- Narrow screens reduce the signature to 118 by 89 CSS pixels.
- Hover motion is disabled when `prefers-reduced-motion: reduce` is active.

The governed browser evidence fails if a card is missing its signature, if a
signature intersects direct card copy, or if an action label overflows.

## Adding or changing a signature

1. Add or update a `<symbol id="signature-NAME">` in the local sprite.
2. Add `NAME` to `CARD_SIGNATURES` in `static/js/card-signatures.js`.
3. Set matching `data-visual` and `data-motif` attributes on every card instance.
4. Run the focused and repository-wide checks below.
5. Review both routes in Chrome and Firefox at 320, 375, 768, 1024, and 1440
   CSS pixels before merge.

Do not use a maturity badge or operational colour as the signature identity.
Those contracts remain separate.

## Failure modes

- JavaScript disabled: the existing CSS motif remains visible.
- Sprite request fails: enhancement logs one warning and preserves the fallback.
- Unknown `data-visual`: the card remains usable and logs a bounded warning.
- Reduced motion requested: signature transforms and transitions are removed.

No failure prevents the card link or its visitor-facing copy from working.

## Validation

```bash
node --test js/tests/card-signatures.test.mjs
node --test js/tests/*.test.mjs lab/tests/*.test.mjs static/js/sonify/*.test.js
npx --yes html-validate@9.7.1 "**/*.html"
python3 scripts/generate_sitemap.py --check-only
python3 scripts/verify_pages_output.py .
git diff --check
```

The pull-request interface preview then runs the pinned Chrome/Firefox evidence
matrix and publishes screenshots without changing production.

## Rollback

Remove the two versioned asset references from `lab/index.html` and
`systems/index.html`, then remove the signature CSS, JavaScript, sprite, and
focused test. The original `data-motif` CSS treatment remains in
`static/css/v2-directory-pages.css`, so rollback restores the previous cards
without changing any route, destination, copy, or live-data contract.
