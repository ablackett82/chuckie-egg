import test from 'node:test';
import assert from 'node:assert/strict';
import { addScore, decCounter, counterValue, scoreValue, pickup } from '../src/game/scoring.js';
import { newGame } from '../src/game/machine.js';
import { TILE } from '../src/game/consts.js';
import { idx } from '../src/game/map.js';
import { levels, rom } from './helpers.js';

test('addScore adds b*10 with carry and awards a life every 10,000', () => {
  const s = newGame(levels, rom);
  addScore(s, 5);
  assert.equal(scoreValue(s), 50);
  addScore(s, 999);
  assert.equal(scoreValue(s), 10040);
  assert.equal(s.lives, 6);
  assert.deepEqual(s.events.filter((e) => e.type === 'extraLife').length, 1);
});

test('decCounter borrows through the digits and reports rolling past zero', () => {
  const d = [1, 0, 0];
  assert.equal(decCounter(d), false);
  assert.deepEqual(d, [0, 9, 9]);
  const z = [0, 0, 0];
  assert.equal(decCounter(z), true);
  assert.deepEqual(z, [0xff, 9, 9]);
  assert.equal(counterValue(z), 0);
});

test('egg is worth 100 x (level/4 + 1) and finishing the eggs completes the level', () => {
  const s = newGame(levels, rom, { startLevel: 5 }); // level 6 -> 200 per egg
  s.eggsLeft = 1;
  s.map[idx(s.x + 8, s.y - 8)] = TILE.EGG;
  assert.equal(pickup(s), 'complete');
  assert.equal(scoreValue(s), 200);
  assert.equal(s.map[idx(s.x + 8, s.y - 8)], 0);
});

test('seed pauses the bonus and time countdown for 255 ticks and scores 50', () => {
  const s = newGame(levels, rom);
  s.map[idx(s.x + 8, s.y - 8)] = TILE.SEED;
  assert.equal(pickup(s), null);
  assert.equal(scoreValue(s), 50);
  assert.equal(s.bonusCtr, 255);
  assert.equal(s.timeCtr, 255);
});
