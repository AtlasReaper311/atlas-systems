export const APU_ARPEGGIO_COMPOSER_D4_BUILD_ID =
  "20260727-system-symphony-pass-d4-arpeggio-composer-v2";

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
  connector: 8,
  answer: 18,
  lift: 4,
  ostinato: 8,
  fracture: 14,
  reprise: 14,
  cadence: 20,
});

const STATE_PROFILES = Object.freeze({
  healthy: Object.freeze({
    label: "Explorer",
    spacing: 2,
    duration: "32n",
    answerVoice: "secondary",
    foregroundVoice: "secondary",
    foregroundVelocity: 0.25,
    answerVelocity: 0.22,
    spaceCategories: Object.freeze(["primary", "secondary", "pad", "service"]),
    contours: Object.freeze({
      connector: Object.freeze([0, 4, 7, 12]),
      answer: Object.freeze([12, 7, 4, 0]),
      lift: Object.freeze([0, 4, 7, 12, 16]),
      ostinato: Object.freeze([0, 7, 12, 7]),
      fracture: Object.freeze([12, 7, 4]),
      reprise: Object.freeze([12, 7, 4, 0, 4]),
      cadence: Object.freeze([7, 4, 0]),
    }),
  }),
  warning: Object.freeze({
    label: "Grid Pressure",
    spacing: 2,
    duration: "32n",
    answerVoice: "secondary",
    foregroundVoice: "accent",
    foregroundVelocity: 0.235,
    answerVelocity: 0.21,
    spaceCategories: Object.freeze(["primary", "secondary", "pad", "service"]),
    contours: Object.freeze({
      connector: Object.freeze([0, 3, 7, 10]),
      answer: Object.freeze([10, 7, 3, 0]),
      lift: Object.freeze([0, 3, 6, 10, 13]),
      ostinato: Object.freeze([0, 3, 7, 3]),
      fracture: Object.freeze([10, 3, 7, 0]),
      reprise: Object.freeze([10, 7, 3, 0]),
      cadence: Object.freeze([7, 3, 0]),
    }),
  }),
  critical: Object.freeze({
    label: "Boss Protocol",
    spacing: 3,
    duration: "32n",
    answerVoice: "secondary",
    foregroundVoice: "accent",
    foregroundVelocity: 0.23,
    answerVelocity: 0.205,
    spaceCategories: Object.freeze(["primary", "secondary", "pad", "service"]),
    contours: Object.freeze({
      connector: Object.freeze([0, 7, 12]),
      answer: Object.freeze([12, 7, 0]),
      lift: Object.freeze([0, 7, 12, 19]),
      ostinato: Object.freeze([0, 12, 7, 12]),
      fracture: Object.freeze([12, 0, 7]),
      reprise: Object.freeze([12, 7, 0]),
      cadence: Object.freeze([7, 0]),
    }),
  }),
  unknown: Object.freeze({
    label: "Lost Signal",
    spacing: 4,
    duration: "8n",
    answerVoice: "secondary",
    foregroundVoice: "secondary",
    foregroundVelocity: 0.19,
    answerVelocity: 0.165,
    spaceCategories: Object.freeze(["primary", "secondary", "pad", "service"]),
    contours: Object.freeze({
      connector: Object.freeze([0, 5, 12]),
      answer: Object.freeze([12, 5, 0]),
      lift: Object.freeze([0, 5, 7, 12]),
      ostinato: Object.freeze([0, 7, 5]),
      fracture: Object.freeze([12, 0, 5]),
      reprise: Object.freeze([7, 5, 0]),
      cadence: Object.freeze([5, 0]),
    }),
  }),
});

const PROTECTED_COLOUR_LAYERS = Object.freeze({
  statement: null,
  development: Object.freeze({ voice: "secondary", velocityScale: 0.42, label: "hollow-halo" }),
  contrast: Object.freeze({ voice: "accent", velocityScale: 0.34, label: "narrow-spark" }),
  reprise: Object.freeze({ voice: "secondary", velocityScale: 0.3, label: "soft-recall" }),
});

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;
const safeState = (state) => STATES.includes(state) ? state : "unknown";
const safeCycleRole = (role, cycleNumber = 0) => {
  if (APU_D4_CYCLE_ROLES.includes(role)) return role;
  const cycle = Math.max(0, Math.trunc(cycleNumber));
  if (cycle === 0) return "statement";
  return ["development", "contrast", "reprise"][modulo(cycle - 1, 3)];
};

function freezeArray(values) {
  return Object.freeze([...values]);
}

function rotate(values, amount) {
  if (!values.length) return [];
  const offset = modulo(amount, values.length);
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function transformedContour(base, cycleRole, cycleNumber) {
  if (cycleRole === "statement") return [...base];
  if (cycleRole === "development") {
    return rotate(base, 1 + modulo(cycleNumber, Math.max(1, base.length - 1)));
  }
  if (cycleRole === "contrast") {
    return rotate([...base].reverse(), modulo(cycleNumber, Math.max(1, base.length)));
  }
  if (base.length <= 2) return [...base];
  return [...base, base[0]];
}

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
  const cycleRole = safeCycleRole(perfPlan.songPlan?.cycleRole ?? perfPlan.cycleRole, cycleNumber);
  const state = safeState(perfPlan.state ?? perfPlan.songPlan?.state);
  const section = String(
    perfPlan.section
      ?? perfPlan.songPlan?.section
      ?? SECTION_BY_PHRASE[cyclePhrase],
  );
  const arpFunction = String(
    perfPlan.songPlan?.arpFunction
      ?? ARP_FUNCTION_BY_SECTION[section]
      ?? "connector",
  );
  return Object.freeze({
    phraseIndex,
    cycleNumber,
    cyclePhrase,
    cycleRole,
    state,
    section,
    arpFunction: START_BY_FUNCTION[arpFunction] === undefined ? "connector" : arpFunction,
    bar: perfPlan.bars ?? phraseIndex * 2,
  });
}

