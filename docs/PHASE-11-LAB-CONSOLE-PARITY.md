# Phase 11 Lab Console Parity Inventory

Status: Branch 2 source inventory for `refactor/lab-evidence-tools`.

This record preserves `/lab/console/` as a noindex compatibility route while
the focused Lab tools reach panel parity. It does not authorize a redirect,
removal, sitemap promotion, evidence reinterpretation, API contract change, or
production deployment.

## Console Boundary

- Source route: `/lab/console/`
- Public indexing: preserved noindex compatibility route
- Current purpose: dense operator view combining Lab flagships, live estate
  evidence, event feeds, delivery evidence, telemetry, API surface summaries,
  and an operations rail
- Retirement state: not eligible for removal

## Panel Matrix

| Panel | Current function | Current data source | Focused route | Missing parity | State | Migration or retirement prerequisite | Evidence needed before removal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lab introduction and Ramone hero | Opens the Lab route with Ramone as the first major experience and a compact local composer. | Ramone edge interaction plus local Lab markup. | `/lab/` and `https://ramone.atlas-systems.uk/` | Focused Ramone ownership is external; the console still carries legacy landing copy. | Duplicated | Keep Lab home and Ramone route evidence current; do not use console removal to alter Ramone startup behavior. | Browser evidence that Lab home and Ramone preserve entry, focus return, and source-link behavior without console anchors. |
| Signal and reliability programme cards | Routes visitors from the old console into four focused instruments. | Static console markup. | `/lab/signal/`, `/lab/anomaly/`, `/lab/conformance/`, `/systems/reliability/` | The cards are now routing aids, not unique evidence. | Obsolete after route proof | Confirm each focused route is linked from shared Lab navigation and the Lab directory. | Source tests and browser evidence showing each focused route is reachable without the console. |
| System map | Shows declared estate topology, live registry status, node type legend, and connection legend. | `lab/system-map.topology.js`, `lab/system-map-bootstrap.js`, public registry health. | `/lab/system-map/` | Focused route has the core map and legend; old console rail integrations are not part of the map contract. | Duplicated | Keep the dedicated System Map route and shared navigation current. | Route evidence that `/lab/system-map/` renders the graph, flat fallback, legend, statusline, and unavailable state. |
| Incident console / Blackbox | Replays sealed incident windows, shows recorder state, postmortems, and cursor telemetry. | `https://api.atlas-systems.uk/blackbox/status`, `/incidents`, `/incidents/:id`, `/postmortem`. | `/lab/blackbox/` | Focused Blackbox has the replay deck and postmortems; the adjacent failure log and rail summary remain console-only. | Partially duplicated | Prove failure-log and summary-rail behavior either belongs in Blackbox or moves to an observability route. | Browser evidence for incident selection, scrubber, replay, postmortem panel, unavailable copy, and failure-log parity decision. |
| Failure log | Filters recent events by level and feeds Blackbox fallback and the operations rail. | `https://api.atlas-systems.uk/notify/recent`, `https://api.atlas-systems.uk/deploy-watch/latest`, Blackbox events. | None yet | No focused route owns the level filters and cross-source event merge. | Still unique | Assign the filtered event feed to Status, Observability, or Blackbox before removal. | Contract and browser evidence for filters, refresh, empty state, fallback source labels, and keyboard access on the chosen route. |
| Activity heatmap | Displays 90-day repository activity, repository count, top language, month/day grid, and tooltip. | `https://api.atlas-systems.uk/pulse/heatmap`. | None yet | No focused route owns the heatmap grid or tooltip. | Still unique | Decide whether activity belongs on Systems, Observability, or a dedicated Activity route. | Browser evidence for heatmap grid, tooltip/focus alternative, loading, unavailable, and no-data states. |
| Pipeline status grid | Aggregates recent pipeline events, success rate, weekly count, top source, and health strip. | `notify/recent`, `deploy-watch/latest`, local pipeline grouping. | `/systems/observability/` | Observability exposes related evidence, but not the exact grid, stats, and health strip parity. | Partially duplicated | Either migrate the grid into Observability or record why the detailed grid is retired. | Source and browser evidence for event grouping, status summaries, empty states, and route-level escape paths. |
| Live estate section | Combines Specular telemetry, registry state, corpus search, infra health, and RAG query counters. | `api.atlas-systems.uk/specular`, `/v1/registry`, `/v1/infra/status`, `/v1/rag/stats`, corpus search endpoints. | `/systems/observability/`, `https://status.atlas-systems.uk/`, Ramone search surfaces | The mixed operator layout is not yet represented as a single focused route. | Still unique | Split each live block to its owning product route or preserve a non-indexed operator-only surface. | Evidence for each block's loading, stale, unavailable, unknown, and empty states on its owning route. |
| DORA metrics | Shows deployment frequency, change failure rate, MTTR, trends, degraded/error copy, and raw JSON link. | `https://api.atlas-systems.uk/dora/metrics`. | `/systems/observability/` | Related delivery evidence exists, but exact DORA copy and trend presentation need parity confirmation. | Partially duplicated | Decide whether DORA remains inside Observability or gets a focused delivery-evidence route. | Route evidence for raw JSON link, degraded state, trend text, and bounded DORA interpretation. |
| API surface summary | Summarizes public API index workers, endpoints, methods, auth tags, missing metadata, and docs link. | `https://api.atlas-systems.uk/`, `lab/api-surface-repository-count.js`. | `https://api.atlas-systems.uk/v1/docs` | API Docs owns the full contract catalogue; the console summary still highlights missing `_meta` in the Lab context. | Partially duplicated | Confirm API Docs and Systems expose the same public-contract escape without adding HTML to the JSON-only API index root. | Live/API-doc evidence for endpoint grouping, metadata state, raw OpenAPI access, and JSON-only root preservation. |
| Operations rail | Provides sticky summaries for recorder, incident, live telemetry, pipeline stats, and failure feed. | Derived from Blackbox, Specular, notify, and pipeline event state in the console page. | None yet | The rail is an operator composition, not a focused public tool. | Still unique | Replace with route-local summaries on Blackbox, Observability, and Status, or keep the noindex console. | Browser evidence that mobile focus, sticky behavior, failure-feed links, and summary announcements are covered elsewhere. |

## Removal Gate

`/lab/console/` can only be considered for redirect or removal after every
row above is either:

1. duplicated by a focused route with source and browser evidence;
2. explicitly retired by owner-approved evidence; or
3. retained as a noindex operator-only surface with a documented reason.

Until then, the route remains available, excluded from public promotion, and
protected by the `_headers` noindex rule.
