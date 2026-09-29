/** Turns the public EngineInput into an integer working context. */
import type { EngineInput, GrainMode, Priority } from './types.ts';
import { allowedOrientations, toInt } from './geometry.ts';
import type { Orient } from './geometry.ts';
import { PIN_VARIANTS, partition } from './guillotine.ts';
import type { PartRes, PinRect, SplitRule } from './guillotine.ts';

export interface Item {
  key: number;
  pieceId: string;
  instance: number;
  label: string;
  /** unrotated size (ints) */
  w: number;
  h: number;
  area: number;
  orients: Orient[];
  grain: GrainMode;
}

export interface StockT {
  index: number;
  id: string;
  label: string;
  W: number;
  H: number;
  qty: number;
  area: number;
}

export interface PinSheet {
  slot: number;
  stockIndex: number;
  /** alternative guillotine partitions around the fixed pieces (index 0 always exists) */
  parts: PartRes[];
}

export interface Ctx {
  items: Item[];
  /** keys of items that still have to be placed by the packer (not pinned) */
  freeKeys: number[];
  stock: StockT[];
  kerf: number;
  priority: Priority;
  minOffcut: number;
  /** 1 = single sheet mode, Infinity otherwise */
  maxSheets: number;
  considerGrain: boolean;
  pinSheets: PinSheet[];
  warnings: string[];
  totalArea: number;
  lenScale: number;
  /** when set, the optimizer must use exactly this split rule instead of searching all of them
   *  (comes from settings.cutDirection — 'width' -> 'H', 'length' -> 'V') */
  forcedSplit: SplitRule | null;
}

const name = (it: Item): string => it.label || `${it.w / 100}×${it.h / 100}`;

