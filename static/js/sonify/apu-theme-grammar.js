import { ATLAS_THEME_ID, deepFreezeThematicMemory } from "./apu-thematic-memory.js";

export const APU_THEME_GRAMMAR_SCHEMA_VERSION = 1;
export const APU_THEME_GRAMMAR_BUILD_ID = "20260727-system-symphony-pass-d2-theme-grammar-v1";
export const APU_THEME_STEPS_PER_PHRASE = 32;

export const ATLAS_THEME_GENOME = deepFreezeThematicMemory({
  themeId: ATLAS_THEME_ID,
  degrees: [0, 2, 4, 1, 5, 4, 2, 0],
  steps: [0, 3, 7, 10, 16, 19, 23, 28],
  durations: ["8n", "16n", "8n", "8n", "8n", "16n", "8n", "4n"],
  velocities: [0.42, 0.34, 0.4, 0.34, 0.46, 0.36, 0.38, 0.44],
  anchorSourceIndices: [0, 4, 7],
  endingGestureSourceIndices: [5, 6, 7],
});

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const REGISTER_BOUNDS = Object.freeze({
  healthy: Object.freeze({ minimum: 57, maximum: 86, rootMidi: 62 }),
  warning: Object.freeze({ minimum: 55, maximum: 81, rootMidi: 60 }),
  critical: Object.freeze({ minimum: 52, maximum: 76, rootMidi: 55 }),
  unknown: Object.freeze({ minimum: 55, maximum: 79, rootMidi: 60 }),
});

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function modulo(value, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  return ((integer(value) % length) + length) % length;
}

function eventFromGenome(index) {
  return {
    sourceIndex: index,
    degree: ATLAS_THEME_GENOME.degrees[index],
    step: ATLAS_THEME_GENOME.steps[index],
    duration: ATLAS_THEME_GENOME.durations[index],
    velocity: ATLAS_THEME_GENOME.velocities[index],
  };
}

function cloneEvents(events) {
  return events.map((event) => ({ ...event }));
}

function selectEvents(events, sourceIndices, steps = null) {
  return sourceIndices.map((sourceIndex, index) => {
    const source = events.find((event) => event.sourceIndex === sourceIndex) ?? eventFromGenome(sourceIndex);
    return { ...source, step: steps?.[index] ?? source.step };
  });
}

function rotateMiddleDegrees(events, amount) {
  const result = cloneEvents(events);
  const middle = result.slice(1, -1).map((event) => event.degree);
  if (!middle.length) return result;
  const rotation = modulo(amount, middle.length);
  const rotated = middle.map((_, index) => middle[(index + rotation) % middle.length]);
  for (let index = 1; index < result.length - 1; index += 1) result[index].degree = rotated[index - 1];
  return result;
}

function applyTransform(events, transform, plan) {
  const result = cloneEvents(events);
  const scaleLength = 7;
  if (["identity", "reprise"].includes(transform)) return result;
  if (transform === "rotation") return rotateMiddleDegrees(result, 1 + modulo(plan?.cycleNumber, 3));
  if (transform === "sequence-up") {
    return result.map((event, index) => ({ ...event, degree: index === 0 || index === result.length - 1 ? event.degree : event.degree + 1 }));
  }
  if (transform === "sequence-down") {
    return result.map((event, index) => ({ ...event, degree: index === 0 || index === result.length - 1 ? event.degree : event.degree - 1 }));
  }
  if (transform === "inversion-lite") {
    return result.map((event, index) => ({ ...event, degree: index === 0 || index === result.length - 1 ? 0 : Math.max(-2, 5 - event.degree) }));
  }
  if (transform === "retrograde-fragment") {
    const selected = selectEvents(result, [7, 5, 3, 0], [0, 8, 19, 28]);
    return selected.map((event, index) => ({ ...event, degree: result[[7, 5, 3, 0][index]].degree }));
  }
  if (transform === "augmentation") {
    const steps = [0, 5, 9, 14, 18, 22, 26, 30];
    return result.map((event, index) => ({ ...event, step: steps[index], duration: index === result.length - 1 ? "2n" : "4n" }));
  }
  if (transform === "diminution") {
    const steps = [0, 2, 4, 6, 8, 12, 16, 20];
    return result.map((event, index) => ({ ...event, step: steps[index], duration: "32n" }));
  }
  if (transform === "rhythmic-displacement") {
    return result.map((event, index) => ({ ...event, step: Math.min(31, event.step + (index > 0 && index < result.length - 1 && index % 2 === 1 ? 1 : 0)) }));
  }
  if (transform === "compression") {
    return result.map((event) => ({ ...event, degree: Math.round(event.degree * 0.68) }));
  }
  if (transform === "expansion") {
    return result.map((event, index) => ({ ...event, degree: [2, 4, 5].includes(index) ? event.degree + scaleLength : event.degree }));
  }
  if (transform === "outer-note-fragment") return selectEvents(result, [0, 2, 4, 7], [0, 8, 20, 28]);
  if (transform === "answer") {
    const answerDegrees = [5, 4, 2, 0, 2, 1, 0, 0];
    return result.map((event, index) => ({ ...event, degree: answerDegrees[index] }));
  }
  if (transform === "cadential-extension") {
    const steps = [0, 3, 7, 10, 16, 20, 25, 30];
    return result.map((event, index) => ({ ...event, step: steps[index], duration: index === result.length - 1 ? "2n" : event.duration }));
  }
  return result;
}

