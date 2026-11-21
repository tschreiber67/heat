import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/controller.js';
import { defaults } from '../src/settings.js';
import { Simulator } from '../src/simulator.js';

function trace(seed) {
  const sim = new Simulator(seed);
  const c = new Controller(sim, defaults());
  const out = [];
  for (let i = 0; i < 120; i++) {
    sim.advance(1);
    out.push(c.tick(1).temps);
  }
  return out;
}

function withEnv(value, fn) {
  const old = process.env.HEAT_SEED;
  if (value === undefined) delete process.env.HEAT_SEED;
  else process.env.HEAT_SEED = value;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env.HEAT_SEED;
    else process.env.HEAT_SEED = old;
  }
}

test('unseeded runs differ', () => {
  withEnv(undefined, () => {
    const a = new Simulator();
    const b = new Simulator();
    assert.notEqual(a.seed, b.seed);
    assert.notDeepEqual(a.read(), b.read());
  });
});

test('HEAT_SEED replays a run exactly', () => {
  withEnv('42', () => {
    assert.equal(new Simulator().seed, 42);
    assert.deepEqual(trace(42), trace(42));
    assert.notDeepEqual(trace(42), trace(43));
  });
});

test('heater raises temperature and vent cools', () => {
  const s = new Simulator(1);
  s.noise = 0;
  const t0 = s.upper;
  s.apply(true, true, 0);
  s.advance(30);
  const hot = s.upper;
  assert.ok(hot > t0 + 5);
  s.apply(false, false, 100);
  s.advance(60);
  assert.ok(s.upper < hot);
});

test('closed loop reaches setpoint', () => {
  const sim = new Simulator(7);
  const c = new Controller(sim, defaults({ fault_hold_s: 5 }));
  for (let i = 0; i < 1500; i++) {
    sim.advance(1);
    c.tick(1);
  }
  assert.ok(Math.abs(c.temps.upper - 35) < 4 && Math.abs(c.temps.lower - 33) < 4);
});
