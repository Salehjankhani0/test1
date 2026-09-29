import type { EngineInput, ForcedOrient, GrainMode, Pin, PieceSpec, Priority, Solution, StockSpec } from '../engine/index.ts';

export type Unit = 'mm' | 'cm' | 'm';
export const UNITS: Unit[] = ['mm', 'cm', 'm'];
export const UNIT_MM: Record<Unit, number> = { mm: 1, cm: 10, m: 1000 };

/** area stats are always shown to the user in square meters, regardless of the project's own
 *  linear unit (mm/cm/m) — e.g. two 100×100cm pieces read as "2 m²" rather than "20000 cm²" */
export const areaToM2 = (areaInUnit2: number, unit: Unit): number => (areaInUnit2 * UNIT_MM[unit] ** 2) / 1_000_000;

export interface Settings {
  kerf: number;
  showLabels: boolean;
  singleSheet: boolean;
  considerGrain: boolean;
  priority: Priority;
  /** direction of the guillotine cuts (not sheet/piece rotation) — see CUT_DIRECTION_LABELS */
  cutDirection: 'auto' | 'width' | 'length';
}

export interface ViewPrefs {
  detailed: boolean;
  showCuts: boolean;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  unit: Unit;
  pieces: PieceSpec[];
  stock: StockSpec[];
  settings: Settings;
  /** locked pieces (fixed by the user) */
  pins: Pin[];
  /** orientations forced by the user ("rotate" action) */
  forced: ForcedOrient[];
  view: ViewPrefs;
  result: Solution | null;
  /** key of the inputs that produced `result` (used to detect stale results) */
  resultKey: string | null;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  minWaste: 'کمترین منطقهٔ هدر رفته',
  minCut: 'کمترین طول برش',
  minSheets: 'کمترین تعداد صفحات مصرفی',
  maxUtilization: 'بیشترین استفاده از سطح شیشه',
  smart: 'ترکیبی / بهینه‌سازی هوشمند',
};
export const PRIORITY_HINTS: Record<Priority, string> = {
  minWaste: 'دورریز کل را کم می‌کند و یک تکهٔ باقی‌ماندهٔ بزرگ نگه می‌دارد',
  minCut: 'مجموع طول خطوط برش را کمینه می‌کند',
  minSheets: 'تا جای ممکن از ورق کمتری استفاده می‌کند',
  maxUtilization: 'دورریز را در یک ورق جمع می‌کند تا بقیهٔ ورق‌ها کامل‌تر شوند',
  smart: 'تعادل بین دورریز، تعداد ورق و طول برش',
};
export const GRAIN_LABELS: Record<GrainMode, string> = {
  free: 'آزاد',
  horizontal: 'فقط افقی',
  vertical: 'فقط عمودی',
};
export const CUT_DIRECTION_LABELS: Record<Settings['cutDirection'], string> = {
  auto: 'بهینه (پیش‌فرض)',
  width: 'برش‌های اولیه در راستای عرض صفحه',
  length: 'برش‌های اولیه در راستای طول صفحه',
};
export const CUT_DIRECTION_HINTS: Record<Settings['cutDirection'], string> = {
  auto: 'الگوریتم برای هر ورق بهترین جهت برش را خودش پیدا می‌کند',
  width: 'اولین برش هر ورق همیشه به‌صورت یک خط کامل در راستای عرض ورق زده می‌شود',
  length: 'اولین برش هر ورق همیشه به‌صورت یک خط کامل در راستای طول ورق زده می‌شود',
};

export const uid = (): string => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const defaultSettings = (): Settings => ({
  kerf: 0,
  showLabels: true,
  singleSheet: false,
  considerGrain: false,
  priority: 'minWaste',
  cutDirection: 'auto',
});

export function emptyProject(name: string): Project {
  const now = Date.now();
  return {
    version: 1,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    unit: 'cm',
    pieces: [],
    stock: [],
    settings: defaultSettings(),
    pins: [],
    forced: [],
    view: { detailed: true, showCuts: false },
    result: null,
    resultKey: null,
  };
}

export function demoProject(): Project {
  const p = emptyProject('پروژهٔ نمونه');
  p.pieces = [
    { id: uid(), width: 67.5, height: 140, qty: 4, label: '', grain: 'free', enabled: true },
    { id: uid(), width: 85, height: 107, qty: 3, label: '', grain: 'free', enabled: true },
  ];
  p.stock = [{ id: uid(), width: 321, height: 225, qty: 1, label: '', enabled: true }];
  return p;
}

