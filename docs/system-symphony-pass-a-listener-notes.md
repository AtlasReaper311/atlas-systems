# System SYMPHONY - Pass A listener notes

Pass A of the composed audio pass. Two additive modules that fix the
harshest issues heard in PR #127 percussion and give every service a
recognisable musical signature. No engine wiring in this pass; the wiring
is delivered in Pass C once Performance Director v4 and Mix Director are
also on the branch and reviewed.

## What changed sonically

Nothing changes in a browser until Pass C lands. This PR delivers the two
building blocks the engine will call into next.

The drum sculptor, once wired, will:

- soften closed hats from the current ~850 Hz metallic jab down to a
  restrained tick that sits behind the melody
- give the snare a triangle body layer so it reads as a hit rather than a
  static burst
- remove the ~2 ms DC-step click currently at the front of every
  percussion hit
- vary the LFSR buffer offset per hit so consecutive hats do not start on
  the same sample slice
- curve incoming velocity so mid-range values stop punching the ear

The service leitmotif system, once wired, will:

- give each of the ~21 services a stable 4-note melodic cell you can
  learn to recognise
- carry that cell through healthy, warning, critical, unknown, and
  recovery with mutations that are always audibly distinct per state
- surface which service is currently influencing which voice through the
  debug UI

## What to listen for once Pass C wires this in

**On the drum sculptor:**

- The hi-hat should sound like a hi-hat, not a laser. Try switching the
  future mode toggle from polished to authentic on a healthy state and
  the metallic character returns; that confirms the polished shaping is
  doing real work.
- Snare hits at velocity 0.6-0.8 should have a small pitched thump under
  the noise. In critical state the thump is louder and lower; in unknown
  state the noise decay is longer and the thump smaller.
- No clicks at the front of any drum hit. If you hear a click, the
  attack floor is being bypassed; report the mode and state that produced
  it.
- Velocities under 0.15 should sound like ghost notes, not full hits.

**On the leitmotifs:**

- Pick a service that is usually healthy (`atlas-corpus` or
  `atlas-api-public`). Its cell should be the same shape every time you
  reload.
- Trigger a warning-state fixture. The cell's interior notes should
  climb one scale degree without changing the outer notes; the phrase
  should feel tense but recognisable.
- Trigger critical. Most of the cell should drop out, but one interior
  note stays with the head note; the phrase should feel fractured, not
  silent.
- Trigger unknown. Only the outer notes should remain; the phrase should
  feel like it lost its middle.
- Trigger a recovery transition. The final note should lift to the note
  above the tonic; the phrase should sound like it is opening upward.

## What this pass does NOT do

- Does not wire either module into the v3 engine
- Does not change phrase-level structure or introduce intro/groove/pressure/rupture/recovery/afterglow behaviour (that is Pass B)
- Does not add ducking, bus EQ, stereo width rules, chip wobble, or transient softening (also Pass B)
- Does not turn incident replay into a staged song (that is Pass C)
- Does not modify existing tests, mastering, or the composition director

## Dependency on PR #127

Pass A imports `apu-chip-oscillators.js` (specifically `createLfsrNoiseBuffer`).
That module is currently in review on PR #127.

If PR #127 merges first, Pass A rebases cleanly onto `main`. If PR #127
does not merge, Pass A can be rebased on top of whichever alternative
lands, or the single `createLfsrNoiseBuffer` import can be replaced with
an inline copy of the function (about 25 lines). Nothing else in Pass A
depends on PR #127.

## Suggested change to PR #127 before merge

The `createLfsrNoiseVoice` factory inside `apu-track-engine-v3.js` on
that PR is the source of the current harsh percussion. Two options:

1. Merge PR #127 as-is (oscillators, mastering, and quantizer are the
   valuable parts), then land Pass A and let Pass C's wiring change
   swap `createLfsrNoiseVoice` calls for drum sculptor voices in the
   same commit that adds the wiring.
2. Amend PR #127 to remove the `createLfsrNoiseVoice` factory and its
   three call sites, keep the oscillator/mastering/quantizer modules,
   and let Pass A/C ship the replacement. This produces a cleaner PR
   history but requires an extra force-push on the PR branch.

Option 1 is lower risk and preserves reviewability of PR #127. Option 2
avoids briefly landing percussion that the operator has already
identified as too harsh. Your call.

## How to review

1. Read `apu-drum-sculptor.js` end-to-end. The interesting design decisions
   are in the envelope computation, the per-hit buffer offset, the
   velocity curve, and the per-state kit tables.
2. Read `apu-service-leitmotifs.js` end-to-end. The interesting design
   decisions are in the base motif hashing, the state mutation functions,
   and the recovery lift-to-leading-tone choice.
3. Run `node --test static/js/sonify/apu-drum-sculptor.test.js` and
   `node --test static/js/sonify/apu-service-leitmotifs.test.js`. All 58
   tests should pass.
4. Scan the negative tests at the bottom of each test file. They prove
   no sample assets, no Tone.Player, no Tone.Sampler, no GrainPlayer, no
   Math.random, and no Date.now were introduced.
5. Confirm no existing sonify tests were changed by running the whole
   `static/js/sonify/*.test.js` suite. The delivery script does this
   automatically.
