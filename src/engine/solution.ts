/** Converts the internal integer solution to the public (unit based) Solution. */
import type { Ctx } from './prepare.ts';
import type { RawSolution } from './builder.ts';
import { computeMetrics } from './scoring.ts';
import type { CutLine, PlacedPiece, SheetResult, Solution, StockUsage, UnplacedPiece } from './types.ts';
import { fromArea, fromInt } from './geometry.ts';

export interface SolutionMeta {
  choice: string;
  split: string;
  stockRule: string;
  iterations: number;
  candidates: number;
  ms: number;
  energy: number;
}

export function finalize(ctx: Ctx, raw: RawSolution, meta: SolutionMeta): Solution {
  const sheets: SheetResult[] = raw.sheets.map((s, index) => {
    const stock = ctx.stock[s.stockIndex];
    const placements: PlacedPiece[] = s.placed.map((pl) => {
      const it = ctx.items[pl.itemKey];
      return {
        pieceId: it.pieceId,
        instance: it.instance,
        label: it.label,
        x: fromInt(pl.x),
        y: fromInt(pl.y),
        w: fromInt(pl.w),
        h: fromInt(pl.h),
        rotated: pl.rotated,
        pinned: pl.pinned,
      };
    });
    const ordered = s.cuts.map((c, i) => ({ c, i })).sort((a, b) => a.c.depth - b.c.depth || a.i - b.i);
    const cuts: CutLine[] = ordered.map((o, k) => ({
      order: k + 1,
      orientation: o.c.orientation,
      x: fromInt(o.c.x),
      y: fromInt(o.c.y),
      length: fromInt(o.c.length),
    }));
    let used = 0;
    for (const pl of s.placed) used += pl.w * pl.h;
    const total = s.W * s.H;
    let cutLen = 0;
    for (const c of s.cuts) cutLen += c.length;
    return {
      index,
      stockId: stock.id,
      stockLabel: stock.label,
      width: fromInt(s.W),
      height: fromInt(s.H),
      placements,
      cuts,
      freeRects: s.free.map((f) => ({ x: fromInt(f.x), y: fromInt(f.y), w: fromInt(f.w), h: fromInt(f.h) })),
      sheetArea: fromArea(total),
      usedArea: fromArea(used),
      wasteArea: fromArea(total - used),
      utilization: total ? used / total : 0,
      pieceCount: placements.length,
      cutCount: cuts.length,
      cutLength: fromInt(cutLen),
    };
  });

  const unplaced: UnplacedPiece[] = raw.unplaced.map((k) => {
    const it = ctx.items[k];
    const fitsAny = ctx.stock.some((st) => it.orients.some((o) => o.w <= st.W && o.h <= st.H));
    return {
      pieceId: it.pieceId,
      instance: it.instance,
      label: it.label,
      width: fromInt(it.w),
      height: fromInt(it.h),
      reason: fitsAny ? 'noStock' : 'tooLarge',
    };
  });

  const m = computeMetrics(ctx, raw);
  const byStock = new Map<string, StockUsage>();
  for (const s of sheets) {
    const u = byStock.get(s.stockId);
    if (u) u.count++;
    else byStock.set(s.stockId, { stockId: s.stockId, label: s.stockLabel, width: s.width, height: s.height, count: 1 });
  }
  const placedCount = sheets.reduce((a, s) => a + s.pieceCount, 0);

  return {
    sheets,
    unplaced,
    stats: {
      sheetCount: sheets.length,
      sheetsByStock: [...byStock.values()],
      usedArea: fromArea(m.pieceArea),
      totalSheetArea: fromArea(m.sheetArea),
      wasteArea: fromArea(m.wasteArea),
      utilization: m.sheetArea ? m.pieceArea / m.sheetArea : 0,
      wastePercent: m.sheetArea ? (m.wasteArea / m.sheetArea) * 100 : 0,
      reusableArea: fromArea(m.reusableArea),
      cutCount: m.cutCount,
      cutLength: fromInt(m.cutLength),
      kerf: fromInt(ctx.kerf),
      priority: ctx.priority,
      pieceCount: ctx.items.length,
      placedCount,
      unplacedCount: unplaced.length,
    },
    warnings: ctx.warnings,
    meta,
    createdAt: Date.now(),
  };
}
