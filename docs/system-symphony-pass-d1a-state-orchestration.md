# System Symphony Pass D1A: State Orchestration Audition

## Scope

D1A is a listener-led audible refinement stacked after the D0 score-trace baseline. It is not a replacement for the canonical D1 thematic-memory and song-plan work.

The pass addresses four direct listening observations:

- arpeggios should be a recurring identity in every state;
- Explorer should retain the fastest and widest arpeggio language;
- Boss Protocol should behave like a song rather than a marching low-bass loop;
- Lost Signal should contain slow melodic activity and echoes instead of relying on pads.

The locked 100 BPM transport, sample-free browser APU, state evidence contracts, absolute scheduling path, replay semantics, and existing authored ornaments remain unchanged.

## State treatments

### Explorer

Explorer receives six-note, bright, wide arpeggio figures. The figures alternate between connectors, lifts, answers, and reprises. A small secondary sparkle answer keeps the movement conversational rather than turning the arp into an uninterrupted lead.

### Grid Pressure

Grid Pressure receives displaced five-note climbing cells. They stop away from the home offset, use narrower contours, and add two short diagnostic responses. The state remains recognisably related to Explorer while sounding compressed and operationally strained.

### Boss Protocol

Boss Protocol receives short upper-register root-and-fifth arp cells and syncopated two-voice power chords. The power chords land away from the existing marching accents so rhythmic weight moves into the midrange.

The mix policy reduces both low-frequency paths:

- the explicit bass bus;
- the pad bus that carries the existing `padSub` reinforcement.

Primary and secondary weight rise slightly so Boss Protocol remains forceful through rhythm, articulation, harmony, and register contrast rather than permanent sub energy.

### Lost Signal

Lost Signal receives four slow notes spaced evenly across each two-bar phrase and two delayed secondary echoes. Primary and secondary buses now sit above the pad bus, while bass remains restrained. The result should feel active but suspended, with a pulse of information rather than an empty ambient bed.

## Ownership

`apu-state-orchestration-d1a.js` owns only deterministic phrase instructions. It does not own state selection, evidence, harmony, transport, audio nodes, or replay.

`apu-performance-conductor.js` combines those instructions with the existing three-note connective arp and 4, 8, and 16-bar ornaments.

`apu-mix-director.js` owns the listener-led bus rebalance, including the previously hidden Boss Protocol pad-sub path.

## Validation

Focused tests prove:

- every state receives deterministic, frozen, bounded arp instructions;
- all four state arp signatures differ;
- Explorer is faster and wider than Lost Signal;
- Grid Pressure climbs without resolving directly home;
- Boss Protocol power chords stay in the upper register and use syncopated offsets;
- Lost Signal remains slow while gaining audible melodic and echo activity;
- the original connective arp remains available;
- Boss bass and pad-sub gain are materially below Explorer;
- Lost Signal is no longer pad-dominant in the state mix.

## Review boundary

D1A should be judged by listening in the numbered preview. It intentionally does not add thematic memory, phrase roles, cycle roles, harmonic destinations, or evidence-aware cadence authority. Those remain subsequent Pass D work.
