import React, { useState, useMemo } from 'react';
import { SaleWithItems, Branch, UserProfile } from '../types';
import { formatCurrency } from '../utils/format';
import { useToast } from '../utils/toast';
import { exportSalesReportToXlsx } from '../utils/excelExport';
import { 
  Receipt, Filter, ChevronDown, ChevronUp, Search, 
  Building2, Users, Calendar, X, RotateCcw, 
  CreditCard, Wallet, Banknote, User, FileSpreadsheet
} from 'lucide-react';

import FilterDrawer from './FilterDrawer';

interface SaleReportTabProps {
  sales: SaleWithItems[];
  branches: Branch[];
  cashiers: UserProfile[];
  currency: string;
}

export default function SaleReportTab({ sales, branches, cashiers, currency }: SaleReportTabProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'this-month' | 'last-month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
    if (branchFilter !== 'all') count++;
    if (cashierFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [dateFilter, branchFilter, cashierFilter, searchQuery]);

  const resetFilters = () => {
    setDateFilter('all');
    setStartDate('');
    setEndDate('');
    setBranchFilter('all');
    setCashierFilter('all');
    setSearchQuery('');
  };

  const filteredSales = useMemo(() => {
    let result = sales;

    if (dateFilter !== 'all') {
      const now = new Date();
      if (dateFilter === 'this-month') {
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
  }, [sales, dateFilter, startDate, endDate, branchFilter, cashierFilter, searchQuery]);

  const totalAmount = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.total_amount, 0);
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-black" />
            Sale Report
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs sm:text-sm text-slate-500">Comprehensive transactions & revenue report</p>
            <div className="h-4 w-px bg-slate-300"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Sales</span>
              <span className="text-sm sm:text-base font-black text-black">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportXlsx}
            disabled={isExporting || filteredSales.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            title="Export sales report to Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>{isExporting ? 'Exporting...' : 'Export XLSX'}</span>
          </button>

          <button 
            onClick={() => setShowFilters(true)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeFilterCount > 0 
                ? 'bg-black text-white border-black shadow-xs' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <FilterDrawer
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="Sale Report Filters"
        subtitle="Filter transactions by date, branch & cashier"
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
                placeholder="ID, Customer, Cashier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Date Range</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDateFilter('all')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                  dateFilter === 'all' ? 'bg-black text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => setDateFilter('this-month')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                  dateFilter === 'this-month' ? 'bg-black text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setDateFilter('last-month')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                  dateFilter === 'last-month' ? 'bg-black text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Last Month
              </button>
              <button
                onClick={() => setDateFilter('custom')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                  dateFilter === 'custom' ? 'bg-black text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>

          {dateFilter === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Start Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">End Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                  />
                </div>
              </div>
            </div>
          )}

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

      <div className="space-y-3 sm:hidden">
        {filteredSales.map(sale => {
          const badge = getPaymentBadge(sale.payment_method);
          const BadgeIcon = badge.icon;
          const isExpanded = expandedSaleId === sale.id;

          return (
            <div key={sale.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    #{sale.id.slice(0, 8)}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(sale.created_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${badge.className}`}>
                  <BadgeIcon className="w-3 h-3" />
                  {badge.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">CASHIER</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3 text-slate-400" />
                    {sale.cashier_name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">BRANCH</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    {sale.branch_name || 'Main'}
                  </span>
                </div>
              </div>

              {sale.customer_name && (
                <div className="text-xs bg-slate-50 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-bold block">CUSTOMER</span>
                  <span className="font-semibold text-slate-800">{sale.customer_name}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">TOTAL AMOUNT</span>
                  <span className="text-base font-black text-gray-900">{formatCurrency(sale.total_amount)}</span>
                </div>

                <button
                  onClick={() => toggleExpand(sale.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>{sale.items?.length || 0} items</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {isExpanded && sale.items && sale.items.length > 0 && (
                <div className="pt-2 border-t border-slate-100 bg-slate-50 p-3 rounded-xl space-y-2">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Items Purchased</span>
                  <div className="space-y-1.5">
                    {sale.items.map(item => (
                      <div key={item.id} className="flex justify-between items-center text-xs">
                        <span className="text-slate-700 font-medium truncate max-w-[180px]">
                          {item.quantity}x {item.product_name}
                        </span>
                        <span className="font-bold text-slate-900">{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredSales.length === 0 && (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-500">No sales transactions found</p>
            <p className="text-[10px] text-slate-400">Try adjusting your date or filter options</p>
          </div>
        )}
      </div>

      <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            {filteredSales.length} Transactions Found
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-gray-900">Total: {formatCurrency(totalAmount)}</span>
            <button
              onClick={handleExportXlsx}
              disabled={isExporting || filteredSales.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              title="Export sales report to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
              <span>Export XLSX</span>
            </button>
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
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredSales.map(sale => {
                const badge = getPaymentBadge(sale.payment_method);
                const BadgeIcon = badge.icon;
                const isExpanded = expandedSaleId === sale.id;

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
                      <td className="py-3.5 px-4 text-right font-black text-gray-900 text-sm">
                        {formatCurrency(sale.total_amount)}
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
    </div>
  );
}
