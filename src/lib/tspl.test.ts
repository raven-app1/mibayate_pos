import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLabelRaster, buildTsplLabel } from './tspl';

interface MockContext {
  font: string;
  fillStyle: string;
  textBaseline: string;
  textAlign: string;
  measureText: (value: string) => { width: number };
  fillRect: () => void;
  fillText: () => void;
  getImageData: (x: number, y: number, w: number, h: number) => { width: number; height: number; data: Uint8ClampedArray };
}

function installCanvasMock(options: { black: boolean; context: boolean }) {
  const createElement = document.createElement.bind(document) as (tag: string) => HTMLElement;
  return vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName !== 'canvas') return createElement(tagName);
    if (!options.context) {
      return { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    }
    const context: MockContext = {
      font: '',
      fillStyle: '',
      textBaseline: '',
      textAlign: '',
      measureText: () => ({ width: 4 }),
      fillRect: () => undefined,
      fillText: () => undefined,
      getImageData: (_x, _y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        if (options.black) {
          for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = 255;
          }
        }
        return { width: w, height: h, data };
      },
    };
    return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  });
}

function toText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const baseOptions = {
  storeName: 'My Retail Store',
  productName: 'BN 5X Battery',
  barcodeValue: '100822',
  price: 0,
  paperWidthMm: 80,
  labelHeightMm: 30,
  barcodeType: 'CODE128' as const,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildLabelRaster', () => {
  it('keeps a byte-aligned label bitmap lossless', () => {
    installCanvasMock({ black: true, context: true });

    const raster = buildLabelRaster({ ...baseOptions, labelWidthMm: 80, labelOffsetMm: 0 });

    expect(raster.labelWidthDots).toBe(640);
    expect(raster.paperWidthDots).toBe(640);
    expect(raster.image).not.toBeNull();
    expect(raster.image?.widthBytes).toBe(80);
  });

  it('truncates the bitmap so it can never cross the right edge of the paper', () => {
    installCanvasMock({ black: true, context: true });

    const raster = buildLabelRaster({ ...baseOptions, labelWidthMm: 76.5, labelOffsetMm: 4.5 });
    const image = raster.image;

    expect(raster.labelWidthDots).toBe(612);
    expect(raster.offsetDots).toBe(36);
    expect(raster.paperWidthDots).toBe(648);
    expect(image).not.toBeNull();
    expect(image!.xDots + raster.offsetDots + image!.widthBytes * 8).toBeLessThanOrEqual(raster.paperWidthDots);
  });

  it('shares the label geometry the live preview renders from', () => {
    installCanvasMock({ black: true, context: true });

    const raster = buildLabelRaster({
      ...baseOptions,
      labelWidthMm: 80,
      labelOffsetMm: 0,
      layout: {
        barcode: { xMm: 2, yMm: 13, widthMm: 70, heightMm: 10 },
      },
    });

    expect(raster.heightDots).toBe(240);
    expect(raster.dotsPerMm).toBe(8);
    expect(raster.barcodeCommand).toBe('');
    expect(raster.image).not.toBeNull();
  });
});

describe('buildTsplLabel', () => {
  it('emits a BITMAP raster when a canvas is available', () => {
    installCanvasMock({ black: true, context: true });

    const label = buildTsplLabel({
      ...baseOptions,
      labelWidthMm: 80,
      labelOffsetMm: 0,
      layout: {
        barcode: { xMm: 2, yMm: 13, widthMm: 70, heightMm: 10 },
      },
    });
    const text = toText(label);

    expect(text).toContain('BITMAP');
    expect(text).toContain('SIZE 80 mm,30 mm');
  });

  it('falls back to vector commands when the raster cannot be built', () => {
    installCanvasMock({ black: false, context: false });

    const label = buildTsplLabel({
      ...baseOptions,
      labelWidthMm: 80,
      labelOffsetMm: 0,
      layout: {
        barcode: { xMm: 2, yMm: 13, widthMm: 70, heightMm: 10 },
      },
    });
    const text = toText(label);

    expect(text).not.toContain('BITMAP');
    expect(text).toContain('SIZE 80 mm,30 mm');
    expect(text).toContain('BARCODE');
  });
});
