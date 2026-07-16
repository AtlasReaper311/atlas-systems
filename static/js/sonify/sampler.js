/**
 * Hybrid sample runtime for System SYMPHONY.
 *
 * Tone.js construction and playback stay isolated here. Selection remains in
 * samples.js so the audible arrangement can be tested without a browser.
 */

import {
  ATMOSPHERE_LOOPS,
  BASS_LOOPS,
  BASS_SAMPLES,
  DRUM_SAMPLES,
  LEAD_LOOPS,
  leadSliceForStep,
  resolveSamplePalette,
  sampleIdForEvent,
  sectionForPhrase,
} from "./samples.js?v=20260716-system-symphony-expanded-library";

export const SAMPLE_LOAD_TIMEOUT_MS = 20000;

const STATE_MIX = Object.freeze({
  healthy: Object.freeze({ drums: 0.74, bass: 0.68, bassLoop: 0.42, bassFilterHz: 760, lead: 0.66, atmosphere: 0.23, atmosphereFilterHz: 2200, drive: 0.025, room: 0.07, delay: 0.14 }),
  warning: Object.freeze({ drums: 0.8, bass: 0.7, bassLoop: 0.36, bassFilterHz: 920, lead: 0, atmosphere: 0.14, atmosphereFilterHz: 1050, drive: 0.05, room: 0.05, delay: 0.1 }),
  critical: Object.freeze({ drums: 0.84, bass: 0.74, bassLoop: 0.4, bassFilterHz: 1080, lead: 0, atmosphere: 0.1, atmosphereFilterHz: 900, drive: 0.08, room: 0.03, delay: 0.07 }),
  unknown: Object.freeze({ drums: 0.32, bass: 0.38, bassLoop: 0, bassFilterHz: 640, lead: 0, atmosphere: 0, atmosphereFilterHz: 800, drive: 0.02, room: 0.16, delay: 0.2 }),
});