function healthyTreatment(events, plan) {
  const result = cloneEvents(events);
  result[0].degree = 0;
  result[result.length - 1].degree = 0;
  if (["reprise", "cadence"].includes(plan?.phraseRole) || plan?.cadenceIntent === "recovery") {
    result[result.length - 2].degree = 2;
    result[result.length - 1].duration = "2n";
  }
  return { events: result, stateTreatment: "clear-statement", echoEvents: [] };
}

function warningTreatment(events) {
  const full = cloneEvents(events).map((event, index) => ({
    ...event,
    degree: index === 0 ? 0 : Math.round(event.degree * 0.66),
    step: Math.min(31, event.step + (index > 0 && index % 2 === 1 ? 1 : 0)),
    duration: index % 3 === 0 ? "16n" : "32n",
    velocity: Math.min(0.42, event.velocity * 0.94),
  }));
  if (full.length >= 6) full[3].degree = full[2].degree;
  full[full.length - 1].degree = 2;
  return {
    events: full,
    stateTreatment: "diagnostic-strain",
    echoEvents: selectEvents(full, [2, 5], [13, 29]).map((event) => ({ ...event, velocity: 0.2, duration: "32n" })),
  };
}

function criticalTreatment(events) {
  const sources = [0, 2, 0, 4, 5, 7];
  const result = selectEvents(events, sources, [0, 4, 8, 16, 20, 28]).map((event, index) => ({
    ...event,
    degree: [0, 4, 0, 4, 4, 4][index],
    duration: index % 3 === 2 ? "16n" : "32n",
    velocity: [0.48, 0.42, 0.5, 0.46, 0.42, 0.48][index],
  }));
  return {
    events: result,
    stateTreatment: "root-fifth-compression",
    echoEvents: [
      { ...result[1], step: 12, degree: 4, velocity: 0.23 },
      { ...result[4], step: 24, degree: 4, velocity: 0.24 },
    ],
  };
}

function unknownTreatment(events) {
  const result = selectEvents(events, [0, 2, 4, 7], [0, 8, 20, 28]).map((event, index) => ({
    ...event,
    degree: [0, 4, 5, 2][index],
    duration: index === 0 || index === 3 ? "2n" : "4n",
    velocity: [0.28, 0.22, 0.24, 0.2][index],
  }));
  return {
    events: result,
    stateTreatment: "distant-fragment",
    echoEvents: [
      { ...result[1], step: 14, velocity: 0.13, duration: "4n" },
      { ...result[2], step: 26, velocity: 0.11, duration: "4n" },
    ],
  };
}

function normalizeEvents(events) {
  const byStep = new Map();
  for (const event of events) {
    const step = Math.max(0, Math.min(APU_THEME_STEPS_PER_PHRASE - 1, integer(event.step)));
    byStep.set(step, {
      sourceIndex: Math.max(0, integer(event.sourceIndex)),
      degree: integer(event.degree),
      step,
      duration: String(event.duration ?? "8n"),
      velocity: Number(Math.max(0.05, Math.min(0.7, Number(event.velocity) || 0.3)).toFixed(4)),
    });
  }
  return [...byStep.values()].sort((left, right) => left.step - right.step);
}

