import * as legacy from "./apu-track-sequencer-legacy.js?v=20260726-system-symphony-atlas-chip-laws-v3";
import { clamp } from "./apu-palette.js?v=20260725-system-symphony-atlas-apu-preview-v1";
import {
  normalizedStateIdentity,
  shouldOmitEvent,
} from "./apu-state-identities.js?v=20260726-system-symphony-state-identities-v4";
import {
  foldThemeMidi,
  scaleDegreeToMidi,
} from "./apu-theme-grammar.js?v=20260727-system-symphony-pass-d2-theme-grammar-v1";

export * from "./apu-track-sequencer-legacy.js?v=20260726-system-symphony-atlas-chip-laws-v3";

export const APU_THEME_SEQUENCER_BUILD_ID = "20260727-system-symphony-pass-d2b-sequencer-v1";

const phraseCache = new WeakMap();

function wrappedStep(step) {
  return ((Math.trunc(step) % legacy.APU_TRACK_STEPS) + legacy.APU_TRACK_STEPS) % legacy.APU_TRACK_STEPS;
}

function primaryEventsForLive(arrangement) {
  const source = arrangement?.themeMotif?.events ?? [];
  if (!source.length) return [];
  if (["intro", "breathe"].includes(arrangement.section)) {
    return [source[0], source[Math.min(4, source.length - 1)]].filter(Boolean);
  }
  if (arrangement.section === "release") {
    return [source[0], source[Math.floor(source.length / 2)], source.at(-1)].filter(Boolean);
  }
  if (arrangement.scoreState === "unknown" && source.length > 2) {
    return arrangement.sectionLocalPhrase % 2 === 0
      ? [source[0], source[Math.min(2, source.length - 1)]].filter(Boolean)
      : [source[1] ?? source[0], source.at(-1)].filter(Boolean);
  }
  return source;
}

function stateRootMidi(state, section) {
  if (state === "critical") return 53;
  if (section === "peak") return 77;
  return 65;
}

function harmonyRootDegree(arrangement, step) {
  const harmony = arrangement?.harmony?.[wrappedStep(step) < 16 ? 0 : 1];
  return Number.isFinite(harmony?.rootDegree) ? Math.trunc(harmony.rootDegree) : 0;
}

function nearestOctave(midi, previous, minimum, maximum) {
  let value = foldThemeMidi(midi, minimum, maximum);
  if (!Number.isFinite(previous)) return value;
  while (value - previous > 12 && value - 12 >= minimum) value -= 12;
  while (previous - value > 12 && value + 12 <= maximum) value += 12;
  return value;
}

function liveThemeSequence(frame, arrangement, events, voice) {
  const scale = legacy.normalizedScale(frame);
  const state = normalizedStateIdentity(frame.scoreState ?? arrangement?.scoreState).id;
  const register = arrangement.themeMotif.register;
  const minimum = voice === "primary" ? Math.max(52, register.minimum) : Math.max(48, register.minimum - 12);
  const maximum = voice === "primary" ? Math.min(88, register.maximum + 12) : Math.min(86, register.maximum + 7);
  const rootMidi = stateRootMidi(state, arrangement.section) - (voice === "secondary" ? 12 : 0);
  let previous = null;
  return events.map((event) => {
    const degree = event.degree + harmonyRootDegree(arrangement, event.step);
    const raw = scaleDegreeToMidi(scale, rootMidi, degree);
    const midi = nearestOctave(raw, previous, minimum, maximum);
    previous = midi;
    return Object.freeze({ ...event, midi, voice });
  });
}

function cachedThemeSequences(frame, arrangement) {
  const scaleKey = JSON.stringify(legacy.normalizedScale(frame));
  const cached = phraseCache.get(arrangement);
  if (cached?.scaleKey === scaleKey) return cached;
  const primary = liveThemeSequence(frame, arrangement, primaryEventsForLive(arrangement), "primary");
  const secondary = liveThemeSequence(frame, arrangement, arrangement.themeMotif.echoEvents ?? [], "secondary");
  const next = Object.freeze({ scaleKey, primary, secondary });
  phraseCache.set(arrangement, next);
  return next;
}

function omittedThemeEvent(frame, arrangement, event, serviceHash) {
  if (arrangement.themeMotif.preservedAnchors.includes(event.sourceIndex)) return false;
  const position = wrappedStep(event.step);
  return shouldOmitEvent({
    state: frame.scoreState ?? arrangement.scoreState,
    barIndex: (arrangement.cycleBarStart ?? 1) - 1 + (position >= 16 ? 1 : 0),
    stepIndex: position,
    serviceHash,
    phraseIndex: arrangement.phraseIndex ?? 0,
  });
}

function themedPulseEvent(frame, arrangement, step, voice) {
  if (!arrangement?.themeMotif) return null;
  const identity = normalizedStateIdentity(frame.scoreState ?? arrangement.scoreState);
  const sequences = cachedThemeSequences(frame, arrangement);
  const events = voice === "primary" ? sequences.primary : sequences.secondary;
  const event = events.find((candidate) => candidate.step === wrappedStep(step));
  if (!event || omittedThemeEvent(frame, arrangement, event, voice === "primary" ? 167 : 179)) return null;
  const mix = voice === "primary" ? arrangement.mix?.primary : arrangement.mix?.secondary;
  const velocity = voice === "primary"
    ? clamp((event.velocity ?? 0.34) * (0.82 + (mix ?? 0) * 0.38), 0.08, 0.58)
    : clamp((event.velocity ?? 0.2) * (0.76 + (mix ?? 0) * 0.34), 0.05, 0.42);
  return Object.freeze({
    midi: event.midi,
    duration: event.duration ?? (voice === "primary" ? identity.leadGate : identity.counterGate),
    velocity,
    dutyCycle: voice === "primary" ? identity.primaryDutyCycle : identity.counterDutyCycle,
    themeId: arrangement.themeMotif.themeId,
    themeTransform: arrangement.themeMotif.transform,
    themeSourceIndex: event.sourceIndex,
    themeVoice: voice,
    themeIntegrationBuildId: APU_THEME_SEQUENCER_BUILD_ID,
  });
}

export function primaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  if (!arrangement?.themeMotif) return legacy.primaryPulseEventForTrackStep(frame, arrangement, step);
  return themedPulseEvent(frame, arrangement, step, "primary");
}

export function secondaryPulseEventForTrackStep(frame = {}, arrangement = null, step = 0) {
  if (!arrangement?.themeMotif) return legacy.secondaryPulseEventForTrackStep(frame, arrangement, step);
  const state = normalizedStateIdentity(frame.scoreState ?? arrangement.scoreState).id;
  if (state === "healthy" || state === "critical" || !arrangement.themeMotif.echoEvents?.length) {
    return legacy.secondaryPulseEventForTrackStep(frame, arrangement, step);
  }
  return themedPulseEvent(frame, arrangement, step, "secondary");
}
