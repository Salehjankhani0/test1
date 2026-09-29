import { useEffect, useState } from 'react';
import { Modal } from './ui.tsx';
import { Icon } from './Icon.tsx';
import type { ProjectMeta } from '../storage/db.ts';
import { jalaliDateTime } from '../io/jalali.ts';

interface Props {
  list: ProjectMeta[];
  currentId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ProjectPanel({ list, currentId, onOpen, onDelete, onClose }: Props) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <Modal title="پروژه‌های ذخیره‌شده" onClose={onClose} size="wide">
      {list.length === 0 ? (
        <div className="empty-row">هیچ پروژهٔ ذخیره‌شده‌ای وجود ندارد.</div>
      ) : (
        <div className="proj-list">
          {list.map((p) => (
            <div key={p.id} className={'proj-row' + (p.id === currentId ? ' cur' : '')}>
              <button className="proj-main" onClick={() => onOpen(p.id)}>
                <Icon name="folder" size={20} />
                <span className="proj-info">
                  <b>{p.name}</b>
                  <small>
                    {p.pieces} قطعه، {p.stock} نوع ورق — {jalaliDateTime(new Date(p.updatedAt))}
                    {p.hasResult ? ' — دارای نتیجه' : ''}
                  </small>
                </span>
              </button>
              {confirm === p.id ? (
                <span className="proj-confirm">
                  حذف شود؟
                  <button
                    className="btn btn-ghost sm danger"
                    onClick={() => {
                      onDelete(p.id);
                      setConfirm(null);
                    }}
                  >
                    بله
                  </button>
                  <button className="btn btn-ghost sm" onClick={() => setConfirm(null)}>
                    خیر
                  </button>
                </span>
              ) : (
                <button className="icon-btn sm danger" aria-label="حذف پروژه" onClick={() => setConfirm(p.id)}>
                  <Icon name="trash" size={17} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="دربارهٔ برش‌یار شیشه" onClose={onClose}>
      <div className="about">
        <p>
          <b>برش‌یار شیشه</b> ابزاری برای محاسبه و بهینه‌سازی برش دوبعدی شیشه در کارگاه‌های شیشه‌بری است. تمام محاسبات (چیدمان قطعات، ضخامت برش، جهت دانه و آمار مصرف) به‌صورت کامل در همین مرورگر و بدون نیاز به اینترنت انجام می‌شود.
        </p>
        <ul>
          <li>موتور چیدمان: برش گیوتینی + جست‌وجوی چندمرحله‌ای + شبیه‌سازی تبرید</li>
          <li>ذخیرهٔ خودکار پروژه‌ها در حافظهٔ محلی دستگاه (IndexedDB)</li>
          <li>خروجی PDF، تصویر و CSV</li>
          <li>قابل نصب روی اندروید به‌صورت اپلیکیشن (PWA)</li>
        </ul>
        <p className="hint">نسخهٔ ۱٫۱</p>
      </div>
    </Modal>
  );
}

export function ReportIssueDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <Modal
      title="گزارش مشکل"
      onClose={onClose}
      footer={
        !sent ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              setSent(true);
              setTimeout(onClose, 1200);
            }}
          >
            ارسال
          </button>
        ) : null
      }
    >
      {sent ? (
        <div className="form-ok">
          <Icon name="check" /> گزارش شما ثبت شد. سپاس از همراهی شما.
        </div>
      ) : (
        <div className="form">
          <label className="field">
            <span>مشکل یا پیشنهاد خود را بنویسید</span>
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="توضیح دهید چه مشکلی پیش آمد…" />
          </label>
          <small className="hint">این گزارش فقط در همین دستگاه نگه‌داری می‌شود و در نسخهٔ فعلی برای پشتیبانی ارسال نمی‌شود.</small>
        </div>
      )}
    </Modal>
  );
}
