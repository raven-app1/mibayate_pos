import { describe, expect, it, beforeEach } from 'vitest';
import { DEFAULT_LABEL_CONFIG, loadLabelConfig, saveLabelConfig, computeLabelOffsetMm } from './labelConfig';

describe('labelConfig defaults and persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides the expected 40x20mm defaults on 72mm paper at 203 DPI', () => {
    expect(DEFAULT_LABEL_CONFIG.paperMode).toBe('sticker');
    expect(DEFAULT_LABEL_CONFIG.dpi).toBe(203);
    expect(DEFAULT_LABEL_CONFIG.paperWidth).toBe('72');
    expect(DEFAULT_LABEL_CONFIG.labelWidth).toBe('40');
    expect(DEFAULT_LABEL_CONFIG.labelHeight).toBe('20');
    expect(DEFAULT_LABEL_CONFIG.labelGap).toBe('1');
    expect(DEFAULT_LABEL_CONFIG.feedOffset).toBe('0');
    expect(DEFAULT_LABEL_CONFIG.labelAlign).toBe('left');
    expect(DEFAULT_LABEL_CONFIG.labelOffsetX).toBe('0');

    expect(DEFAULT_LABEL_CONFIG.storeName).toBe('Mibayate');
    expect(DEFAULT_LABEL_CONFIG.showStoreName).toBe(true);
    expect(DEFAULT_LABEL_CONFIG.layoutXY.store).toEqual({ x: '0', y: '1', w: '40', h: '2' });
    expect(DEFAULT_LABEL_CONFIG.fontSize.store).toBe(2);

    expect(DEFAULT_LABEL_CONFIG.showProductName).toBe(true);
    expect(DEFAULT_LABEL_CONFIG.layoutXY.product).toEqual({ x: '0', y: '3', w: '40', h: '2' });
    expect(DEFAULT_LABEL_CONFIG.fontSize.product).toBe(2);

    expect(DEFAULT_LABEL_CONFIG.barcodeType).toBe('CODE128');
    expect(DEFAULT_LABEL_CONFIG.barcodeWidth).toBe('40');
    expect(DEFAULT_LABEL_CONFIG.barcodeHeight).toBe('10');
    expect(DEFAULT_LABEL_CONFIG.layoutXY.barcode).toEqual({ x: '0', y: '6', w: '40', h: '10' });
  });

  it('saves defaults to localStorage when no saved config exists', () => {
    expect(localStorage.getItem('retail_shop_label_config')).toBeNull();
    const loaded = loadLabelConfig();
    expect(loaded.storeName).toBe('Mibayate');
    expect(loaded.labelWidth).toBe('40');
    expect(loaded.labelHeight).toBe('20');
    expect(localStorage.getItem('retail_shop_label_config')).not.toBeNull();
  });

  it('preserves user modifications across reloads', () => {
    const loaded = loadLabelConfig();
    const modified = { ...loaded, labelWidth: '50', labelHeight: '25' };
    saveLabelConfig(modified);

    const reloaded = loadLabelConfig();
    expect(reloaded.labelWidth).toBe('50');
    expect(reloaded.labelHeight).toBe('25');
  });

  it('computes 0mm left-aligned offset by default', () => {
    const offset = computeLabelOffsetMm({
      paperWidth: '72',
      labelWidth: '40',
      labelOffsetX: '0',
    });
    expect(offset).toBe(0);
  });
});
