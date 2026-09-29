import { useEffect, useMemo, useRef, useState } from 'react';
import type { SheetResult, Solution } from '../engine/index.ts';
import { sheetGroups } from '../engine/index.ts';
import type { Project } from '../domain/model.ts';
import { renderOptsFor } from '../io/image.ts';
import { renderSheetSvg, sheetBounds } from '../io/svg.ts';
import { Icon } from './Icon.tsx';
import { fmt } from '../io/numbers.ts';

export const THEMES = 4;
/** re-exported so the sheet visuals (here) and the per-sheet stats pager page through the
 *  exact same list of distinct sheets */
export { sheetGroups };

export interface MapView {
  locked: boolean;
  zoom: number;
  fontScale: number;
  theme: number;
  rot: boolean;
}

interface Props {
  project: Project;
  solution: Solution;
  sheetIndex: number;
  /** 1-based position in the (waste-sorted) display list — used for the "ورق N" label so the
   *  numbering always matches what's on screen, regardless of the underlying engine order */
  position: number;
  count: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  showCuts: boolean;
  onToggleCuts: () => void;
  onMove: (si: number, key: string, x: number, y: number) => boolean;
  /** the toolbar (lock/zoom/font/theme/rotate) is a single shared control panel — only the
   *  first sheet renders it, but its settings apply to every sheet via `view` */
  view: MapView;
  showToolbar: boolean;
  resetToken: number;
  onToggleLocked: () => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFontUp: () => void;
  onFontDown: () => void;
  onCycleTheme: () => void;
  onToggleRot: () => void;
}

/** rotate the whole sheet 90° clockwise (view only) */
function rotateSheet(sh: SheetResult): SheetResult {
  const H = sh.height;
  return {
    ...sh,
    width: sh.height,
    height: sh.width,
    placements: sh.placements.map((p) => ({ ...p, x: H - p.y - p.h, y: p.x, w: p.h, h: p.w })),
    freeRects: sh.freeRects.map((r) => ({ x: H - r.y - r.h, y: r.x, w: r.h, h: r.w })),
    cuts: sh.cuts.map((c) =>
      c.orientation === 'H' ? { ...c, orientation: 'V' as const, x: H - c.y, y: c.x } : { ...c, orientation: 'H' as const, x: H - c.y - c.length, y: c.x },
    ),
  };
}

function themeColor(theme: number, i: number): string | null {
  const l = i % 2 ? 80 : 86;
  if (theme === 1) return `hsl(${205 + (i % 3) * 8} 65% ${l}%)`;
  if (theme === 2) return `hsl(${28 + (i * 23) % 40} 80% ${l}%)`;
  if (theme === 3) return `hsl(${(i * 61) % 360} 45% ${l - 4}%)`;
  return null;
}

