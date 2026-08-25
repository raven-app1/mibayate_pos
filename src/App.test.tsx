import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { dbService } from './lib/supabase';

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  dbService: {
    auth: {
      getCurrentUser: vi.fn(),
      logout: vi.fn(),
    },
  },
}));

vi.mock('./lib/backNavigation', () => ({
  startBackNavigation: vi.fn(),
  stopBackNavigation: vi.fn(),
  setExitPromptHandler: vi.fn(),
}));

describe('App Maintenance Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders server maintenance page even when user session is active (logged-in owner)', async () => {
    vi.mocked(dbService.auth.getCurrentUser).mockResolvedValue({
      id: 'owner-1',
      email: 'owner@pos.local',
      name: 'Store Owner',
      role: 'owner',
      branch_id: 'branch-1',
      created_at: '2026-01-01',
    });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Server Under Maintenance')).toBeInTheDocument();
    });

    expect(screen.queryByText('Owner Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('ဆာဗာ ပြုပြင်ထိန်းသိမ်းမှု လုပ်ဆောင်နေပါသည်')).toBeInTheDocument();
  });

  it('renders server maintenance page when no user is logged in (session is null)', async () => {
    vi.mocked(dbService.auth.getCurrentUser).mockResolvedValue(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Server Under Maintenance')).toBeInTheDocument();
    });

    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });
});
