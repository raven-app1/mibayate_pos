import { describe, it, expect } from 'vitest';
import { calculateTax, toggleTax, formatTaxLabel } from './tax';

describe('tax utility functions', () => {
  describe('calculateTax - check / uncheck behavior', () => {
    it('is unchecked by default with 0 tax amount', () => {
      const result = calculateTax({ subtotal: 10000, taxRate: 5 });
      expect(result.applyTax).toBe(false);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(10000);
      expect(result.taxRate).toBe(5);
    });

    it('calculates tax when checked (applyTax: true)', () => {
      const result = calculateTax({ subtotal: 10000, taxRate: 5, applyTax: true });
      expect(result.applyTax).toBe(true);
      expect(result.taxAmount).toBe(500);
      expect(result.totalDue).toBe(10500);
    });

    it('removes tax when unchecked (applyTax: false) after being checked', () => {
      const checked = calculateTax({ subtotal: 10000, taxRate: 5, applyTax: true });
      expect(checked.taxAmount).toBe(500);

      const unchecked = calculateTax({ subtotal: 10000, taxRate: 5, applyTax: false });
      expect(unchecked.applyTax).toBe(false);
      expect(unchecked.taxAmount).toBe(0);
      expect(unchecked.totalDue).toBe(10000);
    });

    it('calculates tax after discount when checked', () => {
      const result = calculateTax({ subtotal: 10000, discount: 2000, taxRate: 5, applyTax: true });
      expect(result.taxableAmount).toBe(8000);
      expect(result.taxAmount).toBe(400);
      expect(result.totalDue).toBe(8400);
    });
  });

  describe('calculateTax - error prevention and edge cases', () => {
    it('handles empty arguments safely without crashing', () => {
      const result = calculateTax();
      expect(result.subtotal).toBe(0);
      expect(result.discount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(0);
      expect(result.applyTax).toBe(false);
    });

    it('handles negative discount by treating it as zero', () => {
      const result = calculateTax({ subtotal: 1000, discount: -500, taxRate: 5, applyTax: true });
      expect(result.discount).toBe(0);
      expect(result.taxableAmount).toBe(1000);
      expect(result.taxAmount).toBe(50);
      expect(result.totalDue).toBe(1050);
    });

    it('handles discount greater than subtotal without negative tax or negative total', () => {
      const result = calculateTax({ subtotal: 1000, discount: 5000, taxRate: 5, applyTax: true });
      expect(result.taxableAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(0);
    });

    it('handles invalid non-numeric strings for discount', () => {
      const result = calculateTax({ subtotal: 1000, discount: 'invalid_discount', taxRate: 5, applyTax: true });
      expect(result.discount).toBe(0);
      expect(result.taxAmount).toBe(50);
      expect(result.totalDue).toBe(1050);
    });

    it('handles negative tax rate by treating it as 0%', () => {
      const result = calculateTax({ subtotal: 1000, taxRate: -10, applyTax: true });
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(1000);
    });

    it('handles invalid non-numeric strings for tax rate', () => {
      const result = calculateTax({ subtotal: 1000, taxRate: 'abc' as unknown as number, applyTax: true });
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(1000);
    });

    it('handles null and undefined values safely', () => {
      const result = calculateTax({
        subtotal: null,
        discount: undefined,
        taxRate: null,
        applyTax: null
      });
      expect(result.subtotal).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(0);
      expect(result.applyTax).toBe(false);
    });

    it('handles negative subtotal by treating it as 0', () => {
      const result = calculateTax({ subtotal: -1000, taxRate: 5, applyTax: true });
      expect(result.subtotal).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(0);
    });

    it('handles 0% tax rate when checked without error', () => {
      const result = calculateTax({ subtotal: 1000, taxRate: 0, applyTax: true });
      expect(result.taxAmount).toBe(0);
      expect(result.totalDue).toBe(1000);
    });

    it('rounds floating point tax accurately to 2 decimals', () => {
      // 10.33 * 5% = 0.5165 -> rounds to 0.52
      const result = calculateTax({ subtotal: 10.33, taxRate: 5, applyTax: true });
      expect(result.taxAmount).toBe(0.52);
      expect(result.totalDue).toBe(10.85);
    });
  });

  describe('toggleTax', () => {
    it('toggles true to false and false to true', () => {
      expect(toggleTax(false)).toBe(true);
      expect(toggleTax(true)).toBe(false);
    });
  });

  describe('formatTaxLabel', () => {
    it('formats valid tax rate correctly', () => {
      expect(formatTaxLabel(5)).toBe('Tax (5%)');
      expect(formatTaxLabel(7.5)).toBe('Tax (7.5%)');
    });

    it('formats invalid or negative rate as 0%', () => {
      expect(formatTaxLabel(-5)).toBe('Tax (0%)');
      expect(formatTaxLabel(null)).toBe('Tax (0%)');
    });
  });
});
