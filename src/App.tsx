import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrainMode, Pin, Solution } from './engine/index.ts';
import { pinsFromSolution } from './engine/index.ts';
import type { Project } from './domain/model.ts';
import { demoProject, normalizeUnit, emptyProject, inputKey, isStale, sanitizeProject, toEngineInput, uid } from './domain/model.ts';
import * as db from './storage/db.ts';
import type { ProjectMeta, WarehouseItem } from './storage/db.ts';
import { optimizeAsync } from './workers/client.ts';
import { parseNum } from './io/numbers.ts';
import { toCsv, parseCsv } from './io/csv.ts';
import { downloadText, pickFile, safeName } from './io/download.ts';
import { jalaliShort } from './io/jalali.ts';
import { exportImage } from './io/image.ts';
import { buildReportHtml, openReport } from './io/report.ts';

import { Icon } from './components/Icon.tsx';
import { Menu, Modal, Toggle, UiContext } from './components/ui.tsx';
import type { MenuItem } from './components/ui.tsx';
import { ItemTable } from './components/ItemTable.tsx';
import type { Row } from './components/ItemTable.tsx';
import { SettingsCard } from './components/SettingsCard.tsx';
import { CutMap, sheetGroups, THEMES } from './components/CutMap.tsx';
import type { MapView } from './components/CutMap.tsx';
import { GlobalStats, SheetStatsPager, UnplacedList } from './components/GlobalStats.tsx';
import { ProjectPanel, AboutDialog, ReportIssueDialog } from './components/ProjectPanel.tsx';

type Kind = 'pieces' | 'stock';

function useDebouncedSave(project: Project): void {
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      void db.saveProject(project);
      void db.setMeta('lastProjectId', project.id);
    }, 350);
    return () => window.clearTimeout(t.current);
  }, [project]);
}

