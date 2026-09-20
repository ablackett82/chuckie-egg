#!/usr/bin/env node
// Extracts level layouts and graphics from the Chuckie Egg (ZX Spectrum, 1983)
// disassemblies in reference/ into data/levels.json and data/graphics.json.
//
// Every value written comes from a byte in the disassembly. The primary source
// is mrcook's SkoolKit disassembly; every byte read is cross-checked against
// Ritchie333's .skool and the raw chuckie.sna snapshot in that repo. Any
// disagreement aborts the run.
//
// Memory map (all addresses from reference/mrcook/chuckie-egg.ctl / .skool):
//   $61A8  level buffer: 672 bytes = 21 rows x 32 cols, ROW 0 = BOTTOM of screen
//   $84F0  UDG bank: 8 bytes per tile, tile id * 8 + $84F0   ($9C40 / $9ABB)
//   $8DF0  sprite bank: 32 bytes per 16x16 sprite, id * 32 + $8DF0 ($9A53)
//   $945B  hen table: 21 bytes per level, entry (level&7)+1 used   ($AF8E)
//          byte 0 = number of bytes to copy, then up to 5 x 4-byte hens
//   $9787  lift table: 4 bytes per level, entry (level&7)+1 used   ($B0D3)
//   $984F  tile attribute (colour) table, 9 entries               ($B027)
//   $B056  fixed player start ($72D8/$72D9) and mother duck ($7348/$7349)
//   $B3B0  level 1 .. $C610 level 8 (672 bytes each)               ($A6E7)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'reference');
const OUT = path.join(ROOT, 'data');

// ---------------------------------------------------------------------------
// Source parsing
// ---------------------------------------------------------------------------

/** Parse a SkoolKit .skool file into a Map<address, byte> of its data lines. */
function parseSkool(file) {
  const mem = new Map();
  const src = fs.readFileSync(file, 'latin1');
  const lineRe = /^[ a-z*@]?\$([0-9a-fA-F]{4}) (defb|defw|defs|defm)\s+(.*)$/i;
  for (const raw of src.split(/\r?\n/)) {
    const m = lineRe.exec(raw);
    if (!m) continue;
    let addr = parseInt(m[1], 16);
    const op = m[2].toLowerCase();
    // strip trailing "; comment" (but not inside quotes)
    const args = splitArgs(stripComment(m[3]));
    if (op === 'defs') {
      const n = num(args[0]);
      const v = args.length > 1 ? num(args[1]) : 0;
      for (let i = 0; i < n; i++) mem.set(addr++, v);
      continue;
    }
    for (const a of args) {
      if (a.startsWith('"')) {
        for (const ch of a.slice(1, -1)) mem.set(addr++, ch.charCodeAt(0));
      } else if (op === 'defw') {
        const v = num(a);
        mem.set(addr++, v & 0xff);
        mem.set(addr++, (v >> 8) & 0xff);
      } else {
        mem.set(addr++, num(a));
      }
    }
  }
  return mem;
}

function stripComment(s) {
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inQ = !inQ;
    else if (s[i] === ';' && !inQ) return s.slice(0, i);
  }
  return s;
}

