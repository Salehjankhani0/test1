/** Printable report (opened in a new tab -> "Save as PDF"). Persian shaping is done by the browser. */
import type { Solution } from '../engine/index.ts';
import { CUT_DIRECTION_LABELS, GRAIN_LABELS, PRIORITY_LABELS } from '../domain/model.ts';
import type { Project } from '../domain/model.ts';
import { esc, renderSheetSvg, sheetBounds } from './svg.ts';
import { renderOptsFor } from './image.ts';
import { fmt, fmtPct } from './numbers.ts';
import { jalaliDate } from './jalali.ts';

const CSS = `
*{box-sizing:border-box}
body{font-family:Vazirmatn,Tahoma,'Segoe UI',sans-serif;margin:0;padding:18px;color:#0f172a;background:#fff;font-size:13px;line-height:1.7}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 8px;border-bottom:2px solid #0f8379;padding-bottom:4px}h3{font-size:14px;margin:14px 0 6px}
.meta{color:#475569;margin-bottom:10px}.bar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px 14px;margin:-18px -18px 16px;display:flex;gap:10px;align-items:center;justify-content:space-between}
.bar button{font:inherit;background:#17a397;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}
table{border-collapse:collapse;width:100%;margin:6px 0 10px}th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:center}th{background:#f1f5f9}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}.kpi{border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px}.kpi b{display:block;font-size:16px}.kpi span{color:#475569;font-size:12px}
.map{width:100%;border:1px solid #cbd5e1;border-radius:8px;margin:8px 0;overflow:hidden}.sheet{page-break-inside:avoid;margin-bottom:18px}
.small td,.small th{font-size:12px;padding:2px 6px}.warn{color:#b45309}.num{direction:ltr;unicode-bidi:isolate}
@media print{.bar{display:none}body{padding:0}@page{size:A4;margin:12mm}}
`;

