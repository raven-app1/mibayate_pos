import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CashierSalesHistory from './CashierSalesHistory';
import { SaleWithItems, UserProfile, BusinessProfile } from '../types';

const mockUser: UserProfile = {
  id: 'cashier-1',
  name: 'Aung Aung',
  email: 'aung@pos.com',
  role: 'cashier',
  branch_id: 'branch-1',
  branch_name: 'Main Store',
  created_at: new Date().toISOString()
};

const mockBusinessProfile: BusinessProfile = {
  name: 'Mibayate POS Store',
  currency: 'Ks',
  tax_rate: 0
};

const mockSales: SaleWithItems[] = [
  {
    id: 'sale-001',
    cashier_id: 'cashier-1',
    cashier_name: 'Aung Aung',
    branch_id: 'branch-1',
    customer_name: 'Kyaw Kyaw',
    customer_phone: '0912345678',
    total_amount: 5000,
    discount: 0,
    payment_method: 'cash',
    created_at: '2026-10-25T10:00:00Z',
    items: [
      {
        id: 'item-1',
        sale_id: 'sale-001',
        product_id: 'prod-1',
        product_name: 'Milk Tea Large',
        quantity: 2,
        unit_price: 2500,
        unit_cost: 1500,
        total: 5000
      }
    ]
  },
  {
    id: 'sale-002',
    cashier_id: 'cashier-1',
    cashier_name: 'Aung Aung',
    branch_id: 'branch-1',
    customer_name: 'Su Su',
    customer_phone: '0998765432',
    total_amount: 15000,
    discount: 0,
    payment_method: 'kpay',
    created_at: '2026-10-26T14:30:00Z',
    items: [
      {
        id: 'item-2',
        sale_id: 'sale-002',
        product_id: 'prod-2',
        product_name: 'Chocolate Cake',
        quantity: 1,
        unit_price: 15000,
        unit_cost: 9000,
        total: 15000
      }
    ]
  },
  {
    id: 'sale-003',
    cashier_id: 'cashier-1',
    cashier_name: 'Aung Aung',
    branch_id: 'branch-1',
    customer_name: 'Hla Hla',
    customer_phone: '0955511223',
    total_amount: 2500,
    discount: 0,
    payment_method: 'wavepay',
    created_at: '2026-10-27T08:15:00Z',
    items: [
      {
        id: 'item-3',
        sale_id: 'sale-003',
        product_id: 'prod-3',
        product_name: 'Croissant',
        quantity: 1,
        unit_price: 2500,
        unit_cost: 1500,
        total: 2500
      }
    ]
  }
];

describe('CashierSalesHistory Component', () => {
  it('renders search bar with required placeholder and full width styling', () => {
    render(
      <CashierSalesHistory
        sales={mockSales}
        deleteRequests={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        user={mockUser}
        businessProfile={mockBusinessProfile}
        onRequestDelete={vi.fn()}
        onPrintReceipt={vi.fn()}
        onStartSelling={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search receipts, customers, phone...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveClass('w-full');
  });

  it('filters receipts in real-time by customer name, phone, receipt id, and item name', () => {
    render(
      <CashierSalesHistory
        sales={mockSales}
        deleteRequests={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        user={mockUser}
        businessProfile={mockBusinessProfile}
        onRequestDelete={vi.fn()}
        onPrintReceipt={vi.fn()}
        onStartSelling={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search receipts, customers, phone...');

    fireEvent.change(searchInput, { target: { value: 'Su Su' } });
    expect(screen.getAllByText('Su Su').length).toBeGreaterThan(0);
    expect(screen.queryByText('Kyaw Kyaw')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Croissant' } });
    expect(screen.getAllByText('Hla Hla').length).toBeGreaterThan(0);
    expect(screen.queryByText('Su Su')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '0912345678' } });
    expect(screen.getAllByText('Kyaw Kyaw').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hla Hla')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'sale-002' } });
    expect(screen.getAllByText('Su Su').length).toBeGreaterThan(0);
    expect(screen.queryByText('Kyaw Kyaw')).not.toBeInTheDocument();
  });

  it('renders sort dropdown with default Newest First and updates sort order and label on selection', () => {
    render(
      <CashierSalesHistory
        sales={mockSales}
        deleteRequests={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        user={mockUser}
        businessProfile={mockBusinessProfile}
        onRequestDelete={vi.fn()}
        onPrintReceipt={vi.fn()}
        onStartSelling={vi.fn()}
      />
    );

    const sortButton = screen.getByRole('button', { name: /Newest First/i });
    expect(sortButton).toBeInTheDocument();

    fireEvent.click(sortButton);

    expect(screen.getByRole('button', { name: 'Oldest First' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Highest Amount' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lowest Amount' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Highest Amount' }));
    expect(screen.getByRole('button', { name: /Highest Amount/i })).toBeInTheDocument();
  });

  it('shows friendly empty state when no receipts match search or filters', () => {
    render(
      <CashierSalesHistory
        sales={mockSales}
        deleteRequests={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        user={mockUser}
        businessProfile={mockBusinessProfile}
        onRequestDelete={vi.fn()}
        onPrintReceipt={vi.fn()}
        onStartSelling={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search receipts, customers, phone...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent-item-or-customer' } });

    expect(screen.getByText('No receipts found')).toBeInTheDocument();
    expect(screen.getByText('Try changing your search or filters.')).toBeInTheDocument();
  });

  it('opens filter drawer with single filter button and filters by payment method with active count badge', () => {
    render(
      <CashierSalesHistory
        sales={mockSales}
        deleteRequests={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        user={mockUser}
        businessProfile={mockBusinessProfile}
        onRequestDelete={vi.fn()}
        onPrintReceipt={vi.fn()}
        onStartSelling={vi.fn()}
      />
    );

    const filterButtons = screen.getAllByRole('button', { name: /Filters/i });
    expect(filterButtons.length).toBe(1);
    fireEvent.click(filterButtons[0]);

    const kpayBtn = screen.getByRole('button', { name: 'KPay' });
    fireEvent.click(kpayBtn);

    const applyBtn = screen.getByRole('button', { name: /Apply Filters/i });
    fireEvent.click(applyBtn);

    expect(screen.getAllByText('Su Su').length).toBeGreaterThan(0);
    expect(screen.queryByText('Kyaw Kyaw')).not.toBeInTheDocument();
    expect(screen.queryByText('Hla Hla')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Filters \(1\)/i })).toBeInTheDocument();
  });

  it('makes View the primary action and opens receipt details modal', () => {
    render(
      <CashierSalesHistory
        sales={mockSales}
        deleteRequests={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        user={mockUser}
        businessProfile={mockBusinessProfile}
        onRequestDelete={vi.fn()}
        onPrintReceipt={vi.fn()}
        onStartSelling={vi.fn()}
      />
    );

    const viewButtons = screen.getAllByRole('button', { name: /^View$/i });
    expect(viewButtons.length).toBeGreaterThan(0);
    fireEvent.click(viewButtons[0]);

    expect(screen.getByText('Receipt Details')).toBeInTheDocument();
  });
});
