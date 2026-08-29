export interface TaxCalculationParams {
  subtotal?: number | null;
  discount?: number | string | null;
  taxRate?: number | string | null;
  applyTax?: boolean | null;
}

export interface TaxCalculationResult {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  totalDue: number;
  applyTax: boolean;
}

/**
 * Calculates tax and total due with zero-error guarantees.
 *
 * Rules:
 * - Unchecked by default (applyTax === false -> taxAmount = 0).
 * - Never returns NaN, negative numbers, or Infinity.
 * - Tax is applied only to non-negative taxable amount (subtotal - discount).
 * - Floating point values are rounded safely to 2 decimal places.
 */
export function calculateTax({
  subtotal = 0,
  discount = 0,
  taxRate = 0,
  applyTax = false,
}: TaxCalculationParams = {}): TaxCalculationResult {
  const numSubtotal = Number(subtotal);
  const safeSubtotal = Number.isFinite(numSubtotal) && numSubtotal > 0 ? numSubtotal : 0;

  const parsedDiscount = typeof discount === 'string' ? parseFloat(discount) : Number(discount);
  const safeDiscount = Number.isFinite(parsedDiscount) && parsedDiscount > 0 ? parsedDiscount : 0;

  const parsedRate = typeof taxRate === 'string' ? parseFloat(taxRate) : Number(taxRate);
  const safeRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 0;

  const isApplied = Boolean(applyTax);
  const taxableAmount = Math.max(0, safeSubtotal - safeDiscount);

  let taxAmount = 0;
  if (isApplied && safeRate > 0 && taxableAmount > 0) {
    const rawTax = (taxableAmount * safeRate) / 100;
    if (Number.isFinite(rawTax) && rawTax > 0) {
      taxAmount = Number(rawTax.toFixed(2));
    }
  }

  const rawTotal = taxableAmount + taxAmount;
  const totalDue = Number.isFinite(rawTotal) && rawTotal > 0 ? Number(rawTotal.toFixed(2)) : 0;

  return {
    subtotal: Number(safeSubtotal.toFixed(2)),
    discount: Number(safeDiscount.toFixed(2)),
    taxableAmount: Number(taxableAmount.toFixed(2)),
    taxRate: safeRate,
    taxAmount,
    totalDue,
    applyTax: isApplied,
  };
}

/**
 * Toggles tax application state.
 */
export function toggleTax(current: boolean): boolean {
  return !Boolean(current);
}

/**
 * Formats tax rate label (e.g. "Tax (5%)").
 */
export function formatTaxLabel(taxRate?: number | null): string {
  const rate = Number(taxRate);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  return `Tax (${safeRate}%)`;
}
