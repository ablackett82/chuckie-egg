// Hen-House Harry: walking, ladders, jumping, falling and lifts.
// Each function is a port of one routine; addresses refer to the disassembly.
import { TILE, FACE_RIGHT, FACE_LEFT, CLIMB, JUMP_VEL_INIT, JUMP_VEL_STEP, FALL_VEL_INIT, FALL_VEL_MIN, JUMP_CEILING_Y } from './consts.js';
import { idx, at, tileAt, isSolid } from './map.js';
import { beep } from './sfx.js';
import { duckCheck } from './duck.js';

/** $9A4C is the player sprite draw; its tail runs the duck collision test. */
export function drawPlayer(s) { duckCheck(s); }

/**
 * $9F60: when the sprite is exactly row-aligned ((y+1)&7 == 0) and LEFT/RIGHT
 * is held, face that way if the two cells beside the sprite are free and the
 * cell below them is something to stand on. This is how Harry steps off a
 * ladder.
 */
export function turnCheck(s, input) {
  if (((s.y + 1) & 7) !== 0) return;
  const i = idx(s.x, s.y);
  let j;
  if (input.left) j = i - 1;
  else if (input.right) j = i + 2;
  else return;
  if (isSolid(at(s.map, j))) return;
  if (isSolid(at(s.map, j - 32))) return;
  const below = at(s.map, j - 64);
  if (below === 0 || below >= 9) return;
  s.base = input.left ? FACE_LEFT : FACE_RIGHT;
}

/** $9D08: horizontal movement, animation, and falling off the end of a lift. */
export function walk(s, input) {
  // when facing right the probe column is taken from x-1 ($9D12..$9D15)
  const px = s.base === FACE_RIGHT ? (s.x - 1) & 0xff : s.x;
  const i = idx(px, s.y);
  let moved = false;
  if (input.left) {
    if (s.x !== 1 && !isSolid(at(s.map, i)) && !isSolid(at(s.map, i - 32))) {
      s.x = (s.x - 1) & 0xff;
      s.base = FACE_LEFT;
      moved = true;
      if ((s.x & 3) === 0) beep(s, 0x28, 0x05);
    }
  } else if (input.right) {
    if (s.x < 0xee && !isSolid(at(s.map, i + 2)) && !isSolid(at(s.map, i + 2 - 32))) {
      s.x = (s.x + 1) & 0xff;
      s.base = FACE_RIGHT;
      moved = true;
      if ((s.x & 3) === 0) beep(s, 0x28, 0x06);
    }
  }
  if (!moved) s.anim = 3; // $9DAB: next frame is the standing one
  s.anim = (s.anim + 1) & 3;
  drawPlayer(s);
  if (s.dead) return;

  // $9DC1: walked off the end of the lift platform?
  if (!s.onLift || !s.lift.enabled) return;
  const b = (s.lift.x - 9) & 0xff;
  if (s.x >= b && ((s.x - 0x13) & 0xff) < b) return;
  s.jumpState = 1;
  s.jumpDx = s.base === FACE_RIGHT ? 1 : 0xff;
  s.vel = 4;
}

/** $B34C: start falling when nothing is under the middle of the sprite. */
export function edgeCheck(s) {
  if ((s.x & 7) === 0) return;
  const t = at(s.map, idx(s.x, s.y) - 0x3f);
  if (t >= TILE.FLOOR || t === TILE.LADDER_L || t === TILE.LADDER_R) return;
  s.jumpState = 1;
  s.jumpDx = s.base === FACE_RIGHT ? 1 : 0xff;
  s.vel = 4;
}

/** $9E98: climb when column-aligned and a ladder (left half) is above/below. */
export function ladder(s, input) {
  if ((s.x & 7) !== 0) return;
  const i = idx(s.x, (s.y + 1) & 0xff);
  let climbed = false;
  if (at(s.map, i) === TILE.LADDER_L && input.up) {
    s.base = CLIMB;
    s.y = (s.y + 1) & 0xff;
    if ((s.y & 3) === 0) beep(s, 0x1e, 0x14);
    climbed = true;
  } else {
    // two rows down, three if the sprite top is exactly on a row boundary
    let j = i - 0x40;
    if (((s.y + 1) & 7) === 0) j -= 0x20;
    if (at(s.map, j) === TILE.LADDER_L && input.down) {
      s.base = CLIMB;
      s.y = (s.y - 1) & 0xff;
      if ((s.y & 3) === 0) beep(s, 0x1e, 0x15);
      climbed = true;
    }
  }
  if (climbed) {
    s.anim = (s.anim + 1) & 3;
    s.jumpState = 0; // grabbing a ladder mid-air cancels the jump
  }
  drawPlayer(s);
}

