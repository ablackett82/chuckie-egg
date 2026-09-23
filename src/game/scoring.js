// Score, bonus, time and egg/seed pickup ($A3A7, $A1B8, $99DF).
import { TILE, SEED_PAUSE } from './consts.js';
import { idx, at } from './map.js';

/**
 * $A3A7: add b*10 points. The score is six decimal digits ($6EC8..$6ECD); the
 * tens digit is incremented b times with carry. Every time the ten-thousands
 * digit changes an extra life is awarded ($A3BB..$A3E3).
 */
export function addScore(s, b) {
  if (b === 0) return;
  for (let n = 0; n < b; n++) {
    let i = 4; // $6ECC = tens digit
    for (;;) {
      s.score[i]++;
      if (s.score[i] !== 10) break;
      s.score[i] = 0;
      i--;
      if (i < 0) break; // rolls over past 999990 (original would corrupt $6EC7)
    }
  }
  if (s.score[1] !== s.scoreTenK) {
    s.scoreTenK = s.score[1];
    s.lives = (s.lives + 1) & 0xff;
    s.events.push({ type: 'extraLife' });
  }
}

export const scoreValue = (s) => s.score.reduce((v, d) => v * 10 + d, 0);

/** Easy mode: halve the score (to a multiple of 10) without awarding a life. */
export function halveScore(s) {
  let v = Math.floor(scoreValue(s) / 20) * 10;
  for (let i = 5; i >= 0; i--) { s.score[i] = v % 10; v = Math.floor(v / 10); }
  s.scoreTenK = s.score[1];
}

/**
 * $A1B8: decrement a 3-digit counter (bonus/10 or time). Returns true if the
 * counter was already 000 and rolled (digits become [255, 9, 9]).
 */
export function decCounter(digits) {
  for (let i = 2; ; i--) {
    digits[i] = (digits[i] - 1) & 0xff;
    if (digits[i] !== 0xff) return false;
    if (i === 0) return true;
    digits[i] = 9;
  }
}

export const counterValue = (d) => (d[0] === 0xff ? 0 : d[0] * 100 + d[1] * 10 + d[2]);

/**
 * $99DF: collect the tile under the middle of the sprite (x+8, y-8).
 * Returns 'complete' when the last egg is taken.
 */
export function pickup(s) {
  const i = idx(s.x + 8, s.y - 8);
  const t = at(s.map, i);
  if (t === TILE.EGG) {
    s.map[i] = 0;
    // $99F3: points = 100 * (min(level>>2, 9) + 1)
    const b = 10 * (Math.min(s.level >> 2, 9) + 1);
    addScore(s, b);
    s.sfxTimer = 0xff;
    s.events.push({ type: 'egg', x: s.x + 8, y: s.y - 8 });
    s.eggsLeft = (s.eggsLeft - 1) & 0xff;
    if (s.eggsLeft === 0) return 'complete';
  } else if (t === TILE.SEED) {
    s.map[i] = 0;
    addScore(s, 5);
    s.bonusCtr = SEED_PAUSE; // $9A21: ld hl,$FFFF ; ld ($7345),hl
    s.timeCtr = SEED_PAUSE;
    s.sfxTimer = 0xff;
    s.events.push({ type: 'seed', x: s.x + 8, y: s.y - 8 });
  }
  return null;
}
