// Compares src/game against the original binary running in a Z80 core.
// Needs reference/ritchie/src/chuckie.sna and reference/48.rom (gitignored);
// skipped when they are absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { available } from '../tools/emu/host.mjs';

const skip = !available();

test('random play on level 1 matches the original tick for tick', { skip }, async () => {
  const { runDiff } = await import('../tools/emu/diff.mjs');
  for (const seed of [1, 2, 3]) {
    const r = runDiff({ seed, maxTicks: 3000 });
    assert.equal(r.mismatch, null, `seed ${seed}: ${r.mismatch}`);
  }
});

test('duck-only pass runs to the time-out identically', { skip }, async () => {
  const { runDiff } = await import('../tools/emu/diff.mjs');
  const r = runDiff({ seed: 11, maxTicks: 12000, startLevel: 8, noDuck: true });
  assert.equal(r.mismatch, null, r.mismatch);
  assert.equal(r.reason, 'time');
});

test('landing on and riding a lift matches', { skip }, async () => {
  const { runDiff } = await import('../tools/emu/diff.mjs');
  const { NO_INPUT } = await import('../src/game/machine.js');
  const script = (t) => (t < 12 ? { ...NO_INPUT, left: true } : t === 12 ? { ...NO_INPUT, left: true, jump: true } : NO_INPUT);
  const r = runDiff({ startLevel: 2, noHens: true, noDuck: true, maxTicks: 1000, script });
  assert.equal(r.mismatch, null, r.mismatch);
  assert.equal(r.reason, 'liftTop');
});
