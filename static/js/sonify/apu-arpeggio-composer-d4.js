export const APU_ARPEGGIO_COMPOSER_D4_BUILD_ID =
  "20260727-system-symphony-pass-d4-arpeggio-composer-v3";

export const APU_D4_CYCLE_ROLES = Object.freeze([
  "statement",
  "development",
  "contrast",
  "reprise",
]);

export const APU_D4_PASSAGE_PHRASES = Object.freeze({
  statement: Object.freeze([1, 3, 4, 6, 8, 10, 14]),
  development: Object.freeze([0, 3, 4, 6, 8, 10, 13]),
  contrast: Object.freeze([1, 4, 6, 7, 9, 10, 14]),
  reprise: Object.freeze([1, 3, 4, 6, 8, 10, 14]),
});

export const APU_D4_PROTECTED_EXPLORER_HANDOFF = Object.freeze({
  state: "healthy",
  cyclePhrase: 4,
  label: "explorer-protected-theme-a-handoff",
  steps: Object.freeze([28, 29, 30]),
  offsets: Object.freeze([24, 19, 12]),
  velocities: Object.freeze([0.28, 0.24, 0.22]),
  duration: "32n",
});

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const PEAK_PHRASES = Object.freeze([11, 12]);

const SECTION_BY_PHRASE = Object.freeze([
  "intro",
  "establish",
  "theme-a",
  "theme-a",
  "theme-a",
  "variation",
  "variation",
  "theme-b",
  "theme-b",
  "build",
  "build",
  "peak",
  "peak",
  "release",
  "recovery",
  "breathe",
]);

const ARP_FUNCTION_BY_SECTION = Object.freeze({
  intro: "connector",
  establish: "answer",
  "theme-a": "connector",
  variation: "lift",
  "theme-b": "answer",
  build: "lift",
  peak: "ostinato",
  release: "fracture",
  recovery: "reprise",
  breathe: "cadence",
});

const START_BY_FUNCTION = Object.freeze({
  connector: 2,
  answer: 8,
  lift: 1,
  ostinato: 2,
  fracture: 8,
  reprise: 1,
  cadence: 8,
});

const STATE_PROFILES = Object.freeze({
  healthy: Object.freeze({
    label: "Explorer",
    voice: "secondary",
    duration: "32n",
    velocity: 0.28,
    up: Object.freeze([0, 4, 7, 12, 16, 19, 24]),
    down: Object.freeze([24, 19, 16, 12, 7, 4, 0]),
    tornado: Object.freeze([0, 4, 7, 12, 16, 19, 24, 19, 16, 12, 7, 4, 0]),
  }),
  warning: Object.freeze({
    label: "Grid Pressure",
    voice: "accent",
    duration: "32n",
    velocity: 0.255,
    up: Object.freeze([-5, 0, 3, 7, 10, 12, 15]),
    down: Object.freeze([15, 12, 10, 7, 3, 0, -5]),
    tornado: Object.freeze([-5, 0, 3, 7, 10, 12, 15, 12, 10, 7, 3, 0, -5]),
  }),
  critical: Object.freeze({
    label: "Boss Protocol",
    voice: "accent",
    duration: "32n",
    velocity: 0.25,
    up: Object.freeze([-12, -5, 0, 7, 12, 19]),
    down: Object.freeze([19, 12, 7, 0, -5, -12]),
    tornado: Object.freeze([-12, -5, 0, 7, 12, 19, 12, 7, 0, -5, -12]),
  }),
  unknown: Object.freeze({
    label: "Lost Signal",
    voice: "secondary",
    duration: "32n",
    velocity: 0.225,
    up: Object.freeze([-12, -5, 0, 5, 7, 12]),
    down: Object.freeze([12, 7, 5, 0, -5, -12]),
    tornado: Object.freeze([-12, -5, 0, 5, 7, 12, 7, 5, 0, -5, -12]),
  }),
});

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;
const safeState = (state) => STATES.includes(state) ? state : "unknown";
const safeCycleRole = (role, cycleNumber = 0) => {
  if (APU_D4_CYCLE_ROLES.includes(role)) return role;
  const cycle = Math.max(0, Math.trunc(cycleNumber));
  if (cycle === 0) return "statement";
  return ["development", "contrast", "reprise"][modulo(cycle - 1, 3)];
};

function phraseContext(perfPlan = {}) {
  const phraseIndex = Math.max(0, Math.trunc(perfPlan.phraseIndex ?? 0));
  const cycleNumber = Math.max(0, Math.trunc(
    perfPlan.cycleNumber
      ?? perfPlan.songPlan?.cycleNumber
      ?? Math.floor(phraseIndex / 16),
  ));
  const cyclePhrase = modulo(
    perfPlan.cyclePhrase
      ?? perfPlan.songPlan?.cyclePhrase
      ?? phraseIndex,
    16,
  );
  const cycleRole = safeCycleRole(
    perfPlan.songPlan?.cycleRole ?? perfPlan.cycleRole,
    cycleNumber,
  );
  const state = safeState(perfPlan.state ?? perfPlan.songPlan?.state);
  const section = String(
    perfPlan.section
      ?? perfPlan.songPlan?.section
      ?? SECTION_BY_PHRASE[cyclePhrase],
  );
  const requestedFunction = String(
    perfPlan.songPlan?.arpFunction
      ?? ARP_FUNCTION_BY_SECTION[section]
      ?? "connector",
  );
  const arpFunction = START_BY_FUNCTION[requestedFunction] === undefined
    ? "connector"
    : requestedFunction;
  return Object.freeze({
    phraseIndex,
    cycleNumber,
    cyclePhrase,
    cycleRole,
    state,
    section,
    arpFunction,
    bar: perfPlan.bars ?? phraseIndex * 2,
  });
}

