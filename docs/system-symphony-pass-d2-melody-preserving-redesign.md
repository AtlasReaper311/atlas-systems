# System Symphony Pass D2 Melody-Preserving Redesign

## Listener decision

The full-track D2B integration was rejected because it replaced the established lead language with a sparse transformed motif system. The result was more repetitive, jumpy and fragmented, with larger melodic gaps and a weaker Boss Protocol.

The listener then revisited the PR #133-era soundtrack and confirmed it as the correct audible baseline. Recovery candidates #138 and #139 further proved that the repeated arpeggio was not the regression. Both candidates recovered the desired melody because neither contained the failed D2B primary-line replacement.

## Authority boundary

The approved melody remains owned by:

- `apu-arranger-baseline.js`, preserved from current `main` at commit `41ebc555c457a9c50fa8b01c8b4cbf8630e2fa67`;
- `apu-track-sequencer.js`, which converts the existing motif modes and degrees into primary events;
- the current performance conductor and D1A orchestration, including their repeated arpeggios and state features.

D2 is forbidden from changing:

- `motifMode`;
- `motifDegrees`;
- primary step positions;
- primary MIDI notes;
- primary gates;
- primary velocities;
- primary mix gain;
- lead cutoff, drive or duty cycle;
- the number of primary events.

## Redesigned D2 role

D2 now develops the arrangement around the melody instead of rewriting the melody.

The D1 song planner still supplies long-form intent:

- statement;
- development;
- contrast;
- reprise;
- phrase function;
- state treatment;
- cadence intent.

A new accompaniment-development module converts that intent into narrow, deterministic multipliers for:

- secondary voice balance;
- service detail;
- bass support;
- drums;
- pad space;
- accents;
- counter, service and pad filtering.

Every multiplier is bounded between `0.90` and `1.10`. The primary multiplier and all lead-timbre multipliers are exactly `1.0`.

## Integration shape

The current arranger is preserved byte-for-byte as `apu-arranger-baseline.js`.

The public `apu-arranger.js` becomes a thin adapter that:

1. asks the baseline arranger for the approved phrase;
2. advances the D1 song planner once for the phrase and state;
3. derives an accompaniment-development directive;
4. copies the baseline melody and primary settings unchanged;
5. applies only bounded non-primary mix and supporting-timbre changes;
6. exposes the plan and directive for traces and inspection.

No engine, sequencer, performance-conductor, D1A orchestration, replay, evidence, transport or Web Audio graph file is changed.

## Proof requirements

Automated tests must prove across all four states and two full 32-bar cycles that:

- motif mode is identical to the baseline;
- motif-degree arrays are the exact same frozen objects;
- harmony and pattern authority are unchanged;
- primary mix and lead timbre are identical;
- every sequenced primary event is deep-equal to the baseline at all 32 steps;
- accompaniment movement stays inside the ten-percent envelope;
- the planner and development directive remain deterministic and resettable.

## Listener gate

The numbered preview must be judged as a normal full soundtrack.

The questions are deliberately narrow:

1. Does it still sound like the PR #133-era soundtrack?
2. Does the backing arrangement now breathe and develop over longer listening without pulling attention away from the melody?
3. Is any state worse, especially Boss Protocol or Lost Signal?
4. Can the difference be felt without the tune becoming less continuous?

A result of “I barely notice the change, but nothing became worse” is acceptable for this first recovery-safe D2 step. Larger musical development must be earned through later isolated passes.

## Safety and rollout

- draft PR only;
- no production deployment;
- no merge without listener approval;
- no provider settings or secrets;
- normal squash merge only after all checks and listening approval;
- any numbered Pages preview is review-only.