function isProtectedExplorerHandoff(context) {
  return context.state === APU_D4_PROTECTED_EXPLORER_HANDOFF.state
    && context.cyclePhrase === APU_D4_PROTECTED_EXPLORER_HANDOFF.cyclePhrase;
}

function passageIsForeground(context) {
  if (isProtectedExplorerHandoff(context)) return false;
  if (["build", "release", "recovery"].includes(context.section)) return true;
  if (context.cyclePhrase === 6) return true;
  if (context.state !== "healthy" && context.cyclePhrase === 4) return true;
  return context.cycleRole === "development" && [3, 6, 13].includes(context.cyclePhrase);
}

function protectedCoreInstructions(context) {
  return APU_D4_PROTECTED_EXPLORER_HANDOFF.steps.map((offsetSteps, index) => Object.freeze({
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
    contour: "descending-shimmer",
    timbreRole: "primary-core",
    protectedEvent: true,
    protectedColourLayer: false,
    arpeggioBuildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  }));
}

function protectedColourInstructions(context) {
  const layer = PROTECTED_COLOUR_LAYERS[context.cycleRole];
  if (!layer) return [];
  return APU_D4_PROTECTED_EXPLORER_HANDOFF.steps.map((offsetSteps, index) => Object.freeze({
    voice: layer.voice,
    offsetSteps,
    midiOffset: APU_D4_PROTECTED_EXPLORER_HANDOFF.offsets[index],
    velocity: Number((APU_D4_PROTECTED_EXPLORER_HANDOFF.velocities[index] * layer.velocityScale).toFixed(3)),
    duration: APU_D4_PROTECTED_EXPLORER_HANDOFF.duration,
    ornament: "d4-arpeggio-colour",
    size: "phrase",
    bar: context.bar,
    state: context.state,
    arpFunction: "protected-handoff-colour",
    arpRole: "colour",
    contour: "descending-shimmer",
    timbreRole: layer.label,
    protectedEvent: false,
    protectedColourLayer: true,
    arpeggioBuildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  }));
}

function protectedExplorerPlan(context) {
  const core = protectedCoreInstructions(context);
  const colour = protectedColourInstructions(context);
  const instructions = Object.freeze([...core, ...colour]);
  return Object.freeze({
    ...context,
    active: true,
    protectedEvent: true,
    role: "answer",
    contour: "descending-shimmer",
    timbreRole: colour.length ? `primary-core+${colour[0].timbreRole}` : "primary-core",
    window: Object.freeze({ startStep: 28, endStep: 30 }),
    spaceCategories: Object.freeze([]),
    instructions,
    buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  });
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
  const baseContour = profile.contours[context.arpFunction] ?? profile.contours.connector;
  const contour = transformedContour(baseContour, context.cycleRole, context.cycleNumber);
  const foreground = passageIsForeground(context);
  const voice = foreground ? profile.foregroundVoice : profile.answerVoice;
  const start = START_BY_FUNCTION[context.arpFunction] ?? START_BY_FUNCTION.connector;
  const baseVelocity = foreground ? profile.foregroundVelocity : profile.answerVelocity;
  const cycleVelocityScale = context.cycleRole === "development"
    ? 1.02
    : context.cycleRole === "contrast"
      ? 0.96
      : context.cycleRole === "reprise"
        ? 0.92
        : 1;
  const instructions = contour.map((midiOffset, index) => Object.freeze({
    voice,
    offsetSteps: start + index * profile.spacing,
    midiOffset,
    velocity: Number(Math.max(0.1, baseVelocity * cycleVelocityScale - index * 0.008).toFixed(3)),
    duration: profile.duration,
    ornament: "d4-arpeggio",
    size: "phrase",
    bar: context.bar,
    state: context.state,
    arpFunction: context.arpFunction,
    arpRole: foreground ? "foreground" : "answer",
    contour: context.cycleRole,
    timbreRole: `${context.state}-${context.cycleRole}-${context.arpFunction}-${voice}`,
    protectedEvent: false,
    protectedColourLayer: false,
    arpeggioBuildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  }));
  const lastStep = instructions.length
    ? instructions[instructions.length - 1].offsetSteps
    : start;

  return Object.freeze({
    ...context,
    active: true,
    protectedEvent: false,
    role: foreground ? "foreground" : "answer",
    contour: context.cycleRole,
    timbreRole: `${context.state}-${context.cycleRole}-${context.arpFunction}-${voice}`,
    window: Object.freeze({
      startStep: Math.max(0, start - 1),
      endStep: Math.min(31, lastStep + 1),
    }),
    spaceCategories: foreground ? freezeArray(profile.spaceCategories) : Object.freeze([]),
    instructions: Object.freeze(instructions),
    buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  });
}

export function arpeggioInstructionsForPhrase(perfPlan = {}) {
  return arpeggioPlanForPhrase(perfPlan).instructions;
}

export function shouldCreateArpeggioSpace({ perfPlan, category, stepIndex } = {}) {
  const plan = arpeggioPlanForPhrase(perfPlan);
  if (!plan.active || plan.role !== "foreground" || !plan.window) return false;
  if (!plan.spaceCategories.includes(category)) return false;
  const localStep = modulo(stepIndex ?? 0, 32);
  return localStep >= plan.window.startStep && localStep <= plan.window.endStep;
}
