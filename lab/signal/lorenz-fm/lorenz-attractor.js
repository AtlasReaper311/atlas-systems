const DEFAULT_STATE = Object.freeze([0.1, 0, 0]);
const DEFAULT_PARAMETERS = Object.freeze({
  sigma: 10,
  rho: 28,
  beta: 8 / 3,
  timeStep: 1 / 240,
});

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export class LorenzAttractor {
  constructor(options = {}) {
    this.parameters = {
      sigma: finiteNumber(options.sigma, DEFAULT_PARAMETERS.sigma),
      rho: finiteNumber(options.rho, DEFAULT_PARAMETERS.rho),
      beta: finiteNumber(options.beta, DEFAULT_PARAMETERS.beta),
      timeStep: clamp(finiteNumber(options.timeStep, DEFAULT_PARAMETERS.timeStep), 1 / 2000, 1 / 30),
    };
    this.initialState = LorenzAttractor.normalizeState(options.state ?? DEFAULT_STATE);
    this.state = [...this.initialState];
    this.elapsed = 0;
  }

  static normalizeState(state) {
    const source = Array.isArray(state) || ArrayBuffer.isView(state) ? state : DEFAULT_STATE;
    return [
      finiteNumber(source[0], DEFAULT_STATE[0]),
      finiteNumber(source[1], DEFAULT_STATE[1]),
      finiteNumber(source[2], DEFAULT_STATE[2]),
    ];
  }

  derivatives([x, y, z]) {
    const { sigma, rho, beta } = this.parameters;
    return [
      sigma * (y - x),
      x * (rho - z) - y,
      x * y - beta * z,
    ];
  }

  step(iterations = 1) {
    const count = clamp(Math.trunc(finiteNumber(iterations, 1)), 1, 4096);
    const dt = this.parameters.timeStep;

    for (let index = 0; index < count; index += 1) {
      const current = this.state;
      const k1 = this.derivatives(current);
      const k2 = this.derivatives(current.map((value, axis) => value + k1[axis] * dt * 0.5));
      const k3 = this.derivatives(current.map((value, axis) => value + k2[axis] * dt * 0.5));
      const k4 = this.derivatives(current.map((value, axis) => value + k3[axis] * dt));

      this.state = current.map((value, axis) => (
        value + (dt / 6) * (k1[axis] + 2 * k2[axis] + 2 * k3[axis] + k4[axis])
      ));
      this.elapsed += dt;
    }

    return [...this.state];
  }

  reset(state = this.initialState) {
    this.state = LorenzAttractor.normalizeState(state);
    this.elapsed = 0;
    return [...this.state];
  }

  snapshot() {
    return Object.freeze({
      state: Object.freeze([...this.state]),
      elapsed: this.elapsed,
      parameters: Object.freeze({ ...this.parameters }),
    });
  }
}

export function mapLorenzState(state, options = {}) {
  const [x, y, z] = LorenzAttractor.normalizeState(state);
  const fmDepth = clamp(finiteNumber(options.fmDepth, 82), 0, 180);
  const carrier = clamp(55 + Math.abs(x) * 5.2, 55, 220);
  const modulator = clamp(18 + Math.abs(y) * 4.4, 18, 180);
  const cutoff = clamp(260 + Math.abs(z - 28) * 52, 140, 4200);
  const pan = clamp(x / 24, -0.85, 0.85);

  return Object.freeze({
    carrier,
    modulator,
    cutoff,
    pan,
    fmDepth,
  });
}

export { DEFAULT_PARAMETERS, DEFAULT_STATE };
