# Estate search

> Merge this section into the site README, alongside the Lab panel
> documentation. It documents the shared search component added in
> July 2026.

One retrieval code path for every search surface on the site. The
homepage widget, the cmd+k overlay in the nav, and (after migration)
the Lab corpus panel all import the same two modules; there is exactly
one place where endpoints, failover, caching, and result rendering are
defined, instead of a copy of that logic inlined per page.

## Modules

| File | Job |
| --- | --- |
| `static/js/estate-search/client.js` | Query in, normalized hits out. Endpoint chain, failover, LRU cache, error taxonomy. Zero DOM references, so it is unit-testable and reusable from any placement. |
| `static/js/estate-search/render.js` | The result item component (provenance label, doc type badge, score, excerpt, actions) and the search-to-Ramone bridge. All response data reaches the page via `textContent`, never `innerHTML`, per the estate rule. |
| `static/js/estate-search/homepage-widget.js` | The full-size widget. Builds its own chassis in an empty `[data-estate-search]` container, or mounts onto existing `.cs-w` markup (the Lab panel). Shows up to 8 results on submit. |
| `static/js/estate-search/global-search.js` | The cmd+k overlay: shortcuts, focus trap, keyboard selection, aria wiring, 250ms debounced query-as-you-type, top 5 results. Loading it also installs the Ramone prefill listener. |
| `static/css/estate-search.css` | Widget chassis, result item, overlay, and nav trigger styles. Reads the site's existing custom properties with the same hex fallbacks the shipped widgets use; no new tokens. |
| `site-snippet/estate-search-includes.html` | Every markup insertion, numbered, with placement instructions. |

## Endpoint chain

`client.js` tries, in order:

1. `http://localhost:8092/search` (only when the page itself is served
   from localhost, matching the shipped widget's local-preview rule)
2. `https://corpus.atlas-systems.uk/search` (the tunnel, primary in
   production)
3. `https://api.atlas-systems.uk/v1/search` (the edge proxy)

The first two tiers and their order are exactly the shipped corpus
widget's chain; the edge proxy is appended as a new final tier, not a
reordering. All three are GET, which atlas-corpus added specifically so
browser search needs no CORS preflight. Failover advances on any
failure including 429, which again matches the shipped behaviour; the
edge tier has its own independent rate budget, so advancing on 429 is
genuinely useful rather than cosmetic.

## Search and Ramone are different tools

Search is fast literal lookup: ranked chunks with provenance, for
someone who already knows roughly what they want. Ramone is cited
synthesis: an answer assembled from those same chunks, for someone who
wants it explained. Both stand on the same index (atlas-corpus), which
is the point of the whole rewire.

The hinge between them is the "ask ramone about this" action on every
result. It builds a question from the hit (a caching doc in
specular-edge becomes "explain how caching works in specular-edge"),
then either pre-fills the Lab composer in place if it is on the current
page, or navigates to `/lab/?ask=<question>#ramone-card` where the
prefill listener fills the composer on arrival and strips the parameter
from history. It never submits; the person always gets to edit the
question and press send themselves. The bridge dispatches a real
`input` event so the composer's own char counter and send wiring react,
rather than reimplementing any of the composer.

## Wiring a page

From `site-snippet/estate-search-includes.html`:

- Blocks 1 and 2 (stylesheet link, `global-search.js` module include)
  go on every page. That is the whole cost of having cmd+k and the
  bridge everywhere.
- Block 3 is the nav trigger, last item in `ul.nav-links`. The kbd hint
  self-corrects to the visitor's platform at runtime.
- Block 4 is the mobile-nav trigger, because `.nav-links` hides under
  680px.
- Block 5 is the homepage widget: an empty section plus the
  `homepage-widget.js` include, homepage only.

Lab migration (optional, recommended): add `data-estate-search` to the
existing corpus panel section, include the widget script, delete the
old inline corpus IIFE, and change the button label from "ask" to
"search". Behaviour note that matters: the old panel POSTed to `/ask`
and rendered a synthesized answer; the migrated panel queries `/search`
and renders ranked hits. Synthesis did not disappear, it moved one
click away onto every result, next to a composer where the question can
be edited first.

## Content security policy

No new hostnames are introduced. The chain talks to
`corpus.atlas-systems.uk` and `api.atlas-systems.uk`, both of which the
shipped Lab panels already require in `_headers`' `connect-src`.
Verify before deploying:

```
grep -n "connect-src" _headers
```

Both hostnames must appear. If the edge proxy one is missing (it was
added later than the tunnel), append `https://api.atlas-systems.uk` to
the `connect-src` list; nothing else in the policy changes.

## Rate budget

The corpus allows 60 searches per hour per IP on the tunnel and the
edge proxy allows 10 per minute, and every uncached query costs a real
embedding on the 5070. The component is built to respect that budget
rather than fight it: one shared client instance per page so all
surfaces share a 30-entry LRU cache of successful results, 250ms
debounce and a 2-character minimum in the overlay so half-typed queries
never leave the browser, and the overlay caps at 5 results while the
widget asks for 8 (the corpus maximum is 10). Repeated queries, the
most common pattern in a search box, are free.

## Accessibility

The overlay is `role=dialog` with `aria-modal`, a focus trap, and focus
restoration to whatever opened it. The input is a combobox driving a
listbox: arrow keys move `aria-activedescendant` across options, Enter
opens the selected result, Tab walks the real links and each result's
ask-ramone action inside the trap, Esc closes. Result counts and states
announce through a polite live region. The scrim closes on click. The
"/" shortcut ignores keystrokes inside editable fields. Reduced-motion
preferences disable the transitions and the prompt blink.

## Hit shape note

The deployed corpus `SearchHit` is `{text, score, source_repo,
file_path, doc_type, last_updated, chunk_index}`; some estate docs
describe it as `{repo, path, excerpt}`. `client.js` normalizes both
spellings into one internal shape, so a serialization change in the
producer degrades to a no-op here instead of a blank results list. The
same defence exists in Ramone's new retriever, flagged in that repo's
README.

## Verification

See `VERIFICATION.md` in the delivery root for the full checklist with
commands: widget query, overlay keyboard walk, bridge prefill on
`/lab/`, and the corpus-down failure drill.
