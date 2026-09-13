# Failure Laboratory shared model

`data/failure-laboratory-model.json` is the repository-owned static contract
for the Failure Laboratory. It gives `/lab/failure-laboratory/` a stable
journey sequence, scenario vocabulary, instrument identities, safe
destinations, evidence modes, and proof boundaries without creating a runtime
or changing any existing instrument.

## What this file means

The seven scenario identifiers are explanatory navigation concepts:

`normal-operation`, `latency-creep`, `cache-collapse`, `dependency-failure`,
`network-partition`, `cascading-failure`, and `recovery`.

Every scenario contains one explicit relationship for every participating
instrument. A relationship is `direct`, `contextual`, `cross-cutting`, or
`unsupported`. Unsupported rows are intentional: missing support is recorded
instead of being inferred from an omitted row.

Supported rows carry one or more readings. Each reading keeps its accepted
evidence mode beside its native product wording, demonstration, and non-claim.
The validator rejects incompatible combinations such as synthetic data marked
as measured or recorded replay marked as current measured state.

The six linear stages are:

`REQUEST -> DEPENDENCIES -> COORDINATION -> IMPACT -> INCIDENT EVIDENCE -> RECOVERY`

Spectral Forge and System SYMPHONY are cross-cutting interpretation layers,
not mandatory stages. Atlas Twin context is available only through the public
Evidence Console destination and preserves the exact `could be affected`
boundary. Atlas Motion is deliberately absent from the model because its
completion stream is separate.

Recovery records the current gap: there is no single authoritative Phase 3
Recovery Evidence instrument. Synthetic recovery-like transitions, named
recorded aftermath, measured/stale source readings, unavailable evidence, and
unknown evidence must keep their own boundaries.

## Ownership and use

This JSON is source-owned by `atlas-systems`; it is not generated output and it
does not fetch live state. Its route authority was `reserved-not-implemented`
for #284 and is now `implemented` because the Phase 3.2 route exists on the
same exact source tree. `js/failure-laboratory-model.mjs` provides the
Node-native loader, deterministic serializer, and offline validation used by
the focused tests in `js/tests/failure-laboratory-model.test.mjs`.

The future #285 renderer may read the JSON locally, including for a no-JS
representation. It must not use this model to select native faults, mutate
instrument state, autoplay audio, or turn a scenario label into incident,
health, deployment, runtime, or live evidence.
