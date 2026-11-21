import test from 'node:test';
import assert from 'node:assert/strict';
import { PID } from '../src/pid.js';

test('pure P', () => {
  assert.ok(Math.abs(new PID().step(30, 28, 0.1, 0, 0, 1) - 0.2) < 1e-9);
});

test('output clamped to 0..1', () => {
  assert.equal(new PID().step(100, 0, 10, 0, 0, 1), 1);
  assert.equal(new PID().step(0, 100, 10, 0, 0, 1), 0);
});

test('integral accumulates, then stops when saturated', () => {
  const p = new PID();
  for (let i = 0; i < 5; i++) p.step(30, 29, 0.01, 0.01, 0, 1);
  assert.ok(p.integral > 0);
  const q = new PID();
  for (let i = 0; i < 50; i++) q.step(100, 0, 10, 1, 0, 1);
  assert.equal(q.integral, 0); // saturated from the start: no windup
});

test('derivative on measurement opposes rise', () => {
  const p = new PID();
  p.step(30, 20, 0, 0, 1.0, 1);
  assert.equal(p.step(30, 22, 0, 0, 1.0, 1), 0); // rising -> D term negative, clamped
});

test('converges on a simple plant', () => {
  const p = new PID();
  let T = 20;
  for (let i = 0; i < 3000; i++) {
    const u = p.step(30, T, 0.3, 0.005, 1.0, 1);
    T += 0.5 * u - 0.002 * (T - 20);
  }
  assert.ok(Math.abs(T - 30) < 0.5);
});
