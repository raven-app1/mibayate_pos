import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServerMaintenance from './ServerMaintenance';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

describe('ServerMaintenance Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders maintenance header, title, and bilingual subtitle', () => {
    render(<ServerMaintenance />);

    expect(screen.getByText('Mibayate POS')).toBeInTheDocument();
    expect(screen.getByText('Retail Management System')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Server Under Maintenance')).toBeInTheDocument();
    expect(screen.getByText('ဆာဗာ ပြုပြင်ထိန်းသိမ်းမှု လုပ်ဆောင်နေပါသည်')).toBeInTheDocument();
  });

  it('renders all 4 status cards with information', () => {
    render(<ServerMaintenance />);

    expect(screen.getByText('System Status')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();

    expect(screen.getByText('Data Safety')).toBeInTheDocument();
    expect(screen.getByText('100% Secured')).toBeInTheDocument();

    expect(screen.getByText('POS Terminal')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();

    expect(screen.getByText('Estimated Time')).toBeInTheDocument();
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('renders the Check Server Status / Refresh button and handles click', async () => {
    render(<ServerMaintenance />);

    const refreshButton = screen.getByRole('button', {
      name: /check server status/i,
    });
    expect(refreshButton).toBeInTheDocument();

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(
        screen.getByText(/system maintenance is active/i)
      ).toBeInTheDocument();
    });
  });

  it('shows footer status code 503 and administrator advice', () => {
    render(<ServerMaintenance />);

    expect(
      screen.getByText(/Store staff: Please contact your system administrator if urgent\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/STATUS 503 • POS v1\.0\.1/i)).toBeInTheDocument();
  });
});
