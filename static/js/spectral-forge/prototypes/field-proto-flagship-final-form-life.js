"use strict";

/* DEVELOPMENT-ONLY. Bounded living-motion helpers for the flagship final-form
 * prototype. Not imported by the shipped renderer.
 *
 * Contract:
 * - no per-frame Math.random
 * - no monotonic whole-object yaw
 * - field centres wander by zero-mean 3D oscillators, then normalise
 * - attitude is bounded and spring-damped
 * - rare healthy gestures bias the same physical fields; they are not clips
 */

const TAU = Math.PI * 2;
const CAMERA_DISTANCE = 4.42;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function hypot3(x, y, z) {
  return Math.hypot(x, y, z) || 1;
}

function audioRate(audioActive, slow, medium, fast) {
  if (!audioActive) return { slow, medium, fast };
  return {
    slow: slow * 1.04,
    medium: medium * 1.22,
    fast: fast * 1.28,
  };
}

export function normalize3(x, y, z) {
  const inv = 1 / hypot3(x, y, z);
  return { x: x * inv, y: y * inv, z: z * inv };
}

export function livingGesture(phase, seedPhase, audioActive, damage) {
  const rates = audioRate(audioActive, 0.241, 0.337, 0.519);
  const slow = 0.5 + 0.5 * Math.sin(phase * rates.slow + seedPhase);
  const slower = 0.5 + 0.5 * Math.sin(phase * (rates.slow * 0.73) + seedPhase * 1.7);
  const beat = 0.5 + 0.5 * Math.sin(phase * rates.medium + seedPhase * 0.5);
  const alignment = clamp(slow * slower * beat);
  const rare = clamp((alignment - 0.14) / 0.52);
  const peaked = rare * rare;
  const opportunity = clamp(peaked * (audioActive ? 1.16 : 1) + damage * 0.06 * peaked);
  const kind = 0.5 + 0.5 * Math.sin(phase * 0.41 + seedPhase * 2.3);

  function gate(lo, hi) {
    const mid = (lo + hi) * 0.5;
    const half = Math.max(0.04, (hi - lo) * 0.5);
    return clamp(1 - Math.abs(kind - mid) / half);
  }

  const bloom = opportunity * gate(0, 0.24);
  const fold = opportunity * gate(0.18, 0.44);
  const inversion = opportunity * gate(0.38, 0.58);
  const neck = opportunity * gate(0.52, 0.76);
  const droplet = opportunity * gate(0.72, 0.92);
  const flatten = opportunity * gate(0.86, 1.04);
  const cohesion = clamp(1 - neck * 0.72 - flatten * 0.16, 0.28, 1);

  const neckAxis = normalize3(
    Math.sin(phase * 0.067 + seedPhase) + 0.35 * Math.sin(phase * 0.119 + seedPhase * 0.8),
    Math.cos(phase * 0.083 + seedPhase * 1.4) + 0.28 * Math.sin(phase * 0.141 + seedPhase * 0.2),
    Math.sin(phase * 0.097 + seedPhase * 0.6) + 0.31 * Math.cos(phase * 0.053 + seedPhase * 1.9),
  );

  return {
    opportunity,
    bloom,
    fold,
    inversion,
    droplet,
    flatten,
    cohesion,
    neckAxis,
  };
}

export function fieldCentre(phase, seed, activity, audioActive) {
  const { a, b, c, d, e, index } = seed;
  const medium = (0.113 + c * 0.021) * (1 + activity * 0.1) * (audioActive ? 1.18 : 1);
  const homeAz = a * TAU + Math.sin(phase * (0.031 + e * 0.007) + d * TAU) * 0.55;
  const homeEl = (b - 0.5) * 0.82;
  const azimuth = homeAz
    + Math.sin(phase * (0.067 + c * 0.018) + a * TAU) * (0.92 + d * 0.28)
    + Math.sin(phase * medium + e * TAU) * (0.58 + b * 0.22)
    + Math.sin(phase * (0.181 + a * 0.015) + c * TAU + index) * 0.32;
  const elevation = homeEl
    + Math.sin(phase * (0.079 + d * 0.019) + b * TAU) * (0.48 + e * 0.18)
    + Math.cos(phase * (0.141 + a * 0.016) * (audioActive ? 1.14 : 1) + e * TAU) * 0.24
    + Math.sin(phase * (0.203 + c * 0.013) + index * 1.17) * 0.12;
  const cosElevation = Math.cos(elevation);
  return {
    x: Math.cos(azimuth) * cosElevation,
    y: Math.sin(elevation),
    z: Math.sin(azimuth) * cosElevation,
  };
}

