import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LabelRasterPreview from './LabelRasterPreview';

interface FakeContext {
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  measureText: (value: string) => { width: number };
  fillRect: () => void;
  fillText: () => void;
  createImageData: (w: number, h: number) => { width: number; height: number; data: Uint8ClampedArray };
  getImageData: (x: number, y: number, w: number, h: number) => { width: number; height: number; data: Uint8ClampedArray };
  putImageData: () => void;
  drawImage: (source: HTMLCanvasElement) => void;
  setTransform: () => void;
}

const options = {
  storeName: 'My Retail Store',
  productName: 'BN 5X Battery',
  barcodeValue: '100822',
  price: 0,
  paperWidthMm: 80,
  labelWidthMm: 80,
  labelHeightMm: 30,
  barcodeType: 'CODE128' as const,
  layout: {
    barcode: { xMm: 2, yMm: 13, widthMm: 70, heightMm: 10 },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LabelRasterPreview', () => {
  it('blits the exact printer raster onto the preview canvas', async () => {
    const sources: Array<{ width: number; height: number }> = [];

    const context: FakeContext = {
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      measureText: () => ({ width: 4 }),
      fillRect: () => undefined,
      fillText: () => undefined,
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
        return { width: w, height: h, data };
      },
      putImageData: () => undefined,
      drawImage: source => sources.push({ width: source.width, height: source.height }),
      setTransform: () => undefined,
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    );

    const { container } = render(
      <LabelRasterPreview options={options} widthMm={80} heightMm={30} scale={4} />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(320);
    expect(canvas?.height).toBe(120);

    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    expect(sources).toEqual([{ width: 640, height: 240 }]);
  });
});
