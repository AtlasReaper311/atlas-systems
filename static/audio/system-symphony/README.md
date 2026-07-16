# System SYMPHONY audio assets

This directory contains the bounded browser-delivery library for System SYMPHONY:

- 4 kicks, 4 snares and 5 hi-hats;
- 4 industrial percussion hits, 1 crash and 1 tape-stop transition;
- 6 tuned bass one-shots, with per-state filtering for consistent weight;
- 6 mode-normalised lead and synth loops used as granular Healthy phrases;
- 4 rhythmic bass loops triggered as measure-quantised fragments in compatible Demo states;
- 3 atmosphere loops used as selectively crossfaded textures; Ghost uses a procedural bed.

The Atlas Systems owner confirmed that these selected assets are licensed and approved for this project. They are application assets for the System SYMPHONY instrument, not a standalone sample pack or a general redistribution library.

The source library remains in the owner's local sample collection and is not modified by this repository. Delivery copies were converted mechanically to 44.1 kHz, stereo, signed 16-bit PCM WAV for consistent browser decoding. Musical keys, original tempos, tuning offsets and per-asset gain are declared in `static/js/sonify/samples.js`. The complete source-folder decision record is in `AUDIT.md`.

Files are loaded only after the user presses Start. Every URL includes the `20260716-system-symphony-expanded-library` version token and is served with immutable caching. If the complete library does not decode within twenty seconds, System SYMPHONY keeps the procedural fallback running.
