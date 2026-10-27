import { describe, expect, it } from 'vitest';
import { buildEscPosReceipt, receiptRow, barcode, init, cut, separator } from './escpos';
import { SaleWithItems, BusinessProfile } from '../types';

describe('escpos receipt', () => {
  const mockBusiness: BusinessProfile = {
    name: 'Mibayate POS',
    tagline: 'Retail Store',
    currency: 'Ks',
    receipt_footer: 'Thank you for shopping with us!',
  };

  const mockSale: SaleWithItems = {
    id: 'SALE-12345678',
    cashier_id: 'user_1',
    cashier_name: 'Ko Min',
    branch_name: 'Main Branch',
    total_amount: 35000,
    discount: 5000,
    payment_method: 'cash',
    created_at: '2026-10-27T10:00:00.000Z',
    items: [
      {
        id: 'item_1',
        sale_id: 'SALE-12345678',
        product_id: 'prod_1',
        product_name: 'USB-C Cable',
        quantity: 2,
        unit_price: 20000,
        unit_cost: 15000,
        total: 40000,
      }
    ],
  };

  it('formats receipt row with left and right alignment', () => {
    const row = receiptRow('Subtotal:', '40,000 Ks', 42);
    expect(row.length).toBe(42);
    expect(row.startsWith('Subtotal:')).toBe(true);
    expect(row.endsWith('40,000 Ks')).toBe(true);
  });

  it('generates valid ESC/POS byte sequence with init, items, and cut', () => {
    const bytes = buildEscPosReceipt(mockSale, mockBusiness, { paperWidthMm: 72 });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);

    // Check for ESC @ (init)
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);

    // Check for cut command at the end (GS V 0)
    const len = bytes.length;
    expect(bytes[len - 3]).toBe(0x1d);
    expect(bytes[len - 2]).toBe(0x56);
    expect(bytes[len - 1]).toBe(0);
  });

  it('generates CODE128 barcode command bytes', () => {
    const code = barcode('12345678', 'CODE128', 50, 2, 2);
    expect(code[0]).toBe(0x1d); // GS
    expect(code[1]).toBe(0x68); // h
    expect(code[2]).toBe(50);
  });
});
