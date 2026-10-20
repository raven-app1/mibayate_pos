/**
 * ESC/POS command builder for thermal receipt printers.
 * Generates raw byte arrays to send over Bluetooth serial.
 */

function sanitizeEscPos(str: string): string {
  return (str || '').replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
}

function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(sanitizeEscPos(str));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ── Base commands ────────────────────────────────────────────────────────────

/** Initialize / reset printer to defaults */
export function init(): Uint8Array {
  return new Uint8Array([0x1b, 0x40]); // ESC @
}

/** Set code page (e.g., 'CP437', 'CP1252', 'CP850') */
export function setCodePage(page: string = 'CP437'): Uint8Array {
  const pages: Record<string, number> = {
    CP437: 0, CP850: 13, CP1252: 16, CP860: 15, CP866: 17,
    GB18030: 26, BIG5: 28, SHIFT_JIS: 31, EUC_KR: 30,
  };
  const n = pages[page.toUpperCase()] ?? 0;
  return new Uint8Array([0x1b, 0x74, n]); // ESC t n
}

// ── Text formatting ──────────────────────────────────────────────────────────

export type Align = 'left' | 'center' | 'right';

interface TextOptions {
  align?: Align;
  bold?: boolean;
  underline?: 0 | 1 | 2; // 0=off, 1=1dot, 2=2dot
  width?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  height?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  invert?: boolean;
}

export function text(str: string, opts: TextOptions = {}): Uint8Array {
  const cmds: Uint8Array[] = [];

  // Alignment
  if (opts.align) {
    const a = opts.align === 'center' ? 1 : opts.align === 'right' ? 2 : 0;
    cmds.push(new Uint8Array([0x1b, 0x61, a])); // ESC a n
  }

  // Bold
  cmds.push(new Uint8Array([0x1b, 0x45, opts.bold ? 1 : 0])); // ESC E n

  // Underline
  cmds.push(new Uint8Array([0x1b, 0x2d, opts.underline ?? 0])); // ESC - n

  // Character size (GS ! n)
  // width in upper nibble, height in lower nibble
  const w = (opts.width ?? 1) - 1;
  const h = (opts.height ?? 1) - 1;
  cmds.push(new Uint8Array([0x1d, 0x21, (w << 4) | h]));

  // Inverse (white on black)
  cmds.push(new Uint8Array([0x1d, 0x42, opts.invert ? 1 : 0])); // GS B n

  // Actual text
  cmds.push(strToBytes(str));
  cmds.push(strToBytes('\n'));

  return concat(...cmds);
}

/** Reset formatting to defaults (normal size, not bold, no underline, left) */
export function resetFormat(): Uint8Array {
  return concat(
    new Uint8Array([0x1b, 0x61, 0]), // left align
    new Uint8Array([0x1b, 0x45, 0]), // no bold
    new Uint8Array([0x1b, 0x2d, 0]), // no underline
    new Uint8Array([0x1d, 0x21, 0]), // 1x1 size
    new Uint8Array([0x1d, 0x42, 0]), // no inverse
  );
}

// ── Horizontal line / separator ──────────────────────────────────────────────

export function separator(char: string = '-', width: number = 32): Uint8Array {
  return text(char.repeat(width), { align: 'left' });
}

// ── Barcode ──────────────────────────────────────────────────────────────────

/**
 * Print a barcode using the printer's native barcode engine.
 * GS k m d1...dk NUL   (m=0..8, NUL-terminated, function A)
 * GS k m n d1...dk      (m=65..73, length-prefixed, function B)
 *
 * Barcode types (ESC/POS function A):
 *   0 = UPC-A      4 = CODE39
 *   1 = UPC-E      5 = ITF
 *   2 = EAN13      7 = CODE93
 *   3 = EAN8       8 = CODE128
 * Function B codes are function A + 65, so CODE39 = 69 and CODE128 = 73.
 */
export type BarcodeType = 'CODE39' | 'CODE128' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'ITF' | 'CODE93';

