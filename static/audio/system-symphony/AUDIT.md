# System SYMPHONY source-library audit

Audit date: 2026-07-16

The complete owner-provided folder was re-inventoried after its replacement. It contains 41 stereo 44.1 kHz WAV files, has no exact duplicate audio files, and is sufficient for the current hybrid instrument. Thirty-eight sources are selected for delivery; three are intentionally excluded. Source files remain unchanged.

## Selection rules

- Prefer distinct transients, bass envelopes and tonal identities over using every file.
- Keep tonal sampled leads behind explicit state-compatibility declarations after declared transposition.
- Allow only the background-saws and wobbly-synth palettes in Warning; Critical melodic content remains procedural.
- Keep Ghost predominantly procedural, with a sparse low-volume Geneticist grain as the only compatible sampled lead option.
- Trigger rhythmic sources as four-beat, bar-quantised fragments. No rhythmic WAV free-runs against the Tone.js transport.
- Preserve the procedural score as the bounded fallback if any browser decode fails.

## Complete source decision record

| Source file | Decision | Delivery role or reason |
| --- | --- | --- |
| `100_Dm_BackgrndSawsSynth_849.wav` | Select | Healthy granular synth, native D minor, 100 BPM |
| `100_Em_FutureSynth_01_849.wav` | Select | Healthy granular synth, E minor shifted to D minor, 100 BPM |
| `100_F_NeoTokyoBass_849.wav` | Select | Healthy/Warning bar-sliced bass; F material is compatible with the selected palettes |
| `100_F_WobbleArpBass_01_849.wav` | Exclude | Strongest similarity pair in the folder and restores the unwanted dubstep character |
| `100_F_WobbleArpBass_02_849.wav` | Exclude | Near-duplicate role and timbre of Wobble Arp Bass 01 |
| `100_Fm_AcidSynth_849.wav` | Select | Healthy granular synth, F minor shifted to D minor, 100 BPM |
| `100_Fm_EvilBass_02_849.wav` | Select | Healthy bar-sliced bass, F minor shifted to D minor, 100 BPM |
| `100_Fm_SequencedBass_849.wav` | Select | Healthy bar-sliced bass, F minor shifted to D minor, 100 BPM |
| `100_Gm_SirenFx_849.wav` | Exclude | 19.2-second modal siren is intrusive, large and redundant with generated tension effects |
| `104_D#m_WobblySynth_849.wav` | Select | Healthy granular synth, D-sharp minor shifted to D minor, 104 BPM |
| `105_F_DistortedGuitarBass_849.wav` | Select | Critical bar-sliced root/fifth drive, shifted toward D, 105 BPM |
| `AggresiveClapSnare_849.wav` | Select | Critical snare option |
| `AggresiveHat_849.wav` | Select | Critical hat option |
| `AggresiveKick_849.wav` | Select | Critical kick option |
| `Am_TransformerBass_849.wav` | Select | Long bass one-shot; measured fundamental is A0, correcting the prior A1 mapping |
| `BrightClapSnare_849.wav` | Select | Healthy/Warning snare option |
| `ClassicHat_849.wav` | Select | General closed-hat option |
| `ClipClapSnare_849.wav` | Select | Warning/Critical snare option |
| `CrispCrash_849.wav` | Select | Bounded section-transition accent |
| `CrispyKick_849.wav` | Select | General kick option |
| `Cymatics - AC Unit Hit 1.wav` | Select | Industrial percussion colour |
| `Cymatics - AC Unit Hit 3.wav` | Select | Industrial percussion colour |
| `Cymatics - AC Unit Hit 6.wav` | Select | Industrial percussion colour |
| `Cymatics - BASS Burial - C.wav` | Select | Long clean C1 bass one-shot |
| `Cymatics - BASS Deep - C.wav` | Select | Short clean C1 bass one-shot |
| `Cymatics - BASS Doom - C.wav` | Select | Long dark C1 bass one-shot |
| `Cymatics - Geneticist - 96 BPM E Min Distorted Lead.wav` | Select | Healthy granular lead, shifted from E minor to D minor |
| `Cymatics - Motherboard Pt 2 - 106 BPM D# Min Atmosphere.wav` | Select | Filtered atmosphere, shifted toward D |
| `Cymatics - Nanotech Pt 2 - 105 BPM G Min Ambience.wav` | Select | Dark filtered atmosphere, shifted toward D |
| `Cymatics - New Punks - 100 BPM C Min Atmosphere.wav` | Select | Driving filtered atmosphere, shifted toward D |
| `Cymatics - No Alternative - 100 BPM E Min Distorted Lead.wav` | Select | Healthy granular lead, shifted from E minor to D minor |
| `Fm_AngryArpBass_849.wav` | Select | D1-centred aggressive bass one-shot |
| `Fm_PercussiveBass_849.wav` | Select | D-sharp1-centred percussive bass one-shot |
| `GoodLayerHat_849.wav` | Select | Quiet layered-hat option |
| `HardHat_02_849.wav` | Select | Warning/Critical hard-hat option |
| `PunchierKick_849.wav` | Select | Healthy/Warning punch kick option |
| `RegularClapSnare_849.wav` | Select | General snare option |
| `StickPercussion_849.wav` | Select | Dry industrial stick accent |
| `SubltleKick_849.wav` | Select | Ghost/Healthy restrained kick option |
| `SubtleHat_849.wav` | Select | Ghost/Healthy restrained hat option |
| `X_FuturisticTapestop_849.wav` | Select | Explicit user/action transition effect only |

## Technical findings applied

- All selected delivery files are 44.1 kHz stereo signed 16-bit PCM WAVs.
- The two Wobble Arp Bass files had by far the strongest waveform similarity in the folder, so retaining both would reduce rather than increase seeded variety.
- Transformer Bass was previously declared as A1 even though its measured fundamental is approximately 27.5 Hz (A0). The manifest and delivery filename now use A0.
- Burial, Deep and Doom resolve around 32.7 Hz (C1), providing cleaner substitutes for the removed Mothership-style bass material.
- Eight-beat lead sources wrap their deterministic source-beat selector instead of seeking beyond the end of the buffer.
- Every rhythmic bass fragment is selected and restarted on a measure boundary, tempo-scaled within a bounded range and double-buffered so adjacent measures do not reuse an active voice.
- Browser delivery now prefers Opus with AAC and WAV fallbacks. Core rhythm assets load first; later tiers fail independently.
- Burial trims 0.018 seconds of leading noise. Geneticist ends at 18.160 seconds. Motherboard, Nanotech and New Punks use the reviewed tail trims from the H1-H8 build.
- Only the selected atmosphere is started; state changes crossfade and stop the prior player instead of idling all three loops.
