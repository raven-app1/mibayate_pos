import {
  RasterImage,
  canRasterizeText,
  hasNonAscii,
  ensureLabelFont,
  packCanvas,
} from './labelRaster';
import { code128BarRects } from './code128';
import * as printerBridge from './printerBridge';
import { SaleWithItems, BusinessProfile } from '../types';

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

export function barcode(
  data: string,
  type: BarcodeType = 'CODE128',
  height = 50,
  hriPosition: 0 | 1 | 2 | 3 = 2,
  moduleWidth = 2,
): Uint8Array {
  const typeMap: Record<BarcodeType, number> = {
    UPCA: 0, UPCE: 1, EAN13: 2, EAN8: 3,
    CODE39: 4, ITF: 5, CODE93: 7, CODE128: 8,
  };
  const mB = (typeMap[type] ?? 8) + 65;
  const dataBytes = strToBytes(data);
  const cmds: Uint8Array[] = [];

  cmds.push(new Uint8Array([0x1d, 0x68, height & 0xff]));
  cmds.push(new Uint8Array([0x1d, 0x48, hriPosition]));
  cmds.push(new Uint8Array([0x1d, 0x77, Math.min(Math.max(moduleWidth, 1), 6)]));

  const cmd = new Uint8Array(4 + dataBytes.length);
  cmd[0] = 0x1d;
  cmd[1] = 0x6b;
  cmd[2] = mB;
  cmd[3] = dataBytes.length;
  cmd.set(dataBytes, 4);
  cmds.push(cmd);

  return concat(...cmds);
}

export function rasterImage(image: RasterImage): Uint8Array {
  const xL = image.widthBytes & 0xff;
  const xH = (image.widthBytes >> 8) & 0xff;
  const yL = image.heightDots & 0xff;
  const yH = (image.heightDots >> 8) & 0xff;
  return concat(new Uint8Array([0x1d, 0x76, 0x30, 0, xL, xH, yL, yH]), image.data);
}

export function receiptRow(left: string, right: string, width = 42): string {
  const cleanLeft = left || '';
  const cleanRight = right || '';
  const spaces = width - cleanLeft.length - cleanRight.length;
  if (spaces <= 0) {
    const maxL = Math.max(width - cleanRight.length - 1, 1);
    return cleanLeft.slice(0, maxL) + ' ' + cleanRight;
  }
  return cleanLeft + ' '.repeat(spaces) + cleanRight;
}

