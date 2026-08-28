export const STATUS_ENDPOINT = "https://api.atlas-systems.uk/v1/stats";
export const STATUS_STALE_AFTER_MS = 1_200_000;

export const STATUS_LABELS = Object.freeze({
  checking: "Checking",
  operational: "Operational",
  degraded: "Degraded",
  unavailable: "Unavailable",
  unknown: "Unknown",
});

export function parseEstateStatus(data, now = Date.now()) {
  const estate = data && data.estate;
  const operational = Number(estate && estate.operational);
  const total = Number(estate && estate.total_components);
  const checkedAt = Date.parse(estate && estate.checked_at);

  if (!Number.isFinite(operational) || !Number.isFinite(total) || total <= 0 ||
      operational < 0 || operational > total || !Number.isFinite(checkedAt)) {
    return {
      state: "unknown",
      label: STATUS_LABELS.unknown,
      detail: "Status evidence is unavailable.",
    };
  }

  const age = now - checkedAt;
  if (age < 0 || age > STATUS_STALE_AFTER_MS) {
    return {
      state: "unknown",
      label: STATUS_LABELS.unknown,
      detail: `Status evidence is stale. Last checked ${new Date(checkedAt).toISOString()}.`,
    };
  }
  if (operational === total) {
    return {
      state: "operational",
      label: STATUS_LABELS.operational,
      detail: `${operational} of ${total} monitored components operational.`,
    };
  }
  if (operational > total / 2) {
    return {
      state: "degraded",
      label: STATUS_LABELS.degraded,
      detail: `${operational} of ${total} monitored components operational.`,
    };
  }
  return {
    state: "unavailable",
    label: STATUS_LABELS.unavailable,
    detail: `${operational} of ${total} monitored components operational.`,
  };
}
