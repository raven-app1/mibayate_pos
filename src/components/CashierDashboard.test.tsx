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
vi.mock('./BarcodeScannerModal', () => ({
  default: ({ isOpen, onScan }: { isOpen: boolean; onScan: (code: string) => void }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="mock-scanner-modal">
        <input
          data-testid="scanner-input"
          onChange={(e) => onScan(e.target.value)}
        />
      </div>
    );
  }
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

    // Verify that non-stock tracked item shows 'In Stock' badge rather than '0 left'
    const deliveryServiceBtn = screen.getByText('Delivery Service (No Stock Tracking)').closest('button');
    expect(deliveryServiceBtn).toBeInTheDocument();
    expect(deliveryServiceBtn).not.toBeDisabled();
    expect(screen.getByText('In Stock')).toBeInTheDocument();
    expect(screen.queryByText('0 left')).not.toBeInTheDocument();

    // Add in-stock product
    fireEvent.click(screen.getByText('In Stock Apple'));
    // Add non-stock tracked product
    fireEvent.click(screen.getByText('Delivery Service (No Stock Tracking)'));

    // Verify cart header
    expect(screen.getByText('2 items selected')).toBeInTheDocument();
  });

  it('renders Sold Out badge and disables click when searching for 0-stock tracked items', async () => {
    render(<CashierDashboard user={mockUser} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('In Stock Apple')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search products by name/i);
    fireEvent.change(searchInput, { target: { value: 'Banana' } });

    await waitFor(() => {
      expect(screen.getByText('Sold Out Banana')).toBeInTheDocument();
    });

    const bananaBtn = screen.getByText('Sold Out Banana').closest('button');
    expect(bananaBtn).toBeDisabled();
    expect(screen.getByText('Sold Out')).toBeInTheDocument();
    expect(screen.queryByText('0 left')).not.toBeInTheDocument();

    // Clicking disabled button should not add to cart
    fireEvent.click(bananaBtn!);
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
  });
});

