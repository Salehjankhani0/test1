import { Fragment, useState } from 'react';
import type { Solution } from '../engine/index.ts';
import { sheetGroups } from '../engine/index.ts';
import { fmt, fmtPct } from '../io/numbers.ts';
import { PRIORITY_LABELS, areaToM2 } from '../domain/model.ts';
import type { Unit } from '../domain/model.ts';
import { Icon } from './Icon.tsx';

/** collapsible header used by simple (single-zone) stat cards */
export function StatHeader(props: { title: string; danger?: boolean; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={'stat-h' + (props.danger ? ' danger' : '') + (props.open ? ' open' : '')} onClick={props.onToggle} aria-expanded={props.open}>
      <h2>{props.title}</h2>
      <span className="chev">
        <Icon name="chevron" size={18} />
      </span>
    </button>
  );
}

/** one label/value row inside a stat card */
export function StatRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat-row">
      <span className="k">{k}</span>
      <span className="v num">{v}</span>
    </div>
  );
}

export function GlobalStats({ sol, unit }: { sol: Solution; unit: Unit }) {
  const [open, setOpen] = useState(true);
  const st = sol.stats;
  return (
    <section className="card">
      <StatHeader title="آمار کلی" open={open} onToggle={() => setOpen((v) => !v)} />
      {open ? (
        <div className="stat-table">
          <StatRow
            k="ورق‌های مورد استفاده"
            v={st.sheetsByStock.length ? st.sheetsByStock.map((u) => `${fmt(u.width)}×${fmt(u.height)} x${u.count}`).join('، ') : '–'}
          />
          <StatRow k="منطقهٔ مورد استفاده از کل" v={`${fmt(areaToM2(st.usedArea, unit), 2, true)} m² / ${fmtPct(st.utilization)}`} />
          <StatRow k="کل منطقهٔ هدررفته" v={`${fmt(areaToM2(st.wasteArea, unit), 2, true)} m² / ${fmtPct(1 - st.utilization)}`} />
          <StatRow k="اولویت بهینه‌سازی" v={PRIORITY_LABELS[st.priority]} />
        </div>
      ) : null}
      {sol.warnings.length ? (
        <div className="warn-box soft">
          {sol.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** per-sheet stats — one card, paged through distinct sheets with a ‹ n/total › control in
 *  its own header (same sheet grouping the visual cut-map cards use) */
export function SheetStatsPager({ sol, unit }: { sol: Solution; unit: Unit }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const groups = sheetGroups(sol);
  if (!groups.length) return null;
  const cur = Math.min(page, groups.length - 1);
  const g = groups[cur];
  const sh = sol.sheets[g.index];
  const go = (delta: number): void => setPage((cur + delta + groups.length) % groups.length);
  return (
    <section className="card">
      <div className={'stat-h with-pager' + (open ? ' open' : '')}>
        <h2>آمار ورق</h2>
        {groups.length > 1 ? (
          <div className="stat-pager">
            <button type="button" className="pager-btn" onClick={() => go(-1)} aria-label="ورق قبلی">
              ‹
            </button>
            <span className="pager-n num">
              {cur + 1}/{groups.length}
            </span>
            <button type="button" className="pager-btn" onClick={() => go(1)} aria-label="ورق بعدی">
              ›
            </button>
          </div>
        ) : null}
        <button type="button" className="chev-btn" onClick={() => setOpen((v) => !v)} aria-label="بازوبسته کردن" aria-expanded={open}>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      {open ? (
        <div className="stat-table">
          <StatRow k="ورق سهام" v={`${fmt(sh.width)}×${fmt(sh.height)}${g.count > 1 ? ` x${g.count}` : ''}`} />
          <StatRow k="مساحت استفاده‌شده" v={`${fmt(areaToM2(sh.usedArea, unit), 2, true)} m² / ${fmtPct(sh.utilization)}`} />
          <StatRow k="مساحت تلف‌شده" v={`${fmt(areaToM2(sh.wasteArea, unit), 2, true)} m² / ${fmtPct(1 - sh.utilization)}`} />
          <StatRow k="برش‌ها" v={fmt(sh.cutCount, 0, true)} />
          <StatRow k="طول برش" v={`${fmt(sh.cutLength, 2, true)} ${unit}`} />
        </div>
      ) : null}
    </section>
  );
}

/** pieces that could not be placed — shown at the very end, grouped by size/label. All rows
 *  (including the column-title row) are direct children of one shared grid container, so every
 *  column lines up under the one above it instead of each row sizing its own columns. */
export function UnplacedList({ sol }: { sol: Solution; unit: Unit }) {
  const [open, setOpen] = useState(true);
  if (!sol.unplaced.length) return null;
  const g = new Map<string, { w: number; h: number; label: string; n: number }>();
  for (const u of sol.unplaced) {
    const k = `${u.width}x${u.height}|${u.label}`;
    const e = g.get(k);
    if (e) e.n++;
    else g.set(k, { w: u.width, h: u.height, label: u.label, n: 1 });
  }
  const rows = [...g.values()];
  return (
    <section className="card unplaced">
      <StatHeader title="ناتوان در تناسب" danger open={open} onToggle={() => setOpen((v) => !v)} />
      {open ? (
        <div className="unfit-grid">
          <span className="uf-h">صفحه</span>
          <span className="uf-h">برچسب</span>
          <span className="uf-h">تعداد</span>
          {rows.map((e, i) => (
            <Fragment key={i}>
              <span className={'num uf-size' + (i % 2 ? ' odd' : '')}>
                {fmt(e.w)} × {fmt(e.h)}
              </span>
              <span className={'uf-label' + (i % 2 ? ' odd' : '')}>{e.label || '–'}</span>
              <span className={'num uf-n' + (i % 2 ? ' odd' : '')}>{fmt(e.n, 0, true)}</span>
            </Fragment>
          ))}
        </div>
      ) : null}
    </section>
  );
}
