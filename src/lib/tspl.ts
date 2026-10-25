import {
  BarcodeType,
  ThermalLabelOptions,
  normalizeBarcodeValue,
} from './escpos';
import {
  PositionedRasterImage,
  RasterBar,
  RasterTextRun,
  canRasterizeText,
  cropRaster,
  hasNonAscii,
  measureTextBlockHeight,
  renderTextLayer,
} from './labelRaster';
import { code128BarRects } from './code128';

export interface TsplLabelOptions extends ThermalLabelOptions {
  copies?: number;
  dotsPerMm?: number;
}

const DEFAULT_DOTS_PER_MM = 8;

const FONT_WIDTH: Record<string, number> = {
  '1': 8,
  '2': 12,
  '3': 16,
  '4': 24,
  '5': 32,
};

const FONT_HEIGHT: Record<string, number> = {
  '1': 12,
  '2': 20,
  '3': 24,
  '4': 32,
  '5': 48,
};

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatParts(parts: Array<string | Uint8Array>): Uint8Array {
  const encoded = parts.map(part => typeof part === 'string' ? encode(part) : part);
  const total = encoded.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of encoded) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function priceText(price: number, currencySymbol: string): string {
  return `${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currencySymbol}`.trim();
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function dots(mm: number, dotsPerMm: number): number {
  return Math.max(0, Math.round(mm * dotsPerMm));
}

function sanitize(value: string): string {
  return (value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/[^\x20-\x7E]/g, '?')
    .trim();
}

function wrapText(value: string, maxChars: number): string[] {
  const text = sanitize(value);
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function truncate(value: string, maxChars: number): string {
  const text = sanitize(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 3)).trimEnd() + '...';
}

function textCommand(
  x: number,
  y: number,
  font: string,
  size: number,
  value: string,
): string {
  return `TEXT ${x},${y},"${font}",0,${size},${size},"${sanitize(value)}"`;
}

function tsplBarcodeType(type: BarcodeType): string {
  const map: Record<BarcodeType, string> = {
    CODE39: '39',
    CODE128: '128',
    EAN13: 'EAN13',
    EAN8: 'EAN8',
    UPCA: 'UPCA',
    UPCE: 'UPCE',
    ITF: 'ITF',
    CODE93: '93',
  };
  return map[type] || '128';
}

function invertForTspl(image: PositionedRasterImage): Uint8Array {
  const data = new Uint8Array(image.data.length);
  const tailBits = image.widthDots & 7;
  const paddingMask = tailBits ? 0xff >> tailBits : 0;
  for (let y = 0; y < image.heightDots; y++) {
    const row = y * image.widthBytes;
    for (let b = 0; b < image.widthBytes; b++) {
      data[row + b] = (~image.data[row + b]) & 0xff;
    }
    if (tailBits) data[row + image.widthBytes - 1] |= paddingMask;
  }
  return data;
}

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

function sizeCommands(
  labelWidthMm: number,
  labelHeightMm: number,
  paperMode: 'receipt' | 'sticker',
  labelGapMm: number,
): string[] {
  return [
    `SIZE ${fmt(labelWidthMm)} mm,${fmt(labelHeightMm)} mm`,
    paperMode === 'sticker'
      ? `GAP ${fmt(labelGapMm)} mm,0 mm`
      : 'GAP 0 mm,0 mm',
    'DIRECTION 0',
    'REFERENCE 0,0',
    'DENSITY 8',
    'CLS',
  ];
}

function buildTsplRasterLabel(opts: TsplLabelOptions): Uint8Array | null {
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
    layout,
    copies = 1,
    dotsPerMm = DEFAULT_DOTS_PER_MM,
  } = opts;

  if (!canRasterizeText()) return null;

  const widthMm = Math.max(5, Math.min(labelWidthMm, paperWidthMm));
  const widthDots = Math.max(dots(widthMm, dotsPerMm), 8);
  const heightDots = Math.max(dots(Math.max(5, labelHeightMm), dotsPerMm), 8);
  const priceValue = priceText(price, currencySymbol);
  const barcodeHeightDots = Math.max(dots(barcodeHeightMm, dotsPerMm), 20);
  const barcodeData = normalizeBarcodeValue(barcodeValue, barcodeType);
  const barcodeModules = estimateBarcodeModules(barcodeData, barcodeType);
  const runs: RasterTextRun[] = [];
  const bars: RasterBar[] = [];
  let barcodeCommand = '';

  const storePos = layout?.storeName;
  const productPos = layout?.productName;
  const barcodePos = layout?.barcode;
  const pricePos = layout?.price;
  const hasLayout = !!(storePos || productPos || barcodePos || pricePos);

  if (hasLayout) {
    if (showStoreName && storeName && storePos) {
      const size = storePos.size ?? 1;
      const boxHeightDots = storePos.heightMm ? dots(storePos.heightMm, dotsPerMm) : 0;
      runs.push({
        text: storeName,
        xDots: dots(storePos.xMm, dotsPerMm),
        yDots: dots(storePos.yMm, dotsPerMm),
        widthDots: Math.max(dots(storePos.widthMm ?? (widthMm - storePos.xMm), dotsPerMm), 20),
        heightDots: boxHeightDots || undefined,
        px: boxHeightDots ? Math.max(9, Math.round(boxHeightDots * 0.75)) : FONT_HEIGHT['3'] * size,
        bold: true,
        align: 'center',
        maxLines: 1,
      });
    }

    if (showProductName && productName && productPos) {
      const size = productPos.size ?? 1;
      const boxHeightDots = productPos.heightMm
        ? dots(productPos.heightMm, dotsPerMm)
        : Math.max(heightDots - dots(productPos.yMm, dotsPerMm), 20);
      runs.push({
        text: productName,
        xDots: dots(productPos.xMm, dotsPerMm),
        yDots: dots(productPos.yMm, dotsPerMm),
        widthDots: Math.max(dots(productPos.widthMm ?? (widthMm - productPos.xMm), dotsPerMm), 20),
        heightDots: boxHeightDots,
        px: productPos.heightMm ? Math.max(9, Math.round(boxHeightDots * 0.6)) : FONT_HEIGHT['2'] * size,
        bold: true,
        align: 'center',
        maxLines: 2,
      });
    }

    if (showPrice && priceValue && pricePos) {
      const size = pricePos.size ?? 1;
      const boxHeightDots = pricePos.heightMm ? dots(pricePos.heightMm, dotsPerMm) : 0;
      runs.push({
        text: priceValue,
        xDots: dots(pricePos.xMm, dotsPerMm),
        yDots: dots(pricePos.yMm, dotsPerMm),
        widthDots: Math.max(dots(pricePos.widthMm ?? (widthMm - pricePos.xMm), dotsPerMm), 20),
        heightDots: boxHeightDots || undefined,
        px: boxHeightDots ? Math.max(9, Math.round(boxHeightDots * 0.75)) : FONT_HEIGHT['3'] * size,
        bold: true,
        align: 'center',
        maxLines: 1,
      });
    }

    if (barcodePos) {
      const boxX = dots(barcodePos.xMm, dotsPerMm);
      const boxY = dots(barcodePos.yMm, dotsPerMm);
      const boxWidth = Math.max(dots(barcodePos.widthMm ?? (widthMm - barcodePos.xMm), dotsPerMm), 40);
      const boxHeight = barcodePos.heightMm
        ? Math.max(dots(barcodePos.heightMm, dotsPerMm), 20)
        : barcodeHeightDots;
      const hriDots = showBarcodeText
        ? Math.max(dots(Math.min(Math.max((barcodePos.heightMm ?? barcodeHeightMm) * 0.22, 1.5), 4), dotsPerMm), 12)
        : 0;
      const barHeight = Math.max(boxHeight - hriDots, 20);
      bars.push(...code128BarRects(barcodeData, {
        xDots: boxX,
        yDots: boxY,
        widthDots: boxWidth,
        heightDots: barHeight,
      }));
      if (showBarcodeText) {
        runs.push({
          text: barcodeData,
          xDots: boxX,
          yDots: boxY + barHeight,
          widthDots: boxWidth,
          heightDots: hriDots,
          px: Math.max(9, hriDots),
          align: 'center',
          maxLines: 1,
        });
      }
    }
  } else {
    const margin = dots(1, dotsPerMm);
    const fullWidth = Math.max(widthDots - margin * 2, 20);
    let cursorY = margin;

    if (showStoreName && storeName) {
      const run: RasterTextRun = {
        text: storeName,
        xDots: margin,
        yDots: cursorY,
        widthDots: fullWidth,
        px: FONT_HEIGHT['3'],
        bold: true,
        maxLines: 1,
      };
      runs.push(run);
      cursorY += Math.max(measureTextBlockHeight(run), FONT_HEIGHT['3']) + 8;
    }

    if (showProductName && productName) {
      const reserve = barcodeHeightDots
        + (showBarcodeText ? 20 : 0)
        + (showPrice ? 36 : 0)
        + 16;
      const availableHeight = Math.max(heightDots - cursorY - reserve, 24);
      const run: RasterTextRun = {
        text: productName,
        xDots: margin,
        yDots: cursorY,
        widthDots: fullWidth,
        heightDots: availableHeight,
        px: FONT_HEIGHT['2'],
      };
      runs.push(run);
      cursorY += Math.max(measureTextBlockHeight(run), FONT_HEIGHT['2']);
    }

    cursorY += 8;
    const availableWidth = Math.max(widthDots - margin * 2, 40);
    const narrow = Math.min(Math.max(Math.floor(availableWidth / barcodeModules), 1), 4);
    const wide = Math.min(narrow * 2, 10);
    barcodeCommand = `BARCODE ${margin},${cursorY},"${tsplBarcodeType(barcodeType)}",${barcodeHeightDots},${showBarcodeText ? 1 : 0},0,${narrow},${wide},"${sanitize(barcodeData)}"`;

    if (showPrice && priceValue) {
      const priceY = cursorY + barcodeHeightDots + (showBarcodeText ? 20 : 0) + 8;
      runs.push({
        text: priceValue,
        xDots: margin,
        yDots: priceY,
        widthDots: fullWidth,
        heightDots: Math.max(heightDots - priceY, 24),
        px: FONT_HEIGHT['3'],
        bold: true,
        maxLines: 1,
      });
    }
  }

  const layer = renderTextLayer(runs, widthDots, heightDots, bars);
  const image = layer ? cropRaster(layer) : null;
  if (!image) return null;

  const bitmapData = invertForTspl(image);
  const copyCount = Math.max(1, Math.min(Math.floor(copies) || 1, 999));
  const parts: Array<string | Uint8Array> = [
    `${sizeCommands(widthMm, Math.max(5, labelHeightMm), paperMode, labelGapMm).join('\r\n')}\r\n`,
    `BITMAP ${image.xDots},${image.yDots},${image.widthBytes},${image.heightDots},0,`,
    bitmapData,
    '\r\n',
  ];
  if (barcodeCommand) parts.push(`${barcodeCommand}\r\n`);
  parts.push(`PRINT 1,${copyCount}\r\n`);
  return concatParts(parts);
}

