# System Symphony Pass D2B Theme Integration

## Purpose

Pass D2B connects the listener-approved `ATLAS_THEME` grammar to the existing System Symphony soundtrack.

D2A proved that Explorer, Grid Pressure, Boss Protocol and Lost Signal can be heard as transformations of one musical idea. D2B makes that relationship part of normal phrase playback without introducing a second transport, a parallel motif player or a replacement audio graph.

## Base

D2B starts from the merged D2A commit:

```text
41ebc555c457a9c50fa8b01c8b4cbf8630e2fa67
```

The branch is:

```text
feat/system-symphony-pass-d2b-theme-integration
```

## Integration boundary

The current engine remains the phrase clock and Web Audio owner.

D2B uses thin adapters around the existing arranger, sequencer and score-trace modules:

1. `apu-arranger-legacy.js` preserves the approved pre-D2B arranger byte-for-byte.
2. `apu-arranger.js` delegates form, harmony, mix, timbre, bass, drums and counterpoint to that arranger, then attaches one D1 song plan and one D2 motif plan.
3. `apu-track-sequencer-legacy.js` preserves all existing bass, pad, percussion, service, transition and fallback pulse behaviour.
4. `apu-track-sequencer.js` replaces only the primary motif events and selected warning or unknown echo events with the approved D2 grammar.
5. `apu-score-trace-legacy.js` preserves the D0 trace implementation.
6. `apu-score-trace.js` enriches traces only when an arrangement carries D2 theme authority.

The existing engine continues importing the same public module paths. No page, transport, replay controller or audio-node graph is replaced.

## Runtime song-plan authority

`apu-theme-runtime.js` owns the bounded D1 planner used by live arrangements.

It:

- advances when the phrase, state or evidence decision changes;
- returns the same frozen result for repeated calls with the same decision key;
- resets when the phrase index rewinds, which covers a new track lifecycle or deterministic test replay;
- converts frame evidence into the D1 evidence contract without retaining arbitrary frame fields;
- preserves explicit unresolved, interrupted and no-cadence states;
- permits recovery only when the supplied movement is evidence-backed.

The runtime does not schedule audio and does not inspect wall-clock time.

## Live motif orchestration

The primary pulse channel consumes scale-relative events from `themeMotif.events`.

The sequencer keeps the active state scale and current two-bar harmony. It applies octave folding to avoid abrupt jumps while preserving scale membership.

Structural sections remain deliberately sparse:

- Intro and Breathe expose two theme landmarks.
- Release exposes three landmarks.
- Lost Signal exposes at most two foreground notes per phrase.
- Establish, Theme A, Variation, Theme B, Build, Peak and Recovery can expose the complete state treatment.

Secondary behaviour is conservative:

- Explorer keeps the approved D1A counterpoint.
- Boss Protocol keeps the approved critical alarm channel.
- Grid Pressure and Lost Signal can use D2 delayed echo events.
- Every non-theme channel delegates to the pre-D2B sequencer.

## Trace contract

When D2 theme authority is present, score traces record:

- shared theme ID;
- cycle and phrase roles;
- requested and played transformations;
- cadence intent;
- target harmonic region;
- transition role;
- memory revision;
- retained anchors;
- primary and echo event positions;
- D1 deterministic signature;
- D2 runtime, arranger and trace build IDs.

Legacy trace inputs without a D2 arrangement remain unchanged.

## Preserved contracts

D2B does not change:

- the 100 BPM transport;
- D1A arpeggios;
- form length or section order;
- harmony generation;
- bass patterns;
- drum patterns;
- service voices;
- transition signatures;
- replay order;
- evidence source authority;
- sample-free browser synthesis;
- mastering and limiter ceilings;
- production deployment state.

## Validation

Focused validation must cover:

- syntax for every adapter and runtime module;
- unchanged legacy arranger contracts;
- active-scale membership and bounded lead movement;
- existing critical alarm and Lost Signal sparsity contracts;
- deterministic, frozen and bounded theme runtime output;
- evidence-honest recovery;
- deterministic D2-enriched score traces;
- complete repository System Symphony, Lab, interface, CodeQL and browser smoke suites.

## Listening gate

The D2B preview should be reviewed as a complete soundtrack rather than a bare motif exercise.

Listen for:

1. Explorer introducing a recurring melodic identity without masking the arpeggio or telemetry detail.
2. Grid Pressure retaining that identity while sounding tighter and less resolved.
3. Boss Protocol preserving the existing action rhythm and alarm language while using compressed theme cells.
4. Lost Signal remaining sparse and incomplete without becoming silent or unrelated.
5. Evidence-backed recovery restoring the Explorer identity clearly.

D2B remains unmergeable by listener approval until the full-track preview demonstrates that the theme is audible but not dominant.
