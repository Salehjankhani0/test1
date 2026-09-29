import { normDigits } from './numbers.ts';

export interface CsvRow {
  width: number;
  height: number;
  qty: number;
  label: string;
}

const q = (v: string): string => (/[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/** UTF-8 with BOM so that Excel shows Persian labels correctly */
export function toCsv(rows: CsvRow[]): string {
  const lines = ['Width,Height,Quantity,Label'];
  for (const r of rows) lines.push([String(r.width), String(r.height), String(r.qty), q(r.label)].join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === d) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function toNumber(s: string, decimalComma: boolean): number {
  let t = normDigits(s).trim().replace(/٫/g, '.').replace(/٬/g, '').replace(/\s+/g, '');
  if (decimalComma) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
}

/** Reads CSV exported from Excel (English or Persian headers, , ; or TAB delimiters) */
export function parseCsv(text: string): { rows: CsvRow[]; skipped: number } {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], skipped: 0 };
  const count = (d: string): number => lines[0].split(d).length - 1;
  const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const decimalComma = delim === ';' || delim === '\t' ? lines.some((l) => /\d,\d/.test(l)) && !lines.some((l) => /\d\.\d/.test(l)) : false;
  const table = lines.map((l) => splitLine(l, delim));

  let idx = { w: 0, h: 1, q: 2, l: 3 };
  let start = 0;
  const first = table[0];
  if (isNaN(toNumber(first[0] ?? '', decimalComma)) || isNaN(toNumber(first[1] ?? '', decimalComma))) {
    start = 1;
    const find = (re: RegExp, fallback: number): number => {
      const i = first.findIndex((c) => re.test(normDigits(c).trim().toLowerCase()));
      return i >= 0 ? i : fallback;
    };
    idx = {
      w: find(/^(width|w|عرض)$/, 0),
      h: find(/^(height|length|h|l|len|طول|ارتفاع)$/, 1),
      q: find(/^(quantity|qty|count|q|تعداد)$/, 2),
      l: find(/^(label|name|tag|برچسب|نام|توضیح|توضیحات)$/, 3),
    };
  }
  const rows: CsvRow[] = [];
  let skipped = 0;
  for (let i = start; i < table.length; i++) {
    const r = table[i];
    const w = toNumber(r[idx.w] ?? '', decimalComma);
    const h = toNumber(r[idx.h] ?? '', decimalComma);
    const qRaw = r[idx.q];
    const qty = qRaw === undefined || qRaw === '' ? 1 : toNumber(qRaw, decimalComma);
    if (!(w > 0) || !(h > 0) || !(qty >= 1)) {
      skipped++;
      continue;
    }
    rows.push({ width: w, height: h, qty: Math.floor(qty), label: r[idx.l] ?? '' });
  }
  return { rows, skipped };
}
