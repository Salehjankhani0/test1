/**
 * Independent geometric validator. It does not trust the engine: it re-checks bounds,
 * overlaps (with kerf), piece conservation, grain rules, stock usage, cut lines and stats.
 * Returns a list of human readable (Persian) errors – empty list = valid.
 */
import type { EngineInput, Solution } from './types.ts';

const EPS = 1e-6;
const eq = (a: number, b: number, tol = EPS): boolean => Math.abs(a - b) <= tol;

export function validateSolution(input: EngineInput, sol: Solution): string[] {
  const errs: string[] = [];
  const kerf = input.options.kerf || 0;
  const pieces = new Map(input.pieces.filter((p) => p.enabled && p.qty >= 1 && p.width > 0 && p.height > 0).map((p) => [p.id, p]));
  const stocks = new Map(input.stock.map((s) => [s.id, s]));

  const placedCount = new Map<string, number>();
  const stockCount = new Map<string, number>();
  const seenInstances = new Set<string>();
  let areaSum = 0;
  let sheetAreaSum = 0;
  let cutLenSum = 0;
  let cutCntSum = 0;

  for (const sh of sol.sheets) {
    const tag = `ورق ${sh.index + 1}`;
    stockCount.set(sh.stockId, (stockCount.get(sh.stockId) ?? 0) + 1);
    const st = stocks.get(sh.stockId);
    if (!st) errs.push(`${tag}: نوع موجودی ناشناخته`);
    else if (!eq(st.width, sh.width) || !eq(st.height, sh.height)) errs.push(`${tag}: ابعاد با موجودی نمی‌خواند`);
    sheetAreaSum += sh.width * sh.height;

    const P = sh.placements;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const spec = pieces.get(a.pieceId);
      if (!spec) {
        errs.push(`${tag}: قطعهٔ ناشناخته ${a.pieceId}`);
        continue;
      }
      const nm = spec.label || `${spec.width}×${spec.height}`;
      const inst = `${a.pieceId}#${a.instance}`;
      if (seenInstances.has(inst)) errs.push(`${tag}: قطعهٔ ${nm} دو بار چیده شده است`);
      seenInstances.add(inst);
      placedCount.set(a.pieceId, (placedCount.get(a.pieceId) ?? 0) + 1);
      areaSum += a.w * a.h;
      if (a.x < -EPS || a.y < -EPS || a.x + a.w > sh.width + EPS || a.y + a.h > sh.height + EPS) {
        errs.push(`${tag}: قطعهٔ ${nm} از ورق بیرون زده است`);
      }
      const okDims = a.rotated ? eq(a.w, spec.height) && eq(a.h, spec.width) : eq(a.w, spec.width) && eq(a.h, spec.height);
      if (!okDims) errs.push(`${tag}: ابعاد قطعهٔ ${nm} با ورودی نمی‌خواند`);
      if (a.rotated && spec.width === spec.height) errs.push(`${tag}: قطعهٔ مربع نباید چرخانده شود`);
      if (input.options.considerGrain && !a.pinned && spec.width !== spec.height) {
        const forcedHere = (input.forced ?? []).some((f) => f.pieceId === a.pieceId && f.instance === a.instance);
        if (!forcedHere) {
          if (spec.grain === 'vertical' && a.rotated) errs.push(`${tag}: قطعهٔ ${nm} با جهت دانه (عمودی) مغایرت دارد`);
          if (spec.grain === 'horizontal' && !a.rotated) errs.push(`${tag}: قطعهٔ ${nm} با جهت دانه (افقی) مغایرت دارد`);
        }
      }
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j];
        const separated =
          a.x + a.w + kerf <= b.x + EPS ||
          b.x + b.w + kerf <= a.x + EPS ||
          a.y + a.h + kerf <= b.y + EPS ||
          b.y + b.h + kerf <= a.y + EPS;
        if (!separated) errs.push(`${tag}: دو قطعه با هم تداخل دارند (یا فاصلهٔ کرف رعایت نشده)`);
      }
    }
    // cuts must lie inside the sheet and never go through a piece
    for (const c of sh.cuts) {
      const x0 = c.x;
      const y0 = c.y;
      const x1 = c.orientation === 'H' ? c.x + c.length : c.x + kerf;
      const y1 = c.orientation === 'H' ? c.y + kerf : c.y + c.length;
      const endOk = c.orientation === 'H' ? x1 <= sh.width + EPS : y1 <= sh.height + EPS;
      if (x0 < -EPS || y0 < -EPS || x0 > sh.width + EPS || y0 > sh.height + EPS || !endOk) {
        errs.push(`${tag}: برش ${c.order} خارج از ورق است`);
      }
      for (const p of P) {
        const hit = p.x < x1 - EPS && p.x + p.w > x0 + EPS && p.y < y1 - EPS && p.y + p.h > y0 + EPS;
        if (hit) errs.push(`${tag}: خط برش ${c.order} از داخل یک قطعه می‌گذرد`);
      }
    }
    cutLenSum += sh.cuts.reduce((a, c) => a + c.length, 0);
    cutCntSum += sh.cuts.length;
    const used = P.reduce((a, p) => a + p.w * p.h, 0);
    if (!eq(used, sh.usedArea, 1e-4) || !eq(sh.sheetArea - used, sh.wasteArea, 1e-4)) errs.push(`${tag}: آمار مساحت درست نیست`);
    for (const f of sh.freeRects) {
      if (f.x < -EPS || f.y < -EPS || f.x + f.w > sh.width + EPS || f.y + f.h > sh.height + EPS) errs.push(`${tag}: دورریز خارج از ورق`);
      for (const p of P) {
        if (p.x < f.x + f.w - EPS && p.x + p.w > f.x + EPS && p.y < f.y + f.h - EPS && p.y + p.h > f.y + EPS) {
          errs.push(`${tag}: ناحیهٔ دورریز با یک قطعه تداخل دارد`);
        }
      }
    }
  }

  const unplacedCount = new Map<string, number>();
  for (const u of sol.unplaced) unplacedCount.set(u.pieceId, (unplacedCount.get(u.pieceId) ?? 0) + 1);
  for (const [id, spec] of pieces) {
    const total = (placedCount.get(id) ?? 0) + (unplacedCount.get(id) ?? 0);
    if (total !== Math.floor(spec.qty)) errs.push(`تعداد قطعهٔ ${spec.label || id}: ${total} از ${spec.qty}`);
  }
  for (const [id, cnt] of stockCount) {
    const st = stocks.get(id);
    if (st && cnt > st.qty) errs.push(`موجودی ورق بیش از تعداد مجاز (${st.qty}) استفاده شده است`);
  }
  if (input.options.singleSheet) {
    const slots = new Set((input.pins ?? []).map((p) => p.slot)).size;
    if (sol.sheets.length > Math.max(1, slots)) errs.push('حالت «تنها یک ورق» رعایت نشده است');
  }
  const s = sol.stats;
  if (!eq(s.usedArea, areaSum, 1e-3)) errs.push('آمار مساحت مصرفی درست نیست');
  if (!eq(s.totalSheetArea, sheetAreaSum, 1e-3)) errs.push('آمار مساحت ورق‌ها درست نیست');
  if (!eq(s.cutLength, cutLenSum, 1e-3) || s.cutCount !== cutCntSum) errs.push('آمار برش درست نیست');
  return errs;
}
