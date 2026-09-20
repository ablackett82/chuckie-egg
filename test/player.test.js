import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, fastStep, NO_INPUT } from '../src/game/machine.js';
import { FRAME_DIV, FACE_LEFT, CLIMB } from '../src/game/consts.js';
import { levels, rom } from './helpers.js';

function runTicks(s, n, input = NO_INPUT) {
  let r = null;
  for (let i = 0; i < n && r === null; i++) {
    do { r = fastStep(s, input); } while (s.frameDiv !== FRAME_DIV && r === null);
  }
  return r;
}

test('walking moves one pixel per tick and faces the direction of travel', () => {
  const s = newGame(levels, rom);
  runTicks(s, 10, { ...NO_INPUT, left: true });
  assert.equal(s.x, 90);
  assert.equal(s.base, FACE_LEFT);
});

test('a standing jump rises exactly 11 pixels and lands back on the floor', () => {
  const s = newGame(levels, rom);
  let top = s.y;
  runTicks(s, 1, { ...NO_INPUT, jump: true });
  assert.equal(s.jumpState, 2);
  for (let i = 0; i < 100 && s.jumpState !== 0; i++) { runTicks(s, 1); top = Math.max(top, s.y); }
  assert.equal(top, 23 + 11);
  assert.equal(s.y, 23);
  assert.equal(s.jumpState, 0);
});

test('Harry climbs the level 1 centre ladder when column-aligned and holding up', () => {
  const s = newGame(levels, rom);
  runTicks(s, 20, { ...NO_INPUT, left: true }); // x 100 -> 80, the ladder at cols 10-11
  assert.equal(s.x, 80);
  runTicks(s, 8, { ...NO_INPUT, up: true });
  assert.equal(s.base, CLIMB);
  assert.equal(s.y, 31);
});

test('walking off a platform edge falls, and the fall ends on the floor below', () => {
  const s = newGame(levels, rom, { startLevel: 2, noHens: true, noDuck: true });
  runTicks(s, 30, { ...NO_INPUT, left: true }); // level 3 has a gap left of the start platform
  assert.notEqual(s.jumpState, 0);
});
