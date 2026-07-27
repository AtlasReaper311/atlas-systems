# System Symphony Pass D2A Theme Grammar Audition

## Purpose

Pass D2 turns the approved D1 song plan into a recognisable musical identity.

The first D2 delivery is intentionally an isolated audible audition. It defines the shared theme genome and lets the four state transformations be reviewed before the existing System Symphony arranger and sequencer consume it.

This prevents an unapproved central melody from being threaded through the full soundtrack.

## Base

D2A starts from the merged D1B commit:

```text
6e52f58fbb092b6c74144e0d66b16595bfbdc24d
```

D1B remains the authority for:

- cycle role;
- phrase role;
- requested transformation;
- cadence intent;
- evidence-backed recovery;
- bounded thematic memory.

D2A interprets those fields as scale-relative motif events. It does not choose evidence or cadence authority.

## Shared genome

The theme is identified as `ATLAS_THEME` and uses this scale-relative degree sequence:

```text
0, 2, 4, 1, 5, 4, 2, 0
```

Its primary rhythm occupies two bars at 100 BPM:

```text
0, 3, 7, 10, 16, 19, 23, 28
```

The stable musical landmarks are:

1. the opening home anchor;
2. the rise and skip into the first half;
3. the higher anchor at the start of bar two;
4. the partial fall;
5. the final return home.

Initial statement and reprise roles protect this identity from an unsuitable requested transform. Later development and contrast roles can rotate, compress, displace, expand or fragment the middle material while retaining at least one source anchor.

## State transformations

### Explorer

Explorer presents the complete motif with the widest range and the clearest return home. It is the reference version and should be the easiest to remember.

### Grid Pressure

Grid Pressure preserves all eight source events but compresses intervals, shifts alternating attacks, shortens gates, repeats one diagnostic cell and withholds the final home note. Delayed answers reinforce the strained interpretation.

### Boss Protocol

Boss Protocol reduces the genome to short root-and-fifth cells. It uses stronger rests, upper-register answer notes and compact rhythmic attacks. No additional bass layer is part of this audition. The sense of weight must survive on rhythm and articulation alone.

### Lost Signal

Lost Signal retains four source landmarks, lengthens the gates and adds two delayed echoes. It withholds the final home note so the phrase remains distant and incomplete without becoming empty or unrelated.

### Recovery

The recovery profile first records an unhealthy state in D1 memory and then supplies an explicit evidence-backed recovery movement. D1 emits a recovery reprise and D2 restores the complete Explorer motif with a home ending.

## Audition route

```text
/lab/system-symphony-apu-theme-audition/
```

The route:

- fetches no live estate evidence;
- uses no audio samples;
- uses the existing browser Tone.js dependency;
- plays only the primary motif and its delayed answer or echo;
- exposes state, phrase role, cycle role, requested transform, played transform, cadence and retained anchors;
- can loop one two-bar phrase or play it once;
- does not import or modify the current System Symphony engine.

## Listener review

Review the motif in this order:

1. Learn Explorer Statement until the opening, high anchor and ending are recognisable.
2. Switch to Grid Pressure and check that the same landmarks remain audible under rhythmic strain.
3. Switch to Boss Protocol and check that the compressed cells still feel derived from Explorer.
4. Switch to Lost Signal and check that the sparse landmarks remain attributable to the theme.
5. Select Recovery and check that the complete Explorer identity returns and resolves.

Approval should answer two questions:

1. Is the Explorer statement memorable enough to become the flagship theme?
2. Do the other three states sound like transformations of that theme rather than unrelated melodies?

## Validation boundary

D2A pure-data tests prove:

- deterministic and deeply frozen output;
- one shared theme identity across all states;
- source-anchor preservation;
- non-empty primary motifs;
- state-specific ending behaviour;
- bounded 32-step positions;
- bounded MIDI registers;
- scale-relative note conversion;
- recovery reprise restoration;
- cycle development without theme replacement;
- no runtime randomness, wall-clock decisions, Tone.js ownership or sample-player references in the grammar module.

Browser validation must additionally prove that the audition route loads, unlocks audio after user action, loops without browser errors and remains independent from the existing System Symphony routes.

## Next gate

D2A is complete after listener approval of the motif and state transformations.

D2B will then connect the approved grammar to:

- the merged D1 song planner in the engine;
- `apu-arranger.js` motif data;
- `apu-track-sequencer.js` primary and secondary pulse events;
- deterministic score traces.

D2B must preserve the 100 BPM transport, D1A arpeggios, harmony, bass, drums, replay order, evidence authority and sample-free browser identity.
