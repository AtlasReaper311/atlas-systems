const UINT32_RANGE = 0x1_0000_0000;
const FALLBACK_SEED = 311;
export const DEFAULT_FRAME_MS = 1000 / 60;
export const TAU = Math.PI * 2;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeSeed(value, fallback = FALLBACK_SEED) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = parsed >>> 0;
  return normalized || fallback;
}

export function createRandom(seed = FALLBACK_SEED) {
  let state = normalizeSeed(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / UINT32_RANGE;
  };
}

export function timingSample(deltaMs, baselineMs = DEFAULT_FRAME_MS) {
  const baseline = clamp(Number(baselineMs) || DEFAULT_FRAME_MS, 4, 100);
  const delta = clamp(Number(deltaMs) || baseline, 0, 1000);
  const latenessMs = Math.max(0, delta - baseline);
  const normalized = clamp(latenessMs / (baseline * 4), 0, 1);

  let kind = "near";
  if (latenessMs > baseline * 4) kind = "stall";
  else if (latenessMs > baseline * 0.6) kind = "drag";

  return Object.freeze({
    baselineMs: baseline,
    deltaMs: delta,
    kind,
    latenessMs,
    normalized,
  });
}

export function createTrace(index, count, random) {
  const lane = index / count;
  return {
    index,
    phase: lane * TAU + random() * 0.08,
    rate: 0.000035 + random() * 0.000025,
    weave: 1.5 + Math.floor(random() * 5),
    depth: 0.72 + random() * 0.56,
    polarity: random() > 0.5 ? 1 : -1,
    previous: null,
  };
}

export function pointForTrace(trace, timeMs, sample, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const span = Math.min(safeWidth, safeHeight);
  const centreX = safeWidth / 2;
  const centreY = safeHeight / 2;
  const time = Math.max(0, Number(timeMs) || 0);
  const angle =
    trace.phase +
    time * trace.rate +
    Math.sin(time * 0.00009 + trace.phase * trace.weave) * 0.18;
  const quietOrbit =
    span * (0.255 + Math.sin(angle * trace.weave + trace.phase) * 0.052);
  const delayBloom =
    span * sample.normalized * 0.19 * trace.polarity * trace.depth;
  const radius = quietOrbit + delayBloom;
  const xStretch = 1 + Math.sin(trace.phase * 3) * 0.16;
  const yStretch = 0.82 + Math.cos(trace.phase * 2) * 0.12;
  const shear = sample.normalized * span * 0.035 * Math.sin(trace.phase * 7);

  return Object.freeze({
    x: clamp(centreX + Math.cos(angle) * radius * xStretch + shear, 0, safeWidth),
    y: clamp(centreY + Math.sin(angle) * radius * yStretch - shear * 0.4, 0, safeHeight),
  });
}

export function sampleLabel(sample) {
  if (sample.kind === "stall") return "long pause";
  if (sample.kind === "drag") return "late frame";
  if (sample.latenessMs > 1) return "drawing";
  return "drawing";
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
