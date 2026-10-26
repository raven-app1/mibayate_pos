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

export interface RasterBar {
  xDots: number;
  yDots: number;
  widthDots: number;
  heightDots: number;
}

const FONT_FAMILY = 'MiBayate Myanmar Print';
const FONT_STACK = `"${FONT_FAMILY}", "Noto Sans Myanmar", "Myanmar Text", "Padauk", sans-serif`;
const LINE_RATIO = 1.6;

const SUPPORTED_RANGES: Array<[number, number]> = [
  [0x20, 0x7e],
  [0xa0, 0xa3],
  [0xa5, 0xa5],
  [0xa7, 0xab],
  [0xae, 0xb0],
  [0xb4, 0xb4],
  [0xb6, 0xb8],
  [0xba, 0xbb],
  [0xbf, 0x107],
  [0x10a, 0x113],
  [0x116, 0x11b],
  [0x11e, 0x123],
  [0x126, 0x127],
  [0x12a, 0x12b],
  [0x12e, 0x133],
  [0x136, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14a, 0x14d],
  [0x150, 0x15b],
  [0x15e, 0x161],
  [0x164, 0x165],
  [0x16a, 0x17e],
  [0x1cd, 0x1ce],
  [0x218, 0x21b],
  [0x237, 0x237],
  [0x2c6, 0x2c7],
  [0x2c9, 0x2c9],
  [0x2d8, 0x2dd],
  [0x300, 0x304],
  [0x306, 0x308],
  [0x30a, 0x30c],
  [0x312, 0x312],
  [0x326, 0x328],
  [0x1000, 0x109f],
  [0x1e80, 0x1e85],
  [0x1e9e, 0x1e9e],
  [0x1ef2, 0x1ef3],
  [0x200b, 0x200d],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x2039, 0x203a],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2212, 0x2212],
  [0x25cc, 0x25cc],
  [0xa92e, 0xa92e],
  [0xa9e0, 0xa9fe],
  [0xaa60, 0xaa7f],
  [0xfe00, 0xfe00],
];

const SYMBOL_REPLACEMENTS: Record<string, string> = {
  '\u00b1': '+/-',
  '\u00b5': 'u',
  '\u00bc': '1/4',
  '\u00bd': '1/2',
  '\u00be': '3/4',
  '\u00d7': 'x',
  '\u00f7': '/',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2015': '-',
  '\u2030': '%',
  '\u2032': "'",
  '\u2033': '"',
  '\u2044': '/',
  '\u20b9': 'INR',
  '\u0e3f': 'THB',
  '\u20a9': 'KRW',
  '\u20bd': 'RUB',
  '\u2190': '<-',
  '\u2192': '->',
  '\u2191': '^',
  '\u2193': 'v',
  '\u221e': 'inf',
  '\u2260': '!=',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u25a0': '#',
  '\u25cf': '*',
  '\u2605': '*',
  '\u2606': '*',
  '\u2713': 'v',
  '\u2714': 'v',
  '\u26a0': '!',
};

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
      const regular = new FontFace(
        FONT_FAMILY,
        `url("${href}") format("woff2")`,
        { weight: '400', style: 'normal' },
      );
      await regular.load();
      document.fonts.add(regular);
      const bold = new FontFace(
        FONT_FAMILY,
        `url("${href}") format("woff2")`,
        { weight: '700', style: 'normal' },
      );
      await bold.load();
      document.fonts.add(bold);
      await document.fonts.load(`400 24px "${FONT_FAMILY}"`, '\u1019\u103C\u1014\u103A\u1019\u102C');
      await document.fonts.load(`700 24px "${FONT_FAMILY}"`, '\u1019\u103C\u1014\u103A\u1019\u102C');
    })().catch(() => {
      fontPromise = null;
    });
  }
  return Promise.race([
    fontPromise,
    new Promise<void>(resolve => setTimeout(resolve, 15000)),
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

function isSupportedCodePoint(code: number): boolean {
  return SUPPORTED_RANGES.some(([start, end]) => code >= start && code <= end);
}

function sanitizePrintableText(value: string): string {
  let result = '';
  for (const char of Array.from(value || '')) {
    const code = char.codePointAt(0) ?? 0;
    if (isSupportedCodePoint(code)) {
      result += char;
    } else {
      result += SYMBOL_REPLACEMENTS[char] || '';
    }
  }
  return result;
}

function layoutText(ctx: CanvasRenderingContext2D, run: RasterTextRun): TextLayout {
  const singleLine = run.maxLines === 1;
  let px = Math.max(9, Math.round(run.px));
  if (run.heightDots && run.heightDots > 0) {
    px = singleLine
      ? Math.min(px, Math.max(9, run.heightDots - 2))
      : Math.min(px, Math.max(9, Math.floor(run.heightDots / LINE_RATIO)));
  }
  const font = fontFor(px, !!run.bold);
  const lineHeight = singleLine ? px + 2 : Math.max(px + 3, Math.round(px * LINE_RATIO));
  const maxByHeight = run.heightDots && run.heightDots > 0
    ? Math.max(1, Math.floor(run.heightDots / lineHeight))
    : 999;
  const maxLines = Math.max(1, Math.min(run.maxLines ?? 999, maxByHeight));

  ctx.font = font;
  const maxWidth = Math.max(8, run.widthDots - 4);
  const normalized = sanitizePrintableText(run.text)
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

export function renderTextLayer(
  runs: RasterTextRun[],
  widthDots: number,
  heightDots: number,
  bars: RasterBar[] = [],
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
  layer.textBaseline = 'middle';
  layer.textAlign = 'left';
  layer.fillStyle = '#000';

  for (const run of runs) {
    const layout = layoutText(layer, run);
    if (layout.lines.length === 0) continue;
    layer.font = layout.font;
    const blockHeight = layout.lines.length * layout.lineHeight;
    const boxHeight = run.heightDots && run.heightDots > 0 ? run.heightDots : blockHeight;
    const top = run.yDots + Math.max(0, Math.floor((boxHeight - blockHeight) / 2));
    layout.lines.forEach((line, index) => {
      const width = layer.measureText(line).width;
      let x = run.xDots + 1;
      if (run.align === 'center') x = run.xDots + (run.widthDots - width) / 2;
      else if (run.align === 'right') x = run.xDots + run.widthDots - width - 1;
      const centerY = top + index * layout.lineHeight + layout.lineHeight / 2;
      if (centerY - layout.px / 2 >= 0 && centerY - layout.px / 2 < heightDots) {
        layer.fillText(line, Math.max(1, x), centerY);
      }
    });
  }

  for (const bar of bars) {
    layer.fillRect(bar.xDots, bar.yDots, bar.widthDots, bar.heightDots);
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
