import React, { useState, useMemo } from 'react';
import { 
  DollarSign, TrendingUp, ShoppingCart, AlertTriangle, 
  Layers, Users, ArrowRight, Calendar 
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, CartesianGrid, 
  XAxis, YAxis, Tooltip, Legend, Line 
} from 'recharts';
import { formatCurrency } from '../../utils/format';
import { SaleWithItems, Product } from '../../types';

interface SalesAnalytics {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalSalesCount: number;
  lowStockCount: number;
  salesOverTime: Array<{
    date: string;
    revenue: number;
    profit: number;
    count: number;
  }>;
  categorySales: Array<{
    category: string;
    value: number;
  }>;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

interface OverviewTabProps {
  displaySales: SaleWithItems[];
  displayProducts: Product[];
  products: Product[];
  cashierPerformanceList: any[]; // Or define proper type
  maxCashierRevenue: number;
  setActiveTab: (tab: any) => void;
}

export default function OverviewTab({
  displaySales,
  displayProducts,
  products,
  cashierPerformanceList,
  maxCashierRevenue,
  setActiveTab
}: OverviewTabProps) {
  const [profitTimeframe, setProfitTimeframe] = useState<'7d' | '30d' | '6m' | '12m' | 'custom'>('7d');
  const [customStartMonth, setCustomStartMonth] = useState<string>('');
  const [customEndMonth, setCustomEndMonth] = useState<string>('');

  const analytics = useMemo((): SalesAnalytics => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalSalesCount = displaySales.length;

    displaySales.forEach(sale => {
      totalRevenue += Number(sale.total_amount) || 0;
      (sale.items || []).forEach(item => {
        totalCost += (Number(item.unit_cost) || 0) * (Number(item.quantity) || 0);
      });
    });

    const totalProfit = totalRevenue - totalCost;
    const lowStockCount = displayProducts.filter(p => {
      const isTracked = p.use_stock !== false && (p.use_stock as unknown) !== 'false';
      return isTracked && (Number(p.stock) || 0) <= (p.min_stock_level ?? 5);
    }).length;

    const categoryMap: { [key: string]: number } = {};
    displaySales.forEach(sale => {
      (sale.items || []).forEach(item => {
        const prod = products.find(p => p.id === item.product_id);
        const cat = prod?.category || 'Uncategorized';
        categoryMap[cat] = (categoryMap[cat] || 0) + (Number(item.total) || 0);
      });
    });

    const categorySales = Object.entries(categoryMap).map(([category, value]) => ({
      category,
      value: Number(value.toFixed(2))
    })).sort((a, b) => b.value - a.value);

    let salesOverTime: Array<{ date: string; revenue: number; profit: number; count: number }> = [];

    if (profitTimeframe === '7d' || profitTimeframe === '30d') {
      const daysCount = profitTimeframe === '7d' ? 7 : 30;
      const daysList = Array.from({ length: daysCount }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const salesMapOverTime: { [key: string]: { revenue: number; profit: number; count: number } } = {};
      daysList.forEach(date => {
        salesMapOverTime[date] = { revenue: 0, profit: 0, count: 0 };
      });

      displaySales.forEach(sale => {
        const dateStr = sale.created_at ? sale.created_at.split('T')[0] : '';
        if (salesMapOverTime[dateStr]) {
          salesMapOverTime[dateStr].revenue += Number(sale.total_amount) || 0;
          salesMapOverTime[dateStr].count += 1;
          let saleCost = 0;
          (sale.items || []).forEach(item => {
            saleCost += (Number(item.unit_cost) || 0) * (Number(item.quantity) || 0);
          });
          salesMapOverTime[dateStr].profit += (Number(sale.total_amount) || 0) - saleCost;
        }
      });

      salesOverTime = Object.entries(salesMapOverTime).map(([date, data]) => {
        const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          date: formattedDate,
          revenue: Number(data.revenue.toFixed(2)),
          profit: Number(data.profit.toFixed(2)),
          count: data.count
        };
      });
    } else {
      const now = new Date();
      const monthsCount = profitTimeframe === '6m' ? 6 : (profitTimeframe === '12m' ? 12 : 0);
      let monthsKeys: string[] = [];

      if (monthsCount > 0) {
        for (let i = monthsCount - 1; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          monthsKeys.push(`${y}-${m}`);
        }
      } else {
        const set = new Set<string>();
        displaySales.forEach(s => {
          if (s.created_at) set.add(s.created_at.slice(0, 7));
        });
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        set.add(currentKey);
        monthsKeys = Array.from(set).sort();
        if (customStartMonth) monthsKeys = monthsKeys.filter(k => k >= customStartMonth);
        if (customEndMonth) monthsKeys = monthsKeys.filter(k => k <= customEndMonth);
      }

      const salesMapOverTime: { [key: string]: { revenue: number; profit: number; count: number } } = {};
      monthsKeys.forEach(k => {
        salesMapOverTime[k] = { revenue: 0, profit: 0, count: 0 };
      });

      displaySales.forEach(sale => {
        const mKey = sale.created_at ? sale.created_at.slice(0, 7) : '';
        if (salesMapOverTime[mKey]) {
          salesMapOverTime[mKey].revenue += Number(sale.total_amount) || 0;
          salesMapOverTime[mKey].count += 1;
          let saleCost = 0;
          (sale.items || []).forEach(item => {
            saleCost += (Number(item.unit_cost) || 0) * (Number(item.quantity) || 0);
          });
          salesMapOverTime[mKey].profit += (Number(sale.total_amount) || 0) - saleCost;
        }
      });

      salesOverTime = Object.entries(salesMapOverTime).map(([mKey, data]) => {
        const [y, m] = mKey.split('-');
        const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        return {
          date: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          revenue: Number(data.revenue.toFixed(2)),
          profit: Number(data.profit.toFixed(2)),
          count: data.count
        };
      });
    }

    // Top Selling Products
    const productSalesMap: { [key: string]: { quantity: number; revenue: number } } = {};
    displaySales.forEach(sale => {
      sale.items.forEach(item => {
        if (!productSalesMap[item.product_name]) {
          productSalesMap[item.product_name] = { quantity: 0, revenue: 0 };
        }
        productSalesMap[item.product_name].quantity += item.quantity;
        productSalesMap[item.product_name].revenue += item.total;
      });
    });

    const topProducts = Object.entries(productSalesMap).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      revenue: Number(data.revenue.toFixed(2))
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalSalesCount,
      lowStockCount,
      salesOverTime,
      categorySales,
      topProducts
    };
  }, [displaySales, displayProducts, products, profitTimeframe, customStartMonth, customEndMonth]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {[
          { label: 'Total Revenue', value: formatCurrency(analytics.totalRevenue), icon: DollarSign, isError: false },
          { label: 'Gross Profit', value: formatCurrency(analytics.totalProfit), icon: TrendingUp, isError: analytics.totalProfit < 0, isAction: true },
          { label: 'Sales Transacted', value: `${analytics.totalSalesCount} Orders`, icon: ShoppingCart, isError: false },
          { label: 'Low Stock', value: `${analytics.lowStockCount} Items`, icon: AlertTriangle, isError: analytics.lowStockCount > 0 },
        ].map((card, i) => (
          <div 
            key={i} 
            onClick={card.isAction ? () => setActiveTab('sale-report') : undefined}
            className={`bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-premium flex items-center justify-between card-hover ${card.isAction ? 'cursor-pointer hover:border-black/50' : ''}`}
            title={card.isAction ? 'View detailed monthly profit analysis' : undefined}
          >
            <div className="min-w-0">
              <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold block truncate">
                {card.label}
                {card.isAction && <span className="ml-1 text-black font-extrabold">→</span>}
              </span>
              <h3 className={`text-sm sm:text-lg md:text-xl font-extrabold mt-1 truncate ${card.isError ? 'text-red-600' : 'text-slate-900'}`}>
                {card.value}
              </h3>
            </div>
            <div className="p-2 sm:p-3 rounded-xl shrink-0 ml-1 shadow-sm bg-gray-50 text-gray-900">
              <card.icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-sm text-slate-800">Sales & Gross Profit Performance</h4>
                <p className="text-[10px] text-slate-400">
                  {profitTimeframe === '7d' && 'Past 7 days revenue and profit trends'}
                  {profitTimeframe === '30d' && 'Past 30 days revenue and profit trends'}
                  {profitTimeframe === '6m' && 'Past 6 months revenue and profit breakdown'}
                  {profitTimeframe === '12m' && 'Past 12 months revenue and profit breakdown'}
                  {profitTimeframe === 'custom' && 'Selected months revenue and profit breakdown'}
                </p>
              </div>

              <button
                onClick={() => setActiveTab('sale-report')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-black transition-colors self-start sm:self-auto cursor-pointer"
              >
                <span>Full Profit Analysis</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
              {(['7d', '30d', '6m', '12m', 'custom'] as const).map(tf => {
                const label = tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : tf === '6m' ? '6 Months' : tf === '12m' ? '12 Months' : 'Custom Range';
                return (
                  <button
                    key={tf}
                    onClick={() => setProfitTimeframe(tf)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      profitTimeframe === tf 
                        ? 'bg-black text-white' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              {profitTimeframe === 'custom' && (
                <div className="flex items-center gap-1.5 ml-auto text-xs">
                  <input
                    type="month"
                    value={customStartMonth}
                    onChange={(e) => setCustomStartMonth(e.target.value)}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                  />
                  <span className="text-slate-400 text-xs">to</span>
                  <input
                    type="month"
                    value={customEndMonth}
                    onChange={(e) => setCustomEndMonth(e.target.value)}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.salesOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="date" 
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
                  tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-800">
                          <p className="font-bold text-slate-300 text-[11px] border-b border-slate-800 pb-1 mb-1">
                            📅 {label}
                          </p>
                          {payload.map((entry: any, index: number) => (
                            <div key={index} className="flex items-center justify-between gap-4 font-semibold">
                              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                {entry.name}:
                              </span>
                              <span className="text-white font-mono font-bold">
                                {formatCurrency(Number(entry.value))}
                              </span>
                            </div>
                          ))}
                          {payload[0]?.payload?.count !== undefined && (
                            <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                              Orders Completed: <span className="text-slate-200 font-bold">{payload[0].payload.count} sales</span>
                            </p>
                          )}
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
                  stroke="#111827" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#111827', stroke: '#ffffff', strokeWidth: 2 }} 
                  activeDot={{ r: 7, fill: '#111827', stroke: '#ffffff', strokeWidth: 2 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="profit" 
                  name="Gross Profit" 
                  stroke="#6b7280" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6b7280', stroke: '#ffffff', strokeWidth: 2 }} 
                  activeDot={{ r: 7, fill: '#6b7280', stroke: '#ffffff', strokeWidth: 2 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Products List */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-sm text-slate-800">Top Selling Products</h4>
            <p className="text-[10px] text-slate-400 mb-5">Ranked by overall gross sales volume</p>

            {analytics.topProducts.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">No product sales logged yet.</div>
            ) : (
              <div className="space-y-4">
                {analytics.topProducts.map((prod, idx) => {
                  const maxRev = Math.max(...analytics.topProducts.map(p => p.revenue), 1);
                  const percent = (prod.revenue / maxRev) * 100;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[150px]">{prod.name}</span>
                        <span className="font-bold text-slate-900">{formatCurrency(prod.revenue)} <span className="font-normal text-[10px] text-slate-400">({prod.quantity} sold)</span></span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-black h-full rounded-full transition-all duration-500" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Low Inventory Alerts:</span>
              <span className={`font-bold px-2 py-0.5 rounded ${analytics.lowStockCount > 0 ? 'bg-gray-100 text-gray-900' : 'bg-slate-100 text-slate-600'}`}>
                {analytics.lowStockCount} items
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row - Category Sales & Cashier Leaderboard */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Category Sales */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm">
          <h4 className="font-bold text-sm text-slate-800 mb-5 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span>Product Category Revenue breakdown</span>
          </h4>
          {analytics.categorySales.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">No category analytics recorded yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {analytics.categorySales.map((cat, idx) => {
                const totalCatSum = analytics.categorySales.reduce((sum, c) => sum + c.value, 0);
                const percent = ((cat.value / totalCatSum) * 100).toFixed(1);
                const colors = ['bg-black', 'bg-black', 'bg-black', 'bg-black', 'bg-black', 'bg-black'];
                const bgCol = colors[idx % colors.length];

                return (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 truncate">{cat.category}</span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <h5 className="font-extrabold text-slate-900 text-xs sm:text-sm">{formatCurrency(cat.value)}</h5>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${bgCol}`}>{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cashier Sales Leaderboard */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-900" />
                <span>Cashier Sales Leaderboard</span>
              </h4>
              <button
                onClick={() => setActiveTab('cashiers')}
                className="text-[11px] font-semibold text-gray-900 hover:text-gray-900 transition-colors"
              >
                View All →
              </button>
            </div>

            {cashierPerformanceList.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">No cashier sales recorded yet.</div>
            ) : (
              <div className="space-y-3.5">
                {cashierPerformanceList.slice(0, 4).map((perf, idx) => {
                  const percent = maxCashierRevenue > 0 ? (perf.totalRevenue / maxCashierRevenue) * 100 : 0;
                  const medal = idx === 0 ? '🏆' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

                  return (
                    <div key={perf.cashier.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100/80 flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="text-xs font-bold w-6 text-center text-slate-500 shrink-0">{medal}</span>
                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-900 font-bold text-xs flex items-center justify-center shrink-0">
                          {perf.cashier.name ? perf.cashier.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2) : 'C'}
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-bold text-slate-900 text-xs truncate">{perf.cashier.name}</h5>
                          <p className="text-[10px] text-slate-400 font-medium">{perf.totalTransactions} Sales • {perf.totalItemsSold} Items</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-slate-900 text-xs block">{formatCurrency(perf.totalRevenue)}</span>
                        <div className="w-20 bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden ml-auto">
                          <div className="bg-black h-full rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
