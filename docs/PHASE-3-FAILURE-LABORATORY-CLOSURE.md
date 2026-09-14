# Phase 3 Failure Laboratory closure

Status: source ready for the owner merge gate. This record does not claim that
Phase 3 is merged, deployed, or live-closed.

Evidence date: 2026-09-14

## Issue and pull request sequence

The Phase 3 source sequence is:

1. [Issue #283](https://github.com/AtlasReaper311/atlas-systems/issues/283), architecture audit, closed by [PR #288](https://github.com/AtlasReaper311/atlas-systems/pull/288).
2. [Issue #284](https://github.com/AtlasReaper311/atlas-systems/issues/284), shared failure-scenario model, closed by [PR #289](https://github.com/AtlasReaper311/atlas-systems/pull/289).
3. [Issue #285](https://github.com/AtlasReaper311/atlas-systems/issues/285), Failure Laboratory route, closed by [PR #290](https://github.com/AtlasReaper311/atlas-systems/pull/290).
4. [Issue #286](https://github.com/AtlasReaper311/atlas-systems/issues/286), bounded instrument handoffs, closed by [PR #291](https://github.com/AtlasReaper311/atlas-systems/pull/291).
5. [PR #292](https://github.com/AtlasReaper311/atlas-systems/pull/292), final Failure Laboratory guided-workspace presentation remediation, merged into `main`.
6. [Issue #287](https://github.com/AtlasReaper311/atlas-systems/issues/287), this directory, sitemap, metadata, cross-link, and closure pass, carried by [draft PR #293](https://github.com/AtlasReaper311/atlas-systems/pull/293) at source head `a5c1213da8f16f9c786cc3fc406cb1e43bb98396`.

The branch starts from current `origin/main` at
`f34db1be839581e56c46c462203ecd2b755b8dd7`. The current PR is one source
commit ahead of that base.

## Canonical journey contract

- Canonical route: `https://atlas-systems.uk/lab/failure-laboratory/`.
- Model: `data/failure-laboratory-model.json`, version `1`.
- Seven canonical scenarios, in model order: `normal-operation`,
  `latency-creep`, `cache-collapse`, `dependency-failure`,
  `network-partition`, `cascading-failure`, `recovery`.
- Six canonical stages, in journey order: `Request`, `Dependencies`,
  `Coordination`, `Impact`, `Incident evidence`, `Recovery`.
- The model contains nine named instruments and eight unique public surfaces.
  Atlas Twin context and Evidence Console intentionally resolve through the
  same public Systems Evidence route.
- The route remains a guided map of existing instruments. It does not embed
  their controls, select their internal state, create shared runtime state, or
  create a second evidence store.

## Directory information architecture

The Lab home now presents the structure in this order:

1. Ramone remains the approved full flagship and first major Lab experience.
2. Failure Laboratory is the primary guided systems-failure journey entry,
   with the six-stage summary and an explicit scenario-only boundary.
3. System SYMPHONY and Spectral Forge remain the approved audio flagship
   counterparts. Their product identities and local controls are unchanged.
4. Participating specialist instruments are shown together as connected
   destinations: Request X-Ray, CASCADE, Consensus, Neon Relay, and Evidence
   Console. Each card keeps its native route and evidence wording.
5. Blackbox remains in the existing Observe group. The participating section
   provides a contextual link to it so it is not duplicated or reclassified.
6. Atlas Motion remains a separate mini-flagship and is explicitly not a
   Failure Laboratory stage or participating instrument.
7. Other Labs and systems tools remain grouped by their existing purpose.
   Signal Garden, System Map, Observability, Status, Detailed Console, Proof
   Chain, Estate Conformance, Reliability, API Docs, Speculum, Almost, Drift,
   The Bearing, and Shape Detector remain outside the journey entry section.

The Lab home rail contains a prominent Failure Laboratory link. The shared
route inventory remains unchanged, so the new journey does not silently become
an equal member of every compact Lab tool menu.

## Participating instruments and routes

The model-approved participating set is:

| Instrument | Route | Journey role | Native evidence mode or boundary |
| --- | --- | --- | --- |
| Request X-Ray | `/lab/xray/` | Request | `simulated`; deterministic browser request-path model |
| CASCADE | `/lab/cascade/` | Dependencies | `simulated`; deterministic synthetic dependency graph |
| Consensus | `/lab/consensus/` | Coordination | `simulated`; fixed-leader teaching model |
| Neon Relay | `/lab/neon-relay/` | Coordination | `simulated`; bounded synthetic circuit |
| Atlas Twin context | `/systems/evidence/` | Impact context | public generated context; `could be affected` remains the exact claim |
| Blackbox | `/lab/blackbox/` | Incident evidence | `measured` recorder observations and `recorded-replay` records |
| Spectral Forge | `/lab/spectral-forge/` | Cross-cutting | `simulated`; deterministic telemetry-to-sound instrument |
| System SYMPHONY | `/lab/system-symphony/` | Cross-cutting | measured, stale-measured, recorded-replay, simulated, or unknown by source state |
| Evidence Console | `/systems/evidence/` | Impact and incident-evidence destination | view-specific measured, stale-measured, recorded-replay, unknown, or unavailable |

Atlas Motion, Ramone, Signal Garden, System Map, Observability, Status, the
Detailed Console, Proof Chain, Estate Conformance, Reliability, API Docs, and
the Explore instruments are not model participants. This is a directory
boundary, not a product reclassification. The private Twin producer has no
public route and is not exposed by this closure.

## Recovery gap

Recovery remains intentionally open. There is no single current authoritative
Phase 3 Recovery Evidence instrument. Recovery-like output, a named aftermath
record, measured or stale source readings, unavailable evidence, and unknown
evidence remain separate facts. None proves universal current service recovery,
root-cause resolution, or current estate health.

## Evidence modes and non-claims

The accepted evidence-mode vocabulary remains:

`measured`, `stale-measured`, `recorded-replay`, `simulated`, `unavailable`,
`unknown`, and `not-applicable-unscored`.

The directory and route do not imply any of the following:

- a scenario selection is a current production incident;
- a simulated failure is an observed failure;
- a topology or dependency relationship is observed propagation;
- Twin `could be affected` means `was affected`;
- recorded replay is current live state;
- merge means deployed or live;
- a normal-operation scenario means current estate health;
- sonification is authoritative incident evidence;
- one instrument's state is the state of every linked instrument.

Evidence mode remains separate from lifecycle state, runtime state, deployment
identity, and live behavior. Missing evidence remains `unknown` or
`not-applicable-unscored` where the owning contract requires it.

## Sitemap, metadata, and public interface result

- `/lab/failure-laboratory/` remains in the generator-owned sitemap as an
  indexed route with priority `0.7`.
- Request X-Ray, CASCADE, Consensus, and Neon Relay remain noindex specialist
  routes and are not inserted into the production sitemap.
- The Lab home, Failure Laboratory, specialist routes, and Atlas Motion retain
  canonical custom-domain identity and existing public-interface ownership.
- The Lab home description, Open Graph description, and Twitter description
  now identify the bounded Failure Laboratory journey without claiming live
  incident evidence.
- Request X-Ray now uses the normalized `Request X-Ray // Atlas Systems` title
  for document, Open Graph, and Twitter title metadata.
- No private route, preview-only destination, machine path, or cross-repository
  source link was added to production output.

## Cross-link closure

- The Failure Laboratory route links to every permitted participating
  destination named by its model relationship.
- The eight unique participating public surfaces from #286 retain one
  route-local contextual return handoff to the Failure Laboratory. The two
  model entries that share `/systems/evidence/` remain one public surface.
- Atlas Motion has no Failure Laboratory handoff and no scenario integration.
- Stage navigation, scenario query state, stage hashes, browser history, and
  forward/back behavior remain owned by the existing Failure Laboratory route
  contract. The closure pass does not alter that route behavior.
- Static and no-JavaScript validation keeps the six-stage sequence and
  participating destinations reachable.
- Existing route-local controls remain same-tab, keyboard reachable, and free
  from navigation loops or unsupported automatic state selection.

## Validation evidence

Local source validation at head `a5c1213`:

- Focused Phase 3 and related route suite: 74 passing.
- Main-site suite: 571 passing.
- Lab suite: 347 passing.
- System SYMPHONY suite: 571 passing.
- OG suite: 7 passing.
- HTML validation passed for the repository HTML source set.
- Sitemap, Interface Kit bundle, static performance baseline, Pages output,
  filtered Pages publish output, JSON parsing, normalized titles, whitespace,
  and offline repository-link validation passed.
- Governed local browser capture ran in Chromium and Firefox at 320, 375, 768,
  1024, 1440, and reporting width 1920. Lab directory screenshots were
  inspected at 375 and 1440 in both browsers. The changed Lab route reported
  no card-layout overlap, CTA overflow, serious or critical axe finding, or
  route failure. No-JavaScript and reduced-motion checks were included.
- The local capture retained separate known repository evidence gaps: local
  uncompressed browser-budget overages, the noindex console's unavailable
  local DORA endpoint, and third-party YouTube iframe findings. These are not
  attributed to the changed Lab directory route.

The exact-head hosted preview workflow and its retained screenshots remain the
authoritative non-production browser evidence for PR #293. This record does
not substitute a local capture for that hosted check or for production
verification after merge.

## State boundaries and residual work

| State | Evidence for this closure pass |
| --- | --- |
| Source | Complete at `a5c1213`; local source and repository-native validation passed. |
| Pull request | Draft PR #293 exists and carries `interface-preview-approved`. |
| Merge | Not performed. The owner merge gate remains open. |
| Deployment | No production deployment or rerun was performed by this task. |
| Live | Current production was independently inspected before source work. The preclosure Lab directory did not yet contain this entry, so live closure remains pending merge and deployment. |

Remaining deliberate gaps are the no-single-authority Recovery surface, the
existing noindex policy for specialist instruments, the existing repository
wide browser evidence findings listed above, and the owner-controlled merge,
deployment, and post-deployment live verification gates. Atlas Motion remains
on its separate completion stream.
