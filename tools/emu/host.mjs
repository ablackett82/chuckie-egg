// Runs the original Chuckie Egg binary (reference/ritchie/src/chuckie.sna +
// reference/48.rom) in a Z80 core. Used for timing calibration and for the
// differential test that checks src/game against the real thing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z80 } from 'z80-emulator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SNA = path.join(ROOT, 'reference', 'ritchie', 'src', 'chuckie.sna');
export const ROM = path.join(ROOT, 'reference', '48.rom');
export const T_FRAME = 69888;

export const available = () => fs.existsSync(SNA) && fs.existsSync(ROM);

// Addresses of the original's variables (see src/game/machine.js comments)
export const V = {
  x: 0x72d8, y: 0x72d9, anim: 0x72da, base: 0x72db, frameDiv: 0x72dc,
  jumpState: 0x7325, jumpDx: 0x7326, vel: 0x7327, delay: 0x7328, vdir: 0x732a,
  liftDiv: 0x733c, bonus: 0x733f, time: 0x7342, bonusCtr: 0x7345, timeCtr: 0x7346, bonusRunning: 0x7347,
  duckX: 0x7348, duckY: 0x7349, duckDx: 0x734a, duckDy: 0x734b, duckCtr: 0x734c, duckAnim: 0x734d,
  liftFlag: 0x7350, liftC1: 0x7351, liftC2: 0x7354, onLift: 0x7355, henSlot: 0x7356, hens: 0x7357,
  henCtr: 0x736b, rngPtr: 0x736c, sfxTimer: 0x7370,
  score: 0x6ec8, eggsLeft: 0x6ee6, level: 0x6eeb, lives: 0x6ef0, map: 0x61a8,
  keys: 0x732e, // 6 x (mask, port) for up, down, left, right, jump1, jump2
};

export class Host {
  constructor() {
    const sna = fs.readFileSync(SNA);
    this.mem = new Uint8Array(65536);
    this.mem.set(fs.readFileSync(ROM), 0);
    this.mem.set(sna.subarray(27), 0x4000);
    this.keys = {}; // port-row byte -> bits held down
    const mem = this.mem, self = this;
    this.hal = {
      tStateCount: 0,
      readMemory: (a) => mem[a],
      writeMemory: (a, v) => { if (a >= 0x4000) mem[a] = v; },
      contendMemory() {},
      readPort(addr) {
        if ((addr & 0xff) !== 0xfe) return 0xff;
        const hi = (addr >> 8) & 0xff;
        let v = 0xff;
        for (const [row, bits] of Object.entries(self.keys)) if ((~hi & ~Number(row) & 0xff) !== 0) v &= ~bits;
        return v;
      },
      writePort() {}, contendPort() {},
    };
    this.cpu = new Z80(this.hal);
    this.cpu.reset();
    const r = this.cpu.regs;
    r.pc = 0xa59d; r.sp = 0x7f00; r.i = 0xb2; r.im = 2; r.iff1 = r.iff2 = 1;
    // The level loop RETurns to its caller on death/completion; trap that.
    mem[0x7ff0] = 0x18; mem[0x7ff1] = 0xfe;
    this.cpu.pushWord(0x7ff0);
    this.nextIrq = T_FRAME;
    this.returned = false;
  }

  get pc() { return this.cpu.regs.pc; }
  get t() { return this.hal.tStateCount; }

  step() {
    this.cpu.step();
    if (this.hal.tStateCount >= this.nextIrq) { this.nextIrq += T_FRAME; this.cpu.maskableInterrupt(); }
    // the level loop ($AE9C, called from $A653) returns to $A656 on death or completion
    if (this.cpu.regs.pc === 0xa656) this.returned = true;
  }

  /** Run until PC reaches one of `addrs` (or the level loop returns). */
  runTo(addrs, maxT = 1e9) {
    const set = addrs instanceof Set ? addrs : new Set(addrs);
    const end = this.t + maxT;
    for (;;) {
      this.step();
      if (set.has(this.pc) || this.returned || this.t > end) return this.pc;
    }
  }

