// Draws the game state onto a model of the Spectrum screen: a 256x192 1-bit
// pixel plane plus a 32x24 attribute grid (one ink/paper pair per 8x8 cell),
// then converts that to RGBA. This reproduces the original's look including
// attribute "colour clash" around sprites.
import { MAP_COLS, MAP_ROWS, TILE, CLIMB } from '../game/consts.js';
import { henSprite } from '../game/hens.js';
import { counterValue } from '../game/scoring.js';

const W = 256, H = 192, PLAYFIELD_TOP = 24;
const ATTR_SPRITE = 0x06; // $9B93: sprites are yellow on black
const ATTR_HEN = 0x05;    // $934B: hens are cyan on black
const ATTR_HUD_LABEL = 0x17, ATTR_HUD_LIVES = 0x06;

export class Screen {
  constructor(gfx) {
    this.gfx = gfx;
    this.bits = new Uint8Array(W * H);
    this.attr = new Uint8Array(32 * 24);
    this.rgba = new Uint8ClampedArray(W * H * 4);
    this.palette = gfx.palette.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
    this.spriteById = gfx.sprites;
    this.henSprites = [null, ...['hen_left', 'hen_right', 'hen_climb_0', 'hen_climb_1', 'hen_left_walk', 'hen_right_walk', 'hen_eat_left', 'hen_eat_right']
      .map((n) => gfx.sprites.find((sp) => sp.name === n))];
    this.tileAttr = gfx.tileAttr;
  }

  clear() { this.bits.fill(0); this.attr.fill(0); }

  /** Draw an 8x8 UDG at character cell (col, row) (top-down rows). */
  udg(id, col, row) {
    if (col < 0 || col > 31 || row < 0 || row > 23) return;
    const rows = this.gfx.tiles[id].rows;
    let p = row * 8 * W + col * 8;
    for (let y = 0; y < 8; y++, p += W) {
      const b = rows[y];
      for (let x = 0; x < 8; x++) this.bits[p + x] = (b >> (7 - x)) & 1;
    }
  }

  /** OR a 16x16 sprite with its top-left at top-down pixel (px, py). */
  sprite(spr, px, py) {
    for (let y = 0; y < 16; y++) {
      const sy = py + y;
      if (sy < 0 || sy >= H) continue;
      const b = spr.rows[y];
      if (!b) continue;
      for (let x = 0; x < 16; x++) {
        if (!((b >> (15 - x)) & 1)) continue;
        const sx = px + x;
        if (sx >= 0 && sx < W) this.bits[sy * W + sx] = 1;
      }
    }
  }

