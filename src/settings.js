// Validated, persisted settings. Cross-field rules live here so API and UI share them.
import fs from 'node:fs';
import path from 'node:path';

const MODES = ['auto', 'manual', 'off'];

// [min, max, minExclusive]
const ZONE_FIELDS = {
  setpoint: [0, 100], kp: [0, 100], ki: [0, 10], kd: [0, 1000],
  alarm_high: [0, 150], alarm_low: [-40, 100], manual_duty: [0, 1],
};
const GLOBAL_FIELDS = {
  vent_margin: [0, 30, true], max_zone_diff: [0, 50, true], fault_hold_s: [0, 3600],
  over_temp: [0, 150], electronics_max: [0, 150], sensor_min: [-100, 0], sensor_max: [50, 300],
  stale_s: [0, 600, true], pwm_period_s: [1, 120],
};
const ZONES = ['upper', 'lower'];

export function defaultZone(over = {}) {
  return {
    mode: 'auto', setpoint: 35, kp: 0.25, ki: 0.004, kd: 1, alarm_high: 50, alarm_low: 5, manual_duty: 0,
    ...over,
  };
}

export function defaults(over = {}) {
  return {
    upper: defaultZone(),
    lower: defaultZone({ setpoint: 33 }),
    vent_margin: 2, vent_override: null, max_zone_diff: 8, fault_hold_s: 30,
    over_temp: 60, electronics_max: 80, sensor_min: -30, sensor_max: 120, stale_s: 5, pwm_period_s: 10,
    ...over,
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function checkNumber(errors, loc, v, [lo, hi, exclusive]) {
  if (!isNum(v)) {
    errors.push({ loc, msg: 'must be a finite number', type: 'type_error' });
  } else if (exclusive ? v <= lo : v < lo) {
    errors.push({ loc, msg: `must be ${exclusive ? '>' : '>='} ${lo}`, type: 'range_error' });
  } else if (v > hi) {
    errors.push({ loc, msg: `must be <= ${hi}`, type: 'range_error' });
  }
}

function checkZone(errors, name, z) {
  if (!isObj(z)) {
    errors.push({ loc: [name], msg: 'must be an object', type: 'type_error' });
    return;
  }
  let ok = true;
  for (const k of Object.keys(z)) {
    if (k !== 'mode' && !(k in ZONE_FIELDS)) {
      errors.push({ loc: [name, k], msg: 'extra field not permitted', type: 'extra_forbidden' });
      ok = false;
    }
  }
  if (!MODES.includes(z.mode)) {
    errors.push({ loc: [name, 'mode'], msg: `must be one of ${MODES.join(', ')}`, type: 'enum' });
    ok = false;
  }
  for (const [k, rule] of Object.entries(ZONE_FIELDS)) {
    const before = errors.length;
    checkNumber(errors, [name, k], z[k], rule);
    if (errors.length > before) ok = false;
  }
  if (ok && !(z.alarm_low < z.setpoint && z.setpoint < z.alarm_high)) {
    errors.push({ loc: [name], msg: 'need alarm_low < setpoint < alarm_high', type: 'value_error' });
  }
}

// Returns an array of errors (empty when valid). Missing fields are errors; merge() fills them.
export function validate(s) {
  const errors = [];
  if (!isObj(s)) return [{ loc: [], msg: 'must be an object', type: 'type_error' }];
  const known = new Set([...ZONES, 'vent_override', ...Object.keys(GLOBAL_FIELDS)]);
  for (const k of Object.keys(s)) {
    if (!known.has(k)) errors.push({ loc: [k], msg: 'extra field not permitted', type: 'extra_forbidden' });
  }
  for (const z of ZONES) checkZone(errors, z, s[z]);
  for (const [k, rule] of Object.entries(GLOBAL_FIELDS)) checkNumber(errors, [k], s[k], rule);
  if (s.vent_override !== null) checkNumber(errors, ['vent_override'], s.vent_override, [0, 100]);
  return errors;
}

export class ValidationError extends Error {
  constructor(errors) {
    super('invalid settings: ' + errors.map((e) => `${e.loc.join('.')} ${e.msg}`).join('; '));
    this.errors = errors;
  }
}

function deep(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? deep(a[k], v) : v;
  return out;
}

// Deep-merge a partial patch onto base; throws ValidationError if the result is invalid.
export function merge(base, patch) {
  if (!isObj(patch)) throw new ValidationError([{ loc: [], msg: 'body must be an object', type: 'type_error' }]);
  const merged = deep(base, patch);
  const errors = validate(merged);
  if (errors.length) throw new ValidationError(errors);
  return merged;
}

export function load(file) {
  try {
    return merge(defaults(), JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return defaults();
  }
}

export function save(file, s) {
  // write-then-rename so a crash never leaves a truncated file
  const full = path.resolve(file);
  const tmp = path.join(path.dirname(full), `${path.basename(full)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, full);
}
