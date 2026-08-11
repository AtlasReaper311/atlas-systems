# System SYMPHONY - Pass B listener notes

Pass B of the composed audio pass. Two pure-data modules that decide
"what is this phrase for" and "how should the buses be shaped for that
moment." No engine wiring. Neither module produces audio directly; both
return frozen data structures the engine will consume in Pass C.

## What changed sonically

Nothing changes in a browser until Pass C lands. This PR delivers the
control planes the engine will read from.

The performance director, once wired, will:

- give the piece an audible shape at the 8, 16, and 32 bar scale so it
  stops feeling like a live jam and starts feeling like a track
- keep more silence in the mix, especially in intro and afterglow phases,
  so busy moments have somewhere to land
- fire a small ornament every 4 bars, a medium ornament every 8, and a
  large ornament every 16, chosen deterministically per seed
- author state transitions explicitly: warning bloom, critical choke,
  recovery release, unknown drift

The mix director, once wired, will:

- open stereo width in healthy/afterglow, narrow it hard in
  critical/rupture
- keep the bass mono in every state and phase
- brighten the mix when the estate is healthy, darken it when critical
- duck bass under every kick, duck pads under every lead note, duck
  accents under services so the six-voice APU stops fighting itself
- add a slow chip wobble to the master lowpass at 0.14-0.48 Hz depending
  on state, so the piece never sounds frozen
- shelf-shave upper-mid transients before the PR #128 soft clipper so
  the harshness that could otherwise appear during rupture cannot

## What to listen for once Pass C wires this in

**On the performance director:**

- Boot the piece cold in a healthy state. The first two phrases should
  sound sparser and quieter than the third; you are hearing intro.
- Trigger a warning transition. Within one phrase you should hear a
  measurable rise in density and a narrowing of the mix; that is pressure.
- Trigger a critical transition. Within one phrase the sound should feel
  like it hit a wall; that is rupture combined with the critical
  hard-choke transition from the state identities.
- Let critical persist, then recover to warning or healthy. The next
  phrase should feel intentionally like the wave is falling; that is
  recovery.
- Let the estate go stale to unknown. The mix should drift into
  something spacious and slow; that is afterglow.
- Watch the debug UI for phase labels. Every state cycle should visit
  intro, groove, pressure, rupture, recovery, and afterglow over 60
  phrases if you cycle every state.

**On the mix director:**

- The kick should visibly pump the bass on every hit; if you cannot hear
  the pump, the sidechain wiring did not take.
- The pad should get quieter every time the lead plays; a lead line and
  a pad note happening at the same time should never fight.
- In critical, the pad should feel dark and pulled inward; in healthy,
  it should feel bright and spread wide.
- No matter how loud the music gets, the master output should stay under
  the safety envelope: no gain multipliers over 1.2, no filter cutoffs
  outside 200-20000 Hz, no ducking depth over 6 dB. If you hear pumping
  distortion or a bus disappear, the envelope was breached in the wiring.

## What this pass does NOT do

- Does not wire either module into the v3 engine
- Does not change any existing sonify tests
- Does not touch Pass A's drum sculptor or leitmotifs
- Does not touch PR #128's oscillators, quantizer, or soft clipper
- Does not modify the composition director, arranger, sequencer, or
  state identities
- Does not turn incident replay into a staged song (Pass C)
- Does not introduce any Web Audio nodes, Tone.js dependencies, or sample
  assets

## Dependency graph

Pass B is fully independent of the PR #128 Part 1 foundation and Pass A. Both modules are
pure-data. They can be reviewed, tested, and merged in any order
relative to the other two work streams.

Pass C is the only place where all four work streams meet: it wires
Pass A voices, Pass B directives, and PR #128 primitives into
`apu-track-engine-v3.js` in a single reversible change.

## How to review

1. Read `apu-performance-director-v4.js` end-to-end. The interesting
   design decisions are the transition-override table, the per-state
   phase cycle, and the deterministic ornament salting.
2. Read `apu-mix-director.js` end-to-end. The interesting design
   decisions are the state-base tables, the phase modulators, the
   ducking rule ordering, and the safety envelope constants.
3. Run `node --test static/js/sonify/apu-performance-director-v4.test.js`,
   `node --test static/js/sonify/apu-mix-director.test.js`, and
   `node --test static/js/sonify/apu-pass-b-integration.test.js`. All
   59 tests should pass.
4. Look at the integration test. It plays a 40-phrase estate journey
   through both directors and proves the outputs stay deterministic and
   inside the safety envelope. That is the shape of the Pass C wiring.
5. Scan the negative source-level tests at the bottom of each file. They
   prove no Web Audio, no Tone.js, no samples, no Math.random, no
   Date.now.

## Suggested next step for Pass C

Pass C wires everything together. Its scope should be:

1. Instantiate a performance director inside `createApuTrackEngine`.
2. Call `observe(frame)` when a new frame is committed and
   `advancePhrase()` when the transport ticks over a phrase boundary.
3. Feed `plan.state, plan.phase` into `mixDirectiveFor()` and apply the
   returned bus gains, filter cutoffs, stereo widths, ducking depths,
   wobble parameters, and softener parameters to the existing nodes.
4. Replace the current Tone.js kick, snare, hat, open-hat, and noise-accent
   voices in `buildGraph` with
   `createDrumSculptorKit(...).kick/snare/hat/openHat/noiseAccent`, while
   preserving the existing trigger contracts. Decide separately whether a
   polished/authentic UI toggle belongs in the same wiring change.
5. Feed the leitmotif for the currently-playing service into the
   arranger's motif slot when the service voice pool picks a new
   service.
6. Emit provenance to the debug UI on every phrase so a reviewer can see
   which service is influencing which voice under which mutation.

Pass C is one change to one file (`apu-track-engine-v3.js`) plus a
matching engine test update. It should stay under 300 lines added and
100 lines removed.
