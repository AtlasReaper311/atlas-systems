import {
  APU_MASTERING_BUILD_ID,
  masteringProfileForState,
} from "./apu-mastering.js?v=20260728-system-symphony-mastering-v5";

export const APU_MASTERING_RUNTIME_BUILD_ID = "20260728-system-symphony-mastering-runtime-v3";
export const APU_MASTERING_RUNTIME_POLL_MS = 100;

export function requiredDestinationTrimDb(upstreamGainDb, targetGainDb) {
  const upstream = Number(upstreamGainDb);
  const target = Number(targetGainDb);
  if (!Number.isFinite(upstream) || !Number.isFinite(target)) return 0;
  return Math.max(-18, Math.min(18, target - upstream));
}

function currentArrangement() {
  return globalThis.__ATLAS_APU__?.getArrangement?.() ?? null;
}

function destinationVolume() {
  return globalThis.Tone?.getDestination?.()?.volume ?? null;
}

let disposed = false;
let timer = null;
let previousDestinationDb = null;
let status = Object.freeze({
  buildId: APU_MASTERING_RUNTIME_BUILD_ID,
  policyBuildId: APU_MASTERING_BUILD_ID,
  state: "unknown",
  upstreamGainDb: null,
  targetGainDb: masteringProfileForState("unknown").masterGainDb,
  targetIntegratedLufs: masteringProfileForState("unknown").targetIntegratedLufs,
  appliedTrimDb: 0,
  active: false,
});

function publish(next) {
  status = Object.freeze({
    buildId: APU_MASTERING_RUNTIME_BUILD_ID,
    policyBuildId: APU_MASTERING_BUILD_ID,
    ...next,
  });
}

function applyCalibration() {
  if (disposed) return;
  const arrangement = currentArrangement();
  const volume = destinationVolume();
  const state = arrangement?.scoreState ?? "unknown";
  const profile = masteringProfileForState(state);
  const upstreamGainDb = arrangement?.timbre?.masterGainDb
    ?? arrangement?.stateIdentity?.masterGainDb
    ?? null;
  const appliedTrimDb = requiredDestinationTrimDb(upstreamGainDb, profile.masterGainDb);

  if (volume && Number.isFinite(volume.value)) {
    if (previousDestinationDb === null) previousDestinationDb = Number(volume.value) || 0;
    const targetDestinationDb = previousDestinationDb + appliedTrimDb;
    if (Math.abs(Number(volume.value) - targetDestinationDb) > 0.01) {
      const now = typeof globalThis.Tone?.now === "function" ? globalThis.Tone.now() : null;
      if (
        Number.isFinite(now)
        && typeof volume.cancelScheduledValues === "function"
        && typeof volume.setValueAtTime === "function"
        && typeof volume.linearRampToValueAtTime === "function"
      ) {
        volume.cancelScheduledValues(now);
        volume.setValueAtTime(Number(volume.value) || previousDestinationDb, now);
        volume.linearRampToValueAtTime(targetDestinationDb, now + 0.08);
      } else {
        volume.value = targetDestinationDb;
      }
    }
  }

  publish({
    state,
    upstreamGainDb: Number.isFinite(Number(upstreamGainDb)) ? Number(upstreamGainDb) : null,
    targetGainDb: profile.masterGainDb,
    targetIntegratedLufs: profile.targetIntegratedLufs,
    targetToleranceDb: profile.toleranceDb,
    appliedTrimDb,
    active: Boolean(volume && arrangement),
  });
}

function schedule() {
  if (disposed) return;
  applyCalibration();
  timer = globalThis.setTimeout(schedule, APU_MASTERING_RUNTIME_POLL_MS);
}

const browserRuntime = typeof globalThis.document !== "undefined"
  && typeof globalThis.addEventListener === "function";

if (browserRuntime) {
  schedule();
  globalThis.__ATLAS_APU_MASTERING_RUNTIME__ = Object.freeze({
    buildId: APU_MASTERING_RUNTIME_BUILD_ID,
    policyBuildId: APU_MASTERING_BUILD_ID,
    getStatus: () => status,
  });

  globalThis.addEventListener("pagehide", () => {
    disposed = true;
    if (timer !== null) globalThis.clearTimeout(timer);
    const volume = destinationVolume();
    if (volume && previousDestinationDb !== null) volume.value = previousDestinationDb;
  }, { once: true });
}