function splitArgs(s) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of s) {
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function num(s) {
  s = s.trim();
  if (s.startsWith('$')) return parseInt(s.slice(1), 16);
  if (/^%[01]+$/.test(s)) return parseInt(s.slice(1), 2);
  return parseInt(s, 10);
}

/** 48K .sna: 27-byte header then 49152 bytes of RAM from $4000. */
function parseSna(file) {
  const buf = fs.readFileSync(file);
  if (buf.length !== 49179) throw new Error(`${file}: unexpected .sna size ${buf.length}`);
  return (addr) => buf[27 + addr - 0x4000];
}

const mrcook = parseSkool(path.join(REF, 'mrcook', 'chuckie-egg.skool'));
const ritchie = parseSkool(path.join(REF, 'ritchie', 'src', 'chuckie.skool'));
const sna = parseSna(path.join(REF, 'ritchie', 'src', 'chuckie.sna'));

const hex = (n, w = 4) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');

let bytesRead = 0;
/** Read one byte, cross-checking all three sources. */
function byte(addr) {
  const a = mrcook.get(addr);
  if (a === undefined) throw new Error(`mrcook has no data byte at ${hex(addr)}`);
  const b = ritchie.get(addr);
  if (b !== undefined && b !== a) throw new Error(`mismatch at ${hex(addr)}: mrcook ${a} ritchie ${b}`);
  const c = sna(addr);
  if (c !== a) throw new Error(`mismatch at ${hex(addr)}: mrcook ${a} sna ${c}`);
  bytesRead++;
  return a;
}
const bytes = (addr, n) => Array.from({ length: n }, (_, i) => byte(addr + i));

// ---------------------------------------------------------------------------
// Constants (each traced to the disassembly)
// ---------------------------------------------------------------------------

const MAP_COLS = 32, MAP_ROWS = 21, LEVEL_BYTES = MAP_COLS * MAP_ROWS; // $A6E4: ld bc,$02A0
const LEVEL_BASE = 0xB3B0;        // $A6E7 ld hl,$B110 + 672*(level+1) => $B3B0 for level 1
const HEN_TABLE = 0x945B, HEN_REC = 0x15, HEN_MAX = 5; // $AF8E, $AF91, $AF77 (5*4 bytes cleared)
const LIFT_TABLE = 0x9787, LIFT_REC = 4;               // $B0D0..$B0E2
const ATTR_TABLE = 0x984F;                             // $B03C: add a,$4F ; ld b,$98
const UDG_BASE = 0x84F0;                               // $9C7D
const SPRITE_BASE = 0x8DF0;                            // $9A53
const SCREEN_H = 192;

// $B056: ld ix,$72D8 ; ld (ix+0),$64 ; ld (ix+1),$17 -> player x=100, y=23
// $B062/$B066: ld (ix+$70),$08 ; ld (ix+$71),$98 -> mother duck ($7348) x=8, y=152
const PLAYER_START = { x: 0x64, y: 0x17, address: '0xB05A..0xB05E' };
const DUCK_START = { x: 0x08, y: 0x98, address: '0xB062..0xB066' };

// $61A8 level buffer tile ids (mrcook ctl, and $984F attribute table size)
const TILE = { BLANK: 0, LADDER_L: 1, LADDER_R: 2, EGG: 3, SEED: 4, FLOOR: 5, CAGE_FIRST: 0xA8, CAGE_LAST: 0xB5 };

// Sprite ids: address = $8DF0 + id*32 ($9A53..$9A68). Names from mrcook ctl.
const SPRITES = [
  ['farmer_right', 0x8DF0, 4], ['farmer_left', 0x8E70, 4],
  ['duck_right', 0x8EF0, 2], ['duck_left', 0x8F30, 2],
  ['unknown_8F70', 0x8F70, 1],          // "copied to 72A0" per ctl; sprite id 12
  ['farmer_climb', 0x8F90, 4],
  ['hen_left', 0x9010, 1], ['hen_right', 0x9030, 1], ['hen_climb', 0x9050, 2],
  ['hen_left_walk', 0x9090, 1], ['hen_right_walk', 0x90B0, 1],
  ['hen_eat_left', 0x90D0, 1], ['hen_eat_right', 0x90F0, 1],
];

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
// Original sprite coords ($72D8 etc.): x = left pixel column, y = pixel row of the
// sprite's TOP, measured upward from the bottom of the screen (y=0 is screen
// line 191). See $9404/$9BDE (y -> display address) and $9A9A.. (3x3 tile
// window starts at row y>>3 and walks DOWN in memory, i.e. down the screen).
// Top-down: screenY = 191 - y.
const toTopDown = (x, y) => ({ x, y: SCREEN_H - 1 - y });
// Hen records ($7357, 4 bytes: x, y, state, ?) use y = the FEET line instead:
// $9190 dec d -> tile at y-1 is the floor under the hen, $91E1 add a,$10 -> tile
// at y+16 is above its head, and the collision test at $92B3.. treats the hen
// as occupying y..y+15 upward. Top-down sprite top = 191 - (y + 15).
const toTopDownFeet = (x, y) => ({ x, y: SCREEN_H - 1 - (y + 15) });

// Map row r (0 = bottom) is drawn at character row 23 - r ($AEAA loop with
// $9C40: H counts rows up from the bottom). Playfield therefore occupies
// screen rows 3..23, pixel y 24..191. Top-down grid index = 20 - r.
const PLAYFIELD_TOP_PX = (24 - MAP_ROWS) * 8; // 24

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

function extractLevel(n) {
  const addr = LEVEL_BASE + LEVEL_BYTES * (n - 1);
  const raw = bytes(addr, LEVEL_BYTES);

  // rows bottom-up as stored -> reverse for top-down grid
  const rowsBottomUp = [];
  for (let r = 0; r < MAP_ROWS; r++) rowsBottomUp.push(raw.slice(r * MAP_COLS, (r + 1) * MAP_COLS));
  const grid = rowsBottomUp.slice().reverse();

  const eggs = [], seeds = [], ladders = [], platforms = [], cage = [];
  let unknown = [];
  grid.forEach((row, gy) => row.forEach((id, gx) => {
    const cell = { col: gx, row: gy };
    if (id === TILE.EGG) eggs.push(cell);
    else if (id === TILE.SEED) seeds.push(cell);
    else if (id === TILE.LADDER_L || id === TILE.LADDER_R) ladders.push({ ...cell, half: id === TILE.LADDER_L ? 'left' : 'right' });
    else if (id === TILE.FLOOR) platforms.push(cell);
    else if (id >= TILE.CAGE_FIRST && id <= TILE.CAGE_LAST) cage.push({ ...cell, tile: id });
    else if (id !== TILE.BLANK) unknown.push({ ...cell, tile: id });
  }));
  if (unknown.length) throw new Error(`level ${n}: unexpected tile ids ${JSON.stringify(unknown)}`);
  if (eggs.length !== 12) throw new Error(`level ${n}: expected 12 eggs, found ${eggs.length}`);

  // Hens: $AF8E ld hl,$945B ; bc=$15 ; add (level&7)+1 times ; b=(hl) count ; copy to $7357
  const henAddr = HEN_TABLE + HEN_REC * ((n - 1 & 7) + 1);
  const henCount = byte(henAddr);
  if (henCount % 4 !== 0 || henCount > HEN_MAX * 4) throw new Error(`level ${n}: odd hen byte count ${henCount}`);
  const henRaw = bytes(henAddr + 1, HEN_MAX * 4);
  const hens = [];
  for (let i = 0; i < HEN_MAX; i++) {
    const rec = henRaw.slice(i * 4, i * 4 + 4);
    const active = i < henCount / 4;
    hens.push({
      address: hex(henAddr + 1 + i * 4),
      raw: rec,
      // used on passes 1, 3, 4 ($AF81: level<8 or level>=16); pass >= 4 ($AF9E: level>=$18) always loads all 5
      activeOnFirstPass: active,
      ...toTopDownFeet(rec[0], rec[1]),
      // state byte ($911E..): 1 = walking left, 2 = walking right, 3/4 = on ladder
      // (set at $91A1 '3 - state' and $91DB/$91EF), >= 7 = eating (state - 6 restored at $9161)
      state: rec[2],
      byte3: rec[3], // TODO(phase 2): decode (always 0 in the tables)
    });
  }

  // Lifts: $B0D3 ld hl,$9787 ; bc=4 ; add (level&7)+1 times ; copy 4 bytes to $734E
  //   $734E/$734F screen (display file) address of lift 1, $7350 = $FF disables lifts,
  //   $7351 = "Y co-ordinate" (Ritchie). $B0F3: lift 2 address = lift 1 address - $0800
  //   (one character row = 8 pixel lines further up the screen).
  const liftAddr = LIFT_TABLE + LIFT_REC * ((n - 1 & 7) + 1);
  const l = bytes(liftAddr, LIFT_REC);
  const screenAddr = l[0] | (l[1] << 8);
  const enabled = l[2] !== 0xFF;
  const lifts = {
    address: hex(liftAddr), raw: l, enabled,
    ...(enabled ? {
      // display file address -> column and pixel row (Spectrum layout 010TTLLLRRRCCCCC)
      col: screenAddr & 0x1F,
      screenY: ((screenAddr >> 11) & 3) * 64 + ((screenAddr >> 5) & 7) * 8 + ((screenAddr >> 8) & 7),
      byte2: l[2], // TODO(phase 2): decode (not $FF when enabled; values $40,$90,$C8,$78,$F0)
      byte3: l[3], // $7351: lift step counter; lift moves up 1px per step and resets at $A6 ($A026..$A03B)
      secondLiftOffset: -64, // $B0F3..$B0FC: sbc hl,$0800 = one screen third = 64 pixel lines higher
      width: 16, height: 4, // $A08A..$A093: 2 bytes wide, 4 lines, solid ($FF)
    } : {}),
  };

  return {
    level: n,
    address: hex(addr),
    grid,
    counts: { eggs: eggs.length, seeds: seeds.length, hens: henCount / 4 },
    eggs, seeds, ladders, platforms, cage,
    hens,
    lifts,
    spawn: { ...toTopDown(PLAYER_START.x, PLAYER_START.y), raw: [PLAYER_START.x, PLAYER_START.y], address: PLAYER_START.address },
    duck: { ...toTopDown(DUCK_START.x, DUCK_START.y), raw: [DUCK_START.x, DUCK_START.y], address: DUCK_START.address },
  };
}

// ---------------------------------------------------------------------------
// Graphics
// ---------------------------------------------------------------------------

function extractGraphics() {
  // Whole UDG bank $84F0..$8B4F = 204 tiles (ids 0..$CB); the map/HUD index
  // into it by id*8. Named entries from mrcook's ctl.
  const UDG_COUNT = (0x8B50 - UDG_BASE) / 8;
  const tiles = [];
  for (let id = 0; id < UDG_COUNT; id++) {
    const a = UDG_BASE + id * 8;
    tiles.push({ id, address: hex(a), rows: bytes(a, 8) });
  }
  const namedTiles = {
    blank: 0, ladder_left: 1, ladder_right: 2, egg: 3, seed: 4, floor: 5,
    label_score: [0x0B, 0x0C, 0x0D],          // $8548
    label_player: [0x0E, 0x0F, 0x10, 0x11],   // $8560
    label_time: [0x12, 0x13, 0x14],           // $8580
    label_bonus: [0x1B, 0x1C, 0x1D],          // $85C8
    label_level: [0x9B, 0x9C, 0x9D],          // $89C8
    digits_bold: Array.from({ length: 10 }, (_, i) => 0x9E + i), // $89E0
    cage: Array.from({ length: 14 }, (_, i) => 0xA8 + i),        // $8A30..$8A9F
    lives_icon: 0xB6,                         // $8AA0
    font_base: (0x85F0 - UDG_BASE) / 8,       // $85F0, ASCII ' '.. (id = 0x20 + ch - 0x20)
  };

  const sprites = [];
  for (const [name, addr, frames] of SPRITES) {
    for (let f = 0; f < frames; f++) {
      const a = addr + f * 32;
      const id = (a - SPRITE_BASE) / 32;
      // 16 rows x 2 bytes, row-major, MSB = leftmost pixel ($9A6F: LDI,LDI per row)
      const raw = bytes(a, 32);
      const rows = [];
      for (let r = 0; r < 16; r++) rows.push((raw[r * 2] << 8) | raw[r * 2 + 1]);
      sprites.push({ id, name: frames > 1 ? `${name}_${f}` : name, address: hex(a), rows });
    }
  }

  // $984F attribute table: attr for tile id<9 else $06 ($B033..$B042). All
  // entries are paper black, no bright: value = INK colour.
  const attrs = bytes(ATTR_TABLE, 9);
  const tileAttr = { address: hex(ATTR_TABLE), table: attrs, fallback: 0x06 };

  // Spectrum non-bright palette (standard hardware values)
  const palette = ['#000000', '#0000D7', '#D70000', '#D700D7', '#00D700', '#00D7D7', '#D7D700', '#D7D7D7'];

  // HUD attributes, from $AE9C ($AFDB..$B025): {row, col, count, attr}
  const hud = {
    attrs: [
      { row: 0, col: 0, count: 3, attr: 0x17 },   // $AFDB..$AFE2 "SCORE"
      { row: 1, col: 0, count: 32, attr: 0x06 },  // $AFE5..$AFEA lives row
      { row: 2, col: 0, count: 5, attr: 0x17 },   // $AFED..$AFF2 "PLAYER"
      { row: 2, col: 7, count: 6, attr: 0x17 },   // $AFF5..$AFF8 "LEVEL"
      { row: 2, col: 15, count: 8, attr: 0x17 },  // $AFFB..$AFFF "BONUS"
      { row: 2, col: 25, count: 7, attr: 0x17 },  // $B002..$B005 "TIME"
      { row: 0, col: 5, count: 6, attr: 0x17 },   // $B008..$B019 score box, current player ($17) vs others ($0F)
    ],
    // $AF18: 3 UDG ids from $9764 at row 0 col 0; $AF28: 32 ids from $9767 at row 2
    // (values at $9767.. are patched at $AECD.. with the level/bonus/time digits)
    scoreLabel: { row: 0, col: 0, ids: bytes(0x9764, 3) },
    statusRow: { row: 2, col: 0, ids: bytes(0x9767, 32), address: '0x9767' },
    livesRow: { row: 1, col: 5, id: 0xB6 }, // $AFB3..$AFD9
  };

  return { udgBase: hex(UDG_BASE), spriteBase: hex(SPRITE_BASE), tiles, namedTiles, sprites, tileAttr, palette, hud };
}

// ---------------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });

const levels = {
  _comment: 'Generated by tools/extract.js from reference/mrcook (cross-checked against reference/ritchie .skool and .sna). Do not edit by hand.',
  conventions: {
    grid: 'grid[row][col], row 0 = TOP of playfield (screen char row 3). Original stores rows bottom-up at $61A8; reversed here.',
    playfieldTopPx: PLAYFIELD_TOP_PX,
    cols: MAP_COLS, rows: MAP_ROWS, tilePx: 8,
    entityCoords: 'x = left pixel, y = TOP pixel of the 16x16 sprite in top-down screen coords. raw[] holds the original bytes: for spawn/duck raw y = sprite top measured up from the bottom (screenY = 191 - y); for hens raw y = feet line measured up from the bottom (screenY = 176 - y).',
    tileIds: TILE,
  },
  levels: Array.from({ length: 8 }, (_, i) => extractLevel(i + 1)),
};
fs.writeFileSync(path.join(OUT, 'levels.json'), JSON.stringify(levels, null, 1));

const graphics = {
  _comment: 'Generated by tools/extract.js. Tiles: 8 rows of 8 bits, MSB = left. Sprites: 16 rows of 16 bits, MSB = left.',
  ...extractGraphics(),
};
fs.writeFileSync(path.join(OUT, 'graphics.json'), JSON.stringify(graphics));

console.log(`extract: ${bytesRead} bytes read and cross-checked across 3 sources`);
for (const l of levels.levels) {
  console.log(`level ${l.level} @${l.address}: eggs ${l.counts.eggs} seeds ${l.counts.seeds} hens ${l.counts.hens} lift ${l.lifts.enabled ? 'col ' + l.lifts.col : 'none'}`);
}

// ---------------------------------------------------------------------------
// Hen "random" source: $911E keeps a byte pointer at $736C (high byte forced to
// 0 at $912C) and reads Spectrum ROM bytes $0000..$00FF through it ($9133,
// $91C3, $9233). The first 256 bytes of the 48K ROM are therefore game data.
// reference/48.rom is not in the repo; fetch it and re-run to regenerate.
// ---------------------------------------------------------------------------
{
  const romPath = path.join(REF, '48.rom');
  if (fs.existsSync(romPath)) {
    const rom = fs.readFileSync(romPath);
    const md5 = (await import('node:crypto')).createHash('md5').update(rom).digest('hex');
    if (rom.length !== 16384 || md5 !== '4c42a2f075212361c3117015b107ff68') throw new Error('reference/48.rom is not the standard 48K ROM');
    fs.writeFileSync(path.join(OUT, 'rng.json'), JSON.stringify({
      _comment: 'First 256 bytes of the ZX Spectrum 48K ROM, read by the hen AI as its random source via the pointer at $736C.',
      bytes: Array.from(rom.subarray(0, 256)),
    }));
    console.log('rng.json written from 48.rom');
  } else {
    console.warn('reference/48.rom missing: data/rng.json not regenerated');
  }
}
