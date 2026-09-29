/**
 * All internal computations use integers (value * SCALE) so that decimals such as
 * 67.5 never suffer floating point drift. SCALE = 100 -> 0.01 unit resolution.
 */
export const SCALE = 100;
export const toInt = (v: number): number => Math.round(v * SCALE);
export const fromInt = (v: number): number => Math.round(v) / SCALE;
export const fromArea = (a: number): number => a / (SCALE * SCALE);

export interface Orient {
  w: number;
  h: number;
  rotated: boolean;
}

export type GrainModeLike = 'free' | 'horizontal' | 'vertical';

/** Allowed orientations of a piece (works for ints or plain numbers) */
export function allowedOrientations(
  w: number,
  h: number,
  mode: GrainModeLike,
  considerGrain: boolean,
): Orient[] {
  const r0: Orient = { w, h, rotated: false };
  const r90: Orient = { w: h, h: w, rotated: true };
  if (w === h) return [r0];
  if (!considerGrain || mode === 'free') return [r0, r90];
  return mode === 'vertical' ? [r0] : [r90];
}
