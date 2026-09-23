// The game "machine": state creation, the inner loop ($9858), the logic tick
// ($98E6) and the level lifecycle ($A653..$A7B9). Pure: no DOM, no canvas.
// Time is measured in Z80 T-states (s.t) using the measured cost model, so the
// simulation paces itself like the original hardware.
import {
  COST, FRAME_DIV, BONUS_TICKS, TIME_TICKS, DUCK_TICKS, LIFT_TICKS, LIFT_TOP_Y,
  PLAYER_START_X, PLAYER_START_Y, DUCK_START_X, DUCK_START_Y, START_LIVES, EGGS_PER_LEVEL, FACE_RIGHT, CLIMB,
} from './consts.js';
import { mapFromGrid } from './map.js';
import { beep } from './sfx.js';
import { addScore, decCounter, pickup, halveScore } from './scoring.js';
import { moveDuck } from './duck.js';
import { moveLifts } from './lifts.js';
import { moveHens, henCollision } from './hens.js';
import { turnCheck, walk, edgeCheck, ladder, jumpInit, airStep, drawPlayer } from './player.js';

export const NO_INPUT = Object.freeze({ left: false, right: false, up: false, down: false, jump: false });

/** Create a fresh game ($A59D..$A62C) for one player. */
export function newGame(levels, rom, { startLevel: firstLevel = 0, noHens = false, noDuck = false, easy = false } = {}) {
  const s = {
    levels, rom,
    cheats: { noHens, noDuck, easy }, // noHens/noDuck: test hooks mirroring the documented POKEs; easy: see tick/onDeath/player.js
    level: firstLevel & 0xff,  // $6EEB (level - 1)
    lives: START_LIVES,       // $6EF0
    score: [0, 0, 0, 0, 0, 0],// $6EC8..
    scoreTenK: 0,             // $736E
    eggsLeft: EGGS_PER_LEVEL, // $6EE6
    map: null,                // $61A8
    hens: [], henSlot: 0, henCtr: 1, rngPtr: 0,
    lift: { enabled: false, x: 0, c1: 0, c2: 0, line1: 0, line2: 0, startLine: 0, div: 5 },
    duck: { x: DUCK_START_X, y: DUCK_START_Y, dx: 0, dy: 0, ctr: 1, anim: 0, facing: 'right' },
    t: 0, events: [], sfx: [],
    phase: 'level', // 'level' | 'dead' | 'complete' | 'gameover'
    dead: null,
  };
  loadLevelMap(s);
  startLevel(s);
  return s;
}

/** $A6E1: copy the level layout for (level & 7) into the buffer. */
export function loadLevelMap(s) {
  s.map = mapFromGrid(s.levels[s.level & 7].grid);
  s.eggsLeft = EGGS_PER_LEVEL;
}

/** $AE9C + $B056: (re)start the current level with the current buffer. */
export function startLevel(s) {
  const L = s.levels[s.level & 7];
  // $AEE1..$AF0D: bonus thousands = min(level, 9); time hundreds = 9 - min(level>>4, 5)
  s.bonus = [Math.min(s.level + 1, 9), 0, 0];
  s.time = [9 - Math.min(s.level >> 4, 5), 0, 0];
  // $AF77..$AFAB: hens
  s.hens = Array.from({ length: 5 }, () => ({ x: 0xff, y: 0xff, state: 0xff }));
  if (s.level < 8 || s.level >= 16) {
    const n = s.level >= 0x18 ? 5 : L.counts.hens;
    for (let i = 0; i < n; i++) {
      const [x, y, state] = L.hens[i].raw;
      s.hens[i] = { x, y, state };
    }
  }
  s.henCtr = 1; s.rngPtr = 0; s.henSlot = 0; // $AFAD, $B090
  // $B056
  s.x = PLAYER_START_X; s.y = PLAYER_START_Y;
  s.anim = 0; s.base = FACE_RIGHT; s.frameDiv = 1;
  s.jumpState = 0; s.jumpDx = 0; s.vel = 0; s.delay = s.delay | 0; s.vdir = 0; // $7328 is not reset
  s.onLift = 0;
  s.duck.x = DUCK_START_X; s.duck.y = DUCK_START_Y; s.duck.dx = 0; s.duck.dy = 0; s.duck.ctr = 1; s.duck.anim = 0;
  s.bonusCtr = 1; s.timeCtr = 1; s.bonusRunning = 1;
  s.sfxTimer = 0;
  // $B0D0..$B0FC: lifts
  const lf = L.lifts;
  s.lift.enabled = lf.enabled;
  s.lift.div = 5;
  if (lf.enabled) {
    s.lift.x = lf.byte2;
    s.lift.startLine = 191 - lf.screenY;
    s.lift.line1 = s.lift.startLine;
    s.lift.line2 = s.lift.startLine + 64;
    s.lift.c1 = lf.byte3;
  }
  s.lift.c2 = 0x43; // $B0EF: second lift starts 64 lines above the first
  s.dead = null;
  s.phase = 'level';
  s.events.push({ type: 'levelStart', level: s.level });
}