export function toEngineInput(p: Project): EngineInput {
  return {
    pieces: p.pieces,
    stock: p.stock,
    options: {
      kerf: p.settings.kerf,
      considerGrain: p.settings.considerGrain,
      singleSheet: false,
      priority: p.settings.priority,
      minOffcut: 0,
      cutDirection: p.settings.cutDirection,
    },
    pins: p.pins,
    forced: p.forced,
  };
}

const isValidRow = (x: { width: number; height: number; qty: number }): boolean => x.width > 0 && x.height > 0 && x.qty >= 1;

/** identifies everything that changes the geometry of the result (labels/pins excluded) */
export function inputKey(p: Project): string {
  return JSON.stringify({
    u: p.unit,
    p: p.pieces.filter(isValidRow).map((x) => [x.id, x.width, x.height, x.qty, x.grain, x.enabled]),
    s: p.stock.filter(isValidRow).map((x) => [x.id, x.width, x.height, x.qty, x.enabled]),
    o: [p.settings.kerf, p.settings.considerGrain, p.settings.priority, p.settings.cutDirection],
  });
}

export function isStale(p: Project): boolean {
  return !!p.result && p.resultKey !== inputKey(p);
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Change the unit. When `convert` is true all numbers are scaled so physical sizes are kept. */
export function changeUnit(p: Project, to: Unit, convert: boolean): Project {
  if (to === p.unit) return p;
  if (!convert) return { ...p, unit: to };
  const f = UNIT_MM[p.unit] / UNIT_MM[to];
  return {
    ...p,
    unit: to,
    pieces: p.pieces.map((x) => ({ ...x, width: round(x.width * f), height: round(x.height * f) })),
    stock: p.stock.map((x) => ({ ...x, width: round(x.width * f), height: round(x.height * f) })),
    settings: { ...p.settings, kerf: round(p.settings.kerf * f) },
    pins: [],
    forced: [],
    result: null,
    resultKey: null,
  };
}

/* ---------- import / sanitize ---------- */
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function sanitizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.pieces) || !Array.isArray(r.stock)) return null;
  const base = emptyProject(str(r.name) || 'پروژهٔ واردشده');
  const grain = (g: unknown): GrainMode => (g === 'horizontal' || g === 'vertical' ? g : 'free');
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const pr = s.priority;
  const p: Project = {
    ...base,
    unit: r.unit === 'mm' || r.unit === 'm' ? r.unit : 'cm',
    pieces: (r.pieces as Record<string, unknown>[]).map((x) => ({
      id: str(x.id) || uid(),
      width: Math.max(0, num(x.width)),
      height: Math.max(0, num(x.height)),
      qty: Math.max(0, Math.floor(num(x.qty, 1))),
      label: str(x.label),
      grain: grain(x.grain),
      enabled: x.enabled !== false,
    })),
    stock: (r.stock as Record<string, unknown>[]).map((x) => ({
      id: str(x.id) || uid(),
      width: Math.max(0, num(x.width)),
      height: Math.max(0, num(x.height)),
      qty: Math.max(0, Math.floor(num(x.qty, 1))),
      label: str(x.label),
      enabled: x.enabled !== false,
    })),
    settings: {
      kerf: Math.max(0, num(s.kerf)),
      showLabels: s.showLabels !== false,
      singleSheet: false,
      considerGrain: s.considerGrain === true,
      priority: pr === 'minCut' || pr === 'minSheets' || pr === 'maxUtilization' || pr === 'smart' ? pr : 'minWaste',
      cutDirection: s.cutDirection === 'width' || s.cutDirection === 'length' ? s.cutDirection : 'auto',
    },
    pins: Array.isArray(r.pins) ? (r.pins as Pin[]) : [],
    forced: Array.isArray(r.forced) ? (r.forced as ForcedOrient[]) : [],
    result: r.result && typeof r.result === 'object' && Array.isArray((r.result as Solution).sheets) ? (r.result as Solution) : null,
    resultKey: typeof r.resultKey === 'string' ? r.resultKey : null,
  };
  const v = (r.view ?? {}) as Record<string, unknown>;
  p.view = { detailed: v.detailed !== false, showCuts: v.showCuts === true };
  return normalizeUnit(p);
}

/** the app always works in centimetres (area stats are converted to m²); older projects saved in
 *  another unit are converted once on load so sizes stay physically the same */
export const normalizeUnit = (p: Project): Project => (p.unit === 'cm' ? p : changeUnit(p, 'cm', true));

/* ---------- colours ---------- */
export function pieceColor(index: number): string {
  const hue = (index * 47 + 168) % 360;
  return `hsl(${hue} 62% ${index % 2 ? 80 : 84}%)`;
}
