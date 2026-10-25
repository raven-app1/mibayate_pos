import { describe, expect, it } from 'vitest';
import { CODE128_QUIET_MODULES, code128BarRects, code128Elements } from './code128';

describe('code128', () => {
  it('encodes start, data, checksum and stop symbols', () => {
    const { elements, totalUnits } = code128Elements('A');
    const barUnits = elements.filter(e => e.isBar).reduce((sum, e) => sum + e.units, 0);
    expect(totalUnits).toBe(11 + 11 + 11 + 13);
    expect(barUnits).toBeGreaterThan(0);
    expect(barUnits).toBeLessThan(totalUnits);
  });

  it('keeps every bar inside the configured box', () => {
    const box = { xDots: 16, yDots: 104, widthDots: 608, heightDots: 62 };
    const bars = code128BarRects('885001234567', box);
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.xDots).toBeGreaterThanOrEqual(box.xDots + CODE128_QUIET_MODULES);
      expect(bar.xDots + bar.widthDots).toBeLessThanOrEqual(box.xDots + box.widthDots - CODE128_QUIET_MODULES);
      expect(bar.yDots).toBe(box.yDots);
      expect(bar.heightDots).toBe(box.heightDots);
      expect(bar.widthDots).toBeGreaterThan(0);
    }
  });

  it('stretches the symbol across the configured width like the preview', () => {
    const box = { xDots: 16, yDots: 0, widthDots: 608, heightDots: 80 };
    const value = '885001234567';
    const bars = code128BarRects(value, box);
    const { totalUnits } = code128Elements(value);
    const quietDots = (box.widthDots / (totalUnits + CODE128_QUIET_MODULES * 2)) * CODE128_QUIET_MODULES;
    const first = bars[0];
    const last = bars[bars.length - 1];
    expect(Math.abs(first.xDots - box.xDots - quietDots)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.xDots + box.widthDots - (last.xDots + last.widthDots) - quietDots)).toBeLessThanOrEqual(1);
  });

  it('drops characters CODE128 cannot encode', () => {
    expect(code128Elements('AB\nCD').totalUnits).toBe(code128Elements('ABCD').totalUnits);
  });
});
