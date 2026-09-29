const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function normDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
}

/** Parses numbers typed by Persian users: Persian/Arabic digits, ٫ or , or / as decimal mark */
export function parseNum(input: string): number {
  let s = normDigits(String(input)).trim().replace(/\s+/g, '').replace(/[٬،]/g, '').replace(/٫/g, '.').replace(/\//g, '.');
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN;
  return Number(s);
}

/** inserts a small separator mark every 3 digits of the integer part, e.g. 130170 -> 130٬170 */
export function group(s: string): string {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [int, dec] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return (neg ? '-' : '') + grouped + (dec ? '.' + dec : '');
}

export function fmt(n: number, dec = 2, grouped = false): string {
  if (!isFinite(n)) return '–';
  const f = 10 ** dec;
  const s = String(Math.round(n * f) / f);
  return grouped ? group(s) : s;
}

export const fmtPct = (r: number, dec = 0): string => fmt(r * 100, dec) + '%';
