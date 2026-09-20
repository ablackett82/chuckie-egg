import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const levels = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels.json'), 'utf8')).levels;
export const rom = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rng.json'), 'utf8')).bytes;
