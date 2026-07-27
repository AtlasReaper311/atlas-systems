# System Symphony Pass D3 Harmonic Journey

## Listener authority

Pass D2 was approved because it preserved the PR #133-era melody and continuity while allowing only bounded accompaniment development.

Pass D3 must keep that result intact. Harmonic development is not allowed to become a second melody authority or to retune the established primary line.

The remaining listener note entering D3 is that Boss Protocol bass can still feel slightly powerful. D3 may apply a small velocity trim to existing Boss bass events, but it must not change their pitch, rhythm, gate, event count or structural role.

## Objective

D3 gives the soundtrack explicit harmonic destinations, nearest-motion support voicings and evidence-aware cadence intent.

The first safe D3 integration affects supporting harmony only:

- pad voicings may follow the harmonic journey;
- the existing primary melody harmony remains unchanged;
- the existing counterline, services, ornaments and transition quantisation remain unchanged;
- no new pad event is created where the approved baseline is silent;
- Boss bass keeps the approved notes and rhythm with a small level trim.

## Harmonic regions

The bounded region vocabulary is:

- `home`;
- `relative`;
- `subdominant`;
- `dominant-pressure`;
- `suspended`;
- `pedal`;
- `recovery`;
- `unknown-drift`.

Each section receives one explicit function and region. Later cycles may use deterministic region alternatives at structural boundaries, but they may not wander through arbitrary per-phrase progressions.

## Section functions

| Section | Function | Default region |
|---|---|---|
| Intro | tonic ambiguity | suspended |
| Establish | confirm home | home |
| Theme A | stable statement | home |
| Variation | depart home | subdominant |
| Theme B | contrast | relative |
| Build | increase pressure | dominant-pressure |
| Peak | maximum pressure | pedal |
| Release | reduce force | suspended |
| Recovery | controlled return | recovery |
| Breathe | cadence or restart | home or suspended |

## Cadence authority

Cadence intent is constrained by evidence:

- Explorer may resolve only when the D1 evidence authority permits resolution;
- Grid Pressure remains open or suspended;
- Boss Protocol is interrupted while critical evidence persists;
- Lost Signal emits no strong cadence;
- recovery is permitted only when the D1 plan records evidence-backed recovery;
- a healthy breathe section without resolution authority restarts rather than claiming closure.

D3 does not create incidents, recovery, deployment or service evidence.

## Voice leading

Support voicings are chosen through a deterministic pure-data function.

The function:

- stays inside bounded MIDI registers;
- rejects duplicated notes;
- limits total voicing spread;
- rewards retained common tones;
- penalises large motion;
- uses outer tones for Lost Signal;
- returns frozen serialisable data.

The approved melody does not call this function.

## Integration boundary

The current D2 arranger and sequencer are preserved as exact baseline modules.

The public arranger adapter adds:

- `supportHarmony`;
- `supportVoicings`;
- `harmonicRegion`;
- `cadenceIntent`;
- `harmonicJourney`;
- the D3 build identifier.

It explicitly retains the D2 values for:

- `harmony`;
- `motifMode`;
- `motifDegrees`;
- primary mix;
- primary timbre.

The public sequencer delegates all existing channels to the baseline. It changes only:

- existing pad-event MIDI voicings, preserving event timing, duration and velocity;
- existing Boss bass velocity by a factor of `0.94`, preserving pitch, duration and event presence.

## Trace evidence

D3 enriches score traces with:

- harmonic region;
- harmonic destination;
- cadence intent;
- resolution permission;
- support-harmony chords;
- support voicings;
- harmonic journey and voice-leading decision sources.

Traces without a D3 arrangement remain byte-compatible with the D0 trace contract.

## Automated proof

Tests must prove across all states, two complete cycles and every sequencer step that:

- primary melody events are deep-equal to D2;
- primary harmony remains deep-equal to D2;
- motif mode and degrees remain unchanged;
- support voicings are deterministic, bounded and duplicate-free;
- pad timing, duration and velocity remain unchanged;
- no pad event is introduced where D2 returned none;
- Boss bass pitch, duration and event presence remain unchanged;
- the Boss velocity trim stays small and bounded;
- critical and unknown states cannot resolve;
- recovery cadence requires evidence authority;
- trace output remains deterministic and frozen.

## Listener gate

Review the numbered full-track preview as a normal soundtrack.

Listen for:

1. the same melody and continuity approved in D2;
2. clearer harmonic purpose between sections;
3. transitions that feel less pasted together;
4. Lost Signal remaining unresolved but alive;
5. Boss Protocol retaining weight with slightly cleaner low end;
6. no new gaps, jumpiness or melodic substitution.

This PR must remain draft until listener approval. A merge does not prove or perform production deployment.
