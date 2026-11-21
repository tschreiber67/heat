// Scripted readings; no physics, so safety logic is tested in isolation.
export class FakeDriver {
  constructor(temps = {}) {
    this.temps = { upper: 30, lower: 30, ambient: 20, electronics: 35, ...temps };
    this.age = 0;
    this.applied = null;
  }

  read() {
    const out = {};
    for (const [k, v] of Object.entries(this.temps)) out[k] = [v, this.age];
    return out;
  }

  apply(u, l, vent) {
    this.applied = [u, l, vent];
  }
}
