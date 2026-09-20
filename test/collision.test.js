import test from 'node:test';
import assert from 'node:assert/strict';
import { henCollision, henSprite } from '../src/game/hens.js';
import { duckCheck } from '../src/game/duck.js';
import { newGame } from '../src/game/machine.js';
import { levels, rom } from './helpers.js';

const withPlayer = (x, y) => { const s = newGame(levels, rom); s.x = x; s.y = y; return s; };

test('hen box: player x in (hx-8, hx+5], player y in (hy, hy+28]', () => {
  const h = { x: 100, y: 40, state: 1 };
  assert.equal(henCollision(withPlayer(105, 50), h), true);
  assert.equal(henCollision(withPlayer(106, 50), h), false);
  assert.equal(henCollision(withPlayer(93, 50), h), true);
  assert.equal(henCollision(withPlayer(92, 50), h), false);
  assert.equal(henCollision(withPlayer(100, 40), h), false); // same line: not caught
  assert.equal(henCollision(withPlayer(100, 68), h), true);
  assert.equal(henCollision(withPlayer(100, 69), h), false);
});

test('hen sprite selection alternates frames on 4px boundaries', () => {
  assert.equal(henSprite({ x: 8, y: 40, state: 1 }), 1);
  assert.equal(henSprite({ x: 12, y: 40, state: 1 }), 5);
  assert.equal(henSprite({ x: 12, y: 40, state: 3 }), 3);
  assert.equal(henSprite({ x: 12, y: 44, state: 4 }), 4);
  assert.equal(henSprite({ x: 12, y: 44, state: 8 }), 8);
});

test('duck box: within 8 px horizontally and 9 px vertically', () => {
  const s = withPlayer(100, 100);
  s.duck.x = 108; s.duck.y = 109;
  assert.equal(duckCheck(s), true);
  s.dead = null; s.duck.x = 109;
  assert.equal(duckCheck(s), false);
  s.duck.x = 92; s.duck.y = 91;
  assert.equal(duckCheck(s), false); // lower bounds are exclusive
});
