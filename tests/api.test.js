import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { FakeDriver } from './fakes.js';

// In-process server on an ephemeral port; ticks are driven directly (no timers, no sleeps).
async function withClient(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-api-'));
  const driver = new FakeDriver();
  const app = createApp({ driver, settingsPath: path.join(dir, 's.json'), tickS: 1, runLoop: false });
  const port = await app.start(0);
  const base = 'http://127.0.0.1:' + port;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
  try {
    await fn({
      get: (p) => call('GET', p),
      put: (p, b) => call('PUT', p, b),
      post: (p, b) => call('POST', p, b),
      driver, app, dir,
    });
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('state, readings and fault endpoints', () => withClient(async (c) => {
  const st = (await c.get('/api/state')).body;
  assert.deepEqual(Object.keys(st.temps).sort(), ['ambient', 'electronics', 'lower', 'upper']);
  assert.equal((await c.get('/api/readings')).body.temps.upper, 30);
  assert.equal((await c.get('/api/fault')).body.fault, false);
}));

test('settings PUT, GET and persistence', () => withClient(async (c) => {
  const r = await c.put('/api/settings', { upper: { setpoint: 40, alarm_high: 55 } });
  assert.equal(r.status, 200);
  assert.equal((await c.get('/api/settings')).body.upper.setpoint, 40);
  assert.ok(fs.readFileSync(path.join(c.dir, 's.json'), 'utf8').includes('40'));
}));

test('invalid settings return 422 and leave settings unchanged', () => withClient(async (c) => {
  const r = await c.put('/api/settings', { upper: { setpoint: 99 } });
  assert.equal(r.status, 422);
  assert.ok(Array.isArray(r.body.detail) && r.body.detail.length > 0);
  assert.equal((await c.get('/api/settings')).body.upper.setpoint, 35);
}));

test('history grows and honours limit', () => withClient(async (c) => {
  c.app.advance(1);
  c.app.advance(1);
  assert.ok((await c.get('/api/history')).body.length >= 3);
  assert.equal((await c.get('/api/history?limit=2')).body.length, 2);
}));

test('override sets vent and zone duty; bad input is 422', () => withClient(async (c) => {
  await c.post('/api/override', { vent: 70, upper_duty: 0.4 });
  c.app.advance(1);
  const st = (await c.get('/api/state')).body;
  assert.ok(st.vent === 70 && st.duty.upper === 0.4);
  await c.post('/api/override', { clear_vent: true });
  assert.equal((await c.get('/api/settings')).body.vent_override, null);
  assert.equal((await c.post('/api/override', { vent: 500 })).status, 422);
}));

test('fault is visible through the API', () => withClient(async (c) => {
  c.driver.temps.upper = 70;
  c.app.advance(1);
  const f = (await c.get('/api/fault')).body;
  assert.ok(f.fault && (await c.get('/api/state')).body.vent === 100);
}));

test('index page is served', () => withClient(async (c) => {
  const r = await c.get('/');
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('Heat controller'));
}));
