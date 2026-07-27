# System Symphony Pass D2A Theme Grammar Audition

## Purpose

Pass D2 turns the approved D1 song plan into a recognisable musical identity.

The first D2 delivery is intentionally an isolated audible audition. It defines the shared theme genome and lets the state transformations be reviewed before the existing System Symphony arranger and sequencer consume it.

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

Its production-intent rhythm occupies two bars at 100 BPM:

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

Grid Pressure preserves all eight source events but compresses intervals, shifts alternating attacks, shortens gates, repeats one diagnostic cell and withholds the final home note. The grammar also defines delayed answers for later full-track integration.

### Boss Protocol

Boss Protocol reduces the genome to short root-and-fifth cells. It uses stronger rests, upper-register answer notes and compact rhythmic attacks. No additional bass layer is part of this audition. The sense of weight must survive on rhythm and articulation alone.

### Lost Signal

Lost Signal retains four source landmarks, lengthens the gates and defines two delayed echoes. It withholds the final home note so the phrase remains distant and incomplete without becoming empty or unrelated.

### Recovery

The grammar can restore the complete Explorer motif when D1 supplies an evidence-backed recovery reprise. Recovery remains covered by pure-data tests but is not part of the simplified first-listen control surface.

## Why the audition was simplified

The first review surface was technically faithful but perceptually overloaded. It played exact 100 BPM state rhythms, exposed multiple phrase-role transforms, allowed looping and included a second echo voice. Listener feedback correctly identified that the theme was difficult to isolate and the result felt scrambled.

The revised audition therefore separates **theme recognition** from **production arrangement**.

The default review path now uses:

- one monophonic triangle voice;
- equal spacing between notes;
- a slower 72 BPM listening tempo;
- no echoes;
- no looping;
- no phrase-role selector;
- Explorer as an invariant first reference;
- a clear pause before the selected state transformation.

This does not change the D2 grammar or the intended 100 BPM System Symphony transport. It changes only the human-review method.

## Audition route

```text
/lab/system-symphony-apu-theme-audition/
```

The route:

- fetches no live estate evidence;
- uses no audio samples;
- uses the existing browser Tone.js dependency;
- plays one clean voice with no overlapping echoes;
- offers Explorer-only, selected-state-only and direct A/B comparison controls;
- displays the selected state note sequence and source indices;
- does not import or modify the current System Symphony engine.

## Listener review

Use the controls in this order:

1. Play Explorer only until its overall rise and return are familiar.
2. Select Grid Pressure, Boss Protocol or Lost Signal.
3. Use the comparison button. Explorer plays first, followed by a clear pause and the selected transformation.
4. Ask only whether the second phrase sounds descended from the first.

Approval should answer two questions:

1. Is the Explorer statement memorable enough to become the flagship theme?
2. Do the other three states sound like transformations of that theme rather than unrelated melodies?

If the direct comparison remains confusing, D2 must revise the theme or transformation rather than asking the listener to decode more detail.

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

Browser validation must additionally prove that the clear-listening route loads, unlocks audio after user action and remains independent from the existing System Symphony routes.

## Next gate

D2A is complete after listener approval of the motif and state transformations.

D2B will then connect the approved grammar to:

- the merged D1 song planner in the engine;
- `apu-arranger.js` motif data;
- `apu-track-sequencer.js` primary and secondary pulse events;
- deterministic score traces.

D2B must preserve the 100 BPM transport, D1A arpeggios, harmony, bass, drums, replay order, evidence authority and sample-free browser identity.
