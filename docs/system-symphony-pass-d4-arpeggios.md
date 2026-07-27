# System Symphony Pass D4 Arpeggio Composition

## Listener authority

Pass D4 starts from the production-verified D3 soundtrack.

The listener explicitly permits D4 to remove or replace the earlier fixed shimmer and arp work when that produces a cleaner composition boundary. One event remains immutable as music:

- Explorer, between Theme A and Variation A;
- phrase 4 of every 16-phrase cycle;
- steps `28, 29, 30`;
- offsets `24, 19, 12`;
- velocities `0.28, 0.24, 0.22`;
- `32n` duration.

Its primary notes, rhythm and velocity do not change. Later cycles may add a quieter same-note colour layer, but may not replace or weaken the recognisable primary core.

The first D4 listener candidate preserved the first Explorer shimmer and Peak, D3 dynamics and the bass-only Explorer transition. It did not make the broader arp language prominent enough. Only one or two Grid Pressure and Boss Protocol passages were clearly audible, and foreground passages did not yet read as foreground.

## Composition goal

Arpeggios should be one of System Symphony's most recognisable musical features without becoming continuous sixteenth-note wallpaper.

They may:

- answer the primary melody;
- connect phrases and sections;
- become foreground material during Variation, Build, Release and Recovery;
- create lift without relying on higher pitch or increased master level;
- develop, contrast and reprise across later cycles.

They may not:

- replace the approved primary melody outside a bounded foreground window;
- compete with the complete Peak melody;
- claim unsupported recovery or resolution;
- raise warning, critical or unknown material merely to make it audible;
- restore the old every-phrase connective arp or D1A state-arp layer.

## Ownership

`apu-arpeggio-composer-d4.js` is the sole active arp composition authority.

The performance conductor removes the earlier:

- `connective-arp` instructions;
- `state-arp` instructions;
- selected legacy shimmer when a D4 passage is active.

It retains non-arp state responses, percussion ornaments, pad ornaments, transition effects, D3 dynamics and the existing listener-approved Peak treatment.

## Long-form schedule

Each 16-phrase cycle contains seven bounded arp passages:

| Cycle role | Active phrases | Count |
|---|---|---:|
| Statement | `1, 3, 4, 6, 8, 10, 14` | 7 |
| Development | `0, 3, 4, 6, 8, 10, 13` | 7 |
| Contrast | `1, 4, 6, 7, 9, 10, 14` | 7 |
| Reprise | `1, 3, 4, 6, 8, 10, 14` | 7 |

Peak phrases `11` and `12` are always arp-free.

Seven passages use the upper end of the listener-approved five-to-seven range because arps are intended to shine. Nine phrases in every cycle remain free of D4 arp passages, including both Peak phrases.

The first cycle is deterministic and recognisable. Later cycles transform the contour while retaining state, section, phrase-role and cadence boundaries.

## Roles

### Answer

Answer passages use the secondary chip voice and leave the current arrangement intact. They sit behind or beside the lead rather than creating a new foreground hierarchy.

### Foreground

Variation, Build, Release and Recovery may promote the arp to foreground. Selected later-cycle passages may do the same. Non-Explorer Theme A hand-offs may also become foreground so Grid Pressure, Boss Protocol and Lost Signal receive an audible structural signature.

Foreground clarity comes from a real but bounded orchestration hand-off:

- the scheduled arp continues;
- primary and secondary score events yield inside the arp window;
- pad and service events yield inside the same window;
- bass, drums and accents continue;
- the window closes immediately after the arp.

This is not a full mute. The listener still hears rhythm and foundation, but the melody slot belongs to the arp for that moment.

Explorer and Lost Signal foreground passages use the secondary chip colour. Grid Pressure and Boss Protocol use the existing narrow accent chip colour. This is an actual playback-route difference, not metadata that the engine ignores.

## Protected Explorer hand-off

Every cycle retains the exact three-note primary event.

- Statement: primary core only;
- Development: primary core plus a quiet secondary hollow halo;
- Contrast: primary core plus a quieter narrow accent spark;
- Reprise: primary core plus a soft secondary recall.

The colour layer repeats the same notes and timing at a lower velocity. It changes texture without replacing the phrase that the listener recognised in the first cycle.

## State identities

### Explorer

Explorer remains the widest and brightest arp identity. It uses flowing connector, answer, lift, fracture, reprise and cadence contours.

Its protected high descending shimmer remains the primary core in every cycle. Other foreground Explorer arps use the secondary chip colour while the ordinary lead and support voices yield briefly.

### Grid Pressure

Grid Pressure uses compressed diagnostic intervals and bounded mid-register cells. Its maximum authored D4 offset is 13 semitones.

Foreground cells use the narrow accent chip voice while the ordinary lead, counterline, pad and service layers withdraw. Bass and drums retain the pressured grid underneath.

### Boss Protocol

Boss Protocol uses fewer, heavier intervals and larger spacing. Its maximum authored D4 offset is 19 semitones.

Foreground cells use the same narrow accent chip route but retain Boss-specific intervals and spacing. The arp cuts through by taking the melody slot, not by exceeding Explorer's register or increasing the master level.

### Lost Signal

Lost Signal uses slower, fragmented contours with longer spacing and an offset ceiling of 12 semitones.

Its foreground moments use the secondary chip colour over the retained bass and rhythm foundation. They remain sparse and distant even when the other melodic layers withdraw.

## Preserved D3 contracts

D4 does not change:

- the global listener-approved dynamics envelope;
- complete Peak primary lines;
- state-specific warm Peak register shifts;
- the Explorer bass-only pre-Peak drop;
- the darker states' existing pre-Peak transition treatment;
- D3 harmonic destinations and support voicings;
- Boss bass pitch, rhythm or approved velocity trim;
- tempo, evidence authority, replay ordering or live-state selection.

## Determinism and traceability

The composer is pure data. It does not use `Math.random`, time or browser state.

The score trace records:

- whether the phrase contains an arp passage;
- answer, foreground or rest role;
- arp function;
- contour and actual chip-voice timbre role;
- protected-core and colour-layer status;
- orchestration-space window and categories;
- note count;
- D4 composer build identity.

## Automated proof

Tests require:

- exactly seven passages per cycle role;
- exact active phrase sets for statement, development, contrast and reprise;
- no D4 arp in either Peak phrase;
- the exact Explorer `24 → 19 → 12` primary hand-off in every cycle;
- unchanged protected timing, duration and velocity;
- the primary protected core always using the primary chip voice;
- later-cycle colour layers using quieter actual playback voices;
- removal of legacy connective and state arps from active playback;
- no duplicate legacy shimmer on a D4 passage;
- primary, secondary, pad and service yielding inside foreground windows;
- bass, rhythm and accents remaining present under the D4 spacing policy;
- at least three foreground spotlights in the Statement cycle;
- answer arps using the secondary voice without arrangement thinning;
- deterministic transformed contours in later cycles;
- warning, critical and unknown register ceilings;
- D4 decisions in the deterministic score trace.

## Listener gate

The numbered preview should be judged over at least one complete Statement cycle and one later cycle.

Listen for:

1. the protected Explorer hand-off remaining exactly recognisable in every cycle;
2. arps now feeling prominent and valuable without becoming constant;
3. foreground arps clearly owning the melody slot while bass and drums continue;
4. Grid Pressure and Boss Protocol becoming clear on first listen without moving higher;
5. Peak melodies remaining complete and uncluttered;
6. later cycles sounding related but genuinely developed;
7. no regression to D3 dynamics, bass balance or transition behaviour.

This pass remains a draft PR until listener approval. Merge and production rollout remain separate actions.
