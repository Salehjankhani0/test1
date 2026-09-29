import type { Solution } from '../engine/index.ts';
import type { Project } from '../domain/model.ts';
import { downloadBlob, safeName } from './download.ts';
import { FONT, renderSheetInner, sheetBounds } from './svg.ts';
import type { RenderOpts } from './svg.ts';
import { fmt } from './numbers.ts';
import { pieceColor } from '../domain/model.ts';

export function renderOptsFor(p: Project, extra: Partial<RenderOpts> = {}): RenderOpts {
  const idx = new Map(p.pieces.map((x, i) => [x.id, i]));
  const lab = new Map(p.pieces.map((x) => [x.id, x.label]));
  return {
    unit: p.unit,
    colorOf: (id) => pieceColor(idx.get(id) ?? 0),
    labelOf: (id) => lab.get(id) ?? '',
    numOf: (id) => (idx.get(id) ?? 0) + 1,
    showLabels: p.settings.showLabels,
    detailed: true,
    showCuts: p.view.showCuts,
    kerf: p.settings.kerf,
    ...extra,
  };
}

/** All sheets stacked vertically in one high-resolution image */
export async function exportImage(p: Project, sol: Solution, format: 'png' | 'jpg'): Promise<void> {
  const W = 2000;
  const head = 110;
  let y = 0;
  let body = '';
  const total = sol.sheets.length;
  const parts: { off: number; h: number; sh: (typeof sol.sheets)[number] }[] = [];
  for (const sh of sol.sheets) {
    const vb = sheetBounds(sh);
    const h = Math.round((W * vb[3]) / vb[2]);
    parts.push({ off: y + head, h, sh });
    y += head + h + 20;
  }
  const H = y + 20;
  parts.forEach(({ off, h, sh }, i) => {
    const opts = renderOptsFor(p, { background: '#ffffff', selected: null, ghost: null, idPrefix: 'x' + i });
    const vb = sheetBounds(sh);
    body += `<text x="${W - 30}" y="${off - 40}" font-size="42" font-weight="700" text-anchor="end" fill="#0f172a">ورق ${i + 1} از ${total} — ${fmt(sh.width)} × ${fmt(sh.height)} ${p.unit} — ${p.name}</text>`;
    body += `<text x="${W - 30}" y="${off - 8}" font-size="30" text-anchor="end" fill="#475569">استفاده ${fmt(sh.utilization * 100, 1)}% — قطعات ${sh.pieceCount} — طول برش ${fmt(sh.cutLength)} ${p.unit}</text>`;
    body += `<svg x="0" y="${off}" width="${W}" height="${h}" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet">${renderSheetInner(sh, opts)}</svg>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('render'));
      img.src = url;
    });
    const scale = Math.min(1, 16000 / H);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), format === 'png' ? 'image/png' : 'image/jpeg', 0.95),
    );
    downloadBlob(`${safeName(p.name)}-cutmap.${format}`, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