export function barcode(
  data: string,
  type: BarcodeType = 'CODE128',
  height: number = 50, // barcode bar height in dots (default ~50 dots for 58mm printers)
  hriPosition: 0 | 1 | 2 | 3 = 3, // HRI text position: 0=none, 1=above, 2=below, 3=both
  moduleWidth: number = 2, // GS w n — narrow-module width (1..6)
): Uint8Array {
  const typeMap: Record<BarcodeType, number> = {
    UPCA: 0, UPCE: 1, EAN13: 2, EAN8: 3,
    CODE39: 4, ITF: 5, CODE93: 7, CODE128: 8,
  };

  // For GS k commands, we use the "function B" variants (length-prefixed):
  // GS k m d1...dk 0   (m=0..8, NUL-terminated)
  // GS k m n d1...dk   (m=65..73, length-prefixed)
  const mB = typeMap[type] + 65; // 65-73 for function B

  const dataBytes = strToBytes(data);
  const cmds: Uint8Array[] = [];

  // Set barcode height (GS h n)
  cmds.push(new Uint8Array([0x1d, 0x68, height & 0xff]));

  // Set HRI text position (GS H n)
  cmds.push(new Uint8Array([0x1d, 0x48, hriPosition]));

  // Set barcode width (GS w n) — n=2 is common for 58mm printers
  cmds.push(new Uint8Array([0x1d, 0x77, Math.min(Math.max(moduleWidth, 1), 6)]));

  // Print barcode (function B: GS k m n d1...dk)
  const cmd = new Uint8Array(4 + dataBytes.length);
  cmd[0] = 0x1d; // GS
  cmd[1] = 0x6b; // k
  cmd[2] = mB;   // type (function B)
  cmd[3] = dataBytes.length;
  cmd.set(dataBytes, 4);
  cmds.push(cmd);

  return concat(...cmds);
}

// ── Raster barcode (self-rendered, most compatible) ──────────────────────────

// CODE39 character patterns (n = narrow 1 unit, w = wide 3 units).
// Each char is 9 elements (5 bars, 4 spaces); inter-char gap is 1 narrow unit.
const CODE39_PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw',
  'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn',
  'D': 'nnnnwwnnw',
  'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw',
  'H': 'wnnnnwwnn',
  'I': 'nnwnnwwnn',
  'J': 'nnnnwwwnn',
  'K': 'wnnnnnnnw',
  'L': 'nnwnnnnnw',
  'M': 'wnwnnnnnn',
  'N': 'nnnnwnnnw',
  'O': 'wnnnwnnnn',
  'P': 'nnwnwnnnn',
  'Q': 'nnnnnnwnw',
  'R': 'wnnnnnwnn',
  'S': 'nnwnnnwnn',
  'T': 'nnnnwnwnn',
  'U': 'wwnnnnnnw',
  'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn',
  'X': 'nwnnwnnnw',
  'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwwwnn',
};

/**
 * Build a monochrome bit-image raster for the GS v 0 command.
 * Each column is a boolean (true = print a dot); every raster row is vertical
 * bars so all rows share the same column data.
 */
export function rasterBarcode(
  value: string,
  heightDots: number,
  maxWidthDots: number,
): Uint8Array {
  const cleanVal = (value || '000000').toUpperCase().replace(/[^A-Z0-9\-\.\ \$\/\+\%]/g, '');
  const text = `*${cleanVal || '000000'}*`;

  const elements: Array<{ isBar: boolean; units: number }> = [];
  let totalUnits = 0;
  for (let i = 0; i < text.length; i++) {
    const pattern = CODE39_PATTERNS[text[i]] || CODE39_PATTERNS['0'];
    for (let p = 0; p < pattern.length; p++) {
      const isBar = p % 2 === 0;
      const units = pattern[p] === 'w' ? 3 : 1;
      elements.push({ isBar, units });
      totalUnits += units;
    }
    if (i < text.length - 1) {
      elements.push({ isBar: false, units: 1 });
      totalUnits += 1;
    }
  }

  const quiet = 10;
  const moduleW = Math.max(1, Math.min(2, Math.floor(maxWidthDots / (totalUnits + quiet * 2))));
  const widthDots = (totalUnits + quiet * 2) * moduleW;

  const columns: boolean[] = new Array(widthDots).fill(false);
  let x = quiet * moduleW;
  for (const el of elements) {
    for (let i = 0; i < el.units * moduleW; i++) {
      columns[x++] = el.isBar;
    }
  }

  const bytesPerLine = Math.ceil(widthDots / 8);
  const bitmap = new Uint8Array(bytesPerLine * heightDots);
  for (let y = 0; y < heightDots; y++) {
    for (let c = 0; c < widthDots; c++) {
      if (columns[c]) {
        bitmap[y * bytesPerLine + (c >> 3)] |= 0x80 >> (c % 8);
      }
    }
  }

  const xL = bytesPerLine & 0xff;
  const xH = (bytesPerLine >> 8) & 0xff;
  const yL = heightDots & 0xff;
  const yH = (heightDots >> 8) & 0xff;

  // GS v 0 m xL xH yL yH d1...dk (m = 0 normal)
  return concat(new Uint8Array([0x1d, 0x76, 0x30, 0, xL, xH, yL, yH]), bitmap);
}

