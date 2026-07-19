/**
 * Hybrid sample runtime for System SYMPHONY.
 *
 * Tone.js construction and playback stay isolated here. Assets load in tiers
 * and fail independently, while sample selection remains pure in samples.js.
 */

import {
  ASSET_TIERS,
  ATMOSPHERE_LOOPS,
  BASS_LOOPS,
  BASS_SAMPLES,
  DRUM_SAMPLES,
  LEAD_LOOPS,
  allSampleAssets,
  leadSliceForStep,
  resolveSamplePalette,
  sampleIdForEvent,
  sectionForPhrase,
} from "./samples.js?v=20260718-system-symphony-ghost-circuit";
import { createAssetLoader } from "./asset-loader.js?v=20260718-system-symphony-ghost-circuit";
import {
  arrangementPhaseForPhrase,
  ghostLayerMixProfile,
} from "./ghost-circuit.js?v=20260718-system-symphony-ghost-mix";

const PLAYBACK_RATE_MIN = 0.75;
const PLAYBACK_RATE_MAX = 1.35;
const ATMOSPHERE_XFADE_SECONDS = 4;

const STATE_MIX = Object.freeze({
  healthy: Object.freeze({ drums: 0.74, bass: 0.68, bassLoop: 0.42, bassFilterHz: 760, lead: 0.66, atmosphere: 0.23, atmosphereFilterHz: 2200, drive: 0.025, room: 0.07, delay: 0.14 }),
  warning: Object.freeze({ drums: 0.8, bass: 0.7, bassLoop: 0.36, bassFilterHz: 920, lead: 0.32, atmosphere: 0.14, atmosphereFilterHz: 1050, drive: 0.05, room: 0.05, delay: 0.1 }),
  critical: Object.freeze({ drums: 0.84, bass: 0.74, bassLoop: 0.4, bassFilterHz: 1080, lead: 0, atmosphere: 0.1, atmosphereFilterHz: 900, drive: 0.08, room: 0.03, delay: 0.07 }),
  unknown: Object.freeze({ drums: 0.32, bass: 0.38, bassLoop: 0, bassFilterHz: 640, lead: 0.22, atmosphere: 0, atmosphereFilterHz: 800, drive: 0.02, room: 0.16, delay: 0.2 }),
});

function safeRamp(parameter, value, seconds, scheduledTime = undefined) {
  if (!parameter || !Number.isFinite(value)) return;
  const duration = Math.max(0.01, seconds);
  if (
    Number.isFinite(scheduledTime)
    && typeof parameter.setValueAtTime === "function"
    && typeof parameter.linearRampToValueAtTime === "function"
  ) {
    parameter.setValueAtTime(parameter.value, scheduledTime);
    parameter.linearRampToValueAtTime(value, scheduledTime + duration);
  } else if (typeof parameter.rampTo === "function") {
    parameter.rampTo(value, duration);
  } else {
    parameter.value = value;
  }
}

function gainToDb(gain) {
  return gain > 0 ? 20 * Math.log10(gain) : -96;
}

function setVolume(node, gain, baseDb = 0) {
  if (!node?.volume) return;
  const value = baseDb + gainToDb(Math.max(0.001, gain));
  node.volume.value = value;
}

function normalizedState(scoreState) {
  return STATE_MIX[scoreState] ? scoreState : "unknown";
}

function clampPlaybackRate(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, value));
}

function setDetune(voice, cents) {
  if (!voice) return;
  if (voice.detune?.value !== undefined) voice.detune.value = cents;
  else voice.detune = cents;
}