export function CutMap(p: Props) {
  const si = p.sheetIndex;
  const orig = p.solution.sheets[si];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ key: string; startX: number; startY: number; ox: number; oy: number; dx: number; dy: number; moved: boolean } | null>(null);
  const panState = useRef<{ id: number; x: number; y: number } | null>(null);
  const { locked, zoom, fontScale, theme, rot } = p.view;

  const sh = useMemo(() => (orig ? (rot ? rotateSheet(orig) : orig) : null), [orig, rot]);
  const selKey = p.selected && p.selected.startsWith(si + '|') ? p.selected.slice(String(si).length + 1) : null;
  const select = (k: string | null): void => p.onSelect(k ? `${si}|${k}` : null);

  /* the shared toolbar's "fit" button (or a rotate, which changes the coordinate space)
   * bumps resetToken — every sheet's own pan snaps back to center together */
  useEffect(() => setPan({ x: 0, y: 0 }), [p.resetToken]);

  const base = useMemo(() => (sh ? sheetBounds(sh) : [0, 0, 1, 1]), [sh]);
  // Keep the sheet anchored to the left edge. Previously the viewBox was always centered;
  // when a stock dimension grew, the same cut layout appeared to jump toward the middle.
  // Horizontal zoom/pan is still available when the map is unlocked.
  const vb: [number, number, number, number] = [
    base[0] + pan.x,
    base[1] + base[3] / 2 - base[3] / 2 / zoom + pan.y,
    base[2] / zoom,
    base[3] / zoom,
  ];
  // the map's own aspect ratio always matches the (possibly rotated) sheet's real proportions,
  // instead of a fixed box — otherwise rotating a sheet whose proportions differ from that box
  // shows large empty margins / a squashed-looking layout
  const aspect = sh ? sh.width / sh.height : 4 / 3;

  const ghost = drag && drag.moved ? { key: drag.key, x: drag.ox + drag.dx, y: drag.oy + drag.dy, ok: true } : null;
  const svg = useMemo(() => {
    if (!sh) return '';
    const o = renderOptsFor(p.project, { selected: selKey, ghost, detailed: true, showCuts: p.showCuts, view: vb, fontScale, idPrefix: 'm' + si });
    const idx = o.numOf;
    o.colorOf = ((prev) => (id: string) => themeColor(theme, idx(id) - 1) ?? prev(id))(o.colorOf);
    return renderSheetSvg(sh, o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sh, p.project, selKey, ghost?.x, ghost?.y, p.showCuts, vb[0], vb[1], vb[2], vb[3], fontScale, theme]);

  const toUser = (clientX: number, clientY: number): { x: number; y: number } => {
    const el = wrapRef.current!.querySelector('svg') as SVGSVGElement;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const r = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };
  const findKeyAt = (target: EventTarget | null): string | null => {
    let el = target as HTMLElement | null;
    while (el && el !== wrapRef.current) {
      const k = el.getAttribute?.('data-k');
      if (k) return k;
      el = el.parentElement;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!sh) return;
    const key = findKeyAt(e.target);
    if (key) {
      const piece = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === key);
      const pos = piece ?? sh.freeRects[Number(key.slice(5))];
      if (!pos) return;
      if (!locked && piece) (e.target as Element).setPointerCapture(e.pointerId);
      const u = toUser(e.clientX, e.clientY);
      setDrag({ key, startX: u.x, startY: u.y, ox: pos.x, oy: pos.y, dx: 0, dy: 0, moved: false });
    } else if (!locked) {
      panState.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (locked || !sh) return;
    if (drag) {
      if (drag.key.startsWith('free#')) return;
      const u = toUser(e.clientX, e.clientY);
      const dx = u.x - drag.startX;
      const dy = u.y - drag.startY;
      if (Math.hypot(dx, dy) > Math.max(sh.width, sh.height) / 250) setDrag({ ...drag, dx, dy, moved: true });
    } else if (panState.current && panState.current.id === e.pointerId) {
      const rect = (wrapRef.current!.querySelector('svg') as SVGSVGElement).getBoundingClientRect();
      const sx = (vb[2] / rect.width) * (panState.current.x - e.clientX);
      const sy = (vb[3] / rect.height) * (panState.current.y - e.clientY);
      panState.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      setPan((pr) => ({ x: pr.x + sx, y: pr.y + sy }));
    }
  };
  const onPointerUp = (): void => {
    if (drag && sh) {
      if (drag.moved && !locked) {
        const piece = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === drag.key)!;
        const nx = drag.ox + drag.dx;
        const ny = drag.oy + drag.dy;
        // map back to the original (un-rotated) coordinates
        const ok = rot ? p.onMove(si, drag.key, ny, sh.width - nx - piece.w) : p.onMove(si, drag.key, nx, ny);
        if (ok) select(drag.key);
      } else if (!drag.moved) {
        select(selKey === drag.key ? null : drag.key);
      }
      setDrag(null);
    }
    panState.current = null;
  };
  const onWheel = (e: React.WheelEvent): void => {
    if (locked) return;
    if (e.deltaY < 0) p.onZoomIn();
    else p.onZoomOut();
  };

  if (!sh || !orig) return null;
  const stockLabel = p.project.stock.find((x) => x.id === orig.stockId)?.label?.trim() ?? '';
  const btn = (icon: string, title: string, onClick: () => void, on = false) => (
    <button key={icon + title} className={'tool' + (on ? ' on' : '')} onClick={onClick} aria-label={title} title={title}>
      <Icon name={icon} size={18} />
    </button>
  );

  return (
    <section className="card map-card">
      <div className="card-h">
        <h2>
          ورق {p.position}
          {p.count > 1 ? <span className="mult num">×{p.count}</span> : null}
          <small className="num"> {fmt(orig.width)}×{fmt(orig.height)}</small>
          {stockLabel ? <span className="stock-label">{stockLabel}</span> : null}
        </h2>
      </div>
      {p.showToolbar ? (
        <div className="map-toolbar" dir="ltr">
          {btn(locked ? 'lock' : 'unlock', locked ? 'قفل فعال: نقشه ثابت است' : 'قفل غیرفعال: جابه‌جایی نقشه و قطعات', p.onToggleLocked, locked)}
          {btn('fit', 'برگشت به مرکز و اندازهٔ کامل', p.onResetView)}
          {btn('zoomIn', 'بزرگ‌نمایی تصویر', p.onZoomIn)}
          {btn('zoomOut', 'کوچک‌نمایی تصویر', p.onZoomOut)}
          {btn('fontUp', 'بزرگ‌کردن فونت', p.onFontUp)}
          {btn('fontDown', 'کوچک‌کردن فونت', p.onFontDown)}
          {btn('palette', 'تغییر رنگ قطعات', p.onCycleTheme)}
          {btn('order', 'ترتیب برش', p.onToggleCuts, p.showCuts)}
          {btn('rotSheet', 'چرخش ورق ۹۰ درجه', p.onToggleRot, rot)}
        </div>
      ) : null}
      <div
        className={'map-wrap' + (locked ? ' locked' : '')}
        style={{ aspectRatio: aspect }}
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </section>
  );
}
