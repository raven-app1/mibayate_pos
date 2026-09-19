import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Calendar, Filter, 
  Download, ChevronDown, ChevronUp, Building2, Users, 
  Layers, BarChart3, LineChart as LineChartIcon, Package, ArrowUpDown
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, LineChart, CartesianGrid, 
  XAxis, YAxis, Tooltip, Legend, Bar, Line 
} from 'recharts';
import { SaleWithItems, Branch, UserProfile } from '../../types';
import { formatCurrency, formatCompactCurrency } from '../../utils/format';
import { exportMonthlyProfitToXlsx } from '../../utils/excelExport';
import { useToast } from '../../utils/toast';

interface MonthlyProfitViewProps {
  sales: SaleWithItems[];
  branches: Branch[];
  cashiers: UserProfile[];
  currency?: string;
  initialPreset?: 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'last-12-months' | 'this-year' | 'all' | 'custom';
}

interface MonthData {
  monthKey: string;
  monthLabel: string;
  fullMonthLabel: string;
  year: number;
  monthNum: number;
  ordersCount: number;
  itemsCount: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    day: number;
    revenue: number;
    cost: number;
    profit: number;
    orders: number;
  }>;
}

export default function MonthlyProfitView({
  sales,
  branches,
  cashiers,
  initialPreset = 'last-6-months'
}: MonthlyProfitViewProps) {
  const { toast } = useToast();
  const [preset, setPreset] = useState<'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'last-12-months' | 'this-year' | 'all' | 'custom'>(initialPreset);
  const [selectedSpecificMonth, setSelectedSpecificMonth] = useState<string>('all');
  const [startMonth, setStartMonth] = useState<string>('');
  const [endMonth, setEndMonth] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [cashierFilter, setCashierFilter] = useState<string>('all');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'profit-desc' | 'revenue-desc' | 'margin-desc'>('date-desc');
  const [isExporting, setIsExporting] = useState(false);

  const availableMonthsList = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(sale => {
      if (sale.created_at) {
        set.add(sale.created_at.slice(0, 7));
      }
    });
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    set.add(currentKey);
    return Array.from(set).sort().reverse();
  }, [sales]);

  const allMonthlyAggregates = useMemo(() => {
    const map = new Map<string, {
      monthKey: string;
      ordersCount: number;
      itemsCount: number;
      revenue: number;
      cost: number;
      productMap: Map<string, { quantity: number; revenue: number; cost: number }>;
      dailyMap: Map<string, { revenue: number; cost: number; orders: number }>;
    }>();

    sales.forEach(sale => {
      if (branchFilter !== 'all' && sale.branch_id !== branchFilter) return;
      if (cashierFilter !== 'all' && sale.cashier_id !== cashierFilter) return;

      const dateStr = sale.created_at ? sale.created_at.slice(0, 10) : '';
      const mKey = dateStr ? dateStr.slice(0, 7) : '';
      if (!mKey) return;

      if (!map.has(mKey)) {
        map.set(mKey, {
          monthKey: mKey,
          ordersCount: 0,
          itemsCount: 0,
          revenue: 0,
          cost: 0,
          productMap: new Map(),
          dailyMap: new Map()
        });
      }

      const rec = map.get(mKey)!;
      rec.ordersCount += 1;
      rec.revenue += Number(sale.total_amount) || 0;

      let saleCost = 0;
      let saleItemsCount = 0;

      (sale.items || []).forEach(item => {
        const qty = Number(item.quantity) || 0;
        const uCost = Number(item.unit_cost) || 0;
        const iTotal = Number(item.total) || 0;
        const iCost = uCost * qty;

        saleCost += iCost;
        saleItemsCount += qty;

        const pName = item.product_name || 'Unknown Product';
        if (!rec.productMap.has(pName)) {
          rec.productMap.set(pName, { quantity: 0, revenue: 0, cost: 0 });
        }
        const pRec = rec.productMap.get(pName)!;
        pRec.quantity += qty;
        pRec.revenue += iTotal;
        pRec.cost += iCost;
      });

      rec.cost += saleCost;
      rec.itemsCount += saleItemsCount;

      if (dateStr) {
        if (!rec.dailyMap.has(dateStr)) {
          rec.dailyMap.set(dateStr, { revenue: 0, cost: 0, orders: 0 });
        }
        const dRec = rec.dailyMap.get(dateStr)!;
        dRec.revenue += Number(sale.total_amount) || 0;
        dRec.cost += saleCost;
        dRec.orders += 1;
      }
    });

    const result: MonthData[] = [];
    map.forEach((value, key) => {
      const [yearStr, monthStr] = key.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const dateObj = new Date(y, m - 1, 1);

      const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const fullMonthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const profit = value.revenue - value.cost;
      const marginPercent = value.revenue > 0 ? (profit / value.revenue) * 100 : 0;

      const topProducts = Array.from(value.productMap.entries()).map(([name, p]) => {
        const pProfit = p.revenue - p.cost;
        const pMargin = p.revenue > 0 ? (pProfit / p.revenue) * 100 : 0;
        return {
          name,
          quantity: p.quantity,
          revenue: Number(p.revenue.toFixed(2)),
          cost: Number(p.cost.toFixed(2)),
          profit: Number(pProfit.toFixed(2)),
          margin: Number(pMargin.toFixed(1))
        };
      }).sort((a, b) => b.profit - a.profit).slice(0, 5);

      const dailyBreakdown = Array.from(value.dailyMap.entries()).map(([dStr, d]) => {
        const dayNum = parseInt(dStr.slice(8, 10), 10) || 1;
        const dProfit = d.revenue - d.cost;
        return {
          date: dStr,
          day: dayNum,
          revenue: Number(d.revenue.toFixed(2)),
          cost: Number(d.cost.toFixed(2)),
          profit: Number(dProfit.toFixed(2)),
          orders: d.orders
        };
      }).sort((a, b) => a.day - b.day);

      result.push({
        monthKey: key,
        monthLabel,
        fullMonthLabel,
        year: y,
        monthNum: m,
        ordersCount: value.ordersCount,
        itemsCount: value.itemsCount,
        revenue: Number(value.revenue.toFixed(2)),
        cost: Number(value.cost.toFixed(2)),
        profit: Number(profit.toFixed(2)),
        marginPercent: Number(marginPercent.toFixed(1)),
        topProducts,
        dailyBreakdown
      });
    });

    return result.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [sales, branchFilter, cashierFilter]);

  const filteredMonthData = useMemo(() => {
    let list = [...allMonthlyAggregates];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (selectedSpecificMonth !== 'all') {
      list = list.filter(m => m.monthKey === selectedSpecificMonth);
      return list;
    }

    if (preset === 'this-month') {
      const currentKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      list = list.filter(m => m.monthKey === currentKey);
    } else if (preset === 'last-month') {
      const prevDate = new Date(currentYear, currentMonth - 2, 1);
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      list = list.filter(m => m.monthKey === prevKey);
    } else if (preset === 'last-3-months') {
      const minDate = new Date(currentYear, currentMonth - 3, 1);
      const minKey = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}`;
      list = list.filter(m => m.monthKey >= minKey);
    } else if (preset === 'last-6-months') {
      const minDate = new Date(currentYear, currentMonth - 6, 1);
      const minKey = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}`;
      list = list.filter(m => m.monthKey >= minKey);
    } else if (preset === 'last-12-months') {
      const minDate = new Date(currentYear, currentMonth - 12, 1);
      const minKey = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}`;
      list = list.filter(m => m.monthKey >= minKey);
    } else if (preset === 'this-year') {
      list = list.filter(m => m.year === currentYear);
    } else if (preset === 'custom') {
      if (startMonth) {
        list = list.filter(m => m.monthKey >= startMonth);
      }
      if (endMonth) {
        list = list.filter(m => m.monthKey <= endMonth);
      }
    }

    return list;
  }, [allMonthlyAggregates, preset, selectedSpecificMonth, startMonth, endMonth]);

  const sortedTableData = useMemo(() => {
    const list = [...filteredMonthData];
    if (sortBy === 'date-desc') {
      return list.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }
    if (sortBy === 'date-asc') {
      return list.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    }
    if (sortBy === 'profit-desc') {
      return list.sort((a, b) => b.profit - a.profit);
    }
    if (sortBy === 'revenue-desc') {
      return list.sort((a, b) => b.revenue - a.revenue);
    }
    if (sortBy === 'margin-desc') {
      return list.sort((a, b) => b.marginPercent - a.marginPercent);
    }
    return list;
  }, [filteredMonthData, sortBy]);

  const summaryTotals = useMemo(() => {
    const totalRevenue = filteredMonthData.reduce((acc, m) => acc + m.revenue, 0);
    const totalCost = filteredMonthData.reduce((acc, m) => acc + m.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const totalOrders = filteredMonthData.reduce((acc, m) => acc + m.ordersCount, 0);
    const totalItems = filteredMonthData.reduce((acc, m) => acc + m.itemsCount, 0);
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      totalOrders,
      totalItems,
      averageMargin
    };
  }, [filteredMonthData]);

  const currentPeriodLabel = useMemo(() => {
    if (selectedSpecificMonth !== 'all') {
      const match = allMonthlyAggregates.find(m => m.monthKey === selectedSpecificMonth);
      return match ? match.fullMonthLabel : selectedSpecificMonth;
    }
    if (preset === 'this-month') return 'This Month';
    if (preset === 'last-month') return 'Last Month';
    if (preset === 'last-3-months') return 'Last 3 Months';
    if (preset === 'last-6-months') return 'Last 6 Months';
    if (preset === 'last-12-months') return 'Last 12 Months';
    if (preset === 'this-year') return 'This Year';
    if (preset === 'custom') {
      if (startMonth && endMonth) return `${startMonth} to ${endMonth}`;
      if (startMonth) return `From ${startMonth}`;
      if (endMonth) return `Up to ${endMonth}`;
      return 'Custom Range';
    }
    return 'All Time';
  }, [selectedSpecificMonth, preset, startMonth, endMonth, allMonthlyAggregates]);

  const handleExport = () => {
    if (filteredMonthData.length === 0) {
      toast('No monthly profit data to export', 'warning');
      return;
    }
    setIsExporting(true);
    try {
      const exportRows = filteredMonthData.map(m => ({
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        ordersCount: m.ordersCount,
        itemsCount: m.itemsCount,
        revenue: m.revenue,
        cost: m.cost,
        profit: m.profit,
        marginPercent: m.marginPercent
      }));
      exportMonthlyProfitToXlsx(exportRows, currentPeriodLabel);
      toast(`Exported profit report for ${filteredMonthData.length} months`, 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to export profit report to Excel', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExpand = (mKey: string) => {
    setExpandedMonthKey(prev => prev === mKey ? null : mKey);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Period Selection</span>
            <div className="flex items-center gap-2 mt-0.5">
              <Calendar className="w-4 h-4 text-black" />
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                {currentPeriodLabel}
              </h3>
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {filteredMonthData.length} {filteredMonthData.length === 1 ? 'Month' : 'Months'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExport}
              disabled={isExporting || filteredMonthData.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>{isExporting ? 'Exporting...' : 'Export XLSX'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'this-month', label: 'This Month' },
            { id: 'last-month', label: 'Last Month' },
            { id: 'last-3-months', label: 'Last 3M' },
            { id: 'last-6-months', label: 'Last 6M' },
            { id: 'last-12-months', label: 'Last 12M' },
            { id: 'this-year', label: 'This Year' },
            { id: 'all', label: 'All Time' },
            { id: 'custom', label: 'Custom Range' },
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => {
                setPreset(btn.id as any);
                setSelectedSpecificMonth('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                preset === btn.id && selectedSpecificMonth === 'all'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Specific Month
            </label>
            <select
              value={selectedSpecificMonth}
              onChange={(e) => {
                setSelectedSpecificMonth(e.target.value);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white"
            >
              <option value="all">All Months in Range</option>
              {availableMonthsList.map(mKey => {
                const [y, m] = mKey.split('-');
                const label = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return (
                  <option key={mKey} value={mKey}>{label}</option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Branch Filter
            </label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white"
            >
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Cashier Filter
            </label>
            <select
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white"
            >
              <option value="all">All Cashiers</option>
              {cashiers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Sort Table By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white"
            >
              <option value="date-desc">Newest Month First</option>
              <option value="date-asc">Oldest Month First</option>
              <option value="profit-desc">Highest Profit First</option>
              <option value="revenue-desc">Highest Revenue First</option>
              <option value="margin-desc">Highest Margin % First</option>
            </select>
          </div>
        </div>

        {preset === 'custom' && selectedSpecificMonth === 'all' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">From Month</label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">To Month</label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold block truncate">
            Total Revenue
          </span>
          <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate">
            {formatCurrency(summaryTotals.totalRevenue)}
          </h3>
          <span className="text-[10px] text-slate-400 block mt-0.5">Gross sales volume</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold block truncate">
            Cost of Goods (COGS)
          </span>
          <h3 className="text-base sm:text-lg font-black text-slate-700 mt-1 truncate">
            {formatCurrency(summaryTotals.totalCost)}
          </h3>
          <span className="text-[10px] text-slate-400 block mt-0.5">Total product costs</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold block truncate">
            Gross Profit
          </span>
          <h3 className={`text-base sm:text-lg font-black mt-1 truncate ${summaryTotals.totalProfit < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {formatCurrency(summaryTotals.totalProfit)}
          </h3>
          <span className="text-[10px] text-slate-400 block mt-0.5">Revenue minus costs</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold block truncate">
            Profit Margin
          </span>
          <h3 className={`text-base sm:text-lg font-black mt-1 truncate ${summaryTotals.averageMargin < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {summaryTotals.averageMargin.toFixed(1)}%
          </h3>
          <span className="text-[10px] text-slate-400 block mt-0.5">Average margin</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold block truncate">
            Volume Sold
          </span>
          <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate">
            {summaryTotals.totalOrders} Orders
          </h3>
          <span className="text-[10px] text-slate-400 block mt-0.5">{summaryTotals.totalItems} total items</span>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-black" />
              Monthly Revenue vs Gross Profit Comparison
            </h4>
            <p className="text-[11px] text-slate-400">
              Visualizing month-by-month profit performance across {filteredMonthData.length} months
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setChartType('bar')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartType === 'bar' ? 'bg-white text-black shadow-xs' : 'text-slate-600 hover:text-black'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Bar Chart</span>
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartType === 'line' ? 'bg-white text-black shadow-xs' : 'text-slate-600 hover:text-black'
              }`}
            >
              <LineChartIcon className="w-3.5 h-3.5" />
              <span>Line Chart</span>
            </button>
          </div>
        </div>

        {filteredMonthData.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No sales transactions found for the selected month range.
          </div>
        ) : (
          <div className="w-full h-72 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={filteredMonthData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => formatCompactCurrency(val)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const mData = payload[0]?.payload as MonthData;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-800 min-w-[200px]">
                            <p className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1">
                              {mData?.fullMonthLabel || label}
                            </p>
                            <div className="flex justify-between items-center text-slate-300">
                              <span>Revenue:</span>
                              <span className="font-bold text-white">{formatCurrency(mData?.revenue)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300">
                              <span>Cost of Goods:</span>
                              <span className="font-bold text-slate-300">{formatCurrency(mData?.cost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                              <span>Gross Profit:</span>
                              <span className={`font-black ${mData?.profit < 0 ? 'text-red-400' : 'text-white'}`}>
                                {formatCurrency(mData?.profit)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-slate-400 text-[10px]">
                              <span>Profit Margin:</span>
                              <span className="font-bold text-slate-200">{mData?.marginPercent}%</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-400 text-[10px]">
                              <span>Orders Completed:</span>
                              <span className="font-bold text-slate-200">{mData?.ordersCount} orders</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="revenue" fill="#0f172a" name="Revenue" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" fill="#94a3b8" name="Cost of Goods" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="#475569" name="Gross Profit" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={filteredMonthData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => formatCompactCurrency(val)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const mData = payload[0]?.payload as MonthData;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-800 min-w-[200px]">
                            <p className="font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1">
                              {mData?.fullMonthLabel || label}
                            </p>
                            <div className="flex justify-between items-center text-slate-300">
                              <span>Revenue:</span>
                              <span className="font-bold text-white">{formatCurrency(mData?.revenue)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300">
                              <span>Cost of Goods:</span>
                              <span className="font-bold text-slate-300">{formatCurrency(mData?.cost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                              <span>Gross Profit:</span>
                              <span className={`font-black ${mData?.profit < 0 ? 'text-red-400' : 'text-white'}`}>
                                {formatCurrency(mData?.profit)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-slate-400 text-[10px]">
                              <span>Profit Margin:</span>
                              <span className="font-bold text-slate-200">{mData?.marginPercent}%</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#0f172a"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#0f172a', stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="Cost of Goods"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#94a3b8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Gross Profit"
                    stroke="#475569"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#475569', stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
              Monthly Profit & Loss Breakdown
            </span>
            <span className="text-[11px] text-slate-500">
              Detailed financials for each month in the selected range
            </span>
          </div>
          <span className="text-xs font-bold text-slate-600">
            Net Gross Profit: <strong className={summaryTotals.totalProfit < 0 ? 'text-red-600' : 'text-slate-900'}>{formatCurrency(summaryTotals.totalProfit)}</strong>
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedTableData.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No monthly profit data available for the chosen filters.
            </div>
          ) : (
            sortedTableData.map(row => {
              const isExpanded = expandedMonthKey === row.monthKey;
              return (
                <div key={row.monthKey} className="transition-colors hover:bg-slate-50/50">
                  <div 
                    onClick={() => toggleExpand(row.monthKey)}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-sm text-slate-900">
                          {row.fullMonthLabel}
                        </h5>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>{row.ordersCount} Orders</span>
                          <span>•</span>
                          <span>{row.itemsCount} Items</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-6 text-right items-center">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Revenue</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatCurrency(row.revenue)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Cost</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-600">
                          {formatCurrency(row.cost)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Profit</span>
                        <span className={`text-xs sm:text-sm font-black ${row.profit < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                          {formatCurrency(row.profit)}
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Margin</span>
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                            row.marginPercent < 0 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-slate-100 text-slate-900'
                          }`}>
                            {row.marginPercent}%
                          </span>
                        </div>
                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-slate-50/80 border-t border-slate-100 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-2 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-black" />
                            Top Profitable Products in {row.monthLabel}
                          </span>
                          {row.topProducts.length === 0 ? (
                            <p className="text-slate-400 text-xs py-2">No product item records</p>
                          ) : (
                            <div className="space-y-2">
                              {row.topProducts.map((p, pIdx) => (
                                <div key={pIdx} className="flex justify-between items-center text-xs">
                                  <div className="truncate max-w-[180px]">
                                    <span className="font-semibold text-slate-800 block truncate">{p.name}</span>
                                    <span className="text-[10px] text-slate-400">{p.quantity} units sold</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-bold text-slate-900 block">{formatCurrency(p.profit)}</span>
                                    <span className="text-[10px] text-slate-500">{p.margin}% margin</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-2 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-black" />
                            Daily Snapshot ({row.dailyBreakdown.length} active days)
                          </span>
                          {row.dailyBreakdown.length === 0 ? (
                            <p className="text-slate-400 text-xs py-2">No daily records logged</p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                              {row.dailyBreakdown.map((d, dIdx) => (
                                <div key={dIdx} className="flex justify-between items-center text-xs py-1 border-b border-slate-100 last:border-0">
                                  <span className="font-mono text-slate-600">Day {d.day}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-slate-500 text-[11px]">{d.orders} ord.</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(d.profit)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
