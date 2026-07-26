/**
 * Atlas APU state-theme language.
 *
 * These profiles are descriptive composition rules, not audio scheduling code.
 * They let the score plan, debug UI and later synthesis rewrite share the same
 * authored vocabulary for why each estate state sounds different.
 */

export const ATLAS_APU_STATE_THEMES_BUILD_ID = "20260726-atlas-apu-state-themes-v1";

export const ATLAS_APU_STATE_THEME_KEYS = Object.freeze([
  "healthy",
  "warning",
  "critical",
  "unknown",
  "recovery",
]);

function freezeArray(values) {
  return Object.freeze([...values]);
}

function theme({
  id,
  movement,
  emotionalIntent,
  chapterRole,
  harmonicColor,
  motif,
  bassPattern,
  noisePattern,
  counterline,
  transitionBias,
  densityBias,
  register,
  mastering,
  beauty,
  urgency,
  evidenceFocus,
  constraints,
}) {
  return Object.freeze({
    id,
    movement,
    emotionalIntent,
    chapterRole,
    harmonicColor,
    motif: Object.freeze({
      name: motif.name,
      degrees: freezeArray(motif.degrees),
      contour: motif.contour,
      notePolicy: motif.notePolicy,
    }),
    bassPattern,
    noisePattern,
    counterline,
    transitionBias,
    densityBias,
    register,
    mastering,
    range: Object.freeze({ beauty, urgency }),
    evidenceFocus: freezeArray(evidenceFocus),
    constraints: freezeArray(constraints),
  });
}

export const ATLAS_APU_STATE_THEMES = Object.freeze({
  healthy: theme({
    id: "healthy",
    movement: "Green Clock",
    emotionalIntent: "open, heroic, stable",
    chapterRole: "title-screen confidence for confirmed estate health",
    harmonicColor: "F core with Dorian/Lydian-ish lift",
    motif: {
      name: "wide title motif A",
      degrees: [0, 2, 4, 6, 5, 4, 2, 0],
      contour: "wide-open return",
      notePolicy: "confident eight-note statement",
    },
    bassPattern: "confident walk",
    noisePattern: "light ticks",
    counterline: "consonant",
    transitionBias: "bloom",
    densityBias: 0.08,
    register: "open mid-high",
    mastering: "wide confidence",
    beauty: 0.82,
    urgency: 0.16,
    evidenceFocus: ["current measurements", "known-state ratio", "uptime confidence"],
    constraints: ["wider intervals", "stable bass", "no alarm ornaments"],
  }),
  warning: theme({
    id: "warning",
    movement: "Warning Pressure",
    emotionalIntent: "tense, mobile, under pressure",
    chapterRole: "overworld pressure when degraded evidence is present",
    harmonicColor: "F Phrygian pressure color",
    motif: {
      name: "diagnostic motif B",
      degrees: [0, 1, 3, 1, 4, 3, 1, 0],
      contour: "narrow diagnostic loop",
      notePolicy: "short gates and offbeat displacement",
    },
    bassPattern: "pressure pedal",
    noisePattern: "offbeat ticks",
    counterline: "diagnostic",
    transitionBias: "tighten",
    densityBias: 0.18,
    register: "narrow mid",
    mastering: "tight pressure",
    beauty: 0.48,
    urgency: 0.56,
    evidenceFocus: ["degraded services", "latency pressure", "warning weight"],
    constraints: ["narrow duty cycles", "syncopation", "counterline intrusion"],
  }),
  critical: theme({
    id: "critical",
    movement: "Critical Choke",
    emotionalIntent: "sparse, forceful, consequential",
    chapterRole: "boss-room pressure for incidents, down services or low health",
    harmonicColor: "F Phrygian dominant impact color",
    motif: {
      name: "interrupt motif C",
      degrees: [0, 4, 0, 1, 0, 4],
      contour: "clipped impact call",
      notePolicy: "few notes, low register, no decorative fill",
    },
    bassPattern: "octave alarm",
    noisePattern: "burst impacts",
    counterline: "hazard",
    transitionBias: "choke",
    densityBias: 0.04,
    register: "low locked",
    mastering: "limited impact",
    beauty: 0.22,
    urgency: 0.94,
    evidenceFocus: ["active incidents", "down services", "aggregate health below 50%"],
    constraints: ["sparse motif", "lower bass", "noise bursts only when earned"],
  }),
  unknown: theme({
    id: "unknown",
    movement: "Unknown Drift",
    emotionalIntent: "beautiful and uneasy",
    chapterRole: "fog-of-war honesty for stale, missing or unresolved evidence",
    harmonicColor: "F suspended carrier color",
    motif: {
      name: "question motif D",
      degrees: [0, 2, 0, 4, 2],
      contour: "unresolved question",
      notePolicy: "missing-beat gaps and soft unstable arps",
    },
    bassPattern: "carrier drift",
    noisePattern: "missing-beat gaps",
    counterline: "absent",
    transitionBias: "dropout",
    densityBias: -0.1,
    register: "hollow middle",
    mastering: "soft unstable carrier",
    beauty: 0.72,
    urgency: 0.18,
    evidenceFocus: ["stale telemetry", "reported unknown rows", "topology-only components"],
    constraints: ["never pretend certainty", "bounded carrier hum", "beautiful rather than broken"],
  }),
  recovery: theme({
    id: "recovery",
    movement: "Recovery Bloom",
    emotionalIntent: "bright, repaired, opening",
    chapterRole: "state improvement accent, not a permanent health claim",
    harmonicColor: "main key resolution with bright upper accents",
    motif: {
      name: "rising restore motif R",
      degrees: [0, 2, 4, 5, 7, 5, 4, 2],
      contour: "rising resolve",
      notePolicy: "bright arpeggio only when the transition proves recovery",
    },
    bassPattern: "stabilising pedal",
    noisePattern: "thinning ticks",
    counterline: "answer",
    transitionBias: "resolve",
    densityBias: 0.02,
    register: "upper accent over stable mid",
    mastering: "opening confidence",
    beauty: 0.78,
    urgency: 0.32,
    evidenceFocus: ["state improvement", "fresh known evidence", "deployment or recovery transition"],
    constraints: ["accent voice only", "no fake all-clear", "resolve carrier before celebration"],
  }),
});

export function themeForState(state) {
  return ATLAS_APU_STATE_THEMES[state] ?? ATLAS_APU_STATE_THEMES.unknown;
}

export function themeForTransition(transition = {}, dominantState = "unknown") {
  const id = String(transition?.id ?? "");
  if (id.includes("recovery") || id.includes("resolve")) {
    return ATLAS_APU_STATE_THEMES.recovery;
  }
  return themeForState(dominantState);
}
