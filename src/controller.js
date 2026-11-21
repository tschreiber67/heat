import { SENSORS } from './hardware.js';
import { PID } from './pid.js';

const ZONES = ['upper', 'lower'];
const rnd = (v, n) => Number(v.toFixed(n));

export class Controller {
  constructor(driver, settings, historyLen = 3600) {
    this.driver = driver;
    this.settings = settings;
    this.historyLen = historyLen;
    this.t = 0;
    this.pid = { upper: new PID(), lower: new PID() };
    this.history = [];
    this.fault = false;
    this.faultReasons = [];
    this.healthy = false;
    this.clearTimer = 0; // seconds readings have been continuously healthy
    this.duty = { upper: 0, lower: 0 };
    this.heater = { upper: false, lower: false };
    this.vent = 0;
    this.temps = {};
  }

  _faults(readings) {
    const s = this.settings;
    const why = [];
    const temps = {};
    for (const name of SENSORS) {
      const [v, age] = readings[name] ?? [null, Infinity];
      if (v === null || v === undefined || !Number.isFinite(v)) why.push(`${name}: no reading`);
      else if (age > s.stale_s) why.push(`${name}: stale (${age.toFixed(0)}s)`);
      else if (!(s.sensor_min <= v && v <= s.sensor_max)) why.push(`${name}: out of range (${v.toFixed(1)})`);
      else temps[name] = v;
    }
    for (const z of ZONES) {
      const zs = s[z];
      const v = temps[z];
      if (v === undefined) continue;
      if (v > s.over_temp) why.push(`${z}: over-temperature (${v.toFixed(1)})`);
      if (v > zs.alarm_high) why.push(`${z}: high alarm (${v.toFixed(1)})`);
      if (zs.mode !== 'off' && v < zs.alarm_low) why.push(`${z}: low alarm (${v.toFixed(1)})`);
    }
    if ((temps.electronics ?? 0) > s.electronics_max) why.push('electronics: over-temperature');
    if ('upper' in temps && 'lower' in temps && Math.abs(temps.upper - temps.lower) > s.max_zone_diff) {
      why.push('zone difference exceeds limit');
    }
    return [temps, why];
  }

  tick(dt) {
    const s = this.settings;
    this.t += dt;
    const [temps, why] = this._faults(this.driver.read());
    this.temps = temps;
    this.healthy = why.length === 0;
    if (why.length) {
      this.fault = true;
      this.faultReasons = why;
      this.clearTimer = 0;
    } else if (this.fault) {
      this.clearTimer += dt;
      if (this.clearTimer >= s.fault_hold_s) {
        this.fault = false;
        this.faultReasons = [];
        for (const p of Object.values(this.pid)) p.reset(); // integral state from before the fault is stale
      }
    }

    if (this.fault) {
      this.duty = { upper: 0, lower: 0 };
      this.vent = 100;
    } else {
      this._control(temps, dt);
    }

    const phase = (this.t % s.pwm_period_s) / s.pwm_period_s;
    this.heater = { upper: this.duty.upper > phase, lower: this.duty.lower > phase };
    this.driver.apply(this.heater.upper, this.heater.lower, this.vent);
    const rec = this.snapshot();
    this.history.push(rec);
    if (this.history.length > this.historyLen) this.history.shift();
    return rec;
  }

  _control(temps, dt) {
    const s = this.settings;
    let excess = 0;
    for (const z of ZONES) {
      const zs = s[z];
      if (zs.mode === 'auto') {
        this.duty[z] = this.pid[z].step(zs.setpoint, temps[z], zs.kp, zs.ki, zs.kd, dt);
        excess = Math.max(excess, temps[z] - zs.setpoint - s.vent_margin);
      } else {
        this.pid[z].reset();
        this.duty[z] = zs.mode === 'manual' ? zs.manual_duty : 0;
        if (zs.mode === 'manual') excess = Math.max(excess, temps[z] - zs.setpoint - s.vent_margin);
      }
    }
    if (s.vent_override !== null) this.vent = s.vent_override;
    else this.vent = Math.min(100, Math.max(0, (excess / s.vent_margin) * 100));
  }

  snapshot() {
    const temps = {};
    for (const [k, v] of Object.entries(this.temps)) temps[k] = rnd(v, 2);
    return {
      t: rnd(this.t, 2),
      temps,
      duty: { upper: rnd(this.duty.upper, 3), lower: rnd(this.duty.lower, 3) },
      heater: { ...this.heater },
      vent: rnd(this.vent, 1),
      fault: this.fault,
      fault_reasons: [...this.faultReasons],
      clear_remaining_s: this.fault && this.healthy
        ? rnd(Math.max(0, this.settings.fault_hold_s - this.clearTimer), 1) : null,
    };
  }
}