function effectiveTransformForPlan(songPlan = {}) {
  const requested = String(songPlan.transform ?? "identity");
  if (songPlan.cadenceIntent === "recovery" || songPlan.phraseRole === "reprise") return "reprise";
  if (songPlan.phraseRole === "answer") return "answer";
  if (songPlan.phraseRole === "cadence") return "cadential-extension";
  if (songPlan.cycleRole === "statement" && ["statement", "restatement"].includes(songPlan.phraseRole)) return "identity";
  return requested;
}

export function themeMotifForPlan(songPlan = {}) {
  if (songPlan.themeId && songPlan.themeId !== ATLAS_THEME_ID) {
    throw new RangeError("apu-theme-grammar: song plan must use ATLAS_THEME");
  }
  const state = STATES.includes(songPlan.state) ? songPlan.state : "unknown";
  const requestedTransform = String(songPlan.transform ?? "identity");
  const transform = effectiveTransformForPlan(songPlan);
  const transformed = applyTransform(ATLAS_THEME_GENOME.degrees.map((_, index) => eventFromGenome(index)), transform, songPlan);
  const treatment = state === "healthy"
    ? healthyTreatment(transformed, songPlan)
    : state === "warning"
      ? warningTreatment(transformed)
      : state === "critical"
        ? criticalTreatment(transformed)
        : unknownTreatment(transformed);
  const events = normalizeEvents(treatment.events);
  const echoEvents = normalizeEvents(treatment.echoEvents);
  const sourceIndices = events.map((event) => event.sourceIndex);
  const preservedAnchors = ATLAS_THEME_GENOME.anchorSourceIndices.filter((index) => sourceIndices.includes(index));
  const register = REGISTER_BOUNDS[state];
  const payload = {
    schemaVersion: APU_THEME_GRAMMAR_SCHEMA_VERSION,
    buildId: APU_THEME_GRAMMAR_BUILD_ID,
    themeId: ATLAS_THEME_ID,
    state,
    stateTreatment: treatment.stateTreatment,
    phraseRole: songPlan.phraseRole ?? "statement",
    cycleRole: songPlan.cycleRole ?? "statement",
    requestedTransform,
    transform,
    cadenceIntent: songPlan.cadenceIntent ?? "open",
    events,
    echoEvents,
    preservedAnchors,
    endingGesture: events.slice(-3).map((event) => event.degree),
    register,
  };
  if (!payload.events.length) throw new RangeError("apu-theme-grammar: main motif cannot be empty");
  if (!payload.preservedAnchors.length) throw new RangeError("apu-theme-grammar: motif must preserve a theme anchor");
  return deepFreezeThematicMemory(payload);
}

export function scaleDegreeToMidi(scale, rootMidi, degree) {
  const safeScale = Array.isArray(scale) && scale.length >= 3
    ? [...new Set(scale.filter(Number.isFinite).map((value) => modulo(value, 12)))].sort((left, right) => left - right)
    : [0, 2, 3, 5, 7, 9, 10];
  const safeDegree = integer(degree);
  const octave = Math.floor(safeDegree / safeScale.length) * 12;
  return integer(rootMidi, 60) + safeScale[modulo(safeDegree, safeScale.length)] + octave;
}

export function foldThemeMidi(midi, minimum, maximum) {
  let value = Number.isFinite(midi) ? Math.round(midi) : minimum;
  while (value > maximum) value -= 12;
  while (value < minimum) value += 12;
  return value;
}

export function motifMidiEventsForPlan(songPlan, scale, options = {}) {
  const motif = themeMotifForPlan(songPlan);
  const register = motif.register;
  const rootMidi = Number.isFinite(options.rootMidi) ? options.rootMidi : register.rootMidi;
  const convert = (event, voice) => deepFreezeThematicMemory({
    ...event,
    voice,
    midi: foldThemeMidi(scaleDegreeToMidi(scale, rootMidi, event.degree), register.minimum, register.maximum),
  });
  return deepFreezeThematicMemory({
    ...motif,
    events: motif.events.map((event) => convert(event, "primary")),
    echoEvents: motif.echoEvents.map((event) => convert(event, "secondary")),
  });
}
