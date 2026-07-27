# System SYMPHONY - Pass A listener notes

Pass A, Part 2 of the composed-audio programme adds two unwired modules on top of the chip foundation in PR #128: a shaped drum kit and deterministic service leitmotifs.

Nothing in this part changes current browser audio. The modules are reviewed and validated now, then connected to the engine in Pass C after the performance and mix directors are present on the same branch.

## Drum sculptor

Once wired, the drum sculptor will:

- replace the generic white-noise hats with shaped short-period LFSR ticks
- combine long-period LFSR noise with a pitched triangle body for the snare
- use bounded linear attack floors to avoid front-edge clicks
- vary LFSR start offsets deterministically between consecutive hits
- curve velocity so ghost notes remain quiet and mid-range hits stop dominating
- expose distinct healthy, warning, critical, and unknown kits
- retain `polished` and `authentic` playback modes

The kick accepts both the compact three-argument trigger used by the raw voices and the current Tone.MembraneSynth four-argument trigger used by `apu-track-engine-v3.js`.

## Service leitmotifs

Once wired, the leitmotif system will:

- assign every service a stable four-note melodic cell
- assign a deterministic register, rhythm shape, and preferred APU layer
- preserve the service identity across healthy, warning, critical, unknown, and recovery states
- raise interior notes under warning
- fracture the motif under critical without allowing answer-shaped rhythms to collapse into silence
- retain only the outer notes under unknown
- rise to the upper tonic under recovery
- expose provenance for the future debug interface

## Review boundary

This part does not:

- import either module into the engine
- alter `apu-track-engine-v3.js`, the sequencer, arranger, score plan, or composition director
- add audio samples or media assets
- change HTML or CSS
- change production deployment state

The current System Symphony and hybrid APU previews should therefore sound unchanged. Their purpose for this part is regression verification.

## Review commands

```bash
node --check static/js/sonify/apu-drum-sculptor.js
node --check static/js/sonify/apu-service-leitmotifs.js
node --test static/js/sonify/apu-drum-sculptor.test.js
node --test static/js/sonify/apu-service-leitmotifs.test.js
node --test static/js/sonify/*.test.js
```

The source-level controls also reject sample assets, runtime randomness, Tone.Player, Tone.Sampler, and GrainPlayer.