/** Advance paper exactly past a raster image printed by GS v 0. */
export function feedRaster(n: number): Uint8Array {
  const lines = Math.floor(n / FONT_A_LINE_DOTS);
  const rem = n % FONT_A_LINE_DOTS;
  return concat(
    lines > 0 ? feed(lines) : new Uint8Array(0),
    rem > 0 ? feedDots(rem) : new Uint8Array(0),
  );
}

/** Set absolute horizontal print position in dots from the left margin. */
function setAbsoluteX(dots: number): Uint8Array {
  const n = Math.max(0, Math.round(dots)) & 0xffff;
  return new Uint8Array([0x1b, 0x24, n & 0xff, (n >> 8) & 0xff]); // ESC $ nL nH
}

/** Print one or more text lines at an absolute (x, y) position. */
function absoluteTextLines(
  lines: string[],
  xDots: number,
  size: 1 | 2,
  bold: boolean,
): Uint8Array {
  const parts: Uint8Array[] = [];
  const scale = size === 2 ? 8 : 0; // GS ! upper nibble = height scale
  for (const line of lines) {
    parts.push(setAbsoluteX(xDots));
    parts.push(new Uint8Array([0x1b, 0x45, bold ? 1 : 0]));
    parts.push(new Uint8Array([0x1d, 0x21, scale]));
    parts.push(strToBytes(line));
    parts.push(new Uint8Array([0x0a]));
  }
  return concat(...parts);
}

function mmToDots(mm: number): number {
  return Math.round(mm * DOTS_PER_MM);
}

// ── Paper control ────────────────────────────────────────────────────────────

/** Feed paper by n lines */
export function feed(n: number = 3): Uint8Array {
  return new Uint8Array([0x1b, 0x64, n & 0xff]); // ESC d n
}

/** Feed paper by n dot lines */
export function feedDots(n: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) {
    const chunk = Math.min(remaining, 255);
    bytes.push(0x1b, 0x4a, chunk);
    remaining -= chunk;
  }
  return new Uint8Array(bytes);
}

/** Cut paper (full cut) */
export function cut(): Uint8Array {
  return new Uint8Array([0x1d, 0x56, 0]); // GS V 0
}

/**
 * Feed exactly one sticker pitch (labelHeight + gap + offset) in mm.
 * Used by the "Feed" button so the user can step the paper one label at a
 * time and align the top of a sticker at the print head before printing.
 */
export function feedPitch(labelHeightMm: number, labelGapMm: number, feedOffsetMm = 0): Uint8Array {
  const dots = Math.max(Math.round((labelHeightMm + labelGapMm + feedOffsetMm) * DOTS_PER_MM), 0);
  const lines = Math.floor(dots / FONT_A_LINE_DOTS);
  const rem = dots % FONT_A_LINE_DOTS;
  return concat(
    lines > 0 ? feed(lines) : new Uint8Array(0),
    rem > 0 ? feedDots(rem) : new Uint8Array(0),
  );
}

/** Partial cut (if supported) */
export function partialCut(): Uint8Array {
  return new Uint8Array([0x1d, 0x56, 1]); // GS V 1
}

// ── High-level label builder ─────────────────────────────────────────────────

