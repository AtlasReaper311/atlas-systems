/**
 * Explanation library.
 *
 * The summary line is chosen from a fixed set of templates by matching the
 * shape of the trace, then filled with numbers from that run. Nothing here
 * writes prose at runtime, so every sentence the tool can produce is visible
 * in this file and reviewable as source.
 *
 * Order matters. The first template whose predicate accepts the trace wins,
 * so the more specific shapes are listed before the more general ones.
 */

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * True when the database was reached on every attempt and each of those reads
 * consumed at least half the per-attempt deadline. That separates a run where
 * the database is the load from a run where the deadline was already spent
 * before the database was reached.
 */
function databaseDominated({ hops, summary, config }) {
  const databaseHops = hops.filter((hop) => hop.layer === "database");
  if (databaseHops.length === 0 || databaseHops.length !== summary.attempts) return false;
  return databaseHops.every((hop) => hop.latencyMs * 2 >= config.timeoutMs);
}

/** @type {Array<{id: string, title: string, matches: (context: object) => boolean, render: (context: object) => string}>} */
const TEMPLATES = [
  {
    id: "rate-limited",
    title: "Rate limited",
    matches: ({ summary }) => summary.outcome === "rate_limited",
    render: ({ summary }) =>
      `The router rejected this request in ${summary.totalLatencyMs}ms without calling anything downstream. ` +
      "Rate limiting is the cheapest failure in the pipeline, because it refuses the work before the work costs anything.",
  },
  {
    id: "retry-storm",
    title: "Retry storm",
    matches: ({ summary }) => summary.outcome === "exhausted" && summary.errored,
    render: ({ summary, config }) =>
      `The service failed on all ${summary.attempts} attempts, so one browser request became ` +
      `${plural(summary.downstreamCalls, "downstream call", "downstream calls")} and still returned nothing after ` +
      `${summary.totalLatencyMs}ms. The ${plural(config.retries, "retry", "retries")} multiplied load against a service ` +
      "that was already unhealthy, costing time and traffic without changing the answer.",
  },
  {
    id: "cache-stampede",
    title: "Cache stampede",
    matches: (context) => context.summary.outcome === "exhausted" && context.summary.timedOut && databaseDominated(context),
    render: ({ summary, config }) =>
      `Every attempt missed the cache and went to the database, so a single request queued ` +
      `${plural(summary.downstreamCalls, "database read", "database reads")} in ${summary.totalLatencyMs}ms and none of ` +
      `them finished inside the ${config.timeoutMs}ms deadline. This is how a cold cache turns retry logic into a load ` +
      "generator: the slower the database gets, the more reads the retries send it.",
  },
  {
    id: "cascading-timeout",
    title: "Cascading timeout",
    matches: ({ summary }) => summary.outcome === "exhausted" && summary.timedOut,
    render: ({ summary, config }) =>
      `Every attempt ran past the ${config.timeoutMs}ms deadline, and each retry waited longer before starting than the ` +
      `one before it. Elapsed time reached ${summary.totalLatencyMs}ms across ` +
      `${plural(summary.downstreamCalls, "downstream call", "downstream calls")}. The deadline is shorter than the work ` +
      "it guards, so it converts a slow request into a failed one and then pays for that failure repeatedly.",
  },
  {
    id: "single-failure",
    title: "Single failure",
    matches: ({ summary }) => summary.outcome === "failed",
    render: ({ summary }) =>
      `The attempt failed after ${summary.totalLatencyMs}ms and there was no retry budget, so the failure went straight ` +
      "back to the caller. With no retries configured, one downstream fault is one user-visible error.",
  },
  {
    id: "recovered-retry",
    title: "Recovered on retry",
    matches: ({ summary }) => summary.status === "ok" && summary.attempts > 1,
    render: ({ summary }) =>
      `Attempt ${summary.attempts} succeeded where the earlier ones did not, and the caller saw a working response after ` +
      `${summary.totalLatencyMs}ms. This is retry logic doing its job: the cost is latency and ` +
      `${plural(summary.downstreamCalls, "downstream call", "downstream calls")} instead of an error.`,
  },
  {
    id: "stale-cache-served",
    title: "Stale cache served",
    matches: ({ summary }) => summary.servedFrom === "stale-cache",
    render: ({ summary }) =>
      `The request completed in ${summary.totalLatencyMs}ms, but the cache answered with an entry past its freshness ` +
      "window. The latency looks healthy and the data is not. Serving stale content is a reasonable trade, and it is only " +
      "safe when the caller is told it happened.",
  },
  {
    id: "cache-miss-path",
    title: "Cache miss path",
    matches: ({ summary }) => summary.servedFrom === "database",
    render: ({ summary }) =>
      `The cache had nothing, so the request read the database and completed in ${summary.totalLatencyMs}ms. This is the ` +
      "honest cost of the data. Every cache hit you measure is a saving against this number, not against zero.",
  },
  {
    id: "healthy-baseline",
    title: "Healthy baseline",
    matches: ({ summary }) => summary.servedFrom === "cache",
    render: ({ summary }) =>
      `The cache answered and the request completed in ${summary.totalLatencyMs}ms with ` +
      `${plural(summary.downstreamCalls, "downstream call", "downstream calls")}. This is the shape every other run on ` +
      "this page is measured against.",
  },
];

/** Fallback used only if a future switch produces a shape no template claims. */
const UNCLASSIFIED = {
  id: "unclassified",
  title: "Unclassified",
  render: ({ summary }) =>
    `The request finished at the ${summary.terminalLayer} layer after ${summary.totalLatencyMs}ms with outcome ` +
    `${summary.outcome}. No explanation template matches this trace shape.`,
};

/**
 * Select and render the explanation for a completed trace.
 *
 * @param {{config: object, hops: Array<object>, summary: object}} context
 * @returns {{id: string, title: string, text: string}}
 */
export function explainTrace(context) {
  const template = TEMPLATES.find((candidate) => candidate.matches(context)) ?? UNCLASSIFIED;
  return { id: template.id, title: template.title, text: template.render(context) };
}

/** Every template identity, for tests and documentation. */
export function explanationIds() {
  return TEMPLATES.map((template) => template.id).concat(UNCLASSIFIED.id);
}
