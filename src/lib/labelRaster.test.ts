import { describe, expect, it, vi } from 'vitest';
import { cropRaster, hasNonAscii, renderTextLayer } from './labelRaster';

function makeImage(widthDots: number, heightDots: number, points: Array<[number, number]>) {
  const widthBytes = Math.ceil(widthDots / 8);
  const data = new Uint8Array(widthBytes * heightDots);
  for (const [x, y] of points) {
    data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return { widthDots, widthBytes, heightDots, data };
}

function isSet(
  image: { widthBytes: number; data: Uint8Array },
  x: number,
  y: number,
): boolean {
  return (image.data[y * image.widthBytes + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
}

describe('labelRaster', () => {
  it('detects non-ascii label text', () => {
    expect(hasNonAscii('My Store')).toBe(false);
    expect(hasNonAscii('မြန်မာစတိုး')).toBe(true);
    expect(hasNonAscii('2,500 Ks')).toBe(false);
  });

  it('crops a raster to its byte-aligned bounding box', () => {
    const cropped = cropRaster(makeImage(16, 8, [[3, 2], [12, 5]]));
    expect(cropped).not.toBeNull();
    expect(cropped?.xDots).toBe(0);
    expect(cropped?.yDots).toBe(2);
    expect(cropped?.widthBytes).toBe(2);
    expect(cropped?.heightDots).toBe(4);
    expect(isSet(cropped!, 3, 0)).toBe(true);
    expect(isSet(cropped!, 12, 3)).toBe(true);
    expect(cropped?.data.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  it('aligns the crop origin to the byte boundary of the first dot', () => {
    const cropped = cropRaster(makeImage(24, 4, [[11, 1]]));
    expect(cropped?.xDots).toBe(8);
    expect(cropped?.widthBytes).toBe(1);
    expect(isSet(cropped!, 3, 0)).toBe(true);
  });

  it('returns null for an empty raster', () => {
    expect(cropRaster(makeImage(16, 8, []))).toBeNull();
  });

  it('paints barcode bar rectangles into the raster layer', () => {
    const filled: Array<[number, number, number, number]> = [];
    const createElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return createElement(tagName);
      const context = {
        font: '',
        fillStyle: '',
        textBaseline: '',
        textAlign: '',
        measureText: () => ({ width: 0 }),
        fillRect: (x: number, y: number, w: number, h: number) => filled.push([x, y, w, h]),
        fillText: () => undefined,
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
      return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    });

    const layer = renderTextLayer([], 64, 40, [
      { xDots: 4, yDots: 6, widthDots: 2, heightDots: 10 },
    ]);

    expect(layer).not.toBeNull();
    expect(filled).toContainEqual([4, 6, 2, 10]);
    spy.mockRestore();
  });
});
