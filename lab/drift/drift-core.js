"use strict";

/**
 * DRIFT core. Pure simulation, no DOM, no canvas.
 *
 * The estate is a lattice of nodes. Every node loses conformance on its own
 * schedule. Attention repairs whatever it covers. Policy repairs everything,
 * slowly, forever, without being watched.
 */

export const GRID_W = 32;
export const GRID_H = 16;
export const CELL_COUNT = GRID_W * GRID_H;

/** Conformance lost per node per second before contagion. */
export const BASE_DECAY = 0.0034;
/** How much a drifting neighbourhood accelerates a node. */
export const CONTAGION = 0.95;
/** Conformance restored per second at the centre of the attention field. */
export const ATTENTION_REPAIR = 1.15;
/** Radius of the attention field, in cells. */
export const ATTENTION_RADIUS = 3.4;
/** Total conformance per second the policy engine can restore. */
export const POLICY_BUDGET = 9;
/** Seconds for one full policy sweep of the lattice. */
export const POLICY_SWEEP_SECONDS = 6;
/** Width of the policy sweep window, in columns. */
export const POLICY_WINDOW = 3.2;

export const HELD = 0.75;
export const BREACH = 0.4;
export const TARGET = 0.9;

export const MODE_MANUAL = "manual";
export const MODE_POLICY = "policy";

const LABEL_ALPHABET = "abcdefghjkmnpqrstuvwxyz";

export function createRandom(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed >>> 0;
  return (Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0;
}

export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

export function cellLabel(index) {
  const row = Math.floor(index / GRID_W);
  const column = index % GRID_W;
  const letter = LABEL_ALPHABET[row % LABEL_ALPHABET.length];
  return `${letter}${String(column).padStart(2, "0")}`;
}

/**
 * Build a fresh estate. Every node starts conformant and decays at its own
 * pace, because no two services rot at the same speed.
 */
export function createField(seed) {
  const random = createRandom(seed);
  const health = new Float32Array(CELL_COUNT);
  const rate = new Float32Array(CELL_COUNT);
  const heat = new Float32Array(CELL_COUNT);

  for (let index = 0; index < CELL_COUNT; index += 1) {
    health[index] = 0.96 + random() * 0.04;
    rate[index] = 0.45 + random() * 1.25;
    heat[index] = 0;
  }

  return {
    seed,
    health,
    rate,
    heat,
    scratch: new Float32Array(CELL_COUNT),
    elapsed: 0,
    heldSeconds: 0,
    sweep: 0,
    repaired: 0,
    lost: 0,
  };
}

function neighbourDrift(health, index) {
  const row = Math.floor(index / GRID_W);
  const column = index % GRID_W;
  let total = 0;
  let count = 0;

  if (column > 0) {
    total += 1 - health[index - 1];
    count += 1;
  }
  if (column < GRID_W - 1) {
    total += 1 - health[index + 1];
    count += 1;
  }
  if (row > 0) {
    total += 1 - health[index - GRID_W];
    count += 1;
  }
  if (row < GRID_H - 1) {
    total += 1 - health[index + GRID_W];
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

/**
 * Advance the estate by dt seconds.
 *
 * attention is { x, y, active } in cell coordinates. In policy mode the
 * attention field is ignored entirely, which is the point.
 */
export function step(field, dt, mode, attention) {
  const { health, rate, heat, scratch } = field;
  scratch.set(health);

  const policy = mode === MODE_POLICY;
  const sweepSpan = GRID_W + POLICY_WINDOW * 2;
  if (policy) {
    field.sweep = (field.sweep + (dt / POLICY_SWEEP_SECONDS) * sweepSpan) % sweepSpan;
  }
  const sweepColumn = field.sweep - POLICY_WINDOW;
  const perCellPolicy = (POLICY_BUDGET / (POLICY_WINDOW * 2 * GRID_H)) * 1.0;

  let repairedThisStep = 0;
  let lostThisStep = 0;

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const row = Math.floor(index / GRID_W);
    const column = index % GRID_W;
    const drift = neighbourDrift(scratch, index);

    const pressure = BASE_DECAY * rate[index] * (1 + CONTAGION * drift);
    let repair = 0;

    if (policy) {
      const distance = Math.abs(column - sweepColumn);
      if (distance < POLICY_WINDOW) {
        const falloff = 1 - distance / POLICY_WINDOW;
        repair = perCellPolicy * falloff * 2;
      }
    } else if (attention && attention.active) {
      const dx = column - attention.x;
      const dy = row - attention.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < ATTENTION_RADIUS) {
        const falloff = 1 - distance / ATTENTION_RADIUS;
        repair = ATTENTION_REPAIR * falloff * falloff;
      }
    }

    const before = scratch[index];
    const next = clamp(before + (repair - pressure) * dt, 0, 1);
    health[index] = next;

    if (next > before) repairedThisStep += next - before;
    else lostThisStep += before - next;

    const touched = repair > 0.02 ? 1 : 0;
    heat[index] = clamp(heat[index] + (touched - heat[index]) * Math.min(1, dt * 6), 0, 1);
  }

  field.repaired += repairedThisStep;
  field.lost += lostThisStep;
  field.elapsed += dt;

  const conformance = meanHealth(field);
  if (conformance >= TARGET) field.heldSeconds += dt;

  return conformance;
}

export function meanHealth(field) {
  const { health } = field;
  let total = 0;
  for (let index = 0; index < CELL_COUNT; index += 1) total += health[index];
  return total / CELL_COUNT;
}

export function census(field) {
  const { health } = field;
  let held = 0;
  let drifting = 0;
  let breached = 0;
  let worstIndex = 0;
  let worstValue = 2;

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const value = health[index];
    if (value >= HELD) held += 1;
    else if (value >= BREACH) drifting += 1;
    else breached += 1;
    if (value < worstValue) {
      worstValue = value;
      worstIndex = index;
    }
  }

  return { held, drifting, breached, worstIndex, worstValue };
}

/**
 * The share of the estate one operator can hold at any instant. Not a guess,
 * a direct count of the nodes the attention field reaches, over the size of
 * the lattice.
 */
export function attentionCoverage() {
  let covered = 0;
  const radius = Math.ceil(ATTENTION_RADIUS);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.sqrt(dx * dx + dy * dy) < ATTENTION_RADIUS) covered += 1;
    }
  }
  return covered / CELL_COUNT;
}

export function formatDuration(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

export function formatPercent(value, places = 1) {
  return `${(value * 100).toFixed(places)}%`;
}
