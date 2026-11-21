import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './settings.js';
import { Controller } from './controller.js';
import { Simulator } from './simulator.js';

const STATIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'static');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parseOverride(o) {
  const errors = [];
  if (!isObj(o)) return { errors: [{ loc: [], msg: 'body must be an object', type: 'type_error' }] };
  const num = (k, lo, hi) => {
    if (o[k] === undefined || o[k] === null) return null;
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k]) || o[k] < lo || o[k] > hi) {
      errors.push({ loc: [k], msg: `must be a number in ${lo}..${hi}`, type: 'range_error' });
    }
    return o[k];
  };
  const vent = num('vent', 0, 100);
  const upper = num('upper_duty', 0, 1);
  const lower = num('lower_duty', 0, 1);
  if (o.clear_vent !== undefined && typeof o.clear_vent !== 'boolean') {
    errors.push({ loc: ['clear_vent'], msg: 'must be a boolean', type: 'type_error' });
  }
  const patch = {};
  if (o.clear_vent === true) patch.vent_override = null;
  else if (vent !== null) patch.vent_override = vent;
  if (upper !== null) patch.upper = { mode: 'manual', manual_duty: upper };
  if (lower !== null) patch.lower = { mode: 'manual', manual_duty: lower };
  return { errors, patch };
}

export function createApp({ driver = null, settingsPath = null, tickS = null, runLoop = true } = {}) {
  const file = settingsPath ?? process.env.HEAT_SETTINGS ?? 'settings.json';
  const tick = tickS ?? Number(process.env.HEAT_TICK ?? '1.0');
  let announce = null;
  if (driver === null) {
    driver = new Simulator();
    announce = `heat simulator seed: ${driver.seed}`;
  }
  const ctl = new Controller(driver, S.load(file));

  const advance = (dt) => {
    if (typeof driver.advance === 'function') driver.advance(dt);
    return ctl.tick(dt);
  };
  advance(tick); // populate state before the first request

  const update = (next) => {
    ctl.settings = next;
    S.save(file, next);
  };

  const send = (res, code, body) => {
    const data = JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
    res.end(data);
  };
  const invalid = (res, errors) => send(res, 422, { detail: errors });

  const readJson = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const m = req.method;
    if (m === 'GET' && p === '/') {
      const html = fs.readFileSync(path.join(STATIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
      return res.end(html);
    }
    if (m === 'GET' && p === '/api/state') return send(res, 200, ctl.snapshot());
    if (m === 'GET' && p === '/api/readings') return send(res, 200, { temps: ctl.temps, t: ctl.t });
    if (m === 'GET' && p === '/api/fault') {
      const r = ctl.snapshot();
      return send(res, 200, { fault: r.fault, fault_reasons: r.fault_reasons, clear_remaining_s: r.clear_remaining_s });
    }
    if (m === 'GET' && p === '/api/settings') return send(res, 200, ctl.settings);
    if (m === 'GET' && p === '/api/history') {
      const raw = url.searchParams.get('limit');
      const limit = raw === null ? 600 : Number(raw);
      if (!Number.isInteger(limit)) return invalid(res, [{ loc: ['limit'], msg: 'must be an integer', type: 'type_error' }]);
      return send(res, 200, ctl.history.slice(-Math.max(1, limit)));
    }
    if ((m === 'PUT' && p === '/api/settings') || (m === 'POST' && p === '/api/override')) {
      let body;
      try {
        body = await readJson(req);
      } catch {
        return invalid(res, [{ loc: ['body'], msg: 'invalid JSON', type: 'json_invalid' }]);
      }
      try {
        let patch = body;
        if (p === '/api/override') {
          const o = parseOverride(body);
          if (o.errors.length) return invalid(res, o.errors);
          patch = o.patch;
        }
        update(S.merge(ctl.settings, patch));
      } catch (e) {
        if (e instanceof S.ValidationError) return invalid(res, e.errors);
        throw e;
      }
      return send(res, 200, ctl.settings);
    }
    return send(res, 404, { detail: 'not found' });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (!res.headersSent) send(res, 500, { detail: String(e.message ?? e) });
      else res.end();
    });
  });

  let timer = null;
  return {
    server, ctl, advance, driver,
    async start(port = 0, host = '127.0.0.1') {
      if (announce) console.log(announce);
      if (runLoop) timer = setInterval(() => advance(tick), tick * 1000);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      return server.address().port;
    },
    async close() {
      if (timer) clearInterval(timer);
      timer = null;
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
