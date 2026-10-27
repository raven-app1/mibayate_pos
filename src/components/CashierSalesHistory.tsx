import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  History,
  Filter,
  FileSpreadsheet,
  RefreshCw,
  Search,
  X,
  Check,
  Copy,
  Printer,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  ArrowUpDown,
  Eye,
  User,
  Phone,
  RotateCcw,
  LayoutGrid,
  Table as TableIcon,
  ShoppingBag,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertCircle
} from 'lucide-react';
import { SaleWithItems, SaleDeleteRequest, UserProfile, BusinessProfile } from '../types';
import { formatCurrency, formatDate, formatDateShort, formatTime } from '../utils/format';
import { exportSalesReportToXlsx } from '../utils/excelExport';
import { useToast } from '../utils/toast';
import { useBackDismiss } from '../lib/backNavigation';
import FilterDrawer from './FilterDrawer';

interface CashierSalesHistoryProps {
  sales: SaleWithItems[];
  deleteRequests: SaleDeleteRequest[];
  isLoading: boolean;
  onRefresh: () => void;
  user: UserProfile;
  businessProfile: BusinessProfile;
  onRequestDelete: (sale: SaleWithItems) => void;
  onPrintReceipt: (sale: SaleWithItems) => void;
  onStartSelling: () => void;
}

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';
type PaymentFilter = 'all' | 'cash' | 'kpay' | 'wavepay' | 'card';
type StatusFilter = 'all' | 'completed' | 'pending' | 'approved' | 'rejected';
type SortOption = 'newest' | 'oldest' | 'amount_high' | 'amount_low';
type ViewMode = 'table' | 'cards';

