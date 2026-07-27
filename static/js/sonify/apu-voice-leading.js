/**
 * Deterministic support-voice leading for System Symphony Pass D3.
 *
 * The approved primary melody is outside this module's authority.
 */

export const APU_VOICE_LEADING_D3_BUILD_ID =
  "20260727-system-symphony-pass-d3-voice-leading-v1";

const QUALITY_DEGREES = Object.freeze({
  open: Object.freeze([0, 4, 7]),
  wide: Object.freeze([0, 4, 9]),
  minor: Object.freeze([0, 2, 4]),
  suspended: Object.freeze([0, 3, 4]),
  tense: Object.freeze([0, 1, 4]),
  power: Object.freeze([0, 4, 7]),
});

const modulo = (value, length) => ((Math.trunc(value) % length) + length) % length;

function safeScale(scale) {
  const source = Array.isArray(scale) ? scale.filter(Number.isFinite) : [];
  const unique = [...new Set(source.map((offset) => modulo(offset, 12)))].sort((a, b) => a - b);
  return unique.length >= 3 ? unique : [0, 2, 3, 5, 7, 9, 10];
}

function scaleMidi(scale, rootMidi, degree) {
  const safe = safeScale(scale);
  const value = Math.trunc(degree);
  const octave = Math.floor(value / safe.length) * 12;
  return rootMidi + safe[modulo(value, safe.length)] + octave;
}

function candidateNotes(scale, rootDegree, chordDegree, minimum, maximum) {
  const candidates = [];
  for (let octave = -3; octave <= 7; octave += 1) {
    const midi = scaleMidi(scale, 41, rootDegree + chordDegree + octave * safeScale(scale).length);
    if (midi >= minimum && midi <= maximum) candidates.push(midi);
  }
  return candidates;
}

function combinations(groups, index = 0, prefix = [], result = []) {
  if (index >= groups.length) {
    result.push(prefix);
    return result;
  }
  for (const value of groups[index]) combinations(groups, index + 1, [...prefix, value], result);
  return result;
}

function scoreVoicing(candidate, previous) {
  const sorted = [...candidate].sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length) return Infinity;
  if (sorted.at(-1) - sorted[0] > 24) return Infinity;

  const prior = Array.isArray(previous) ? [...previous].sort((a, b) => a - b) : [];
  let score = sorted.reduce((total, note, index) => {
    const target = prior[index] ?? (55 + index * 7);
    return total + Math.abs(note - target);
  }, 0);

  if (prior.length) {
    const common = sorted.filter((note) => prior.includes(note)).length;
    score -= common * 7;
    const largestMove = Math.max(...sorted.map((note, index) => Math.abs(note - (prior[index] ?? note))));
    if (largestMove > 7) score += (largestMove - 7) * 5;
  }

  score += Math.abs((sorted[0] + sorted.at(-1)) / 2 - 61) * 0.08;
  return score;
}

export function voiceLeadHarmony({
  previousVoicing = null,
  targetHarmony = null,
  state = "unknown",
  scale = null,
  registerBounds = null,
} = {}) {
  const minimum = Math.max(36, Math.trunc(registerBounds?.minimum ?? 48));
  const maximum = Math.min(84, Math.trunc(registerBounds?.maximum ?? 74));
  const harmony = targetHarmony && typeof targetHarmony === "object"
    ? targetHarmony
    : { rootDegree: 0, quality: "minor", inversion: 0 };
  const quality = QUALITY_DEGREES[harmony.quality] ? harmony.quality : "minor";
  const degrees = state === "unknown"
    ? Object.freeze([QUALITY_DEGREES[quality][0], QUALITY_DEGREES[quality].at(-1)])
    : QUALITY_DEGREES[quality];
  const groups = degrees.map((degree) => candidateNotes(
    scale,
    Math.trunc(harmony.rootDegree ?? 0),
    degree,
    minimum,
    maximum,
  ));
  const viable = combinations(groups)
    .map((candidate) => [...candidate].sort((a, b) => a - b))
    .filter((candidate) => candidate.length === degrees.length && new Set(candidate).size === candidate.length);
  viable.sort((left, right) => {
    const difference = scoreVoicing(left, previousVoicing) - scoreVoicing(right, previousVoicing);
    if (difference !== 0) return difference;
    return left.join(",").localeCompare(right.join(","));
  });
  const voicing = viable[0] ?? [minimum, Math.min(maximum, minimum + 7)];

  return Object.freeze({
    buildId: APU_VOICE_LEADING_D3_BUILD_ID,
    state,
    harmony: Object.freeze({
      rootDegree: Math.trunc(harmony.rootDegree ?? 0),
      quality,
      inversion: Math.max(0, Math.trunc(harmony.inversion ?? 0)),
    }),
    midi: Object.freeze(voicing),
    commonTones: Object.freeze(
      voicing.filter((note) => Array.isArray(previousVoicing) && previousVoicing.includes(note)),
    ),
    register: Object.freeze({ minimum, maximum }),
  });
}
