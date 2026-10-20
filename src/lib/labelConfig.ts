import { LabelConfig } from '../types';

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  paperMode: 'sticker',
  protocol: 'escpos',
  paperWidth: '80',
  labelWidth: '80',
  labelHeight: '30',
  barcodeWidth: '76',
  barcodeHeight: '10',
  barcodeType: 'CODE128',
  cutMode: 'off',
  labelGap: '3',
  feedOffset: '0',
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
        protocol: parsed.protocol === 'tspl' ? 'tspl' : 'escpos',
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

export function saveLabelConfig(config: LabelConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {}
}