export default function CashierSalesHistory({
  sales,
  deleteRequests,
  isLoading,
  onRefresh,
  user,
  onRequestDelete,
  onPrintReceipt,
  onStartSelling
}: CashierSalesHistoryProps) {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleWithItems | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sortDropdownRef = useRef<HTMLDivElement | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSortDropdown(false);
        sortButtonRef.current?.focus();
      }
    };
    if (showSortDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSortDropdown]);

  const sortOptions: Array<{ id: SortOption; label: string }> = [
    { id: 'newest', label: 'Newest First' },
    { id: 'oldest', label: 'Oldest First' },
    { id: 'amount_high', label: 'Highest Amount' },
    { id: 'amount_low', label: 'Lowest Amount' },
  ];

  const selectedSortLabel = sortOptions.find(o => o.id === sortBy)?.label || 'Newest First';
  const selectedSortShortLabel =
    sortBy === 'oldest' ? 'Oldest'
      : sortBy === 'amount_high' ? 'Highest'
        : sortBy === 'amount_low' ? 'Lowest'
          : 'Newest';

  useBackDismiss(selectedSale !== null, () => setSelectedSale(null));

  const deleteRequestMap = useMemo(() => {
    const map = new Map<string, SaleDeleteRequest>();
    if (Array.isArray(deleteRequests)) {
      for (const req of deleteRequests) {
        if (req && req.sale_id) {
          map.set(req.sale_id, req);
        }
      }
    }
    return map;
  }, [deleteRequests]);

  const appliedFilterCount = useMemo(() => {
    let count = 0;
    if (datePreset !== 'all') count++;
    if (paymentFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (minAmount.trim() || maxAmount.trim()) count++;
    return count;
  }, [datePreset, paymentFilter, statusFilter, minAmount, maxAmount]);

  const hasActiveFilters = appliedFilterCount > 0 || searchQuery.trim().length > 0;

  const resetFilters = () => {
    setSearchQuery('');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setPaymentFilter('all');
    setStatusFilter('all');
    setMinAmount('');
    setMaxAmount('');
    setSortBy('newest');
  };

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      toast('Receipt ID copied', 'info');
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  };

  const isMatchingDate = (dateStr: string, preset: DatePreset): boolean => {
    const saleDate = new Date(dateStr);
    const now = new Date();

    if (preset === 'all') return true;

    if (preset === 'today') {
      return (
        saleDate.getFullYear() === now.getFullYear() &&
        saleDate.getMonth() === now.getMonth() &&
        saleDate.getDate() === now.getDate()
      );
    }

    if (preset === 'week') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      return saleDate >= sevenDaysAgo;
    }

    if (preset === 'month') {
      return (
        saleDate.getFullYear() === now.getFullYear() &&
        saleDate.getMonth() === now.getMonth()
      );
    }

    if (preset === 'custom') {
      if (customStartDate) {
        const start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
        if (saleDate < start) return false;
      }
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        if (saleDate > end) return false;
      }
      return true;
    }

    return true;
  };

  const filteredSales = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const minVal = minAmount ? parseFloat(minAmount) : null;
    const maxVal = maxAmount ? parseFloat(maxAmount) : null;

    const filtered = sales.filter((sale) => {
      if (query) {
        const idMatch = (sale.id || '').toLowerCase().includes(query);
        const customerNameMatch = (sale.customer_name || '').toLowerCase().includes(query);
        const customerPhoneMatch = (sale.customer_phone || '').toLowerCase().includes(query);
        const itemMatch = sale.items?.some((it) =>
          (it.product_name || '').toLowerCase().includes(query)
        );
        if (!idMatch && !customerNameMatch && !customerPhoneMatch && !itemMatch) {
          return false;
        }
      }

      if (!isMatchingDate(sale.created_at, datePreset)) {
        return false;
      }

      if (paymentFilter !== 'all') {
        const method = (sale.payment_method || '').toLowerCase();
        if (paymentFilter === 'kpay') {
          if (method !== 'kpay' && method !== 'kbzpay') return false;
        } else if (paymentFilter === 'wavepay') {
          if (method !== 'wavepay') return false;
        } else if (paymentFilter === 'cash') {
          if (method !== 'cash') return false;
        } else if (paymentFilter === 'card') {
          if (method !== 'card') return false;
        } else if (method !== paymentFilter) {
          return false;
        }
      }

      if (statusFilter !== 'all') {
        const req = deleteRequestMap.get(sale.id);
        if (statusFilter === 'completed' && req) return false;
        if (statusFilter === 'pending' && req?.status !== 'pending') return false;
        if (statusFilter === 'approved' && req?.status !== 'approved') return false;
        if (statusFilter === 'rejected' && req?.status !== 'rejected') return false;
      }

      if (minVal !== null && !isNaN(minVal) && sale.total_amount < minVal) {
        return false;
      }
      if (maxVal !== null && !isNaN(maxVal) && sale.total_amount > maxVal) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'amount_high') {
        return b.total_amount - a.total_amount;
      }
      if (sortBy === 'amount_low') {
        return a.total_amount - b.total_amount;
      }
      return 0;
    });

    return filtered;
  }, [
    sales,
    searchQuery,
    datePreset,
    customStartDate,
    customEndDate,
    paymentFilter,
    statusFilter,
    minAmount,
    maxAmount,
    sortBy,
    deleteRequestMap
  ]);

  const receiptCountLabel = useMemo(() => {
    const filtered = filteredSales.length;
    const total = sales.length;
    if (filtered === total) {
      return `${total} ${total === 1 ? 'receipt' : 'receipts'}`;
    }
    return `${filtered} of ${total} receipts`;
  }, [filteredSales.length, sales.length]);

  const handleExportExcel = () => {
    if (filteredSales.length === 0) {
      toast('No sales history to export', 'warning');
      return;
    }
    const cleanName = user.name.toLowerCase().replace(/\s+/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportSalesReportToXlsx(filteredSales, `cashier_sales_${cleanName}_${dateStamp}.xlsx`);
    toast(`Exported ${filteredSales.length} sales to Excel`, 'success');
  };

  const getPaymentLabel = (filter: PaymentFilter) => {
    switch (filter) {
      case 'cash': return 'Cash';
      case 'kpay': return 'KPay';
      case 'wavepay': return 'WavePay';
      case 'card': return 'Card';
      default: return filter;
    }
  };

  const getDatePresetLabel = (preset: DatePreset) => {
    switch (preset) {
      case 'today': return 'Today';
      case 'week': return 'Last 7 Days';
      case 'month': return 'This Month';
      case 'custom': return 'Custom';
      default: return preset;
    }
  };

  const renderPaymentBadge = (method: string) => {
    if (method === 'cash') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
          <Banknote className="w-3 h-3 text-slate-700" />
          <span>Cash</span>
        </span>
      );
    }
    if (method === 'kbzpay' || method === 'kpay') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-white shadow-2xs">
          <Smartphone className="w-3 h-3 text-slate-200" />
          <span>KPay</span>
        </span>
      );
    }
    if (method === 'wavepay') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-white shadow-2xs">
          <Smartphone className="w-3 h-3 text-slate-200" />
          <span>WavePay</span>
        </span>
      );
    }
    if (method === 'card' || method === 'credit' || method === 'debit') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
          <CreditCard className="w-3 h-3 text-slate-700" />
          <span>Card</span>
        </span>
      );
    }
    if (method === 'ayapay') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-white shadow-2xs">
          <Smartphone className="w-3 h-3 text-slate-200" />
          <span>AYA Pay</span>
        </span>
      );
    }
    if (method === 'other') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-white shadow-2xs">
          <Smartphone className="w-3 h-3 text-slate-200" />
          <span>Other Pay</span>
        </span>
      );
    }
    if (method === 'mobile') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900 text-white shadow-2xs">
          <Smartphone className="w-3 h-3 text-slate-200" />
          <span>Mobile</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200 text-slate-900 border border-slate-300">
        <CreditCard className="w-3 h-3 text-slate-700" />
        <span className="uppercase">{method}</span>
      </span>
    );
  };

  const renderStatusBadge = (saleId: string) => {
    const req = deleteRequestMap.get(saleId);
    if (!req) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/60">
          <Check className="w-2.5 h-2.5 text-slate-400" />
          <span>Completed</span>
        </span>
      );
    }
    if (req.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-800 bg-slate-100 border border-slate-300">
          <Clock className="w-2.5 h-2.5 text-slate-600" />
          <span>Delete Pending</span>
        </span>
      );
    }
    if (req.status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-400 bg-slate-100 line-through border border-slate-200">
          <span>Voided</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-red-700 bg-red-50 border border-red-200" title={req.rejection_reason || 'Rejected'}>
        <AlertCircle className="w-2.5 h-2.5 text-red-500" />
        <span>Delete Rejected</span>
      </span>
    );
  };

  const getRelativeTime = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-y-auto android-scroll px-3 sm:px-6 pt-3 pb-6 sm:pb-8 max-w-7xl mx-auto w-full space-y-3">
      {/* Top Header Card */}
      <div className="android-card p-3 sm:p-4 border border-slate-200/80 bg-white">
        <div className="flex items-start justify-between gap-2.5 sm:items-center">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-black text-white flex items-center justify-center shrink-0 shadow-2xs">
              <History className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">
                Sales History
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredSales.length === 0}
              className="inline-flex items-center justify-center gap-1 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              title="Export filtered sales to Excel"
              aria-label="Export to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center justify-center gap-1 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 transition-all cursor-pointer shadow-2xs"
              title="Reload receipts from database"
              aria-label="Refresh receipts"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <p className="mt-2 text-[10px] sm:text-[11px] text-slate-500 font-medium flex items-center gap-1 min-w-0">
          <span className="font-bold text-slate-700 shrink-0" aria-live="polite">
            {receiptCountLabel}
          </span>
          <span aria-hidden="true" className="text-slate-300 shrink-0">•</span>
          <span className="truncate" title={user.name}>{user.name}</span>
          <span aria-hidden="true" className="text-slate-300 shrink-0">•</span>
          <span className="truncate" title={user.branch_name || 'Main Branch'}>
            {user.branch_name || 'Main Branch'}
          </span>
        </p>
      </div>

      {/* Controls Card: Search bar + Filter & Sort row */}
      <div className="android-card p-3 sm:p-4 border border-slate-200/80 bg-white space-y-2.5 sm:space-y-3 shadow-xs">
        {/* Full-width Search Bar */}
        <div className="relative w-full min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search receipts, customers, phone..."
            aria-label="Search receipts by ID, customer, phone, or item"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searchQuery) setSearchQuery('');
            }}
            className={`w-full h-11 sm:h-12 min-w-0 pl-10 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-[13px] sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:text-[11px] sm:placeholder:text-sm focus:outline-none focus:border-black transition-all shadow-2xs ${
              searchQuery ? 'pr-9' : 'pr-3'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-0 min-w-0 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* One filter entry point + sort; full-width rows on narrow screens */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden xl:flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`min-h-0 p-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-black shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`min-h-0 p-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-black shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Cards view"
              aria-label="Cards view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
            <button
              type="button"
              onClick={() => setShowFilterDrawer(true)}
              className={`inline-flex w-full min-w-0 items-center justify-center gap-1.5 px-2.5 py-1.5 sm:w-auto sm:justify-start sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-2xs ${
                appliedFilterCount > 0
                  ? 'bg-black text-white border-black'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              aria-label={
                appliedFilterCount > 0
                  ? `Filters (${appliedFilterCount}) — open filter options`
                  : 'Filters — open filter options'
              }
            >
              <Filter className="w-3.5 h-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                {appliedFilterCount > 0 ? `Filters (${appliedFilterCount})` : 'Filters'}
              </span>
            </button>

            <div className="relative min-w-0" ref={sortDropdownRef}>
              <button
                ref={sortButtonRef}
                type="button"
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 px-2.5 py-1.5 sm:w-auto sm:justify-start sm:px-3 sm:py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition-all cursor-pointer shadow-2xs"
                aria-haspopup="listbox"
                aria-expanded={showSortDropdown}
                aria-label={`Sort receipts: ${selectedSortLabel}`}
                title={`Sort: ${selectedSortLabel}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0 truncate sm:hidden">{selectedSortShortLabel}</span>
                <span className="hidden min-w-0 truncate sm:inline">{selectedSortLabel}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-150 ${
                    showSortDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showSortDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-44 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl py-1 z-30 animate-fade-in">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSortBy(opt.id);
                        setShowSortDropdown(false);
                      }}
                      className={`w-full px-3.5 py-2.5 text-left text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        sortBy === opt.id
                          ? 'bg-slate-100 text-black'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0 truncate">{opt.label}</span>
                      {sortBy === opt.id && <Check className="w-3.5 h-3.5 shrink-0 text-black" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-bold text-slate-500">Active:</span>

            {searchQuery.trim() && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-medium text-[11px]">
                <span className="truncate">Search: &ldquo;{searchQuery.trim()}&rdquo;</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="min-h-0 min-w-0 shrink-0 p-0.5 hover:text-black cursor-pointer"
                  aria-label="Clear search filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {datePreset !== 'all' && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-medium text-[11px]">
                <span className="truncate">Date: {getDatePresetLabel(datePreset)}</span>
                <button
                  type="button"
                  onClick={() => setDatePreset('all')}
                  className="min-h-0 min-w-0 shrink-0 p-0.5 hover:text-black cursor-pointer"
                  aria-label="Clear date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {paymentFilter !== 'all' && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-medium text-[11px]">
                <span className="truncate">Payment: {getPaymentLabel(paymentFilter)}</span>
                <button
                  type="button"
                  onClick={() => setPaymentFilter('all')}
                  className="min-h-0 min-w-0 shrink-0 p-0.5 hover:text-black cursor-pointer"
                  aria-label="Clear payment filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {(minAmount.trim() || maxAmount.trim()) && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-medium text-[11px]">
                <span className="truncate">
                  Amount: {minAmount.trim() ? `${minAmount} Ks` : '0 Ks'} - {maxAmount.trim() ? `${maxAmount} Ks` : 'Any'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMinAmount('');
                    setMaxAmount('');
                  }}
                  className="min-h-0 min-w-0 shrink-0 p-0.5 hover:text-black cursor-pointer"
                  aria-label="Clear amount filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-medium text-[11px]">
                <span className="truncate">Status: {statusFilter.toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="min-h-0 min-w-0 shrink-0 p-0.5 hover:text-black cursor-pointer"
                  aria-label="Clear status filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-black underline cursor-pointer ml-auto"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All</span>
            </button>
          </div>
        )}
      </div>

      {/* Content Area: Loading, Empty, or Sales List */}
      {isLoading ? (
        <div className="android-card p-12 border border-slate-200/80 bg-white flex flex-col items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-[3px] border-gray-900/20 border-t-gray-900 rounded-full animate-spin mb-3" />
          <span className="text-xs font-bold text-slate-600">Loading sales history...</span>
        </div>
      ) : sales.length === 0 ? (
        <div className="android-card p-12 border border-slate-200/80 bg-white flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Sales Recorded Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
            Your processed transactions for this branch will appear here once you check out orders in the POS terminal.
          </p>
          <button
            type="button"
            onClick={onStartSelling}
            className="px-5 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-98"
          >
            Start Selling Now
          </button>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="android-card p-12 border border-slate-200/80 bg-white flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <Search className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No receipts found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
            Try changing your search or filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW */}
          <div className={`${viewMode === 'table' ? 'hidden xl:block' : 'hidden'} android-card border border-slate-200/80 bg-white overflow-hidden shadow-2xs`}>
            <div className="overflow-x-auto android-scroll">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Receipt ID</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSales.map((sale) => {
                    const req = deleteRequestMap.get(sale.id);
                    const isCopied = copiedId === sale.id;
                    const itemsSummary = sale.items?.map((it) => `${it.product_name} (x${it.quantity})`).join(', ') || '';

                    return (
                      <tr
                        key={sale.id}
                        onClick={() => setSelectedSale(sale)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{sale.id.slice(0, 8)}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyId(sale.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-black rounded transition-opacity cursor-pointer"
                              title="Copy full receipt ID"
                            >
                              {isCopied ? <Check className="w-3 h-3 text-black" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-800">{formatDate(sale.created_at)}</div>
                          <div className="text-[10px] text-slate-400">{getRelativeTime(sale.created_at)}</div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {sale.customer_name ? (
                            <div>
                              <span className="font-semibold text-slate-800">{sale.customer_name}</span>
                              {sale.customer_phone && (
                                <span className="text-[11px] text-slate-400 block font-mono">{sale.customer_phone}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Walk-in</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 max-w-[200px]">
                          <div className="font-bold text-slate-700">
                            {sale.items?.length || 0} {sale.items?.length === 1 ? 'item' : 'items'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate" title={itemsSummary}>
                            {itemsSummary || 'No item details'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {renderPaymentBadge(sale.payment_method)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {renderStatusBadge(sale.id)}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="font-mono font-black text-slate-950 text-sm tabular-nums">
                            {formatCurrency(sale.total_amount)}
                          </div>
                          {sale.discount > 0 && (
                            <span className="text-[10px] text-red-600 font-medium block">
                              -{formatCurrency(sale.discount)} disc
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => onPrintReceipt(sale)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-black hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Print thermal receipt"
                              aria-label="Print receipt"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            {(!req || req.status === 'rejected') && (
                              <button
                                type="button"
                                onClick={() => onRequestDelete(sale)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                title="Request delete / void"
                                aria-label="Request delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedSale(sale)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active-scale"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARDS VIEW (Mobile & Alternative Desktop Grid) */}
          <div className={`${viewMode === 'cards' ? 'grid' : 'grid xl:hidden'} grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3`}>
            {filteredSales.map((sale) => {
              const req = deleteRequestMap.get(sale.id);
              const isCopied = copiedId === sale.id;

              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className="android-card min-w-0 p-3 sm:p-3.5 border border-slate-200/90 bg-white hover:border-slate-400 transition-all cursor-pointer group shadow-2xs flex flex-col gap-2"
                >
                  {/* Section 1, 2, 3: Header Row */}
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="min-w-0 flex-1">
                      {/* 1. Receipt ID & Copy */}
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono font-bold text-slate-900 text-xs tracking-tight truncate" title={sale.id}>
                          #{sale.id.slice(0, 8)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(sale.id, e)}
                          className="min-h-0 min-w-0 shrink-0 p-2 -my-1 text-slate-400 hover:text-black hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title="Copy full receipt ID"
                          aria-label="Copy receipt ID"
                        >
                          {isCopied ? <Check className="w-3 h-3 text-black" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* 3. Date & Time */}
                      <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5 min-w-0 whitespace-nowrap">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{formatDateShort(sale.created_at)}</span>
                        <span aria-hidden="true">•</span>
                        <span>{formatTime(sale.created_at)}</span>
                      </div>
                    </div>

                    {/* 2. Total Amount & Item Count */}
                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-slate-950 text-base leading-tight tabular-nums">
                        {formatCurrency(sale.total_amount)}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium tabular-nums">
                        {sale.items?.length || 0} {sale.items?.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>

                  {/* Customer Row (if present) */}
                  {sale.customer_name && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-semibold truncate leading-normal" title={sale.customer_name}>
                          {sale.customer_name}
                        </span>
                      </div>
                      {sale.customer_phone && (
                        <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                          {sale.customer_phone}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Section 4: Compact Item Preview */}
                  {sale.items && sale.items.length > 0 && (
                    <div className="bg-slate-50/60 rounded-xl p-2 border border-slate-100/90 space-y-1">
                      {sale.items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 text-[11px] text-slate-700 min-w-0">
                          <span className="truncate min-w-0 font-medium leading-normal" title={item.product_name}>
                            {item.product_name}
                          </span>
                          <span className="font-mono text-slate-500 shrink-0 text-[10px] font-medium whitespace-nowrap tabular-nums">
                            {item.quantity} × {formatCurrency(item.unit_price)}
                          </span>
                        </div>
                      ))}
                      {sale.items.length > 2 && (
                        <div className="text-[10px] text-slate-400 font-medium pt-0.5 tabular-nums">
                          +{(sale.items.length - 2)} more {sale.items.length - 2 === 1 ? 'item' : 'items'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status banner (if delete request exists) */}
                  {req && (
                    <div className="pt-0.5">
                      {req.status === 'pending' && (
                        <div className="px-2 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          <span>Delete Request Pending</span>
                        </div>
                      )}
                      {req.status === 'approved' && (
                        <div className="px-2 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-bold line-through">
                          Voided and Approved by Owner
                        </div>
                      )}
                      {req.status === 'rejected' && (
                        <div className="px-2 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold">
                          Delete Rejected {req.rejection_reason ? `(${req.rejection_reason})` : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 5: Payment method & Actions */}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                    <div className="flex min-w-0 max-w-[55%] items-center">
                      {renderPaymentBadge(sale.payment_method)}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onPrintReceipt(sale)}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center p-2 text-slate-500 hover:text-black hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Print thermal receipt"
                        aria-label="Print receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      {(!req || req.status === 'rejected') && (
                        <button
                          type="button"
                          onClick={() => onRequestDelete(sale)}
                          className="inline-flex min-h-10 min-w-10 items-center justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Request delete / void receipt"
                          aria-label="Request delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedSale(sale)}
                        className="inline-flex min-h-10 items-center gap-1 px-3 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs active-scale"
                        title="View receipt details"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* FILTER DRAWER */}
      <FilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        title="Filter Sales History"
        subtitle="Refine your processed receipts"
        activeCount={appliedFilterCount}
        onReset={resetFilters}
      >
        <div className="space-y-4">
          {/* Payment Method Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Payment Method</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { val: 'all', label: 'All' },
                { val: 'cash', label: 'Cash' },
                { val: 'kpay', label: 'KPay' },
                { val: 'wavepay', label: 'WavePay' },
                { val: 'card', label: 'Card' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setPaymentFilter(opt.val as PaymentFilter)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                    paymentFilter === opt.val
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Date Range</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {[
                { id: 'all', label: 'All Dates' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'month', label: 'This Month' },
                { id: 'custom', label: 'Custom' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDatePreset(tab.id as DatePreset)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                    datePreset === tab.id
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Amount Range Filter */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Amount Range (Ks)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Min Amount</label>
                <input
                  type="number"
                  placeholder="Min amount"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Max Amount</label>
                <input
                  type="number"
                  placeholder="Max amount"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white transition-all"
                />
              </div>
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'all', label: 'All Sales' },
                { val: 'completed', label: 'Completed' },
                { val: 'pending', label: 'Pending Void' },
                { val: 'approved', label: 'Approved Void' },
                { val: 'rejected', label: 'Rejected Void' }
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setStatusFilter(opt.val as StatusFilter)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                    statusFilter === opt.val
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </FilterDrawer>

      {/* RICH SALE DETAIL MODAL / BOTTOM SHEET */}
      {selectedSale && (
        <div className="bottom-sheet-overlay" onClick={() => setSelectedSale(null)}>
          <div
            className="bottom-sheet max-w-xl mx-auto rounded-t-3xl sm:rounded-2xl max-h-[90vh] bg-white flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 pb-2 sm:hidden">
              <div className="pull-indicator" />
            </div>

            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-black text-white flex items-center justify-center shadow-xs shrink-0">
                  <ShoppingBag className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-black text-sm text-slate-900 shrink-0">Receipt Details</h3>
                    <span className="font-mono text-xs font-bold text-slate-500 truncate">#{selectedSale.id.slice(0, 8)}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedSale.id)}
                      className="min-h-0 min-w-0 shrink-0 p-1.5 text-slate-400 hover:text-black rounded cursor-pointer"
                      title="Copy receipt ID"
                      aria-label="Copy receipt ID"
                    >
                      {copiedId === selectedSale.id ? <Check className="w-3 h-3 text-black" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {formatDate(selectedSale.created_at)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                aria-label="Close receipt details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto android-scroll p-5 space-y-4">
              {/* Customer Information (if present) */}
              {selectedSale.customer_name && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Customer Details</span>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {selectedSale.customer_name}
                    </span>
                    {selectedSale.customer_phone && (
                      <a
                        href={`tel:${selectedSale.customer_phone}`}
                        className="flex items-center gap-1 font-mono text-slate-700 hover:text-black"
                      >
                        <Phone className="w-3 h-3" />
                        {selectedSale.customer_phone}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Items List Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Purchased Items ({selectedSale.items?.length || 0})
                  </span>
                </div>
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {selectedSale.items?.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate" title={item.product_name}>{item.product_name}</div>
                        <div className="text-[11px] text-slate-400 font-medium tabular-nums">
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-right shrink-0 tabular-nums">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
                {(() => {
                  const saleSubtotal = (selectedSale.items || []).reduce((sum, item) => sum + (Number(item?.total) || 0), 0);
                  const displaySubtotal = saleSubtotal > 0 ? saleSubtotal : (selectedSale.total_amount + (selectedSale.discount || 0));
                  const saleTax = Math.max(0, Number((selectedSale.total_amount - (displaySubtotal - (selectedSale.discount || 0))).toFixed(2)));
                  return (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="font-mono font-medium tabular-nums">{formatCurrency(displaySubtotal)}</span>
                      </div>
                      {selectedSale.discount > 0 && (
                        <div className="flex justify-between text-red-600 font-medium">
                          <span>Discount</span>
                          <span className="font-mono tabular-nums">-{formatCurrency(selectedSale.discount)}</span>
                        </div>
                      )}
                      {saleTax > 0 && (
                        <div className="flex justify-between text-slate-600 font-medium">
                          <span>Tax</span>
                          <span className="font-mono font-medium tabular-nums">{formatCurrency(saleTax)}</span>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="flex justify-between text-sm font-black text-slate-950 pt-2 border-t border-slate-200">
                  <span>TOTAL AMOUNT</span>
                  <span className="font-mono text-base tabular-nums">{formatCurrency(selectedSale.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                  <span>Payment Method:</span>
                  <span className="uppercase font-bold text-slate-800">{selectedSale.payment_method}</span>
                </div>
              </div>

              {/* Delete Request Information (if present) */}
              {deleteRequestMap.get(selectedSale.id) && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Delete Request</span>
                    {renderStatusBadge(selectedSale.id)}
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    <span className="font-semibold">Reason:</span> {deleteRequestMap.get(selectedSale.id)?.reason || 'No reason provided'}
                  </p>
                  {deleteRequestMap.get(selectedSale.id)?.rejection_reason && (
                    <p className="text-red-600 text-[11px]">
                      <span className="font-semibold">Owner note:</span> {deleteRequestMap.get(selectedSale.id)?.rejection_reason}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-slate-50/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              {(!deleteRequestMap.get(selectedSale.id) || deleteRequestMap.get(selectedSale.id)?.status === 'rejected') && (
                <button
                  type="button"
                  onClick={() => {
                    const sale = selectedSale;
                    setSelectedSale(null);
                    onRequestDelete(sale);
                  }}
                  className="flex w-full sm:w-auto min-h-11 items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Request Delete</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const sale = selectedSale;
                  setSelectedSale(null);
                  onPrintReceipt(sale);
                }}
                className="flex w-full sm:flex-1 min-h-11 items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-black text-white hover:bg-gray-800 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-98"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Thermal Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
