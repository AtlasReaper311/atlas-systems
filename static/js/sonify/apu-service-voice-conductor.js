/**
 * Atlas APU service voice conductor.
 *
 * Converts a service event into an audible, state-mutated leitmotif note using
 * the active arrangement tonic, the motif rhythm, the preferred layer, and the
 * existing event register. Recovery phase explicitly selects the recovery
 * mutation even after the estate state has returned to healthy or warning.
 */

import {
  describeLeitmotif,
  leitmotifFor,
} from "./apu-service-leitmotifs.js?v=20260727-apu-service-leitmotifs-v1";
import { ScaleQuantizer } from "./apu-scale-quantizer.js?v=20260727-apu-scale-quantizer-v1";

export const APU_SERVICE_VOICE_CONDUCTOR_BUILD_ID = "20260727-apu-service-voice-conductor-v2";

const MUTATION_VELOCITY_SCALE = Object.freeze({
  identity: 1,
  tenseShift: 0.95,
  fragment: 0.75,
  sparse: 0.55,
  resolve: 1.1,
});

const MUTATION_DURATION_HINT = Object.freeze({
  identity: null,
  tenseShift: null,
  fragment: "32n",
  sparse: "16n",
  resolve: "8n",
});

const REGISTER_RANGE = Object.freeze({
  bass: Object.freeze([36, 55]),
  mid: Object.freeze([48, 67]),
  lead: Object.freeze([60, 79]),
  upper: Object.freeze([72, 91]),
});

const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  if (numeric < minimum) return minimum;
  if (numeric > maximum) return maximum;
  return numeric;
};

function motifStateFor(estateState, phase) {
  return phase === "recovery" ? "recovery" : estateState ?? "unknown";
}

function rhythmSlotFor(rhythm, step) {
  if (!Array.isArray(rhythm) || !rhythm.length) return { index: 0, active: true, ordinal: 0 };
  const index = ((Math.trunc(step) % rhythm.length) + rhythm.length) % rhythm.length;
  const active = Boolean(rhythm[index]);
  let ordinal = -1;
  for (let i = 0; i <= index; i += 1) if (rhythm[i]) ordinal += 1;
  return { index, active, ordinal: Math.max(0, ordinal) };
}

function motifSlotFor(motif, ordinal, phraseIndex, voiceHash) {
  if (!Array.isArray(motif) || !motif.length) return { index: 0, degree: 0 };
  const start = ((Math.trunc(phraseIndex) + ordinal + (voiceHash | 0)) % motif.length + motif.length) % motif.length;
  for (let offset = 0; offset < motif.length; offset += 1) {
    const index = (start + offset) % motif.length;
    const degree = motif[index];
    if (degree !== null && degree !== undefined) return { index, degree };
  }
  return { index: start, degree: null };
}

function foldIntoRange(quantizer, midi, range) {
  return quantizer.quantizeMidi(quantizer.foldMidi(midi, range[0], range[1]));
}

export function conductServiceEvent({
  event,
  frame,
  arrangement,
  perfPlan,
  step,
  phraseIndex = 0,
} = {}) {
  if (!event?.voice) return null;
  const serviceName = event.voice.name ?? "unknown-service";
  const estateState = frame?.scoreState ?? "unknown";
  const phase = perfPlan?.phase ?? "groove";
  const motifState = motifStateFor(estateState, phase);
  const leitmotif = leitmotifFor(serviceName, motifState);
  const rhythmSlot = rhythmSlotFor(leitmotif.rhythm, step);
  if (!rhythmSlot.active) return null;

  const motifSlot = motifSlotFor(leitmotif.motif, rhythmSlot.ordinal, phraseIndex, event.voice.hash ?? 0);
  if (motifSlot.degree === null || motifSlot.degree === undefined) return null;

  const tonicMidi = Number.isFinite(arrangement?.rootMidi) ? arrangement.rootMidi : 41;
  const quantizer = new ScaleQuantizer({ state: estateState, tonicMidi, minimum: 24, maximum: 96 });
  const register = REGISTER_RANGE[leitmotif.register] ?? REGISTER_RANGE.mid;
  const eventAnchor = Number.isFinite(event.midi)
    ? event.midi
    : Number.isFinite(event.voice.registerMidi)
      ? event.voice.registerMidi
      : tonicMidi;
  const registerShift = ((Number(leitmotif.octaveOffset) || 1) - 1) * 12;
  const targetMidi = eventAnchor + registerShift + Number(motifSlot.degree || 0);
  const playedMidi = foldIntoRange(quantizer, targetMidi, register);
  const mutation = leitmotif.mutation ?? "identity";
  const velocity = clamp((event.velocity ?? 0.3) * (MUTATION_VELOCITY_SCALE[mutation] ?? 1), 0.04, 0.5);
  const duration = MUTATION_DURATION_HINT[mutation] ?? event.duration ?? "16n";
  const description = describeLeitmotif(leitmotif);

  return Object.freeze({
    ...event,
    midi: playedMidi,
    velocity,
    duration,
    leitmotif,
    mutation,
    motifSlotIndex: motifSlot.index,
    motifDegree: motifSlot.degree,
    rhythmSlotIndex: rhythmSlot.index,
    preferredLayer: leitmotif.preferredLayer,
    route: leitmotif.preferredLayer,
    provenance: Object.freeze({
      ...description,
      tonicMidi,
      playedMidi,
      rhythmSlotIndex: rhythmSlot.index,
      motifSlotIndex: motifSlot.index,
      preferredLayer: leitmotif.preferredLayer,
    }),
  });
}

export function describeServiceConductor(serviceName, estateState, perfPhase) {
  const leitmotif = leitmotifFor(serviceName, motifStateFor(estateState, perfPhase));
  return describeLeitmotif(leitmotif).describe;
}