export function buildTsplLabel(opts: TsplLabelOptions): Uint8Array {
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
    layout,
    copies = 1,
    dotsPerMm = DEFAULT_DOTS_PER_MM,
  } = opts;

  const visibleText = [
    showStoreName ? storeName : '',
    showProductName ? productName : '',
    showPrice ? priceText(price, currencySymbol) : '',
  ].join(' ');
  const hasCustomLayout = !!(layout?.storeName || layout?.productName || layout?.barcode || layout?.price);

  if (canRasterizeText() && (hasNonAscii(visibleText) || hasCustomLayout)) {
    const rasterLabel = buildTsplRasterLabel(opts);
    if (rasterLabel) return rasterLabel;
  }

  const widthMm = Math.max(5, Math.min(labelWidthMm, paperWidthMm));
  const heightMm = Math.max(5, labelHeightMm);
  const commands = sizeCommands(widthMm, heightMm, paperMode, labelGapMm);

  const storePos = layout?.storeName;
  const productPos = layout?.productName;
  const barcodePos = layout?.barcode;
  const pricePos = layout?.price;
  const hasLayout = !!(storePos || productPos || barcodePos || pricePos);

  const barcodeHeightDots = Math.max(dots(barcodeHeightMm, dotsPerMm), 20);
  const barcodeData = normalizeBarcodeValue(barcodeValue, barcodeType);
  const barcodeModules = estimateBarcodeModules(barcodeData, barcodeType);

  if (hasLayout) {
    if (showStoreName && storeName && storePos) {
      const size = storePos.size ?? 1;
      const x = dots(storePos.xMm, dotsPerMm);
      const y = dots(storePos.yMm, dotsPerMm);
      const available = Math.max(dots(storePos.widthMm ?? (widthMm - storePos.xMm), dotsPerMm), 20);
      const maxChars = Math.max(1, Math.floor(available / (FONT_WIDTH['3'] * size)));
      commands.push(textCommand(x, y, '3', size, truncate(storeName, maxChars)));
    }

    if (showProductName && productName && productPos) {
      const size = productPos.size ?? 1;
      const x = dots(productPos.xMm, dotsPerMm);
      const y = dots(productPos.yMm, dotsPerMm);
      const available = Math.max(dots(productPos.widthMm ?? (widthMm - productPos.xMm), dotsPerMm), 20);
      const maxChars = Math.max(1, Math.floor(available / (FONT_WIDTH['2'] * size)));
      const lineHeight = FONT_HEIGHT['2'] * size;
      const availableHeight = productPos.heightMm
        ? Math.max(dots(productPos.heightMm, dotsPerMm), lineHeight)
        : lineHeight;
      const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
      const lines = wrapText(productName, maxChars).slice(0, maxLines);
      lines.forEach((line, index) => {
        commands.push(textCommand(x, y + index * lineHeight, '2', size, line));
      });
    }

    if (barcodePos) {
      const x = dots(barcodePos.xMm, dotsPerMm);
      const y = dots(barcodePos.yMm, dotsPerMm);
      const available = Math.max(dots(barcodePos.widthMm ?? (widthMm - barcodePos.xMm), dotsPerMm), 40);
      const height = barcodePos.heightMm
        ? Math.max(dots(barcodePos.heightMm, dotsPerMm), 20)
        : barcodeHeightDots;
      const narrow = Math.min(Math.max(Math.floor(available / barcodeModules), 1), 4);
      const wide = Math.min(narrow * 2, 10);
      commands.push(
        `BARCODE ${x},${y},"${tsplBarcodeType(barcodeType)}",${height},${showBarcodeText ? 1 : 0},0,${narrow},${wide},"${sanitize(barcodeData)}"`
      );
    }

    if (showPrice && pricePos) {
      const size = pricePos.size ?? 1;
      const x = dots(pricePos.xMm, dotsPerMm);
      const y = dots(pricePos.yMm, dotsPerMm);
      const available = Math.max(dots(pricePos.widthMm ?? (widthMm - pricePos.xMm), dotsPerMm), 20);
      const maxChars = Math.max(1, Math.floor(available / (FONT_WIDTH['3'] * size)));
      const priceText = `${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currencySymbol}`.trim();
      commands.push(textCommand(x, y, '3', size, truncate(priceText, maxChars)));
    }
  } else {
    let cursorY = dots(1, dotsPerMm);

    if (showStoreName && storeName) {
      const maxChars = Math.max(1, Math.floor(dots(widthMm - 2, dotsPerMm) / FONT_WIDTH['3']));
      commands.push(textCommand(dots(1, dotsPerMm), cursorY, '3', 1, truncate(storeName, maxChars)));
      cursorY += FONT_HEIGHT['3'] + 8;
    }

    if (showProductName && productName) {
      const maxChars = Math.max(1, Math.floor(dots(widthMm - 2, dotsPerMm) / FONT_WIDTH['2']));
      const lineHeight = FONT_HEIGHT['2'];
      const lines = wrapText(productName, maxChars);
      lines.forEach((line, index) => {
        commands.push(textCommand(dots(1, dotsPerMm), cursorY + index * lineHeight, '2', 1, line));
      });
      cursorY += lines.length * lineHeight;
    }

    cursorY += 8;
    const available = Math.max(dots(widthMm - 2, dotsPerMm), 40);
    const narrow = Math.min(Math.max(Math.floor(available / barcodeModules), 1), 4);
    const wide = Math.min(narrow * 2, 10);
    commands.push(
      `BARCODE ${dots(1, dotsPerMm)},${cursorY},"${tsplBarcodeType(barcodeType)}",${barcodeHeightDots},${showBarcodeText ? 1 : 0},0,${narrow},${wide},"${sanitize(barcodeData)}"`
    );
    cursorY += barcodeHeightDots + (showBarcodeText ? FONT_HEIGHT['1'] + 4 : 0);

    if (showPrice) {
      const maxChars = Math.max(1, Math.floor(dots(widthMm - 2, dotsPerMm) / FONT_WIDTH['3']));
      const priceText = `${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currencySymbol}`.trim();
      commands.push(textCommand(dots(1, dotsPerMm), cursorY + 8, '3', 1, truncate(priceText, maxChars)));
    }
  }

  const copyCount = Math.max(1, Math.min(Math.floor(copies) || 1, 999));
  commands.push(`PRINT 1,${copyCount}`);

  return encode(commands.join('\r\n') + '\r\n');
}

