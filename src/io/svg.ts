/**
 * Cut-map renderer. Pure function: SheetResult (real engine output) -> SVG string.
 * Used by the interactive map, the PDF report and the PNG/JPG export, so what you see
 * is always exactly what the engine computed.
 */
import type { SheetResult } from '../engine/index.ts';
import type { Unit } from '../domain/model.ts';
import { UNIT_MM } from '../domain/model.ts';
import { fmt } from './numbers.ts';

export interface RenderOpts {
  unit: string;
  colorOf: (pieceId: string) => string;
  labelOf: (pieceId: string) => string;
  numOf: (pieceId: string) => number;
  showLabels: boolean;
  detailed: boolean;
  showCuts: boolean;
  kerf: number;
  selected?: string | null;
  ghost?: { key: string; x: number; y: number; ok: boolean } | null;
  view?: [number, number, number, number] | null;
  background?: string | null;
  idPrefix?: string;
  fontScale?: number;
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const FONT = "Vazirmatn, Tahoma, 'Segoe UI', sans-serif";
const INK = '#0f172a';
const MUTED = '#64748b';

/** base drawing unit – all font sizes and strokes scale with the sheet */
export const baseUnit = (sh: SheetResult): number => Math.max(sh.width, sh.height) / 50;

export function sheetBounds(sh: SheetResult): [number, number, number, number] {
  const u = baseUnit(sh);
  const m = u * 5.2;
  return [-m, -m, sh.width + m + u * 1.6, sh.height + m + u * 1.6];
}

const estW = (t: string, fs: number): number => t.length * fs * 0.6;

/** Below this real-world thickness (mm) a waste strip is hard to see/click on screen, so a
 *  highlight marker is drawn for it at this display size — purely a visual exaggeration. It
 *  never touches the engine's actual geometry: cutting math, areas and the printed `w`/`h`
 *  labels all keep using the real value; only the highlight overlay is stretched. */
const MIN_VISUAL_WASTE_MM = 10;

interface VisualRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** true if either dimension had to be visually stretched, i.e. this waste piece is thinner
   *  than MIN_VISUAL_WASTE_MM in real life and needs the "don't miss me" marker */
  small: boolean;
}

/** Real waste rect -> display rect. Grows any dimension under the visual minimum, expanding
 *  around the same centre, then clamps back inside the sheet so the enlarged strip never spills
 *  outside the sheet border (it only ever eats into the neighbouring piece, which is redrawn on
 *  top of it anyway). */
function visualWasteRect(
  f: { x: number; y: number; w: number; h: number },
  mmPerUnit: number,
  sheetW: number,
  sheetH: number,
): VisualRect {
  const visMin = MIN_VISUAL_WASTE_MM / mmPerUnit;
  const smallW = f.w < visMin;
  const smallH = f.h < visMin;
  const w = smallW ? visMin : f.w;
  const h = smallH ? visMin : f.h;
  const clamp = (v: number, size: number, max: number): number => {
    if (v < 0) return 0;
    if (v + size > max) return Math.max(0, max - size);
    return v;
  };
  return {
    x: clamp(f.x - (w - f.w) / 2, w, sheetW),
    y: clamp(f.y - (h - f.h) / 2, h, sheetH),
    w,
    h,
    small: smallW || smallH,
  };
}

interface Line {
  t: string;
  fs: number;
  bold?: boolean;
  fill?: string;
}

/** "W × H" as a single line normally reads fine, but at a large font scale squeezing it into a
 *  narrow box collapses the spacing around "×" until it's unreadable. Once the combined text
 *  would no longer fit at a legible size, split it into two stacked lines (W, then H) instead
 *  of shrinking it further. */
function dimsLines(w: string, h: string, fs: number, maxW: number, bold: boolean): Line[] {
  const combined = `${w} × ${h}`;
  if (estW(combined, fs) <= maxW) return [{ t: combined, fs, bold }];
  return [
    { t: w, fs, bold },
    { t: h, fs, bold },
  ];
}

function stack(cx: number, cy: number, lines: Line[], maxW: number, maxH: number, minFs: number): string {
  const fitted: Line[] = [];
  for (const l of lines) {
    const fs = Math.min(l.fs, maxW / Math.max(1, l.t.length * 0.6));
    if (fs >= minFs) fitted.push({ ...l, fs });
  }
  const height = (arr: Line[]): number => arr.reduce((a, l) => a + l.fs * 1.3, 0);
  while (fitted.length > 1 && height(fitted) > maxH) fitted.pop();
  if (!fitted.length || height(fitted) > maxH * 1.05) return '';
  let y = cy - height(fitted) / 2;
  let out = '';
  for (const l of fitted) {
    const yy = y + l.fs * 0.65;
    out += `<text x="${cx}" y="${yy}" font-size="${l.fs}" text-anchor="middle" dy=".05em" style="unicode-bidi:plaintext" fill="${l.fill ?? INK}"${l.bold ? ' font-weight="700"' : ''}>${esc(l.t)}</text>`;
    y += l.fs * 1.3;
  }
  return out;
}

