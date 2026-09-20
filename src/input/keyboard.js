// Keyboard: arrows/WASD to move, space/enter/Z/M to jump. The original's
// default layout is also accepted (Q/A up/down, O/P left/right, M jump... in
// spirit: several sets are mapped so a Bluetooth keyboard just works).
const MAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  KeyO: 'left', KeyP: 'right', KeyQ: 'up', KeyZ: 'jump',
  Space: 'jump', Enter: 'jump', KeyM: 'jump', ShiftLeft: 'jump', ShiftRight: 'jump',
};

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set(); // edge-triggered, cleared by consume()
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.pressed.add(e.code);
      const a = MAP[e.code];
      if (a) { this.down.add(a); e.preventDefault(); }
    });
    target.addEventListener('keyup', (e) => {
      const a = MAP[e.code];
      if (a) { this.down.delete(a); e.preventDefault(); }
    });
    window.addEventListener('blur', () => this.down.clear());
  }
  read(into) { for (const a of this.down) into[a] = true; }
  /** True once per key press of any of the given codes. */
  consume(...codes) {
    for (const c of codes) if (this.pressed.has(c)) { this.pressed.clear(); return true; }
    return false;
  }
  clearPressed() { this.pressed.clear(); }
}
