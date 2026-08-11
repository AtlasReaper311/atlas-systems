/**
 * Deterministic service leitmotifs for the Atlas APU.
 *
 * The module maps a service name to a stable four-note cell, register,
 * rhythm, and preferred APU layer. State mutations preserve provenance and
 * remain deterministic across identical frames and replays.
 */

export const APU_SERVICE_LEITMOTIFS_BUILD_ID = "20260727-apu-service-leitmotifs-v1";

export const LEITMOTIF_REGISTERS = Object.freeze({
  bass: Object.freeze({ label: "bass", octaveOffset: 0 }),
  mid: Object.freeze({ label: "mid", octaveOffset: 1 }),
  lead: Object.freeze({ label: "lead", octaveOffset: 2 }),
  upper: Object.freeze({ label: "upper", octaveOffset: 3 }),
});

export const LEITMOTIF_RHYTHMS = Object.freeze({
  call: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0]),
  answer: Object.freeze([0, 0, 1, 0, 0, 0, 1, 0]),
  pulse: Object.freeze([1, 0, 1, 0, 1, 0, 1, 0]),
  syncopate: Object.freeze([1, 0, 0, 1, 0, 0, 1, 0]),
  arc: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0]),
  breath: Object.freeze([1, 0, 0, 0, 0, 0, 0, 0]),
});

export const LEITMOTIF_ROLES = Object.freeze({
  lead: "primary",
  counter: "secondary",
  bass: "bass",
  pad: "pad",
  percussion: "drum",
  accent: "accent",
});

const STATE_KEYS = Object.freeze([
  "healthy",
  "warning",
  "critical",
  "unknown",
  "recovery",
]);

const ROLE_CHOICES = Object.freeze([
  Object.freeze({ role: "lead", register: "lead", rhythm: "call" }),
  Object.freeze({ role: "counter", register: "mid", rhythm: "answer" }),
  Object.freeze({ role: "pad", register: "mid", rhythm: "arc" }),
  Object.freeze({ role: "accent", register: "upper", rhythm: "syncopate" }),
  Object.freeze({ role: "bass", register: "bass", rhythm: "pulse" }),
]);

const BASE_MOTIFS = Object.freeze({
  "up-return": Object.freeze([0, 2, 4, 2]),
  "step-down": Object.freeze([4, 3, 2, 0]),
  arpeggio: Object.freeze([0, 2, 4, 7]),
  pivot: Object.freeze([0, 4, 2, 5]),
  "held-tail": Object.freeze([0, 2, 3, 3]),
  "leap-return": Object.freeze([0, 5, 4, 0]),
  climb: Object.freeze([0, 1, 3, 5]),
  descend: Object.freeze([5, 4, 2, 0]),
});

const MOTIF_KEYS = Object.freeze(Object.keys(BASE_MOTIFS));

export function fnv1a(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function pick(values, hash) {
  return values[hash % values.length];
}

export function baseLeitmotifFor(serviceName) {
  const service = String(serviceName ?? "unknown-service");
  const hash = fnv1a(service);
  const roleChoice = ROLE_CHOICES[hash % ROLE_CHOICES.length];
  const motifKey = pick(MOTIF_KEYS, hash >>> 3);
  const register = LEITMOTIF_REGISTERS[roleChoice.register];

  return Object.freeze({
    service,
    role: roleChoice.role,
    register: roleChoice.register,
    rhythm: LEITMOTIF_RHYTHMS[roleChoice.rhythm],
    motifKey,
    motif: BASE_MOTIFS[motifKey],
    octaveOffset: register.octaveOffset,
    preferredLayer: LEITMOTIF_ROLES[roleChoice.role],
  });
}

function tenseShift(motif) {
  return Object.freeze(
    motif.map((degree, index) => (
      index === 0 || index === motif.length - 1 ? degree : degree + 1
    )),
  );
}

function fragment(motif, hash) {
  const keepInterior = 1 + (hash % Math.max(1, motif.length - 2));
  return Object.freeze(
    motif.map((degree, index) => (
      index === 0 || index === keepInterior ? degree : null
    )),
  );
}

function fragmentRhythm(rhythm) {
  const firstActiveIndex = rhythm.findIndex((slot) => slot !== 0);
  if (firstActiveIndex < 0) return Object.freeze([...rhythm]);
  return Object.freeze(
    rhythm.map((slot, index) => (index === firstActiveIndex ? slot : 0)),
  );
}

function sparse(motif) {
  return Object.freeze(
    motif.map((degree, index) => (
      index === 0 || index === motif.length - 1 ? degree : null
    )),
  );
}

function resolve(motif) {
  const copy = [...motif];
  const finalIndex = copy.length - 1;
  copy[finalIndex] = 7;
  if (finalIndex >= 1) copy[finalIndex - 1] += 1;
  return Object.freeze(copy);
}

export function mutateLeitmotifForState(base, state) {
  if (!base || typeof base !== "object") {
    throw new TypeError("apu-service-leitmotifs: base required");
  }

  const safeState = STATE_KEYS.includes(state) ? state : "unknown";
  let mutation = "identity";
  let motif = base.motif;
  let rhythm = base.rhythm;

  if (safeState === "warning") {
    mutation = "tenseShift";
    motif = tenseShift(base.motif);
  } else if (safeState === "critical") {
    mutation = "fragment";
    motif = fragment(base.motif, fnv1a(base.service));
    rhythm = fragmentRhythm(base.rhythm);
  } else if (safeState === "unknown") {
    mutation = "sparse";
    motif = sparse(base.motif);
  } else if (safeState === "recovery") {
    mutation = "resolve";
    motif = resolve(base.motif);
  }

  return Object.freeze({
    ...base,
    state: safeState,
    mutation,
    motif,
    rhythm,
  });
}

export function leitmotifFor(serviceName, state = "healthy") {
  return mutateLeitmotifForState(baseLeitmotifFor(serviceName), state);
}

function sameArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function describeLeitmotif(leitmotif) {
  if (!leitmotif) {
    return Object.freeze({
      service: "unknown",
      role: "unknown",
      register: "unknown",
      rhythmName: "unknown",
      motifKey: "unknown",
      mutation: "unknown",
      describe: "no leitmotif",
    });
  }

  const rhythmName = Object.entries(LEITMOTIF_RHYTHMS)
    .find(([, rhythm]) => sameArray(rhythm, leitmotif.rhythm))?.[0] ?? "custom";
  const mutation = leitmotif.mutation ?? "identity";

  return Object.freeze({
    service: leitmotif.service,
    role: leitmotif.role,
    register: leitmotif.register,
    rhythmName,
    motifKey: leitmotif.motifKey,
    mutation,
    describe: `${leitmotif.service} -> ${leitmotif.role} on ${leitmotif.register} (${leitmotif.motifKey}, ${rhythmName}, ${mutation})`,
  });
}

export function buildLeitmotifRegistry(services, state = "healthy") {
  const registry = new Map();
  for (const service of services ?? []) {
    if (typeof service !== "string" || service.length === 0) continue;
    registry.set(service, leitmotifFor(service, state));
  }
  return registry;
}

export function preferredLayerFor(serviceName, state = "healthy") {
  if (!serviceName) return null;
  return leitmotifFor(serviceName, state).preferredLayer;
}

export { STATE_KEYS as LEITMOTIF_STATE_KEYS };
