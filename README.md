# Chuckie Egg

A faithful browser reimplementation of the 1983 ZX Spectrum *Chuckie Egg* (A&F Software),
built to run fullscreen on an iPad as a home-screen app. Plain HTML/JS, no build step.

Level data, graphics and game logic are traced from the disassembly of the original
([mrcook/chuckie-egg-disassembly](https://github.com/mrcook/chuckie-egg-disassembly)) and
the engine is validated tick-for-tick against the original binary running in an emulator.

## Play

Open the site, then on iPad: Share → **Add to Home Screen** for fullscreen and offline play.

- Keyboard: arrows / WASD / O,P,Q,A to move, Space / Z / M to jump; P pause, M mute, F fullscreen
- Touch: left half = d-pad or stick, right half = jump (⚙ to configure)
- Gamepad: d-pad / left stick + any face button

## Develop

```
npm install      # only needed for the differential tests
npm run dev      # http://localhost:8080/
npm test
npm run extract  # regenerate data/ and icons/ from reference/ (needs the disassembly checkouts)
```
