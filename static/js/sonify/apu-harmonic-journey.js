import { normalizedStateIdentity } from "./apu-state-identities.js?v=20260726-system-symphony-state-identities-v4";
import { voiceLeadHarmony } from "./apu-voice-leading.js?v=20260727-system-symphony-pass-d3-voice-leading-v1";

export const APU_HARMONIC_JOURNEY_D3_BUILD_ID =
  "20260727-system-symphony-pass-d3-harmonic-journey-v1";

export const APU_HARMONIC_REGIONS = Object.freeze([
  "home",
  "relative",
  "subdominant",
  "dominant-pressure",
  "suspended",
  "pedal",
  "recovery",
  "unknown-drift",
]);

const SECTION_FUNCTIONS = Object.freeze({
  intro: Object.freeze({ function: "tonic-ambiguity", region: "suspended" }),
  establish: Object.freeze({ function: "confirm-home", region: "home" }),
  "theme-a": Object.freeze({ function: "stable-statement", region: "home" }),
  variation: Object.freeze({ function: "depart-home", region: "subdominant" }),
  "theme-b": Object.freeze({ function: "contrast-region", region: "relative" }),
  build: Object.freeze({ function: "increase-pressure", region: "dominant-pressure" }),
  peak: Object.freeze({ function: "maximum-pressure", region: "pedal" }),
  release: Object.freeze({ function: "reduce-force", region: "suspended" }),
  recovery: Object.freeze({ function: "controlled-return", region: "recovery" }),
  breathe: Object.freeze({ function: "cadence-or-restart", region: "home" }),
});

const REGION_ROOTS = Object.freeze({
  home: Object.freeze([0, 0]),
  relative: Object.freeze([5, 2]),
  subdominant: Object.freeze([3, 4]),
  "dominant-pressure": Object.freeze([4, 4]),
  suspended: Object.freeze([3, 4]),
  pedal: Object.freeze([0, 4]),
  recovery: Object.freeze([4, 0]),
  "unknown-drift": Object.freeze([3, 0]),
});

const CYCLE_REGION_OVERRIDES = Object.freeze({
  statement: Object.freeze({}),
  development: Object.freeze({ variation: "relative", "theme-b": "subdominant" }),
  contrast: Object.freeze({ "theme-a": "relative", variation: "suspended", "theme-b": "dominant-pressure" }),
  reprise: Object.freeze({ variation: "subdominant", "theme-b": "relative", recovery: "recovery" }),
});

function safeState(value) {
  return ["healthy", "warning", "critical", "unknown"].includes(value) ? value : "unknown";
}

function cadenceFor(songPlan, state, section) {
  const requested = String(songPlan?.cadenceIntent ?? "open");
  const permitted = Boolean(songPlan?.evidenceAuthority?.resolutionPermitted);
  if (state === "critical") return Object.freeze({ intent: "interrupted", resolutionPermitted: false });
  if (state === "unknown") return Object.freeze({ intent: "no-cadence", resolutionPermitted: false });
  if (state === "warning") {
    return Object.freeze({ intent: section === "breathe" ? "suspended" : "open", resolutionPermitted: false });
  }
  if (requested === "recovery" && permitted) {
    return Object.freeze({ intent: "recovery", resolutionPermitted: true });
  }
  if (requested === "resolved" && permitted) {
    return Object.freeze({ intent: "resolved", resolutionPermitted: true });
  }
  if (section === "breathe") {
    return Object.freeze({ intent: permitted ? "resolved" : "restart", resolutionPermitted: permitted });
  }
  return Object.freeze({ intent: requested === "suspended" ? "suspended" : "open", resolutionPermitted: false });
}

function regionFor(songPlan, state, section, cadence) {
  if (state === "unknown") return "unknown-drift";
  if (section === "recovery" && cadence.intent === "recovery") return "recovery";
  if (section === "breathe" && !cadence.resolutionPermitted) return "suspended";
  const cycleRole = CYCLE_REGION_OVERRIDES[songPlan?.cycleRole] ? songPlan.cycleRole : "statement";
  const base = SECTION_FUNCTIONS[section]?.region ?? "home";
  return CYCLE_REGION_OVERRIDES[cycleRole][section] ?? base;
}

