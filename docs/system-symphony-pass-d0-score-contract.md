# System Symphony Pass D0 score contract

## Status and boundary

Pass D0 records the merged Pass C musical decisions without changing audio playback.

Base commit:

```text
fe4cde86f82ad40a7e56a5d77221bfc6cb32a4bd
```

Pass D0 does not:

- schedule notes;
- create Web Audio or Tone.js nodes;
- change the 100 BPM transport;
- change estate evidence;
- infer a failure, recovery, deployment or resolution;
- read provider credentials;
- write provider state;
- deploy or prove production rollout.

The implementation is additive because draft PRs #119 and #125 still own alternative TRACE interface directions. D0 introduces a separate diagnostic route rather than modifying either open interface branch or the active hybrid playback surface.

## Ownership

`composition-director.js` continues to own phrase-level state intent, motif variants and composition phases.

`apu-performance-director-v4.js` continues to own intro, groove, pressure, rupture, recovery and afterglow intent.

`apu-arranger.js` continues to own the 16-phrase, 32-bar form, section identity, harmony, motif mode, bass role, rhythm role, transition label, mix and timbre.

`apu-performance-conductor.js` continues to convert performance intent into deterministic omission, supplemental rhythm and ornaments.

`apu-replay-song.js` continues to own evidence-ordered replay movements. D0 records those movements and does not add recovery or resolution.

`apu-score-trace.js` owns only observation, canonical serialization, deterministic signatures and bounded trace history.

`apu-score-trace-baselines.js` owns deterministic fixture journeys used to reconstruct the Pass C baseline.

## Trace schema

Every phrase receives one frozen trace entry with:

- schema and build identifiers;
- phrase, cycle and bar positions;
- estate state and canonical scene title;
- section and section role;
- composition and performance phases;
- current harmony;
- explicit `null` values for harmonic region and cadence intent because Pass C does not author those concepts yet;
- motif identity, source, transformation, degrees and pattern;
- deterministic ornament instructions available from the performance conductor;
- bass and rhythm roles;
- foreground and response voices derived from actual arrangement mix values;
- service density;
- transition intent and observed state boundary;
- bounded evidence provenance;
- bounded event context;
- a deterministic FNV-1a signature over the canonical entry.

Arbitrary frame properties are not copied. Credentials and unrelated provider payloads cannot enter the trace through the supported schema.

## Baseline journeys

Single-state journeys cover 64 bars and two complete 32-bar cycles:

- Explorer;
- Grid Pressure;
- Boss Protocol;
- Lost Signal.

State journeys cover:

- Explorer to Grid Pressure;
- Grid Pressure to Boss Protocol;
- Boss Protocol to Grid Pressure;
- Boss Protocol to Explorer recovery;
- active evidence to Lost Signal;
- Lost Signal to Explorer.

Event and replay journeys cover:

- deployment evidence during Explorer;
- incident evidence during Grid Pressure;
- incomplete replay evidence ending in Critical;
- replay evidence with confirmed recovery.

The incomplete replay test rejects any recorded `recovery` or `resolved` movement. The confirmed recovery test requires the recorded recovery movement to carry `fromEvidence: true`.

## Determinism

The canonical serializer sorts object keys recursively and normalises non-finite numbers. The same journey produces byte-equivalent serialized trace output and the same journey digest.

No D0 source uses:

- `Math.random`;
- `Date.now`;
- browser timing as a musical input;
- Web Audio;
- Tone.js;
- external model calls.

Trace history is bounded. The default recorder retains at most 256 phrases and accepts a tested custom limit.

## Diagnostics route

The additive route is:

```text
/lab/system-symphony-apu-trace/
```

It reconstructs each baseline in the browser and exposes:

- journey phrase and bar counts;
- journey digest;
- source commit;
- per-phrase state, section, phases, motif, harmony, bass, rhythm, transition and signature;
- the complete frozen trace entry;
- JSON export for review evidence.

The route schedules no audio and fetches no live evidence. It exists to explain the merged Pass C decisions before Pass D1 introduces thematic memory.

## Validation

Focused validation:

```bash
node --check static/js/sonify/apu-score-trace.js
node --check static/js/sonify/apu-score-trace-baselines.js
node --check lab/system-symphony-apu-trace/system-symphony-apu-trace.js
node --test static/js/sonify/apu-score-trace.test.js
node --test static/js/sonify/apu-score-trace-baselines.test.js
```

Repository validation must also include the complete System Symphony suite, main-site checks, HTML validation, output validation and `git diff --check`.

## D1 handoff

D1 may consume the trace schema but must not make the tracer a musical authority. The future song plan and thematic memory should produce decisions first, then D0 should record them.

The first D1 review should compare its generated traces against this baseline and explain every intended structural difference.
