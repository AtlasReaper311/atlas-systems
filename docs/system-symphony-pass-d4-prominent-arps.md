# System Symphony Pass D4: Prominent Arpeggio Features

## Status

This is the replacement for listener-rejected PR #150.

It starts from the production-verified D3 soundtrack restored by PR #153. It must not merge without explicit listening approval.

## Listener contract

Arpeggios are additional musical material. They do not replace, mute, retime or rewrite any primary or secondary melody event.

The original Explorer Theme A hand-off remains exact:

- phrase 4 of each 16-phrase cycle;
- steps `28, 29, 30`;
- offsets `24, 19, 12`;
- velocities `0.28, 0.24, 0.22`;
- duration `32n`;
- primary chip voice.

## Audible target

Each 16-phrase cycle contains seven major D4 runs at phrases:

`1, 3, 4, 6, 8, 10, 14`

Each major run contains exactly sixteen consecutive musical notes at steps `0` through `15`.

At 100 BPM, each run lasts about 2.4 seconds. One cycle therefore contains about 16.8 seconds of major D4 arpeggio material, in addition to the smaller D3 connective material retained in non-feature phrases.

The major runs are not tiny ornaments. They are intended to be unmistakable musical features.

## Contour language

Every run is one of:

- uninterrupted ascent;
- uninterrupted descent;
- a single-rise, single-fall tornado.

The contour never rotates into disconnected cells and never reverses direction more than once.

All notes stay inside the first harmonic half of the phrase. The existing engine therefore quantises the complete run against one stable chord rather than carrying notes across a chord boundary.

## Playback ownership

During a major D4 phrase, the conductor removes only older arp ornaments:

- `connective-arp`;
- `state-arp`;
- overlapping legacy `shimmer`.

It does not remove melody, pads, services, bass, drums, accents or non-arp structural gestures.

Each of the sixteen musical notes has two simultaneous, pitch-identical layers:

- a `16n` primary-chip body at velocity `0.50` to `0.60`;
- a short `32n` narrow accent-chip edge at velocity `0.36` to `0.44`.

The edge layer introduces no extra pitch, timing position or contour. It gives the run a readable outline while the approved melody continues as polyphony underneath.

## Browser-audio correction

The first replacement candidate passed Chromium but placed Firefox Unknown fractionally below the existing loudness floor. The corrective design does not weaken that gate. It strengthens the musical feature itself through the same-pitch edge layer and higher bounded body velocity.

## D3 boundaries

Unchanged:

- exact Explorer descending shimmer;
- complete Peak phrases;
- Explorer bass-only pre-Peak withdrawal;
- darker-state pre-Peak cutouts;
- D3 harmony and voice leading;
- D3 dynamics and Boss bass balance;
- 100 BPM transport;
- sample-free playback;
- live evidence and replay authority.

## Expected cycle map

| Phrase | Section role | Major D4 feature |
|---:|---|---|
| 0 | Intro | none |
| 1 | Establish | 16-note run |
| 2 | Theme A | D3 connective material only |
| 3 | Theme A | 16-note run |
| 4 | Theme A hand-off | 16-note run, then exact Explorer shimmer in Explorer |
| 5 | Variation | D3 connective material only |
| 6 | Variation | 16-note tornado or directional run |
| 7 | Theme B | D3 connective material only |
| 8 | Theme B | 16-note run |
| 9 | Build | D3 connective material only |
| 10 | Build | 16-note run, followed by existing pre-Peak gesture |
| 11 | Peak | no D4 feature |
| 12 | Peak | no D4 feature |
| 13 | Release | D3 connective material only |
| 14 | Recovery | 16-note run, followed by existing recovery gesture |
| 15 | Breathe | D3 connective material only |

## Listener gate

Approve only when:

1. all seven major runs are obvious on first listen;
2. each run sounds deliberate and in time;
3. no run introduces stray-feeling pitches;
4. the melody remains complete under every run;
5. the Explorer shimmer remains exactly recognisable;
6. Peak and the Explorer bass-drop transition remain unchanged.
