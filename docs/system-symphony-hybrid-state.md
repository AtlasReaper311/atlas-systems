# System Symphony Evidence Truth and Hybrid State Contract

## Scope

This contract defines how the Atlas APU turns a mixed estate frame into one coherent soundtrack without reducing the estate to a four-button majority vote.

The implementation applies only to the Atlas APU candidate and its isolated preview. The production System Symphony route remains unchanged until a separate cutover is approved.

## Evidence states

Every service voice must expose one explicit evidence state:

| State | Meaning | Counts as current evidence |
| --- | --- | --- |
| `current` | A telemetry record has a known status, evidence source and measurement timestamp. | Yes |
| `reported-unknown` | A telemetry record exists, but its status or current evidence is unknown. | No |
| `topology-only` | The component is present in topology but has no telemetry record. | No |
| `stale` | A previously measured telemetry record is being retained after the source became stale. | Yes, but visibly stale |
| `simulated` | A browser-only audition profile transformed the service for comparison. | No |

Preview versus live is a separate evidence mode. A numbered Cloudflare Pages preview must identify its bounded fixture prominently and must never describe fixture records as current production telemetry.

## Preview fixture integrity

The preview fixture contains the same fixed-order 21 service identities as the sonification frame. Its topology labels, layers, kinds and dependencies follow the current `atlas-api-public/data/estate.manifest.json` presentation contract.

Preview estate totals are derived from the service rows:

- 18 healthy services;
- one warning service;
- zero critical services;
- two reported-unknown services;
- 19 of 21 services with known states;
- aggregate known-service health approximately 0.988;
- known-service ratio approximately 0.905.

Hard-coded fixture summaries must not contradict the service rows.

## State vector

Each frame exposes a normalised vector:

```text
healthy + warning + critical + unknown = 1
```

The weights are derived from service statuses, aggregate health, active incidents and evidence coverage. Severity receives increasing influence, but ordinary mixed estates are not converted into a global warning solely because one service is degraded.

For the bounded preview fixture, Healthy remains dominant while Warning and Unknown retain non-zero weights.

## Dominant grammar

Exactly one dominant state owns properties that cannot be averaged safely:

- scale and harmonic vocabulary;
- chord quality;
- primary bass grammar;
- pulse duty-cycle identity;
- transition semantics;
- visible headline state.

This prevents incompatible scales or arbitrary chromatic mixtures from reopening the earlier out-of-key regression.

## Weighted operational layers

All four vector weights remain musically active through compatible continuous controls:

- pressure and urgency;
- diagnostic density;
- error and incident pressure;
- evidence coverage pressure;
- spectral openness;
- carrier presence;
- texture and service density;
- status-specific service articulation, filtering, detune and velocity.

The individual service voices retain their own statuses. A degraded service therefore remains audibly tense inside a Healthy-dominant score.

## Fail-closed overrides

The state vector does not weaken safety semantics.

Critical overrides the dominant grammar when any of the following is true:

- an active incident exists;
- a service is down;
- aggregate health is below 0.5.

Unknown overrides the dominant grammar when any of the following is true:

- the telemetry frame is stale;
- no service has a known state;
- fewer than half of service records have known states.

These overrides remain visible in the dominant-state explanation.

## Interface contract

The preview must show:

- a fixture or simulation banner when the source is not live;
- four state weights and the dominant state;
- a plain-language reason for dominant-state selection;
- `Director phase` separately from the fixed 32-bar `Section`;
- current evidence count and known-state ratio;
- explicit evidence labels for every service row.

## Validation contract

Pure tests must prove:

- fixture estate totals derive from rows;
- one warning and two unknown services remain Healthy-dominant but contribute non-zero weights;
- down and stale conditions retain their overrides;
- unknown telemetry rows are not labelled measured;
- weights are deterministic and sum to one;
- continuous modulation changes without averaging scales.

Browser tests must prove in Chromium and Firefox:

- the 21-service fixture is labelled as preview data;
- 19 rows are current preview evidence and two are reported unknown;
- no fixture row falls back to an `unknown` topology layer;
- the preview vector is Healthy-dominant with non-zero Warning and Unknown weights;
- all four manual states produce finite loudness evidence;
- the transport and quantised transition policies remain healthy;
- no audio sample assets are requested.

## Release boundary

This work is stacked on the mastering candidate. It does not merge the feature stack, change the production route, write provider state or remove legacy assets.
