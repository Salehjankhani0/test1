/**
 * Guillotine packer primitives (integer geometry).
 *
 * A sheet is a list of free rectangles. Placing a piece into a free rectangle F at its
 * top-left corner produces at most two new free rectangles, separated by real
 * edge-to-edge guillotine cuts (each cut consumes `kerf` of glass).
 * Every cut we record is a full cut through its parent rectangle, so the resulting
 * layout can always be cut on a real glass-cutting table.
 */

export type ChoiceRule = 'BSSF' | 'BAF' | 'BLSF';
export type SplitRule = 'SAS' | 'LAS' | 'SLAS' | 'LLAS' | 'MAXAS' | 'MINAS' | 'H' | 'V';
export type StockRule = 'smallest' | 'largest' | 'fill';

export const CHOICE_RULES: ChoiceRule[] = ['BSSF', 'BAF', 'BLSF'];
export const SPLIT_RULES: SplitRule[] = ['SLAS', 'LLAS', 'SAS', 'LAS', 'MAXAS', 'MINAS'];
export const STOCK_RULES: StockRule[] = ['smallest', 'fill', 'largest'];

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** guillotine depth – parents are always cut before children */
  depth: number;
}

export interface CutInt {
  orientation: 'H' | 'V';
  x: number;
  y: number;
  length: number;
  depth: number;
}

export interface PlacedInt {
  itemKey: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  pinned: boolean;
}

export interface RawSheet {
  stockIndex: number;
  W: number;
  H: number;
  placed: PlacedInt[];
  cuts: CutInt[];
  free: FreeRect[];
}