function dimH(x1: number, x2: number, y: number, text: string, u: number, fs: number): string {
  const t = u * 0.28;
  const sw = u * 0.08;
  return (
    `<g stroke="${MUTED}" stroke-width="${sw}" fill="none"><path d="M${x1} ${y}H${x2}M${x1} ${y - t}V${y + t}M${x2} ${y - t}V${y + t}"/></g>` +
    `<text x="${(x1 + x2) / 2}" y="${y - u * 0.35}" font-size="${fs}" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="${u * 0.22}" paint-order="stroke" font-weight="600">${esc(text)}</text>`
  );
}

function dimV(y1: number, y2: number, x: number, text: string, u: number, fs: number): string {
  const t = u * 0.28;
  const sw = u * 0.08;
  const cy = (y1 + y2) / 2;
  const tx = x - u * 0.35;
  return (
    `<g stroke="${MUTED}" stroke-width="${sw}" fill="none"><path d="M${x} ${y1}V${y2}M${x - t} ${y1}H${x + t}M${x - t} ${y2}H${x + t}"/></g>` +
    `<text transform="rotate(-90 ${tx} ${cy})" x="${tx}" y="${cy}" font-size="${fs}" text-anchor="middle" fill="${INK}" stroke="#fff" stroke-width="${u * 0.22}" paint-order="stroke" font-weight="600">${esc(text)}</text>`
  );
}