export function buildReportHtml(p: Project, sol: Solution): string {
  const unit = p.unit;
  const st = sol.stats;
  const opts = renderOptsFor(p, { background: '#ffffff', selected: null, ghost: null, detailed: true });
  const nm = (id: string): number => p.pieces.findIndex((x) => x.id === id) + 1;
  const kpi = (v: string, l: string): string => `<div class="kpi"><b class="num">${esc(v)}</b><span>${esc(l)}</span></div>`;

  let h = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} — گزارش برش</title><style>${CSS}</style></head><body>`;
  h += `<div class="bar"><span>برای ذخیره PDF در پنجرهٔ چاپ «ذخیره به‌صورت PDF» را انتخاب کنید</span><button onclick="window.print()">چاپ / ذخیره PDF</button></div>`;
  h += `<h1>گزارش برش شیشه — ${esc(p.name)}</h1><div class="meta">تاریخ: ${esc(jalaliDate())} &nbsp;|&nbsp; واحد: ${unit} &nbsp;|&nbsp; ضخامت برش: <span class="num">${fmt(p.settings.kerf * 10)} mm</span> &nbsp;|&nbsp; اولویت: ${esc(PRIORITY_LABELS[p.settings.priority])} &nbsp;|&nbsp; جهت دانه: ${p.settings.considerGrain ? 'رعایت می‌شود' : 'آزاد'} &nbsp;|&nbsp; جهت برش: ${esc(CUT_DIRECTION_LABELS[p.settings.cutDirection])}</div>`;

  h += `<h2>خلاصهٔ نتیجه</h2><div class="grid">`;
  h += kpi(String(st.sheetCount), 'تعداد صفحات مصرف‌شده');
  h += kpi(`${st.placedCount} از ${st.pieceCount}`, 'قطعات چیده‌شده');
  h += kpi(fmtPct(st.utilization), 'درصد استفاده');
  h += kpi(fmtPct(st.wasteArea / (st.totalSheetArea || 1)), 'درصد دورریز');
  h += kpi(`${fmt(st.usedArea)} ${unit}²`, 'مساحت مصرف‌شده');
  h += kpi(`${fmt(st.wasteArea)} ${unit}²`, 'مساحت دورریز');
  h += kpi(String(st.cutCount), 'تعداد برش‌ها');
  h += kpi(`${fmt(st.cutLength)} ${unit}`, 'طول کل برش');
  h += `</div>`;
  if (st.sheetsByStock.length) h += `<div>ورق‌های مصرفی: ${st.sheetsByStock.map((u) => `<span class="num">${fmt(u.width)} × ${fmt(u.height)} × ${u.count}</span>`).join(' ، ')}</div>`;
  if (sol.unplaced.length) h += `<p class="warn">⚠ ${sol.unplaced.length} قطعه چیده نشد: ${sol.unplaced.map((u) => `${esc(u.label || fmt(u.width) + '×' + fmt(u.height))} (${u.reason === 'tooLarge' ? 'بزرگ‌تر از همهٔ ورق‌ها' : 'موجودی کافی نیست'})`).join(' ، ')}</p>`;

  h += `<h2>فهرست قطعات مورد نیاز</h2><table><tr><th>#</th><th>عرض</th><th>طول</th><th>تعداد</th><th>جهت دانه</th><th>برچسب</th></tr>`;
  p.pieces.forEach((x, i) => {
    if (!x.enabled) return;
    h += `<tr><td>${i + 1}</td><td class="num">${fmt(x.width)}</td><td class="num">${fmt(x.height)}</td><td>${x.qty}</td><td>${GRAIN_LABELS[x.grain]}</td><td>${esc(x.label)}</td></tr>`;
  });
  h += `</table><h2>ورق‌های موجود در انبار</h2><table><tr><th>#</th><th>عرض</th><th>طول</th><th>تعداد</th><th>برچسب</th></tr>`;
  p.stock.forEach((x, i) => {
    if (!x.enabled) return;
    h += `<tr><td>${i + 1}</td><td class="num">${fmt(x.width)}</td><td class="num">${fmt(x.height)}</td><td>${x.qty}</td><td>${esc(x.label)}</td></tr>`;
  });
  h += `</table>`;

  for (const sh of sol.sheets) {
    const vb = sheetBounds(sh);
    h += `<div class="sheet"><h2>ورق ${sh.index + 1} از ${sol.sheets.length} — <span class="num">${fmt(sh.width)} × ${fmt(sh.height)} ${unit}</span></h2>`;
    h += `<div class="map" style="aspect-ratio:${vb[2]}/${vb[3]}">${renderSheetSvg(sh, { ...opts, idPrefix: 'r' + sh.index, showCuts: true })}</div>`;
    h += `<div class="grid">${kpi(fmtPct(sh.utilization), 'درصد استفاده')}${kpi(`${fmt(sh.usedArea)} ${unit}²`, 'مساحت استفاده‌شده')}${kpi(`${fmt(sh.wasteArea)} ${unit}²`, 'مساحت دورریز')}${kpi(String(sh.pieceCount), 'تعداد قطعات')}${kpi(`${fmt(sh.cutLength)} ${unit}`, 'طول کل برش')}${kpi(String(sh.cutCount), 'تعداد برش‌ها')}</div>`;
    h += `<h3>قطعات این ورق (مختصات از گوشهٔ بالا-چپ)</h3><table class="small"><tr><th>شناسه</th><th>عرض×طول (چیده‌شده)</th><th>X</th><th>Y</th><th>چرخش</th><th>برچسب</th></tr>`;
    for (const q of sh.placements) {
      h += `<tr><td class="num">${nm(q.pieceId)}-${q.instance}</td><td class="num">${fmt(q.w)} × ${fmt(q.h)}</td><td class="num">${fmt(q.x)}</td><td class="num">${fmt(q.y)}</td><td>${q.rotated ? '۹۰°' : '—'}</td><td>${esc(p.pieces.find((x) => x.id === q.pieceId)?.label ?? '')}</td></tr>`;
    }
    h += `</table><h3>ترتیب پیشنهادی برش</h3><table class="small"><tr><th>مرحله</th><th>جهت</th><th>موقعیت</th><th>طول برش</th></tr>`;
    for (const c of sh.cuts) {
      h += `<tr><td>${c.order}</td><td>${c.orientation === 'H' ? 'افقی' : 'عمودی'}</td><td class="num">${c.orientation === 'H' ? 'Y = ' + fmt(c.y) : 'X = ' + fmt(c.x)}</td><td class="num">${fmt(c.length)}</td></tr>`;
    }
    h += `</table></div>`;
  }
  h += `<div class="meta">تولیدشده با «برش‌یار شیشه» — تمام محاسبات به‌صورت محلی انجام شده است.</div></body></html>`;
  return h;
}

export function openReport(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return !!w;
}