export function fieldLife(phase, seed, mapped, damage, audioActive, gesture) {
  const { a, b, c, d, e, index } = seed;
  const polarityHold = Math.sin(phase * (0.067 + d * 0.031) + e * TAU);
  const polarityWave = Math.sin(phase * (0.19 + d * 0.13) * (audioActive ? 1.2 : 1) + e * TAU + index * 0.83);
  const inversion = gesture?.inversion ?? 0;
  const polarity = Math.tanh(polarityHold * 1.35 + polarityWave * (0.95 + inversion * 0.7));
  const slowMass = 0.5 + 0.5 * Math.sin(phase * (0.049 + e * 0.017) + a * TAU);
  const mediumPulse = 0.5 + 0.5 * Math.sin(phase * (0.21 + d * 0.09) * (audioActive ? 1.24 : 1) + c * TAU);
  const twitch = 0.5 + 0.5 * Math.sin(phase * (0.47 + b * 0.11) * (audioActive ? 1.3 : 1) + e * TAU);
  const flatten = 1 - (gesture?.flatten ?? 0) * 0.55;
  const bloom = 1 + (gesture?.bloom ?? 0) * 0.45;
  const life = (0.48 + 0.22 * slowMass + 0.18 * mediumPulse + 0.08 * twitch) * flatten;
  const sigma = 0.29 + c * 0.22 + (gesture?.fold ?? 0) * 0.05;
  return {
    polarity,
    life,
    sigma,
    strengthScale: life * bloom * (0.82 + b * 0.4),
    crestScale: bloom * (1 + (gesture?.fold ?? 0) * 0.35),
    swirlScale: 1 + inversion * 0.55 + (audioActive ? 0.12 : 0),
    flowScale: 1 + (mapped?.displacement ?? 0) * 0.08 + (audioActive ? 0.1 : 0),
    waveRate: (1.38 + index * 0.17) * (audioActive ? 1.18 : 1),
  };
}

export function mesoDrive(phase, seedPhase, audioActive, gesture) {
  const travel = phase * (0.37 + (audioActive ? 0.08 : 0) + (gesture?.fold ?? 0) * 0.12)
    + Math.sin(phase * 0.19 + seedPhase) * 0.8;
  const axis = normalize3(
    Math.sin(phase * 0.057 + seedPhase) + 0.4 * Math.sin(phase * 0.113 + seedPhase * 1.2),
    Math.cos(phase * 0.071 + seedPhase * 0.7) + 0.33 * Math.sin(phase * 0.149 + seedPhase),
    Math.sin(phase * 0.043 + seedPhase * 1.6) + 0.36 * Math.cos(phase * 0.101 + seedPhase * 0.4),
  );
  return { x: axis.x, y: axis.y, z: axis.z, w: travel };
}

export function attitudeTarget(phase, centroid, tilt, torsion, seedPhase) {
  const yaw = Math.sin(phase * 0.047 + seedPhase) * 0.1
    + Math.sin(phase * 0.079 + seedPhase * 1.3) * 0.062
    + Math.sin(phase * 0.127 + seedPhase * 0.4) * 0.034
    + centroid.x * 0.04
    + torsion * 0.18;
  const pitch = Math.sin(phase * 0.053 + seedPhase * 0.7) * 0.072
    + Math.sin(phase * 0.091 + seedPhase * 1.9) * 0.04
    + centroid.y * 0.046
    + tilt * 0.24;
  const roll = Math.sin(phase * 0.061 + seedPhase * 1.1) * 0.048
    + Math.sin(phase * 0.103 + seedPhase * 0.2) * 0.026
    + centroid.z * 0.03;
  return {
    x: clamp(0.035 + pitch, -0.22, 0.26),
    y: clamp(-0.07 + yaw, -0.24, 0.18),
    z: clamp(-0.018 + roll, -0.14, 0.12),
  };
}

export function createAttitudeState() {
  return {
    x: 0.055,
    y: -0.08,
    z: -0.025,
    vx: 0,
    vy: 0,
    vz: 0,
    lastTime: null,
  };
}

export function stepAttitude(state, target, visualTime) {
  const previous = state.lastTime;
  const dt = previous == null ? 0.016 : clamp(visualTime - previous, 0.001, 0.05);
  state.lastTime = visualTime;
  const omega = 2.35;
  const damp = 2 * omega;
  const ax = omega * omega * (target.x - state.x) - damp * state.vx;
  const ay = omega * omega * (target.y - state.y) - damp * state.vy;
  const az = omega * omega * (target.z - state.z) - damp * state.vz;
  state.vx += ax * dt;
  state.vy += ay * dt;
  state.vz += az * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
  return state;
}

export function cameraOffset(phase, seedPhase) {
  return {
    x: Math.sin(phase * 0.043 + seedPhase) * 0.02 + Math.sin(phase * 0.097 + seedPhase * 0.5) * 0.007,
    y: 0.02 + Math.sin(phase * 0.037 + seedPhase * 0.6) * 0.01,
    z: CAMERA_DISTANCE + Math.cos(phase * 0.029 + seedPhase * 0.3) * 0.012,
  };
}

export function satelliteThreshold(damage, droplet) {
  const base = damage > 0.45 ? 0.38 : 0.68;
  return clamp(base - droplet * 0.22, 0.22, 0.78);
}
