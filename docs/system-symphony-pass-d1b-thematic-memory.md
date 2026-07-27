# System Symphony Pass D1B: Thematic Memory and Song Plan

## Purpose

D1B implements the original Pass D1 architecture after the listener-led D1A orchestration pass.

It gives System Symphony one bounded, deterministic authority for long-form musical intent without changing the approved D1A playback yet.

## Ownership

`apu-thematic-memory.js` owns frozen, serialisable musical history. It stores summaries rather than full phrases and bounds every history list to eight entries.

`apu-song-plan.js` owns phrase and cycle function. It consumes the bounded frame, current composition plan, and arrangement metadata. It does not own notes, audio nodes, transport, evidence collection, or replay ordering.

`apu-song-plan-trace.js` projects the plan and memory into a version-two trace entry while preserving the D0 evidence fields.

## Cycle roles

The bounded eight-cycle sequence is:

1. statement;
2. development;
3. contrast;
4. reprise;
5. development;
6. contrast;
7. reprise;
8. expanded statement.

The sequence then repeats. D8 may later add richer long-session controls without changing the D1B memory contract.

## Phrase roles

The vocabulary is:

- statement;
- answer;
- restatement;
- sequence;
- development;
- contrast;
- bridge;
- build;
- climax;
- release;
- reprise;
- cadence;
- suspension;
- decay;
- restart.

D1B assigns roles from the existing section and cycle context. D2 onward will make the roles control audible theme grammar.

## Theme model

D1B establishes one shared theme identity: `ATLAS_THEME`.

State is represented as a transformation grammar rather than four unrelated songs:

- Explorer: clear;
- Grid Pressure: strain;
- Boss Protocol: compression;
- Lost Signal: fragmentation.

This preserves the listener-approved D1A state character while giving later passes one thematic source.

## Evidence-safe cadence policy

D1B records cadence intent but does not play it yet.

- Critical produces interrupted endings.
- Warning produces suspended endings.
- Unknown or stale evidence cannot resolve.
- Recovery cadence requires an observed transition from an unhealthy or unknown state into Healthy.
- Healthy may resolve only where the existing section function permits a cadence.

## Validation

Focused tests cover deterministic journeys, explicit cycle development, 5,000-phrase bounded memory, shared-theme preservation, recovery reprises, unknown evidence, reset behaviour, trace freezing, and cadence honesty.

## Review boundary

This PR is mostly pure data and has no intended audible change. It does not yet change motif notes, harmony, arpeggios, bass, rhythm, orchestration, transport, replay, or the Web Audio graph.

D2 should consume this approved plan to implement the shared theme grammar. D3 through D8 should extend the same authority rather than creating parallel long-form planners.
