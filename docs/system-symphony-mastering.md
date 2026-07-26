# System Symphony Atlas APU Mastering Contract

## Scope

This document defines the preview mastering pass layered on top of the sample-free Atlas APU arrangement, state identities and monitoring-only loudness meter.

The pass changes programme gain and the initial listening control. It does not change melody, harmony, rhythm, state-transition timing, telemetry evidence, the six-role APU architecture or the production System Symphony route.

## Programme calibration

| State | Base gain | Programme trim | Effective master | Integrated target | Tolerance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Healthy / Explorer | -10 dB | +14 dB | +4 dB | -22 LUFS | ±4 dB |
| Warning / Grid Pressure | -10.5 dB | +14.5 dB | +4 dB | -21 LUFS | ±4 dB |
| Critical / Boss Protocol | -11 dB | +15 dB | +4 dB | -19 LUFS | ±4 dB |
| Unknown / Lost Signal | -18 dB | +13 dB | -5 dB | -27 LUFS | ±5 dB |

The second calibration adds 6 dB to the first preview policy. It is derived from the real Chromium evidence run, where the mixed state sequence measured -29.5 LUFS integrated and -12.5 dBTP estimated session peak. The available peak headroom supports the correction while retaining a meaningful safety margin.

The target windows are engineering acceptance ranges for this deterministic browser soundtrack. They are not broadcast delivery specifications.

## Adaptive deployment calibration

Cloudflare preview assets can temporarily serve an older dependency URL while the top-level page is already current. The mastering runtime therefore compares the arrangement's loaded upstream gain with the current policy target and applies only the missing difference at the isolated preview destination.

- an older Healthy upstream gain of -2 dB receives +6 dB and reaches the +4 dB target;
- a current Healthy upstream gain of +4 dB receives 0 dB additional trim;
- the same difference calculation applies to every state;
- the correction is bounded to ±18 dB;
- the browser smoke verifies `upstream + applied trim = policy target`;
- the runtime restores the previous destination level during page disposal.

This compatibility layer prevents a stale dependency from changing the audible master. It does not alter the production route.

## Output guardrails

- The upstream Tone.js limiter ceiling remains -1 dB.
- The browser meter measures the final destination after adaptive calibration.
- The browser meter must report an estimated session true peak no higher than -0.8 dBTP.
- The true-peak result remains labelled `4x-cubic-estimate`; it is not represented as certified Annex 2 measurement.
- The default user listening control is 70%.
- Loudness values displayed in the preview are normalised above the user control, so changing the slider does not redefine the programme target.
- Unknown remains intentionally quieter than the three measured operational states.

## Evidence contract

The isolated preview smoke must prove:

- the 70% initial control is applied to both the UI and engine;
- the mastering runtime loads policy v2 and reaches the state target regardless of upstream cache state;
- integrated programme loudness is finite and above the previous conservative floor;
- the estimated session true peak remains within the guard;
- Critical `hard-choke`, Unknown `one-bar-decay` and Healthy `crossfade` still occur at bar boundaries;
- transport reaches Theme B without channel, page or console failures;
- no streamed or decoded audio assets are requested.

## Release boundary

This mastering pass remains a stacked draft. Production cutover, legacy sample removal and live deployment are separate reviewed operations.