  fillRect(px, py, w, h) {
    for (let y = py; y < py + h; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = px; x < px + w; x++) if (x >= 0 && x < W) this.bits[y * W + x] = 1;
    }
  }

  setAttr(col, row, a) { if (col >= 0 && col < 32 && row >= 0 && row < 24) this.attr[row * 32 + col] = a; }

  /** Set the attribute of every cell touched by a box in top-down pixel coords. */
  attrBox(px, py, w, h, a) {
    const c0 = Math.floor(px / 8), c1 = Math.floor((px + w - 1) / 8);
    const r0 = Math.floor(py / 8), r1 = Math.floor((py + h - 1) / 8);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.setAttr(c, r, a);
  }

  text(str, col, row, attr) {
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      this.udg(ch >= 32 && ch < 91 ? ch : 32, col + i, row); // tile id == ASCII for the $85F0 font
      if (attr !== undefined) this.setAttr(col + i, row, attr);
    }
  }

  /** Render the full game state. */
  drawGame(s) {
    this.clear();
    this.drawPlayfield(s.map);
    this.drawHud(s);
    // lifts ($A07B): 16x4 solid blocks, colour left as the tile underneath
    if (s.lift.enabled) {
      for (const line of [s.lift.line1, s.lift.line2]) {
        if (line <= 191) this.fillRect(s.lift.x, 191 - line, 16, 4);
      }
    }
    // hens: feet on line y, sprite drawn upward; cyan attributes
    for (const h of s.hens) {
      if (h.x === 0xff) continue;
      const sp = this.henSprites[henSprite(h)];
      const px = h.state >= 7 && h.state !== 8 ? h.x - 8 : h.x; // eating-left sprite sits 8 px left
      const py = 191 - (h.y + 15);
      this.sprite(sp, px, py);
      this.attrBox(px, py, 16, 16, ATTR_HEN);
    }
    // mother duck
    const d = s.duck;
    const duckId = (d.facing === 'right' ? 8 : 10) + d.anim;
    this.sprite(this.spriteById[duckId], d.x, 191 - d.y);
    this.attrBox(d.x, 191 - d.y, 16, 16, ATTR_SPRITE);
    // Harry
    const id = s.jumpState !== 0 ? s.base + 1 : s.base + s.anim;
    this.sprite(this.spriteById[id], s.x, 191 - s.y);
    this.attrBox(s.x, 191 - s.y, 16, 16, ATTR_SPRITE);
  }

  drawPlayfield(map) {
    const { table, fallback } = this.tileAttr;
    for (let r = 0; r < MAP_ROWS; r++) {
      const row = 23 - r;
      for (let c = 0; c < MAP_COLS; c++) {
        const id = map[r * MAP_COLS + c];
        this.udg(id, c, row);
        this.setAttr(c, row, id < table.length ? table[id] : fallback);
      }
    }
  }

  /** $AE9C / $AFDB..: SCORE row, lives row, PLAYER/LEVEL/BONUS/TIME row. */
  drawHud(s) {
    const { hud, namedTiles } = this.gfx;
    const D = namedTiles.digits_bold[0];
    for (const a of hud.attrs) for (let i = 0; i < a.count; i++) this.setAttr(a.col + i, a.row, a.attr);
    hud.scoreLabel.ids.forEach((id, i) => this.udg(id, i, 0));
    s.score.forEach((dgt, i) => this.udg(D + dgt, 5 + i, 0));
    const spare = Math.min(s.lives, 7) - 1;
    for (let i = 0; i < spare; i++) this.udg(namedTiles.lives_icon, 5 + i, 1);
    if (s.cheats.easy) this.text('CHEAT', 26, 1, 0x06);
    const status = hud.statusRow.ids.slice();
    const lvl = s.level + 1;
    status[0x9772 - 0x9767] = D + (Math.floor(lvl / 10) % 10);
    status[0x9773 - 0x9767] = D + (lvl % 10);
    const bonus = counterValue(s.bonus), time = counterValue(s.time);
    status[0x977a - 0x9767] = D + Math.floor(bonus / 100) % 10;
    status[0x977b - 0x9767] = D + Math.floor(bonus / 10) % 10;
    status[0x977c - 0x9767] = D + bonus % 10;
    status[0x9784 - 0x9767] = D + Math.floor(time / 100) % 10;
    status[0x9785 - 0x9767] = D + Math.floor(time / 10) % 10;
    status[0x9786 - 0x9767] = D + time % 10;
    status.forEach((id, i) => this.udg(id, i, 2));
  }

  /** Simple centred text screens (title, game over). Lines: [{text, row, attr}]. */
  drawTextScreen(lines) {
    this.clear();
    for (const { text, row, attr = 0x07 } of lines) this.text(text, Math.floor((32 - text.length) / 2), row, attr);
  }

  /** Convert bits + attrs to RGBA. */
  toRGBA() {
    const { bits, attr, rgba, palette } = this;
    for (let y = 0; y < H; y++) {
      const arow = (y >> 3) * 32, prow = y * W;
      for (let cx = 0; cx < 32; cx++) {
        const a = attr[arow + cx];
        const ink = palette[a & 7], paper = palette[(a >> 3) & 7];
        let p = prow + cx * 8;
        for (let x = 0; x < 8; x++, p++) {
          const c = bits[p] ? ink : paper;
          const o = p * 4;
          rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
        }
      }
    }
    return rgba;
  }
}

export { W as SCREEN_W, H as SCREEN_H };