function safeRamp(parameter, value, seconds) {
  if (!parameter || !Number.isFinite(value)) return;
  if (typeof parameter.rampTo === "function") {
    parameter.rampTo(value, Math.max(0.01, seconds));
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

export async function waitForSampleLoad(
  Tone,
  timeoutMs = SAMPLE_LOAD_TIMEOUT_MS,
) {
  if (typeof Tone?.loaded !== "function") return false;
  let timeoutId;
  try {
    await Promise.race([
      Tone.loaded(),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(new Error("system-symphony: sample library timed out"));
        }, timeoutMs);
      }),
    ]);
    return true;
  } catch (error) {
    console.warn("system-symphony: sample library unavailable; using synth fallback", error);
    return false;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function createHybridSampler(Tone, {
  output,
  reverbInput = null,
  delayInput = null,
} = {}) {
  let ready = false;
  let disposed = false;
  let loopsStarted = false;
  let currentPalette = null;
  let leadVoiceCursor = 0;
  let bassLoopVoiceCursor = 0;

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

  const drumPlayers = new Map(
    Object.values(DRUM_SAMPLES).map((sample) => [
      sample.id,
      new Tone.Player({
        url: sample.url,
        volume: sample.gainDb,
        fadeIn: 0.002,
        fadeOut: 0.015,
      }).connect(drumBus),
    ]),
  );

  const bassSamplers = new Map(
    Object.values(BASS_SAMPLES).map((sample) => [
      sample.id,
      new Tone.Sampler({
        urls: { [sample.rootNote]: sample.url },
        attack: 0.002,
        release: 0.16,
        volume: sample.gainDb,
      }).connect(bassInput),
    ]),
  );

  const leadVoices = new Map(
    Object.values(LEAD_LOOPS).map((sample) => [
      sample.id,
      Array.from({ length: 4 }, () => new Tone.GrainPlayer({
        url: sample.url,
        grainSize: 0.14,
        overlap: 0.07,
        loop: false,
        volume: sample.gainDb,
      }).connect(leadBus)),
    ]),
  );

  const bassLoopVoices = new Map(
    Object.values(BASS_LOOPS).map((sample) => [
      sample.id,
      Array.from({ length: 2 }, () => new Tone.GrainPlayer({
        url: sample.url,
        grainSize: 0.12,
        overlap: 0.06,
        loop: false,
        fadeIn: 0.008,
        fadeOut: 0.025,
        volume: sample.gainDb,
      }).connect(bassLoopBus)),
    ]),
  );

  const atmospherePlayers = new Map(
    Object.values(ATMOSPHERE_LOOPS).map((sample) => {
      const gain = new Tone.Gain(0).connect(atmosphereFilter);
      const player = new Tone.GrainPlayer({
        url: sample.url,
        grainSize: 0.4,
        overlap: 0.2,
        loop: true,
        volume: sample.gainDb,
      }).connect(gain);
      return [sample.id, { player, gain, sample }];
    }),
  );

  const crash = drumPlayers.get("crash-crisp");

  function startLoops() {
    if (!ready || loopsStarted || disposed) return;
    loopsStarted = true;
    for (const { player, sample } of atmospherePlayers.values()) {
      player.playbackRate = 1;
      if (player.detune?.value !== undefined) player.detune.value = sample.transposeCents;
      else player.detune = sample.transposeCents;
      try {
        player.start(undefined, 0);
      } catch (error) {
        console.warn(`system-symphony: atmosphere ${sample.id} could not start`, error);
      }
    }
  }

  function applyScene(frame, performance = null, phraseIndex = 0, transition = 0.5) {
    const state = normalizedState(frame?.scoreState);
    const mix = STATE_MIX[state];
    currentPalette = resolveSamplePalette(state, performance, phraseIndex);
    const energy = performance?.energy ?? 0.55;
    const space = performance?.space ?? 0.5;
    safeRamp(drumBus.gain, mix.drums * (0.78 + energy * 0.32), transition);
    safeRamp(bassBus.gain, mix.bass * (0.8 + energy * 0.24), transition);
    safeRamp(bassLoopBus.gain, mix.bassLoop * (0.76 + energy * 0.3), transition);
    safeRamp(bassFilter.frequency, mix.bassFilterHz, transition);
    safeRamp(leadBus.gain, mix.lead * (0.76 + (performance?.motion ?? 0.5) * 0.28), transition);
    safeRamp(atmosphereBus.gain, mix.atmosphere * (0.72 + space * 0.42), transition);
    safeRamp(atmosphereFilter.frequency, mix.atmosphereFilterHz, transition);
    safeRamp(bassDriveSend.gain, mix.drive * (0.7 + (performance?.grit ?? 0.45) * 0.6), transition);
    safeRamp(roomSend.gain, mix.room * (0.7 + space * 0.5), transition);
    safeRamp(leadDelaySend.gain, mix.delay * (0.8 + space * 0.35), transition);
    if (ready) startLoops();
    for (const [id, { gain, player, sample }] of atmospherePlayers) {
      const selected = id === currentPalette.atmosphere;
      const target = selected ? 1 : 0;
      player.playbackRate = Math.max(0.82, Math.min(1.18, (frame?.bpm ?? sample.bpm) / sample.bpm));
      if (player.detune?.value !== undefined) player.detune.value = sample.transposeCents;
      else player.detune = sample.transposeCents;
      safeRamp(gain.gain, target, selected ? Math.max(1.2, transition) : 1.4);
    }
    return currentPalette;
  }

  function playDrums(time, frame, step, phraseIndex, events, performance = null) {
    if (!ready || !events) return false;
    const state = normalizedState(frame?.scoreState);
    for (const [kind, event] of Object.entries(events)) {
      if (!event) continue;
      const id = sampleIdForEvent(kind, state, step, phraseIndex, performance);
      const player = drumPlayers.get(id);
      const sample = DRUM_SAMPLES[id];
      if (!player || !sample) continue;
      setVolume(player, event.velocity ?? 0.5, sample.gainDb);
      try {
        player.start(time);
      } catch (error) {
        console.warn(`system-symphony: ${id} could not trigger`, error);
      }
    }
    return true;
  }

  function playBass(time, frame, event, phraseIndex, performance = null) {
    if (!ready || !event) return false;
    if (currentPalette?.bassLoop) return true;
    const state = normalizedState(frame?.scoreState);
    const id = sampleIdForEvent("bass", state, event.step ?? 0, phraseIndex, performance);
    const sampler = bassSamplers.get(id);
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
    const voices = bassLoopVoices.get(palette.bassLoop);
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
    voice.playbackRate = Math.max(0.8, Math.min(1.2, targetBpm / sample.bpm));
    if (voice.detune?.value !== undefined) voice.detune.value = sample.transposeCents;
    else voice.detune = sample.transposeCents;
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
    const voices = leadVoices.get(palette.lead);
    if (!sample || !voices?.length) return false;
    const voice = voices[leadVoiceCursor % voices.length];
    leadVoiceCursor += 1;
    voice.playbackRate = Math.max(0.8, Math.min(1.3, (performance?.targetBpm ?? frame?.bpm ?? sample.bpm) / sample.bpm));
    if (voice.detune?.value !== undefined) voice.detune.value = sample.transposeCents;
    else voice.detune = sample.transposeCents;
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
    const player = section === "lift" || section === "redline" || section === "return"
      ? crash
      : null;
    if (!player) return false;
    const sample = DRUM_SAMPLES["crash-crisp"];
    setVolume(player, frame?.scoreState === "critical" ? 0.72 : 0.52, sample.gainDb);
    player.start(time);
    return true;
  }

  function playAccent(id, time, velocity = 0.6) {
    if (!ready) return false;
    const player = drumPlayers.get(id);
    const sample = DRUM_SAMPLES[id];
    if (!player || !sample) return false;
    setVolume(player, velocity, sample.gainDb);
    player.start(time);
    return true;
  }

  return {
    async load(timeoutMs = SAMPLE_LOAD_TIMEOUT_MS) {
      if (disposed) return false;
      ready = await waitForSampleLoad(Tone, timeoutMs);
      if (ready) startLoops();
      return ready;
    },
    applyScene,
    playDrums,
    playBass,
    playBassPhrase,
    playLead,
    playSectionAccent,
    playAccent,
    isReady: () => ready,
    getPalette: () => currentPalette,
    dispose() {
      if (disposed) return;
      disposed = true;
      ready = false;
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
    },
  };
}
