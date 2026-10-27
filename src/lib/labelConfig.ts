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
  labelAlign: 'left',
  labelOffsetX: '0',
  showStoreName: true,
  showProductName: true,
  showPrice: false,
  showCodeText: true,
  storeName: 'Mibayate',
  customLayout: true,
  layoutXY: {
    store: { x: '0', y: '1' },
    product: { x: '0', y: '3.5' },
    barcode: { x: '0', y: '8', w: '40', h: '10' },
    price: { x: '0', y: '16' },
  },
  fontSize: {
    store: 12,
    product: 10,
    price: 13,
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
        labelAlign: 'left',
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
  paperWidth?: string;
  labelWidth?: string;
  labelAlign?: 'left' | 'center' | 'right';
  labelOffsetX?: string;
}): number {
  const parsedNudge = parseFloat(config.labelOffsetX ?? '0');
  const nudge = isFinite(parsedNudge) ? Math.min(Math.max(parsedNudge, -20), 20) : 0;
  return Math.max(0, Math.round(nudge * 10) / 10);
}


export function saveLabelConfig(config: LabelConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {}
}
