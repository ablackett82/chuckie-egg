// Entry point: loads the data, runs the fixed-timestep loop, draws the screen.
import { newGame, beginPlay, advance, NO_INPUT } from './game/machine.js';
import { CPU_HZ } from './game/consts.js';
import { scoreValue } from './game/scoring.js';
import { Screen, SCREEN_W, SCREEN_H } from './render/screen.js';
import { Beeper } from './render/audio.js';
import { Keyboard } from './input/keyboard.js';
import { Gamepad } from './input/gamepad.js';

const STEP_T = 34944;      // fixed simulation quantum: 1/100 s of Z80 time
const MAX_FRAME_S = 0.1;   // never simulate more than this per animation frame

async function loadJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

async function main() {
  const [levelsData, gfx, rng] = await Promise.all([loadJSON('data/levels.json'), loadJSON('data/graphics.json'), loadJSON('data/rng.json')]);
  const levels = levelsData.levels, rom = rng.bytes;

  const canvas = document.getElementById('screen');
  canvas.width = SCREEN_W; canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const image = ctx.createImageData(SCREEN_W, SCREEN_H);
  const screen = new Screen(gfx);
  const beeper = new Beeper();
  const keyboard = new Keyboard();
  const gamepad = new Gamepad();
  const touch = window.__touchInput; // provided by src/input/touch.js when loaded (Phase 3)

  let mode = 'title';
  let game = null;
  let highScore = Number(localStorage.getItem('chuckie.highscore') || 0);
  let paused = false;
  let acc = 0, last = performance.now();
  const input = { ...NO_INPUT };

  function readInput() {
    for (const k in input) input[k] = false;
    keyboard.read(input);
    gamepad.read(input);
    touch?.read(input);
    return input;
  }

  function startGame() {
    game = newGame(levels, rom);
    beginPlay(game);
    mode = 'game';
    acc = 0;
    beeper.unlock();
  }

  function fit() {
    const stage = document.getElementById('stage');
    const vw = stage.clientWidth, vh = stage.clientHeight;
    const scale = Math.max(1, Math.floor(Math.min(vw / SCREEN_W, vh / SCREEN_H)));
    canvas.style.width = `${SCREEN_W * scale}px`;
    canvas.style.height = `${SCREEN_H * scale}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  function drawTitle() {
    screen.drawTextScreen([
      { text: 'CHUCKIE EGG', row: 4, attr: 0x46 },
      { text: 'A+F SOFTWARE 1983', row: 6, attr: 0x06 },
      { text: 'ZX SPECTRUM EDITION', row: 8, attr: 0x05 },
      { text: `HIGH SCORE ${String(highScore).padStart(6, '0')}`, row: 11, attr: 0x07 },
      { text: 'ARROWS OR WASD TO MOVE', row: 14, attr: 0x07 },
      { text: 'SPACE OR Z TO JUMP', row: 15, attr: 0x07 },
      { text: 'P PAUSE  M MUTE  F FULLSCREEN', row: 16, attr: 0x07 },
      { text: 'PRESS FIRE TO START', row: 20, attr: 0x44 },
    ]);
  }

  function frame(now) {
    const dt = Math.min(MAX_FRAME_S, (now - last) / 1000);
    last = now;
    const inp = readInput();
    const fire = keyboard.consume('Space', 'Enter', 'KeyZ', 'KeyM') || gamepad.anyPressed || touch?.consumeStart?.();

    if (keyboard.consume('KeyP')) paused = !paused;
    if (keyboard.consume('KeyF')) toggleFullscreen();
    if (keyboard.consume('KeyM') && mode === 'game') beeper.muted = !beeper.muted;

    if (mode === 'title') {
      if (fire) startGame();
      drawTitle();
    } else if (mode === 'game') {
      if (!paused) {
        acc += dt * CPU_HZ;
        while (acc >= STEP_T) { advance(game, STEP_T, () => inp); acc -= STEP_T; }
        beeper.flush(game.sfx, game.t);
        for (const e of game.events) {
          if (e.type === 'gameover') {
            highScore = Math.max(highScore, scoreValue(game));
            localStorage.setItem('chuckie.highscore', String(highScore));
            mode = 'gameover';
            gameOverUntil = now + 4000;
          }
        }
        game.events.length = 0;
      }
      screen.drawGame(game);
      if (paused) screen.text('PAUSED', 13, 12, 0x47);
    } else if (mode === 'gameover') {
      screen.drawGame(game);
      screen.text('GAME OVER', 11, 11, 0x47);
      if (now > gameOverUntil || fire) { mode = 'title'; keyboard.clearPressed(); }
    }

    image.data.set(screen.toRGBA());
    ctx.putImageData(image, 0, 0);
    requestAnimationFrame(frame);
  }
  let gameOverUntil = 0;
  requestAnimationFrame(frame);

  // unlock audio on the first interaction of any kind
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, () => beeper.unlock(), { once: false, passive: true });
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;padding:1em">${err.stack || err}</pre>`);
});