function isProtectedExplorerHandoff(context) {
  return context.state === APU_D4_PROTECTED_EXPLORER_HANDOFF.state
    && context.cyclePhrase === APU_D4_PROTECTED_EXPLORER_HANDOFF.cyclePhrase;
}

function protectedExplorerPlan(context) {
  const instructions = Object.freeze(
    APU_D4_PROTECTED_EXPLORER_HANDOFF.steps.map((offsetSteps, index) => Object.freeze({
      voice: "primary",
      offsetSteps,
      midiOffset: APU_D4_PROTECTED_EXPLORER_HANDOFF.offsets[index],
      velocity: APU_D4_PROTECTED_EXPLORER_HANDOFF.velocities[index],
      duration: APU_D4_PROTECTED_EXPLORER_HANDOFF.duration,
      ornament: "d4-arpeggio",
      size: "phrase",
      bar: context.bar,
      state: context.state,
      arpFunction: "protected-handoff",
      arpRole: "answer",
      contour: "down",
      timbreRole: "primary-protected-shimmer",
      protectedEvent: true,
      protectedColourLayer: false,
      additive: true,
      harmonyHalf: 1,
      arpeggioBuildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
    })),
  );
  return Object.freeze({
    ...context,
    active: true,
    protectedEvent: true,
    role: "answer",
    contour: "down",
    timbreRole: "primary-protected-shimmer",
    window: Object.freeze({ startStep: 28, endStep: 30 }),
    spaceCategories: Object.freeze([]),
    instructions,
    buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  });
}

function shapeForContext(context) {
  const base = Object.freeze({
    connector: "up",
    answer: "down",
    lift: "tornado",
    ostinato: "tornado",
    fracture: "down",
    reprise: "tornado",
    cadence: "down",
  })[context.arpFunction] ?? "tornado";

  if (context.cycleRole === "statement") return base;
  if (context.cycleRole === "development") {
    return context.cyclePhrase % 2 === 0 ? "tornado" : "up";
  }
  if (context.cycleRole === "contrast") {
    if (base === "up") return "down";
    if (base === "down") return "up";
    return "tornado";
  }
  if (context.cyclePhrase === 14) return "down";
  return context.cyclePhrase % 2 === 0 ? "tornado" : base;
}

function velocityFor(profile, shape, index, length, cycleRole) {
  const progress = length <= 1 ? 0 : index / (length - 1);
  const center = 1 - Math.abs(progress * 2 - 1);
  const shapeScale = shape === "tornado"
    ? 0.94 + center * 0.06
    : 1 - progress * 0.05;
  const cycleScale = cycleRole === "development"
    ? 1
    : cycleRole === "contrast"
      ? 0.97
      : cycleRole === "reprise"
        ? 0.94
        : 0.99;
  return Number(Math.max(0.12, profile.velocity * shapeScale * cycleScale).toFixed(3));
}

export function arpeggioPassageCountForCycleRole(cycleRole) {
  return APU_D4_PASSAGE_PHRASES[safeCycleRole(cycleRole)]?.length ?? 0;
}

export function arpeggioPlanForPhrase(perfPlan = {}) {
  const context = phraseContext(perfPlan);
  const scheduled = APU_D4_PASSAGE_PHRASES[context.cycleRole].includes(context.cyclePhrase);

  if (!scheduled || PEAK_PHRASES.includes(context.cyclePhrase)) {
    return Object.freeze({
      ...context,
      active: false,
      protectedEvent: false,
      role: "rest",
      contour: "none",
      timbreRole: "rest",
      window: null,
      spaceCategories: Object.freeze([]),
      instructions: Object.freeze([]),
      buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
    });
  }

  if (isProtectedExplorerHandoff(context)) return protectedExplorerPlan(context);

  const profile = STATE_PROFILES[context.state];
  const shape = shapeForContext(context);
  const contour = profile[shape];
  const preferredStart = START_BY_FUNCTION[context.arpFunction] ?? 1;
  const latestSafeStart = Math.max(0, 15 - (contour.length - 1));
  const start = Math.min(preferredStart, latestSafeStart);
  const instructions = Object.freeze(contour.map((midiOffset, index) => Object.freeze({
    voice: profile.voice,
    offsetSteps: start + index,
    midiOffset,
    velocity: velocityFor(profile, shape, index, contour.length, context.cycleRole),
    duration: profile.duration,
    ornament: "d4-arpeggio",
    size: "phrase",
    bar: context.bar,
    state: context.state,
    arpFunction: context.arpFunction,
    arpRole: "feature",
    contour: shape,
    timbreRole: `${context.state}-${shape}-${profile.voice}`,
    protectedEvent: false,
    protectedColourLayer: false,
    additive: true,
    harmonyHalf: 0,
    arpeggioBuildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  })));

  const endStep = instructions.length
    ? instructions[instructions.length - 1].offsetSteps
    : start;

  return Object.freeze({
    ...context,
    active: true,
    protectedEvent: false,
    role: "feature",
    contour: shape,
    timbreRole: `${context.state}-${shape}-${profile.voice}`,
    window: Object.freeze({ startStep: start, endStep }),
    spaceCategories: Object.freeze([]),
    instructions,
    buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  });
}

export function arpeggioInstructionsForPhrase(perfPlan = {}) {
  return arpeggioPlanForPhrase(perfPlan).instructions;
}

export function shouldCreateArpeggioSpace() {
  // D4 arpeggios are additive. They never mute, omit or replace any score layer.
  return false;
}
