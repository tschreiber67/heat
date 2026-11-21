// Output clamped 0..1. Integral freezes while saturated (anti-windup); D acts on
// measurement so setpoint edits do not kick the output.
export class PID {
  constructor() {
    this.integral = 0;
    this.prev = null;
  }

  reset() {
    this.integral = 0;
    this.prev = null;
  }

  step(sp, meas, kp, ki, kd, dt) {
    const err = sp - meas;
    const d = this.prev === null || dt <= 0 ? 0 : -(meas - this.prev) / dt;
    this.prev = meas;
    let raw = kp * err + ki * this.integral + kd * d;
    if ((raw < 1 || err < 0) && (raw > 0 || err > 0)) this.integral += err * dt;
    raw = kp * err + ki * this.integral + kd * d;
    return Math.min(1, Math.max(0, raw));
  }
}
