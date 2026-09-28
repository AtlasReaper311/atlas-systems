const AUDIO_RUNTIME_STATUSES = Object.freeze([
  "pass",
  "capability-unavailable",
  "fail",
]);

export function classifyAudioRuntime({ replayPostConsentState, environmentProbe }) {
  if (replayPostConsentState === "running") return "pass";
  if (
    replayPostConsentState === "suspended"
    && environmentProbe?.capability === "unavailable"
  ) return "capability-unavailable";
  return "fail";
}

export function buildAudioRuntimeEvidence({
  replayInitialState,
  replayPostConsentState,
  environmentProbe = null,
}) {
  const status = classifyAudioRuntime({ replayPostConsentState, environmentProbe });
  return {
    replayInitialState: replayInitialState ?? null,
    replayPostConsentState: replayPostConsentState ?? null,
    environmentProbe,
    status,
    audioPlaybackObserved: status === "pass",
  };
}

/**
 * Probe Web Audio with a fresh context and a real Playwright click. This
 * helper knows nothing about the replay page; it only records what this
 * browser environment can do after an explicit user gesture.
 */
export async function runIndependentWebAudioCapabilityProbe(page, { timeout = 1_500 } = {}) {
  const selector = "[data-atlas-audio-capability-probe]";
  await page.evaluate(({ selector: probeSelector, probeTimeout }) => {
    document.querySelector(probeSelector)?.remove();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Probe Web Audio capability";
    button.dataset.atlasAudioCapabilityProbe = "pending";
    button.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647";
    const result = {
      apiPresent: false,
      initialState: null,
      resumeAttempted: false,
      resumePromiseOutcome: null,
      finalState: null,
      capability: "unavailable",
      error: null,
    };
    const stringifyError = (error) => error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);

    button.addEventListener("click", async () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      result.apiPresent = Boolean(AudioContextClass);
      if (!AudioContextClass) {
        result.error = "AudioContext API unavailable";
        button.dataset.atlasAudioCapabilityProbe = "complete";
        window.__ATLAS_AUDIO_CAPABILITY_PROBE__ = result;
        return;
      }

      let context;
      try {
        context = new AudioContextClass();
        result.initialState = context.state;
        if (context.state === "suspended") {
          result.resumeAttempted = true;
          try {
            const resumePromise = Promise.resolve(context.resume());
            result.resumePromiseOutcome = await Promise.race([
              resumePromise.then(() => "fulfilled", (error) => {
                result.error = stringifyError(error);
                return "rejected";
              }),
              new Promise((resolve) => window.setTimeout(() => resolve("timeout"), probeTimeout)),
            ]);
            if (result.resumePromiseOutcome === "timeout") {
              result.error = "AudioContext.resume() did not settle before the probe timeout";
            }
          } catch (error) {
            result.resumePromiseOutcome = "rejected";
            result.error = stringifyError(error);
          }
        }
        result.finalState = context.state;
        result.capability = result.finalState === "running" ? "available" : "unavailable";
      } catch (error) {
        result.error = stringifyError(error);
        result.capability = "unavailable";
      } finally {
        if (context) {
          try {
            await Promise.race([
              Promise.resolve(context.close()),
              new Promise((resolve) => window.setTimeout(resolve, probeTimeout)),
            ]);
          } catch (error) {
            result.error ||= `AudioContext.close() failed: ${stringifyError(error)}`;
          }
        }
        button.dataset.atlasAudioCapabilityProbe = "complete";
        window.__ATLAS_AUDIO_CAPABILITY_PROBE__ = result;
      }
    }, { once: true });
    document.body.append(button);
  }, { selector, probeTimeout: timeout });

  await page.locator(selector).click();
  await page.waitForFunction(
    (probeSelector) => document.querySelector(probeSelector)?.dataset.atlasAudioCapabilityProbe === "complete",
    selector,
    { timeout: timeout * 2 + 1_000 },
  );
  const result = await page.evaluate(() => window.__ATLAS_AUDIO_CAPABILITY_PROBE__ || null);
  await page.locator(selector).evaluate((button) => button.remove());
  if (!result) throw new Error("Independent Web Audio capability probe returned no result");
  return result;
}

export { AUDIO_RUNTIME_STATUSES };
