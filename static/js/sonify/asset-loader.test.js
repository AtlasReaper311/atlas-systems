import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssetLoader,
  pickAudioFormat,
  resolveAssetUrl,
} from "./asset-loader.js";

function fakeTone(failIds = new Set(), failExtensions = new Set(), hangExtensions = new Set()) {
  const disposed = [];
  class ToneAudioBuffer {
    constructor(url, onLoad, onError) {
      this.url = url;
      queueMicrotask(() => {
        const file = new URL(url, "https://preview.invalid").pathname.split("/").pop();
        const [id, extension] = file.split(".");
        if (hangExtensions.has(extension)) return;
        if (failIds.has(id) || failExtensions.has(extension)) onError(new Error(`missing ${file}`));
        else onLoad();
      });
    }
    get() { return { url: this.url }; }
    dispose() { disposed.push(this.url); }
  }
  return { Tone: { ToneAudioBuffer }, disposed };
}

test("asset URL templates resolve explicit delivery formats", () => {
  const template = "/static/audio/system-symphony/kick.%ext%?v=test";
  assert.equal(
    resolveAssetUrl(template, "opus"),
    "/static/audio/system-symphony/kick.opus?v=test",
  );
  assert.equal(resolveAssetUrl(template, "m4a").includes("%ext%"), false);
  assert.equal(pickAudioFormat(), "wav", "Node falls back to the universally decoded WAV asset");
});

test("a hanging asset attempt times out and fails closed", async () => {
  const runtime = fakeTone(new Set(), new Set(), new Set(["opus"]));
  const loader = createAssetLoader(runtime.Tone, { perAssetTimeoutMs: 20 });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    assert.deepEqual(await loader.loadTier([{
      id: "kick",
      urls: ["https://preview.invalid/kick.opus"],
    }]), { loaded: 0, failed: 1 });
    assert.equal(loader.failed("kick"), true);
    assert.equal(loader.stats().completed, 1);
  } finally {
    console.warn = originalWarn;
    loader.disposeAll();
  }
  assert.equal(runtime.disposed.length, 1);
});

test("assets load independently and expose bounded progress", async () => {
  const runtime = fakeTone(new Set(["snare"]));
  const progress = [];
  const loader = createAssetLoader(runtime.Tone, {
    perAssetTimeoutMs: 20,
    onProgress: (stats) => progress.push(stats),
  });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await loader.loadTier([
      { id: "kick", url: "https://preview.invalid/kick.opus" },
      { id: "snare", url: "https://preview.invalid/snare.opus" },
    ]);
    assert.deepEqual(result, { loaded: 1, failed: 1 });
    assert.equal(loader.has("kick"), true);
    assert.equal(loader.failed("snare"), true);
    assert.deepEqual(loader.stats(), {
      requested: 2,
      completed: 2,
      loaded: 1,
      failed: 1,
      fallbacks: 0,
    });
    assert.ok(progress.length >= 3);
  } finally {
    console.warn = originalWarn;
    loader.disposeAll();
  }
  assert.equal(runtime.disposed.length, 2, "failed and retained buffers are disposed");
});

test("a failed preferred codec retries the next supported asset format", async () => {
  const runtime = fakeTone(new Set(), new Set(["opus"]));
  const loader = createAssetLoader(runtime.Tone, { perAssetTimeoutMs: 60 });
  try {
    assert.deepEqual(await loader.loadTier([{
      id: "kick",
      urls: [
        "https://preview.invalid/kick.opus",
        "https://preview.invalid/kick.m4a",
        "https://preview.invalid/kick.wav",
      ],
    }]), { loaded: 1, failed: 0 });
    assert.equal(loader.format("kick"), "m4a");
    assert.deepEqual(loader.stats(), {
      requested: 1,
      completed: 1,
      loaded: 1,
      failed: 0,
      fallbacks: 1,
    });
  } finally {
    loader.disposeAll();
  }
  assert.equal(runtime.disposed.length, 2, "failed Opus and retained AAC buffers are disposed");
});

test("reloading a tier does not request the same asset twice", async () => {
  const runtime = fakeTone();
  const loader = createAssetLoader(runtime.Tone);
  const assets = [{ id: "kick", url: "https://preview.invalid/kick.opus" }];
  assert.deepEqual(await loader.loadTier(assets), { loaded: 1, failed: 0 });
  assert.deepEqual(await loader.loadTier(assets), { loaded: 0, failed: 0 });
  assert.equal(loader.stats().requested, 1);
  loader.disposeAll();
});
