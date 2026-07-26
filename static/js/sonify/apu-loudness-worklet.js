import {
  APU_LOUDNESS_DSP_BUILD_ID,
  createStereoLoudnessAccumulator,
} from "./apu-loudness-dsp.js?v=20260726-system-symphony-loudness-dsp-v1";

const PROCESSOR_NAME = "atlas-apu-loudness-meter";

class AtlasApuLoudnessProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this.accumulator = createStereoLoudnessAccumulator(sampleRate, {
      maxBlockHistory: processorOptions.maxBlockHistory,
    });
    this.failed = false;
    this.port.onmessage = (event) => {
      if (event.data?.type === "reset") this.accumulator.reset();
    };
    this.port.postMessage({
      type: "ready",
      buildId: APU_LOUDNESS_DSP_BUILD_ID,
      sampleRate,
    });
  }

  process(inputs) {
    if (this.failed) return false;
    try {
      const input = inputs[0];
      if (!input?.length) return true;
      const left = input[0] ?? [];
      const right = input[1] ?? left;
      const metrics = this.accumulator.process(left, right);
      if (metrics) this.port.postMessage({ type: "metrics", metrics });
      return true;
    } catch (error) {
      this.failed = true;
      this.port.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

registerProcessor(PROCESSOR_NAME, AtlasApuLoudnessProcessor);
