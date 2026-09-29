/**
 * Public types of the cutting engine.
 * The engine is framework-agnostic: no DOM, no React – it runs in a Web Worker,
 * on the main thread, or in Node (tests).
 */

export type GrainMode = 'free' | 'horizontal' | 'vertical';
export type Priority = 'minWaste' | 'minCut' | 'minSheets' | 'maxUtilization' | 'smart';

/**
 * A required piece row.
 * Convention: `width` (عرض) runs along the sheet width (x) and `height` (طول) along the
 * sheet length (y) when the piece is NOT rotated.
 *   vertical   -> piece length stays parallel to the sheet length (never rotated)
 *   horizontal -> piece length runs along the sheet width (rotated 90°)
 *   free       -> both orientations are allowed
 */
export interface PieceSpec {
  id: string;
  width: number;
  height: number;
  qty: number;
  label: string;
  grain: GrainMode;
  enabled: boolean;
  /** reserved for future versions (glass type / thickness / price) */
  material?: string;
  thickness?: number;
}

export interface StockSpec {
  id: string;
  width: number;
  height: number;
  qty: number;
  label: string;
  enabled: boolean;
  /** reserved for future versions */
  material?: string;
  thickness?: number;
  pricePerArea?: number;
}

export interface EngineOptions {
  /** kerf (blade thickness) in the same unit as the dimensions */
  kerf: number;
  /** when true, per-piece grain modes are respected, otherwise every piece may rotate */
  considerGrain: boolean;
  /** use at most ONE physical sheet from stock */
  singleSheet: boolean;
  priority: Priority;
  /** min side of a leftover rectangle to count as a reusable offcut (0 = disabled) */
  minOffcut?: number;
  /** direction of the guillotine cuts chosen by the optimizer (NOT sheet/piece rotation):
   *  'auto' searches every split heuristic and keeps whichever scores best (default),
   *  'width' forces every first cut to run the full width of the sheet,
   *  'length' forces every first cut to run the full length of the sheet */
  cutDirection?: 'auto' | 'width' | 'length';
}

/** A piece fixed by the user (locked / manually moved) */
export interface Pin {
  pieceId: string;
  instance?: number;
  /** sheet index in the previous solution (only used to group pins per sheet) */
  slot: number;
  stockId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

/** Orientation forced by the user for one instance of a piece */
export interface ForcedOrient {
  pieceId: string;
  instance: number;
  rotated: boolean;
}

export interface EngineInput {
  pieces: PieceSpec[];
  stock: StockSpec[];
  options: EngineOptions;
  pins?: Pin[];
  forced?: ForcedOrient[];
}

export interface OptimizeSettings {
  seed?: number;
  /** wall-clock budget in ms (default 2500) */
  maxMs?: number;
  /** simulated-annealing iterations (default depends on problem size) */
  maxIterations?: number;
  onProgress?: (ratio: number) => void;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedPiece {
  pieceId: string;
  instance: number;
  label: string;
  x: number;
  y: number;
  /** placed size (already rotated) */
  w: number;
  h: number;
  rotated: boolean;
  pinned: boolean;
}

export interface CutLine {
  /** 1-based suggested cutting order */
  order: number;
  orientation: 'H' | 'V';
  /** start point of the cut (the kerf band starts here) */
  x: number;
  y: number;
  length: number;
}

export interface SheetResult {
  index: number;
  stockId: string;
  stockLabel: string;
  width: number;
  height: number;
  placements: PlacedPiece[];
  cuts: CutLine[];
  freeRects: Rect[];
  sheetArea: number;
  usedArea: number;
  wasteArea: number;
  /** 0..1 */
  utilization: number;
  pieceCount: number;
  cutCount: number;
  cutLength: number;
}

export interface UnplacedPiece {
  pieceId: string;
  instance: number;
  label: string;
  width: number;
  height: number;
  reason: 'tooLarge' | 'noStock';
}

export interface StockUsage {
  stockId: string;
  label: string;
  width: number;
  height: number;
  count: number;
}

export interface GlobalStats {
  sheetCount: number;
  sheetsByStock: StockUsage[];
  usedArea: number;
  totalSheetArea: number;
  wasteArea: number;
  utilization: number;
  wastePercent: number;
  reusableArea: number;
  cutCount: number;
  cutLength: number;
  kerf: number;
  priority: Priority;
  pieceCount: number;
  placedCount: number;
  unplacedCount: number;
}

export interface Solution {
  sheets: SheetResult[];
  unplaced: UnplacedPiece[];
  stats: GlobalStats;
  warnings: string[];
  meta: {
    choice: string;
    split: string;
    stockRule: string;
    iterations: number;
    candidates: number;
    ms: number;
    energy: number;
  };
  createdAt: number;
}
