import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductsTab from './ProductsTab';
import { Product, UserProfile } from '../../types';

const mockUser: UserProfile = {
  id: 'user-1',
  name: 'Store Owner',
  email: 'owner@pos.com',
  role: 'owner',
  created_at: new Date().toISOString()
};

const mockProducts: Product[] = [
  {
    id: 'prod-out-zebra',
    name: 'Zebra Toy (Sold Out)',
    sku: 'ZEB-01',
    barcode: '1001',
    price: 1000,
    cost: 500,
    stock: 0,
    category: 'Toys',
    use_stock: true,
    min_stock_level: 2,
    created_at: '2026-01-01'
  },
  {
    id: 'prod-out-apple',
    name: 'Apple Out of Stock',
    sku: 'APL-00',
    barcode: '1002',
    price: 500,
    cost: 200,
    stock: 0,
    category: 'Fruits',
    use_stock: true,
    min_stock_level: 2,
    created_at: '2026-01-02'
  },
  {
    id: 'prod-in-orange',
    name: 'Orange Fresh',
    sku: 'ORG-01',
    barcode: '1003',
    price: 800,
    cost: 400,
    stock: 15,
    category: 'Fruits',
    use_stock: true,
    min_stock_level: 2,
    created_at: '2026-01-03'
  },
  {
    id: 'prod-in-banana',
    name: 'Banana Bunch',
    sku: 'BAN-01',
    barcode: '1004',
    price: 600,
    cost: 300,
    stock: 20,
    category: 'Fruits',
    use_stock: true,
    min_stock_level: 2,
    created_at: '2026-01-04'
  },
  {
    id: 'prod-nostock-delivery',
    name: 'Express Delivery Service',
    sku: 'SRV-01',
    barcode: '1005',
    price: 2000,
    cost: 0,
    stock: 0,
    category: 'Services',
    use_stock: false,
    min_stock_level: 0,
    created_at: '2026-01-05'
  }
];

describe('ProductsTab sorting behavior', () => {
  it('displays in-stock items first sorted A-Z, followed by out-of-stock items sorted A-Z', () => {
    render(
      <ProductsTab
        user={mockUser}
        branches={[]}
        selectedBranchId="all"
        setSelectedBranchId={vi.fn()}
        displayProducts={mockProducts}
        categories={['Fruits', 'Toys', 'Services']}
        setShowCsvModal={vi.fn()}
        handleExportCsv={vi.fn()}
        openBarcodeModal={vi.fn()}
        startEditProduct={vi.fn()}
        openQuickRestock={vi.fn()}
        triggerDeleteProduct={vi.fn()}
      />
    );

    // Get all rendered product names in the table/cards
    // Both desktop table rows and mobile cards render product names in h4 or p tags
    const renderedNames = screen.getAllByRole('heading', { level: 4 }).map(el => el.textContent?.trim());

    // Expected order:
    // 1. In-stock & non-stock tracked items sorted A-Z:
    //    - "Banana Bunch"
    //    - "Express Delivery Service"
    //    - "Orange Fresh"
    // 2. Out-of-stock items sorted A-Z:
    //    - "Apple Out of Stock"
    //    - "Zebra Toy (Sold Out)"
    expect(renderedNames).toEqual([
      'Banana Bunch',
      'Express Delivery Service',
      'Orange Fresh',
      'Apple Out of Stock',
      'Zebra Toy (Sold Out)'
    ]);
  });

  it('renders delete buttons when logged in as owner', () => {
    const mockDelete = vi.fn();
    render(
      <ProductsTab
        user={mockUser}
        branches={[]}
        selectedBranchId="all"
        setSelectedBranchId={vi.fn()}
        displayProducts={mockProducts}
        categories={['Fruits', 'Toys', 'Services']}
        setShowCsvModal={vi.fn()}
        handleExportCsv={vi.fn()}
        openBarcodeModal={vi.fn()}
        startEditProduct={vi.fn()}
        openQuickRestock={vi.fn()}
        triggerDeleteProduct={mockDelete}
      />
    );

    const deleteButtons = screen.getAllByTitle('Delete Product');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('does not render delete buttons when logged in as manager', () => {
    const mockManager: UserProfile = {
      id: 'manager-1',
      name: 'Store Manager',
      email: 'manager@pos.com',
      role: 'manager',
      branch_id: 'branch-1',
      created_at: new Date().toISOString()
    };

    render(
      <ProductsTab
        user={mockManager}
        branches={[]}
        selectedBranchId="branch-1"
        setSelectedBranchId={vi.fn()}
        displayProducts={mockProducts}
        categories={['Fruits', 'Toys', 'Services']}
        setShowCsvModal={vi.fn()}
        handleExportCsv={vi.fn()}
        openBarcodeModal={vi.fn()}
        startEditProduct={vi.fn()}
        openQuickRestock={vi.fn()}
        triggerDeleteProduct={vi.fn()}
      />
    );

    const deleteButtons = screen.queryAllByTitle('Delete Product');
    expect(deleteButtons.length).toBe(0);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});
