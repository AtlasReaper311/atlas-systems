import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_CHIP_VOICE_ADAPTER_BUILD_ID,
  chipWaveKindForDuty,
  createRawChipVoice,
  describeChipVoice,
  extractRawContext,
} from "./apu-chip-voice-adapter.js";

function fixture() {
  const connections = [];
  const oscillators = [];
  const raw = {
    currentTime: 1,
    createPeriodicWave(real, imag) { return { real, imag }; },
    createOscillator() {
      const oscillator = {
        frequency: { value: 0, setValueAtTime(value) { this.value = value; } },
        detune: { value: 0, setValueAtTime(value) { this.value = value; } },
        wave: null,
        starts: [],
        stops: [],
        setPeriodicWave(wave) { this.wave = wave; },
        connect(target) { connections.push([this, target]); },
        disconnect() {},
        start(at) { this.starts.push(at); },
        stop(at) { this.stops.push(at); },
        onended: null,
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      return {
        gain: {
          value: 1,
          events: [],
          setValueAtTime(value, at) { this.value = value; this.events.push(["set", value, at]); },
          linearRampToValueAtTime(value, at) { this.value = value; this.events.push(["linear", value, at]); },
          exponentialRampToValueAtTime(value, at) { this.value = value; this.events.push(["exp", value, at]); },
        },
        connect(target) { connections.push([this, target]); },
        disconnect() {},
      };
    },
  };
  const Tone = {
    getContext() { return { rawContext: raw }; },
    Time(value) { return { toSeconds() { return value === "8n" ? 0.3 : 0.12; } }; },
    connect(source, target) { connections.push([source, target]); },
  };
  return { Tone, raw, connections, oscillators, output: { input: {} } };
}

test("build id identifies the raw adapter", () => {
  assert.match(APU_CHIP_VOICE_ADAPTER_BUILD_ID, /v2$/);
});

test("extractRawContext uses the public Tone context wrapper", () => {
  const { Tone, raw } = fixture();
  assert.equal(extractRawContext(Tone), raw);
});

test("duty cycles map to stable pulse kinds", () => {
  assert.equal(chipWaveKindForDuty(0.125), "pulse-narrow");
  assert.equal(chipWaveKindForDuty(0.25), "pulse-hollow");
  assert.equal(chipWaveKindForDuty(0.5), "pulse-square");
});

test("raw voice installs a real PeriodicWave without Tone private fields", () => {
  const { Tone, output, oscillators } = fixture();
  const voice = createRawChipVoice(Tone, output, { waveKind: "triangle-4bit" });
  assert.equal(voice.triggerAttackRelease(110, "8n", 2, 0.5), true);
  assert.equal(oscillators.length, 1);
  assert.ok(oscillators[0].wave);
  assert.equal(oscillators[0].frequency.value, 110);
  assert.equal(describeChipVoice(voice).rawWebAudio, true);
});

test("voice bridges native output through Tone.connect", () => {
  const { Tone, output, connections } = fixture();
  const voice = createRawChipVoice(Tone, output, { waveKind: "vrc6-sawtooth" });
  voice.triggerAttackRelease(440, "16n", 2, 0.4);
  assert.ok(connections.some(([, target]) => target === output));
});

test("zero velocity schedules no oscillator", () => {
  const { Tone, output, oscillators } = fixture();
  const voice = createRawChipVoice(Tone, output);
  assert.equal(voice.triggerAttackRelease(220, "16n", 2, 0), false);
  assert.equal(oscillators.length, 0);
});

test("setDutyCycle changes the waveform used by future notes", () => {
  const { Tone, output } = fixture();
  const voice = createRawChipVoice(Tone, output, { waveKind: "pulse-square" });
  assert.equal(voice.setDutyCycle(0.125), "pulse-narrow");
  assert.equal(voice.getWaveKind(), "pulse-narrow");
});

test("detune updates active native oscillators", () => {
  const { Tone, output, oscillators } = fixture();
  const voice = createRawChipVoice(Tone, output);
  voice.triggerAttackRelease(220, "16n", 2, 0.5);
  voice.detune.value = 12;
  assert.equal(oscillators[0].detune.value, 12);
});

test("dispose is idempotent and prevents new notes", () => {
  const { Tone, output } = fixture();
  const voice = createRawChipVoice(Tone, output);
  voice.dispose();
  voice.dispose();
  assert.throws(() => voice.triggerAttackRelease(220, "16n", 2, 0.5), /disposed/);
});

test("polyphony limit retires the oldest voice before scheduling another", () => {
  const { Tone, output, oscillators } = fixture();
  const voice = createRawChipVoice(Tone, output, { maxVoices: 1 });
  assert.equal(voice.triggerAttackRelease(220, "8n", 2, 0.5), true);
  assert.equal(voice.getActiveVoiceCount(), 1);
  assert.equal(voice.triggerAttackRelease(330, "8n", 2.1, 0.5), true);
  assert.equal(voice.getActiveVoiceCount(), 1);
  assert.equal(oscillators.length, 2);
  assert.ok(oscillators[0].stops.length >= 1);
});
