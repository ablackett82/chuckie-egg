// Level buffer helpers. The map is 21 rows x 32 cols of tile ids, row 0 at the
// BOTTOM of the screen, exactly like the original buffer at $61A8. All
// coordinates are the original's: x = left pixel, y = pixel line counted up
// from the bottom of the screen.
import { MAP_COLS, MAP_ROWS, TILE } from './consts.js';

export const MAP_SIZE = MAP_COLS * MAP_ROWS;

/** Buffer index for pixel (x, y): ((y & $F8) * 4) + (x >> 3)  ($95A6, $9E34). */
export const idx = (x, y) => ((y & 0xff) >> 3) * MAP_COLS + ((x & 0xff) >> 3);

/** Tile at buffer index; reads outside the buffer return 0 (unused memory). */
export const at = (map, i) => (i >= 0 && i < MAP_SIZE ? map[i] : 0);

/** Tile under pixel (x, y) ($9E34 / $9438). */
export const tileAt = (map, x, y) => at(map, idx(x, y));

export const isSolid = (t) => t >= TILE.FLOOR; // $9D4D etc: cp 5 / jr nc
export const isLadder = (t) => t === TILE.LADDER_L || t === TILE.LADDER_R;

/** Build the bottom-up buffer from levels.json's top-down grid. */
export function mapFromGrid(grid) {
  const map = new Uint8Array(MAP_SIZE);
  for (let r = 0; r < MAP_ROWS; r++) map.set(grid[MAP_ROWS - 1 - r], r * MAP_COLS);
  return map;
}
