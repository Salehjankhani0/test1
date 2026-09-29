/// <reference lib="webworker" />
import { optimize } from '../engine/index.ts';
import type { EngineInput, OptimizeSettings } from '../engine/index.ts';

interface Req {
  id: number;
  input: EngineInput;
  settings: OptimizeSettings;
}

const scope = self as unknown as {
  onmessage: ((e: { data: Req }) => void) | null;
  postMessage(m: unknown): void;
};

scope.onmessage = (e) => {
  const { id, input, settings } = e.data;
  try {
    const solution = optimize(input, {
      ...settings,
      onProgress: (ratio) => scope.postMessage({ id, type: 'progress', ratio }),
    });
    scope.postMessage({ id, type: 'done', solution });
  } catch (err) {
    scope.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
