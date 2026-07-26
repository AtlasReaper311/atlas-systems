# System Symphony Atlas APU Mastering Contract

## Scope

This document defines the preview mastering pass layered on top of the sample-free Atlas APU arrangement, state identities and monitoring-only loudness meter.

The pass changes programme gain and the initial listening control. It does not change melody, harmony, rhythm, state-transition timing, telemetry evidence, the six-role APU architecture or the production System Symphony route.

## Programme calibration

| State | Base gain | Programme trim | Master gain | Integrated target | Tolerance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Healthy / Explorer | -10 dB | +8 dB | -2 dB | -22 LUFS | ±4 dB |
| Warning / Grid Pressure | -10.5 dB | +8.5 dB | -2 dB | -21 LUFS | ±4 dB |
| Critical / Boss Protocol | -11 dB | +9 dB | -2 dB | -19 LUFS | ±4 dB |
| Unknown / Lost Signal | -18 dB | +7 dB | -11 dB | -27 LUFS | ±5 dB |

The target windows are engineering acceptance ranges for this deterministic browser soundtrack. They are not broadcast delivery specifications.

## Output guardrails

- Tone.js limiter ceiling remains -1 dB.
- The browser meter must report an estimated session true peak no higher than -0.8 dBTP.
- The true-peak result remains labelled `4x-cubic-estimate`; it is not represented as certified Annex 2 measurement.
- The default user listening control is 70%.
- Loudness values displayed in the preview are normalised above the user control, so changing the slider does not redefine the programme target.
- Unknown remains intentionally quieter than the three measured operational states.

## Evidence contract

The isolated preview smoke must prove:

- the 70% initial control is applied to both the UI and engine;
- Healthy uses the -2 dB mastered state gain;
- integrated programme loudness is finite and above the previous conservative floor;
- the estimated session true peak remains within the guard;
- Critical `hard-choke`, Unknown `one-bar-decay` and Healthy `crossfade` still occur at bar boundaries;
- transport reaches Theme B without channel, page or console failures;
- no streamed or decoded audio assets are requested.

## Release boundary

This mastering pass remains a stacked draft. Production cutover, legacy sample removal and live deployment are separate reviewed operations.
