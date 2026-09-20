// Hen AI ($911E) and hen/player collision ($929C, $9E66).
// A hen record is {x, y, state}: x = left pixel, y = FEET line (counted up from
// the bottom), state 1 = walking left, 2 = right, 3 = climbing down, 4 = up,
// 7/8 = pausing to eat seed (state + 6). Each call moves ONE hen (slots cycle).
import { COST, TILE } from './consts.js';
import { tileAt } from './map.js';

/** $92A4..$92BC / $9E66: Harry dies if within (-8, +5] px horizontally and (0, 28] vertically. */
export function henCollision(s, h, airborneCheck = false) {
  if (s.cheats?.noHens && !airborneCheck) return false; // the POKE only disables $929C
  const hi = (h.x + 5) & 0xff;
  if (hi < s.x) return false;
  const lo = Math.max(h.x - 8, 0);
  if (lo >= s.x) return false;
  if (h.y >= s.y) return false;
  if (h.y + 28 < s.y) return false;
  s.dead = 'hen';
  return true;
}

/** Sprite number the original draws for a hen ($92CA..$92E5): 1..8, see extract.js SPRITES. */
export function henSprite(h) {
  let a = h.state;
  if (a === 4) a = 3;
  if (a < 7) {
    if (a === 3) { if (h.y & 4) a = 4; }
    else if (h.x & 4) a += 4;
  }
  return a;
}

/** $911E: advance the next hen slot. Returns true if Harry was caught. */
export function moveHens(s) {
  if (s.level >= 8 && s.level < 16) return false; // duck-only pass: hens are frozen
  s.rngPtr = (s.rngPtr + 1) & 0xff;
  const rnd = s.rom[s.rngPtr];
  let c = rnd & 1 ? 0 : 1;
  s.henSlot = (s.henSlot + 1) % 5;
  const h = s.hens[s.henSlot];
  if (h.x === 0xff) return false;
  s.t += COST.HEN_MOVE;

  if (henCollision(s, h)) return true; // $9157: erase pass tests collision too

  if (h.state >= 7) {
    // $915B: finished eating; restore the walking state, erase the eating
    // sprite (drawn 8 px left when facing left) and redraw
    h.state -= 6;
    if (h.state !== 2 && henCollision(s, { x: (h.x - 8) & 0xff, y: h.y })) return true;
    return henCollision(s, h);
  }

  if (h.state < 3) {
    // ---- walking ($9178)
    if ((h.x & 4) === 0) {
      if (eatSeed(s, h)) return henCollision(s, h.state === 8 ? h : { x: (h.x - 8) & 0xff, y: h.y });
      let turn = false;
      let px = h.x + 8;
      if (px > 0xff) turn = true;
      else if (h.state === 1) { px -= 16; if (px < 0) turn = true; }
      if (!turn) {
        const t = tileAt(s.map, px, (h.y - 1) & 0xff);
        if (t === 0 || (t >= 3 && t !== TILE.FLOOR)) turn = true;
      }
      if (turn) h.state = 3 - h.state;
    }
    // $91A5: step 4 px and draw
    h.x = (h.x + (h.state === 1 ? -4 : 4)) & 0xff;
    if (henCollision(s, h)) return true;
    if (!(h.x & 4)) return false; // $91BA: ladders are only considered at x = 4 mod 8
    if (--c !== 0) return false; // random gate: only consider ladders when ROM bit 0 is clear
    // $91BF: look for a ladder to climb; ROM bit 1 chooses which way to try first
    const tryDown = () => tileAt(s.map, h.x, (h.y - 8) & 0xff) === TILE.LADDER_L && (h.state = 3, true);
    const tryUp = () => tileAt(s.map, h.x, (h.y + 16) & 0xff) === TILE.LADDER_L && (h.state = 4, true);
    if (rnd & 2) { tryDown() || tryUp(); } else { tryUp() || tryDown(); }
    return false;
  }

  // ---- climbing ($91F3)
  if ((h.y & 4) === 0) {
    const probeY = h.state === 3 ? (h.y - 8) & 0xff : (h.y + 16) & 0xff;
    if (tileAt(s.map, h.x, probeY) !== TILE.LADDER_L) h.state = 7 - h.state; // reverse
  }
  h.y = (h.y + (h.state === 3 ? -4 : 4)) & 0xff;
  if (henCollision(s, h)) return true;
  if (h.y & 4) return false;
  if (--c !== 0) return false;
  // $922A: step off onto a platform if there is floor beside the ladder one row down
  const fy = (h.y - 8) & 0xff;
  const tryLeft = () => tileAt(s.map, (h.x - 8) & 0xff, fy) === TILE.FLOOR && (h.state = 1, true);
  const tryRight = () => tileAt(s.map, (h.x + 16) & 0xff, fy) === TILE.FLOOR && (h.state = 2, true);
  if (rnd & 2) { tryLeft() || tryRight(); } else { tryRight() || tryLeft(); }
  return false;
}

/** $9265: eat the seed one cell ahead (at feet level). Returns true if eating started. */
function eatSeed(s, h) {
  let px = h.x + 8;
  if (px > 0xff) return false;
  if (h.state !== 2) { px -= 16; if (px < 0) return false; }
  const i = ((h.y >> 3) * 32) + (px >> 3);
  if (s.map[i] !== TILE.SEED) return false;
  s.map[i] = 0;
  h.state += 6;
  s.events.push({ type: 'henEat', x: px, y: h.y });
  return true;
}
