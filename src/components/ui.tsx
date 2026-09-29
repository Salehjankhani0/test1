import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export interface ConfirmOpts {
  title?: string;
  message: string;
  ok?: string;
  danger?: boolean;
}
export interface UiApi {
  toast: (msg: string, kind?: 'ok' | 'err' | 'info') => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}
export const UiContext = createContext<UiApi>({ toast: () => undefined, confirm: () => Promise.resolve(false) });
export const useUi = (): UiApi => useContext(UiContext);

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'full' }) {
  const { title, onClose, children, footer, size } = props;
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={'modal ' + (size ?? '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="بستن">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  hidden?: boolean;
}

/** the dropdown is rendered through a portal into <body>, positioned by the button's own
 *  screen coordinates — this keeps it from being clipped by an ancestor card's `overflow:
 *  hidden` (which used to cut it off / bury it under the next card) and lets it always open
 *  fully on top of everything else. */
export function Menu(props: { icon: string; label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = (): void => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const panelW = panelRef.current?.offsetWidth ?? 230;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    const top = Math.min(r.bottom + 6, window.innerHeight - 8);
    setPos({ top, left, width: panelW });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onOutside = (e: Event): void => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onReflow = (): void => place();
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);
  // reposition once the panel has actually rendered and we know its real width
  useEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.items.length]);

  return (
    <div className="menu">
      <button
        ref={btnRef}
        className={'icon-btn ' + (props.className ?? '')}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={props.icon} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="menu-panel-portal"
              role="menu"
              style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            >
              {props.items
                .filter((i) => !i.hidden)
                .map((it, i) =>
                  it.divider ? (
                    <div key={i} className="menu-div" />
                  ) : (
                    <button
                      key={i}
                      role="menuitem"
                      className={'menu-item' + (it.danger ? ' danger' : '')}
                      onClick={() => {
                        setOpen(false);
                        it.onClick?.();
                      }}
                    >
                      {it.icon ? <Icon name={it.icon} size={18} /> : null}
                      <span>{it.label}</span>
                    </button>
                  ),
                )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span className="tr-text">
        <span>{props.label}</span>
        {props.hint ? <small>{props.hint}</small> : null}
      </span>
      <span className="switch">
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        <i />
      </span>
    </label>
  );
}
