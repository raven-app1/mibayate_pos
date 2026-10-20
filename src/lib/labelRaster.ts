export interface RasterTextRun {
  text: string;
  xDots: number;
  yDots: number;
  widthDots: number;
  heightDots?: number;
  px: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  maxLines?: number;
}

export interface RasterImage {
  widthDots: number;
  widthBytes: number;
  heightDots: number;
  data: Uint8Array;
}

export interface PositionedRasterImage extends RasterImage {
  xDots: number;
  yDots: number;
}

export interface RasterTextBlock {
  image: RasterImage;
  heightDots: number;
}

const FONT_FAMILY = 'MiBayate Myanmar Print';
const FONT_STACK = `"${FONT_FAMILY}", "Noto Sans Myanmar", "Myanmar Text", "Padauk", sans-serif`;
const LINE_RATIO = 1.6;

let fontPromise: Promise<void> | null = null;
let measureCanvas: HTMLCanvasElement | null = null;

export function hasNonAscii(value: string): boolean {
  return /[^\x20-\x7E]/.test(value || '');
}

export function canRasterizeText(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function ensureLabelFont(): Promise<void> {
  if (!canRasterizeText() || typeof FontFace === 'undefined' || !document.fonts) {
    return Promise.resolve();
  }
  if (!fontPromise) {
    fontPromise = (async () => {
      const base = document.baseURI || `${window.location.origin}/`;
      const href = new URL('fonts/NotoSansMyanmar.woff2', base).href;
      const face = new FontFace(
        FONT_FAMILY,
        `url("${href}") format("woff2")`,
        { weight: '100 900', style: 'normal' },
      );
      await face.load();
      document.fonts.add(face);
      await document.fonts.load(`400 24px "${FONT_FAMILY}"`, '\u1019\u103C\u1014\u103A\u1019\u102C');
      await document.fonts.load(`700 24px "${FONT_FAMILY}"`, '\u1019\u103C\u1014\u103A\u1019\u102C');
    })().catch(() => {
      fontPromise = null;
    });
  }
  return Promise.race([
    fontPromise,
    new Promise<void>(resolve => setTimeout(resolve, 2500)),
  ]);
}

function fontFor(px: number, bold: boolean): string {
  return `${bold ? 700 : 400} ${Math.max(8, Math.round(px))}px ${FONT_STACK}`;
}

function measuringContext(): CanvasRenderingContext2D | null {
  if (!canRasterizeText()) return null;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  return measureCanvas.getContext('2d');
}

function splitGraphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: string }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) {
    try {
      return Array.from(new Segmenter('my', { granularity: 'grapheme' }).segment(value), part => part.segment);
    } catch {}
  }
  return Array.from(value);
}

interface TextLayout {
  font: string;
  px: number;
  lineHeight: number;
  lines: string[];
}

function layoutText(ctx: CanvasRenderingContext2D, run: RasterTextRun): TextLayout {
  let px = Math.max(9, Math.round(run.px));
  if (run.heightDots && run.heightDots > 0) {
    px = Math.min(px, Math.max(9, Math.floor(run.heightDots / LINE_RATIO)));
  }
  const font = fontFor(px, !!run.bold);
  const lineHeight = Math.max(px + 3, Math.round(px * LINE_RATIO));
  const maxByHeight = run.heightDots && run.heightDots > 0
    ? Math.max(1, Math.floor(run.heightDots / lineHeight))
    : 999;
  const maxLines = Math.max(1, Math.min(run.maxLines ?? 999, maxByHeight));

  ctx.font = font;
  const maxWidth = Math.max(8, run.widthDots - 4);
  const normalized = (run.text || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return { font, px, lineHeight, lines: [] };

  const fits = (value: string) => ctx.measureText(value).width <= maxWidth;
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    if (fits(word)) {
      current = word;
      continue;
    }
    let piece = '';
    for (const grapheme of splitGraphemes(word)) {
      const test = piece + grapheme;
      if (piece && !fits(test)) {
        lines.push(piece);
        piece = grapheme;
      } else {
        piece = test;
      }
    }
    current = piece;
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = splitGraphemes(lines[lines.length - 1]);
    while (last.length > 0 && !fits(`${last.join('')}\u2026`)) last.pop();
    lines[lines.length - 1] = `${last.join('')}\u2026`;
  }

  return { font, px, lineHeight, lines };
}

