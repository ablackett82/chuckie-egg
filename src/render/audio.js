// Beeper: turns the machine's recorded beeps (half period h, l cycles, at a
// T-state timestamp) into square-wave blips scheduled on the WebAudio clock.
import { CPU_HZ } from '../game/consts.js';
import { beepHz } from '../game/sfx.js';

export class Beeper {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.origin = null; // audio time corresponding to machine t = 0
  }

  /** Must be called from a user gesture on iOS. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.12;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * Schedule the beeps produced since the last call. `nowT` is the machine's
   * current T-state clock; beeps are placed relative to it so they line up
   * with what is on screen.
   */
  flush(sfx, nowT) {
    if (!this.ctx || this.ctx.state !== 'running') { sfx.length = 0; return; }
    const now = this.ctx.currentTime;
    // keep the machine clock and audio clock aligned, with a little scheduling slack
    const want = now - nowT / CPU_HZ + 0.04;
    if (this.origin === null || Math.abs(want - this.origin) > 0.1) this.origin = want;
    else this.origin += (want - this.origin) * 0.05;
    for (const b of sfx) {
      if (this.muted) continue;
      const f = beepHz(b.h);
      const start = this.origin + b.at / CPU_HZ;
      const dur = b.l / f;
      if (start < now - 0.05) continue;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(this.gain);
      osc.start(Math.max(start, now));
      osc.stop(Math.max(start, now) + dur);
    }
    sfx.length = 0;
  }
}
