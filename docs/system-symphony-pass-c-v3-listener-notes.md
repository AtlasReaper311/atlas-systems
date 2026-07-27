# System Symphony Pass C v3 listener and reviewer notes

## What this package changes

Pass C v3 makes the Part 1, Pass A, and Pass B work audible through the real hybrid APU controller.

The original six-phase energy model is preserved. No Pass B phase value, state transition table, mix value, ducking depth, wobble value, or ornament definition has been rewritten.

## Review order

1. Read `system-symphony-pass-c-v3-architecture.md`.
2. Inspect the controller and HTML diff produced by the dry-run.
3. Inspect the engine diff against the guarded PR #128 baseline.
4. Review `apu-chip-voice-adapter.js` and `apu-mix-wiring.js` for graph ownership.
5. Review `apu-performance-conductor.js`, `apu-service-voice-conductor.js`, and `apu-replay-song.js` for musical and evidence ownership.
6. Run the focused validation before committing anything.

## Completion matrix

| Contract | Pass C v3 result |
|---|---|
| Pulse, staircase triangle, and VRC6 chip waves | Audible through public raw Web Audio voices |
| State scale quantizer | Used by performed service motifs |
| DAC colour and soft clipper | In the master path before the existing limiter |
| Shaped drum kit | Replaces the previous percussion voices |
| Drum state changes | Applied at scene commit boundaries |
| Service motif degree | Alters the performed note |
| Service motif rhythm | Suppresses inactive motif slots |
| Service register and tonic | Applied and quantized against the arrangement |
| Preferred service layer | Selects a matching service-pool colour |
| Recovery motif | Selected by the recovery performance phase |
| Silence budget | Deterministically omits events |
| Density | Changes event activity and velocity |
| 4, 8, and 16-bar ornaments | Scheduled as real absolute-time voice events |
| Seven bus gains | Applied |
| Seven high-cuts | Applied |
| Width targets | Translated through one spatial owner per category |
| Six ducking rules | Active through shared target gains |
| Chip wobble | Applied to the master low-pass |
| Transient softening | Applied through the shelf and resolved compressor |
| Replay order and duration | Preserved from evidence and advanced in bars |
| Replay musical control | Movement state and phase drive the score |
| Hybrid browser activation | Controller imports v3 and exposes its build ID |
| Authentic drum mode | Available as a constructor mode; polished remains the approved default |

## Listening checks after branch preview

### Healthy and intro

- The first phrases should leave noticeable space.
- Pulse lead and staircase bass should sound chip-derived rather than sample-backed.
- Delay remains audible on primary and secondary material.
- Reverb remains audible on pad and accent material.

### Warning and pressure

- Event activity should rise without every layer becoming continuously loud.
- The mix should narrow and darken in a controlled way.
- Service identities should retain their recognisable contour while shifting into warning mutation.

### Critical and rupture

- The kick should duck both bass and pad.
- The primary should duck pad and services.
- Drum and service activity should independently clear the accent path.
- Critical service fragments must remain audible on their active motif slots.
- The limiter should remain the final safety ceiling.

### Recovery

- Recovery should use the resolving service mutation even when the estate state has returned to healthy or warning.
- Phrase energy should release rather than jump immediately back to full groove.

### Unknown and afterglow

- Event activity should become sparse.
- The mix should open without representing missing evidence as healthy.
- Telemetry hum and suspended material should remain controlled.

### Replay

Use the browser API only with a known fixture:

```js
window.__ATLAS_APU__.setReplayIncident({
  id: "review-fixture",
  sourceLabel: "review-fixture",
  stateSpans: [
    { state: "healthy", durationMs: 12000 },
    { state: "warning", durationMs: 12000 },
    { state: "critical", durationMs: 12000 },
    { state: "healthy", durationMs: 12000 }
  ]
});
```

Confirm that diagnostics advance one replay bar at each bar boundary and that movement state and phase are audible. Clear the fixture with `setReplayIncident(null)`.

## Validation boundary

Local tests prove module linking, graph construction against a routing recorder, native PeriodicWave installation, callback execution, bar-based replay progress, absolute-time cue scheduling, and idempotent disposal.

Only a real branch preview can prove audible balance, browser Web Audio behaviour, Chromium/Firefox parity, and Cloudflare Pages delivery. Do not merge until those checks pass on the numbered preview.
