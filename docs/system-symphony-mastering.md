# System Symphony Atlas APU Mastering Contract

## Scope

This document defines the preview mastering pass layered on top of the sample-free Atlas APU arrangement, state identities, hybrid estate state and monitoring-only loudness meter.

The pass changes programme gain and the initial listening control. It does not change melody, harmony, rhythm, state-transition timing, telemetry evidence, the six-role APU architecture or the production System Symphony route.

## Programme calibration

| State | Base gain | Programme trim | Effective master | Integrated target | Tolerance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Healthy / Explorer | -10 dB | +14 dB | +4 dB | -22 LUFS | ±4 dB |
| Warning / Grid Pressure | -10.5 dB | +14.5 dB | +4 dB | -21 LUFS | ±4 dB |
| Critical / Boss Protocol | -11 dB | +15 dB | +4 dB | -19 LUFS | ±4 dB |
| Unknown / Lost Signal | -18 dB | +22 dB | +4 dB | -27 LUFS | ±5 dB |

The initial mastering correction added 6 dB after a real Chromium evidence run measured approximately -29.5 LUFS integrated and -12.5 dBTP estimated session peak.

A later Firefox listening capture showed Unknown at approximately -36.1 LUFS and -26.8 dBTP. That result was below the Unknown acceptance window and demonstrated that sparse composition, 40% deterministic omissions, reduced percussion, filtered timbres and a further 9 dB master penalty were stacking into effective inaudibility. Mastering v3 removes the extra state-level penalty while preserving the sparse Lost Signal arrangement.

The target windows are engineering acceptance ranges for this deterministic browser soundtrack. They are not broadcast delivery specifications.

## Adaptive deployment calibration

Cloudflare preview assets can temporarily serve an older dependency URL while the top-level page is already current. The mastering runtime therefore compares the arrangement's loaded upstream gain with the current policy target and applies only the missing difference at the isolated preview destination.

- an older Healthy upstream gain of -2 dB receives +6 dB and reaches the +4 dB target;
- an older Unknown upstream gain of -5 dB receives +9 dB and reaches the +4 dB target;
- a current upstream gain of +4 dB receives 0 dB additional trim;
- the same difference calculation applies to every state;
- the correction is bounded to ±18 dB;
- browser smoke verifies `upstream + applied trim = policy target`;
- the runtime restores the previous destination level during page disposal.

This compatibility layer prevents a stale dependency from changing the audible master. It does not alter the production route.

## Output guardrails

- The upstream Tone.js limiter ceiling remains -1 dB.
- The browser meter measures the final destination after adaptive calibration.
- The browser meter must report an estimated session true peak no higher than -0.8 dBTP.
- The true-peak result remains labelled `4x-cubic-estimate`; it is not represented as certified Annex 2 measurement.
- The default user listening control is 70%.
- Loudness values displayed in the preview are normalised above the user control, so changing the slider does not redefine the programme target.
- Unknown remains perceptually sparse through composition and texture, not through an additional master-level penalty.

## Evidence contract

The isolated preview smoke must prove in Chromium and Firefox:

- the 70% initial control is applied to the interface and engine;
- the mastering runtime loads policy v3 and reaches +4 dB for every state regardless of upstream cache state;
- Healthy, Warning, Critical and Unknown each produce finite momentary, short-term and integrated loudness readings;
- Unknown remains above -34 LUFS during the bounded audition window;
- the estimated session true peak remains within the guard for every state;
- Warning `tight-crossfade`, Critical `hard-choke`, Unknown `one-bar-decay` and Healthy `crossfade` occur at bar boundaries;
- transport reaches Theme B without channel, page or console failures;
- no streamed or decoded audio assets are requested.

## Release boundary

This mastering pass remains a stacked draft. Production cutover, legacy sample removal and live deployment are separate reviewed operations.