describe('CashierDashboard multi-branch product stock isolation', () => {
  const branch1Cashier: UserProfile = {
    id: 'cashier-b1',
    name: 'Downtown Cashier',
    email: 'b1@pos.com',
    role: 'cashier',
    branch_id: 'branch-1',
    branch_name: 'Downtown',
    created_at: new Date().toISOString()
  };

  const branch2Cashier: UserProfile = {
    id: 'cashier-b2',
    name: 'Airport Cashier',
    email: 'b2@pos.com',
    role: 'cashier',
    branch_id: 'branch-2',
    branch_name: 'Airport',
    created_at: new Date().toISOString()
  };

  const multiBranchProducts: Product[] = [
    {
      id: 'prod-shared-1',
      name: 'Shared MultiBranch T-Shirt',
      sku: 'SHIRT-01',
      barcode: '888001',
      price: 15000,
      cost: 8000,
      stock: 25, // Total across all branches: 5 (b1) + 20 (b2)
      stocks: [
        { id: 's-1', product_id: 'prod-shared-1', branch_id: 'branch-1', quantity: 5 },
        { id: 's-2', product_id: 'prod-shared-1', branch_id: 'branch-2', quantity: 20 }
      ],
      category: 'Apparel',
      use_stock: true,
      min_stock_level: 2,
      created_at: ''
    },
    {
      id: 'prod-b2-only',
      name: 'Airport Exclusive Denim Pants',
      sku: 'PANTS-01',
      barcode: '888002',
      price: 25000,
      cost: 15000,
      stock: 30, // In branch 2 only, no stock entry for branch 1
      stocks: [
        { id: 's-3', product_id: 'prod-b2-only', branch_id: 'branch-2', quantity: 30 }
      ],
      category: 'Apparel',
      use_stock: true,
      min_stock_level: 5,
      created_at: ''
    },
    {
      id: 'prod-b1-zero',
      name: 'Downtown Running Shoes',
      sku: 'SHOES-01',
      barcode: '888003',
      price: 45000,
      cost: 30000,
      stock: 15, // 0 in b1, 15 in b2
      stocks: [
        { id: 's-4', product_id: 'prod-b1-zero', branch_id: 'branch-1', quantity: 0 },
        { id: 's-5', product_id: 'prod-b1-zero', branch_id: 'branch-2', quantity: 15 }
      ],
      category: 'Footwear',
      use_stock: true,
      min_stock_level: 3,
      created_at: ''
    },
    {
      id: 'prod-nostock-service',
      name: 'Shoe Cleaning Service',
      sku: 'SRV-CLEAN',
      barcode: '888004',
      price: 5000,
      cost: 500,
      stock: 0,
      category: 'Services',
      use_stock: false,
      min_stock_level: 0,
      created_at: ''
    },
    {
      id: 'prod-legacy-b2',
      name: 'Legacy Airport Souvenir',
      sku: 'SOUV-01',
      barcode: '888005',
      price: 8000,
      cost: 4000,
      stock: 10,
      branch_id: 'branch-2', // legacy product tied to branch-2, no stocks array
      category: 'Souvenirs',
      use_stock: true,
      min_stock_level: 2,
      created_at: ''
    },
    {
      id: 'prod-legacy-b1',
      name: 'Legacy Downtown Mug',
      sku: 'MUG-01',
      barcode: '888006',
      price: 6000,
      cost: 2500,
      stock: 8,
      branch_id: 'branch-1', // legacy product tied to branch-1, no stocks array
      category: 'Souvenirs',
      use_stock: true,
      min_stock_level: 2,
      created_at: ''
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbService.products.getAll).mockResolvedValue(multiBranchProducts);
  });

  it('strictly displays Branch-1 stock and treats items with stock only in Branch-2 as Sold Out', async () => {
    render(<CashierDashboard user={branch1Cashier} onLogout={vi.fn()} />);

    // In Branch 1, Shared T-Shirt has 5 left
    await waitFor(() => {
      expect(screen.getByText('Shared MultiBranch T-Shirt')).toBeInTheDocument();
      expect(screen.getByText('5 left')).toBeInTheDocument();
    });

    // In Branch 1, Airport Exclusive Denim Pants (30 in b2, 0 in b1) and Downtown Running Shoes (0 in b1) are sold out
    // They should NOT be visible by default (hidden when not searching)
    expect(screen.queryByText('Airport Exclusive Denim Pants')).not.toBeInTheDocument();
    expect(screen.queryByText('Downtown Running Shoes')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy Airport Souvenir')).not.toBeInTheDocument();

    // Legacy Downtown Mug (branch-1) is visible with 8 left
    expect(screen.getByText('Legacy Downtown Mug')).toBeInTheDocument();
    expect(screen.getByText('8 left')).toBeInTheDocument();

    // Unlimited Service is visible
    expect(screen.getByText('Shoe Cleaning Service')).toBeInTheDocument();
  });

  it('shows Sold Out badge and disables adding to cart when searching for other branch items', async () => {
    render(<CashierDashboard user={branch1Cashier} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Shared MultiBranch T-Shirt')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search products by name/i);
    fireEvent.change(searchInput, { target: { value: 'Pants' } });

    await waitFor(() => {
      expect(screen.getByText('Airport Exclusive Denim Pants')).toBeInTheDocument();
    });

    // It should have Sold Out badge and be disabled
    const pantsButton = screen.getByText('Airport Exclusive Denim Pants').closest('button');
    expect(pantsButton).toBeDisabled();
    expect(screen.getByText('Sold Out')).toBeInTheDocument();
  });

  it('allows Branch-2 cashier to see and sell items in Branch-2 stock', async () => {
    render(<CashierDashboard user={branch2Cashier} onLogout={vi.fn()} />);

    await waitFor(() => {
      // Shared T-Shirt has 20 in Branch 2
      expect(screen.getByText('Shared MultiBranch T-Shirt')).toBeInTheDocument();
      expect(screen.getByText('20 left')).toBeInTheDocument();

      // Airport Exclusive Denim Pants has 30 in Branch 2 -> visible by default
      expect(screen.getByText('Airport Exclusive Denim Pants')).toBeInTheDocument();
      expect(screen.getByText('30 left')).toBeInTheDocument();

      // Downtown Running Shoes has 15 in Branch 2 -> visible by default
      expect(screen.getByText('Downtown Running Shoes')).toBeInTheDocument();
      expect(screen.getByText('15 left')).toBeInTheDocument();

      // Legacy Airport Souvenir is visible with 10 left
      expect(screen.getByText('Legacy Airport Souvenir')).toBeInTheDocument();
      expect(screen.getByText('10 left')).toBeInTheDocument();
    });

    // Legacy Downtown Mug belongs to Branch-1, so it is sold out in Branch-2
    expect(screen.queryByText('Legacy Downtown Mug')).not.toBeInTheDocument();

    // Branch 2 cashier can add Denim Pants to cart
    fireEvent.click(screen.getByText('Airport Exclusive Denim Pants'));
    expect(screen.getByText('1 items selected')).toBeInTheDocument();
  });

  it('enforces branch-specific stock limits when adding items to cart', async () => {
    render(<CashierDashboard user={branch1Cashier} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Shared MultiBranch T-Shirt')).toBeInTheDocument();
    });

    const shirtBtn = screen.getByText('Shared MultiBranch T-Shirt');

    // Click 5 times (Branch 1 only has 5 in stock, even though Branch 2 has 20 and total stock is 25)
    for (let i = 0; i < 5; i++) {
      fireEvent.click(shirtBtn);
    }

    // Cart should have quantity 5
    expect(screen.getByText('5 items selected')).toBeInTheDocument();

    // 6th click should NOT increase quantity
    fireEvent.click(shirtBtn);
    expect(screen.getByText('5 items selected')).toBeInTheDocument();
  });

  it('prevents adding other branch stock via barcode scan and allows valid branch stock', async () => {
    render(<CashierDashboard user={branch1Cashier} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Shared MultiBranch T-Shirt')).toBeInTheDocument();
    });

    // Open barcode scanner modal
    const scanBtn = screen.getByTitle('Scan barcode with camera');
    fireEvent.click(scanBtn);

    const scannerInput = screen.getByTestId('scanner-input');

    // Scan barcode 888002 (Pants with 0 stock in Branch-1, 30 in Branch-2)
    fireEvent.change(scannerInput, { target: { value: '888002' } });

    // Cart should still be empty (0 items selected)
    expect(screen.getByText('0 items selected')).toBeInTheDocument();
    // Scan barcode 888001 (Shirt with 5 in Branch-1)
    fireEvent.change(scannerInput, { target: { value: '888001' } });

    // Cart should now have 1 item
    expect(screen.getByText('1 items selected')).toBeInTheDocument();
  });
});