export default function App() {
  const [project, setProject] = useState<Project>(demoProject);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [confirmState, setConfirmState] = useState<{ opts: { title?: string; message: string; ok?: string; danger?: boolean }; resolve: (v: boolean) => void } | null>(null);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const confirm = useCallback((opts: { title?: string; message: string; ok?: string; danger?: boolean }) => {
    return new Promise<boolean>((resolve) => setConfirmState({ opts, resolve }));
  }, []);
  const ui = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  /* ---------------- boot: load last project ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const lastId = await db.getMeta('lastProjectId');
        if (lastId) {
          const p = await db.loadProject(lastId);
          if (p) {
            setProject(normalizeUnit(p));
            setLoaded(true);
            return;
          }
        }
      } catch {
        /* ignore, fall back to demo */
      }
      setLoaded(true);
    })();
  }, []);
  useDebouncedSave(project);

  const patch = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => {
      const np = fn(p);
      return np === p ? p : { ...np, updatedAt: Date.now() };
    });
  }, []);

  const effProject = project;

  /* ---------------- optimize ---------------- */
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const jobRef = useRef<{ cancel: () => void } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedPieceId = selected?.includes('|') ? selected.slice(selected.indexOf('|') + 1).split('#')[0] : null;

  /* ---------------- shared cut-map view (lock/zoom/font/theme/rotate) ----------------
   * a single toolbar (rendered once, on the first sheet) controls every sheet's map — see
   * `showToolbar` below. Pan stays local to each sheet; resetMapToken makes every sheet snap
   * its own pan back to center together. */
  const [mapView, setMapView] = useState<MapView>({ locked: true, zoom: 1, fontScale: 1, theme: 0, rot: false });
  const [mapResetToken, setMapResetToken] = useState(0);
  const mapApi = {
    onToggleLocked: () => setMapView((v) => ({ ...v, locked: !v.locked })),
    onResetView: () => {
      setMapView((v) => ({ ...v, zoom: 1 }));
      setMapResetToken((t) => t + 1);
    },
    onZoomIn: () => setMapView((v) => ({ ...v, zoom: Math.min(8, v.zoom * 1.3) })),
    onZoomOut: () => setMapView((v) => ({ ...v, zoom: Math.max(0.5, v.zoom / 1.3) })),
    onFontUp: () => setMapView((v) => ({ ...v, fontScale: Math.min(2.2, v.fontScale * 1.2) })),
    onFontDown: () => setMapView((v) => ({ ...v, fontScale: Math.max(0.5, v.fontScale / 1.2) })),
    onCycleTheme: () => setMapView((v) => ({ ...v, theme: (v.theme + 1) % THEMES })),
    onToggleRot: () => {
      setMapView((v) => ({ ...v, rot: !v.rot, zoom: 1 }));
      setMapResetToken((t) => t + 1);
    },
  };

  const runOptimize = useCallback(
    (base?: Project) => {
      const p = base ?? project;
      const enabledPieces = p.pieces.filter((x) => x.enabled && x.qty >= 1 && x.width > 0 && x.height > 0);
      const enabledStock = p.stock.filter((x) => x.enabled && x.qty >= 1 && x.width > 0 && x.height > 0);
      if (!enabledPieces.length) return toast('حداقل یک قطعهٔ معتبر اضافه کنید', 'err');
      if (!enabledStock.length) return toast('حداقل یک ورق موجودی معتبر اضافه کنید', 'err');
      jobRef.current?.cancel();
      setRunning(true);
      setProgress(0);
      const job = optimizeAsync(toEngineInput(p), { maxMs: Math.min(4500, 900 + (enabledPieces.reduce((a, x) => a + x.qty, 0)) * 90) }, setProgress);
      jobRef.current = job;
      job.promise
        .then((sol) => {
          setProject((cur) => ({ ...cur, result: sol, resultKey: inputKey(p), updatedAt: Date.now() }));
          setSelected(null);
          if (sol.unplaced.length) toast(`${sol.unplaced.length} قطعه جا نشد — لیست «باقی‌مانده‌ها» را ببینید`, 'err');
          else toast('چیدمان با موفقیت محاسبه شد', 'ok');
        })
        .catch((e: Error) => {
          if (e.message !== 'cancelled') toast('خطا در محاسبه: ' + e.message, 'err');
        })
        .finally(() => setRunning(false));
    },
    [project, toast],
  );

  const cancelOptimize = (): void => {
    jobRef.current?.cancel();
    setRunning(false);
  };

  const reoptimizeFromResult = useCallback(
    (pins: Pin[]) => {
      const p = { ...project, pins };
      setProject(p);
      runOptimize(p);
    },
    [project, runOptimize],
  );

  /* ---------------- always keep spare blank rows: 1 for pieces, 1 for stock ---------------- */
  useEffect(() => {
    if (!loaded) return;
    const isBlank = (x: { width: number; height: number; label: string }): boolean => !x.width && !x.height && !x.label;
    const trailing = (list: { width: number; height: number; label: string }[]): number => {
      let n = 0;
      for (let i = list.length - 1; i >= 0 && isBlank(list[i]); i--) n++;
      return n;
    };
    const needP = Math.max(0, 1 - trailing(project.pieces));
    const needS = Math.max(0, 1 - trailing(project.stock));
    if (!needP && !needS) return;
    setProject((p) => ({
      ...p,
      pieces: [...p.pieces, ...Array.from({ length: needP }, () => ({ id: uid(), enabled: true, width: 0, height: 0, qty: 1, label: '', grain: 'free' as const }))],
      stock: [...p.stock, ...Array.from({ length: needS }, () => ({ id: uid(), enabled: true, width: 0, height: 0, qty: 1, label: '' }))],
    }));
  }, [loaded, project.pieces, project.stock]);

  /* ---------------- piece / stock CRUD ---------------- */
  const [showSettings, setShowSettings] = useState(false);
  const [warehouse, setWarehouse] = useState<WarehouseItem[]>([]);
  const [warehouseKind, setWarehouseKind] = useState<Kind | null>(null);
  const [warehouseSelected, setWarehouseSelected] = useState<string[]>([]);
  const rowsOf = (kind: Kind): Row[] => (kind === 'pieces' ? project.pieces : project.stock).map((x) => ({ ...x }));

  const addBlank = (kind: Kind): void => {
    patch((p) => {
      const row = { id: uid(), enabled: true, width: 0, height: 0, qty: 1, label: '' };
      return kind === 'pieces' ? { ...p, pieces: [...p.pieces, { ...row, grain: 'free' as const }] } : { ...p, stock: [...p.stock, row] };
    });
  };
  const cycleGrain = (id: string): void => {
    const order: GrainMode[] = ['vertical', 'horizontal', 'free'];
    const cur = project.pieces.find((x) => x.id === id)?.grain ?? 'free';
    updateRow('pieces', id, { grain: order[(order.indexOf(cur) + 1) % 3] });
  };
  const updateRow = (kind: Kind, id: string, data: Partial<Row>): void => {
    patch((p) => {
      if (kind === 'pieces') return { ...p, pieces: p.pieces.map((x) => (x.id === id ? { ...x, ...data } : x)) };
      return { ...p, stock: p.stock.map((x) => (x.id === id ? { ...x, ...data } : x)) };
    });
  };
  const removeRow = async (kind: Kind, id: string): Promise<void> => {
    const rows = kind === 'pieces' ? project.pieces : project.stock;
    const row = rows.find((x) => x.id === id);
    if (!row) return;
    const label = row.label || `${row.width || '—'} × ${row.height || '—'}`;
    const title = kind === 'pieces' ? 'حذف ابعاد' : 'حذف موجودی';
    const ok = await confirm({
      title,
      message: `ابعاد «${label}» حذف شود؟`,
      ok: 'حذف',
      danger: true,
    });
    if (!ok) return;
    patch((p) =>
      kind === 'pieces'
        ? { ...p, pieces: p.pieces.filter((x) => x.id !== id), pins: p.pins.filter((pin) => pin.pieceId !== id), forced: p.forced.filter((f) => f.pieceId !== id) }
        : { ...p, stock: p.stock.filter((x) => x.id !== id) },
    );
  };
  const toggleRow = (kind: Kind, id: string): void => {
    if (kind === 'pieces') updateRow(kind, id, { enabled: !project.pieces.find((x) => x.id === id)?.enabled });
    else updateRow(kind, id, { enabled: !project.stock.find((x) => x.id === id)?.enabled });
  };
  const swapAll = (kind: Kind): void => {
    patch((p) => {
      const sw = <T extends { width: number; height: number }>(x: T): T => ({ ...x, width: x.height, height: x.width });
      return kind === 'pieces' ? { ...p, pieces: p.pieces.map(sw) } : { ...p, stock: p.stock.map(sw) };
    });
  };
  const swapRow = (kind: Kind, id: string): void => {
    const cur = (kind === 'pieces' ? project.pieces : project.stock).find((x) => x.id === id);
    if (cur) updateRow(kind, id, { width: cur.height, height: cur.width });
  };

  /* ---- three-dot bulk operations menu actions (pieces/stock) ---- */
  const setAllEnabled = (kind: Kind, val: boolean): void => {
    patch((p) => (kind === 'pieces' ? { ...p, pieces: p.pieces.map((x) => ({ ...x, enabled: val })) } : { ...p, stock: p.stock.map((x) => ({ ...x, enabled: val })) }));
  };
  const deleteAll = async (kind: Kind): Promise<void> => {
    const ok = await confirm({ message: `همهٔ ردیف‌های «${kind === 'pieces' ? 'صفحه‌ها' : 'موجودی'}» حذف شوند؟`, ok: 'حذف همه', danger: true });
    if (!ok) return;
    patch((p) => (kind === 'pieces' ? { ...p, pieces: [], pins: [], forced: [] } : { ...p, stock: [] }));
  };
  const loadWarehouse = async (): Promise<WarehouseItem[]> => {
    const items = await db.listWarehouse();
    setWarehouse(items);
    return items;
  };
  const sendToWarehouse = async (kind: Kind): Promise<void> => {
    const rows = kind === 'pieces' ? project.pieces : project.stock;
    const valid = rows.filter((r) => r.width > 0 && r.height > 0 && r.qty >= 1);
    if (!valid.length) return toast('هیچ ابعاد معتبری برای ذخیره در انبار وجود ندارد', 'err');
    const old = await db.listWarehouse();
    const made: WarehouseItem[] = valid.map((r) => ({
      id: uid(), width: r.width, height: r.height, qty: r.qty, label: r.label, kind,
      ...(kind === 'pieces' ? { grain: r.grain ?? 'free' } : {}), savedAt: Date.now(),
    }));
    await db.saveWarehouseItems([...made, ...old]);
    setWarehouse([...made, ...old]);
    toast(`${made.length} ابعاد به انبار اضافه شد`, 'ok');
  };
  const removeWarehouseItem = async (id: string): Promise<void> => {
    const item = warehouse.find((x) => x.id === id);
    if (!item) return;
    const ok = await confirm({ message: `ابعاد «${item.width} × ${item.height}» از انبار حذف شود؟`, ok: 'حذف', danger: true });
    if (!ok) return;
    const next = warehouse.filter((x) => x.id !== id);
    await db.saveWarehouseItems(next);
    setWarehouse(next);
    setWarehouseSelected((v) => v.filter((x) => x !== id));
    toast('ابعاد از انبار حذف شد', 'ok');
  };
  const removeAllWarehouse = async (): Promise<void> => {
    const items = warehouse.filter((x) => x.kind === warehouseKind);
    if (!items.length) return;
    const ok = await confirm({ message: `همهٔ ${items.length} ابعاد این بخش از انبار حذف شوند؟ این کار قابل بازگشت نیست.`, ok: 'حذف همه', danger: true });
    if (!ok) return;
    const kind = warehouseKind;
    const next = warehouse.filter((x) => x.kind !== kind);
    await db.saveWarehouseItems(next);
    setWarehouse(next);
    setWarehouseSelected([]);
    toast('همهٔ ابعاد این بخش از انبار حذف شد', 'ok');
  };
  const openWarehouse = async (kind: Kind): Promise<void> => {
    const items = await loadWarehouse();
    setWarehouseKind(kind);
    setWarehouseSelected(items.filter((x) => x.kind === kind).slice(0, 1).map((x) => x.id));
  };
  const importFromWarehouse = (): void => {
    if (!warehouseKind || !warehouseSelected.length) return;
    const chosen = warehouse.filter((x) => warehouseSelected.includes(x.id));
    if (!chosen.length) return;
    patch((p) => {
      if (warehouseKind === 'pieces') {
        const made = chosen.map((x) => ({ id: uid(), width: x.width, height: x.height, qty: x.qty, label: x.label, enabled: true, grain: x.grain ?? 'free' as const }));
        return { ...p, pieces: [...p.pieces, ...made] };
      }
      const made = chosen.map((x) => ({ id: uid(), width: x.width, height: x.height, qty: x.qty, label: x.label, enabled: true }));
      return { ...p, stock: [...p.stock, ...made] };
    });
    toast(`${chosen.length} مورد از انبار اضافه شد`, 'ok');
    setWarehouseKind(null);
    setWarehouseSelected([]);
  };

  const exportCsv = (kind: Kind): void => {
    const list = kind === 'pieces' ? project.pieces : project.stock;
    downloadText(`${safeName(project.name)}-${kind}.csv`, toCsv(list), 'text/csv');
  };
  const importCsv = async (kind: Kind): Promise<void> => {
    const file = await pickFile('.csv,text/csv');
    if (!file) return;
    const text = await file.text();
    const { rows, skipped } = parseCsv(text);
    if (!rows.length) return toast('هیچ ردیف معتبری در فایل CSV پیدا نشد', 'err');
    patch((p) => {
      const made = rows.map((r) => ({ id: uid(), width: r.width, height: r.height, qty: r.qty, label: r.label, enabled: true, ...(kind === 'pieces' ? { grain: 'free' as const } : {}) }));
      return kind === 'pieces' ? { ...p, pieces: [...p.pieces, ...made] as Project['pieces'] } : { ...p, stock: [...p.stock, ...made] as Project['stock'] };
    });
    toast(`${rows.length} ردیف وارد شد${skipped ? ` (${skipped} ردیف نامعتبر نادیده گرفته شد)` : ''}`, 'ok');
  };

  const pieceMenu = (kind: Kind): MenuItem[] => [
    { label: 'فعال‌سازی همه', icon: 'check', onClick: () => setAllEnabled(kind, true) },
    { label: 'غیرفعال‌سازی همه', icon: 'x', onClick: () => setAllEnabled(kind, false) },
    { divider: true, label: '' },
    { label: 'ذخیره در انبار', icon: 'folder', onClick: () => void sendToWarehouse(kind) },
    { label: 'افزودن از انبار', icon: 'folder', onClick: () => void openWarehouse(kind) },
    { divider: true, label: '' },
    { label: 'خروجی CSV', icon: 'download', onClick: () => exportCsv(kind) },
    { label: 'ورودی CSV', icon: 'upload', onClick: () => void importCsv(kind) },
    { divider: true, label: '' },
    { label: 'حذف همه', icon: 'trash', danger: true, onClick: () => void deleteAll(kind) },
  ];

  /* ---------------- project menu ---------------- */
  const [showProjects, setShowProjects] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [projList, setProjList] = useState<ProjectMeta[]>([]);
  const refreshList = async (): Promise<void> => setProjList(await db.listProjects());

  const [newName, setNewName] = useState<string | null>(null);
  const newProject = async (): Promise<void> => {
    const ok = project.pieces.some((x) => x.width || x.height) || project.stock.some((x) => x.width || x.height) ? await confirm({ message: 'یک پروژهٔ جدید و خالی ساخته شود؟ پروژهٔ فعلی ذخیره باقی می‌ماند.' }) : true;
    if (!ok) return;
    setNewName(`پروژه ${jalaliShort()}`);
  };
  const createProject = async (name: string): Promise<void> => {
    const np = emptyProject(name.trim() || `پروژه ${jalaliShort()}`);
    await db.saveProject(np);
    await db.setMeta('lastProjectId', np.id);
    setProject(np);
    setSelected(null);
    setNewName(null);
    toast('پروژهٔ جدید ساخته شد', 'ok');
  };
  const openProject = async (id: string): Promise<void> => {
    const p = await db.loadProject(id);
    if (p) {
      setProject(normalizeUnit(p));
      await db.setMeta('lastProjectId', p.id);
      setSelected(null);
      setShowProjects(false);
      toast(`پروژهٔ «${p.name}» باز شد`, 'ok');
    }
  };
  const deleteProject = async (id: string): Promise<void> => {
    await db.deleteProject(id);
    await refreshList();
    toast('پروژه حذف شد', 'ok');
  };
  const saveProjectAs = async (): Promise<void> => {
    await db.saveProject(project);
    await refreshList();
    toast('پروژه ذخیره شد', 'ok');
  };
  const exportProject = (): void => {
    downloadText(`${safeName(project.name)}.brw.json`, JSON.stringify(project, null, 0), 'application/json');
  };
  const importProject = async (): Promise<void> => {
    const file = await pickFile('.json,application/json,.brw.json');
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const p = sanitizeProject(raw);
      if (!p) throw new Error('bad');
      setProject(p);
      setSelected(null);
      toast('پروژه با موفقیت بارگذاری شد', 'ok');
    } catch {
      toast('فایل پروژه معتبر نیست', 'err');
    }
  };
  const exportPdf = (): void => {
    if (!project.result) return toast('ابتدا برش را بهینه‌سازی کنید', 'err');
    if (!openReport(buildReportHtml(project, project.result))) toast('مرورگر بازشدن پنجرهٔ گزارش را مسدود کرد', 'err');
  };
  const exportPng = async (fmt: 'png' | 'jpg'): Promise<void> => {
    if (!project.result) return toast('ابتدا برش را بهینه‌سازی کنید', 'err');
    try {
      await exportImage(project, project.result, fmt);
    } catch {
      toast('خروجی گرفتن تصویر ناموفق بود', 'err');
    }
  };

  const projectMenu: MenuItem[] = [
    { label: 'پروژهٔ جدید', icon: 'filePlus', onClick: () => void newProject() },
    { label: 'ذخیرهٔ پروژه', icon: 'file', onClick: () => void saveProjectAs() },
    {
      label: 'بارگذاری پروژه',
      icon: 'folder',
      onClick: () => {
        void refreshList();
        setShowProjects(true);
      },
    },
    { divider: true, label: '' },
    { label: 'خروجی پروژه (JSON)', icon: 'download', onClick: exportProject },
    { label: 'ورودی پروژه (JSON)', icon: 'upload', onClick: () => void importProject() },
    { divider: true, label: '' },
    { label: 'خروجی PDF', icon: 'file', onClick: exportPdf },
    { label: 'خروجی تصویر PNG', icon: 'image', onClick: () => void exportPng('png') },
    { divider: true, label: '' },
    { label: 'گزارش مشکل', icon: 'alert', onClick: () => setShowIssue(true) },
    { label: 'دربارهٔ برنامه', icon: 'info', onClick: () => setShowAbout(true) },
  ];

  /* ---------------- cut-map interactions ---------------- */
  const withResult = (fn: (sol: Solution) => void): void => {
    if (project.result) fn(project.result);
  };

  const rotatePiece = (si: number, key: string): void => {
    withResult((sol) => {
      const sh = sol.sheets[si];
      const p = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === key);
      if (!p) return;
      const pins = pinsFromSolution(sol).filter((x) => !(x.pieceId === p.pieceId && x.instance === p.instance));
      const forced = project.forced.filter((f) => !(f.pieceId === p.pieceId && f.instance === p.instance));
      forced.push({ pieceId: p.pieceId, instance: p.instance, rotated: !p.rotated });
      setProject((cur) => ({ ...cur, forced }));
      reoptimizeFromResult(pins);
    });
  };

  const togglePin = (si: number, key: string): void => {
    withResult((sol) => {
      const sh = sol.sheets[si];
      const p = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === key);
      if (!p) return;
      const pins = pinsFromSolution(sol);
      const already = pins.some((x) => x.pieceId === p.pieceId && x.instance === p.instance);
      const next = already
        ? pins.filter((x) => !(x.pieceId === p.pieceId && x.instance === p.instance))
        : [...pins, { pieceId: p.pieceId, instance: p.instance, slot: sh.index, stockId: sh.stockId, x: p.x, y: p.y, w: p.w, h: p.h, rotated: p.rotated }];
      reoptimizeFromResult(next);
    });
  };

  const deletePieceFromLayout = (si: number, key: string): void => {
    withResult((sol) => {
      const sh = sol.sheets[si];
      const p = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === key);
      if (!p) return;
      patch((cur) => ({ ...cur, pieces: cur.pieces.map((x) => (x.id === p.pieceId ? { ...x, qty: Math.max(0, x.qty - 1) } : x)) }));
      const pins = pinsFromSolution(sol).filter((x) => !(x.pieceId === p.pieceId && x.instance === p.instance));
      setTimeout(() => reoptimizeFromResult(pins), 0);
    });
  };

  const movePiece = (si: number, key: string, x: number, y: number): boolean => {
    let ok = false;
    withResult((sol) => {
      const sh = sol.sheets[si];
      const p = sh.placements.find((q) => `${q.pieceId}#${q.instance}` === key);
      if (!p) return;
      const nx = Math.max(0, Math.min(sh.width - p.w, Math.round(x * 100) / 100));
      const ny = Math.max(0, Math.min(sh.height - p.h, Math.round(y * 100) / 100));
      const kerf = project.settings.kerf;
      const overlap = sh.placements.some((q) => {
        if (q === p) return false;
        return !(nx + p.w + kerf <= q.x || q.x + q.w + kerf <= nx || ny + p.h + kerf <= q.y || q.y + q.h + kerf <= ny);
      });
      if (nx + p.w > sh.width + 1e-6 || ny + p.h > sh.height + 1e-6 || overlap) {
        ui.toast('جابه‌جایی ممکن نیست: با قطعهٔ دیگر یا لبهٔ ورق تداخل دارد', 'err');
        return;
      }
      ok = true;
      const pins = pinsFromSolution(sol).filter((v) => !(v.pieceId === p.pieceId && v.instance === p.instance));
      pins.push({ pieceId: p.pieceId, instance: p.instance, slot: sh.index, stockId: sh.stockId, x: nx, y: ny, w: p.w, h: p.h, rotated: p.rotated });
      reoptimizeFromResult(pins);
    });
    return ok;
  };

  const stale = isStale(effProject);
  // table swatches use a deeper tone than the cut map's pastel pieces so the rows read clearly
  const colorOf = (i: number): string => `hsl(${(i * 47 + 168) % 360} 55% ${i % 2 ? 62 : 68}%)`;

  if (!loaded) return <div className="app" />;

  return (
    <UiContext.Provider value={ui}>
      <div className="app">
        <header className="topbar">
          <span className="brand">
            <Icon name="scissors" />
          </span>
          <h1>
            {project.name}
            <span className="sub">برش‌یار شیشه — بهینه‌سازی برش دوبعدی</span>
          </h1>
          <button className="icon-btn top" onClick={() => setShowSettings(true)} aria-label="تنظیمات" title="تنظیمات">
            <Icon name="settings" />
          </button>
          <Menu icon="dots" label="منوی پروژه" items={projectMenu} />
        </header>

        <div className="container">
          <div className="col-left">
            <ItemTable
              title="صفحه‌ها"
              kind="pieces"
              rows={rowsOf('pieces')}
              colorOf={colorOf}
              showGrain={effProject.settings.considerGrain}
              showLabel={effProject.settings.showLabels}
              emptyText="هنوز قطعه‌ای اضافه نکرده‌اید. با دکمهٔ «افزودن» شروع کنید."
              menu={pieceMenu('pieces')}
              onAddBlank={() => addBlank('pieces')}
              onChange={(id, d) => updateRow('pieces', id, d)}
              onGrain={cycleGrain}
              onToggle={(id) => toggleRow('pieces', id)}
              onDelete={(id) => removeRow('pieces', id)}
              onSwap={(id) => swapRow('pieces', id)}
              onSwapAll={() => swapAll('pieces')}
              selectedId={selectedPieceId}
            />
            <ItemTable
              title="موجودی"
              kind="stock"
              rows={rowsOf('stock')}
              showGrain={false}
              showLabel={effProject.settings.showLabels}
              emptyText="هنوز ورقی به موجودی اضافه نکرده‌اید."
              menu={pieceMenu('stock')}
              onAddBlank={() => addBlank('stock')}
              onChange={(id, d) => updateRow('stock', id, d)}
              onGrain={cycleGrain}
              onToggle={(id) => toggleRow('stock', id)}
              onDelete={(id) => removeRow('stock', id)}
              onSwap={(id) => swapRow('stock', id)}
              onSwapAll={() => swapAll('stock')}
            />
            <section className="card options-card">
              <div className="form pad">
                <Toggle
                  label="نمایش برچسب‌ها روی نقشه برش"
                  checked={effProject.settings.showLabels}
                  onChange={(v) => patch((p) => ({ ...p, settings: { ...p.settings, showLabels: v } }))}
                />
                <Toggle
                  label="جهت دانه‌ها را در نظر بگیر"
                  hint="خاموش: هر قطعه آزادانه ۹۰° می‌چرخد — روشن: طبق تنظیم «جهت دانه» هر قطعه"
                  checked={effProject.settings.considerGrain}
                  onChange={(v) => patch((p) => ({ ...p, settings: { ...p.settings, considerGrain: v } }))}
                />
              </div>
            </section>
          </div>

          <div className="col-right">
            {project.result ? (
              <>
                {sheetGroups(project.result).map((g, i) => (
                  <CutMap
                    key={g.index}
                    project={effProject}
                    solution={project.result!}
                    sheetIndex={g.index}
                    position={i + 1}
                    count={g.count}
                    selected={selected}
                    onSelect={setSelected}
                    showCuts={project.view.showCuts}
                    onToggleCuts={() => patch((p) => ({ ...p, view: { ...p.view, showCuts: !p.view.showCuts } }))}
                    onMove={movePiece}
                    view={mapView}
                    showToolbar={i === 0}
                    resetToken={mapResetToken}
                    {...mapApi}
                  />
                ))}
                <div className="after-maps">
                  <GlobalStats sol={project.result} unit={project.unit} />
                  <SheetStatsPager sol={project.result} unit={project.unit} />
                  <UnplacedList sol={project.result} unit={project.unit} />
                </div>
              </>
            ) : (
              <section className="card">
                <div className="pad" style={{ textAlign: 'center', color: '#64748b', padding: '40px 16px' }}>
                  <Icon name="layers" size={38} />
                  <p style={{ marginTop: 10 }}>برای دیدن نقشهٔ برش و آمار، دکمهٔ «بهینه‌سازی برش» را در پایین صفحه بزنید.</p>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="optimize-bar">
          {stale ? <div className="stale-note">ورودی‌ها تغییر کرده‌اند — نتیجهٔ قبلی به‌روز نیست</div> : null}
          <button className="optimize-btn" onClick={() => (running ? cancelOptimize() : runOptimize())} disabled={false}>
            {running ? (
              <>
                <span className="spin">
                  <Icon name="flask" size={20} />
                </span>
                در حال محاسبه… {Math.round(progress * 100)}٪ (برای توقف بزنید)
              </>
            ) : (
              <>
                <Icon name="scissors" size={20} />
                بهینه‌سازی برش
              </>
            )}
          </button>
        </div>

        {warehouseKind ? (
          <Modal title={`انبار ابعاد — ${warehouseKind === 'pieces' ? 'صفحه‌ها' : 'موجودی'}`} onClose={() => { setWarehouseKind(null); setWarehouseSelected([]); }} footer={
            <>
              <button className="btn btn-danger" disabled={!warehouse.filter((x) => x.kind === warehouseKind).length} onClick={() => void removeAllWarehouse()}><Icon name="trash" size={16} /> حذف همه</button>
              <button className="btn btn-primary" disabled={!warehouseSelected.length} onClick={importFromWarehouse}>افزودن انتخاب‌شده‌ها</button>
            </>
          }>
            {warehouse.filter((x) => x.kind === warehouseKind).length === 0 ? (
              <div className="warehouse-empty">انبار این بخش خالی است. ابتدا ابعاد را با «ذخیره در انبار» ذخیره کنید.</div>
            ) : (
              <div className="warehouse-list">
                {warehouse.filter((x) => x.kind === warehouseKind).map((x) => (
                  <div key={x.id} className="warehouse-row">
                    <input type="checkbox" checked={warehouseSelected.includes(x.id)} onChange={(e) => setWarehouseSelected((v) => e.target.checked ? [...v, x.id] : v.filter((id) => id !== x.id))} />
                    <span><b>{x.width} × {x.height}</b><small>{x.qty} عدد{x.label ? ` — ${x.label}` : ''}</small></span>
                    <button className="warehouse-delete" title="حذف این ابعاد" aria-label="حذف این ابعاد" onClick={() => void removeWarehouseItem(x.id)}><Icon name="trash" size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        ) : null}

        {showSettings ? (
          <Modal title="تنظیمات" onClose={() => setShowSettings(false)} footer={<button className="btn btn-primary" onClick={() => setShowSettings(false)}>تأیید</button>}>
            <SettingsCard project={effProject} onSettings={(patchS) => patch((p) => ({ ...p, settings: { ...p.settings, ...patchS } }))} />
          </Modal>
        ) : null}
        {newName !== null ? (
          <Modal
            title="پروژهٔ جدید"
            onClose={() => setNewName(null)}
            footer={
              <>
                <button className="btn btn-primary" onClick={() => void createProject(newName)}>
                  ساخت پروژه
                </button>
                <button className="btn btn-ghost" onClick={() => setNewName(null)}>
                  انصراف
                </button>
              </>
            }
          >
            <label className="field">
              <span>نام پروژه</span>
              <input
                autoFocus
                dir="rtl"
                style={{ direction: 'rtl', textAlign: 'right' }}
                value={newName}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createProject(newName);
                }}
              />
            </label>
          </Modal>
        ) : null}
        {showProjects ? <ProjectPanel list={projList} currentId={project.id} onOpen={openProject} onDelete={deleteProject} onClose={() => setShowProjects(false)} /> : null}
        {showAbout ? <AboutDialog onClose={() => setShowAbout(false)} /> : null}
        {showIssue ? <ReportIssueDialog onClose={() => setShowIssue(false)} /> : null}
        <div className="toast-wrap">
          {confirmState ? (
            <div className={'confirm-notice' + (confirmState.opts.danger ? ' danger' : '')} role="alertdialog" aria-modal="false" aria-label={confirmState.opts.title ?? 'تأیید عملیات'}>
              <div className="confirm-notice-icon"><Icon name={confirmState.opts.danger ? 'trash' : 'alert'} size={20} /></div>
              <div className="confirm-notice-content">
                <strong>{confirmState.opts.title ?? 'تأیید عملیات'}</strong>
                <span>{confirmState.opts.message}</span>
                <div className="confirm-notice-actions">
                  <button
                    className="btn btn-danger sm"
                    onClick={() => {
                      confirmState.resolve(true);
                      setConfirmState(null);
                    }}
                  >
                    {confirmState.opts.ok ?? 'تأیید'}
                  </button>
                  <button
                    className="btn btn-ghost sm"
                    onClick={() => {
                      confirmState.resolve(false);
                      setConfirmState(null);
                    }}
                  >
                    انصراف
                  </button>
                </div>
              </div>
              <button
                className="confirm-notice-close"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                aria-label="انصراف"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ) : null}
          {toasts.map((t) => (
            <div key={t.id} className={'toast ' + t.kind}>
              {t.msg}
            </div>
          ))}
        </div>
      </div>
    </UiContext.Provider>
  );
}

export { parseNum };
