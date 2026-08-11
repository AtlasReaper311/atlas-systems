/**
 * Atlas APU soft clipper and 8-bit quantisation stage.
 *
 * Provides a tanh-curve WaveShaperNode for analog-style saturation and a
 * separate bit-reduction stage that quantises the output to 8-bit resolution,
 * giving the final master bus the character of a retro DAC.
 *
 * The soft clipper is designed to sit before the existing final safety
 * limiter. Where the limiter catches exceptional peaks, the tanh curve folds
 * ordinary transients smoothly, producing the warm compression heard on
 * classic console audio hardware. The drive parameter controls how
 * aggressively the curve saturates:
 *
 *   drive 1.0  - transparent, almost no colouring
 *   drive 1.5  - gentle warmth (default)
 *   drive 2.0  - noticeable soft clipping on peaks
 *   drive 3.0+ - aggressive, distorted (useful for critical state)
 *
 * The 8-bit quantiser is a wet/dry WaveShaperNode that maps the continuous
 * signal to 256 discrete levels. At low wet values (0.08-0.15) it adds
 * subtle lo-fi texture without audible stepping.
 */

export const APU_SOFT_CLIPPER_BUILD_ID = "20260727-apu-soft-clipper-v1";

const CURVE_SAMPLES = 8192;
const QUANTISE_LEVELS = 256; // 8-bit

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteOr(value, 0)));
}

/**
 * Generate a tanh transfer curve with adjustable drive.
 *
 * @param {number} drive - saturation amount (1.0 = transparent, 3.0 = heavy)
 * @returns {Float32Array}
 */
export function tanhCurve(drive = 1.5) {
  const curve = new Float32Array(CURVE_SAMPLES);
  const safeDrive = Math.max(0.1, finiteOr(drive, 1.5));
  const normalizer = Math.tanh(safeDrive);
  for (let i = 0; i < CURVE_SAMPLES; i += 1) {
    const x = (2 * i / (CURVE_SAMPLES - 1)) - 1; // -1 to +1
    curve[i] = Math.tanh(x * safeDrive) / normalizer;
  }
  return curve;
}

/**
 * Generate an 8-bit quantisation transfer curve.
 *
 * Maps continuous input to the nearest of 256 discrete levels, simulating
 * an 8-bit DAC. The curve is symmetric around zero.
 *
 * @returns {Float32Array}
 */
export function quantiseCurve8Bit() {
  const curve = new Float32Array(CURVE_SAMPLES);
  const steps = QUANTISE_LEVELS - 1;
  for (let i = 0; i < CURVE_SAMPLES; i += 1) {
    const x = (2 * i / (CURVE_SAMPLES - 1)) - 1;
    const normalized = (x + 1) / 2;
    curve[i] = (Math.round(normalized * steps) / steps) * 2 - 1;
  }
  return curve;
}

/**
 * Create the tanh soft clipper WaveShaperNode.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} [drive=1.5]
 * @returns {WaveShaperNode}
 */
export function createSoftClipper(ctx, drive = 1.5) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = tanhCurve(drive);
  shaper.oversample = "2x";
  return shaper;
}

/**
 * Update the drive amount on an existing soft clipper.
 *
 * @param {WaveShaperNode} shaper
 * @param {number} drive
 */
export function setSoftClipperDrive(shaper, drive) {
  if (!shaper) return;
  shaper.curve = tanhCurve(drive);
}

/**
 * Create the 8-bit quantisation WaveShaperNode.
 *
 * @param {BaseAudioContext} ctx
 * @returns {WaveShaperNode}
 */
export function createQuantiser(ctx) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = quantiseCurve8Bit();
  shaper.oversample = "none";
  return shaper;
}

/**
 * Build the complete APU master output stage.
 *
 * Signal flow:
 *   input -> 8-bit quantiser (wet/dry) -> tanh soft clipper -> output
 *
 * Returns an object with connect/disconnect helpers and parameter setters.
 *
 * @param {BaseAudioContext} ctx
 * @param {object} [options]
 * @param {number} [options.drive=1.5] - soft clipper drive
 * @param {number} [options.quantiseWet=0.1] - 8-bit quantiser wet amount
 * @returns {{ input: GainNode, output: GainNode, setDrive: Function, setQuantiseWet: Function, dispose: Function }}
 */
export function createApuMasterStage(ctx, { drive = 1.5, quantiseWet = 0.1 } = {}) {
  const input = ctx.createGain();
  input.gain.value = 1;

  // 8-bit quantiser as parallel wet/dry
  const initialWet = clamp01(quantiseWet);
  const quantiserDry = ctx.createGain();
  quantiserDry.gain.value = 1 - initialWet;
  const quantiserWet = ctx.createGain();
  quantiserWet.gain.value = initialWet;
  const quantiser = createQuantiser(ctx);
  const quantiserMix = ctx.createGain();
  quantiserMix.gain.value = 1;

  input.connect(quantiserDry);
  input.connect(quantiser);
  quantiser.connect(quantiserWet);
  quantiserDry.connect(quantiserMix);
  quantiserWet.connect(quantiserMix);

  // Soft clipper
  const clipper = createSoftClipper(ctx, drive);
  const output = ctx.createGain();
  output.gain.value = 1;

  quantiserMix.connect(clipper);
  clipper.connect(output);

  return Object.freeze({
    input,
    output,

    setDrive(value) {
      setSoftClipperDrive(clipper, value);
    },

    setQuantiseWet(value) {
      const wet = clamp01(value);
      quantiserWet.gain.value = wet;
      quantiserDry.gain.value = 1 - wet;
    },

    dispose() {
      try {
        input.disconnect();
        quantiserDry.disconnect();
        quantiserWet.disconnect();
        quantiser.disconnect();
        quantiserMix.disconnect();
        clipper.disconnect();
        output.disconnect();
      } catch (_) {
        // Disconnecting already-disconnected nodes is safe to ignore
      }
    },
  });
}
