import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/controller.js';
import { defaults } from '../src/settings.js';
import { FakeDriver } from './fakes.js';

function run(c, secs, dt = 1) {
  for (let i = 0; i < Math.floor(secs / dt); i++) c.tick(dt);
}

test('normal control heats and raises no fault', () => {
  const c = new Controller(new FakeDriver({ upper: 20, lower: 20 }), defaults());
  run(c, 20);
  assert.ok(!c.fault && c.duty.upper > 0);
});

test('over-temp opens vents, heaters off, loop keeps running', () => {
  const d = new FakeDriver({ upper: 61 });
  const c = new Controller(d, defaults());
  c.tick(1);
  assert.ok(c.fault && c.vent === 100);
  assert.deepEqual(c.duty, { upper: 0, lower: 0 });
  assert.equal(d.applied[2], 100);
  assert.deepEqual(d.applied.slice(0, 2), [false, false]);
  const t = c.t;
  c.tick(1);
  assert.ok(c.t > t); // still ticking, no latch-up
});

test('stale and out-of-range sensors fault', () => {
  const d = new FakeDriver();
  const c = new Controller(d, defaults());
  d.age = 99;
  c.tick(1);
  assert.ok(c.fault);
  d.age = 0;
  d.temps.ambient = 500;
  c.tick(1);
  assert.ok(c.fault && c.faultReasons.some((r) => r.includes('out of range')));
});

test('low alarm and zone difference fault', () => {
  let c = new Controller(new FakeDriver({ lower: 2 }), defaults());
  c.tick(1);
  assert.ok(c.fault);
  c = new Controller(new FakeDriver({ upper: 40, lower: 30 }), defaults());
  c.tick(1);
  assert.ok(c.fault && c.faultReasons.includes('zone difference exceeds limit'));
});

test('fault clears automatically after the hold', () => {
  const d = new FakeDriver({ upper: 61 });
  const c = new Controller(d, defaults());
  c.tick(1);
  assert.ok(c.fault);
  d.temps.upper = 30;
  run(c, 29);
  assert.ok(c.fault && c.vent === 100); // 29 s healthy: not yet
  run(c, 2);
  assert.ok(!c.fault); // >= 30 s healthy: resumes with no manual clear
  c.tick(1);
  assert.ok(c.vent < 100);
});

test('relapse during the hold restarts the timer', () => {
  const d = new FakeDriver({ upper: 61 });
  const c = new Controller(d, defaults());
  c.tick(1);
  d.temps.upper = 30;
  run(c, 25);
  d.temps.upper = 61;
  c.tick(1);
  d.temps.upper = 30;
  run(c, 25);
  assert.ok(c.fault);
  run(c, 6);
  assert.ok(!c.fault);
});

test('configurable hold', () => {
  const d = new FakeDriver({ upper: 61 });
  const c = new Controller(d, defaults({ fault_hold_s: 5 }));
  c.tick(1);
  d.temps.upper = 30;
  run(c, 6);
  assert.ok(!c.fault);
});

test('vent opens proportionally past the margin; manual override wins', () => {
  const d = new FakeDriver({ upper: 37, lower: 33 }); // sp 35, margin 2 -> at margin edge
  const c = new Controller(d, defaults());
  c.tick(1);
  assert.equal(c.vent, 0);
  d.temps.upper = 38;
  c.tick(1);
  assert.equal(c.vent, 50);
  c.settings = defaults({ vent_override: 20 });
  c.tick(1);
  assert.equal(c.vent, 20);
});

test('zone modes off and manual', () => {
  const s = defaults();
  s.upper.mode = 'off';
  s.lower.mode = 'manual';
  s.lower.manual_duty = 0.5;
  const c = new Controller(new FakeDriver({ upper: 25, lower: 25 }), s);
  c.tick(1);
  assert.deepEqual(c.duty, { upper: 0, lower: 0.5 });
});
