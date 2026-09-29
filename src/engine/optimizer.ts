/**
 * Optimizer: multi-start constructive search over
 *   sort order × choice heuristic × split rule × stock-selection rule
 * followed by simulated annealing on (item order, forced orientations, heuristics).
 * Every candidate is a REAL geometric layout produced by the guillotine packer;
 * candidates are compared with the cost function of the priority chosen by the user.
 */
import type { EngineInput, OptimizeSettings, Solution } from './types.ts';
import { prepare } from './prepare.ts';
import type { Ctx, Item } from './prepare.ts';
import { build } from './builder.ts';
import type { BuildParams, RawSolution } from './builder.ts';
import { CHOICE_RULES, PIN_VARIANTS, SPLIT_RULES, STOCK_RULES } from './guillotine.ts';
import type { ChoiceRule, SplitRule, StockRule } from './guillotine.ts';
import { computeMetrics, energy } from './scoring.ts';
import { finalize } from './solution.ts';

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SortKind = 'area' | 'side' | 'short' | 'perim';
const SORTS: SortKind[] = ['area', 'side', 'short', 'perim'];

function sortKeys(ctx: Ctx, kind: SortKind): number[] {
  const val = (it: Item): number[] => {
    const long = Math.max(it.w, it.h);
    const short = Math.min(it.w, it.h);
    switch (kind) {
      case 'area':
        return [it.area, long];
      case 'side':
        return [long, it.area];
      case 'short':
        return [short, long];
      case 'perim':
        return [it.w + it.h, it.area];
    }
  };
  return ctx.freeKeys.slice().sort((a, b) => {
    const va = val(ctx.items[a]);
    const vb = val(ctx.items[b]);
    return vb[0] - va[0] || vb[1] - va[1] || a - b;
  });
}

interface State {
  order: number[];
  forced: number[];
  choice: ChoiceRule;
  split: SplitRule;
  stockRule: StockRule;
  pinVariant: number;
}

const toParams = (s: State): BuildParams => s;

function neighbor(ctx: Ctx, st: State, rng: () => number): State {
  const n = st.order.length;
  const ns: State = {
    order: st.order.slice(),
    forced: st.forced.slice(),
    choice: st.choice,
    split: st.split,
    stockRule: st.stockRule,
    pinVariant: st.pinVariant,
  };
  const r = rng();
  if (n >= 2 && r < 0.45) {
    const i = Math.floor(rng() * n);
    const j = Math.floor(rng() * n);
    const t = ns.order[i];
    ns.order[i] = ns.order[j];
    ns.order[j] = t;
  } else if (n >= 2 && r < 0.7) {
    const i = Math.floor(rng() * n);
    const j = Math.floor(rng() * n);
    const [k] = ns.order.splice(i, 1);
    ns.order.splice(j, 0, k);
  } else if (n >= 1 && r < 0.87) {
    const key = ns.order[Math.floor(rng() * n)];
    const cnt = ctx.items[key].orients.length;
    if (cnt > 1) ns.forced[key] = Math.floor(rng() * (cnt + 1)) - 1;
  } else {
    const w = rng();
    if (ctx.pinSheets.length > 0 && rng() < 0.25) ns.pinVariant = Math.floor(rng() * PIN_VARIANTS);
    else if (w < 0.34) ns.choice = CHOICE_RULES[Math.floor(rng() * CHOICE_RULES.length)];
    else if (w < 0.67 && !ctx.forcedSplit) ns.split = SPLIT_RULES[Math.floor(rng() * SPLIT_RULES.length)];
    else if (ctx.stock.length > 1) ns.stockRule = STOCK_RULES[Math.floor(rng() * STOCK_RULES.length)];
  }
  return ns;
}

export function optimize(input: EngineInput, settings: OptimizeSettings = {}): Solution {
  const t0 = Date.now();
  const ctx = prepare(input);
  const maxMs = settings.maxMs ?? 2500;
  const rng = mulberry32(settings.seed ?? 20260921);
  const n = ctx.freeKeys.length;
  const priority = ctx.priority;

  const evalRaw = (raw: RawSolution): number => energy(computeMetrics(ctx, raw), ctx, priority);
  const emptyForced = (): number[] => new Array<number>(ctx.items.length).fill(-1);

  if (n === 0) {
    const st: State = { order: [], forced: emptyForced(), choice: 'BSSF', split: ctx.forcedSplit ?? 'SLAS', stockRule: 'smallest', pinVariant: 0 };
    const raw = build(ctx, toParams(st));
    return finalize(ctx, raw, {
      choice: st.choice,
      split: st.split,
      stockRule: st.stockRule,
      iterations: 0,
      candidates: 1,
      ms: Date.now() - t0,
      energy: evalRaw(raw),
    });
  }

  /* ---------- phase 1: deterministic multi-start ---------- */
  const stockRules: StockRule[] = ctx.stock.length > 1 && ctx.maxSheets !== 1 ? STOCK_RULES : ['smallest'];
  let best: { st: State; raw: RawSolution; e: number } | null = null;
  let candidates = 0;
  const phase1Deadline = t0 + maxMs * 0.4;
  const pinVariants = ctx.pinSheets.length > 0 ? PIN_VARIANTS : 1;
  const splitCandidates = ctx.forcedSplit ? [ctx.forcedSplit] : SPLIT_RULES;
  outer: for (const kind of SORTS) {
    const order = sortKeys(ctx, kind);
    for (const choice of CHOICE_RULES) {
      for (const split of splitCandidates) {
        for (const stockRule of stockRules) {
          for (let pinVariant = 0; pinVariant < pinVariants; pinVariant++) {
            const st: State = { order, forced: emptyForced(), choice, split, stockRule, pinVariant };
            const raw = build(ctx, toParams(st));
            const e = evalRaw(raw);
            candidates++;
            if (best === null || e < best.e - 1e-12) best = { st, raw, e };
            if ((candidates & 15) === 0 && Date.now() > phase1Deadline) break outer;
          }
        }
      }
    }
  }
  if (best === null) throw new Error('engine: no candidate produced');

  /* ---------- phase 2: simulated annealing ---------- */
  const defaultIter = Math.round(Math.min(5000, Math.max(400, 400000 / Math.max(1, n))));
  const iterations = n >= 2 ? settings.maxIterations ?? defaultIter : 0;
  const deadline = t0 + maxMs;
  const T0 = 0.03;
  const T1 = 0.0005;
  let cur = best;
  let it = 0;
  for (; it < iterations; it++) {
    if ((it & 31) === 0) {
      if (Date.now() > deadline) break;
      settings.onProgress?.(it / iterations);
    }
    if (it === Math.floor(iterations / 2)) cur = best; // restart from the incumbent
    const T = T0 * Math.pow(T1 / T0, it / iterations);
    const st = neighbor(ctx, cur.st, rng);
    const raw = build(ctx, toParams(st));
    const e = evalRaw(raw);
    candidates++;
    if (e <= cur.e || rng() < Math.exp((cur.e - e) / T)) {
      cur = { st, raw, e };
      if (e < best.e - 1e-12) best = cur;
    }
  }
  settings.onProgress?.(1);

  return finalize(ctx, best.raw, {
    choice: best.st.choice,
    split: best.st.split,
    stockRule: best.st.stockRule,
    iterations: it,
    candidates,
    ms: Date.now() - t0,
    energy: best.e,
  });
}