export interface PinRect {
  itemKey: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface PartRes {
  placed: PlacedInt[];
  cuts: CutInt[];
  free: FreeRect[];
}

export function makeSheet(stockIndex: number, W: number, H: number): RawSheet {
  return { stockIndex, W, H, placed: [], cuts: [], free: [{ x: 0, y: 0, w: W, h: H, depth: 0 }] };
}

/** primary score of putting a w×h piece into `fr` (lower is better) */
export function fitPrimary(rule: ChoiceRule, fr: FreeRect, w: number, h: number): number {
  const dw = fr.w - w;
  const dh = fr.h - h;
  switch (rule) {
    case 'BSSF':
      return dw < dh ? dw : dh;
    case 'BLSF':
      return dw > dh ? dw : dh;
    case 'BAF':
      return fr.w * fr.h - w * h;
  }
}

export function fitSecondary(rule: ChoiceRule, fr: FreeRect, w: number, h: number): number {
  const dw = fr.w - w;
  const dh = fr.h - h;
  switch (rule) {
    case 'BSSF':
      return dw > dh ? dw : dh;
    case 'BLSF':
      return dw < dh ? dw : dh;
    case 'BAF':
      return dw < dh ? dw : dh;
  }
}

/** true = horizontal cut first (bottom rect spans full width) */
export function chooseSplitH(rule: SplitRule, fr: FreeRect, w: number, h: number, k: number): boolean {
  const dw = fr.w - w;
  const dh = fr.h - h;
  switch (rule) {
    case 'H':
      // primary cuts always run along the sheet's width (a full horizontal cut first)
      return true;
    case 'V':
      // primary cuts always run along the sheet's length (a full vertical cut first)
      return false;
    case 'SAS':
      return fr.w <= fr.h;
    case 'LAS':
      return fr.w > fr.h;
    case 'SLAS':
      return dw <= dh;
    case 'LLAS':
      return dw > dh;
    case 'MAXAS':
    case 'MINAS': {
      const rw = Math.max(0, dw - k);
      const bh = Math.max(0, dh - k);
      const aH = Math.max(rw * h, fr.w * bh);
      const aV = Math.max(rw * fr.h, w * bh);
      return rule === 'MAXAS' ? aH >= aV : aH <= aV;
    }
  }
}

/**
 * Place a w×h piece at the top-left of sheet.free[fi] and split the rest.
 * Cuts are only recorded where glass really remains next to the piece.
 */
export function placeInto(
  sheet: RawSheet,
  fi: number,
  itemKey: number,
  w: number,
  h: number,
  rotated: boolean,
  splitH: boolean,
  k: number,
): void {
  const fr = sheet.free[fi];
  const last = sheet.free.length - 1;
  sheet.free[fi] = sheet.free[last];
  sheet.free.pop();

  sheet.placed.push({ itemKey, x: fr.x, y: fr.y, w, h, rotated, pinned: false });

  const hasRight = fr.w > w;
  const hasBottom = fr.h > h;
  const rightW = fr.w - w - k;
  const bottomH = fr.h - h - k;
  const d = fr.depth;

  if (splitH) {
    if (hasBottom) sheet.cuts.push({ orientation: 'H', x: fr.x, y: fr.y + h, length: fr.w, depth: d });
    if (bottomH > 0) sheet.free.push({ x: fr.x, y: fr.y + h + k, w: fr.w, h: bottomH, depth: d + 1 });
    const d2 = hasBottom ? d + 1 : d;
    if (hasRight) sheet.cuts.push({ orientation: 'V', x: fr.x + w, y: fr.y, length: h, depth: d2 });
    if (rightW > 0) sheet.free.push({ x: fr.x + w + k, y: fr.y, w: rightW, h, depth: d2 + 1 });
  } else {
    if (hasRight) sheet.cuts.push({ orientation: 'V', x: fr.x + w, y: fr.y, length: fr.h, depth: d });
    if (rightW > 0) sheet.free.push({ x: fr.x + w + k, y: fr.y, w: rightW, h: fr.h, depth: d + 1 });
    const d2 = hasRight ? d + 1 : d;
    // the horizontal cut below the piece spans only the piece column
    if (hasBottom) sheet.cuts.push({ orientation: 'H', x: fr.x, y: fr.y + h, length: w, depth: d2 });
    if (bottomH > 0) sheet.free.push({ x: fr.x, y: fr.y + h + k, w, h: bottomH, depth: d2 + 1 });
  }
}

/**
 * Builds a guillotine partition of `region` that contains the given fixed pieces.
 * Returns null when the pieces cannot be separated by guillotine cuts (or overlap).
 */
export const PIN_VARIANTS = 4;

export function partition(
  region: FreeRect,
  pins: PinRect[],
  k: number,
  budget: { n: number } = { n: 4000 },
  variant = 0,
): PartRes | null {
  if (budget.n-- <= 0) return null;
  if (pins.length === 0) {
    return { placed: [], cuts: [], free: region.w > 0 && region.h > 0 ? [region] : [] };
  }
  if (pins.length === 1) {
    const p = pins[0];
    if (p.x === region.x && p.y === region.y && p.w === region.w && p.h === region.h) {
      return {
        placed: [{ itemKey: p.itemKey, x: p.x, y: p.y, w: p.w, h: p.h, rotated: p.rotated, pinned: true }],
        cuts: [],
        free: [],
      };
    }
  }
  const rBottom = region.y + region.h;
  const rRight = region.x + region.w;
  interface Cand {
    o: 'H' | 'V';
    c: number;
    both: boolean;
  }
  const cands: Cand[] = [];
  const seen = new Set<string>();
  const consider = (o: 'H' | 'V', c: number): void => {
    const id = o + c;
    if (seen.has(id)) return;
    seen.add(id);
    const lo = o === 'H' ? region.y : region.x;
    const hi = o === 'H' ? rBottom : rRight;
    if (c < lo || c >= hi || c + k <= lo) return;
    let a = 0;
    let b = 0;
    for (const p of pins) {
      const p0 = o === 'H' ? p.y : p.x;
      const p1 = o === 'H' ? p.y + p.h : p.x + p.w;
      if (p1 <= c) a++;
      else if (p0 >= c + k) b++;
      else return; // the cut would go through the piece
    }
    cands.push({ o, c, both: a > 0 && b > 0 });
  };
  for (const p of pins) {
    consider('H', p.y - k);
    consider('H', p.y + p.h);
    consider('V', p.x - k);
    consider('V', p.x + p.w);
  }
  // variant bit0: prefer vertical cuts first; bit1: prefer cutting from the far side first
  cands.sort((a, b) => {
    if (a.both !== b.both) return Number(b.both) - Number(a.both);
    const pa = (variant & 1 ? a.o === 'V' : a.o === 'H') ? 0 : 1;
    const pb = (variant & 1 ? b.o === 'V' : b.o === 'H') ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return variant & 2 ? b.c - a.c : a.c - b.c;
  });

  for (const cd of cands) {
    let first: FreeRect;
    let second: FreeRect;
    let pa: PinRect[];
    let pb: PinRect[];
    if (cd.o === 'H') {
      first = { x: region.x, y: region.y, w: region.w, h: cd.c - region.y, depth: region.depth + 1 };
      second = { x: region.x, y: cd.c + k, w: region.w, h: rBottom - (cd.c + k), depth: region.depth + 1 };
      pa = pins.filter((p) => p.y + p.h <= cd.c);
      pb = pins.filter((p) => p.y >= cd.c + k);
    } else {
      first = { x: region.x, y: region.y, w: cd.c - region.x, h: region.h, depth: region.depth + 1 };
      second = { x: cd.c + k, y: region.y, w: rRight - (cd.c + k), h: region.h, depth: region.depth + 1 };
      pa = pins.filter((p) => p.x + p.w <= cd.c);
      pb = pins.filter((p) => p.x >= cd.c + k);
    }
    if ((pa.length && (first.w <= 0 || first.h <= 0)) || (pb.length && (second.w <= 0 || second.h <= 0))) continue;
    const ra = partition(first, pa, k, budget, variant);
    if (!ra) continue;
    const rb = partition(second, pb, k, budget, variant);
    if (!rb) continue;
    const cut: CutInt =
      cd.o === 'H'
        ? { orientation: 'H', x: region.x, y: cd.c, length: region.w, depth: region.depth }
        : { orientation: 'V', x: cd.c, y: region.y, length: region.h, depth: region.depth };
    return {
      placed: [...ra.placed, ...rb.placed],
      cuts: [cut, ...ra.cuts, ...rb.cuts],
      free: [...ra.free, ...rb.free],
    };
  }
  return null;
}
