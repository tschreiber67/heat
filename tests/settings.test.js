import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as S from '../src/settings.js';

test('defaults are valid', () => {
  assert.deepEqual(S.validate(S.defaults()), []);
});

const bad = [
  ['setpoint above alarm_high', { upper: { setpoint: 60 } }],
  ['unknown mode', { upper: { mode: 'turbo' } }],
  ['negative kp', { upper: { kp: -1 } }],
  ['vent_margin of zero', { vent_margin: 0 }],
  ['alarm_low above setpoint', { lower: { alarm_low: 40 } }],
  ['unknown top-level field', { bogus: 1 }],
];
for (const [name, patch] of bad) {
  test(`rejects invalid: ${name}`, () => {
    assert.throws(() => S.merge(S.defaults(), patch), S.ValidationError);
  });
}

test('merge is partial', () => {
  const s = S.merge(S.defaults(), { upper: { setpoint: 40 } });
  assert.ok(s.upper.setpoint === 40 && s.lower.setpoint === 33);
});

test('persistence roundtrip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-'));
  try {
    const p = path.join(dir, 's.json');
    const s = S.merge(S.defaults(), { vent_margin: 3.5, lower: { kp: 0.9 } });
    S.save(p, s);
    assert.deepEqual(S.load(p), s);
    assert.deepEqual(fs.readdirSync(dir), ['s.json']); // no temp file left behind
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt or missing file falls back to defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-'));
  try {
    const p = path.join(dir, 's.json');
    assert.deepEqual(S.load(p), S.defaults());
    fs.writeFileSync(p, '{not json');
    assert.deepEqual(S.load(p), S.defaults());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
