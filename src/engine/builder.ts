/**
 * Constructive builder: given an item order, per-item forced orientations and the
 * heuristic rules, packs all items into guillotine layouts and returns a RawSolution.
 */
import type { Ctx } from './prepare.ts';
import type { Orient } from './geometry.ts';
import { chooseSplitH, fitPrimary, fitSecondary, makeSheet, placeInto } from './guillotine.ts';
import type { ChoiceRule, RawSheet, SplitRule, StockRule } from './guillotine.ts';

export type { RawSheet } from './guillotine.ts';

export interface BuildParams {
  order: number[];
  /** per item key: -1 = any allowed orientation, otherwise index into item.orients */
  forced: number[];
  choice: ChoiceRule;
  split: SplitRule;
  stockRule: StockRule;
  /** which alternative partition around pinned pieces to use */
  pinVariant?: number;
}

export interface RawSolution {
  sheets: RawSheet[];
  unplaced: number[];
}

interface Pos {
  s: number;
  fi: number;
  o: Orient;
}

function orientsOf(ctx: Ctx, p: BuildParams, key: number): Orient[] {
  const it = ctx.items[key];
  const f = p.forced[key];
  return f >= 0 && f < it.orients.length ? [it.orients[f]] : it.orients;
}

function findBest(sheets: RawSheet[], from: number, orients: Orient[], rule: ChoiceRule): Pos | null {
  let best: Pos | null = null;
  let b1 = Infinity;
  let b2 = Infinity;
  for (let s = from; s < sheets.length; s++) {
    const free = sheets[s].free;
    for (let fi = 0; fi < free.length; fi++) {
      const fr = free[fi];
      for (const o of orients) {
        if (o.w > fr.w || o.h > fr.h) continue;
        const p1 = fitPrimary(rule, fr, o.w, o.h);
        if (p1 > b1) continue;
        const p2 = fitSecondary(rule, fr, o.w, o.h);
        if (p1 < b1 || p2 < b2) {
          best = { s, fi, o };
          b1 = p1;
          b2 = p2;
        }
      }
    }
  }
  return best;
}

function apply(ctx: Ctx, p: BuildParams, sheet: RawSheet, pos: Pos, key: number): void {
  const fr = sheet.free[pos.fi];
  const splitH = chooseSplitH(p.split, fr, pos.o.w, pos.o.h, ctx.kerf);
  placeInto(sheet, pos.fi, key, pos.o.w, pos.o.h, pos.o.rotated, splitH, ctx.kerf);
}

function fits(ctx: Ctx, p: BuildParams, key: number, si: number): boolean {
  const S = ctx.stock[si];
  return orientsOf(ctx, p, key).some((o) => o.w <= S.W && o.h <= S.H);
}

/** greedily fills a brand new sheet of type `si` with the given keys, returns used area */
function simulateFill(ctx: Ctx, p: BuildParams, si: number, keys: number[]): number {
  const S = ctx.stock[si];
  const sheet = makeSheet(si, S.W, S.H);
  const arr = [sheet];
  let used = 0;
  for (const key of keys) {
    const pos = findBest(arr, 0, orientsOf(ctx, p, key), p.choice);
    if (!pos) continue;
    apply(ctx, p, sheet, pos, key);
    used += pos.o.w * pos.o.h;
  }
  return used;
}

function chooseStock(ctx: Ctx, p: BuildParams, used: number[], key: number, upcoming: number[]): number {
  const cands: number[] = [];
  for (let si = 0; si < ctx.stock.length; si++) {
    if (used[si] < ctx.stock[si].qty && fits(ctx, p, key, si)) cands.push(si);
  }
  if (cands.length === 0) return -1;
  if (cands.length === 1) return cands[0];
  let best = cands[0];
  if (p.stockRule === 'smallest') {
    for (const si of cands) if (ctx.stock[si].area < ctx.stock[best].area) best = si;
  } else if (p.stockRule === 'largest') {
    for (const si of cands) if (ctx.stock[si].area > ctx.stock[best].area) best = si;
  } else {
    const keys = [key, ...upcoming.slice(0, 80)];
    let bestScore = -1;
    for (const si of cands) {
      const score = simulateFill(ctx, p, si, keys) / ctx.stock[si].area;
      if (score > bestScore + 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && ctx.stock[si].area < ctx.stock[best].area)) {
        bestScore = score;
        best = si;
      }
    }
  }
  return best;
}

function cloneSheet(ctx: Ctx, stockIndex: number, part: { placed: RawSheet['placed']; cuts: RawSheet['cuts']; free: RawSheet['free'] }): RawSheet {
  const S = ctx.stock[stockIndex];
  return {
    stockIndex,
    W: S.W,
    H: S.H,
    placed: part.placed.map((x) => ({ ...x })),
    cuts: part.cuts.map((x) => ({ ...x })),
    free: part.free.map((x) => ({ ...x })),
  };
}

function run(ctx: Ctx, p: BuildParams, initialStock: number | null): RawSolution {
  const used = new Array<number>(ctx.stock.length).fill(0);
  const sheets: RawSheet[] = [];
  for (const ps of ctx.pinSheets) {
    sheets.push(cloneSheet(ctx, ps.stockIndex, ps.parts[(p.pinVariant ?? 0) % ps.parts.length]));
    used[ps.stockIndex]++;
  }
  if (initialStock !== null) {
    const S = ctx.stock[initialStock];
    sheets.push(makeSheet(initialStock, S.W, S.H));
    used[initialStock]++;
  }
  const unplaced: number[] = [];
  const order = p.order;
  for (let idx = 0; idx < order.length; idx++) {
    const key = order[idx];
    const orients = orientsOf(ctx, p, key);
    let pos = findBest(sheets, 0, orients, p.choice);
    if (!pos && sheets.length < ctx.maxSheets) {
      const si = chooseStock(ctx, p, used, key, order.slice(idx + 1));
      if (si >= 0) {
        const S = ctx.stock[si];
        sheets.push(makeSheet(si, S.W, S.H));
        used[si]++;
        pos = findBest(sheets, sheets.length - 1, orients, p.choice);
      }
    }
    if (!pos) unplaced.push(key);
    else apply(ctx, p, sheets[pos.s], pos, key);
  }
  return { sheets, unplaced };
}

function placedArea(r: RawSolution): number {
  let a = 0;
  for (const s of r.sheets) for (const pl of s.placed) a += pl.w * pl.h;
  return a;
}

export function build(ctx: Ctx, p: BuildParams): RawSolution {
  if (ctx.maxSheets === 1 && ctx.pinSheets.length === 0 && ctx.stock.length > 1) {
    // single-sheet mode: try every stock type as the one and only sheet
    let best: RawSolution | null = null;
    let bestA = -1;
    let bestSheet = Infinity;
    for (let si = 0; si < ctx.stock.length; si++) {
      const r = run(ctx, p, si);
      const a = placedArea(r);
      const sa = ctx.stock[si].area;
      if (a > bestA || (a === bestA && sa < bestSheet)) {
        best = r;
        bestA = a;
        bestSheet = sa;
      }
    }
    return best!;
  }
  return run(ctx, p, null);
}
