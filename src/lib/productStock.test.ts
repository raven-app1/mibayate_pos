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

  describe('Cashier Branch Stock View & Isolation', () => {
    it('strictly maps product stock to cashier branch quantity and never leaks global/other-branch stock', () => {
      const cashierBranchId = 'branch-main';
      const otherBranchId = 'branch-north';

      const products: Product[] = [
        {
          id: 'prod-1',
          name: 'Item In Both Branches',
          sku: 'SKU-1',
          barcode: '111',
          price: 100,
          cost: 50,
          min_stock_level: 2,
          stock: 35, // Global total: 10 + 25
          stocks: [
            { id: 's-1', product_id: 'prod-1', branch_id: 'branch-main', quantity: 10 },
            { id: 's-2', product_id: 'prod-1', branch_id: 'branch-north', quantity: 25 }
          ],
          category: 'General',
          created_at: ''
        },
        {
          id: 'prod-2',
          name: 'Item Only In North Branch',
          sku: 'SKU-2',
          barcode: '222',
          price: 200,
          cost: 100,
          min_stock_level: 2,
          stock: 50, // Only in North branch
          stocks: [
            { id: 's-3', product_id: 'prod-2', branch_id: 'branch-north', quantity: 50 }
          ],
          category: 'General',
          created_at: ''
        },
        {
          id: 'prod-3',
          name: 'Legacy Single Branch Item',
          sku: 'SKU-3',
          barcode: '333',
          price: 300,
          cost: 150,
          min_stock_level: 2,
          stock: 7,
          branch_id: 'branch-main',
          category: 'General',
          created_at: ''
        },
        {
          id: 'prod-4',
          name: 'Legacy Other Branch Item',
          sku: 'SKU-4',
          barcode: '444',
          price: 400,
          cost: 200,
          min_stock_level: 2,
          stock: 12,
          branch_id: 'branch-north',
          category: 'General',
          created_at: ''
        }
      ];

      const resolveBranchProducts = (prods: Product[], branchId: string) => {
        return prods.map(p => {
          let branchStock = 0;
          if (p.stocks && p.stocks.length > 0) {
            const match = p.stocks.find(s => s.branch_id.trim().toLowerCase() === branchId.trim().toLowerCase());
            branchStock = match ? (Number(match.quantity) || 0) : 0;
          } else if (p.branch_id && p.branch_id.trim().toLowerCase() !== branchId.trim().toLowerCase()) {
            branchStock = 0;
          } else {
            branchStock = Number(p.stock) || 0;
          }
          return {
            ...p,
            stock: branchStock,
            branch_id: branchId
          };
        });
      };

      const mainBranchView = resolveBranchProducts(products, cashierBranchId);
      const northBranchView = resolveBranchProducts(products, otherBranchId);

      // Main branch cashier view:
      // prod-1: 10 units (not 35, not 25)
      expect(mainBranchView.find(p => p.id === 'prod-1')?.stock).toBe(10);
      // prod-2: 0 units (not 50)
      expect(mainBranchView.find(p => p.id === 'prod-2')?.stock).toBe(0);
      // prod-3 (legacy main): 7 units
      expect(mainBranchView.find(p => p.id === 'prod-3')?.stock).toBe(7);
      // prod-4 (legacy north): 0 units
      expect(mainBranchView.find(p => p.id === 'prod-4')?.stock).toBe(0);

      // North branch cashier view:
      expect(northBranchView.find(p => p.id === 'prod-1')?.stock).toBe(25);
      expect(northBranchView.find(p => p.id === 'prod-2')?.stock).toBe(50);
      expect(northBranchView.find(p => p.id === 'prod-3')?.stock).toBe(0);
      expect(northBranchView.find(p => p.id === 'prod-4')?.stock).toBe(12);
    });
  });

  describe('Branch Deletion & Foreign Key Cascading/Nullification', () => {
    it('safely cascades product_stock deletion and nullifies branch_id in inventory_transactions, sales, profiles, and cash_flow without orphans or constraint violations', () => {
      const branchToDelete = 'branch-north';

      let branches = [
        { id: 'branch-main', name: 'Main Store' },
        { id: 'branch-north', name: 'North Branch' }
      ];

      let productStocks = [
        { id: 'ps-1', product_id: 'prod-1', branch_id: 'branch-main', quantity: 10 },
        { id: 'ps-2', product_id: 'prod-1', branch_id: 'branch-north', quantity: 25 },
        { id: 'ps-3', product_id: 'prod-2', branch_id: 'branch-north', quantity: 50 }
      ];

      let inventoryTransactions: InventoryTransaction[] = [
        { id: 'tx-1', product_id: 'prod-1', product_name: 'Item 1', branch_id: 'branch-north', branch_name: 'North Branch', type: 'stock-in', quantity: 25, notes: 'Restock', performed_by: 'Owner', created_at: '2026-01-01' },
        { id: 'tx-2', product_id: 'prod-1', product_name: 'Item 1', branch_id: 'branch-main', branch_name: 'Main Store', type: 'sale', quantity: 5, notes: 'Sale', performed_by: 'Cashier', created_at: '2026-01-02' }
      ];

      let sales: Array<{ id: string; branch_id?: string; branch_name?: string; total_amount: number }> = [
        { id: 'sale-1', branch_id: 'branch-north', branch_name: 'North Branch', total_amount: 5000 },
        { id: 'sale-2', branch_id: 'branch-main', branch_name: 'Main Store', total_amount: 3000 }
      ];

      let profiles: Array<{ id: string; name: string; branch_id?: string; branch_name?: string; role: string }> = [
        { id: 'u-1', name: 'Manager North', branch_id: 'branch-north', branch_name: 'North Branch', role: 'manager' },
        { id: 'u-2', name: 'Owner', branch_id: 'branch-main', branch_name: 'Main Store', role: 'owner' }
      ];

      let cashFlow: Array<{ id: string; branch_id?: string; branch_name?: string; amount: number; type: string }> = [
        { id: 'cf-1', branch_id: 'branch-north', branch_name: 'North Branch', amount: 1000, type: 'expense' },
        { id: 'cf-2', branch_id: 'branch-main', branch_name: 'Main Store', amount: 2000, type: 'income' }
      ];

      // Simulate DB CASCADE & SET NULL behavior on branch deletion
      // 1. product_stock: ON DELETE CASCADE
      productStocks = productStocks.filter(ps => ps.branch_id !== branchToDelete);

      // 2. inventory_transactions: ON DELETE SET NULL (preserves audit trail)
      inventoryTransactions = inventoryTransactions.map(tx => {
        if (tx.branch_id === branchToDelete) {
          return { ...tx, branch_id: undefined, branch_name: undefined };
        }
        return tx;
      });

      // 3. sales: ON DELETE SET NULL
      sales = sales.map(s => {
        if (s.branch_id === branchToDelete) {
          return { ...s, branch_id: undefined, branch_name: undefined };
        }
        return s;
      });

      // 4. profiles: ON DELETE SET NULL
      profiles = profiles.map(p => {
        if (p.branch_id === branchToDelete) {
          return { ...p, branch_id: undefined, branch_name: undefined };
        }
        return p;
      });

      // 5. cash_flow: ON DELETE SET NULL
      cashFlow = cashFlow.map(cf => {
        if (cf.branch_id === branchToDelete) {
          return { ...cf, branch_id: undefined, branch_name: undefined };
        }
        return cf;
      });

      // 6. branches table: delete branch
      branches = branches.filter(b => b.id !== branchToDelete);
      const validBranchIds = new Set(branches.map(b => b.id));

      // Assertions:
      // - branch is deleted
      expect(validBranchIds.has(branchToDelete)).toBe(false);
      expect(branches.length).toBe(1);

      // - product_stock for deleted branch is removed
      expect(productStocks.every(ps => validBranchIds.has(ps.branch_id))).toBe(true);
      expect(productStocks.length).toBe(1);

      // - inventory_transactions retains historical rows with branch_id set to null/undefined
      expect(inventoryTransactions.length).toBe(2);
      const northTx = inventoryTransactions.find(tx => tx.id === 'tx-1');
      expect(northTx?.branch_id).toBeUndefined();
      const mainTx = inventoryTransactions.find(tx => tx.id === 'tx-2');
      expect(mainTx?.branch_id).toBe('branch-main');

      // - sales retains historical sales with branch_id set to null/undefined
      expect(sales.find(s => s.id === 'sale-1')?.branch_id).toBeUndefined();
      expect(sales.find(s => s.id === 'sale-2')?.branch_id).toBe('branch-main');

      // - profiles unlinked
      expect(profiles.find(p => p.id === 'u-1')?.branch_id).toBeUndefined();
      expect(profiles.find(p => p.id === 'u-2')?.branch_id).toBe('branch-main');

      // - cash_flow unlinked
      expect(cashFlow.find(cf => cf.id === 'cf-1')?.branch_id).toBeUndefined();
      expect(cashFlow.find(cf => cf.id === 'cf-2')?.branch_id).toBe('branch-main');
    });
  });
});
