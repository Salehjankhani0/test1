export function jalaliDate(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(d);
  } catch {
    return d.toLocaleDateString('fa-IR');
  }
}
export function jalaliDateTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleString('fa-IR');
  }
}

/** numeric Jalali date for default names, e.g. ۱۴۰۵/۰۷/۰۲ */
export function jalaliShort(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toLocaleDateString('fa-IR');
  }
}
