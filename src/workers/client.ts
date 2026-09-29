/** Runs the engine in a Web Worker (falls back to the main thread if a worker cannot be created or fails to load). */
import { optimize } from '../engine/index.ts';
import type { EngineInput, OptimizeSettings, Solution } from '../engine/index.ts';

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    w.addEventListener('error', () => {
      // the worker script failed to load/execute (e.g. bundler/browser without module-worker support) –
      // stop trying and let every future call fall back to the main thread.
      workerBroken = true;
      worker = null;
    });
    worker = w;
    return w;
  } catch {
    workerBroken = true;
    return null;
  }
}

export interface Job {
  promise: Promise<Solution>;
  cancel: () => void;
}

function runOnMainThread(input: EngineInput, settings: OptimizeSettings): Job {
  let cancelled = false;
  const promise = new Promise<Solution>((resolve, reject) => {
    setTimeout(() => {
      if (cancelled) return reject(new Error('cancelled'));
      try {
        resolve(optimize(input, { ...settings, onProgress: undefined }));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, 30);
  });
  return { promise, cancel: () => (cancelled = true) };
}

export function optimizeAsync(input: EngineInput, settings: OptimizeSettings, onProgress?: (r: number) => void): Job {
  const w = getWorker();
  if (!w) return runOnMainThread(input, settings);

  const id = ++seq;
  let settled = false;
  let onMsg: ((e: MessageEvent) => void) | null = null;
  let onErr: (() => void) | null = null;
  let rejectFn: (e: Error) => void = () => undefined;
  let fallbackTimer = 0;

  const promise = new Promise<Solution>((resolve, reject) => {
    rejectFn = reject;
    const cleanup = (): void => {
      window.clearTimeout(fallbackTimer);
      if (onMsg) w.removeEventListener('message', onMsg);
      if (onErr) w.removeEventListener('error', onErr);
    };
    onMsg = (e: MessageEvent) => {
      const m = e.data as { id: number; type: string; ratio?: number; solution?: Solution; message?: string };
      if (m.id !== id) return;
      if (m.type === 'progress') {
        window.clearTimeout(fallbackTimer);
        onProgress?.(m.ratio ?? 0);
      } else if (m.type === 'done') {
        settled = true;
        cleanup();
        resolve(m.solution!);
      } else if (m.type === 'error') {
        settled = true;
        cleanup();
        reject(new Error(m.message));
      }
    };
    onErr = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // the worker died mid-flight: retry once synchronously on the main thread
      runOnMainThread(input, settings).promise.then(resolve, reject);
    };
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    w.postMessage({ id, input, settings: { ...settings, onProgress: undefined } });
    // safety net: if the worker never answers at all (e.g. silently failed to load the module
    // in an environment that doesn't support module workers) fall back after a short wait
    fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      runOnMainThread(input, settings).promise.then(resolve, reject);
    }, 1200);
  });

  const cancel = (): void => {
    if (settled) return;
    settled = true;
    window.clearTimeout(fallbackTimer);
    if (onMsg) w.removeEventListener('message', onMsg);
    if (onErr) w.removeEventListener('error', onErr);
    // the only way to stop a running worker mid-computation is to terminate it
    w.terminate();
    worker = null;
    rejectFn(new Error('cancelled'));
  };
  return { promise, cancel };
}
