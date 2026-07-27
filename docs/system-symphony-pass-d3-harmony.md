# System Symphony Pass D3 Harmonic Journey

## Listener authority

Pass D2 was approved because it preserved the PR #133-era melody and continuity while allowing only bounded accompaniment development.

Pass D3 keeps that result intact. Harmonic development may support the established melodies but may not replace them or become a second melody authority.

The final listener-approved reference is Explorer on PR #144:

- an exact fast descending lead shimmer before Theme A Variation;
- a clear cutout before Peak;
- a complete uninterrupted Peak melody;
- a warmer Peak register;
- a controlled loudness journey.

That framework now becomes the common structural language for all four states without making their notes, pacing or character identical.

## Harmonic journey

The bounded region vocabulary is:

- `home`;
- `relative`;
- `subdominant`;
- `dominant-pressure`;
- `suspended`;
- `pedal`;
- `recovery`;
- `unknown-drift`.

Each section receives one explicit function and region. Later cycles may use deterministic alternatives at structural boundaries, but they may not wander through arbitrary per-phrase progressions.

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

## Evidence-aware cadence

Cadence intent remains constrained by evidence:

- Explorer resolves only when D1 permits resolution;
- Grid Pressure remains open or suspended;
- Boss Protocol is interrupted while critical evidence persists;
- Lost Signal emits no unsupported strong cadence;
- recovery requires evidence-backed recovery authority;
- unsupported healthy closure restarts rather than claiming resolution.

D3 does not create incidents, recovery, deployments or service evidence.

## Voice leading

Support voicings are chosen through a deterministic pure-data function that:

- remains inside bounded MIDI registers;
- rejects duplicated notes;
- limits total spread;
- rewards retained common tones;
- penalises large movement;
- uses outer tones for Lost Signal;
- returns frozen serialisable data.

The established primary melody does not call this function. Explorer support harmony additionally follows the primary harmony root, quality and inversion, with voicings bounded to MIDI 45–67.

## Global dynamics

The opening-to-middle loudness jump affected all four states. The corrected envelope:

- raises Intro and Afterglow floors;
- retains the approved Groove level;
- trims Pressure and Rupture ceilings;
- narrows density-driven velocity ranges;
- leaves state EQ, stereo width, ducking, wobble and transient shaping intact.

## Three signature moments

Every 16-phrase cycle now contains exactly three guaranteed authored signature-gesture moments:

1. phrase 4, the end of Theme A: a descending hand-off into Variation;
2. phrase 10, the end of Build: a restrained ascending launch followed by silence;
3. phrase 14, Recovery: a softer descending callback.

A selected legacy `shimmer` is suppressed at those three phrases so two lead arcs never stack. Legacy authored shimmer ornaments remain available elsewhere, preserving the existing ornament vocabulary and allowing occasional extra echoes of the signature language.

### Explorer

Explorer keeps the exact PR #128 descending shimmer at phrase 4:

- steps `28, 29, 30`;
- offsets `24, 19, 12`;
- velocities `0.28, 0.24, 0.22`;
- `32n` duration.

Its pre-Peak launch is a nimble four-note rise. Its Recovery callback is a warmer mid-register descent.

### Grid Pressure

Grid Pressure uses tighter diagnostic cells with a maximum offset of 15 semitones. Its gestures remain quicker and more compressed than Explorer, avoid a bright two-octave apex, and land with unresolved operational tension.

### Boss Protocol

Boss Protocol uses fewer, heavier root-and-fifth-shaped gestures with a maximum offset of 19 semitones. Its landing notes carry more weight than its inner notes while remaining above the bass role.

### Lost Signal

Lost Signal uses lower, slower, fragmented descendants of the same gesture family with a maximum offset of 12 semitones. The pattern is recognisable but interrupted, delayed and distant.

## State-specific pre-Peak cutouts

Phrase 10 ends with a real performance silence. Both ordinary events and ornaments are omitted inside the cutout window.

- Explorer: steps `24–31`, a clear drop;
- Grid Pressure: steps `27–31`, a short diagnostic vacuum;
- Boss Protocol: steps `26–31`, a hard choke;
- Lost Signal: steps `20–31`, a longer signal-loss void.

The state-specific ascending launch always completes before its cutout begins.

## Complete warm Peak lines

Peak phrases 11 and 12 are authored melodic destinations in every state.

For the primary line:

- state-level deterministic omission is disabled;
- phase-level silence-budget omission is disabled;
- the state-specific Peak rhythm remains unchanged;
- every scheduled lead note survives.

Register policy:

- Explorer: `-12` semitones;
- Grid Pressure: `-12` semitones;
- Boss Protocol: unchanged because its existing line is already lower and darker;
- Lost Signal: `-12` semitones.

Counterlines and melodic Peak ornaments follow the same register policy. Bass, drums, pads and non-melodic accents are not transposed.

Explorer additionally removes the later D1A state-arp overlay and sparkle answer during Peak so the complete PR #128-shaped climax has space. The other states retain their approved state-specific supporting programmes.

## Integration boundary

The approved D2 arranger, sequencer and trace, plus the D1A mix director and performance conductor, remain available as adjacent baseline modules.

Public adapters add:

- support harmony and support voicings;
- harmonic region and cadence intent;
- the narrowed global dynamic envelope;
- deterministic four-state signature gestures;
- state-specific cutout policy;
- complete Peak-note protection;
- state-specific warm Peak register shifts;
- the small approved Boss bass velocity trim.

## Automated proof

Tests require:

- exactly three guaranteed signature moments per state and cycle;
- twelve distinct state-and-moment gesture labels;
- descent, restrained ascent, descent direction order;
- the exact Explorer `24 → 19 → 12` shimmer at steps `28 → 29 → 30`;
- no duplicate shimmer at a guaranteed signature moment;
- legacy authored shimmers remaining available elsewhere;
- state-specific register ceilings;
- exact cutout start steps and silence across every performance category;
- no ornament scheduled inside a cutout;
- complete Peak primary-event counts of Explorer 16, Grid Pressure 16, Boss Protocol 8 and Lost Signal 2;
- no state-level or phase-level omission of Peak primary notes;
- the reviewed state-specific Peak octave policy;
- unchanged Peak rhythm, gate and velocity;
- unchanged Boss bass pitch and rhythm;
- deterministic bounded support voicings;
- evidence-aware cadence restrictions;
- deterministic frozen trace output.

## Listener gate

The final numbered preview must be judged as a complete four-track soundtrack.

Listen for:

1. three meaningful members of the descending-shimmer family in each state;
2. ascending gestures remaining sparse and purposeful;
3. each pre-Peak cutout feeling like its state rather than a copied mute;
4. complete, warm and uninterrupted Peak lines;
5. Explorer remaining the most expansive and memorable state;
6. Grid Pressure, Boss Protocol and Lost Signal staying lower, darker and distinct;
7. no regression to the approved global volume envelope or Boss low-end balance.

This PR remains draft until listener approval. Merge does not prove or perform production deployment.