export function buildEscPosReceipt(
  sale: SaleWithItems,
  business: BusinessProfile,
  options: { paperWidthMm?: number } = {},
): Uint8Array {
  const paperMm = options.paperWidthMm || 72;
  const charsPerLine = paperMm <= 58 ? 32 : paperMm <= 72 ? 42 : 48;
  const currency = business.currency || 'Ks';
  const cmds: Uint8Array[] = [];

  cmds.push(init());
  cmds.push(setCodePage('CP437'));

  cmds.push(text(business.name || 'RETAIL SHOP', { align: 'center', bold: true, width: 2, height: 2 }));
  if (business.tagline) {
    cmds.push(text(business.tagline, { align: 'center' }));
  }
  const branch = sale.branch_name || 'Main Store';
  cmds.push(text(branch, { align: 'center', bold: true }));
  if (business.phone) {
    cmds.push(text('Tel: ' + business.phone, { align: 'center' }));
  }
  if (business.address) {
    cmds.push(text(business.address, { align: 'center' }));
  }

  cmds.push(separator('-', charsPerLine));
  cmds.push(text(receiptRow('Receipt No:', '#' + sale.id.slice(-8).toUpperCase(), charsPerLine)));
  cmds.push(text(receiptRow('Cashier:', sale.cashier_name || 'Staff', charsPerLine)));
  cmds.push(text(receiptRow('Date:', new Date(sale.created_at).toLocaleString(), charsPerLine)));
  if (sale.customer_name) {
    cmds.push(text(receiptRow('Customer:', sale.customer_name, charsPerLine)));
  }

  cmds.push(separator('-', charsPerLine));
  if (charsPerLine >= 42) {
    cmds.push(text(receiptRow('ITEM', 'QTY x PRICE       TOTAL', charsPerLine), { bold: true }));
    cmds.push(separator('-', charsPerLine));
  }

  const items = sale.items || [];
  for (const item of items) {
    cmds.push(text(item.product_name, { bold: true }));
    const leftDetail = `  ${item.quantity} x ${Number(item.unit_price || 0).toLocaleString()} ${currency}`;
    const rightTotal = `${Number(item.total || 0).toLocaleString()} ${currency}`;
    cmds.push(text(receiptRow(leftDetail, rightTotal, charsPerLine)));
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  const tax = Math.max(0, Number((sale.total_amount - (subtotal - (sale.discount || 0))).toFixed(2)));

  cmds.push(separator('-', charsPerLine));
  cmds.push(text(receiptRow('Subtotal:', `${subtotal.toLocaleString()} ${currency}`, charsPerLine)));
  if (sale.discount && sale.discount > 0) {
    cmds.push(text(receiptRow('Discount:', `-${Number(sale.discount).toLocaleString()} ${currency}`, charsPerLine)));
  }
  if (tax > 0) {
    cmds.push(text(receiptRow('Tax:', `${tax.toLocaleString()} ${currency}`, charsPerLine)));
  }

  cmds.push(separator('=', charsPerLine));
  cmds.push(text(receiptRow('TOTAL:', `${Number(sale.total_amount || 0).toLocaleString()} ${currency}`, charsPerLine), {
    bold: true,
    height: 2,
  }));
  cmds.push(separator('-', charsPerLine));

  const paymentMethod = (sale.payment_method || 'cash').toUpperCase();
  cmds.push(text(`Payment: ${paymentMethod}`, { align: 'center', bold: true }));

  const barcodeValue = (sale.id || '00000000').slice(-8).replace(/[^A-Za-z0-9]/g, '') || '00000000';
  cmds.push(new Uint8Array([0x1b, 0x61, 1]));
  cmds.push(barcode(barcodeValue, 'CODE128', 50, 2, 2));

  const footerNote = business.receipt_footer || 'Thank you for shopping with us! Please come again.';
  cmds.push(text(footerNote, { align: 'center' }));

  cmds.push(feed(4));
  cmds.push(cut());

  return concat(...cmds);
}

export function renderRasterReceipt(
  sale: SaleWithItems,
  business: BusinessProfile,
  options: { paperWidthMm?: number } = {},
): Uint8Array | null {
  if (typeof document === 'undefined') return null;

  const paperMm = options.paperWidthMm || 72;
  const dotsPerMm = 8;
  const widthDots = Math.round(paperMm * dotsPerMm);
  const margin = Math.round(3 * dotsPerMm);
  const printableWidth = widthDots - margin * 2;
  const currency = business.currency || 'Ks';

  const items = sale.items || [];
  const subtotal = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  const tax = Math.max(0, Number((sale.total_amount - (subtotal - (sale.discount || 0))).toFixed(2)));

  const baseLines = 18;
  const itemLines = items.length * 2.8;
  const estimatedHeight = Math.round((baseLines + itemLines) * 26 + 180);

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = estimatedHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, widthDots, estimatedHeight);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  const fontStack = '"MiBayate Myanmar Print", "Noto Sans Myanmar", "Myanmar Text", sans-serif';

  let y = margin + 20;

  ctx.font = `700 24px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.fillText(business.name || 'RETAIL SHOP', widthDots / 2, y);
  y += 24;

  if (business.tagline) {
    ctx.font = `400 14px ${fontStack}`;
    ctx.fillText(business.tagline, widthDots / 2, y);
    y += 20;
  }

  ctx.font = `700 15px ${fontStack}`;
  ctx.fillText(sale.branch_name || 'Main Store', widthDots / 2, y);
  y += 20;

  if (business.phone) {
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText('Tel: ' + business.phone, widthDots / 2, y);
    y += 18;
  }
  if (business.address) {
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText(business.address, widthDots / 2, y);
    y += 18;
  }

  const drawDashedLine = (currY: number) => {
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(margin, currY);
    ctx.lineTo(widthDots - margin, currY);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  y += 6;
  drawDashedLine(y);
  y += 18;

  const drawRow = (left: string, right: string, bold = false) => {
    ctx.font = `${bold ? '700' : '400'} 14px ${fontStack}`;
    ctx.textAlign = 'left';
    ctx.fillText(left, margin, y);
    ctx.textAlign = 'right';
    ctx.fillText(right, widthDots - margin, y);
    y += 20;
  };

  drawRow('Receipt No:', '#' + sale.id.slice(-8).toUpperCase());
  drawRow('Cashier:', sale.cashier_name || 'Staff');
  drawRow('Date:', new Date(sale.created_at).toLocaleString());
  if (sale.customer_name) {
    drawRow('Customer:', sale.customer_name);
  }

  y += 2;
  drawDashedLine(y);
  y += 18;

  ctx.font = `700 14px ${fontStack}`;
  ctx.textAlign = 'left';
  ctx.fillText('ITEM', margin, y);
  ctx.textAlign = 'right';
  ctx.fillText('TOTAL', widthDots - margin, y);
  y += 18;
  drawDashedLine(y);
  y += 18;

  for (const item of items) {
    ctx.font = `700 14px ${fontStack}`;
    ctx.textAlign = 'left';
    ctx.fillText(item.product_name, margin, y);
    y += 18;

    ctx.font = `400 13px ${fontStack}`;
    ctx.textAlign = 'left';
    ctx.fillText(`  ${item.quantity} x ${Number(item.unit_price || 0).toLocaleString()} ${currency}`, margin, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${Number(item.total || 0).toLocaleString()} ${currency}`, widthDots - margin, y);
    y += 22;
  }

  y += 2;
  drawDashedLine(y);
  y += 18;

  drawRow('Subtotal:', `${subtotal.toLocaleString()} ${currency}`);
  if (sale.discount && sale.discount > 0) {
    drawRow('Discount:', `-${Number(sale.discount).toLocaleString()} ${currency}`);
  }
  if (tax > 0) {
    drawRow('Tax:', `${tax.toLocaleString()} ${currency}`);
  }

  y += 4;
  drawDashedLine(y);
  y += 22;

  ctx.font = `900 20px ${fontStack}`;
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL:', margin, y);
  ctx.textAlign = 'right';
  ctx.fillText(`${Number(sale.total_amount || 0).toLocaleString()} ${currency}`, widthDots - margin, y);
  y += 24;

  drawDashedLine(y);
  y += 20;

  ctx.font = `700 14px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.fillText(`Payment: ${(sale.payment_method || 'cash').toUpperCase()}`, widthDots / 2, y);
  y += 22;

  const barcodeValue = (sale.id || '00000000').slice(-8).replace(/[^A-Za-z0-9]/g, '') || '00000000';
  const bcWidth = Math.min(printableWidth - 40, 240);
  const bcHeight = 44;
  const bcX = Math.round((widthDots - bcWidth) / 2);
  const bars = code128BarRects(barcodeValue, {
    xDots: bcX,
    yDots: y,
    widthDots: bcWidth,
    heightDots: bcHeight,
  });
  ctx.fillStyle = '#000';
  for (const bar of bars) {
    ctx.fillRect(bar.xDots, bar.yDots, bar.widthDots, bar.heightDots);
  }
  y += bcHeight + 14;

  ctx.font = '600 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`*${barcodeValue}*`, widthDots / 2, y);
  y += 20;

  const footerNote = business.receipt_footer || 'Thank you for shopping with us! Please come again.';
  ctx.font = `500 13px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.fillText(footerNote, widthDots / 2, y);
  y += 28;

  const actualHeight = y;
  const packedCanvas = document.createElement('canvas');
  packedCanvas.width = widthDots;
  packedCanvas.height = actualHeight;
  const pctx = packedCanvas.getContext('2d');
  if (!pctx) return null;
  pctx.drawImage(canvas, 0, 0, widthDots, actualHeight, 0, 0, widthDots, actualHeight);

  const image = packCanvas(pctx, widthDots, actualHeight);
  return concat(init(), rasterImage(image), feed(4), cut());
}

export async function printSaleSlip(
  sale: SaleWithItems,
  business: BusinessProfile,
  options: { paperWidthMm?: number } = {},
): Promise<void> {
  const allText = [
    business.name,
    business.tagline,
    sale.branch_name,
    sale.cashier_name,
    ...(sale.items || []).map(it => it.product_name),
    business.receipt_footer,
  ].filter(Boolean).join(' ');

  let bytes: Uint8Array;
  if (canRasterizeText() && hasNonAscii(allText)) {
    await ensureLabelFont();
    const raster = renderRasterReceipt(sale, business, options);
    if (raster) {
      bytes = raster;
    } else {
      bytes = buildEscPosReceipt(sale, business, options);
    }
  } else {
    bytes = buildEscPosReceipt(sale, business, options);
  }

  await printerBridge.send(bytes);
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
  dotsPerMm?: number;
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
  size?: number;
}

export function getPrintableMm(paperWidthMm: number): number {
  if (paperWidthMm <= 40) return Math.max(paperWidthMm - 4, 10);
  if (paperWidthMm <= 58) return 48;
  return paperWidthMm;
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
