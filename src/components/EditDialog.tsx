import { useEffect, useRef, useState } from 'react';
import type { GrainMode } from '../engine/index.ts';
import { Modal } from './ui.tsx';
import type { Row } from './ItemTable.tsx';
import { fmt, parseNum } from '../io/numbers.ts';
import { GRAIN_LABELS } from '../domain/model.ts';

interface Props {
  kind: 'pieces' | 'stock';
  unit: string;
  initial: Row | null;
  onSave: (r: Omit<Row, 'id' | 'enabled'>, keepOpen: boolean) => void;
  onClose: () => void;
}

export function EditDialog({ kind, unit, initial, onSave, onClose }: Props) {
  const [w, setW] = useState(initial && initial.width > 0 ? fmt(initial.width) : '');
  const [h, setH] = useState(initial && initial.height > 0 ? fmt(initial.height) : '');
  const [q, setQ] = useState(initial ? String(initial.qty) : '1');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [grain, setGrain] = useState<GrainMode>(initial?.grain ?? 'free');
  const [err, setErr] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = (keepOpen: boolean): void => {
    const width = parseNum(w);
    const height = parseNum(h);
    const qty = parseNum(q);
    if (!(width > 0) || !(height > 0)) return setErr('عرض و طول باید عددی بزرگ‌تر از صفر باشند');
    if (!(qty >= 1) || !Number.isInteger(qty)) return setErr('تعداد باید یک عدد صحیح (حداقل ۱) باشد');
    onSave({ width, height, qty, label: label.trim(), grain: kind === 'pieces' ? grain : undefined }, keepOpen);
    if (keepOpen) {
      setW('');
      setH('');
      setQ('1');
      setLabel('');
      setErr('');
      first.current?.focus();
    }
  };
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(false);
    }
  };
  const title = (initial && initial.width > 0 ? 'ویرایش ' : 'افزودن ') + (kind === 'pieces' ? 'قطعه' : 'ورق موجودی');

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary" onClick={() => submit(false)}>
            ذخیره
          </button>
          {!initial || initial.width <= 0 ? (
            <button className="btn btn-soft" onClick={() => submit(true)}>
              ذخیره و افزودن بعدی
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={onClose}>
            انصراف
          </button>
        </>
      }
    >
      <div className="form" onKeyDown={onKey}>
        <div className="grid2">
          <label className="field">
            <span>عرض ({unit})</span>
            <input ref={first} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="مثلاً 67.5" />
          </label>
          <label className="field">
            <span>طول ({unit})</span>
            <input inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} placeholder="مثلاً 140" />
          </label>
        </div>
        <label className="field">
          <span>تعداد</span>
          <input inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">
          <span>برچسب (اختیاری — روی نقشه برش نمایش داده می‌شود)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'pieces' ? 'مثلاً پنجرهٔ آشپزخانه' : 'مثلاً ورق ۶ میل'} />
        </label>
        {kind === 'pieces' ? (
          <div className="field">
            <span>جهت دانه / چرخش (فقط وقتی «در نظر گرفتن جهت دانه» روشن باشد)</span>
            <div className="seg">
              {(['free', 'vertical', 'horizontal'] as GrainMode[]).map((g) => (
                <button key={g} type="button" className={grain === g ? 'on' : ''} onClick={() => setGrain(g)}>
                  {GRAIN_LABELS[g]}
                </button>
              ))}
            </div>
            <small className="hint">عمودی: طول قطعه موازی طول ورق می‌ماند — افقی: طول قطعه در راستای عرض ورق قرار می‌گیرد.</small>
          </div>
        ) : null}
        {err ? <div className="form-err">{err}</div> : null}
      </div>
    </Modal>
  );
}
