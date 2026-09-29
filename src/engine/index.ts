export * from './types.ts';
export { optimize } from './optimizer.ts';
export { validateSolution } from './validate.ts';
export { allowedOrientations, SCALE } from './geometry.ts';
export type { Orient } from './geometry.ts';

import type { Pin, Solution } from './types.ts';

/** pins (locked pieces) derived from a solution – used to re-run around fixed pieces */
export function pinsFromSolution(sol: Solution): Pin[] {
  const pins: Pin[] = [];
  for (const sh of sol.sheets) {
    for (const p of sh.placements) {
      if (!p.pinned) continue;
      pins.push({
        pieceId: p.pieceId,
        instance: p.instance,
        slot: sh.index,
        stockId: sh.stockId,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        rotated: p.rotated,
      });
    }
  }
  return pins;
}

/** identical sheets (same stock size + same layout) are grouped as one, shown with a ×N count —
 *  shared by the visual cut-map cards and the per-sheet stats pager so both page through the
 *  same list of distinct sheets. Sorted so sheets with less waste (higher utilization) come first. */
export function sheetGroups(sol: Solution): { index: number; count: number }[] {
  const seen = new Map<string, { index: number; count: number }>();
  sol.sheets.forEach((sh, i) => {
    const sig =
      `${sh.width}x${sh.height}|` +
      sh.placements
        .map((p) => `${p.pieceId}@${p.x},${p.y},${p.w},${p.h}`)
        .sort()
        .join(';');
    const e = seen.get(sig);
    if (e) e.count++;
    else seen.set(sig, { index: i, count: 1 });
  });
  return [...seen.values()].sort((a, b) => sol.sheets[b.index].utilization - sol.sheets[a.index].utilization);
}
