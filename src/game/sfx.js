// Beeper sound effects. $9CA4 plays `l` cycles of a square wave whose half
// period is an `h`-iteration DJNZ loop (13 T-states each), busy-waiting the
// CPU the whole time. We record the beep for the audio layer and charge its
// T-state cost so the game pauses for it exactly like the original.
import { COST } from './consts.js';

export function beep(s, h, l) {
  h &= 0xff; l &= 0xff;
  if (h === 0) h = 256; // DJNZ with B=0 loops 256 times
  if (l === 0) l = 256;
  const cost = l * (26 * h + COST.BEEP_OVERHEAD);
  s.t += cost;
  s.sfx.push({ h, l, at: s.t - cost });
  return cost;
}

/** Frequency in Hz of a beep with half-period h (for the audio layer). */
export const beepHz = (h) => 3_500_000 / (26 * h);
