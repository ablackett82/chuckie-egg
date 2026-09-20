// Differential check: drive the original (in the Z80 core) and src/game with
// the same per-tick inputs and compare their state after every logic tick.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Host, available, hashMap } from './host.mjs';
import { newGame, fastStep, NO_INPUT } from '../../src/game/machine.js';
import { FRAME_DIV } from '../../src/game/consts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const levels = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels.json'), 'utf8')).levels;
const rom = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rng.json'), 'utf8')).bytes;

export function snapshotPort(s) {
  return {
    x: s.x, y: s.y, anim: s.anim, base: s.base,
    jumpState: s.jumpState, jumpDx: s.jumpDx, vel: s.vel, delay: s.delay, vdir: s.vdir,
    onLift: s.onLift, liftC1: s.lift.c1, liftC2: s.lift.c2,
    liftLines: s.lift.enabled ? [s.lift.line1, s.lift.line2].map((l) => (l > 191 ? -1 : l)) : null,
    bonus: [...s.bonus], time: [...s.time],
    bonusCtr: s.bonusCtr, timeCtr: s.timeCtr, bonusRunning: s.bonusRunning,
    duck: [s.duck.x, s.duck.y, s.duck.dx, s.duck.dy],
    hens: s.hens.map((h) => [h.x, h.y, h.state]), henSlot: s.henSlot, rngPtr: s.rngPtr, sfxTimer: s.sfxTimer,
    score: [...s.score], eggsLeft: s.eggsLeft, lives: s.lives, level: s.level,
    mapHash: hashMap(s.map),
  };
}

/** Deterministic input script: random holds of random key combos. */
export function makeScript(seed) {
  let st = seed >>> 0 || 1;
  const rnd = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const combos = [
    {}, { right: true }, { left: true }, { up: true }, { down: true }, { jump: true },
    { right: true, jump: true }, { left: true, jump: true }, { up: true, right: true }, { down: true, left: true },
    { right: true }, { left: true }, { up: true }, { down: true },
  ];
  let cur = {}, left = 0;
  return (tick) => {
    if (left-- <= 0) { cur = combos[Math.floor(rnd() * combos.length)]; left = 5 + Math.floor(rnd() * 90); }
    return { ...NO_INPUT, ...cur };
  };
}

export function diffState(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const av = JSON.stringify(a[k]), bv = JSON.stringify(b[k]);
    if (av !== bv) out.push(`${k}: original=${av} port=${bv}`);
  }
  return out;
}

/**
 * Run both for up to `maxTicks` ticks. Returns {ticks, mismatch, ended}.
 * `mismatch` is null if every compared tick agreed.
 */
export function runDiff({ seed = 1, maxTicks = 3000, script = makeScript(seed), log = () => {}, startLevel = 0, noHens = false, noDuck = false } = {}) {
  const host = new Host();
  host.startOnePlayerGame({ startLevel, noHens, noDuck });
  const s = newGame(levels, rom, { startLevel, noHens, noDuck });
  let tickNo = 0;
  for (; tickNo < maxTicks; tickNo++) {
    const input = script(tickNo);
    // original: run to the tick entry, apply keys, run to the tick exit
    host.runTo([0x98e6]);
    if (!host.returned) { host.setInput(input); host.runTo([0x9858]); }
    // port: step until a tick has run
    let r = null;
    do { r = fastStep(s, input); } while (s.frameDiv !== FRAME_DIV && r === null);
    if (host.returned || r !== null) {
      if (host.returned && r !== null) return { ticks: tickNo + 1, mismatch: null, ended: r, reason: s.dead };
      return { ticks: tickNo + 1, mismatch: `level ended in ${host.returned ? 'original' : 'port (' + r + ', ' + s.dead + ')'} only at tick ${tickNo}`, ended: host.returned ? 'original' : r };
    }
    const d = diffState(host.snapshot(), snapshotPort(s));
    if (d.length) return { ticks: tickNo + 1, mismatch: `tick ${tickNo} (input ${JSON.stringify(input)}):\n  ` + d.join('\n  '), ended: null };
    log(tickNo, snapshotPort(s));
  }
  return { ticks: tickNo, mismatch: null, ended: null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!available()) { console.error('reference/ files missing'); process.exit(2); }
  const args = process.argv.slice(2);
  const opt = { startLevel: 0, noHens: false, noDuck: false, maxTicks: 4000 };
  const seeds = [];
  for (const a of args) {
    if (a.startsWith('--level=')) opt.startLevel = Number(a.slice(8));
    else if (a === '--no-hens') opt.noHens = true;
    else if (a === '--no-duck') opt.noDuck = true;
    else if (a.startsWith('--ticks=')) opt.maxTicks = Number(a.slice(8));
    else seeds.push(Number(a));
  }
  for (const seed of seeds.length ? seeds : [1, 2, 3, 4, 5]) {
    const r = runDiff({ seed, ...opt });
    console.log(`level ${opt.startLevel + 1} seed ${seed}: ${r.ticks} ticks, ${r.mismatch ? 'MISMATCH ' + r.mismatch : 'ok'}${r.ended ? ` (level ended: ${r.ended} ${r.reason || ''})` : ''}`);
  }
}
