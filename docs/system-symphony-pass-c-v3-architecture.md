# System Symphony Pass C v3 architecture

## Status and boundary

Pass C v3 is a focused correction of the supplied Pass C v2 package. It preserves the Part 1, Pass A, and Pass B musical contracts while correcting the integration defects found during independent review.

The package targets draft PR #128 at exact head `0c62169b873431929da5a9fa97ec90d7fe6e5bcf` only. The apply script stops on branch, head, engine, controller, HTML, remote, or working-tree drift. It does not commit, push, deploy, merge, or dispatch a workflow.

## Ownership model

The composition director continues to own the 32-bar form, section selection, and existing score grammar.

The performance director owns phrase intent:

- intro
- groove
- pressure
- rupture
- recovery
- afterglow

The performance conductor converts that intent into event activity, silence, velocity shaping, supplemental rhythm, and deterministic ornaments. It does not replace the composition director.

State identities continue to own harmonic grammar and transition policy. Replay overlays an evidence-backed score state and performance phase without changing provider data or fabricating service evidence.

## Audio graph

The final master path is:

```text
primary / secondary / service / bass / drum / pad / accent sources
  -> explicit bus input
  -> per-bus high-cut
  -> one shared ducking gain per target bus
  -> bus spatial stage
  -> main destination and preserved auxiliary sends
  -> chip bus
  -> master volume
  -> master high-pass
  -> master low-pass with bounded wobble
  -> upper-mid transient shelf
  -> one resolved compressor owner
  -> parallel dry / 8-bit DAC wet mix
  -> soft clipper
  -> existing limiter
  -> output and analysers
```

The primary and secondary delay sends and the pad and accent reverb sends are explicit graph edges. No bus is disconnected after construction.

## Chip voices

The melodic chip voices use native `OscillatorNode.setPeriodicWave` through the public Web Audio API. Native gain output is bridged into Tone.js through the public `Tone.connect` function available in the repository's vendored Tone.js 14.8.49.

No private Tone.js oscillator fields are accessed. Each trigger creates a bounded native oscillator and envelope, installs the selected Part 1 wave, schedules cleanup, and respects a maximum polyphony limit.

Runtime mappings:

- primary: variable pulse
- secondary: hollow pulse
- bass: staircase triangle
- pad sub: square pulse
- deployment cue: VRC6-style saw
- incident cue: narrow pulse
- service pool: deterministic rotation across the Part 1 chip waves

The held polyphonic pad remains a sine layer because a full chip wave on every held chord would dominate the reverb path. This is an explicit orchestration choice, not an unwired feature.

## Phrase activity and ornaments

The state identity's omission threshold remains upstream. The performance conductor adds a deterministic phase activity threshold based on both silence budget and density.

Density now affects event count as well as velocity. High-density phrases may add bounded hat or noise-accent events only where the existing sequencer did not already schedule that voice.

Ornaments are rendered using absolute audio-context times derived from the current transport callback. They are not passed back to `Tone.Transport.scheduleOnce`, avoiding clock-domain confusion after pause or resume.

Queued deployment and incident cues use the same absolute-time rule.

## Service identity

The service conductor consumes:

- service name and stable hash
- active arrangement tonic
- original event register
- leitmotif rhythm
- motif degree
- register
- preferred layer
- estate state
- recovery performance phase
- active state quantizer

Inactive rhythm slots produce no service note. Active slots select the next audible motif degree when a critical fragment contains null positions. The preferred layer selects a matching service-pool colour while the signal remains on the attributable service bus. Emitted provenance describes the note that was actually played.

## Mix ownership

`mixDirectiveFor(state, phase)` is consumed completely:

- seven bus gain multipliers
- seven high-cut targets
- width translation
- six ducking relationships
- chip wobble
- transient softening
- bounded compressor resolution

There is one ducking gain per target bus. Multiple sources can automate the same target without displacing one another. All six authored relationships remain active.

Spatial translation has one owner per category:

- primary and secondary use their existing voice panners
- service width scales deterministic pool positions
- pad and accent use `StereoWidener`
- bass remains mono
- drums remain centred

## Replay execution

The replay planner preserves ordered evidence spans and never inserts failure, recovery, or resolution without supporting evidence.

At each bar boundary, the current movement overlays the read-only score frame and the movement's phase controls the performance plan. The replay cursor advances at both bar boundaries in the two-bar phrase, so movement durations remain measured in bars.

The controller exposes an explicit `setReplayIncident` API and accepts an optional `window.__ATLAS_APU_REPLAY_INCIDENT__` fixture before polling begins. Replay therefore drives the audible engine rather than diagnostics alone.

## Browser activation

The active hybrid controller is changed from `apu-track-engine-v2.js` to the Pass C v3 engine. The controller and document expose the Pass C v3 build ID. The HTML cache key is updated.

The post-preview smoke script fails unless:

- the v3 build is active
- audio starts
- diagnostics identify Pass C v3
- sample-free control remains true
- replay input is consumed
- no channel or browser console error is reported

## Disposal

The engine has an explicit ownership list. Drum voices are disposed through the drum kit once. Service voices are disposed once. Mix buses are disposed through their handles. Native bridge gains are disconnected separately. The old generic `Object.values(nodes)` disposal pass has been removed.