export function createHybridSampler(Tone, {
  output,
  reverbInput = null,
  delayInput = null,
  onLoadProgress = null,
} = {}) {
  let ready = false;
  let disposed = false;
  let currentPalette = null;
  let leadVoiceCursor = 0;
  let bassLoopVoiceCursor = 0;
  let activeAtmosphereId = null;
  let backgroundLoadPromise = null;
  let loadStage = "idle";
  const atmosphereStopTimers = new Map();
  const totalAssets = allSampleAssets().length;

  function loadStats() {
    const stats = loader.stats();
    return Object.freeze({
      ...stats,
      totalAssets,
      stage: loadStage,
      coreReady: ready,
      backgroundComplete: stats.completed === totalAssets,
    });
  }

  function emitLoadProgress() {
    if (typeof onLoadProgress === "function") onLoadProgress(loadStats());
  }

  const loader = createAssetLoader(Tone, { onProgress: emitLoadProgress });

  const drumBus = new Tone.Gain(0).connect(output);
  const bassInput = new Tone.Gain(1);
  const bassFilter = new Tone.Filter({
    type: "lowpass",
    frequency: STATE_MIX.unknown.bassFilterHz,
    Q: 0.8,
    rolloff: -24,
  });
  const bassBus = new Tone.Gain(0).connect(output);
  const bassLoopBus = new Tone.Gain(0).connect(bassInput);
  const bassDriveSend = new Tone.Gain(0);
  const bassDrive = new Tone.Distortion({
    distortion: 0.22,
    oversample: "2x",
    wet: 1,
  }).connect(output);
  bassInput.connect(bassFilter);
  bassFilter.connect(bassBus);
  bassFilter.connect(bassDriveSend);
  bassDriveSend.connect(bassDrive);

  const leadBus = new Tone.Gain(0).connect(output);
  const atmosphereBus = new Tone.Gain(0).connect(output);
  const atmosphereFilter = new Tone.Filter({
    type: "lowpass",
    frequency: STATE_MIX.unknown.atmosphereFilterHz,
    Q: 0.7,
  }).connect(atmosphereBus);
  const fxBus = new Tone.Gain(0.42).connect(output);
  const roomSend = new Tone.Gain(0);
  const leadDelaySend = new Tone.Gain(0);
  if (reverbInput) {
    drumBus.connect(roomSend);
    atmosphereBus.connect(roomSend);
    fxBus.connect(roomSend);
    roomSend.connect(reverbInput);
  }
  if (delayInput) {
    leadBus.connect(leadDelaySend);
    leadDelaySend.connect(delayInput);
  }

  const drumPlayers = new Map();
  const bassSamplers = new Map();
  const leadVoices = new Map();
  const bassLoopVoices = new Map();
  const atmospherePlayers = new Map();

  function ensureDrumPlayer(id) {
    if (drumPlayers.has(id)) return drumPlayers.get(id);
    const buffer = loader.get(id);
    const sample = DRUM_SAMPLES[id];
    if (!buffer || !sample) return null;
    const player = new Tone.Player({
      volume: sample.gainDb,
      fadeIn: 0.002,
      fadeOut: 0.015,
    });
    player.buffer = buffer;
    player.connect(drumBus);
    drumPlayers.set(id, player);
    return player;
  }

  function ensureBassSampler(id) {
    if (bassSamplers.has(id)) return bassSamplers.get(id);
    const buffer = loader.get(id);
    const sample = BASS_SAMPLES[id];
    if (!buffer || !sample) return null;
    const sampler = new Tone.Sampler({
      urls: { [sample.rootNote]: buffer.get() },
      attack: 0.002,
      release: 0.16,
      volume: sample.gainDb,
    }).connect(bassInput);
    bassSamplers.set(id, sampler);
    return sampler;
  }

  function ensureLeadVoices(id) {
    if (leadVoices.has(id)) return leadVoices.get(id);
    const buffer = loader.get(id);
    const sample = LEAD_LOOPS[id];
    if (!buffer || !sample) return null;
    const voices = Array.from({ length: 4 }, () => {
      const voice = new Tone.GrainPlayer({
        grainSize: sample.grainSize ?? 0.14,
        overlap: sample.grainOverlap ?? 0.07,
        loop: false,
        volume: sample.gainDb,
      });
      voice.buffer = buffer;
      voice.connect(leadBus);
      return voice;
    });
    leadVoices.set(id, voices);
    return voices;
  }

  function ensureBassLoopVoices(id) {
    if (bassLoopVoices.has(id)) return bassLoopVoices.get(id);
    const buffer = loader.get(id);
    const sample = BASS_LOOPS[id];
    if (!buffer || !sample) return null;
    const voices = Array.from({ length: 2 }, () => {
      const voice = new Tone.GrainPlayer({
        grainSize: 0.12,
        overlap: 0.06,
        loop: false,
        fadeIn: 0.008,
        fadeOut: 0.025,
        volume: sample.gainDb,
      });
      voice.buffer = buffer;
      voice.connect(bassLoopBus);
      return voice;
    });
    bassLoopVoices.set(id, voices);
    return voices;
  }

  function ensureAtmosphere(id) {
    if (atmospherePlayers.has(id)) return atmospherePlayers.get(id);
    const buffer = loader.get(id);
    const sample = ATMOSPHERE_LOOPS[id];
    if (!buffer || !sample) return null;
    const gain = new Tone.Gain(0).connect(atmosphereFilter);
    const player = new Tone.GrainPlayer({
      grainSize: 0.4,
      overlap: 0.2,
      loop: true,
      volume: sample.gainDb,
    });
    player.buffer = buffer;
    player.connect(gain);
    const entry = { player, gain, sample, isPlaying: false };
    atmospherePlayers.set(id, entry);
    return entry;
  }

  function stopAtmosphere(
    id,
    fadeSeconds = ATMOSPHERE_XFADE_SECONDS,
    scheduledTime = undefined,
  ) {
    const entry = atmospherePlayers.get(id);
    if (!entry?.isPlaying) return;
    safeRamp(entry.gain.gain, 0, fadeSeconds, scheduledTime);
    const priorTimer = atmosphereStopTimers.get(id);
    if (priorTimer !== undefined) globalThis.clearTimeout(priorTimer);
    const timer = globalThis.setTimeout(() => {
      try {
        entry.player.stop();
      } catch (error) {
        console.warn(`system-symphony: atmosphere ${id} stop failed`, error);
      }
      entry.isPlaying = false;
      atmosphereStopTimers.delete(id);
    }, (fadeSeconds + 0.1) * 1000);
    atmosphereStopTimers.set(id, timer);
  }

  function startAtmosphere(id, frame, scheduledTime = undefined) {
    const entry = ensureAtmosphere(id);
    if (!entry) return false;
    const pendingStop = atmosphereStopTimers.get(id);
    if (pendingStop !== undefined) {
      globalThis.clearTimeout(pendingStop);
      atmosphereStopTimers.delete(id);
    }
    if (!entry.isPlaying) {
      try {
        entry.player.start(scheduledTime, 0);
        entry.isPlaying = true;
      } catch (error) {
        console.warn(`system-symphony: atmosphere ${id} could not start`, error);
        return false;
      }
    }
    entry.player.playbackRate = clampPlaybackRate(
      (frame?.bpm ?? entry.sample.bpm) / entry.sample.bpm,
    );
    setDetune(entry.player, entry.sample.transposeCents);
    safeRamp(entry.gain.gain, 1, ATMOSPHERE_XFADE_SECONDS, scheduledTime);
    return true;
  }

  function applyScene(
    frame,
    performance = null,
    phraseIndex = 0,
    transition = 0.5,
    scheduledTime = undefined,
    ghostOptions = {},
    { ghostMixOnly = false } = {},
  ) {
    const state = normalizedState(frame?.scoreState);
    const mix = STATE_MIX[state];
    const phaseMix = performance
      ? arrangementPhaseForPhrase(state, phraseIndex, performance).mix
      : { drums: 1, bass: 1, pad: 1, arp: 1, riff: 0 };
    const ghostMix = ghostLayerMixProfile(ghostOptions);
    const ghostModeActive = Boolean(ghostOptions.focus || ghostOptions.audition);
    const leadMultiplier = performance && (phaseMix.riff > 0 || ghostModeActive)
      ? ghostMix.lead
      : 1;
    const ramp = (parameter, value) => (
      safeRamp(parameter, value, transition, scheduledTime)
    );
    if (!ghostMixOnly) {
      currentPalette = resolveSamplePalette(state, performance, phraseIndex);
    }
    const energy = performance?.energy ?? 0.55;
    const space = performance?.space ?? 0.5;
    ramp(
      drumBus.gain,
      mix.drums
        * (0.78 + energy * 0.32)
        * phaseMix.drums
        * ghostMix.backing,
    );
    ramp(
      bassBus.gain,
      mix.bass * (0.8 + energy * 0.24) * phaseMix.bass * ghostMix.backing,
    );
    ramp(
      bassLoopBus.gain,
      mix.bassLoop
        * (0.76 + energy * 0.3)
        * phaseMix.bass
        * ghostMix.backing,
    );
    if (!ghostMixOnly) ramp(bassFilter.frequency, mix.bassFilterHz);
    ramp(
      leadBus.gain,
      mix.lead
        * (0.76 + (performance?.motion ?? 0.5) * 0.28)
        * phaseMix.arp
        * leadMultiplier,
    );
    ramp(
      atmosphereBus.gain,
      mix.atmosphere
        * (0.72 + space * 0.42)
        * phaseMix.pad
        * ghostMix.pad,
    );
    if (!ghostMixOnly) {
      ramp(atmosphereFilter.frequency, mix.atmosphereFilterHz);
      ramp(bassDriveSend.gain, mix.drive * (0.7 + (performance?.grit ?? 0.45) * 0.6));
      ramp(roomSend.gain, mix.room * (0.7 + space * 0.5));
      ramp(leadDelaySend.gain, mix.delay * (0.8 + space * 0.35));
    }
    if (ghostMixOnly) return currentPalette;
    if (!ready) return currentPalette;
    const desiredAtmosphere = currentPalette.atmosphere;
    if (desiredAtmosphere !== activeAtmosphereId) {
      if (activeAtmosphereId) {
        stopAtmosphere(activeAtmosphereId, ATMOSPHERE_XFADE_SECONDS, scheduledTime);
      }
      activeAtmosphereId = startAtmosphere(desiredAtmosphere, frame, scheduledTime)
        ? desiredAtmosphere
        : null;
    } else if (desiredAtmosphere) {
      startAtmosphere(desiredAtmosphere, frame, scheduledTime);
    }
    return currentPalette;
  }

  function playDrums(time, frame, step, phraseIndex, events, performance = null) {
    const handled = { kick: false, snare: false, hat: false, metal: false };
    if (!ready || !events) return handled;
    const state = normalizedState(frame?.scoreState);
    for (const [kind, event] of Object.entries(events)) {
      if (!event) continue;
      const id = sampleIdForEvent(kind, state, step, phraseIndex, performance);
      const sample = DRUM_SAMPLES[id];
      if (!id || !sample) continue;
      const player = ensureDrumPlayer(id);
      if (!player) continue;
      setVolume(player, event.velocity ?? 0.5, sample.gainDb);
      try {
        player.start(time);
        handled[kind] = true;
      } catch (error) {
        console.warn(`system-symphony: ${id} could not trigger`, error);
      }
    }
    return handled;
  }

  function playBass(time, frame, event, phraseIndex, performance = null) {
    if (!ready || !event) return false;
    if (currentPalette?.bassLoop && loader.has(currentPalette.bassLoop)) return true;
    const state = normalizedState(frame?.scoreState);
    const id = sampleIdForEvent("bass", state, event.step ?? 0, phraseIndex, performance);
    const sampler = ensureBassSampler(id);
    if (!sampler) return false;
    sampler.triggerAttackRelease(
      event.frequency,
      event.duration,
      time,
      Math.min(0.82, event.velocity ?? 0.5),
    );
    return true;
  }

  function playBassPhrase(time, frame, step, phraseIndex, performance = null) {
    if (!ready || !performance || step % 8 !== 0) return false;
    const palette = resolveSamplePalette(frame?.scoreState, performance, phraseIndex);
    const sample = BASS_LOOPS[palette.bassLoop];
    const voices = ensureBassLoopVoices(palette.bassLoop);
    if (!sample || !voices?.length) return false;
    const targetBpm = performance.targetBpm ?? frame?.bpm ?? sample.bpm;
    const sourceMeasures = Math.max(1, Math.floor(sample.playableBeats / 4));
    const measureIndex = phraseIndex * 4 + Math.floor(step / 8);
    const sourceMeasure = (
      measureIndex + (performance.bassLoopSliceVariant ?? 0)
    ) % sourceMeasures;
    const sourceOffset = sourceMeasure * 4 * 60 / sample.bpm;
    const outputDuration = 4 * 60 / targetBpm;
    const voice = voices[bassLoopVoiceCursor % voices.length];
    bassLoopVoiceCursor += 1;
    voice.playbackRate = clampPlaybackRate(targetBpm / sample.bpm);
    setDetune(voice, sample.transposeCents);
    setVolume(voice, 0.46 + (performance.energy ?? 0.5) * 0.18, sample.gainDb);
    try {
      voice.start(time, sourceOffset, Math.max(0.5, outputDuration));
      return true;
    } catch (error) {
      console.warn(`system-symphony: bass loop ${sample.id} could not trigger`, error);
      return false;
    }
  }

  function playLead(time, frame, step, phraseIndex, performance = null) {
    if (!ready) return false;
    const event = leadSliceForStep(frame?.scoreState, step, phraseIndex, performance);
    if (!event) return false;
    const palette = resolveSamplePalette(frame?.scoreState, performance, phraseIndex);
    const sample = LEAD_LOOPS[palette.lead];
    const voices = ensureLeadVoices(palette.lead);
    if (!sample || !voices?.length) return false;
    const voice = voices[leadVoiceCursor % voices.length];
    leadVoiceCursor += 1;
    voice.playbackRate = clampPlaybackRate(
      (performance?.targetBpm ?? frame?.bpm ?? sample.bpm) / sample.bpm,
    );
    setDetune(voice, sample.transposeCents);
    voice.reverse = frame?.scoreState === "unknown" && event.section === "space";
    setVolume(voice, event.velocity, sample.gainDb);
    const wrappedSourceBeat = event.sourceBeat % sample.playableBeats;
    const sourceOffset = Math.min(
      sample.playableEndSeconds - 0.5,
      wrappedSourceBeat * 60 / sample.bpm,
    );
    const outputDuration = event.durationBeats * 60 / (performance?.targetBpm ?? frame?.bpm ?? sample.bpm);
    try {
      voice.start(time, sourceOffset, Math.max(0.12, outputDuration));
      return true;
    } catch (error) {
      console.warn(`system-symphony: lead ${sample.id} could not trigger`, error);
      return false;
    }
  }

  function playSectionAccent(time, frame, phraseIndex, performance = null) {
    if (!ready || phraseIndex <= 0) return false;
    const section = sectionForPhrase(frame?.scoreState, phraseIndex, performance);
    const wantsCrash = section === "lift" || section === "redline" || section === "return";
    const player = wantsCrash ? ensureDrumPlayer("crash-crisp") : null;
    if (!player) return false;
    const sample = DRUM_SAMPLES["crash-crisp"];
    setVolume(player, frame?.scoreState === "critical" ? 0.72 : 0.52, sample.gainDb);
    try {
      player.start(time);
      return true;
    } catch (error) {
      console.warn("system-symphony: crash could not trigger", error);
      return false;
    }
  }

  function playAccent(id, time, velocity = 0.6) {
    if (!ready) return false;
    const player = ensureDrumPlayer(id);
    const sample = DRUM_SAMPLES[id];
    if (!player || !sample) return false;
    setVolume(player, velocity, sample.gainDb);
    try {
      player.start(time);
      return true;
    } catch (error) {
      console.warn(`system-symphony: accent ${id} could not trigger`, error);
      return false;
    }
  }

  async function load() {
    if (disposed) return false;
    loadStage = "core";
    const tier1 = await loader.loadTier(ASSET_TIERS.tier1);
    if (disposed) {
      loader.disposeAll();
      return false;
    }
    if (tier1.loaded === 0) {
      console.warn("system-symphony: tier 1 loaded zero assets; procedural fallback only");
      return false;
    }
    ready = true;
    loadStage = "background";
    emitLoadProgress();
    backgroundLoadPromise = (async () => {
      try {
        await loader.loadTier(ASSET_TIERS.tier2);
        if (!disposed) await loader.loadTier(ASSET_TIERS.tier3);
      } catch (error) {
        console.warn("system-symphony: background tier load raised", error);
      } finally {
        loadStage = disposed ? "disposed" : "complete";
        if (disposed) loader.disposeAll();
        else emitLoadProgress();
      }
    })();
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    loadStage = "disposed";
    backgroundLoadPromise = null;
    for (const timer of atmosphereStopTimers.values()) {
      globalThis.clearTimeout(timer);
    }
    atmosphereStopTimers.clear();
    for (const { player } of atmospherePlayers.values()) {
      try {
        player.stop();
      } catch (error) {
        // A never-started player does not need stopping.
      }
    }
    for (const node of [
      ...drumPlayers.values(),
      ...bassSamplers.values(),
      ...[...bassLoopVoices.values()].flat(),
      ...[...leadVoices.values()].flat(),
      ...[...atmospherePlayers.values()].flatMap(({ player, gain }) => [player, gain]),
      leadDelaySend,
      roomSend,
      fxBus,
      atmosphereBus,
      atmosphereFilter,
      leadBus,
      bassDrive,
      bassDriveSend,
      bassBus,
      bassLoopBus,
      bassFilter,
      bassInput,
      drumBus,
    ]) node?.dispose?.();
    loader.disposeAll();
  }

  return {
    load,
    applyScene,
    playDrums,
    playBass,
    playBassPhrase,
    playLead,
    playSectionAccent,
    playAccent,
    isReady: () => ready,
    isSampleAvailable: (id) => loader.has(id),
    getPalette: () => currentPalette,
    loadStats,
    waitForBackgroundLoad: () => backgroundLoadPromise ?? Promise.resolve(),
    dispose,
  };
}
