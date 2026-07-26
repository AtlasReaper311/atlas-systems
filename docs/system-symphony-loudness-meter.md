# System Symphony loudness measurement boundary

The state-identity renderer enforces bounded gain, compression, envelope, density, and peak policies. It does not claim standards-compliant integrated programme loudness or true-peak measurement.

This stacked change adds a monitoring-only AudioWorklet branch after the rendered soundtrack reaches the Tone.js destination. The audible output path remains independent, so a worklet processor failure cannot mute System Symphony. Readings are normalised above the user volume control and reset whenever that control changes.

The meter implements the ITU-R BS.1770-5 stereo measurement structure:

- two-stage K-weighting;
- 400 ms loudness blocks with 75% overlap;
- the -70 LKFS absolute gate;
- the -10 dB relative gate;
- momentary, short-term, and integrated readings;
- four-times cubic true-peak estimation;
- explicit evidence labels where browser sample-rate adaptation or finite preview duration limits strict compliance claims.

The published K-weighting coefficients are used directly at 48 kHz. Other browser sample rates are remapped by recovering the analogue polynomial represented by the published filters and applying the bilinear transform at the active rate. Those readings are labelled `BS.1770-5-response-remapped`, not presented as a certified meter result.

True peak is labelled `4x-cubic-estimate`. It is useful for browser-side comparative evidence, but it is not claimed as a certified Annex 2 implementation.
