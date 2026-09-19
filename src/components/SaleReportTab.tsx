import React, { useState, useMemo } from 'react';
import { SaleWithItems, Branch, UserProfile } from '../types';
import { formatCurrency } from '../utils/format';
import { useToast } from '../utils/toast';
import { exportSalesReportToXlsx } from '../utils/excelExport';
import { 
  Receipt, Filter, ChevronDown, ChevronUp, Search, 
  Building2, Users, Calendar, X, RotateCcw, 
  CreditCard, Wallet, Banknote, User, FileSpreadsheet, TrendingUp, Check
} from 'lucide-react';

import FilterDrawer from './FilterDrawer';
import MonthlyProfitView from './dashboard/MonthlyProfitView';

interface SaleReportTabProps {
  sales: SaleWithItems[];
  branches: Branch[];
  cashiers: UserProfile[];
  currency: string;
  initialView?: 'transactions' | 'monthly-profit';
}

export default function SaleReportTab({ sales, branches, cashiers, currency, initialView = 'transactions' }: SaleReportTabProps) {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<'transactions' | 'monthly-profit'>(initialView);
  const [isExporting, setIsExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'this-month' | 'last-month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'mobile'>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [cashierFilter, setCashierFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const handleExportXlsx = () => {
    if (filteredSales.length === 0) {
      toast('No sales data to export', 'warning');
      return;
    }
    setIsExporting(true);
    try {
      exportSalesReportToXlsx(filteredSales);
      toast(`Exported ${filteredSales.length} transactions to Excel`, 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to export sales report to Excel', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== 'all') count++;
    if (paymentFilter !== 'all') count++;
    if (branchFilter !== 'all') count++;
    if (cashierFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [dateFilter, paymentFilter, branchFilter, cashierFilter, searchQuery]);

  const resetFilters = () => {
    setDateFilter('all');
    setStartDate('');
    setEndDate('');
    setPaymentFilter('all');
    setBranchFilter('all');
    setCashierFilter('all');
    setSearchQuery('');
  };

  const filteredSales = useMemo(() => {
    let result = sales;

    if (dateFilter !== 'all') {
      const now = new Date();
      if (dateFilter === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const end = start + 86399999;
        result = result.filter(s => {
          const t = new Date(s.created_at).getTime();
          return t >= start && t <= end;
        });
      } else if (dateFilter === 'yesterday') {
        const yDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const start = yDate.getTime();
        const end = start + 86399999;
        result = result.filter(s => {
          const t = new Date(s.created_at).getTime();
          return t >= start && t <= end;
        });
      } else if (dateFilter === 'this-month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        result = result.filter(s => new Date(s.created_at).getTime() >= start);
      } else if (dateFilter === 'last-month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime();
        result = result.filter(s => {
          const t = new Date(s.created_at).getTime();
          return t >= start && t <= end;
        });
      } else if (dateFilter === 'custom') {
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).getTime() + 86399999 : Infinity;
        result = result.filter(s => {
          const t = new Date(s.created_at).getTime();
          return t >= start && t <= end;
        });
      }
    }

    if (paymentFilter !== 'all') {
      result = result.filter(s => s.payment_method === paymentFilter);
    }

    if (branchFilter !== 'all') {
      result = result.filter(s => s.branch_id === branchFilter);
    }

    if (cashierFilter !== 'all') {
      result = result.filter(s => s.cashier_id === cashierFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s => 
        (s.id || '').toLowerCase().includes(q) || 
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.cashier_name || '').toLowerCase().includes(q) ||
        (s.branch_name || '').toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, dateFilter, startDate, endDate, paymentFilter, branchFilter, cashierFilter, searchQuery]);

  const { totalAmount, totalCost, totalProfit, marginPercent } = useMemo(() => {
    let rev = 0;
    let cost = 0;
    filteredSales.forEach(s => {
      rev += Number(s.total_amount) || 0;
      (s.items || []).forEach(it => {
        cost += (Number(it.unit_cost) || 0) * (Number(it.quantity) || 0);
      });
    });
    const prof = rev - cost;
    const margin = rev > 0 ? (prof / rev) * 100 : 0;
    return {
      totalAmount: rev,
      totalCost: cost,
      totalProfit: prof,
      marginPercent: margin
    };
  }, [filteredSales]);

  const toggleExpand = (id: string) => {
    setExpandedSaleId(prev => prev === id ? null : id);
  };

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case 'cash':
        return { label: 'CASH', icon: Banknote, className: 'bg-slate-100 text-slate-800 border-slate-200' };
      case 'card':
        return { label: 'CARD', icon: CreditCard, className: 'bg-black text-white border-black' };
      case 'mobile':
        return { label: 'MOBILE', icon: Wallet, className: 'bg-slate-200 text-slate-900 border-slate-300' };
      default:
        return { label: method.toUpperCase(), icon: Wallet, className: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const formatSaleTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today, ${timeStr}`;
    }
    const yDay = new Date(now);
    yDay.setDate(now.getDate() - 1);
    if (d.toDateString() === yDay.toDateString()) {
      return `Yesterday, ${timeStr}`;
    }
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  const getDateLabel = () => {
    if (dateFilter === 'all') return 'All Time';
    if (dateFilter === 'today') return 'Today';
    if (dateFilter === 'yesterday') return 'Yesterday';
    if (dateFilter === 'this-month') return 'This Month';
    if (dateFilter === 'last-month') return 'Last Month';
    if (dateFilter === 'custom') {
      if (startDate && endDate) return `${startDate} to ${endDate}`;
      if (startDate) return `From ${startDate}`;
      if (endDate) return `Until ${endDate}`;
      return 'Custom Range';
    }
    return 'Date Filter';
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2 truncate">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-black shrink-0" />
            <span>Sale & Profit Report</span>
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 truncate hidden sm:block">
            Revenue, transaction details and monthly profit analysis
          </p>
        </div>

        {activeView === 'transactions' && (
          <button
            onClick={handleExportXlsx}
            disabled={isExporting || filteredSales.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs shrink-0"
            title="Export sales report to Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
            <span>{isExporting ? 'Exporting...' : 'Export XLSX'}</span>
          </button>
        )}
      </div>

      {/* Segmented View Switcher (iOS/Native POS style) */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setActiveView('transactions')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeView === 'transactions'
              ? 'bg-white text-black shadow-xs'
              : 'text-slate-600 hover:text-black'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Transactions ({sales.length})</span>
        </button>
        <button
          onClick={() => setActiveView('monthly-profit')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeView === 'monthly-profit'
              ? 'bg-white text-black shadow-xs'
              : 'text-slate-600 hover:text-black'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Monthly Profit & Range</span>
        </button>
      </div>

      {activeView === 'monthly-profit' ? (
        <MonthlyProfitView
          sales={sales}
          branches={branches}
          cashiers={cashiers}
          currency={currency}
        />
      ) : (
        <>
          {/* Quick Summary Bar (Clean, non-intrusive) */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block truncate">
                Total Revenue
              </span>
              <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 mt-0.5 truncate">
                {formatCurrency(totalAmount)}
              </h3>
              <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                {filteredSales.length} {filteredSales.length === 1 ? 'sale' : 'sales'}
              </span>
            </div>

            <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block truncate">
                Gross Profit
              </span>
              <h3 className={`text-sm sm:text-base md:text-lg font-black mt-0.5 truncate ${totalProfit < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {formatCurrency(totalProfit)}
              </h3>
              <span className="text-[10px] font-bold text-slate-500 block truncate mt-0.5">
                {marginPercent.toFixed(1)}% margin
              </span>
            </div>

            <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block truncate">
                Total Cost
              </span>
              <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-700 mt-0.5 truncate">
                {formatCurrency(totalCost)}
              </h3>
              <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                Product COGS
              </span>
            </div>
          </div>

          {/* Clean Search & Filter Trigger Row */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search receipt #, customer, cashier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-black focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button 
                type="button"
                onClick={() => setShowFilters(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeFilterCount > 0 
                    ? 'bg-black text-white border-black shadow-xs' 
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="w-4.5 h-4.5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Timeframe Chips Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: 'this-month', label: 'This Month' },
                { id: 'last-month', label: 'Last Month' },
              ].map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setDateFilter(chip.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                    dateFilter === chip.id
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {chip.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  dateFilter === 'custom' || dateFilter === 'yesterday'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-3 h-3" />
                <span>{dateFilter === 'custom' ? getDateLabel() : 'Custom...'}</span>
              </button>
            </div>

            {/* Active Filters "Find Out" Bar - immediately reveals what is applied */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 no-scrollbar text-xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0">
                  Active:
                </span>

                {dateFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold shrink-0">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>{getDateLabel()}</span>
                    <button 
                      type="button"
                      onClick={() => setDateFilter('all')} 
                      className="hover:text-black ml-0.5 cursor-pointer"
                      title="Clear date filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {paymentFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold shrink-0">
                    <span>Pay: {paymentFilter.toUpperCase()}</span>
                    <button 
                      type="button"
                      onClick={() => setPaymentFilter('all')} 
                      className="hover:text-black ml-0.5 cursor-pointer"
                      title="Clear payment filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {branchFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold shrink-0">
                    <Building2 className="w-3 h-3 text-slate-500" />
                    <span>{branches.find(b => b.id === branchFilter)?.name || 'Branch'}</span>
                    <button 
                      type="button"
                      onClick={() => setBranchFilter('all')} 
                      className="hover:text-black ml-0.5 cursor-pointer"
                      title="Clear branch filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {cashierFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold shrink-0">
                    <Users className="w-3 h-3 text-slate-500" />
                    <span>{cashiers.find(c => c.id === cashierFilter)?.name || 'Cashier'}</span>
                    <button 
                      type="button"
                      onClick={() => setCashierFilter('all')} 
                      className="hover:text-black ml-0.5 cursor-pointer"
                      title="Clear cashier filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {searchQuery.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold shrink-0">
                    <Search className="w-3 h-3 text-slate-500" />
                    <span className="max-w-[100px] truncate">"{searchQuery}"</span>
                    <button 
                      type="button"
                      onClick={() => setSearchQuery('')} 
                      className="hover:text-black ml-0.5 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-slate-500 hover:text-black transition-colors cursor-pointer shrink-0 ml-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset All</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Drawer (Slides up on mobile or sheet on desktop) */}
          <FilterDrawer
            isOpen={showFilters}
            onClose={() => setShowFilters(false)}
            title="Sale Report Filters"
            subtitle="Filter transactions by date, payment, branch & cashier"
            activeCount={activeFilterCount}
            onReset={resetFilters}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Receipt ID, Customer, Cashier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Date Timeframe</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'all', label: 'All Time' },
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'this-month', label: 'This Month' },
                    { id: 'last-month', label: 'Last Month' },
                    { id: 'custom', label: 'Custom Range' },
                  ].map(btn => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setDateFilter(btn.id as any)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                        dateFilter === btn.id ? 'bg-black text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {dateFilter === 'custom' && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Start Date</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">End Date</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Payment Method</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['all', 'cash', 'card', 'mobile'] as const).map(pm => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentFilter(pm)}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        paymentFilter === pm
                          ? 'bg-black text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {pm === 'all' ? 'All' : pm.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" /> Branch
                </label>
                <select 
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white transition-colors"
                >
                  <option value="all">All Branches</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> Cashier
                </label>
                <select 
                  value={cashierFilter}
                  onChange={(e) => setCashierFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white transition-colors"
                >
                  <option value="all">All Cashiers</option>
                  {cashiers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </FilterDrawer>

          {/* Mobile Card List (Optimized for one-handed mobile viewing) */}
          <div className="space-y-2.5 sm:hidden">
            <div className="flex items-center justify-between px-1 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              <span>{filteredSales.length} Transactions</span>
              <span>Sorted by Newest</span>
            </div>

            {filteredSales.map(sale => {
              const badge = getPaymentBadge(sale.payment_method);
              const BadgeIcon = badge.icon;
              const isExpanded = expandedSaleId === sale.id;
              const saleCost = (sale.items || []).reduce((sum, it) => sum + ((Number(it.unit_cost) || 0) * (Number(it.quantity) || 0)), 0);
              const saleProfit = (Number(sale.total_amount) || 0) - saleCost;
              const saleMargin = Number(sale.total_amount) > 0 ? (saleProfit / Number(sale.total_amount)) * 100 : 0;

              return (
                <div 
                  key={sale.id} 
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
                >
                  {/* Card Header */}
                  <div className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                          #{sale.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium truncate">
                          {formatSaleTime(sale.created_at)}
                        </span>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border shrink-0 ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    </div>

                    {/* Metadata line: Cashier, Branch, Customer */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded-md">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[120px]">{sale.cashier_name}</span>
                      </span>

                      <span className="inline-flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded-md">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[120px]">{sale.branch_name || 'Main'}</span>
                      </span>

                      {sale.customer_name && (
                        <span className="inline-flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded-md text-slate-700 truncate max-w-[140px]">
                          Cust: {sale.customer_name}
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Financial totals and Expand Trigger */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-black text-slate-900 tracking-tight">
                            {formatCurrency(sale.total_amount)}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            saleProfit < 0 
                              ? 'bg-red-50 text-red-600' 
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                            Profit: {formatCurrency(saleProfit)} ({saleMargin.toFixed(0)}%)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpand(sale.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer shrink-0"
                      >
                        <span>{sale.items?.length || 0} items</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Item Breakdown */}
                  {isExpanded && sale.items && sale.items.length > 0 && (
                    <div className="p-3 bg-slate-50/90 border-t border-slate-100 space-y-2">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        Receipt Items ({sale.items.length})
                      </span>
                      <div className="divide-y divide-slate-200/60">
                        {sale.items.map(item => {
                          const itemProfit = (Number(item.unit_price) - Number(item.unit_cost || 0)) * Number(item.quantity);
                          return (
                            <div key={item.id} className="py-1.5 flex justify-between items-start text-xs gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="text-slate-900 font-bold block truncate">
                                  {item.product_name}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {item.quantity} x {formatCurrency(item.unit_price)}
                                  {Number(item.unit_cost) > 0 && ` (Cost: ${formatCurrency(item.unit_cost)})`}
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-black text-slate-900 block">
                                  {formatCurrency(item.total)}
                                </span>
                                {itemProfit !== 0 && (
                                  <span className={`text-[10px] font-bold ${itemProfit < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                    Profit: {formatCurrency(itemProfit)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSales.length === 0 && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
                <Receipt className="w-9 h-9 text-slate-300 mx-auto" />
                <div>
                  <p className="text-xs font-bold text-slate-700">No transactions found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your timeframe or active filters</p>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear All Filters</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                {filteredSales.length} Transactions Found
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-600">
                  Sales: <strong className="text-gray-900 font-black">{formatCurrency(totalAmount)}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-xs font-bold text-slate-600">
                  Profit: <strong className={`font-black ${totalProfit < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatCurrency(totalProfit)}</strong> ({marginPercent.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400 font-extrabold">
                    <th className="py-3 px-4">Date & ID</th>
                    <th className="py-3 px-4">Cashier</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-right">Amount & Profit</th>
                    <th className="py-3 px-4 text-center">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSales.map(sale => {
                    const badge = getPaymentBadge(sale.payment_method);
                    const BadgeIcon = badge.icon;
                    const isExpanded = expandedSaleId === sale.id;
                    const saleCost = (sale.items || []).reduce((sum, it) => sum + ((Number(it.unit_cost) || 0) * (Number(it.quantity) || 0)), 0);
                    const saleProfit = (Number(sale.total_amount) || 0) - saleCost;

                    return (
                      <React.Fragment key={sale.id}>
                        <tr className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900">
                              {new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono font-medium mt-0.5">
                              #{sale.id.slice(0, 8)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-700">{sale.cashier_name}</td>
                          <td className="py-3.5 px-4 text-slate-600">{sale.branch_name || 'Main'}</td>
                          <td className="py-3.5 px-4 text-slate-600">{sale.customer_name || '-'}</td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black border ${badge.className}`}>
                              <BadgeIcon className="w-3 h-3" />
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-black text-gray-900 text-sm">
                              {formatCurrency(sale.total_amount)}
                            </div>
                            <div className={`text-[10px] font-bold mt-0.5 ${saleProfit < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                              Profit: {formatCurrency(saleProfit)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => toggleExpand(sale.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              <span>{sale.items?.length || 0}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && sale.items && sale.items.length > 0 && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={7} className="px-6 py-3">
                              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs max-w-xl space-y-2">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Line Items</span>
                                <div className="divide-y divide-slate-100">
                                  {sale.items.map(item => (
                                    <div key={item.id} className="py-1.5 flex justify-between items-center text-xs">
                                      <span className="text-slate-800 font-medium">
                                        {item.quantity}x {item.product_name} <span className="text-slate-400 text-[10px]">(@ {formatCurrency(item.unit_price)})</span>
                                      </span>
                                      <span className="font-bold text-gray-900">{formatCurrency(item.total)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        No sales transactions found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
