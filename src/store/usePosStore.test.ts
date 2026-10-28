import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePosStore } from './usePosStore';
import { dbService } from '../lib/supabase';

// Mock the dbService
vi.mock('../lib/supabase', () => ({
  dbService: {
    products: { getAll: vi.fn().mockResolvedValue([]) },
    sales: { getAllWithItems: vi.fn().mockResolvedValue([]) },
    auth: { getCashiers: vi.fn().mockResolvedValue([]) },
    transactions: { getAll: vi.fn().mockResolvedValue([]) },
    branches: { getAll: vi.fn().mockResolvedValue([]) },
    business: { get: vi.fn().mockResolvedValue(null) },
    cashFlow: { getAll: vi.fn().mockResolvedValue([]) },
    saleDeleteRequests: { getAll: vi.fn().mockResolvedValue([]) }
  }
}));

describe('usePosStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePosStore.setState({
      products: [],
      sales: [],
      cashiers: [],
      transactions: [],
      branches: [],
      deleteRequests: [],
      businessProfile: null,
      cashFlowEntries: [],
      isLoading: true,
      loadError: null
    });
    vi.clearAllMocks();
  });

  it('should have correct initial state', () => {
    const state = usePosStore.getState();
    expect(state.products).toEqual([]);
    expect(state.sales).toEqual([]);
    expect(state.isLoading).toBe(true);
  });

  it('should update products', () => {
    const mockProducts = [{ id: '1', name: 'Test Product', barcode: '123', price: 100, cost: 50, stock: 10, category: 'Test', is_active: true, sku: "TEST", min_stock_level: 5, created_at: '' }];
    usePosStore.getState().setProducts(mockProducts);
    expect(usePosStore.getState().products).toEqual(mockProducts);
  });

  it('should loadData correctly', async () => {
    const mockProducts = [{ id: '1', name: 'Test Product', barcode: '123', price: 100, cost: 50, stock: 10, category: 'Test', is_active: true, sku: "TEST", min_stock_level: 5, created_at: '' }];
    (dbService.products.getAll as any).mockResolvedValue(mockProducts);

    await usePosStore.getState().loadData();

    const state = usePosStore.getState();
    expect(state.products).toEqual(mockProducts);
    expect(state.isLoading).toBe(false);
  });
});
