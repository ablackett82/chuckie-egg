// Renders the home-screen icons from the extracted Harry sprite (yellow on
// black, like the game): icons/icon-180.png (iOS), icon-192.png, icon-512.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, hexToRgb } from './png.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gfx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/graphics.json'), 'utf8'));
const harry = gfx.sprites.find((s) => s.name === 'farmer_right_0');
const YELLOW = hexToRgb(gfx.palette[6]), BLACK = hexToRgb(gfx.palette[0]);

function icon(size, scale) {
  const r = new Raster(size, size);
  r.fill(0, 0, size, size, BLACK);
  const off = (size - 16) >> 1;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if ((harry.rows[y] >> (15 - x)) & 1) r.set(off + x, off + y, YELLOW);
  }
  return r.encode(scale);
}

fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'icons/icon-180.png'), icon(20, 9));
fs.writeFileSync(path.join(ROOT, 'icons/icon-192.png'), icon(24, 8));
fs.writeFileSync(path.join(ROOT, 'icons/icon-512.png'), icon(32, 16));
console.log('wrote icons/icon-{180,192,512}.png');
