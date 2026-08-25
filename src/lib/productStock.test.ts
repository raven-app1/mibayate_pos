import { describe, it, expect } from 'vitest';
import { Product, ProductStock, SaleItem, InventoryTransaction } from '../types';

describe('Product Stock Schema Restructuring & Multi-branch Stock Logic', () => {
  describe('Migration simulation: deduplication, stock migration, and FK repointing', () => {
    it('correctly maps duplicate product rows to a canonical product, moves quantities to product_stock, and repoints FKs without orphans', () => {
      // Simulate existing duplicated products table (3 branches: MAIN, NORTH, SOUTH)
      const existingProducts = [
        {
          id: 'prod-main-1',
          name: 'Coca Cola 330ml',
          sku: 'COKE-330',
          barcode: '885012345678',
          price: 1500,
          cost: 1000,
          stock: 25, // Origin branch has 25
          branch_id: 'branch-main',
          branch_name: 'Main Store',
          created_at: '2026-01-01T00:00:00Z'
        },
        {
          id: 'prod-north-1',
          name: 'Coca Cola 330ml',
          sku: 'COKE-330',
          barcode: '885012345678',
          price: 1500,
          cost: 1000,
          stock: 10, // North branch has 10
          branch_id: 'branch-north',
          branch_name: 'North Branch',
          created_at: '2026-01-02T00:00:00Z'
        },
        {
          id: 'prod-south-1',
          name: 'Coca Cola 330ml',
          sku: 'COKE-330',
          barcode: '885012345678',
          price: 1500,
          cost: 1000,
          stock: 0, // South branch has 0
          branch_id: 'branch-south',
          branch_name: 'South Branch',
          created_at: '2026-01-03T00:00:00Z'
        },
        {
          id: 'prod-single-2',
          name: 'Mineral Water 500ml',
          sku: 'WATER-500',
          barcode: '885098765432',
          price: 500,
          cost: 300,
          stock: 50,
          branch_id: 'branch-main',
          branch_name: 'Main Store',
          created_at: '2026-01-01T00:00:00Z'
        }
      ];

      const branches = [
        { id: 'branch-main', name: 'Main Store' },
        { id: 'branch-north', name: 'North Branch' },
        { id: 'branch-south', name: 'South Branch' }
      ];

      // Existing historical sale items pointing to old product IDs
      const saleItems: SaleItem[] = [
        { id: 'si-1', sale_id: 's-1', product_id: 'prod-north-1', product_name: 'Coca Cola 330ml', quantity: 2, unit_price: 1500, unit_cost: 1000, total: 3000 },
        { id: 'si-2', sale_id: 's-2', product_id: 'prod-main-1', product_name: 'Coca Cola 330ml', quantity: 5, unit_price: 1500, unit_cost: 1000, total: 7500 },
        { id: 'si-3', sale_id: 's-3', product_id: 'prod-single-2', product_name: 'Mineral Water 500ml', quantity: 1, unit_price: 500, unit_cost: 300, total: 500 }
      ];

      // Existing historical inventory transactions pointing to old product IDs
      const inventoryTransactions: InventoryTransaction[] = [
        { id: 'tx-1', product_id: 'prod-north-1', product_name: 'Coca Cola 330ml', branch_id: 'branch-north', type: 'stock-in', quantity: 12, notes: 'Restock', performed_by: 'Manager', created_at: '2026-01-02' },
        { id: 'tx-2', product_id: 'prod-main-1', product_name: 'Coca Cola 330ml', branch_id: 'branch-main', type: 'stock-in', quantity: 30, notes: 'Initial', performed_by: 'Owner', created_at: '2026-01-01' }
      ];

      // ── MIGRATION ALGORITHM ──────────────────────────────
      // 1. Group by uppercase SKU (or barcode) and select 1 canonical row per group
      const groups = new Map<string, typeof existingProducts>();
      for (const prod of existingProducts) {
        const key = (prod.sku || prod.barcode || prod.id).trim().toUpperCase();
        const list = groups.get(key) || [];
        list.push(prod);
        groups.set(key, list);
      }

      const productMapping = new Map<string, string>(); // old_id -> canonical_id
      const canonicalProducts: Product[] = [];
      const migratedStocks: ProductStock[] = [];

      groups.forEach((items) => {
        // Sort: items with stock > 0 first, then oldest created_at
        const sorted = [...items].sort((a, b) => {
          if ((a.stock > 0) !== (b.stock > 0)) return b.stock > 0 ? 1 : -1;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        const canonical = sorted[0];
        canonicalProducts.push({
          id: canonical.id,
          name: canonical.name,
          sku: canonical.sku,
          barcode: canonical.barcode,
          price: canonical.price,
          cost: canonical.cost,
          min_stock_level: 5,
          category: 'General',
          created_at: canonical.created_at
        });

        // Map every duplicate to canonical id
        for (const item of items) {
          productMapping.set(item.id, canonical.id);
        }

        // Build product_stock for each branch
        for (const branch of branches) {
          const matchingItem = items.find(it => it.branch_id === branch.id);
          migratedStocks.push({
            id: `pstock-${canonical.id}-${branch.id}`,
            product_id: canonical.id,
            branch_id: branch.id,
            quantity: matchingItem ? matchingItem.stock : 0
          });
        }
      });

      // 2. Repoint FKs in sale_items
      const updatedSaleItems = saleItems.map(si => ({
        ...si,
        product_id: productMapping.get(si.product_id) || si.product_id
      }));

      // 3. Repoint FKs in inventory_transactions
      const updatedTransactions = inventoryTransactions.map(tx => ({
        ...tx,
        product_id: productMapping.get(tx.product_id) || tx.product_id
      }));

      // ── VERIFICATION ─────────────────────────────────────
      // Verify deduplication: 4 rows reduced to 2 canonical products
      expect(canonicalProducts).toHaveLength(2);
      expect(canonicalProducts.map(p => p.id)).toEqual(['prod-main-1', 'prod-single-2']);

      // Verify product_stock contains 1 row per (canonical product x branch) = 2 * 3 = 6 rows
      expect(migratedStocks).toHaveLength(6);

      // Verify per-branch quantities match pre-migration totals
      const cokeMainStock = migratedStocks.find(s => s.product_id === 'prod-main-1' && s.branch_id === 'branch-main');
      const cokeNorthStock = migratedStocks.find(s => s.product_id === 'prod-main-1' && s.branch_id === 'branch-north');
      const cokeSouthStock = migratedStocks.find(s => s.product_id === 'prod-main-1' && s.branch_id === 'branch-south');

      expect(cokeMainStock?.quantity).toBe(25);
      expect(cokeNorthStock?.quantity).toBe(10);
      expect(cokeSouthStock?.quantity).toBe(0);

      // Verify water product stock across branches
      const waterMainStock = migratedStocks.find(s => s.product_id === 'prod-single-2' && s.branch_id === 'branch-main');
      const waterNorthStock = migratedStocks.find(s => s.product_id === 'prod-single-2' && s.branch_id === 'branch-north');
      expect(waterMainStock?.quantity).toBe(50);
      expect(waterNorthStock?.quantity).toBe(0);

      // Verify ZERO orphaned FKs in sale_items
      const validProductIds = new Set(canonicalProducts.map(p => p.id));
      for (const si of updatedSaleItems) {
        expect(validProductIds.has(si.product_id)).toBe(true);
      }
      expect(updatedSaleItems[0].product_id).toBe('prod-main-1'); // was prod-north-1
      expect(updatedSaleItems[1].product_id).toBe('prod-main-1'); // was prod-main-1
      expect(updatedSaleItems[2].product_id).toBe('prod-single-2'); // was prod-single-2

      // Verify ZERO orphaned FKs in inventory_transactions
      for (const tx of updatedTransactions) {
        expect(validProductIds.has(tx.product_id)).toBe(true);
      }
      expect(updatedTransactions[0].product_id).toBe('prod-main-1'); // was prod-north-1
    });
  });

  describe('Add Product Flow', () => {
    it('creates exactly 1 product catalog row and N product_stock rows with origin branch quantity set and others 0', () => {
      const branches = [
        { id: 'branch-1', name: 'Downtown' },
        { id: 'branch-2', name: 'Airport' },
        { id: 'branch-3', name: 'Uptown' }
      ];

      const newProductInput = {
        name: 'Organic Green Tea',
        sku: 'TEA-GRN-01',
        barcode: '9900112233',
        price: 3500,
        cost: 2000,
        min_stock_level: 5,
        category: 'Beverages',
        stock: 40,
        branch_id: 'branch-2' // Created from Airport branch
      };

      // 1. Catalog row
      const catalogRow = {
        id: 'prod-new-123',
        name: newProductInput.name,
        sku: newProductInput.sku,
        barcode: newProductInput.barcode,
        price: newProductInput.price,
        cost: newProductInput.cost,
        min_stock_level: newProductInput.min_stock_level,
        category: newProductInput.category,
        created_at: new Date().toISOString()
      };

      // 2. Product stock rows for each branch
      const stockRows: ProductStock[] = branches.map(b => ({
        id: `pstock-${catalogRow.id}-${b.id}`,
        product_id: catalogRow.id,
        branch_id: b.id,
        quantity: b.id === newProductInput.branch_id ? newProductInput.stock : 0
      }));

      expect(stockRows).toHaveLength(3);
      expect(stockRows.find(s => s.branch_id === 'branch-2')?.quantity).toBe(40);
      expect(stockRows.find(s => s.branch_id === 'branch-1')?.quantity).toBe(0);
      expect(stockRows.find(s => s.branch_id === 'branch-3')?.quantity).toBe(0);
    });
  });

  describe('Stock aggregation & checkout decrement', () => {
    it('calculates cross-branch total stock using SUM(quantity)', () => {
      const stocks: ProductStock[] = [
        { id: 's-1', product_id: 'prod-1', branch_id: 'b-1', quantity: 15 },
        { id: 's-2', product_id: 'prod-1', branch_id: 'b-2', quantity: 20 },
        { id: 's-3', product_id: 'prod-1', branch_id: 'b-3', quantity: 5 }
      ];

      const totalStock = stocks.reduce((sum, s) => sum + s.quantity, 0);
      expect(totalStock).toBe(40);
    });

    it('decrements stock only for the specific branch of the sale without affecting other branches', () => {
      const stocks: ProductStock[] = [
        { id: 's-1', product_id: 'prod-1', branch_id: 'b-1', quantity: 15 },
        { id: 's-2', product_id: 'prod-1', branch_id: 'b-2', quantity: 20 }
      ];

      // Checkout 3 items at branch b-1
      const saleBranchId = 'b-1';
      const qtySold = 3;

      const updatedStocks = stocks.map(s => {
        if (s.branch_id === saleBranchId) {
          return { ...s, quantity: Math.max(0, s.quantity - qtySold) };
        }
        return s;
      });

      expect(updatedStocks.find(s => s.branch_id === 'b-1')?.quantity).toBe(12);
      expect(updatedStocks.find(s => s.branch_id === 'b-2')?.quantity).toBe(20); // Unchanged
    });
  });
});