interface LabelOptions {
  storeName: string;
  productName: string;
  barcodeValue: string;
  price: number;
  showStoreName?: boolean;
  showProductName?: boolean;
  showPrice?: boolean;
  showBarcodeText?: boolean;
  currencySymbol?: string;
}

/**
 * Build a complete ESC/POS command sequence for a single barcode label.
 * Designed for thermal printers (58mm or 80mm).
 */
export function buildLabel(opts: LabelOptions): Uint8Array {
  const {
    storeName,
    productName,
    barcodeValue,
    price,
    showStoreName = true,
    showProductName = true,
    showPrice = true,
    showBarcodeText = true,
    currencySymbol = '$',
  } = opts;

  const cmds: Uint8Array[] = [];

  cmds.push(resetFormat());

  // Store name header
  if (showStoreName) {
    cmds.push(text(storeName, {
      align: 'center',
      bold: true,
      width: 2,
      height: 1,
    }));
  }

  // Separator
  cmds.push(separator('-', 32));

  // Product name
  if (showProductName) {
    // Truncate long names to fit ~32 chars (58mm) or ~48 chars (80mm)
    const maxLen = 32;
    const name = productName.length > maxLen
      ? productName.slice(0, maxLen - 1) + '…'
      : productName;
    cmds.push(text(name, {
      align: 'center',
      bold: true,
      width: 1,
      height: 1,
    }));
  }

  // Barcode (use printer-native CODE39 for best quality)
  cmds.push(barcode(barcodeValue, 'CODE39', 60, showBarcodeText ? 2 : 0));

  // Price
  if (showPrice) {
    const priceStr = `${currencySymbol}${Number(price).toFixed(2)}`;
    cmds.push(text(priceStr, {
      align: 'center',
      bold: true,
      width: 2,
      height: 1,
    }));
  }

  // Feed + cut
  cmds.push(feed(3));
  cmds.push(cut());

  return concat(...cmds);
}

/**
 * Build ESC/POS for multiple labels.
 * Each label is separated by a cut command.
 */
export function buildMultiLabel(labels: LabelOptions[]): Uint8Array {
  return concat(
    init(),
    setCodePage('CP437'),
    ...labels.map(l => buildLabel(l)),
  );
}

// ── mm-aware thermal label builder ───────────────────────────────────────────

export interface ThermalLabelOptions {
  storeName: string;
  productName: string;
  barcodeValue: string;
  price: number;
  showStoreName?: boolean;
  showProductName?: boolean;
  showPrice?: boolean;
  showBarcodeText?: boolean;
  currencySymbol?: string;
  /** Physical paper width in mm (58 or 80). Determines printable width. */
  paperWidthMm?: number;
  /** Desired label width in mm (clamped to the paper's printable width). */
  labelWidthMm?: number;
  /** Desired label height (length) in mm. Drives paper feed before cutting. */
  labelHeightMm?: number;
  barcodeType?: BarcodeType;
  /** Barcode bar height in mm. */
  barcodeHeightMm?: number;
  cutMode?: 'off' | 'full' | 'partial';
  /**
   * Paper mode. Receipt = continuous paper (feeds by content height).
   * Sticker = self-adhesive labels (feeds full label length + gap so the
   * next label is positioned at the print head). Sticker mode also
   * disables the auto-cut command, which label printers do not have.
   */
  paperMode?: 'receipt' | 'sticker';
  /** Gap between sticker labels in mm (default 3mm). Drives feed-to-next. */
  labelGapMm?: number;
  /** Fine-tune feed distance in mm (positive feeds more, negative less). */
  feedOffsetMm?: number;
  /**
   * Optional absolute-position layout. When provided, each element with a
   * position is placed at (xMm, yMm) from the top-left of the label using
   * ESC $ / ESC J absolute moves instead of the stacked layout. Elements
   * without a position are skipped.
   */
  layout?: ThermalLabelLayout;
}

export interface ThermalLabelLayout {
  storeName?: LabelPosition;
  productName?: LabelPosition;
  barcode?: { xMm: number; yMm: number; widthMm?: number; heightMm?: number };
  price?: LabelPosition;
}

