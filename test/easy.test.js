// Easy (cheat) mode. Each test also runs the same moves in normal mode to show
// the original behaviour is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, fastStep, advance, NO_INPUT } from '../src/game/machine.js';
import { FRAME_DIV, FACE_LEFT, CPU_HZ } from '../src/game/consts.js';
import { levels, rom } from './helpers.js';

const I = (o) => ({ ...NO_INPUT, ...o });
const game = (easy, opts = {}) => newGame(levels, rom, { easy, noHens: true, noDuck: true, ...opts });

function runTicks(s, n, input = NO_INPUT) {
  let r = null;
  for (let i = 0; i < n && r === null; i++) {
    do { r = fastStep(s, input); } while (s.frameDiv !== FRAME_DIV && r === null);
  }
  return r;
}

test('easy: losing the last life refills the lives and halves the score', () => {
  for (const easy of [false, true]) {
    const s = newGame(levels, rom, { easy });
    s.lives = 1; s.score = [0, 1, 2, 3, 4, 0]; s.scoreTenK = 1;
    s.time = [0, 0, 0]; s.timeCtr = 1; // out of time on the next tick
    advance(s, 6 * CPU_HZ, () => NO_INPUT);
    const types = s.events.map((e) => e.type);
    if (!easy) { assert.equal(s.phase, 'gameover'); continue; }
    assert.equal(s.phase, 'level');
    assert.equal(s.lives, 5);
    assert.deepEqual(s.score, [0, 0, 6, 1, 7, 0]); // 12340 -> 6170
    assert.ok(types.includes('scoreHalved'));
    assert.ok(!types.includes('extraLife')); // the ten-thousands digit changing is not a bonus life here
  }
});

test('easy: left/right on a ladder climbs to the nearest platform row and steps off', () => {
  for (const easy of [false, true]) {
    const s = game(easy);
    runTicks(s, 20, I({ left: true })); // to the centre ladder, x = 80
    runTicks(s, 29, I({ up: true }));   // y = 52: 3 px short of the row-4 platform (y = 55)
    assert.equal(s.y, 52);
    runTicks(s, 10, I({ left: true }));
    if (!easy) { assert.equal(s.x, 80); continue; } // original: stuck until exactly aligned
    assert.equal(s.y, 55);
    assert.equal(s.base, FACE_LEFT);
    assert.ok(s.x < 80);
    assert.equal(s.jumpState, 0); // standing on the platform, not falling
  }
});

test('easy: left/right between platforms steps off the ladder into a fall', () => {
  for (const easy of [false, true]) {
    const s = game(easy);
    runTicks(s, 20, I({ left: true }));
    runTicks(s, 8, I({ up: true })); // y = 31, nothing beside the ladder
    runTicks(s, 12, I({ left: true }));
    if (!easy) { assert.equal(s.x, 80); continue; }
    assert.ok(s.x < 80);
    assert.notEqual(s.jumpState, 0);
  }
});

test('easy: up+left on a ladder mid-air keeps climbing (no accidental step-off)', () => {
  const s = game(true);
  runTicks(s, 20, I({ left: true }));
  runTicks(s, 2, I({ up: true }));
  runTicks(s, 10, I({ up: true, left: true })); // passes the y = 31 row with nothing beside it
  assert.equal(s.x, 80);
  assert.equal(s.y, 35);
  assert.equal(s.jumpState, 0);
});

test('easy: a direction pressed just after a straight-up jump sends it that way', () => {
  for (const easy of [false, true]) {
    const s = game(easy);
    runTicks(s, 1, I({ jump: true }));
    runTicks(s, 3);
    runTicks(s, 10, I({ right: true }));
    if (easy) assert.ok(s.x > 100); else assert.equal(s.x, 100);
  }
});

test('easy: the grace window closes, so a late press does not redirect the jump', () => {
  const s = game(true);
  runTicks(s, 1, I({ jump: true }));
  runTicks(s, 10); // still rising, past the grace window
  assert.equal(s.vdir, 1);
  runTicks(s, 2, I({ right: true }));
  assert.equal(s.x, 100);
});

test('easy: left/right steers a fall, and steering back onto the ledge saves you', () => {
  for (const easy of [false, true]) {
    const s = game(easy, { startLevel: 2 }); // level 3: a gap left of the start platform
    let n = 0;
    while (s.jumpState === 0 && n++ < 60) runTicks(s, 1, I({ left: true }));
    assert.notEqual(s.jumpState, 0);
    runTicks(s, 40, I({ right: true }));
    if (easy) { assert.equal(s.jumpState, 0); assert.equal(s.y, 23); } // back on the platform
    else assert.ok(s.y < 23); // fell regardless
  }
});
