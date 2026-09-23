# System SYMPHONY Phase 5: recorded replay slice

This slice adds one atlas-systems-owned public presentation for Blackbox
incident `inc-20260705-234935` under the schema
`atlas-system-symphony/recorded-replay/v1`.

The JSON is a sanitized, deterministic record of four approved public events.
It is not a Blackbox export and the browser does not request Blackbox data.
Blackbox remains the authoritative incident recorder/source. The public push is
adjacent context only, causality is not established, and the later validation
and publication event is follow-up success observed rather than verified live
recovery. Root cause, visitor impact, live health, duration, and metrics remain
`unknown-not-observed`.

The replay route is an additive surface inside the existing System SYMPHONY
replay architecture. It is labelled `RECORDED REPLAY / HISTORICAL / NOT LIVE`,
preserves the existing synthetic fixture, and maps each normalized event to an
APU interpretation without creating synthetic telemetry. Presentation timing
is fixed and separate from the source timestamps. Audio is opt-in and is an
interpretation only; muted text remains the complete event explanation.

Evidence Console receives one bounded supporting record inside its existing
supporting-records disclosure. No top-level Evidence Console view, Blackbox
source change, Infra change, provider mutation, deployment, or live claim is
introduced.
