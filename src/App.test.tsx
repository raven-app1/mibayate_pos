import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { dbService } from './lib/supabase';

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  DEFAULT_BUSINESS_PROFILE: { name: 'Store', currency: 'MMK' },
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
  useBackDismiss: vi.fn(),
  useBackTabHistory: vi.fn(),
}));

describe('App Maintenance Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders app normally (no maintenance mode) for logged-in owner', async () => {
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
      expect(screen.queryByText('Server Under Maintenance')).not.toBeInTheDocument();
    });
  });

  it('renders app normally (no maintenance mode) when no user is logged in', async () => {
    vi.mocked(dbService.auth.getCurrentUser).mockResolvedValue(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Server Under Maintenance')).not.toBeInTheDocument();
    });
  });
});
