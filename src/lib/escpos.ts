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

// ── Horizontal line / separator ──────────────────────────────────────────────

export function separator(char: string = '-', width: number = 32): Uint8Array {
  return text(char.repeat(width), { align: 'left' });
}

// ── Paper control ────────────────────────────────────────────────────────────

/** Feed paper by n lines */
export function feed(n: number = 3): Uint8Array {
  return new Uint8Array([0x1b, 0x64, n & 0xff]); // ESC d n
}

/** Cut paper (full cut) */
export function cut(): Uint8Array {
  return new Uint8Array([0x1d, 0x56, 0]); // GS V 0
}

// ── Shared label types (driven by the TSPL label builder) ────────────────────

export type BarcodeType = 'CODE39' | 'CODE128' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'ITF' | 'CODE93';

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
  labelOffsetMm?: number;
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
      const clean = (value || '000000').toUpperCase().replace(/[^A-Z0-9\-\. \/\+%]/g, '');
      return clean || '000000';
    }
  }
}
