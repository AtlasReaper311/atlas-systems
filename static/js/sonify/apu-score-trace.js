import {
  APU_SCORE_TRACE_BUILD_ID,
  APU_SCORE_TRACE_HISTORY_LIMIT,
  APU_SCORE_TRACE_SCHEMA_VERSION,
  createScoreTraceEntry as baselineCreateScoreTraceEntry,
  deepFreeze,
  fnv1aHex,
  stableStringify,
} from "./apu-score-trace-d2-baseline.js?v=20260727-system-symphony-pass-d0-score-trace-v1";
import {
  APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  arpeggioPlanForPhrase,
} from "./apu-arpeggio-composer-d4.js?v=20260727-system-symphony-pass-d4-arpeggio-composer-v2";

export {
  APU_SCORE_TRACE_BUILD_ID,
  APU_SCORE_TRACE_HISTORY_LIMIT,
  APU_SCORE_TRACE_SCHEMA_VERSION,
  deepFreeze,
  fnv1aHex,
  stableStringify,
};

function harmonyTrace(value) {
  return Object.freeze((Array.isArray(value) ? value : []).map((chord) => Object.freeze({
    rootDegree: Number.isFinite(chord?.rootDegree) ? chord.rootDegree : null,
    quality: typeof chord?.quality === "string" ? chord.quality : null,
    inversion: Number.isFinite(chord?.inversion) ? chord.inversion : null,
    region: typeof chord?.region === "string" ? chord.region : null,
  })));
}

function voicingTrace(value) {
  return Object.freeze((Array.isArray(value) ? value : []).map((voicing) => Object.freeze({
    midi: Object.freeze(Array.isArray(voicing?.midi) ? [...voicing.midi] : []),
    commonTones: Object.freeze(Array.isArray(voicing?.commonTones) ? [...voicing.commonTones] : []),
  })));
}

function arpeggioTrace(arrangement = {}) {
  const plan = arpeggioPlanForPhrase({
    state: arrangement.scoreState,
    phraseIndex: arrangement.phraseIndex,
    cycleNumber: arrangement.cycleNumber,
    cyclePhrase: arrangement.cyclePhrase,
    section: arrangement.section,
    songPlan: arrangement.songPlan,
  });
  return Object.freeze({
    buildId: APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
    active: plan.active,
    protectedEvent: plan.protectedEvent,
    protectedColourLayers: plan.instructions.filter((instruction) => instruction.protectedColourLayer).length,
    role: plan.role,
    arpFunction: plan.arpFunction,
    contour: plan.contour,
    timbreRole: plan.timbreRole,
    voices: Object.freeze([...new Set(plan.instructions.map((instruction) => instruction.voice))]),
    window: plan.window
      ? Object.freeze({
        startStep: plan.window.startStep,
        endStep: plan.window.endStep,
      })
      : null,
    spaceCategories: Object.freeze([...plan.spaceCategories]),
    noteCount: plan.instructions.length,
  });
}

export function createScoreTraceEntry(input = {}) {
  const baseline = baselineCreateScoreTraceEntry(input);
  const journey = input?.arrangement?.harmonicJourney;
  const arp = arpeggioTrace(input?.arrangement ?? {});
  const { deterministicSignature: ignored, ...basePayload } = baseline;
  const payload = {
    ...basePayload,
    harmonicRegion: journey?.region ?? null,
    harmonicDestination: journey?.destination ?? null,
    cadenceIntent: journey?.cadenceIntent ?? null,
    resolutionPermitted: Boolean(journey?.resolutionPermitted),
    supportHarmony: harmonyTrace(journey?.supportHarmony),
    supportVoicings: voicingTrace(journey?.supportVoicings),
    arpeggio: arp,
    decisionSources: Object.freeze([
      ...new Set([
        ...(Array.isArray(baseline.decisionSources) ? baseline.decisionSources : []),
        ...(journey ? ["apu-harmonic-journey", "apu-voice-leading"] : []),
        "apu-arpeggio-composer-d4",
      ]),
    ]),
  };
  return deepFreeze({
    ...payload,
    deterministicSignature: fnv1aHex(stableStringify(payload)),
  });
}

export function serializeScoreTrace(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return `${stableStringify(safeEntries)}\n`;
}

export function scoreTraceDigest(entries) {
  return fnv1aHex(serializeScoreTrace(entries));
}

export function createScoreTraceRecorder({
  limit = APU_SCORE_TRACE_HISTORY_LIMIT,
  onTrace = null,
} = {}) {
  const boundedLimit = Math.max(1, Math.min(4096, Math.trunc(limit) || APU_SCORE_TRACE_HISTORY_LIMIT));
  let history = [];

  return Object.freeze({
    record(input) {
      const entry = createScoreTraceEntry(input);
      const retained = boundedLimit > 1 ? history.slice(-(boundedLimit - 1)) : [];
      history = [...retained, entry];
      onTrace?.(entry);
      return entry;
    },
    getLatest() {
      return history.at(-1) ?? null;
    },
    getHistory() {
      return Object.freeze([...history]);
    },
    serialize() {
      return serializeScoreTrace(history);
    },
    reset() {
      history = [];
    },
  });
}
