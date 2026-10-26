import { LabelConfig } from '../types';

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  paperMode: 'sticker',
  paperWidth: '80',
  labelWidth: '80',
  labelHeight: '30',
  barcodeWidth: '76',
  barcodeHeight: '10',
  barcodeType: 'CODE128',
  cutMode: 'off',
  labelGap: '3',
  feedOffset: '0',
  labelAlign: 'right',
  labelOffsetX: '0',
  showStoreName: true,
  showProductName: true,
  showPrice: true,
  showCodeText: true,
  storeName: 'My Retail Store',
  customLayout: true,
  layoutXY: {
    store: { x: '2', y: '1', w: '76', h: '4' },
    product: { x: '2', y: '6', w: '76', h: '6' },
    barcode: { x: '2', y: '13', w: '76', h: '10' },
    price: { x: '2', y: '24', w: '76', h: '5' },
  },
  fontSize: {
    store: 1,
    product: 1,
    price: 2,
  },
};

const STORAGE_KEY = 'retail_shop_label_config';

export function loadLabelConfig(defaultStoreName?: string): LabelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_LABEL_CONFIG,
        ...parsed,
        labelAlign: parsed.labelAlign === 'left' || parsed.labelAlign === 'center' ? parsed.labelAlign : 'right',
        labelOffsetX: typeof parsed.labelOffsetX === 'string' ? parsed.labelOffsetX : '0',
        storeName: parsed.storeName || defaultStoreName || DEFAULT_LABEL_CONFIG.storeName,
        layoutXY: {
          ...DEFAULT_LABEL_CONFIG.layoutXY,
          ...(parsed.layoutXY || {}),
        },
        fontSize: {
          ...DEFAULT_LABEL_CONFIG.fontSize,
          ...(parsed.fontSize || {}),
        },
      };
    }
  } catch (err) {}
  return {
    ...DEFAULT_LABEL_CONFIG,
    storeName: defaultStoreName || DEFAULT_LABEL_CONFIG.storeName,
  };
}

export function computeLabelOffsetMm(config: {
  paperWidth: string;
  labelWidth: string;
  labelAlign?: 'left' | 'center' | 'right';
  labelOffsetX?: string;
}): number {
  const paperMm = parseFloat(config.paperWidth) || 80;
  const labelMm = Math.min(parseFloat(config.labelWidth) || paperMm, paperMm);
  const align = config.labelAlign ?? 'right';
  const base = align === 'left' ? 0 : align === 'center' ? (paperMm - labelMm) / 2 : paperMm - labelMm;
  const parsedNudge = parseFloat(config.labelOffsetX ?? '0');
  const nudge = isFinite(parsedNudge) ? Math.min(Math.max(parsedNudge, -20), 20) : 0;
  return Math.max(0, Math.round((base + nudge) * 10) / 10);
}

export function positiveMm(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = parseFloat(value);
  return isFinite(n) ? n : undefined;
}

export function rescaleLabelLayout(
  layoutXY: LabelConfig['layoutXY'],
  barcodeWidth: string | undefined,
  barcodeHeight: string | undefined,
  prevWidthMm: number,
  prevHeightMm: number,
  nextWidthMm: number,
  nextHeightMm: number,
): { layoutXY: LabelConfig['layoutXY']; barcodeWidth?: string; barcodeHeight?: string } {
  const ratioX = prevWidthMm > 0 && nextWidthMm > 0 ? nextWidthMm / prevWidthMm : 1;
  const ratioY = prevHeightMm > 0 && nextHeightMm > 0 ? nextHeightMm / prevHeightMm : 1;
  if (ratioX === 1 && ratioY === 1) return { layoutXY, barcodeWidth, barcodeHeight };

  const scale = (value: string | undefined, ratio: number): string | undefined => {
    const n = positiveMm(value);
    if (n === undefined) return value;
    return String(Math.round(n * ratio * 1000) / 1000);
  };

  const nextLayoutXY = { ...layoutXY };
  (['store', 'product', 'barcode', 'price'] as const).forEach((k) => {
    nextLayoutXY[k] = {
      ...nextLayoutXY[k],
      x: scale(nextLayoutXY[k].x, ratioX),
      y: scale(nextLayoutXY[k].y, ratioY),
      w: scale(nextLayoutXY[k].w, ratioX),
      h: scale(nextLayoutXY[k].h, ratioY),
    };
  });

  return {
    layoutXY: nextLayoutXY,
    barcodeWidth: scale(barcodeWidth, ratioX),
    barcodeHeight: scale(barcodeHeight, ratioY),
  };
}

export function withLabelSize(
  config: LabelConfig,
  labelWidth: string,
  labelHeight: string,
  fallbackWidthMm = 80,
  fallbackHeightMm = 30,
): LabelConfig {
  const prevW = positiveMm(config.labelWidth) ?? fallbackWidthMm;
  const prevH = positiveMm(config.labelHeight) ?? fallbackHeightMm;
  const nextW = positiveMm(labelWidth) ?? fallbackWidthMm;
  const nextH = positiveMm(labelHeight) ?? fallbackHeightMm;
  const scaled = rescaleLabelLayout(config.layoutXY, config.barcodeWidth, config.barcodeHeight, prevW, prevH, nextW, nextH);
  return {
    ...config,
    layoutXY: scaled.layoutXY,
    barcodeWidth: scaled.barcodeWidth ?? config.barcodeWidth,
    barcodeHeight: scaled.barcodeHeight ?? config.barcodeHeight,
    labelWidth,
    labelHeight,
  };
}

export function saveLabelConfig(config: LabelConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {}
}