function packCanvas(ctx: CanvasRenderingContext2D, widthDots: number, heightDots: number): RasterImage {
  const widthBytes = Math.ceil(widthDots / 8);
  const data = new Uint8Array(widthBytes * heightDots);
  const pixels = ctx.getImageData(0, 0, widthDots, heightDots).data;

  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      const index = (y * widthDots + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha < 64) continue;
      const luminance = (pixels[index] * 299 + pixels[index + 1] * 587 + pixels[index + 2] * 114) / 1000;
      if (luminance < 160) {
        data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return { widthDots, widthBytes, heightDots, data };
}

export function measureTextBlockHeight(run: RasterTextRun): number {
  const ctx = measuringContext();
  if (!ctx) return 0;
  const layout = layoutText(ctx, run);
  return layout.lines.length * layout.lineHeight;
}

export function renderTextBlock(run: RasterTextRun): RasterTextBlock | null {
  if (!canRasterizeText()) return null;
  const measure = measuringContext();
  if (!measure) return null;

  const layout = layoutText(measure, run);
  if (layout.lines.length === 0) return null;

  measure.font = layout.font;
  const lineWidths = layout.lines.map(line => measure.measureText(line).width);
  const maxLineWidth = Math.max(...lineWidths);
  const align = run.align ?? 'left';
  const trimmed = align === 'left';
  const widthDots = trimmed
    ? Math.min(run.widthDots, Math.max(1, Math.ceil(maxLineWidth) + 3))
    : Math.max(1, run.widthDots);
  const heightDots = layout.lines.length * layout.lineHeight;

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, widthDots, heightDots);
  ctx.font = layout.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';

  layout.lines.forEach((line, index) => {
    const width = ctx.measureText(line).width;
    let x = 1;
    if (align === 'center') x = (widthDots - width) / 2;
    else if (align === 'right') x = widthDots - width - 1;
    x = Math.max(1, x);
    const baseline = index * layout.lineHeight + Math.round(layout.px * 1.12);
    ctx.fillText(line, x, baseline);
  });

  const image = packCanvas(ctx, widthDots, heightDots);
  return { image, heightDots };
}

export function renderTextLayer(
  runs: RasterTextRun[],
  widthDots: number,
  heightDots: number,
): RasterImage | null {
  if (!canRasterizeText() || widthDots <= 0 || heightDots <= 0) return null;
  const ctx = measuringContext();
  if (!ctx) return null;

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const layer = canvas.getContext('2d');
  if (!layer) return null;

  layer.fillStyle = '#fff';
  layer.fillRect(0, 0, widthDots, heightDots);
  layer.textBaseline = 'alphabetic';
  layer.textAlign = 'left';
  layer.fillStyle = '#000';

  for (const run of runs) {
    const layout = layoutText(layer, run);
    if (layout.lines.length === 0) continue;
    layer.font = layout.font;
    layout.lines.forEach((line, index) => {
      const width = layer.measureText(line).width;
      let x = run.xDots + 1;
      if (run.align === 'center') x = run.xDots + (run.widthDots - width) / 2;
      else if (run.align === 'right') x = run.xDots + run.widthDots - width - 1;
      const baseline = run.yDots + index * layout.lineHeight + Math.round(layout.px * 1.12);
      if (baseline >= 0 && baseline - layout.px < heightDots) {
        layer.fillText(line, Math.max(1, x), baseline);
      }
    });
  }

  return packCanvas(layer, widthDots, heightDots);
}

export function cropRaster(image: RasterImage): PositionedRasterImage | null {
  let minX = image.widthDots;
  let maxX = -1;
  let minY = image.heightDots;
  let maxY = -1;

  for (let y = 0; y < image.heightDots; y++) {
    for (let byteIndex = 0; byteIndex < image.widthBytes; byteIndex++) {
      const byte = image.data[y * image.widthBytes + byteIndex];
      if (!byte) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let bit = 0; bit < 8; bit++) {
        if (!(byte & (0x80 >> bit))) continue;
        const x = byteIndex * 8 + bit;
        if (x >= image.widthDots) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  const startX = minX & ~7;
  const widthDots = maxX - startX + 1;
  const widthBytes = Math.ceil(widthDots / 8);
  const heightDots = maxY - minY + 1;
  const data = new Uint8Array(widthBytes * heightDots);

  for (let y = 0; y < heightDots; y++) {
    const sourceY = minY + y;
    for (let x = 0; x < widthDots; x++) {
      const sourceX = startX + x;
      const sourceByte = image.data[sourceY * image.widthBytes + (sourceX >> 3)];
      if (sourceByte & (0x80 >> (sourceX & 7))) {
        data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return { xDots: startX, yDots: minY, widthDots, widthBytes, heightDots, data };
}