export interface LabelPosition {
  /** mm from the left edge of the label. */
  xMm: number;
  /** mm from the top edge of the label. */
  yMm: number;
  /** Available width in mm for wrapping (optional). */
  widthMm?: number;
  /** Available height in mm for wrapping (optional). */
  heightMm?: number;
  /** Text scale: 1 = normal, 2 = double size. */
  size?: 1 | 2;
}

const DOTS_PER_MM = 8; // 203 dpi
const FONT_A_CHAR_DOTS = 12; // width of one font-A character
const FONT_A_LINE_DOTS = 24; // height of one font-A text line

/**
 * Printable width in mm for a given roll/paper width.
 * Narrow rolls keep tighter side margins; 58mm/80mm follow the common specs
 * (48mm / 72mm printable).
 */
export function getPrintableMm(paperWidthMm: number): number {
  if (paperWidthMm <= 40) return Math.max(paperWidthMm - 4, 10);
  if (paperWidthMm <= 58) return 48;
  if (paperWidthMm <= 80) return 72;
  return paperWidthMm - 8;
}

function printableDotsForPaper(paperWidthMm: number): number {
  return Math.round(getPrintableMm(paperWidthMm) * DOTS_PER_MM);
}

/** Wrap text by words into lines of at most maxChars characters. */
function wrapLabelText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      if (w.length > maxChars) {
        let rest = w;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        cur = rest;
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text.slice(0, maxChars)];
}

/**
 * Coerce a product barcode/SKU into something the chosen barcode type can
 * actually encode. Fixed-length numeric types are padded/truncated to digits.
 */
export function normalizeBarcodeValue(value: string, type: BarcodeType): string {
  const digits = value.replace(/\D/g, '');
  switch (type) {
    case 'EAN13': return digits.slice(0, 13).padStart(13, '0');
    case 'EAN8': return digits.slice(0, 8).padStart(8, '0');
    case 'UPCA': return digits.slice(0, 12).padStart(12, '0');
    case 'UPCE': return digits.slice(0, 8).padStart(8, '0');
    case 'ITF': {
      const even = digits.length % 2 === 0 ? digits : digits.slice(0, -1);
      return even || '0000';
    }
    default: {
      const clean = (value || '000000').toUpperCase().replace(/[^A-Z0-9\-\.\ \/\+%]/g, '');
      return clean || '000000';
    }
  }
}

/**
 * Estimate how many printable dots a barcode will occupy so the module width
 * can be chosen to fit narrow labels. Rough module counts per symbology.
 */
function estimateBarcodeModules(data: string, type: BarcodeType): number {
  const n = data.length;
  switch (type) {
    case 'CODE128': return (n + 2) * 11 + 20;
    case 'CODE39': return n * 16 + 20;
    case 'CODE93': return (n + 2) * 9 + 20;
    case 'ITF': return Math.ceil(n / 2) * 18 + 20;
    case 'EAN13': return 95 + 20;
    case 'EAN8': return 67 + 20;
    case 'UPCA': return 95 + 20;
    case 'UPCE': return 51 + 20;
    default: return (n + 2) * 11 + 20;
  }
}

/**
 * Build a complete ESC/POS sequence for ONE self-adhesive thermal label sized
 * in millimetres. Computes the printable character grid from the requested
 * width, wraps/truncates text to fit, accounts for the barcode + HRI height,
 * then feeds the remaining paper so each label comes out at labelHeightMm.
 */
