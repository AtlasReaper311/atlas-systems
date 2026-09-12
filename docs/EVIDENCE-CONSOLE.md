# Evidence Console

`/systems/evidence/` is the public Atlas Systems evidence surface. It answers
what a named claim currently proves, what it does not prove, and which later
facts remain unknown.

This document describes the implemented Console. It does not rewrite accepted
lifecycle authority. ADR-0013 and ADR-0014 remain in
[`atlas-infra`](https://github.com/AtlasReaper311/atlas-infra):

- [ADR-0013 estate-wide evidence lifecycle](https://github.com/AtlasReaper311/atlas-infra/blob/main/docs/adrs/ADR-0013-estate-wide-evidence-lifecycle.md)
- [ADR-0014 evidence lifecycle profiles](https://github.com/AtlasReaper311/atlas-infra/blob/main/docs/adrs/ADR-0014-evidence-lifecycle-profiles.md)

## What the Console is for

The Console is a profile-aware reading of approved public-safe evidence.

It is not:

- a fleet-health dashboard;
- a completion score;
- a live-production identity;
- a substitute for Proof Chain;
- an estate-wide delivery matrix.

Missing later evidence remains `UNKNOWN / NOT OBSERVED`. `NOT APPLICABLE` is
used only where the selected ADR-0014 profile cannot have that stage.

## Change / Service / Estate

| View | Question | Subject source |
|---|---|---|
| Change | What happened to one named change or publication? | Recorded public-safe specimens: `atlas-systems#256` and W-08 |
| Service | What evidence exists for one running Worker? | Live public contracts for `atlas-api-public` |
| Estate | Where is evidence complete or missing across public subjects? | Live `GET /v1/topology` plus one recorded Library / Toolkit specimen |

Navigation stays `CHANGE | SERVICE | ESTATE`. There is no publishing tab, library
tab, or fifth top-level view.

Evidence Detail inspects one selected claim. Opening a record does not create
stronger truth. Technical provenance remains a disclosure, not a second
lifecycle.

## ADR-0013 lifecycle authority

The estate-wide delivery order is:

`SOURCE` → `CHECKED` → `MERGED` → `DEPLOYMENT OBSERVED` → `DEPLOYED` →
`RUNTIME VERIFIED` → `LIVE VERIFIED`

Observation results are:

- `OBSERVED`
- `FAILED`
- `UNKNOWN / NOT OBSERVED`
- `NOT APPLICABLE`

Later stages are never inferred from earlier ones. Classification lifecycle is
not a delivery stage.

## ADR-0014 profile applicability

The Console uses ADR-0014 profiles as applicability rules, not as a second
lifecycle. Domain labels are explanatory mappings onto ADR-0013.

| Profile | Applicable path | NOT APPLICABLE |
|---|---|---|
| Static / Public Site | SOURCE → CHECKED → MERGED → DEPLOYMENT OBSERVED → DEPLOYED → LIVE VERIFIED | RUNTIME VERIFIED |
| Runtime Worker | All seven ADR-0013 stages | none |
| Library / Toolkit | SOURCE → CHECKED → MERGED; release stages only with a real release contract | RUNTIME VERIFIED and LIVE VERIFIED always; DEPLOYMENT OBSERVED and DEPLOYED without a release contract |
| Article Publication | SOURCE → CHECKED → MERGED → DEPLOYMENT OBSERVED → DEPLOYED → LIVE VERIFIED | RUNTIME VERIFIED |
| Documentation / Policy | SOURCE → CHECKED → MERGED, plus optional public projection | RUNTIME VERIFIED; LIVE VERIFIED unless a public consumer copy must be verified independently |

Documentation / Policy can appear in Estate when public topology classifies a
subject that way. It is not a fifth Phase 2.3 archetype.

## Phase 2.3 archetypes

### Static / Public Site

Inspected as a topology subject in Estate when `kind` is `site`, and as the
recorded Change View specimen `atlas-systems#256`. A static Pages surface has no
Worker runtime probe.

### Runtime Worker

Inspected as a topology subject in Estate when `kind` is `worker`, and as the
live Service View for `atlas-api-public`. Runtime or live evidence never fills a
missing deployment identity.

### Library / Toolkit

Inspected as a topology subject in Estate. `atlas-interface-kit` carries a
recorded release specimen: `RELEASED event` maps to `DEPLOYMENT OBSERVED` and
`RELEASED identity` maps to `DEPLOYED`. A GitHub Release is not a running
deployment. Generic toolkits without a release contract keep those two stages
`NOT APPLICABLE`.

### Article Publication

Inspected as the recorded Change View specimen for W-08
`specular-core-architectural-recovery`.

Current public topology and classification contracts do not model published
writing as a repository-level estate component. The Console does not invent an
estate-wide publication projection. The smallest truthful path remains Change
View.

Domain labels map onto ADR-0013:

- `AUTHORED` → `SOURCE`
- `VALIDATED` → `CHECKED`
- `SCHEDULED` → `MERGED` of the scheduler-queue identity
- `SCHEDULER EXECUTED` → `DEPLOYMENT OBSERVED`
- published writing identity → `DEPLOYED`

Generation is not publication. Queue sync is not publication. Scheduler
execution is not live verification. `RUNTIME VERIFIED` is `NOT APPLICABLE` for
static published writing.

Private `atlas-article-gen` and `atlas-scheduler` identities remain
`UNKNOWN / NOT OBSERVED` unless an approved public-safe projection establishes
them.

## Public-safe projection boundaries

Public Evidence Detail source links may only point at:

- `https://github.com/AtlasReaper311/*`
- `https://atlas-systems.uk`
- `https://api.atlas-systems.uk`

The Console must not expose private drafts, unpublished article content,
scheduler tokens, private queue records, or private provider identifiers.

## Why missing evidence remains unknown

Absence of a later record is not failure and is not success. `FAILED` is
reserved for an attempted source or check that did not return usable evidence.
Topology membership, classification lifecycle, roster size, and `/v1/stats`
probes are not delivery proof.

## Why topology and classification are not delivery

Estate View reads `atlas-public-topology/v3` from
`https://api.atlas-systems.uk/v1/topology`. Atlas Infra remains classification
authority. A classified subject can be `OBSERVED` as a roster row while every
applicable ADR-0013 stage stays `UNKNOWN / NOT OBSERVED`.

There is no published estate-wide delivery snapshot on this path. The Console
does not invent one.

## Model Promotion

Model Promotion remains Phase 4 Observatory work. It is not a Phase 2.3
archetype and is not implemented in this Console.
