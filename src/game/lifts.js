// Lifts ($A014). Two 16x4 platforms in one column that rise one pixel line
// per call and wrap to the bottom. The original tracks each lift as a display
// address plus a step counter ($7351/$7354); the counter is what the landing
// test uses and, at the start, equals the lift's top line (3 and 67). After a
// wrap the counter is reset to 3 but the address is still moved up once, so
// from then on the line runs one ahead of the counter.
import { COST, LIFT_WRAP, LIFT_RESET_Y } from './consts.js';

export function moveLifts(s) {
  const L = s.lift;
  if (!L.enabled) return;
  s.t += COST.LIFT_MOVE;
  L.c1 = (L.c1 + 1) & 0xff;
  if (L.c1 >= LIFT_WRAP) { L.line1 = L.startLine; L.c1 = LIFT_RESET_Y; }
  L.line1++;
  L.c2 = (L.c2 + 1) & 0xff;
  if (L.c2 >= LIFT_WRAP) { L.line2 = L.startLine; L.c2 = LIFT_RESET_Y; }
  L.line2++;
}
