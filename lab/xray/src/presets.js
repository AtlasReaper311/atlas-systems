/**
 * Scenario presets.
 *
 * Each preset is a complete configuration, set through the same object the
 * engine consumes, so a preset can never drift from what the switches can
 * express. Every preset keeps jitter off so its total is a stated, repeatable
 * number; jitter is a switch to toggle on top of any of them.
 */

export const PRESETS = Object.freeze([
  {
    id: "healthy-baseline",
    label: "Healthy baseline",
    blurb: "Cache answers, nothing retries.",
    config: {
      cacheHit: true,
      staleCache: false,
      rateLimit: false,
      retries: 0,
      timeoutMs: 250,
      serviceError: false,
      jitter: false,
    },
  },
  {
    id: "retry-storm",
    label: "Retry storm",
    blurb: "One request becomes three downstream calls.",
    config: {
      cacheHit: false,
      staleCache: false,
      rateLimit: false,
      retries: 2,
      timeoutMs: 250,
      serviceError: true,
      jitter: false,
    },
  },
  {
    id: "cache-stampede",
    label: "Cache stampede",
    blurb: "Every miss reaches for the database again.",
    config: {
      cacheHit: false,
      staleCache: false,
      rateLimit: false,
      retries: 2,
      timeoutMs: 100,
      serviceError: false,
      jitter: false,
    },
  },
  {
    id: "rate-limited",
    label: "Rate limited",
    blurb: "Refused at the router, before any cost.",
    config: {
      cacheHit: false,
      staleCache: false,
      rateLimit: true,
      retries: 2,
      timeoutMs: 250,
      serviceError: false,
      jitter: false,
    },
  },
  {
    id: "cascading-timeout",
    label: "Cascading timeout",
    blurb: "A deadline shorter than the work it guards.",
    config: {
      cacheHit: false,
      staleCache: false,
      rateLimit: false,
      retries: 3,
      timeoutMs: 50,
      serviceError: false,
      jitter: false,
    },
  },
]);

export function presetById(id) {
  return PRESETS.find((preset) => preset.id === id) ?? null;
}
