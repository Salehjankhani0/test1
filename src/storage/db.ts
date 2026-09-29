/** IndexedDB persistence (falls back to localStorage when IndexedDB is unavailable). */
import type { Project } from '../domain/model.ts';

const DB_NAME = 'glass-cut-db';
const STORE = 'projects';
const META = 'meta';

export interface WarehouseItem {
  id: string;
  width: number;
  height: number;
  qty: number;
  label: string;
  kind: 'pieces' | 'stock';
  grain?: 'free' | 'horizontal' | 'vertical';
  savedAt: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  pieces: number;
  stock: number;
  hasResult: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let useLS = false;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

const lsKey = (id: string): string => 'gc:project:' + id;

export async function saveProject(p: Project): Promise<void> {
  if (!useLS) {
    try {
      await tx(STORE, 'readwrite', (s) => s.put(p));
      return;
    } catch {
      useLS = true;
    }
  }
  localStorage.setItem(lsKey(p.id), JSON.stringify(p));
}

export async function loadProject(id: string): Promise<Project | null> {
  if (!useLS) {
    try {
      return ((await tx(STORE, 'readonly', (s) => s.get(id))) as Project | undefined) ?? null;
    } catch {
      useLS = true;
    }
  }
  const raw = localStorage.getItem(lsKey(id));
  return raw ? (JSON.parse(raw) as Project) : null;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  let all: Project[] = [];
  if (!useLS) {
    try {
      all = (await tx(STORE, 'readonly', (s) => s.getAll())) as Project[];
    } catch {
      useLS = true;
    }
  }
  if (useLS) {
    all = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gc:project:')) all.push(JSON.parse(localStorage.getItem(k) ?? 'null') as Project);
    }
  }
  return all
    .filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, pieces: p.pieces.length, stock: p.stock.length, hasResult: !!p.result }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  if (!useLS) {
    try {
      await tx(STORE, 'readwrite', (s) => s.delete(id));
      return;
    } catch {
      useLS = true;
    }
  }
  localStorage.removeItem(lsKey(id));
}

export async function getMeta(key: string): Promise<string | null> {
  if (!useLS) {
    try {
      return ((await tx(META, 'readonly', (s) => s.get(key))) as string | undefined) ?? null;
    } catch {
      useLS = true;
    }
  }
  return localStorage.getItem('gc:meta:' + key);
}

export async function setMeta(key: string, value: string): Promise<void> {
  if (!useLS) {
    try {
      await tx(META, 'readwrite', (s) => s.put(value, key));
      return;
    } catch {
      useLS = true;
    }
  }
  localStorage.setItem('gc:meta:' + key, value);
}


const WAREHOUSE_META_KEY = 'warehouseItems';
export async function listWarehouse(): Promise<WarehouseItem[]> {
  const raw = await getMeta(WAREHOUSE_META_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function saveWarehouseItems(items: WarehouseItem[]): Promise<void> {
  await setMeta(WAREHOUSE_META_KEY, JSON.stringify(items));
}
