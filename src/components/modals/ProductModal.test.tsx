import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductModal from './ProductModal';
import { Branch, UserProfile } from '../../types';

vi.mock('../../lib/supabase', () => ({
  dbService: {
    products: {
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

const mockUser: UserProfile = {
  id: 'user-1',
  name: 'Store Owner',
  email: 'owner@pos.com',
  role: 'owner',
  created_at: new Date().toISOString()
};

const mockBranches: Branch[] = [
  { id: 'b-home', name: 'Home', code: 'HOME' },
  { id: 'b-mby', name: 'Mby service', code: 'MBYSV' },
  { id: 'b-m1', name: 'Mibayate 1', code: 'MBY1' },
  { id: 'b-m2', name: 'Mibayate 2', code: 'MBY2' }
];

describe('ProductModal Branch Stock Inventory Levels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows deleting zeroes from branch stock inputs and typing numbers without leading zero', () => {
    render(
      <ProductModal
        user={mockUser}
        editingProduct={null}
        products={[]}
        branches={mockBranches}
        categories={['General']}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText('Total Stock: 0 pcs')).toBeInTheDocument();

    const homeLabel = screen.getByText('📍 Home');
    const homeCard = homeLabel.closest('div.flex')!;
    const homeInput = homeCard.querySelector('input[type="number"]') as HTMLInputElement;

    expect(homeInput).toBeInTheDocument();
    expect(homeInput.value).toBe('0');

    // 1. User selects / focuses: onFocus select is wired
    fireEvent.focus(homeInput);

    // 2. User deletes the 0 (backspace makes value "")
    fireEvent.change(homeInput, { target: { value: '' } });
    expect(homeInput.value).toBe('');

    // 3. User types 20
    fireEvent.change(homeInput, { target: { value: '20' } });
    expect(homeInput.value).toBe('20');
    expect(screen.getByText('Total Stock: 20 pcs')).toBeInTheDocument();

    // 4. User clears another branch input and blurs
    const mbyLabel = screen.getByText('📍 Mby service');
    const mbyCard = mbyLabel.closest('div.flex')!;
    const mbyInput = mbyCard.querySelector('input[type="number"]') as HTMLInputElement;

    fireEvent.change(mbyInput, { target: { value: '' } });
    expect(mbyInput.value).toBe('');
    fireEvent.blur(mbyInput);
    // onBlur restores 0 if left empty
    expect(mbyInput.value).toBe('0');
  });
});
