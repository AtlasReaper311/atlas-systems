# System Symphony loudness measurement boundary

The state-identity renderer enforces bounded gain, compression, envelope, density, and peak policies. It does not claim standards-compliant integrated programme loudness or true-peak measurement.

A separate stacked change will add a monitoring-only AudioWorklet branch after the limiter. The audible output path will remain independent so a worklet processor failure cannot mute System Symphony.

The meter will implement the ITU-R BS.1770-5 stereo measurement structure:

- two-stage K-weighting;
- 400 ms loudness blocks with 75% overlap;
- the -70 LKFS absolute gate;
- the -10 dB relative gate;
- momentary, short-term, and integrated readings;
- oversampled true-peak estimation;
- explicit evidence labels where browser sample-rate adaptation or finite preview duration limits strict compliance claims.
