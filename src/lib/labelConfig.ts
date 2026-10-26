import { LabelConfig } from '../types';

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  paperMode: 'sticker',
  paperWidth: '72',
  labelWidth: '40',
  labelHeight: '20',
  barcodeWidth: '40',
  barcodeHeight: '10',
  barcodeType: 'CODE128',
  cutMode: 'off',
  labelGap: '1',
  feedOffset: '0',
  labelAlign: 'right',
  labelOffsetX: '0',
  showStoreName: true,
  showProductName: true,
  showPrice: false,
  showCodeText: true,
  storeName: 'Mibayate',
  customLayout: true,
  layoutXY: {
    store: { x: '0', y: '1', w: '40', h: '2' },
    product: { x: '0', y: '3', w: '40', h: '2' },
    barcode: { x: '0', y: '6', w: '40', h: '10' },
    price: { x: '0', y: '16', w: '40', h: '3' },
  },
  fontSize: {
    store: 2,
    product: 2,
    price: 2,
  },
  dpi: 203,
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
        dpi: parsed.dpi === 300 ? 300 : 203,
        labelAlign: parsed.labelAlign === 'left' || parsed.labelAlign === 'center' ? parsed.labelAlign : 'right',
        labelOffsetX: typeof parsed.labelOffsetX === 'string' ? parsed.labelOffsetX : '0',
        storeName: (parsed.storeName && parsed.storeName !== 'My Retail Store') ? parsed.storeName : (defaultStoreName || DEFAULT_LABEL_CONFIG.storeName),
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
  const initial: LabelConfig = {
    ...DEFAULT_LABEL_CONFIG,
    storeName: defaultStoreName || DEFAULT_LABEL_CONFIG.storeName,
  };
  saveLabelConfig(initial);
  return initial;
}

export function computeLabelOffsetMm(config: {
  paperWidth: string;
  labelWidth: string;
  labelAlign?: 'left' | 'center' | 'right';
  labelOffsetX?: string;
}): number {
  const paperMm = parseFloat(config.paperWidth) || 72;
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
