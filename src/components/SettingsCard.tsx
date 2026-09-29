import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Priority } from '../engine/index.ts';
import { CUT_DIRECTION_HINTS, CUT_DIRECTION_LABELS, PRIORITY_HINTS, PRIORITY_LABELS, UNIT_MM } from '../domain/model.ts';
import type { Project, Settings } from '../domain/model.ts';
import { fmt, parseNum } from '../io/numbers.ts';
import { Icon } from './Icon.tsx';

interface Props {
  project: Project;
  onSettings: (patch: Partial<Settings>) => void;
  /** true = کاربر اشتراک/Trial فعال ندارد و بخش‌های پولی قفل‌اند */
  locked?: boolean;
  onLockedClick?: () => void;
}

/** "ترکیبی/هوشمند" (smart) و "کمترین طول برش" (minCut) دیگر در رابط کاربری قابل انتخاب نیستند */
const PRIORITIES: Priority[] = ['minWaste', 'minSheets', 'maxUtilization'];
const CUT_DIRECTIONS: Settings['cutDirection'][] = ['auto', 'width', 'length'];

interface PickerProps<T extends string> {
  value: T;
  options: T[];
  labels: Record<T, string>;
  hints: Record<T, string>;
  onPick: (v: T) => void;
  locked?: boolean;
  onLockedClick?: () => void;
}

function NativePicker<T extends string>(props: PickerProps<T>) {
  return (
    <label className={'native-option-picker' + (props.locked ? ' is-locked' : '')} onClick={props.locked ? (e) => { e.preventDefault(); props.onLockedClick?.(); } : undefined}>
      <select value={props.value} disabled={props.locked} onChange={(e) => props.onPick(e.target.value as T)} aria-label={props.labels[props.value]}>
        {props.options.map((op) => (
          <option key={op} value={op}>{props.labels[op]}</option>
        ))}
      </select>
      <span className="native-option-hint">{props.hints[props.value]}</span>
    </label>
  );
}

export function SettingsCard({ project, onSettings, locked = false, onLockedClick }: Props) {
  const s = project.settings;
  /** kerf is always shown/entered in millimetres, regardless of the project's own unit
   *  (a blade width is naturally a mm-sized number) */
  const mmPerUnit = UNIT_MM[project.unit];
  const [kerfText, setKerfText] = useState(s.kerf > 0 ? fmt(s.kerf * mmPerUnit) : '');
  useEffect(() => setKerfText(s.kerf > 0 ? fmt(s.kerf * mmPerUnit) : ''), [project.id]);
  return (
    <>
      <section className="card">
        <div className="card-h">
          <h2>تنظیمات</h2>
        </div>
        <div className="form pad">
          <div className="field">
            <span>ضخامت برش (Kerf) — میلی‌متر</span>
            <input
              className="cell kerf-input"
              inputMode="decimal"
              placeholder="0"
              value={kerfText}
              onChange={(e) => {
                setKerfText(e.target.value);
                const v = parseNum(e.target.value);
                if (isFinite(v) && v >= 0) onSettings({ kerf: v / mmPerUnit });
                else if (e.target.value.trim() === '') onSettings({ kerf: 0 });
              }}
            />
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-h">
          <h2>اولویت بهینه‌سازی</h2>
          {locked ? <span className="lock-badge"><Icon name="lock" size={12} /> نیازمند اشتراک</span> : null}
        </div>
        <div className="form pad">
          <NativePicker value={s.priority} options={PRIORITIES} labels={PRIORITY_LABELS} hints={PRIORITY_HINTS} onPick={(priority) => onSettings({ priority })} locked={locked} onLockedClick={onLockedClick} />
        </div>
      </section>
      <section className="card">
        <div className="card-h">
          <h2>جهت برش‌ها</h2>
          {locked ? <span className="lock-badge"><Icon name="lock" size={12} /> نیازمند اشتراک</span> : null}
        </div>
        <div className="form pad">
          <NativePicker value={s.cutDirection} options={CUT_DIRECTIONS} labels={CUT_DIRECTION_LABELS} hints={CUT_DIRECTION_HINTS} onPick={(cutDirection) => onSettings({ cutDirection })} locked={locked} onLockedClick={onLockedClick} />
        </div>
      </section>
    </>
  );
}
