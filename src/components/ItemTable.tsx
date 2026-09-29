import { useEffect, useRef, useState } from 'react';
import type { GrainMode } from '../engine/index.ts';
import { Icon } from './Icon.tsx';
import { Menu } from './ui.tsx';
import type { MenuItem } from './ui.tsx';
import { fmt, parseNum } from '../io/numbers.ts';

export interface Row {
  id: string;
  width: number;
  height: number;
  qty: number;
  label: string;
  enabled: boolean;
  grain?: GrainMode;
}

interface Props {
  title: string;
  kind: string;
  rows: Row[];
  colorOf?: (i: number) => string;
  showGrain: boolean;
  showLabel: boolean;
  emptyText: string;
  menu: MenuItem[];
  onAddBlank: () => void;
  onChange: (id: string, data: Partial<Row>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onSwap: (id: string) => void;
  onSwapAll: () => void;
  onGrain: (id: string) => void;
  selectedId?: string | null;
  defaultOpen?: boolean;
}

const GRAIN_NAME: Record<GrainMode, string> = { free: 'آزاد', vertical: 'عمودی', horizontal: 'افقی' };

/** editable cell: keeps its own text while typing, commits valid numbers immediately */
function Cell(props: { value: string; numeric: boolean; cell: string; placeholder?: string; onCommit: (t: string) => void; onEnter: () => void }) {
  const [text, setText] = useState(props.value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(props.value);
  }, [props.value]);
  return (
    <input
      className="cell"
      data-cell={props.cell}
      inputMode={props.numeric ? 'decimal' : 'text'}
      enterKeyHint="next"
      placeholder={props.placeholder}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(props.value);
      }}
      onChange={(e) => {
        setText(e.target.value);
        props.onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          props.onEnter();
        }
      }}
    />
  );
}

export function ItemTable(p: Props) {
  const [open, setOpen] = useState(p.defaultOpen ?? true);
  const COLS = p.showLabel ? (['w', 'h', 'q', 'l'] as const) : (['w', 'h', 'q'] as const);
  const total = p.rows.reduce((a, r) => a + (r.enabled && r.width > 0 && r.height > 0 ? Math.max(0, r.qty) : 0), 0);
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);
  const focus = (cell: string): boolean => {
    const el = root.current?.querySelector<HTMLInputElement>(`[data-cell="${cell}"]`);
    if (el) el.focus();
    return !!el;
  };
  useEffect(() => {
    if (pending.current && focus(pending.current)) pending.current = null;
  }, [p.rows.length]);
  const next = (i: number, c: number): void => {
    if (c < COLS.length - 1) focus(`${i}-${COLS[c + 1]}`);
    else if (i < p.rows.length - 1) focus(`${i + 1}-w`);
    else {
      pending.current = `${p.rows.length}-w`;
      p.onAddBlank();
    }
  };
  const add = (): void => {
    pending.current = `${p.rows.length}-w`;
    p.onAddBlank();
  };
  return (
    <section className={'card items' + (open ? '' : ' collapsed')} ref={root}>
      <div className="card-h">
        <button className="collapse-title" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`item-table-${p.kind}`}>
          <span className={'collapse-chevron' + (open ? ' open' : '')} aria-hidden="true"><Icon name="chevron" size={18} /></span>
          <h2>
            {p.title}
            <span className="count">{total}</span>
          </h2>
        </button>
        <div className="card-actions">
          <button className="btn btn-soft" onClick={add}>
            <Icon name="plus" size={18} />
            افزودن
          </button>
          <Menu icon="dots" label={`منوی ${p.title}`} items={p.menu} />
        </div>
      </div>
      {open ? <div id={`item-table-${p.kind}`} className="collapse-body">
      {p.rows.length === 0 ? (
        <div className="empty-row">{p.emptyText}</div>
      ) : (
        <div className={'tbl' + (p.showGrain ? ' with-grain' : '') + (p.showLabel ? '' : ' no-label')} role="table">
          <div className="tr th" role="row">
            <span className="c-chk" />
            <span>عرض</span>
            <span>طول</span>
            <span>تعداد</span>
            {p.showLabel ? <span>برچسب</span> : null}
            {p.showGrain ? <span>دانه</span> : null}
            <span className="c-act">
              <button className="icon-btn sm" onClick={p.onSwapAll} aria-label="جابه‌جایی عرض و طول همهٔ ردیف‌ها" title="جابه‌جایی عرض و طول همهٔ ردیف‌ها">
                <Icon name="swap" size={16} />
              </button>
            </span>
          </div>
          {p.rows.map((r, i) => {
            const bad = !(r.width > 0) || !(r.height > 0) || !(r.qty >= 1);
            const g: GrainMode = r.grain ?? 'free';
            const num = (v: number): string => (v > 0 ? fmt(v) : '');
            const cell = (c: number, value: string, numeric: boolean, commit: (t: string) => void, ph?: string) => (
              <Cell key={c} cell={`${i}-${COLS[c]}`} value={value} numeric={numeric} placeholder={ph} onCommit={commit} onEnter={() => next(i, c)} />
            );
            return (
              <div key={r.id} className={'tr' + (r.enabled ? '' : ' off') + (bad && (r.width || r.height) ? ' bad' : '') + (p.selectedId === r.id ? ' selected' : '')} role="row">
                <label className={'c-chk ' + (r.enabled ? 'is-on' : '')} title={r.enabled ? 'فعال' : 'غیرفعال'}>
                  <input type="checkbox" checked={r.enabled} onChange={() => p.onToggle(r.id)} aria-label={`فعال بودن ردیف ${i + 1}`} />
                  <span className="mark" aria-hidden="true">
                    {r.enabled ? <Icon name="check" size={14} /> : null}
                  </span>
                </label>
                {cell(0, num(r.width), true, (t) => { const v = parseNum(t); p.onChange(r.id, { width: isFinite(v) ? v : 0 }); }, '—')}
                {cell(1, num(r.height), true, (t) => { const v = parseNum(t); p.onChange(r.id, { height: isFinite(v) ? v : 0 }); }, '—')}
                {cell(2, r.width > 0 || r.height > 0 ? String(r.qty) : '', true, (t) => { const v = parseNum(t); p.onChange(r.id, { qty: isFinite(v) ? Math.max(0, Math.floor(v)) : 0 }); })}
                {p.showLabel ? cell(3, r.label, false, (t) => p.onChange(r.id, { label: t }), 'برچسب') : null}
                {p.showGrain ? (
                  <button className={'grain-btn ' + g} onClick={() => p.onGrain(r.id)} title={`جهت دانه: ${GRAIN_NAME[g]} (برای تغییر بزنید)`} aria-label={`جهت دانه ${GRAIN_NAME[g]}`}>
                    {g === 'free' ? <span className="grain-free-icon">✥</span> : <Icon name={g === 'vertical' ? 'grainVertical' : 'grainHorizontal'} size={22} />}
                  </button>
                ) : null}
                <span className="c-act">
                  <button className="icon-btn sm" onClick={() => p.onSwap(r.id)} aria-label="جابه‌جایی عرض و طول" title="جابه‌جایی عرض و طول">
                    <Icon name="swap" size={16} />
                  </button>
                  <button className="icon-btn sm danger" onClick={() => p.onDelete(r.id)} aria-label="حذف" title="حذف">
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      </div> : null}
    </section>
  );
}
