import { APU_MASTERING_DEFAULT_USER_GAIN } from "./apu-mastering.js?v=20260726-system-symphony-mastering-v4";
import {
  APU_TRACK_AUDIO_START_TIMEOUT_MS,
  APU_TRACK_BPM,
  APU_TRACK_SERVICE_POOL,
  APU_TRACK_SPECTRUM_SIZE,
  APU_TRACK_WAVEFORM_SIZE,
  createApuTrackEngine as createBaseApuTrackEngine,
} from "./apu-track-engine-v3.js?v=20260727-apu-pause-peak-v1";

export {
  APU_TRACK_AUDIO_START_TIMEOUT_MS,
  APU_TRACK_BPM,
  APU_TRACK_SERVICE_POOL,
  APU_TRACK_SPECTRUM_SIZE,
  APU_TRACK_WAVEFORM_SIZE,
};

export const APU_TRACK_DEFAULT_GAIN = APU_MASTERING_DEFAULT_USER_GAIN;

export function createApuTrackEngine(options = {}) {
  const engine = createBaseApuTrackEngine(options);
  engine.setVolume(APU_TRACK_DEFAULT_GAIN);
  return engine;
}