export function testPrintTspl(
  storeName: string,
  labelWidthMm = 50,
  labelHeightMm = 30,
  labelGapMm = 3,
): Uint8Array {
  const widthMm = Math.max(5, labelWidthMm);
  const heightMm = Math.max(5, labelHeightMm);
  const maxChars = Math.max(1, Math.floor(dots(widthMm - 4, DEFAULT_DOTS_PER_MM) / FONT_WIDTH['3']));
  const store = truncate(storeName || 'My Store', maxChars);

  if (canRasterizeText() && hasNonAscii(store)) {
    const widthDots = dots(widthMm, DEFAULT_DOTS_PER_MM);
    const heightDots = dots(heightMm, DEFAULT_DOTS_PER_MM);
    const textRuns: RasterTextRun[] = [
      {
        text: storeName || 'My Store',
        xDots: dots(2, DEFAULT_DOTS_PER_MM),
        yDots: dots(2, DEFAULT_DOTS_PER_MM),
        widthDots: widthDots - dots(4, DEFAULT_DOTS_PER_MM),
        px: FONT_HEIGHT['3'],
        bold: true,
        maxLines: 1,
      },
      {
        text: 'MiBayate Printer Test',
        xDots: dots(2, DEFAULT_DOTS_PER_MM),
        yDots: dots(7, DEFAULT_DOTS_PER_MM),
        widthDots: widthDots - dots(4, DEFAULT_DOTS_PER_MM),
        px: FONT_HEIGHT['2'],
        maxLines: 1,
      },
      {
        text: 'TSPL label mode works.',
        xDots: dots(2, DEFAULT_DOTS_PER_MM),
        yDots: dots(11, DEFAULT_DOTS_PER_MM),
        widthDots: widthDots - dots(4, DEFAULT_DOTS_PER_MM),
        px: FONT_HEIGHT['2'],
        maxLines: 1,
      },
    ];
    const layer = renderTextLayer(textRuns, widthDots, heightDots);
    const image = layer ? cropRaster(layer) : null;
    if (image) {
      const bitmapData = invertForTspl(image);
      return concatParts([
        `SIZE ${fmt(widthMm)} mm,${fmt(heightMm)} mm\r\n`,
        `GAP ${fmt(Math.max(0, labelGapMm))} mm,0 mm\r\n`,
        'DIRECTION 0\r\n',
        'REFERENCE 0,0\r\n',
        'DENSITY 8\r\n',
        'CLS\r\n',
        `BITMAP ${image.xDots},${image.yDots},${image.widthBytes},${image.heightDots},0,`,
        bitmapData,
        '\r\n',
        `BARCODE ${dots(2, DEFAULT_DOTS_PER_MM)},${dots(16, DEFAULT_DOTS_PER_MM)},"128",${dots(6, DEFAULT_DOTS_PER_MM)},1,0,2,4,"123456789012"\r\n`,
        'PRINT 1,1\r\n',
      ]);
    }
  }

  const commands = [
    `SIZE ${fmt(widthMm)} mm,${fmt(heightMm)} mm`,
    `GAP ${fmt(Math.max(0, labelGapMm))} mm,0 mm`,
    'DIRECTION 0',
    'REFERENCE 0,0',
    'DENSITY 8',
    'CLS',
    textCommand(dots(2, DEFAULT_DOTS_PER_MM), dots(2, DEFAULT_DOTS_PER_MM), '3', 1, store),
    textCommand(dots(2, DEFAULT_DOTS_PER_MM), dots(7, DEFAULT_DOTS_PER_MM), '2', 1, 'MiBayate Printer Test'),
    textCommand(dots(2, DEFAULT_DOTS_PER_MM), dots(11, DEFAULT_DOTS_PER_MM), '2', 1, 'TSPL label mode works.'),
    `BARCODE ${dots(2, DEFAULT_DOTS_PER_MM)},${dots(16, DEFAULT_DOTS_PER_MM)},"128",${dots(6, DEFAULT_DOTS_PER_MM)},1,0,2,4,"123456789012"`,
    'PRINT 1,1',
  ];

  return encode(commands.join('\r\n') + '\r\n');
}

export function feedTspl(): Uint8Array {
  return encode('FORMFEED\r\n');
}