/** $98E6: one logic tick. Returns null, 'death' or 'complete'. */
export function tick(s, input) {
  s.t += COST.TICK_BODY;
  // bonus countdown
  if (s.bonusRunning) {
    if (--s.bonusCtr === 0) {
      s.bonusCtr = BONUS_TICKS;
      if (decCounter(s.bonus)) s.bonusRunning = 0;
    }
  }
  // mother duck
  if (--s.duck.ctr === 0) {
    s.duck.ctr = DUCK_TICKS;
    moveDuck(s);
    if (s.dead) return 'death';
  }
  // lifts
  if (--s.lift.div === 0) {
    s.lift.div = LIFT_TICKS;
    moveLifts(s);
    if (s.onLift) {
      s.y = (s.y + 1) & 0xff;
      if (s.y >= LIFT_TOP_Y) { s.dead = 'liftTop'; return 'death'; }
    }
  }
  // eggs and seed
  if (pickup(s) === 'complete') return 'complete';
  // time countdown
  if (--s.timeCtr === 0) {
    s.timeCtr = TIME_TICKS;
    if (decCounter(s.time)) { s.dead = 'time'; return 'death'; }
    beep(s, 0x04, 0x02);
  }
  // hens
  if (--s.henCtr === 0) {
    s.henCtr = s.level >= 0x20 ? 2 : 3;
    if (moveHens(s)) return 'death';
  }
  // player
  if (s.jumpState === 0 && input.jump) {
    jumpInit(s, input);
  } else {
    if (s.jumpState === 0) {
      if (s.cheats.easy) input = ladderSnap(s, input);
      turnCheck(s, input);
      if (s.base !== CLIMB) { walk(s, input); if (s.dead) return 'death'; }
      if (!s.onLift) edgeCheck(s);
    }
    ladder(s, input);
    if (s.dead) return 'death';
  }
  return null;
}

/**
 * Easy mode: on a ladder, holding only left/right climbs to the nearest row
 * where turnCheck lets Harry step off, instead of needing to stop exactly there.
 */
function ladderSnap(s, input) {
  if (s.base !== CLIMB || input.up || input.down || !(input.left || input.right)) return input;
  const r = (s.y + 1) & 7;
  if (r === 0) return input;
  return r < 4 ? { ...input, down: true } : { ...input, up: true };
}

/**
 * One iteration of the inner loop ($9858). Runs the tick when the frame
 * divider expires. Returns null, 'death' or 'complete'.
 */
export function fastStep(s, input) {
  const air = s.jumpState !== 0;
  s.t += air ? COST.FAST_AIR : COST.FAST_GROUND;
  // $9860: egg/seed collection arpeggio
  if ((s.frameDiv & 0x0f) === 0 && s.sfxTimer !== 0) {
    s.sfxTimer--;
    if ((s.sfxTimer & 3) === 0) beep(s, (s.sfxTimer & 0x1f) + 6, 2);
  }
  if (air) {
    if (s.frameDiv === 1) beep(s, s.y ^ 0xff, 1); // the jump whistle
    const wasDelayOne = s.delay === 1;
    airStep(s, input);
    if (s.dead) return 'death';
    if (wasDelayOne) {
      for (const h of s.hens) {
        if (h.x === 0xff) break;
        if (henCollision(s, h, true)) return 'death';
      }
    }
  }
  if (--s.frameDiv !== 0) return null;
  s.frameDiv = FRAME_DIV;
  return tick(s, input);
}

/**
 * Advance the machine by up to `budget` T-states. `getInput()` is sampled at
 * the start of every logic tick. Handles the level lifecycle: on death or
 * completion the machine enters a timed pause phase, then continues.
 */
export function advance(s, budget, getInput) {
  const end = s.t + budget;
  while (s.t < end) {
    if (s.phase === 'level') {
      if (s.frameDiv === 1) s.input = getInput(); // keys are read inside the tick
      const r = fastStep(s, s.input || NO_INPUT);
      if (r === 'death') onDeath(s);
      else if (r === 'complete') onComplete(s);
    } else if (s.phase === 'pause') {
      // fixed-length interlude (death tune, level transition wipe)
      s.t = Math.min(end, s.pauseUntil);
      if (s.t >= s.pauseUntil) s.pauseNext(s);
    } else {
      s.t = end; // gameover: nothing to simulate
    }
  }
}

const SECOND = 3_500_000;

function pause(s, seconds, next) {
  s.phase = 'pause';
  s.pauseUntil = s.t + Math.round(seconds * SECOND);
  s.pauseNext = next;
}

/** $A66E / $A6FE: lose a life, keep the (partly collected) level buffer. */
function onDeath(s) {
  s.events.push({ type: 'death', reason: s.dead });
  s.phase = 'dying';
  pause(s, 2.5, (s) => {
    s.lives = (s.lives - 1) & 0xff;
    if (s.lives === 0 && s.cheats.easy) {
      // easy mode: never game over; a fresh set of lives costs half the score
      s.lives = START_LIVES;
      halveScore(s);
      s.events.push({ type: 'scoreHalved' });
    }
    if (s.lives === 0) { s.phase = 'gameover'; s.events.push({ type: 'gameover' }); return; }
    startLevel(s);
    pause(s, 2.2, (s) => { s.phase = 'level'; }); // $B102 delay before play
  });
}

/** $A675..$A6FB: cash in the bonus, advance to the next level. */
function onComplete(s) {
  // $A675: every remaining bonus unit becomes 10 points
  // (when the counter rolls past zero the flag clears but 10 points are still added)
  let units = 0;
  while (s.bonusRunning) {
    if (decCounter(s.bonus)) s.bonusRunning = 0;
    addScore(s, 1);
    beep(s, 0x1e, 0x04);
    units++;
  }
  s.events.push({ type: 'complete', bonusUnits: units });
  pause(s, 1.5, (s) => {
    s.level = (s.level + 1) & 0xff;
    loadLevelMap(s);
    startLevel(s);
    pause(s, 2.2, (s) => { s.phase = 'level'; });
  });
}

/** Level start also has the original's ~2.2 s hold before control is given. */
export function beginPlay(s) {
  pause(s, 2.2, (s) => { s.phase = 'level'; });
}
