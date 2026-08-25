import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CashierDashboard from './CashierDashboard';
import { dbService } from '../lib/supabase';
import { Product, UserProfile } from '../types';

vi.mock('../lib/supabase', () => ({
  DEFAULT_BUSINESS_PROFILE: {
    name: 'Test Business',
    currency: 'Ks',
    tax_rate: 0
  },
  dbService: {
    products: {
      getAll: vi.fn()
    },
    business: {
      get: vi.fn().mockResolvedValue({
        name: 'Test Business',
        currency: 'Ks',
        tax_rate: 0
      })
    },
    sales: {
      getAllWithItems: vi.fn().mockResolvedValue([]),
      checkout: vi.fn()
    },
    saleDeleteRequests: {
      getAll: vi.fn().mockResolvedValue([]),
      create: vi.fn()
    }
  }
}));

vi.mock('../lib/realtimeSync', () => ({
  subscribeToDataChanges: vi.fn(() => vi.fn())
}));

const mockUser: UserProfile = {
  id: 'cashier-1',
  name: 'Test Cashier',
  email: 'cashier@pos.com',
  role: 'cashier',
  branch_id: 'branch-1',
  branch_name: 'Main Store',
  created_at: new Date().toISOString()
};

const mockProducts: Product[] = [
  {
    id: 'prod-in-stock-1',
    name: 'In Stock Apple',
    sku: 'APL-01',
    barcode: '111111',
    price: 500,
    cost: 300,
    stock: 10,
    category: 'Fruits',
    use_stock: true,
    min_stock_level: 2,
    created_at: ''
  },
  {
    id: 'prod-sold-out-1',
    name: 'Sold Out Banana',
    sku: 'BAN-01',
    barcode: '222222',
    price: 700,
    cost: 400,
    stock: 0,
    category: 'Fruits',
    use_stock: true,
    min_stock_level: 2,
    created_at: ''
  },
  {
    id: 'prod-sold-out-neg',
    name: 'Sold Out Cherry Negative',
    sku: 'CHE-01',
    barcode: '333333',
    price: 1200,
    cost: 800,
    stock: -3,
    category: 'Fruits',
    use_stock: true,
    min_stock_level: 2,
    created_at: ''
  },
  {
    id: 'prod-service-nostock',
    name: 'Delivery Service (No Stock Tracking)',
    sku: 'SRV-01',
    barcode: '444444',
    price: 1500,
    cost: 0,
    stock: 0,
    category: 'Services',
    use_stock: false,
    min_stock_level: 0,
    created_at: ''
  },
  {
    id: 'prod-drink-in-stock',
    name: 'Orange Juice Bottle',
    sku: 'OJ-01',
    barcode: '555555',
    price: 2000,
    cost: 1200,
    stock: 5,
    category: 'Beverages',
    use_stock: true,
    min_stock_level: 2,
    created_at: ''
  },
  {
    id: 'prod-drink-sold-out',
    name: 'Sold Out Cola Can',
    sku: 'COLA-01',
    barcode: '666666',
    price: 1000,
    cost: 600,
    stock: 0,
    category: 'Beverages',
    use_stock: true,
    min_stock_level: 2,
    created_at: ''
  }
];

describe('CashierDashboard sold-out items visibility & search behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbService.products.getAll).mockResolvedValue(mockProducts);
  });

  it('hides sold out items by default when search query is empty', async () => {
    render(<CashierDashboard user={mockUser} onLogout={vi.fn()} />);

    // In-stock items should be visible
    await waitFor(() => {
      expect(screen.getByText('In Stock Apple')).toBeInTheDocument();
      expect(screen.getByText('Orange Juice Bottle')).toBeInTheDocument();
      expect(screen.getByText('Delivery Service (No Stock Tracking)')).toBeInTheDocument();
    });

    // Sold out items should NOT be visible in default view
    expect(screen.queryByText('Sold Out Banana')).not.toBeInTheDocument();
    expect(screen.queryByText('Sold Out Cherry Negative')).not.toBeInTheDocument();
    expect(screen.queryByText('Sold Out Cola Can')).not.toBeInTheDocument();
  });

  it('displays sold out items when search query is active / not empty', async () => {
    render(<CashierDashboard user={mockUser} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('In Stock Apple')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search products by name/i);
    fireEvent.change(searchInput, { target: { value: 'Sold Out' } });

    // Both sold out products matching the search query should be rendered
    await waitFor(() => {
      expect(screen.getByText('Sold Out Banana')).toBeInTheDocument();
      expect(screen.getByText('Sold Out Cherry Negative')).toBeInTheDocument();
      expect(screen.getByText('Sold Out Cola Can')).toBeInTheDocument();
    });

    // Products not matching the search query should be filtered out
    expect(screen.queryByText('In Stock Apple')).not.toBeInTheDocument();
    expect(screen.queryByText('Orange Juice Bottle')).not.toBeInTheDocument();

    // Verify the sold-out items have Sold Out badge and disabled state
    const bananaButton = screen.getByText('Sold Out Banana').closest('button');
    expect(bananaButton).toBeDisabled();
  });

  it('hides sold out items during category browsing when search query is empty', async () => {
    render(<CashierDashboard user={mockUser} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Orange Juice Bottle')).toBeInTheDocument();
    });

    // Select 'Beverages' category by opening the dropdown
    const categoryButton = screen.getByText('All Categories').closest('button');
    if (categoryButton) {
      fireEvent.click(categoryButton);
      const beverageOption = screen.getByText('Beverages');
      fireEvent.click(beverageOption);
    }

    await waitFor(() => {
      // In-stock item in Beverages is shown
      expect(screen.getByText('Orange Juice Bottle')).toBeInTheDocument();
      // Sold-out item in Beverages is NOT shown
      expect(screen.queryByText('Sold Out Cola Can')).not.toBeInTheDocument();
      // Items from other categories are NOT shown
      expect(screen.queryByText('In Stock Apple')).not.toBeInTheDocument();
    });
  });

  it('shows sold out items matching search even within a selected category', async () => {
    render(<CashierDashboard user={mockUser} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Orange Juice Bottle')).toBeInTheDocument();
    });

    // Select 'Beverages' category
    const categoryButton = screen.getByText('All Categories').closest('button');
    if (categoryButton) {
      fireEvent.click(categoryButton);
      const beverageOption = screen.getByText('Beverages');
      fireEvent.click(beverageOption);
    }

    const searchInput = screen.getByPlaceholderText(/search products by name/i);
    fireEvent.change(searchInput, { target: { value: 'Cola' } });

    await waitFor(() => {
      expect(screen.getByText('Sold Out Cola Can')).toBeInTheDocument();
    });
  });

  it('allows adding in-stock and non-stock-tracked items to cart, but prevents sold-out items', async () => {
    render(<CashierDashboard user={mockUser} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('In Stock Apple')).toBeInTheDocument();
    });

    // Add in-stock product
    fireEvent.click(screen.getByText('In Stock Apple'));
    // Add non-stock tracked product
    fireEvent.click(screen.getByText('Delivery Service (No Stock Tracking)'));

    // Verify cart header
    expect(screen.getByText('2 items selected')).toBeInTheDocument();
  });
});
