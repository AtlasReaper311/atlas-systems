<div align="center">
  <img src="https://raw.githubusercontent.com/AtlasReaper311/AtlasReaper311/main/atlas-icon-dark-256.png" width="88" alt="Atlas Systems"/>
</div>

# sonify

```
┌─────────────────────────────────────────────┐
│  ATLAS SYSTEMS // sonify                    │
│  browser audio for live estate state        │
└─────────────────────────────────────────────┘
```

![Runtime](https://img.shields.io/badge/runtime-browser_audio-f5a623?style=flat-square&labelColor=0a0a0f)
![Tests](https://img.shields.io/badge/tests-node_test-4ade80?style=flat-square&labelColor=0a0a0f)
![Audio](https://img.shields.io/badge/audio-tone.js_14.8.49-aaa9a0?style=flat-square&labelColor=0a0a0f)
![Cost](https://img.shields.io/badge/cost-%C2%A30-aaa9a0?style=flat-square&labelColor=0a0a0f)

`sonify` is the Atlas Systems browser module that turns live estate telemetry into sound. It polls `GET https://api.atlas-systems.uk/sonify`, maps each service into synth parameters, and keeps audio behind a user click so the page never autoplays.

## Architecture

```text
specular-sonify
        |
        v  GET /sonify every 10s
   poller.js
        |
        v
   mapping.js
        |
        v
   engine.js
        ^
        |
   ui.js
```

`poller.js` handles fetch cadence, exponential smoothing, incident deltas, and stale-state discipline. `mapping.js` is pure telemetry-to-parameter code with no Tone.js, DOM, or clock dependency. `engine.js` owns Tone.js, the Transport grid, voice ramps, and incident percussion. `ui.js` owns the fixed control, readout, volume slider, and start or mute behavior.

## Quickstart

Add the scripts to the page that should carry the widget. The Lab page is the intended home.

```html
<script src="/vendor/tone.min.js" defer></script>
<script type="module" src="/static/js/sonify/ui.js"></script>
```

The module self-boots on `DOMContentLoaded`. Polling starts on page load so the readout is live while muted; audio starts only after the user presses the control.

## Configuration

Tone.js is vendored at `/vendor/tone.min.js` and pinned to `tone@14.8.49`. The site CSP already allows same-origin scripts and `https://api.atlas-systems.uk` in `connect-src`, so the widget needs no extra header change while the API remains on that hostname.

## Development

```bash
node --test static/js/sonify/mapping.test.js
```

The tests cover the pure mapping layer: healthy estate, degraded estate, null handling for unknown services, and scale crossfade boundaries. Keep the musical rules in `mapping.js` testable; code that needs Tone.js belongs in `engine.js`.

## Design Notes

Notes trigger only on the Tone Transport eighth-note grid. Measurements that should move continuously, such as filter cutoff, gain, vibrato depth, master level, and sustained pitch, glide with short ramps on each poll tick.

Latency is log-scaled before it chooses a pitch degree, because the difference between 20 ms and 80 ms matters more than the difference between 380 ms and 440 ms. Health crossfades between C Lydian and C Phrygian, errors reduce velocity, and unknown services resolve to a quiet, stable default until data arrives.

`Tone.Vibrato` is not used. Each voice uses a `Tone.LFO` wired into detune instead, because the LFO can be stopped after the post-deploy window and costs nothing when expired.

## How it fits into Atlas Systems

`sonify` lives inside [`atlas-systems`](https://github.com/AtlasReaper311/atlas-systems) and consumes the frame produced by [`specular-sonify`](https://github.com/AtlasReaper311/specular-sonify). It turns the same operational state surfaced by the Lab into an ambient monitor: six curated services, one status readout, and one audio texture that changes only when the estate changes.

The transferable pattern is to keep expressive UI honest by making every perceptual change trace back to a concrete field in the data contract.

---

Part of [atlas-systems.uk](https://atlas-systems.uk)