  /**
   * Answer the "how many players" prompt with 1 and run to the first inner-loop
   * iteration. Options: startLevel (0-based), noHens (POKE $929C,201 as documented
   * in the disassembly), noDuck (skip the duck test at $9B9E).
   */
  startOnePlayerGame({ startLevel = 0, noHens = false, noDuck = false } = {}) {
    const mem = this.mem;
    if (noHens) mem[0x929c] = 0xc9;
    if (noDuck) { mem[0x9b9e] = 0x18; mem[0x9b9f] = 0x37; } // jr $9BD7
    this.keys = { 0xf7: 0x01 };
    if (startLevel) {
      this.runTo([0xa653]); // about to start level 1: switch the buffer and level number
      mem[V.level] = startLevel;
      mem.copyWithin(V.map, 0xb3b0 + 672 * (startLevel & 7), 0xb3b0 + 672 * ((startLevel & 7) + 1));
    }
    this.runTo([0x9858]);
    this.keys = {};
    const k = this.mem.subarray(V.keys, V.keys + 12);
    this.keyDefs = { up: [k[1], k[0]], down: [k[3], k[2]], left: [k[5], k[4]], right: [k[7], k[6]], jump: [k[9], k[8]] };
  }

  /** Set held game keys from an {up,down,left,right,jump} object. */
  setInput(input) {
    const keys = {};
    for (const [name, on] of Object.entries(input)) {
      if (!on || !this.keyDefs[name]) continue;
      const [port, mask] = this.keyDefs[name];
      keys[port] = (keys[port] || 0) | (~mask & 0x1f);
    }
    this.keys = keys;
  }

  /** Snapshot of the variables the port must reproduce. */
  snapshot() {
    const m = this.mem;
    const hens = [];
    for (let i = 0; i < 5; i++) hens.push([m[V.hens + i * 4], m[V.hens + i * 4 + 1], m[V.hens + i * 4 + 2]]);
    return {
      x: m[V.x], y: m[V.y], anim: m[V.anim], base: m[V.base],
      jumpState: m[V.jumpState], jumpDx: m[V.jumpDx], vel: m[V.vel], delay: m[V.delay], vdir: m[V.vdir],
      onLift: m[V.onLift], liftC1: m[V.liftC1], liftC2: m[V.liftC2],
      liftLines: m[V.liftFlag] === 0xff ? null : [lineOf(m, 0x734e), lineOf(m, 0x7352)],
      bonus: [...m.subarray(V.bonus, V.bonus + 3)], time: [...m.subarray(V.time, V.time + 3)],
      bonusCtr: m[V.bonusCtr], timeCtr: m[V.timeCtr], bonusRunning: m[V.bonusRunning],
      duck: [m[V.duckX], m[V.duckY], m[V.duckDx], m[V.duckDy]],
      hens, henSlot: m[V.henSlot], rngPtr: m[V.rngPtr], sfxTimer: m[V.sfxTimer],
      score: [...m.subarray(V.score, V.score + 6)], eggsLeft: m[V.eggsLeft], lives: m[V.lives], level: m[V.level],
      mapHash: hashMap(m, V.map),
    };
  }
}

/** Bottom-up pixel line of a display-file address stored at mem[a..a+1]. */
function lineOf(m, a) {
  const addr = m[a] | (m[a + 1] << 8);
  const screenY = ((addr >> 11) & 3) * 64 + ((addr >> 5) & 7) * 8 + ((addr >> 8) & 7);
  return addr < 0x4000 || addr >= 0x5800 ? -1 : 191 - screenY;
}

export function hashMap(bytes, offset = 0) {
  let h = 2166136261;
  for (let i = 0; i < 672; i++) { h ^= bytes[offset + i]; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
