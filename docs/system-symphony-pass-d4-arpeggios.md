# System Symphony Pass D4 Arpeggio Composition

## Listener authority

Pass D4 starts from the production-verified D3 soundtrack.

The listener has clarified the governing rule:

> Arpeggios are additional musical material. They never replace, mute, rewrite or create gaps in the approved melody or arrangement.

One event remains immutable:

- Explorer, between Theme A and Variation A;
- phrase 4 of every 16-phrase cycle;
- steps `28, 29, 30`;
- offsets `24, 19, 12`;
- velocities `0.28, 0.24, 0.22`;
- `32n` duration;
- primary chip voice.

The earlier D4 foreground-handoff experiment is rejected. It created gaps, note clouds and a false hierarchy in which the arp displaced the melody.

## Composition goal

Arpeggios should be prominent signatures layered around the approved score.

They may:

- answer or decorate the primary melody;
- connect phrases and sections;
- form clearly audible ascending runs;
- form clearly audible descending runs;
- form tornado runs that rise and fall once;
- develop, contrast and reprise across later cycles.

They may not:

- change any primary or secondary melody event;
- alter pad, service, bass, drum or accent omission;
- create a melody-slot hand-off;
- introduce silence to make themselves audible;
- compete with the complete Peak melody;
- restore the old every-phrase connective arp or D1A state-arp layer.

## Ownership

`apu-arpeggio-composer-d4.js` is the sole active arp composition authority.

The performance conductor removes only duplicate historical arp material:

- `connective-arp`;
- `state-arp`;
- a selected legacy `shimmer` when D4 already owns that phrase.

All non-arp score layers remain governed by the existing D3 and D1A contracts.

## Long-form schedule

Each 16-phrase cycle contains seven D4 passages:

| Cycle role | Active phrases | Count |
|---|---|---:|
| Statement | `1, 3, 4, 6, 8, 10, 14` | 7 |
| Development | `0, 3, 4, 6, 8, 10, 13` | 7 |
| Contrast | `1, 4, 6, 7, 9, 10, 14` | 7 |
| Reprise | `1, 3, 4, 6, 8, 10, 14` | 7 |

Peak phrases `11` and `12` remain arp-free.

The upper listener-approved count is intentional. Arps are meant to be a defining feature, while nine phrases per cycle remain free of D4 passages.

## Additive run language

Every regular D4 passage is one continuous run with consecutive sixteenth-step placement.

The permitted shapes are:

- `up`: one uninterrupted ascent;
- `down`: one uninterrupted descent;
- `tornado`: one ascent followed by one descent.

There are no rotated fragments, discontinuous cells or multiple direction reversals.

Regular runs contain between six and thirteen notes. They finish by step `15`, keeping the whole run inside one harmonic half of the phrase. This prevents a single run from crossing a chord boundary while the ornament scheduler remains phrase-based.

## Protected Explorer hand-off

Every cycle retains exactly the same three-note primary event.

No secondary halo, accent double or replacement timbre is added. The protected event remains recognisable because its audible voice, timing, offsets and velocities are unchanged.

## State identities

### Explorer

Explorer receives the widest and brightest runs:

- ascending spans up to `24` semitones;
- descending mirrors;
- full thirteen-note tornado contours;
- secondary chip voice for regular D4 material.

The protected Theme A to Variation A shimmer remains on primary.

### Grid Pressure

Grid Pressure uses tighter mid-register runs with a maximum authored offset of `15` semitones.

The narrow accent chip voice gives the additive arp a clear outline without muting the pressured melody, bass or drums.

### Boss Protocol

Boss Protocol uses heavier lower-starting runs with a maximum authored offset of `19` semitones.

The narrow accent chip voice distinguishes the arp from the existing lead while the entire score continues underneath.

### Lost Signal

Lost Signal uses lower, narrower runs with a maximum authored offset of `12` semitones.

Its secondary chip colour remains distinct from Grid and Boss without introducing gaps or fragmented timing.

## Preserved D3 contracts

D4 does not change:

- any approved primary or secondary melody event;
- the global listener-approved dynamics envelope;
- complete Peak primary lines;
- state-specific warm Peak register shifts;
- the Explorer bass-only pre-Peak drop;
- the darker states' existing pre-Peak treatment;
- D3 harmonic destinations and support voicings;
- Boss bass pitch, rhythm or approved velocity trim;
- tempo, evidence authority, replay ordering or live-state selection.

## Determinism and traceability

The composer is pure data. It does not use `Math.random`, time or browser state.

The score trace records:

- active or rest state;
- feature, answer or rest role;
- arp function;
- `up`, `down` or `tornado` contour;
- actual chip voice;
- additive status;
- protected-event status;
- run window;
- empty orchestration-space categories;
- note count;
- D4 composer build identity.

## Automated proof

Tests require:

- exactly seven passages per cycle role;
- exact active phrase sets;
- no D4 arp in either Peak phrase;
- the exact Explorer `24 → 19 → 12` primary hand-off in every cycle;
- no protected colour layers or replacement voices;
- six-to-thirteen-note regular runs;
- consecutive one-step timing;
- only `up`, `down` and single-turn `tornado` contours;
- all regular runs ending by step `15`;
- D4 never adding an omission for any score category;
- removal of duplicate legacy arp layers;
- preserved non-arp ornaments;
- deterministic cycle variation;
- state-specific register ceilings;
- D4 decisions in the deterministic score trace.

## Validated candidate

Final listener candidate:

- base `main`: `442983289809f764f9950080c584f2ef250497c5`;
- head: `bd819fb3d3ecb88aa7e8dfe485738c952d205740`;
- eighteen commits ahead and zero behind `main`;
- full repository and System Symphony report enforcement green;
- CodeQL, Scorecard and public-interface checks green;
- numbered Pages preview green;
- current soundtrack smoke green;
- Chromium and Firefox hybrid APU smoke green.

## Listener gate

Judge the numbered preview over at least one complete Statement cycle and one later cycle.

Listen for:

1. the approved melody and arrangement continuing without any new gap;
2. the Explorer hand-off remaining exact;
3. ascending, descending and tornado runs reading as intentional features;
4. Grid Pressure and Boss Protocol arps being immediately audible as extra material;
5. no stray-feeling pitch or timing changes;
6. Peak remaining complete and uncluttered;
7. no regression to D3 dynamics, bass balance or transition behaviour.

This pass remains a draft PR until listener approval. Merge and production rollout remain separate actions.
