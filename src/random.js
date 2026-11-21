// Self-contained seeded PRNG (sfc32 seeded through splitmix32). Math.random is not seedable.
import { randomBytes } from 'node:crypto';

function splitmix32(a) {
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export class Rng {
  constructor(seed) {
    const s = Math.abs(Math.trunc(Number(seed)));
    const lo = splitmix32((s % 4294967296) | 0);
    const hi = splitmix32(Math.floor(s / 4294967296) | 0);
    this.a = lo() ^ hi();
    this.b = lo();
    this.c = lo();
    this.d = lo();
    for (let i = 0; i < 15; i++) this.u32();
    this.spare = null;
  }

  u32() {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  random() { return this.u32() / 4294967296; }
  uniform(lo, hi) { return lo + (hi - lo) * this.random(); }
  choice(items) { return items[Math.floor(this.random() * items.length)]; }

  gauss(mu, sigma) {
    if (this.spare !== null) {
      const z = this.spare;
      this.spare = null;
      return mu + sigma * z;
    }
    let u = 0;
    while (u === 0) u = this.random();
    const v = this.random();
    const rad = Math.sqrt(-2 * Math.log(u));
    this.spare = rad * Math.sin(2 * Math.PI * v);
    return mu + sigma * rad * Math.cos(2 * Math.PI * v);
  }
}

// HEAT_SEED replays a run; otherwise OS entropy (52 bits, exact in a JS number).
export function makeSeed(env = process.env) {
  const e = env.HEAT_SEED;
  if (e !== undefined && e !== '') return Number(e);
  const b = randomBytes(7);
  return Number(BigInt('0x' + b.toString('hex')) & ((1n << 52n) - 1n));
}
