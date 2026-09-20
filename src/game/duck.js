// The mother duck ($A0C8) and its player-collision test ($9B9E, run at the end
// of every $9A4C sprite draw).
import { COST, DUCK_START_X, DUCK_START_Y } from './consts.js';

const sbyte = (b) => (b & 0x80 ? b - 256 : b);

/** $9B9E..$9BC6: kills when |duck - player| is within 8 px horizontally and 9 vertically. */
export function duckCheck(s) {
  if (s.cheats?.noDuck) return false;
  const d = s.duck;
  const hi = Math.min(s.x + 8, 0xff), lo = Math.max(s.x - 8, 0);
  if (hi < d.x || lo >= d.x) return false;
  const vhi = (s.y + 9) & 0xff, vlo = Math.max(s.y - 9, 0);
  if (vhi < d.y || vlo >= d.y) return false;
  s.dead = 'duck';
  return true;
}

/** $A0C8: accelerate towards the player (clamped +-5), bounce off the edges. */
export function moveDuck(s) {
  const d = s.duck;
  s.t += COST.DUCK_MOVE;
  if (d.x !== s.x) {
    if (d.x > s.x) { d.dx = (d.dx - 1) & 0xff; if (d.dx === 0xfa) d.dx = 0xfb; }
    else { d.dx = (d.dx + 1) & 0xff; if (d.dx === 0x06) d.dx = 0x05; }
  }
  if (d.y !== s.y) {
    if (d.y > s.y) { d.dy = (d.dy - 1) & 0xff; if (d.dy === 0xfa) d.dy = 0xfb; }
    else { d.dy = (d.dy + 1) & 0xff; if (d.dy === 0x06) d.dy = 0x05; }
  }
  if (duckCheck(s)) return; // erase draw at old position ($A113)

  // $A119: x
  let a;
  if (!(d.dx & 0x80)) {
    a = d.x + d.dx;
    if (a >= 0xee) { a = a - 2 * d.dx; d.dx = 0xfb; }
  } else {
    a = d.x + d.dx;
    if (a < 0x100) { a = a - 2 * sbyte(d.dx); d.dx = 0x05; } // no carry => went below 0
  }
  d.x = a & 0xff;
  // $A147: y
  a = (d.y + sbyte(d.dy)) & 0xff;
  if (a >= 0xa6) { a = (a - 2 * sbyte(d.dy)) & 0xff; d.dy = 0xfb; }
  else if (a < 0x14) { a = (a - 2 * sbyte(d.dy)) & 0xff; d.dy = 0x05; }
  d.y = a;
  // $A16E: on the first eight levels the duck stays in its cage
  if (s.level < 8) { d.x = DUCK_START_X; d.y = DUCK_START_Y; }
  // $A17E: face the player; two-frame animation
  d.facing = s.x >= d.x ? 'right' : 'left';
  if (duckCheck(s)) return;
  d.anim ^= 1;
}