function qualityFor(state, region, half, cadence) {
  if (state === "critical") return half === 0 ? "power" : "tense";
  if (state === "unknown") return half === 0 ? "suspended" : "open";
  if (state === "warning") {
    if (["dominant-pressure", "pedal"].includes(region)) return "tense";
    return half === 0 ? "minor" : "suspended";
  }
  if (region === "dominant-pressure") return half === 0 ? "suspended" : "wide";
  if (region === "suspended") return "suspended";
  if (region === "relative") return "minor";
  if (region === "subdominant") return half === 0 ? "wide" : "open";
  if (["recovery", "home"].includes(region) && cadence.resolutionPermitted) return half === 0 ? "open" : "minor";
  return half === 0 ? "open" : "minor";
}

function scaleForFrame(frame, state) {
  const supplied = Array.isArray(frame?.scale) ? frame.scale.filter(Number.isFinite) : [];
  return supplied.length >= 3 ? supplied : normalizedStateIdentity(state).scale;
}

export function createHarmonicJourneyPlanner() {
  let previousVoicing = null;
  let latestKey = null;
  let latestJourney = null;
  let latestPhraseIndex = null;

  return Object.freeze({
    advancePhrase({ frame = {}, arrangement = null } = {}) {
      if (!arrangement || typeof arrangement !== "object") {
        throw new TypeError("apu-harmonic-journey: arrangement is required");
      }
      const phraseIndex = Math.max(0, Math.trunc(arrangement.phraseIndex ?? 0));
      if (latestPhraseIndex !== null && phraseIndex < latestPhraseIndex) {
        previousVoicing = null;
        latestKey = null;
        latestJourney = null;
      }
      const state = safeState(arrangement.scoreState);
      const section = String(arrangement.section ?? "establish");
      const songPlan = arrangement.songPlan ?? {};
      const key = [phraseIndex, state, section, songPlan.deterministicSignature ?? "none"].join(":");
      if (latestKey === key && latestJourney) return latestJourney;

      const cadence = cadenceFor(songPlan, state, section);
      const region = regionFor(songPlan, state, section, cadence);
      const roots = REGION_ROOTS[region] ?? REGION_ROOTS.home;
      const supportHarmony = roots.map((rootDegree, half) => Object.freeze({
        rootDegree,
        quality: qualityFor(state, region, half, cadence),
        inversion: state === "healthy" && half === 1 ? 1 : 0,
        region,
      }));
      const scale = scaleForFrame(frame, state);
      const first = voiceLeadHarmony({
        previousVoicing,
        targetHarmony: supportHarmony[0],
        state,
        scale,
        registerBounds: { minimum: state === "unknown" ? 45 : 48, maximum: 72 },
      });
      const second = voiceLeadHarmony({
        previousVoicing: first.midi,
        targetHarmony: supportHarmony[1],
        state,
        scale,
        registerBounds: { minimum: state === "unknown" ? 45 : 48, maximum: 72 },
      });
      previousVoicing = second.midi;
      latestPhraseIndex = phraseIndex;
      latestKey = key;
      latestJourney = Object.freeze({
        buildId: APU_HARMONIC_JOURNEY_D3_BUILD_ID,
        phraseIndex,
        cycleNumber: arrangement.cycleNumber ?? 0,
        cycleRole: songPlan.cycleRole ?? "statement",
        section,
        sectionFunction: SECTION_FUNCTIONS[section]?.function ?? "confirm-home",
        state,
        region,
        destination: cadence.resolutionPermitted ? "home" : region,
        cadenceIntent: cadence.intent,
        resolutionPermitted: cadence.resolutionPermitted,
        supportHarmony: Object.freeze(supportHarmony),
        supportVoicings: Object.freeze([first, second]),
        bassVelocityScale: state === "critical" ? 0.94 : 1,
        invariants: Object.freeze({
          primaryHarmony: "unchanged",
          primaryMidi: "unchanged",
          primaryPattern: "unchanged",
          motifMode: "unchanged",
          motifDegrees: "unchanged",
          transportBpm: 100,
        }),
      });
      return latestJourney;
    },
    reset() {
      previousVoicing = null;
      latestKey = null;
      latestJourney = null;
      latestPhraseIndex = null;
    },
  });
}
