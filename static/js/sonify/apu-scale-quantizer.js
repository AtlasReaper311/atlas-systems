/**
 * Atlas APU scale quantizer.
 *
 * Consolidates all pitch-to-scale quantisation into one class that the engine
 * and sequencer can share. Given a state and optional telemetry overrides,
 * produces a lookup table of valid MIDI notes within a range and snaps any
 * incoming frequency or MIDI value to the nearest scale degree.
 *
 * The quantizer guarantees that no raw telemetry value ever produces a note
 * outside the active state's harmonic vocabulary. This prevents the
 * out-of-key artifacts that happen when continuous telemetry drives pitch
 * directly.
 *
 * All frequency ramps should pass through quantizeMidi() or quantizeHz()
 * before reaching an AudioParam, which eliminates zipper noise from
 * unquantised continuous inputs.
 */

export const APU_SCALE_QUANTIZER_BUILD_ID = "20260727-apu-scale-quantizer-v1";

// State scale definitions matching apu-state-identities.js
const STATE_SCALES = Object.freeze({
  healthy:  Object.freeze([0, 2, 3, 5, 7, 9, 10]),  // Dorian
  warning:  Object.freeze([0, 1, 3, 5, 7, 8, 10]),   // Phrygian
  critical: Object.freeze([0, 1, 4, 5, 7, 8, 10]),   // Phrygian dominant
  unknown:  Object.freeze([0, 2, 5, 7, 10]),          // Pentatonic sus
});

const DEFAULT_TONIC_MIDI = 41; // F2
const MIDI_MIN = 24;
const MIDI_MAX = 96;

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;

/**
 * Convert a MIDI note number to frequency in Hz.
 * @param {number} midi
 * @returns {number}
 */
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert a frequency in Hz to the nearest MIDI note number.
 * @param {number} hz
 * @returns {number}
 */
export function hzToMidi(hz) {
  if (!Number.isFinite(hz) || hz <= 0) return DEFAULT_TONIC_MIDI;
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

export class ScaleQuantizer {
  /**
   * @param {object} options
   * @param {string} [options.state="healthy"]
   * @param {number} [options.tonicMidi=41] - root note MIDI number
   * @param {number} [options.minimum=24] - lowest allowed MIDI note
   * @param {number} [options.maximum=96] - highest allowed MIDI note
   * @param {number[]} [options.scaleOverride] - custom scale intervals
   */
  constructor({
    state = "healthy",
    tonicMidi = DEFAULT_TONIC_MIDI,
    minimum = MIDI_MIN,
    maximum = MIDI_MAX,
    scaleOverride = null,
  } = {}) {
    this._state = state;
    this._tonic = tonicMidi;
    this._min = minimum;
    this._max = maximum;
    this._scale = scaleOverride ?? STATE_SCALES[state] ?? STATE_SCALES.healthy;
    this._table = null;
  }

  /** The current scale intervals. */
  get scale() {
    return this._scale;
  }

  /** The current state label. */
  get state() {
    return this._state;
  }

  /**
   * Switch to a new state. Clears the lookup table so it rebuilds lazily.
   * @param {string} state
   * @param {number[]} [scaleOverride]
   */
  setState(state, scaleOverride = null) {
    const scale = scaleOverride ?? STATE_SCALES[state] ?? STATE_SCALES.healthy;
    if (this._state === state && arraysEqual(this._scale, scale)) return;
    this._state = state;
    this._scale = scale;
    this._table = null;
  }

  /**
   * Build (or return cached) sorted array of every valid MIDI note in range.
   * @returns {number[]}
   */
  get table() {
    if (this._table) return this._table;
    const notes = [];
    for (let octave = -3; octave <= 8; octave += 1) {
      for (const interval of this._scale) {
        const midi = this._tonic + interval + octave * 12;
        if (midi >= this._min && midi <= this._max) notes.push(midi);
      }
    }
    this._table = Object.freeze([...new Set(notes)].sort((a, b) => a - b));
    return this._table;
  }

  /**
   * Snap a MIDI note to the nearest valid scale degree.
   * @param {number} midi
   * @returns {number}
   */
  quantizeMidi(midi) {
    const t = this.table;
    if (!t.length) return Math.round(midi);
    let best = t[0];
    let bestDist = Math.abs(midi - best);
    for (let i = 1; i < t.length; i += 1) {
      const dist = Math.abs(midi - t[i]);
      if (dist < bestDist) {
        best = t[i];
        bestDist = dist;
      }
      if (t[i] > midi) break; // table is sorted, no need to check further
    }
    return best;
  }

  /**
   * Snap a frequency (Hz) to the nearest valid scale degree and return Hz.
   * @param {number} hz
   * @returns {number}
   */
  quantizeHz(hz) {
    return midiToHz(this.quantizeMidi(hzToMidi(hz)));
  }

  /**
   * Get the MIDI note for a scale degree relative to the tonic.
   * Degree 0 = tonic, degree 1 = second scale step, etc.
   * Supports negative degrees (descending) and degrees beyond one octave.
   * @param {number} degree
   * @returns {number}
   */
  degreeToMidi(degree) {
    const len = this._scale.length;
    const octave = Math.floor(degree / len) * 12;
    const interval = this._scale[modulo(degree, len)];
    return this._tonic + interval + octave;
  }

  /**
   * Get the frequency (Hz) for a scale degree.
   * @param {number} degree
   * @returns {number}
   */
  degreeToHz(degree) {
    return midiToHz(this.degreeToMidi(degree));
  }

  /**
   * Fold a MIDI note into a specific octave range by shifting octaves.
   * @param {number} midi
   * @param {number} minimum
   * @param {number} maximum
   * @returns {number}
   */
  foldMidi(midi, minimum = this._min, maximum = this._max) {
    let folded = Number.isFinite(midi) ? midi : minimum;
    while (folded > maximum) folded -= 12;
    while (folded < minimum) folded += 12;
    return folded;
  }
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