/** $9975: start a jump; direction from the held keys. */
export function jumpInit(s, input) {
  s.jumpState = 2;
  s.vel = JUMP_VEL_INIT;
  s.delay = 0;
  s.vdir = 1;
  s.onLift = 0;
  if (input.right) { s.jumpDx = 1; s.base = FACE_RIGHT; }
  else if (input.left) { s.jumpDx = 0xff; s.base = FACE_LEFT; }
  else { s.jumpDx = 0; }
}

/** $A21C: airborne update, run on every inner-loop iteration. */
export function airStep(s) {
  if (s.frameDiv === 1) {
    // $A22A: one horizontal pixel per logic tick, bouncing off the screen edges
    s.x = (s.x + s.jumpDx) & 0xff;
    if (s.x === 0) s.jumpDx = 1;
    else if (s.x >= 0xee) s.jumpDx = 0xff;
    if (liftLanding(s, 1) || liftLanding(s, 2)) return;
    // $A294
    if (s.jumpState === 1) {
      s.vel = (s.vel - 1) & 0xff;
      if (s.vel !== 0) { drawAndLand(s); return; }
      s.jumpState = 2;
      s.jumpDx = 0;
      s.vel = FALL_VEL_INIT;
      s.vdir = 0xff;
      drawPlayer(s);
      return;
    }
    verticalCountdown(s);
  } else if (s.jumpState !== 1) {
    verticalCountdown(s);
  }
}

/** $A2B5: the vertical step, when the delay counter expires. */
function verticalCountdown(s) {
  s.delay = (s.delay - 1) & 0xff;
  if (s.delay !== 0) return;
  let a;
  if (s.vdir === 1) {
    if (s.y >= JUMP_CEILING_Y) { s.y = (s.y + 1) & 0xff; s.vdir = 0xff; a = FALL_VEL_INIT; }
    else {
      a = (s.vel + JUMP_VEL_STEP) & 0xff;
      if (a === 4) { s.vdir = 0; a = 0; }
    }
  } else if (s.vdir === 0) {
    s.vdir = 0xff; a = FALL_VEL_INIT;
  } else {
    a = (s.vel - JUMP_VEL_STEP) & 0xff;
    if (a < FALL_VEL_MIN) a = FALL_VEL_MIN;
  }
  s.vel = a;
  s.delay = a;
  const ny = (s.y + (s.vdir === 0xff ? -1 : s.vdir)) & 0xff;
  if (ny < 0x10) { s.dead = 'fell'; return; } // $A305: below the screen
  s.y = ny;
  drawAndLand(s);
}

/** $A30F: draw the jump frame, bounce off walls, and land if standing on something. */
function drawAndLand(s) {
  s.jumpFrame = true;
  drawPlayer(s);
  if (s.dead) return;
  const i = idx(s.x, s.y) - 0x3f; // feet row, middle column
  if (s.vdir !== 1 && s.jumpDx !== 0) {
    if (s.jumpDx === 1) {
      if ((s.x & 7) >= 3 && at(s.map, i + 1) === TILE.FLOOR) s.jumpDx = 0xff;
    } else if ((s.x & 7) < 4 && at(s.map, i - 1) === TILE.FLOOR) s.jumpDx = 1;
  }
  const t = at(s.map, i);
  if (t === 0) return;
  if (t !== TILE.FLOOR) {
    if (t >= 3) return;
    if (at(s.map, i + (t === TILE.LADDER_L ? -1 : 1)) !== TILE.FLOOR) return;
  }
  if (((s.y + 1) & 7) !== 0) return;
  s.jumpState = 0;
  if (s.base === CLIMB) s.base = FACE_RIGHT;
}

/** $A256: land on lift `n` (1 or 2) if the sprite bottom is on its top edge. */
function liftLanding(s, n) {
  const L = s.lift;
  if (!L.enabled) return false;
  const b = (L.x - 9) & 0xff;
  if (s.x < b || ((s.x - 0x13) & 0xff) >= b) return false;
  const c = n === 1 ? L.c1 : L.c2;
  let hit = false;
  for (let k = 1; k <= 6; k++) if (((c + 0x10 - k) & 0xff) === s.y) { hit = true; break; }
  if (!hit) return false;
  s.onLift = 1;
  s.jumpState = 0;
  drawPlayer(s); // blank sprite draw at the old position (still runs the duck test)
  s.y = (c + 0x11) & 0xff;
  s.events.push({ type: 'liftLand' });
  return true;
}
