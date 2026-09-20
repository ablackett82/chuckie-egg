// Constants traced to the Chuckie Egg disassembly (reference/mrcook/chuckie-egg.skool).

export const TILE = { BLANK: 0, LADDER_L: 1, LADDER_R: 2, EGG: 3, SEED: 4, FLOOR: 5, CAGE_FIRST: 0xA8, CAGE_LAST: 0xB5 };
export const MAP_COLS = 32, MAP_ROWS = 21;

export const PLAYER_START_X = 0x64, PLAYER_START_Y = 0x17; // $B05A/$B05E
export const DUCK_START_X = 0x08, DUCK_START_Y = 0x98;     // $B062/$B066
export const START_LIVES = 5;                              // $A61E
export const EGGS_PER_LEVEL = 12;                          // $A6F6

export const FRAME_DIV = 0x82;   // $98BE: inner-loop iterations per logic tick (130)
export const BONUS_TICKS = 0x32; // $98F2: bonus decrements every 50 ticks
export const TIME_TICKS = 0x0A;  // $9928: time decrements every 10 ticks
export const DUCK_TICKS = 0x0C;  // $98FF
export const LIFT_TICKS = 0x02;  // $990A
export const SEED_PAUSE = 0xFF;  // $9A21: eating seed resets both counters to 255

// Jump physics ($9975, $A2B5..)
export const JUMP_VEL_INIT = 0x8C;
export const JUMP_VEL_STEP = 0x0A;
export const FALL_VEL_INIT = 0xFA;
export const FALL_VEL_MIN = 0x28;
export const JUMP_CEILING_Y = 0xA7; // $A2E4
export const LIFT_TOP_Y = 0xA5;     // $991C: riding a lift to here kills
export const LIFT_WRAP = 0xA6;      // $A02A
export const LIFT_RESET_Y = 0x03;   // $A039

// Player sprite bases ($72DB)
export const FACE_RIGHT = 0, FACE_LEFT = 4, CLIMB = 13;
export const SPRITE_BLANK = 12;

// T-state cost model, measured by running the original in a Z80 core
// (tools/emu/calibrate.mjs). Used to pace the simulation like the real game.
export const COST = {
  FAST_GROUND: 149,   // one $9858 loop iteration, not airborne
  FAST_AIR: 330,      // .. airborne ($A21C/$A2B5 run every iteration)
  TICK_BODY: 27400,   // $98E6 body with player draw, no hen/duck work
  HEN_MOVE: 9300,     // one hen slot erased + redrawn ($929C/$935F)
  DUCK_MOVE: 39000,   // $A0C8: erase + draw + attributes (every 12 ticks)
  LIFT_MOVE: 3000,    // $A014 with lifts enabled (estimate)
  BEEP_OVERHEAD: 40,  // per $9CA4 cycle, plus 26*h per cycle for the two djnz loops
};
export const CPU_HZ = 3_500_000;