export function prepare(input: EngineInput): Ctx {
  const warnings: string[] = [];
  const o = input.options;
  const kerf = Math.max(0, toInt(o.kerf || 0));

  const stock: StockT[] = [];
  for (const s of input.stock) {
    if (!s.enabled) continue;
    const qty = Math.floor(s.qty);
    const W = toInt(s.width);
    const H = toInt(s.height);
    if (!(qty >= 1) || W <= 0 || H <= 0) continue;
    stock.push({ index: stock.length, id: s.id, label: s.label, W, H, qty, area: W * H });
  }

  const forcedMap = new Map<string, boolean>();
  for (const f of input.forced ?? []) forcedMap.set(`${f.pieceId}#${f.instance}`, f.rotated);

  const items: Item[] = [];
  const index = new Map<string, number>();
  for (const p of input.pieces) {
    if (!p.enabled) continue;
    const qty = Math.floor(p.qty);
    const w = toInt(p.width);
    const h = toInt(p.height);
    if (!(qty >= 1) || w <= 0 || h <= 0) continue;
    for (let i = 1; i <= qty; i++) {
      let orients = allowedOrientations(w, h, p.grain, o.considerGrain);
      const f = forcedMap.get(`${p.id}#${i}`);
      if (f !== undefined && w !== h) {
        orients = [f ? { w: h, h: w, rotated: true } : { w, h, rotated: false }];
      }
      const key = items.length;
      items.push({ key, pieceId: p.id, instance: i, label: p.label, w, h, area: w * h, orients, grain: p.grain });
      index.set(`${p.id}#${i}`, key);
    }
  }

  /* ---------------- pins ---------------- */
  const claimed = new Set<number>();
  const bySlot = new Map<number, { stockIndex: number; pins: PinRect[] }>();
  for (const pin of input.pins ?? []) {
    let key: number | undefined;
    if (pin.instance && pin.instance >= 1) key = index.get(`${pin.pieceId}#${pin.instance}`);
    else {
      for (let i = 1; ; i++) {
        const k = index.get(`${pin.pieceId}#${i}`);
        if (k === undefined) break;
        if (!claimed.has(k)) {
          key = k;
          break;
        }
      }
    }
    if (key === undefined || claimed.has(key)) {
      warnings.push('یکی از قطعات قفل‌شده دیگر در پروژه وجود ندارد و نادیده گرفته شد');
      continue;
    }
    const it = items[key];
    const si = stock.findIndex((s) => s.id === pin.stockId);
    const w = toInt(pin.w);
    const h = toInt(pin.h);
    const x = toInt(pin.x);
    const y = toInt(pin.y);
    const ew = pin.rotated ? it.h : it.w;
    const eh = pin.rotated ? it.w : it.h;
    if (si < 0 || Math.abs(ew - w) > 1 || Math.abs(eh - h) > 1) {
      warnings.push(`قفل قطعهٔ «${name(it)}» اعمال نشد (ابعاد یا ورق تغییر کرده است)`);
      continue;
    }
    const S = stock[si];
    if (x < 0 || y < 0 || x + ew > S.W || y + eh > S.H) {
      warnings.push(`قفل قطعهٔ «${name(it)}» اعمال نشد (خارج از ورق)`);
      continue;
    }
    let g = bySlot.get(pin.slot);
    if (!g) {
      g = { stockIndex: si, pins: [] };
      bySlot.set(pin.slot, g);
    }
    if (g.stockIndex !== si) {
      warnings.push(`قفل قطعهٔ «${name(it)}» اعمال نشد (ورق نامتناسب)`);
      continue;
    }
    claimed.add(key);
    g.pins.push({ itemKey: key, x, y, w: ew, h: eh, rotated: pin.rotated });
  }

  let slots = [...bySlot.keys()].sort((a, b) => a - b);
  if (o.singleSheet && slots.length > 1) {
    warnings.push('در حالت «تنها یک ورق» فقط قطعات قفل‌شدهٔ یک ورق نگه داشته می‌شوند');
    for (const s of slots.slice(1)) for (const p of bySlot.get(s)!.pins) claimed.delete(p.itemKey);
    slots = slots.slice(0, 1);
  }

  const usedStock = new Array<number>(stock.length).fill(0);
  const pinSheets: PinSheet[] = [];
  for (const slot of slots) {
    const g = bySlot.get(slot)!;
    if (usedStock[g.stockIndex] >= stock[g.stockIndex].qty) {
      warnings.push('موجودی ورق برای نگه داشتن قطعات قفل‌شده کافی نیست');
      for (const p of g.pins) claimed.delete(p.itemKey);
      continue;
    }
    const S = stock[g.stockIndex];
    const region = { x: 0, y: 0, w: S.W, h: S.H, depth: 0 };
    const pins = g.pins.slice();
    let part = partition(region, pins, kerf);
    while (!part && pins.length) {
      const dropped = pins.pop()!;
      claimed.delete(dropped.itemKey);
      warnings.push(`قفل قطعهٔ «${name(items[dropped.itemKey])}» ممکن نبود (تداخل یا برش گیوتینی ناممکن)`);
      part = partition(region, pins, kerf);
    }
    if (!part || pins.length === 0) continue;
    const parts: PartRes[] = [part];
    for (let v = 1; v < PIN_VARIANTS; v++) {
      const alt = partition(region, pins, kerf, { n: 4000 }, v);
      if (alt) parts.push(alt);
    }
    usedStock[g.stockIndex]++;
    pinSheets.push({ slot, stockIndex: g.stockIndex, parts });
  }

  const freeKeys: number[] = [];
  let totalArea = 0;
  let lenScale = 0;
  for (const it of items) {
    totalArea += it.area;
    lenScale += it.w + it.h;
    if (!claimed.has(it.key)) freeKeys.push(it.key);
  }

  return {
    items,
    freeKeys,
    stock,
    kerf,
    priority: o.priority,
    minOffcut: Math.max(0, toInt(o.minOffcut ?? 0)),
    maxSheets: o.singleSheet ? 1 : Number.POSITIVE_INFINITY,
    considerGrain: o.considerGrain,
    pinSheets,
    warnings,
    totalArea: totalArea || 1,
    lenScale: lenScale || 1,
    forcedSplit: o.cutDirection === 'width' ? 'H' : o.cutDirection === 'length' ? 'V' : null,
  };
}
