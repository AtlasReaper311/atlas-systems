/**
 * Per-asset audio loader for System SYMPHONY.
 *
 * Each asset is loaded independently through ToneAudioBuffer so one missing or
 * undecodable file cannot block the rest of the instrument. Browser format
 * selection is evaluated once and reused for every asset URL.
 */

const OPUS_TYPE = 'audio/ogg; codecs="opus"';
const AAC_TYPE = 'audio/mp4; codecs="mp4a.40.2"';
const DEFAULT_TIMEOUT_MS = 6500;

let cachedFormat = null;

export function pickAudioFormat() {
  if (cachedFormat) return cachedFormat;
  if (typeof Audio === "undefined") {
    cachedFormat = "wav";
    return cachedFormat;
  }
  const probe = new Audio();
  const opus = probe.canPlayType(OPUS_TYPE);
  const aac = probe.canPlayType(AAC_TYPE);
  if (opus === "probably" || opus === "maybe") {
    cachedFormat = "opus";
  } else if (aac === "probably" || aac === "maybe") {
    cachedFormat = "m4a";
  } else {
    cachedFormat = "wav";
  }
  return cachedFormat;
}

export function resolveAssetUrl(template, format = pickAudioFormat()) {
  if (typeof template !== "string") return null;
  return template.replaceAll("%ext%", format);
}

function loadOne(Tone, id, url, timeoutMs) {
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

export function createAssetLoader(Tone, {
  perAssetTimeoutMs = DEFAULT_TIMEOUT_MS,
  onProgress = null,
} = {}) {
  const buffers = new Map();
  const failures = new Map();
  const requested = new Set();
  let totalCompleted = 0;

  function stats() {
    return Object.freeze({
      requested: requested.size,
      completed: totalCompleted,
      loaded: buffers.size,
      failed: failures.size,
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
        asset.url,
        perAssetTimeoutMs,
      )),
    );
    let tierLoaded = 0;
    let tierFailed = 0;
    for (const result of results) {
      totalCompleted += 1;
      if (result.ok) {
        buffers.set(result.id, result.buffer);
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
    requested.clear();
    totalCompleted = 0;
  }

  return {
    loadTier,
    get: (id) => buffers.get(id) ?? null,
    has: (id) => buffers.has(id),
    failed: (id) => failures.has(id),
    disposeAll,
    stats,
  };
}
