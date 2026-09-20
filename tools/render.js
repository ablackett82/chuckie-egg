#!/usr/bin/env node
// Renders data/levels.json + data/graphics.json to reference/out/level-N.png
// (and a sprite/tile sheet) for eyeballing against screenshots of the original.
// Reproduces the Spectrum attribute colouring: one INK/PAPER pair per 8x8 cell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, hexToRgb } from './png.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reference', 'out');
const SCALE = 3;

const levels = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels.json'), 'utf8'));
const gfx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'graphics.json'), 'utf8'));
const palette = gfx.palette.map(hexToRgb);
const spriteByName = Object.fromEntries(gfx.sprites.map((s) => [s.name, s]));
const { playfieldTopPx, cols: COLS, rows: ROWS } = levels.conventions;

/** Screen model: 256x192 1-bit pixel plane + 32x24 attribute cells, like the hardware. */
class Screen {
  constructor() {
    this.bits = new Uint8Array(256 * 192);
    this.attr = new Uint8Array(32 * 24); // default 0 = black on black ($AE9C clears the attr file)
  }
  setAttr(col, row, a) { this.attr[row * 32 + col] = a; }
  udg(tile, col, row) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      this.bits[(row * 8 + y) * 256 + col * 8 + x] = (tile.rows[y] >> (7 - x)) & 1;
    }
  }
  sprite(spr, px, py) { // OR-merged like $9B11 (LD A,(DE); OR (HL))
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((spr.rows[y] >> (15 - x)) & 1) this.plot(px + x, py + y);
    }
  }
  plot(x, y) { if (x >= 0 && y >= 0 && x < 256 && y < 192) this.bits[y * 256 + x] = 1; }
  toRaster() {
    const r = new Raster(256, 192);
    for (let y = 0; y < 192; y++) for (let x = 0; x < 256; x++) {
      const a = this.attr[(y >> 3) * 32 + (x >> 3)];
      const ink = palette[a & 7], paper = palette[(a >> 3) & 7];
      r.set(x, y, this.bits[y * 256 + x] ? ink : paper);
    }
    return r;
  }
}

const bcd = (n) => [Math.floor(n / 10) % 10, n % 10];

function renderLevel(level) {
  const s = new Screen();
  const t = gfx.tiles;
  const { hud, tileAttr, namedTiles } = gfx;

  // --- playfield tiles + attributes ($AEAA draw loop, $B027 attribute loop)
  level.grid.forEach((row, gy) => row.forEach((id, gx) => {
    const screenRow = playfieldTopPx / 8 + gy;
    s.udg(t[id], gx, screenRow);
    s.setAttr(gx, screenRow, id < tileAttr.table.length ? tileAttr.table[id] : tileAttr.fallback);
  }));

  // --- HUD attributes ($AFDB..$B025)
  for (const a of hud.attrs) for (let i = 0; i < a.count; i++) s.setAttr(a.col + i, a.row, a.attr);

  // --- HUD text. Status row ids come from $9767 as snapshotted; the level, bonus
  // and time digits are patched per level exactly as $AEC2..$AF0D does.
  hud.scoreLabel.ids.forEach((id, i) => s.udg(t[id], hud.scoreLabel.col + i, hud.scoreLabel.row));
  const status = hud.statusRow.ids.slice();
  const D = namedTiles.digits_bold[0];
  const idx = level.level - 1;                         // $6EEB holds level-1
  const [lt, lu] = bcd(level.level);                   // $AEC8..$AECB: BCD of level
  status[0x9772 - 0x9767] = D + lt;                    // $AEDE
  status[0x9773 - 0x9767] = D + lu;                    // $AED2
  status[0x977A - 0x9767] = D + Math.min(idx + 1, 9);  // $AEE1..$AEF0: bonus thousands digit
  status[0x9784 - 0x9767] = D + (9 - Math.min(idx >> 4, 5)); // $AEF3..$AF0D: time hundreds digit
  status.forEach((id, i) => s.udg(t[id], hud.statusRow.col + i, hud.statusRow.row));
  // Score "000000" at row 0 col 5 ($733D -> $4005); 5 lives => 4 spare icons ($AFB3.., $B11A..)
  for (let i = 0; i < 6; i++) s.udg(t[D], 5 + i, 0);
  for (let i = 0; i < 4; i++) s.udg(t[namedTiles.lives_icon], hud.livesRow.col + i, hud.livesRow.row);

  // --- entities at their start positions
  s.sprite(spriteByName.farmer_right_0, level.spawn.x, level.spawn.y);
  s.sprite(spriteByName.duck_right_0, level.duck.x, level.duck.y);
  for (const h of level.hens) {
    if (!h.activeOnFirstPass) continue;
    const name = h.state === 1 ? 'hen_left' : h.state === 2 ? 'hen_right' : 'hen_climb_0';
    s.sprite(spriteByName[name], h.x, h.y);
  }
  if (level.lifts.enabled) {
    const { col, screenY, width, height, secondLiftOffset } = level.lifts;
    for (const y0 of [screenY, screenY + secondLiftOffset]) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) s.plot(col * 8 + x, y0 + y);
    }
  }
  return s.toRaster();
}

function renderSheet() {
  // tiles 0..5 + cage + lives icon, then all sprites, on a grid
  const r = new Raster(256, 60);
  r.fill(0, 0, 256, 60, palette[0]);
  const white = palette[7], yellow = palette[6];
  const showTiles = [0, 1, 2, 3, 4, 5, ...gfx.namedTiles.cage, gfx.namedTiles.lives_icon];
  showTiles.forEach((id, i) => {
    const tile = gfx.tiles[id], ox = (i % 24) * 10 + 4, oy = 4;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((tile.rows[y] >> (7 - x)) & 1) r.set(ox + x, oy + y, white);
  });
  gfx.sprites.forEach((spr, i) => {
    const ox = (i % 13) * 19 + 4, oy = 20 + Math.floor(i / 13) * 20;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((spr.rows[y] >> (15 - x)) & 1) r.set(ox + x, oy + y, yellow);
  });
  return r;
}

fs.mkdirSync(OUT, { recursive: true });
for (const level of levels.levels) {
  const file = path.join(OUT, `level-${level.level}.png`);
  fs.writeFileSync(file, renderLevel(level).encode(SCALE));
  console.log('wrote', path.relative(ROOT, file));
}
fs.writeFileSync(path.join(OUT, 'sheet.png'), renderSheet().encode(SCALE * 2));
console.log('wrote reference/out/sheet.png');
