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
  dpi: 300,
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
        dpi: parsed.dpi === 203 ? 203 : 300,
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


export function saveLabelConfig(config: LabelConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {}
}
