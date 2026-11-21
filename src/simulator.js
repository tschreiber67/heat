// Thermal simulation that stands in for hardware. It only produces physics plus sensor
// noise; nothing here forces a reading to any value.
import { Rng, makeSeed } from './random.js';

export class Simulator {
  constructor(seed = null, step = 0.25) {
    this.seed = seed === null || seed === undefined ? makeSeed() : seed;
    this.rng = new Rng(this.seed);
    const r = this.rng;
    this.step = step;
    this.ambientMean = r.uniform(12, 28);
    this.ambient = this.ambientMean + r.uniform(-2, 2);
    this.event = 0; // current external heat/cool influence, C
    this.eventLeft = 0;
    this.upper = this.lower = this.ambient + r.uniform(0, 2);
    this.elec = this.ambient + r.uniform(2, 6);
    this.vent = 0;
    this.heatU = this.heatL = false;
    // per-run plant variation, so runs differ in dynamics as well as in noise
    this.pHeater = r.uniform(0.8, 1.3); // C/s at full power
    this.kLoss = r.uniform(0.0015, 0.003);
    this.kVent = r.uniform(0.01, 0.02);
    this.elecPower = r.uniform(0.04, 0.09);
    this.bias = {};
    for (const k of ['upper', 'lower', 'ambient', 'electronics']) this.bias[k] = r.uniform(-0.3, 0.3);
    this.noise = r.uniform(0.05, 0.2);
  }

  apply(upperHeater, lowerHeater, ventPct) {
    this.heatU = upperHeater;
    this.heatL = lowerHeater;
    this.vent = Math.min(100, Math.max(0, ventPct)) / 100;
  }

  advance(dt) {
    const n = Math.max(1, Math.round(dt / this.step));
    const h = dt / n;
    for (let i = 0; i < n; i++) this._substep(h);
  }

  _substep(dt) {
    const r = this.rng;
    // ambient: mean-reverting drift plus occasional random heat/cool events
    if (this.eventLeft <= 0 && r.random() < 0.004 * dt) {
      this.event = r.choice([-1, 1]) * r.uniform(2, 9);
      this.eventLeft = r.uniform(20, 120);
    }
    if (this.eventLeft > 0) {
      this.eventLeft -= dt;
      if (this.eventLeft <= 0) this.event = 0;
    }
    this.ambient += 0.01 * (this.ambientMean - this.ambient) * dt + r.gauss(0, 0.02) * Math.sqrt(dt);
    const ta = this.ambient + this.event;
    // heat rises: the lower zone feeds the upper one far better than the reverse
    const diff = this.lower - this.upper;
    const flow = (diff > 0 ? 0.06 : 0.015) * diff;
    const lossU = (this.kLoss + this.kVent * this.vent * 1.5) * (this.upper - ta);
    const lossL = (this.kLoss + this.kVent * this.vent * 0.7) * (this.lower - ta);
    const eToAir = 0.03 * (this.elec - this.lower);
    this.upper += (this.pHeater * (this.heatU ? 1 : 0) + flow - lossU) * dt;
    this.lower += (this.pHeater * (this.heatL ? 1 : 0) - flow - lossL + 0.4 * eToAir) * dt;
    this.elec += (this.elecPower - eToAir - 0.002 * (this.elec - ta)) * dt;
  }

  read() {
    const t = { upper: this.upper, lower: this.lower, ambient: this.ambient + this.event, electronics: this.elec };
    const out = {};
    for (const k of Object.keys(t)) out[k] = [t[k] + this.bias[k] + this.rng.gauss(0, this.noise), 0];
    return out;
  }
}