export function buildThermalLabel(opts: ThermalLabelOptions): Uint8Array {
  const {
    storeName = '',
    productName = '',
    barcodeValue = '000000',
    price = 0,
    showStoreName = true,
    showProductName = true,
    showPrice = true,
    showBarcodeText = true,
    currencySymbol = 'Ks',
    paperWidthMm = 58,
    labelWidthMm = 50,
    labelHeightMm = 30,
    barcodeType = 'CODE128',
    barcodeHeightMm = 10,
    cutMode = 'off',
    paperMode = 'sticker',
    labelGapMm = 3,
    feedOffsetMm = 0,
  } = opts;

  const isSticker = paperMode === 'sticker';
  const printableDots = printableDotsForPaper(paperWidthMm);
  const labelWidthDots = Math.min(Math.max(Math.round(labelWidthMm * DOTS_PER_MM), 1), printableDots);
  const labelHeightDots = Math.max(Math.round(labelHeightMm * DOTS_PER_MM), 24);
  const charsPerLine = Math.max(Math.floor(labelWidthDots / FONT_A_CHAR_DOTS), 4);

  const layout = opts.layout;
  const hasCustomLayout = !!(layout && (layout.storeName || layout.productName || layout.barcode || layout.price));

  const cmds: Uint8Array[] = [];
  cmds.push(resetFormat());
  cmds.push(new Uint8Array([0x1b, 0x61, 1])); // ESC a 1 → center

  if (hasCustomLayout) {
    return buildCustomThermalLabel(opts);
  }

  let usedDots = 0;

  // Store / header text
  if (showStoreName && storeName) {
    const line = storeName.length > charsPerLine ? `${storeName.slice(0, charsPerLine - 1)}…` : storeName;
    cmds.push(text(line, { align: 'center', bold: true, width: 1, height: 1 }));
    usedDots += FONT_A_LINE_DOTS;
  }

  // Product name (wrapped; limited by remaining vertical space)
  if (showProductName && productName) {
    const barcodeDots = Math.max(Math.round(barcodeHeightMm * DOTS_PER_MM), 20);
    const hriDots = showBarcodeText ? FONT_A_LINE_DOTS : 0;
    const priceDots = showPrice ? FONT_A_LINE_DOTS : 0;
    const fixedDots = (showStoreName && storeName ? FONT_A_LINE_DOTS : 0) + barcodeDots + hriDots + priceDots;
    const remainingDots = Math.max(labelHeightDots - fixedDots, 0);
    const maxLines = Math.max(Math.floor(remainingDots / FONT_A_LINE_DOTS), 1);

    let lines = wrapLabelText(productName, charsPerLine);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      if (lines[maxLines - 1].length >= charsPerLine) {
        lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, charsPerLine - 1)}…`;
      }
    }
    for (const line of lines) {
      cmds.push(text(line, { align: 'center', bold: true, width: 1, height: 1 }));
    }
    usedDots += lines.length * FONT_A_LINE_DOTS;
  }

  // Barcode. CODE39 is rendered client-side as a raster bitmap (GS v 0) so it
  // prints on any thermal printer, even ones whose native GS k engine fails
  // silently (the common "blank barcode" cause). Other symbologies fall back to
  // the printer's native engine.
  const barcodeHeightDots = Math.max(Math.round(barcodeHeightMm * DOTS_PER_MM), 20);
  const barcodeData = normalizeBarcodeValue(barcodeValue, barcodeType);
  if (barcodeType === 'CODE39') {
    cmds.push(rasterBarcode(barcodeData, barcodeHeightDots, labelWidthDots));
    cmds.push(feedRaster(barcodeHeightDots));
    if (showBarcodeText) {
      cmds.push(text(barcodeData, { align: 'center', bold: false, width: 1, height: 1 }));
      usedDots += FONT_A_LINE_DOTS;
    }
  } else {
    const moduleWidth = Math.min(Math.max(Math.floor(labelWidthDots / estimateBarcodeModules(barcodeData, barcodeType)), 2), 4);
    cmds.push(barcode(barcodeData, barcodeType, barcodeHeightDots, showBarcodeText ? 2 : 0, moduleWidth));
    if (showBarcodeText) usedDots += FONT_A_LINE_DOTS;
  }
  usedDots += barcodeHeightDots;

  // Price footer
  if (showPrice) {
    const priceStr = `${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currencySymbol}`.trim();
    const fits = priceStr.length * 24 <= labelWidthDots;
    cmds.push(text(priceStr, { align: 'center', bold: true, width: fits ? 2 : 1, height: 1 }));
    usedDots += FONT_A_LINE_DOTS;
  }

  // ── Paper feed ─────────────────────────────────────────────────────────────
  // Sticker (self-adhesive) labels: the label's pitch (label height + gap +
  // offset) is the TOTAL distance the paper must move per label. The content
  // already advanced `usedDots` as it was printed, so only the difference is
  // fed here — otherwise every label over-feeds by the content height and the
  // next print drifts across the label boundary. Label printers have no
  // auto-cutter, so the cut command is suppressed.
  // Receipt (continuous) paper: feed only enough to clear the content, then
  // optionally cut.
  if (isSticker) {
    const pitchDots = Math.max(
      Math.round((labelHeightMm + labelGapMm + feedOffsetMm) * DOTS_PER_MM),
      0,
    );
    const remainingDots = Math.max(pitchDots - usedDots, 0);
    const feedLines = Math.floor(remainingDots / FONT_A_LINE_DOTS);
    const feedRemainder = remainingDots % FONT_A_LINE_DOTS;
    if (feedLines > 0) cmds.push(feed(feedLines));
    if (feedRemainder > 0) cmds.push(feedDots(feedRemainder));
  } else {
    const remainingDots = Math.max(labelHeightDots - usedDots, 0);
    const feedLines = Math.floor(remainingDots / FONT_A_LINE_DOTS);
    const feedRemainder = remainingDots % FONT_A_LINE_DOTS;
    if (feedLines > 0) cmds.push(feed(feedLines));
    if (feedRemainder > 0) cmds.push(feedDots(feedRemainder));
    if (cutMode === 'partial') cmds.push(partialCut());
    else if (cutMode === 'full') cmds.push(cut());
  }

  return concat(...cmds);
}

/**
 * Build a label using absolute (x, y) element positions. Each element listed
 * in `opts.layout` is moved to its coordinate with ESC $ (horizontal) and a
 * dot feed (vertical); elements are rendered top-to-bottom.
 */
function buildCustomThermalLabel(opts: ThermalLabelOptions): Uint8Array {
  const {
    storeName = '',
    productName = '',
    barcodeValue = '000000',
    price = 0,
    showStoreName = true,
    showProductName = true,
    showPrice = true,
    showBarcodeText = true,
    currencySymbol = 'Ks',
    paperWidthMm = 58,
    labelWidthMm = 50,
    labelHeightMm = 30,
    barcodeType = 'CODE128',
    barcodeHeightMm = 10,
    paperMode = 'sticker',
    labelGapMm = 3,
    feedOffsetMm = 0,
    layout,
  } = opts;

  const printableMm = getPrintableMm(paperWidthMm);
  const effLabelWidthMm = Math.min(labelWidthMm, printableMm);
  const labelWidthDots = Math.max(Math.round(effLabelWidthMm * DOTS_PER_MM), 1);
  const labelHeightDots = Math.max(Math.round(labelHeightMm * DOTS_PER_MM), 24);
  const barcodeHeightDots = Math.max(Math.round(barcodeHeightMm * DOTS_PER_MM), 20);
  const barcodeData = normalizeBarcodeValue(barcodeValue, barcodeType);

  const cmds: Uint8Array[] = [];
  cmds.push(resetFormat());
  cmds.push(new Uint8Array([0x1b, 0x61, 0])); // left align — X moves are absolute

  interface CustomEl {
    yDots: number;
    heightDots: number;
    emit: () => Uint8Array;
  }
  const els: CustomEl[] = [];

  const wrapChars = (xMm: number, size: 1 | 2, widthMm?: number) => {
    const availDots = Math.max(mmToDots((widthMm ?? effLabelWidthMm) - xMm), mmToDots(4));
    return Math.max(Math.floor(availDots / (FONT_A_CHAR_DOTS * size)), 1);
  };

  if (showStoreName && storeName && layout?.storeName) {
    const p = layout.storeName;
    const size = p.size ?? 1;
    const line = storeName.length > wrapChars(p.xMm, size) ? `${storeName.slice(0, wrapChars(p.xMm, size) - 1)}…` : storeName;
    els.push({
      yDots: mmToDots(p.yMm),
      heightDots: FONT_A_LINE_DOTS * size,
      emit: () => absoluteTextLines([line], mmToDots(p.xMm), size, true),
    });
  }

  if (showProductName && productName && layout?.productName) {
    const p = layout.productName;
    const size = p.size ?? 1;
    const lines = wrapLabelText(productName, wrapChars(p.xMm, size));
    els.push({
      yDots: mmToDots(p.yMm),
      heightDots: lines.length * FONT_A_LINE_DOTS * size,
      emit: () => absoluteTextLines(lines, mmToDots(p.xMm), size, true),
    });
  }

  if (layout?.barcode) {
    const p = layout.barcode;
    const maxBcWMm = p.widthMm ? Math.min(p.widthMm, effLabelWidthMm - p.xMm) : effLabelWidthMm - p.xMm;
    const maxWDots = Math.max(mmToDots(maxBcWMm), mmToDots(8));
    const bcHeightMm = p.heightMm ? Math.min(p.heightMm, labelHeightMm - p.yMm) : barcodeHeightMm;
    const bcHeightDots = Math.max(Math.round(bcHeightMm * DOTS_PER_MM), 20);
    const parts: Uint8Array[] = [];
    if (barcodeType === 'CODE39') {
      parts.push(setAbsoluteX(mmToDots(p.xMm)));
      parts.push(rasterBarcode(barcodeData, bcHeightDots, maxWDots));
      if (showBarcodeText) {
        parts.push(feedRaster(bcHeightDots));
        parts.push(absoluteTextLines([barcodeData], mmToDots(p.xMm), 1, false));
      }
    } else {
      const moduleWidth = Math.min(Math.max(Math.floor(maxWDots / estimateBarcodeModules(barcodeData, barcodeType)), 2), 4);
      parts.push(setAbsoluteX(mmToDots(p.xMm)));
      parts.push(barcode(barcodeData, barcodeType, bcHeightDots, showBarcodeText ? 2 : 0, moduleWidth));
    }
    els.push({
      yDots: mmToDots(p.yMm),
      heightDots: bcHeightDots + (showBarcodeText ? FONT_A_LINE_DOTS : 0),
      emit: () => concat(...parts),
    });
  }

  if (showPrice && layout?.price) {
    const p = layout.price;
    const size = p.size ?? 1;
    const priceStr = `${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currencySymbol}`.trim();
    els.push({
      yDots: mmToDots(p.yMm),
      heightDots: FONT_A_LINE_DOTS * size,
      emit: () => absoluteTextLines([priceStr], mmToDots(p.xMm), size, true),
    });
  }

  // Render top-to-bottom: feed down to each element's Y, set X, print.
  let cursorY = 0;
  for (const el of els.sort((a, b) => a.yDots - b.yDots)) {
    if (el.yDots > cursorY) cmds.push(feedDots(el.yDots - cursorY));
    else if (el.yDots < cursorY) cmds.push(feedDots(1)); // cannot rewind; slight pad
    cmds.push(el.emit());
    cursorY = el.yDots + el.heightDots;
  }

  // Advance the remaining distance to complete this label pitch.
  const isSticker = paperMode === 'sticker';
  const targetDots = isSticker
    ? Math.max(Math.round((labelHeightMm + labelGapMm + feedOffsetMm) * DOTS_PER_MM), 0)
    : labelHeightDots;
  const remainingDots = Math.max(targetDots - cursorY, 0);
  const feedLines = Math.floor(remainingDots / FONT_A_LINE_DOTS);
  const feedRemainder = remainingDots % FONT_A_LINE_DOTS;
  if (feedLines > 0) cmds.push(feed(feedLines));
  if (feedRemainder > 0) cmds.push(feedDots(feedRemainder));

  return concat(...cmds);
}

/** Build ESC/POS for many thermal labels (init + codepage once, then each label). */
export function buildThermalLabels(labels: ThermalLabelOptions[]): Uint8Array {
  return concat(
    init(),
    setCodePage('CP437'),
    ...labels.map(l => buildThermalLabel(l)),
  );
}

/**
 * Minimal, dependency-light ESC/POS job used to verify the printer + Bluetooth
 * connection actually print. No barcode, no cut, no font scaling.
 */
export function testPrint(): Uint8Array {
  return concat(
    init(),
    setCodePage('CP437'),
    resetFormat(),
    text('MiBayate Printer Test', { align: 'center', bold: true, width: 1, height: 1 }),
    text('If you can read this,', { align: 'center', width: 1, height: 1 }),
    text('ESC/POS printing works.', { align: 'center', width: 1, height: 1 }),
    feed(4),
  );
}