export function renderSheetInner(sh: SheetResult, o: RenderOpts): string {
  const u = baseUnit(sh);
  const pre = o.idPrefix ?? 's';
  const sw = u * 0.1;
  const F = o.fontScale ?? 1;
  const fsDim = u * 1.1 * F;
  // the hatch used to be sized off `u` (the sheet's own scale ÷ 50), which made its tile as
  // large as ~6cm on a typical sheet — far too coarse to show inside a thin, half-centimetre
  // offcut (it would just look like a blank rectangle). Instead, size it off a fixed real-world
  // spacing (independent of the sheet's overall size or the project's display unit) so several
  // hatch lines always fit inside even a very thin waste strip.
  const mmPerUnit = UNIT_MM[o.unit as Unit] ?? 10;
  const hatchStep = 2.2 / mmPerUnit;
  let s = '';

  s += `<defs><pattern id="${pre}-hatch" width="${hatchStep}" height="${hatchStep}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${hatchStep}" stroke="#a5b4c3" stroke-width="${hatchStep * 0.18}"/></pattern></defs>`;
  const WASTE_INK = '#b45309';

  // sheet + waste hatch (everything that is not covered by a piece is waste)
  s += `<rect x="0" y="0" width="${sh.width}" height="${sh.height}" fill="#e9f3f7"/>`;
  s += `<rect x="0" y="0" width="${sh.width}" height="${sh.height}" fill="url(#${pre}-hatch)"/>`;

  // a light, neutral hatch under every waste rectangle — not just in detailed mode — so even a
  // 5mm/10mm sliver of waste reads as its own distinct shape against the sheet's own hatch and
  // against the neighbouring pieces, instead of blending into the background. White (not a
  // colour tint) so it reads as "no material here" rather than looking like a coloured piece.
  // This layer stays at the REAL size (click targets / base look unchanged) — the enlarged
  // "don't miss me" version of thin strips is drawn later, on top of the pieces (see below),
  // since drawing it here would just get painted over by the neighbouring piece right after.
  const wasteVis = sh.freeRects.map((f) => visualWasteRect(f, mmPerUnit, sh.width, sh.height));
  sh.freeRects.forEach((f, i) => {
    s += `<rect data-k="free#${i}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="#fff" stroke="${MUTED}" stroke-opacity=".55" stroke-width="${sw * 0.7}" stroke-dasharray="${u * 0.5} ${u * 0.4}"/>`;
    s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="url(#${pre}-hatch)" pointer-events="none"/>`;
  });

  // pieces
  for (const p of sh.placements) {
    const key = `${p.pieceId}#${p.instance}`;
    const ghosting = o.ghost && o.ghost.key === key;
    const label = o.showLabels ? o.labelOf(p.pieceId) : '';
    const fsP = Math.max(u * 0.68, Math.min(u * 1.35, Math.min(p.w, p.h) * 0.155)) * F;
    const fsE = Math.min(fsP * 0.9, u * 1.0 * F);
    let inner = '';
    let lines: Line[];
    const edgeOk = o.detailed && p.w >= estW(fmt(p.w), fsE) * 1.7 && p.h >= estW(fmt(p.h), fsE) * 1.7 + fsE * 4;
    if (edgeOk) {
      inner += `<text x="${p.x + p.w / 2}" y="${p.y + fsE * 1.15}" font-size="${fsE}" text-anchor="middle" fill="${INK}">${fmt(p.w)}</text>`;
      const vx = p.x + fsE * 1.15;
      const vy = p.y + p.h / 2;
      inner += `<text transform="rotate(-90 ${vx} ${vy})" x="${vx}" y="${vy}" font-size="${fsE}" text-anchor="middle" fill="${INK}">${fmt(p.h)}</text>`;
      // only a custom label goes in the middle here — no auto "n-n" id
      lines = label ? [{ t: label, fs: fsP, bold: true }] : [];
    } else {
      lines = o.detailed ? dimsLines(fmt(p.w), fmt(p.h), fsP, p.w * 0.86, true) : [];
      if (label) lines.push({ t: label, fs: o.detailed ? fsP * 0.95 : fsP, bold: !o.detailed });
    }
    inner += stack(p.x + p.w / 2, p.y + p.h / 2, lines, p.w * 0.86, p.h * (edgeOk ? 0.6 : 0.82), u * 0.5);
    if (p.pinned) {
      const k = Math.min(u * 0.16, p.w / 60, p.h / 60);
      const lx = p.x + p.w - u * 1.2;
      const ly = p.y + u * 1.4;
      if (p.w > u * 4 && p.h > u * 4) {
        inner += `<g transform="translate(${lx} ${ly}) scale(${k * 1.4})" fill="#7c2d12" stroke="#7c2d12"><rect x="-4" y="-1" width="8" height="6.5" rx="1" stroke="none"/><path d="M-2.4 -1V-3a2.4 2.4 0 0 1 4.8 0V-1" fill="none" stroke-width="1.2"/></g>`;
      }
    }
    s += `<g data-k="${esc(key)}" style="cursor:pointer" opacity="${ghosting ? 0.3 : 1}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${o.colorOf(p.pieceId)}" stroke="#334155" stroke-width="${sw}"/>${inner}</g>`;
  }

  // "don't miss me" highlight for waste strips thinner than MIN_VISUAL_WASTE_MM: drawn AFTER
  // the pieces (not with the base waste layer above) specifically so it always ends up on top
  // — a thin sliver is usually sandwiched right against a piece, so drawing the enlarged
  // version underneath just gets painted over and looks identical to the real tiny strip.
  // Low fill opacity keeps whatever's underneath (piece or sheet) still legible through it.
  wasteVis.forEach((v) => {
    if (!v.small) return;
    s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${WASTE_INK}" fill-opacity="0.16" stroke="${WASTE_INK}" stroke-width="${sw}" stroke-dasharray="${u * 0.3} ${u * 0.22}" pointer-events="none"/>`;
    const r = Math.min(u * 0.42, Math.min(v.w, v.h) * 0.22);
    s += `<circle cx="${v.x + v.w / 2}" cy="${v.y + v.h / 2}" r="${r}" fill="${WASTE_INK}" fill-opacity="0.9" stroke="#fff" stroke-width="${u * 0.08}" pointer-events="none"/>`;
  });

  // cut lines
  if (o.showCuts) {
    const t = Math.max(o.kerf, u * 0.14);
    for (const c of sh.cuts) {
      let x1 = c.x;
      let y1 = c.y;
      let x2 = c.x;
      let y2 = c.y;
      if (c.orientation === 'H') {
        y1 = y2 = c.y + o.kerf / 2;
        x2 = c.x + c.length;
      } else {
        x1 = x2 = c.x + o.kerf / 2;
        y2 = c.y + c.length;
      }
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#64748b" stroke-width="${t}" stroke-dasharray="${u * 0.7} ${u * 0.45}" pointer-events="none"/>`;
      const bx = c.orientation === 'H' ? x1 + u * 1.15 : x1;
      const by = c.orientation === 'H' ? y1 : y1 + u * 1.15;
      s += `<circle cx="${bx}" cy="${by}" r="${u * 0.95}" fill="${INK}" stroke="#fff" stroke-width="${u * 0.16}" pointer-events="none"/><text x="${bx}" y="${by}" dy=".36em" font-size="${u * 1.1}" text-anchor="middle" fill="#fff" font-weight="800" pointer-events="none">${c.order}</text>`;
    }
  }

  // selection is used only for the dimension callouts below. The selected piece itself
  // keeps its normal rendering; the corresponding row in the dimensions table is highlighted.
  let selRect: { x: number; y: number; w: number; h: number } | null = null;
  if (o.selected) {
    selRect = o.selected.startsWith('free#') ? sh.freeRects[Number(o.selected.slice(5))] ?? null : sh.placements.find((q) => `${q.pieceId}#${q.instance}` === o.selected) ?? null;
  }

  // ghost while moving
  if (o.ghost) {
    const p = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === o.ghost!.key);
    if (p) {
      const col = o.ghost.ok ? '#2f9e44' : '#e03131';
      s += `<rect x="${o.ghost.x}" y="${o.ghost.y}" width="${p.w}" height="${p.h}" fill="${col}" fill-opacity=".28" stroke="${col}" stroke-width="${u * 0.28}" stroke-dasharray="${u * 0.8} ${u * 0.5}" pointer-events="none"/>`;
    }
  }

  // sheet border
  s += `<rect x="0" y="0" width="${sh.width}" height="${sh.height}" fill="none" stroke="${INK}" stroke-width="${u * 0.035}" pointer-events="none"/>`;

  // dimension lines: selected item's own size, or (nothing selected) the sheet size.
  // the selected item's lines are drawn outside the sheet (same margin used for the overall
  // sheet dimensions below) with dashed extension lines running out from its edges, so they
  // never sit on top of the piece or its neighbours.
  if (selRect) {
    const p = selRect;
    const extSw = u * 0.06;
    const topY = -u * 3.3;
    const leftX = -u * 3.3;
    s += `<g stroke="${MUTED}" stroke-width="${extSw}" stroke-dasharray="${u * 0.5} ${u * 0.35}" pointer-events="none"><path d="M${p.x} ${p.y}V${topY}M${p.x + p.w} ${p.y}V${topY}"/></g>`;
    s += dimH(p.x, p.x + p.w, topY, fmt(p.w), u, fsDim);
    s += `<g stroke="${MUTED}" stroke-width="${extSw}" stroke-dasharray="${u * 0.5} ${u * 0.35}" pointer-events="none"><path d="M${p.x} ${p.y}H${leftX}M${p.x} ${p.y + p.h}H${leftX}"/></g>`;
    s += dimV(p.y, p.y + p.h, leftX, fmt(p.h), u, fsDim);
  } else {
    s += dimH(0, sh.width, -u * 3.3, fmt(sh.width), u, fsDim * 1.1);
    s += dimV(0, sh.height, -u * 3.3, fmt(sh.height), u, fsDim * 1.1);
    if (o.detailed) {
      const top = sh.placements.filter((p) => p.y < 1e-9).sort((a, b) => a.x - b.x);
      for (const p of top) s += dimH(p.x, p.x + p.w, -u * 1.15, fmt(p.w), u, fsDim * 0.9);
      const left = sh.placements.filter((p) => p.x < 1e-9).sort((a, b) => a.y - b.y);
      for (const p of left) s += dimV(p.y, p.y + p.h, -u * 1.15, fmt(p.h), u, fsDim * 0.9);
    }
  }

  // waste dimension labels are the very last thing drawn — after the sheet border and the
  // overall/edge dimension lines above — so they always sit on top of every other line
  // (including the sheet's own border) and are never buried underneath it
  // labels sit inside the (possibly enlarged) display rect so they have room to breathe even on
  // a real 5mm sliver — but the text itself always prints the true real-world value from `f`,
  // never the enlarged `v.w`/`v.h` used only for drawing.
  sh.freeRects.forEach((f, i) => {
    const v = wasteVis[i];
    const fFs = Math.max(1, fsDim - 1.6);
    const halo = fFs * 0.22;
    const wx = v.x + v.w / 2;
    const wy = v.y + fFs * 1.05;
    s += `<text x="${wx}" y="${wy}" font-size="${fFs}" text-anchor="middle" dy=".05em" font-weight="700" fill="${WASTE_INK}" stroke="#fff" stroke-width="${halo}" paint-order="stroke" pointer-events="none" style="unicode-bidi:plaintext">${fmt(f.w)}</text>`;
    const hx = v.x + fFs * 1.05;
    const hy = v.y + v.h / 2;
    s += `<text transform="rotate(-90 ${hx} ${hy})" x="${hx}" y="${hy}" font-size="${fFs}" text-anchor="middle" dy=".05em" font-weight="700" fill="${WASTE_INK}" stroke="#fff" stroke-width="${halo}" paint-order="stroke" pointer-events="none" style="unicode-bidi:plaintext">${fmt(f.h)}</text>`;
  });
  return s;
}

export function renderSheetSvg(sh: SheetResult, o: RenderOpts): string {
  const vb = o.view ?? sheetBounds(sh);
  const bg = o.background ? `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${o.background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" preserveAspectRatio="xMinYMid meet" direction="ltr" font-family="${FONT}" style="display:block;width:100%;height:100%;user-select:none">${bg}${renderSheetInner(sh, o)}</svg>`;
}
