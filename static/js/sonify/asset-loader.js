/**
 * Per-asset audio loader for System SYMPHONY.
 *
 * Each asset is loaded independently through ToneAudioBuffer so one missing or
 * undecodable file cannot block the rest of the instrument. Browser format
 * preference is evaluated once, then each asset retries the remaining supported
 * formats before yielding to the procedural instrument.
 */

const OPUS_TYPE = 'audio/ogg; codecs="opus"';
const AAC_TYPE = 'audio/mp4; codecs="mp4a.40.2"';
const DEFAULT_TIMEOUT_MS = 6500;

let cachedFormats = null;

function supported(value) {
  return value === "probably" || value === "maybe";
}

export function audioFormatCandidates() {
  if (cachedFormats) return cachedFormats;
  if (typeof Audio === "undefined") {
    cachedFormats = Object.freeze(["wav"]);
    return cachedFormats;
  }
  const probe = new Audio();
  const formats = [];
  if (supported(probe.canPlayType(OPUS_TYPE))) formats.push("opus");
  if (supported(probe.canPlayType(AAC_TYPE))) formats.push("m4a");
  formats.push("wav");
  cachedFormats = Object.freeze([...new Set(formats)]);
  return cachedFormats;
}

export function pickAudioFormat() {
  return audioFormatCandidates()[0];
}

export function resolveAssetUrl(template, format = pickAudioFormat()) {
  if (typeof template !== "string") return null;
  return template.replaceAll("%ext%", format);
}

export function resolveAssetUrls(template, formats = audioFormatCandidates()) {
  if (typeof template !== "string") return Object.freeze([]);
  return Object.freeze(formats.map((format) => resolveAssetUrl(template, format)));
}

function loadCandidate(Tone, id, url, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let buffer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      resolve(result);
    };

    try {
      buffer = new Tone.ToneAudioBuffer(
        url,
        () => globalThis.queueMicrotask(
          () => finish({ id, url, buffer, ok: true }),
        ),
        (error) => globalThis.queueMicrotask(() => {
          buffer?.dispose?.();
          finish({ id, url, buffer: null, ok: false, error });
        }),
      );
    } catch (error) {
      finish({ id, url, buffer: null, ok: false, error });
      return;
    }

    timer = globalThis.setTimeout(() => {
      buffer?.dispose?.();
      finish({
        id,
        url,
        buffer: null,
        ok: false,
        error: new Error(`system-symphony: asset ${id} exceeded ${timeoutMs} ms`),
      });
    }, timeoutMs);
  });
}

async function loadOne(Tone, id, urls, timeoutMs) {
  const candidates = Array.isArray(urls) ? urls.filter(Boolean) : [urls].filter(Boolean);
  if (candidates.length === 0) {
    return {
      id,
      ok: false,
      error: new Error(`system-symphony: asset ${id} has no delivery URL`),
    };
  }
  const attemptTimeoutMs = Math.max(1, Math.floor(timeoutMs / candidates.length));
  const errors = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const result = await loadCandidate(Tone, id, candidates[index], attemptTimeoutMs);
    if (result.ok) {
      return {
        ...result,
        attempts: index + 1,
        fallback: index > 0,
        format: candidates[index].split("?")[0].split(".").pop(),
      };
    }
    errors.push(result.error);
  }
  return {
    id,
    url: candidates.at(-1),
    buffer: null,
    ok: false,
    attempts: candidates.length,
    error: new AggregateError(
      errors,
      `system-symphony: asset ${id} failed all ${candidates.length} delivery formats`,
    ),
  };
}

export function createAssetLoader(Tone, {
  perAssetTimeoutMs = DEFAULT_TIMEOUT_MS,
  onProgress = null,
} = {}) {
  const buffers = new Map();
  const failures = new Map();
  const formats = new Map();
  const requested = new Set();
  let totalCompleted = 0;
  let fallbackCount = 0;

  function stats() {
    return Object.freeze({
      requested: requested.size,
      completed: totalCompleted,
      loaded: buffers.size,
      failed: failures.size,
      fallbacks: fallbackCount,
    });
  }

  function progress() {
    if (typeof onProgress === "function") onProgress(stats());
  }

  async function loadTier(assets) {
    if (!Array.isArray(assets) || assets.length === 0) {
      return { loaded: 0, failed: 0 };
    }
    const pending = assets.filter((asset) => asset?.id && !requested.has(asset.id));
    pending.forEach((asset) => requested.add(asset.id));
    progress();
    const results = await Promise.all(
      pending.map((asset) => loadOne(
        Tone,
        asset.id,
        asset.urls ?? asset.url,
        perAssetTimeoutMs,
      )),
    );
    let tierLoaded = 0;
    let tierFailed = 0;
    for (const result of results) {
      totalCompleted += 1;
      if (result.ok) {
        buffers.set(result.id, result.buffer);
        formats.set(result.id, result.format ?? null);
        if (result.fallback) fallbackCount += 1;
        tierLoaded += 1;
      } else {
        failures.set(result.id, result.error);
        tierFailed += 1;
        console.warn(`system-symphony: asset ${result.id} failed`, result.error);
      }
      progress();
    }
    return { loaded: tierLoaded, failed: tierFailed };
  }

  function disposeAll() {
    for (const buffer of buffers.values()) {
      try {
        buffer.dispose();
      } catch (error) {
        console.warn("system-symphony: buffer dispose failed", error);
      }
    }
    buffers.clear();
    failures.clear();
    formats.clear();
    requested.clear();
    totalCompleted = 0;
    fallbackCount = 0;
  }

  return {
    loadTier,
    get: (id) => buffers.get(id) ?? null,
    has: (id) => buffers.has(id),
    failed: (id) => failures.has(id),
    format: (id) => formats.get(id) ?? null,
    disposeAll,
    stats,
  };
}
