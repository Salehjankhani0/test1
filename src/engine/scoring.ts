/** Metrics of a raw solution and the cost ("energy") for every user priority. */
import type { Ctx } from './prepare.ts';
import type { RawSolution } from './builder.ts';
import type { Priority } from './types.ts';

export interface Metrics {
  pieceArea: number;
  sheetArea: number;
  wasteArea: number;
  sheets: number;
  cutCount: number;
  cutLength: number;
  unplacedArea: number;
  unplacedCount: number;
  /** sum of all leftover rectangles big enough to be reused */
  reusableArea: number;
  /** reusable area of the single sheet that has the most of it */
  reusableBest: number;
  /** biggest single leftover rectangle */
  largestFree: number;
  /** Σ used² / sheetArea – large when waste is concentrated in few sheets */
  concentrated: number;
}

export function computeMetrics(ctx: Ctx, raw: RawSolution): Metrics {
  let pieceArea = 0;
  let sheetArea = 0;
  let cutCount = 0;
  let cutLength = 0;
  let reusableArea = 0;
  let reusableBest = 0;
  let largestFree = 0;
  let concentrated = 0;
  for (const s of raw.sheets) {
    let used = 0;
    for (const pl of s.placed) used += pl.w * pl.h;
    const total = s.W * s.H;
    pieceArea += used;
    sheetArea += total;
    concentrated += (used * used) / total;
    cutCount += s.cuts.length;
    for (const c of s.cuts) cutLength += c.length;
    let reuse = 0;
    for (const f of s.free) {
      const a = f.w * f.h;
      if (a > largestFree) largestFree = a;
      if (ctx.minOffcut > 0 && (f.w < f.h ? f.w : f.h) >= ctx.minOffcut) reuse += a;
    }
    reusableArea += reuse;
    if (reuse > reusableBest) reusableBest = reuse;
  }
  let unplacedArea = 0;
  for (const k of raw.unplaced) unplacedArea += ctx.items[k].area;
  return {
    pieceArea,
    sheetArea,
    wasteArea: sheetArea - pieceArea,
    sheets: raw.sheets.length,
    cutCount,
    cutLength,
    unplacedArea,
    unplacedCount: raw.unplaced.length,
    reusableArea,
    reusableBest,
    largestFree,
    concentrated,
  };
}

/** lower is better */
export function energy(m: Metrics, ctx: Ctx, priority: Priority): number {
  const P = ctx.totalArea;
  const base = 1000 * (m.unplacedArea / P);
  const eff = Math.max(0, m.wasteArea - m.reusableBest) / P;
  const waste = m.wasteArea / P;
  const cut = m.cutLength / ctx.lenScale;
  const lf = m.largestFree / P;
  switch (priority) {
    case 'minWaste':
      return base + eff + 0.02 * m.sheets + 0.004 * cut - 0.004 * lf;
    case 'minCut':
      return base + cut + 0.1 * waste + 0.02 * m.sheets;
    case 'minSheets':
      return base + 10 * m.sheets + 0.3 * eff + 0.004 * cut;
    case 'maxUtilization':
      return base + (1 - m.concentrated / P) + 0.02 * m.sheets + 0.004 * cut;
    case 'smart':
      return base + eff + 0.03 * m.sheets + 0.05 * cut - 0.01 * lf;
  }
}
