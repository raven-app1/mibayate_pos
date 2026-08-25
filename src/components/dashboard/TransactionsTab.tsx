import React, { useState, useMemo } from 'react';
import { Search, Filter, Building2, Tag } from 'lucide-react';
import { usePosStore } from '../../store/usePosStore';
import { UserProfile } from '../../types';
import FilterDrawer from '../FilterDrawer';

interface TransactionsTabProps {
  user: UserProfile;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
}

export default function TransactionsTab({
  user,
  selectedBranchId,
  setSelectedBranchId
}: TransactionsTabProps) {
  const { branches, transactions } = usePosStore();
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (txSearch.trim()) count++;
    if (txTypeFilter !== 'all') count++;
    if (selectedBranchId !== 'all') count++;
    return count;
  }, [txSearch, txTypeFilter, selectedBranchId]);

  const resetFilters = () => {
    setTxSearch('');
    setTxTypeFilter('all');
    if (user.role !== 'manager') {
      setSelectedBranchId('all');
    }
  };

  const displayTxs = useMemo(() => {
    return selectedBranchId === 'all'
      ? transactions
      : transactions.filter(t => t.branch_id === selectedBranchId);
  }, [transactions, selectedBranchId]);

  const filteredTxs = useMemo(() => {
    const q = (txSearch || '').trim().toLowerCase();
    return displayTxs.filter(tx => {
      if (!tx) return false;
      const matchesSearch = !q ||
             (tx.product_name || '').toLowerCase().includes(q) ||
             (tx.performed_by || '').toLowerCase().includes(q) ||
             (tx.notes || '').toLowerCase().includes(q) ||
             (tx.type || '').toLowerCase().includes(q);
      const matchesType = txTypeFilter === 'all' || tx.type === txTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [displayTxs, txSearch, txTypeFilter]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute inset-y-0 left-0 pl-3 w-4 h-4 my-auto text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search product, staff, notes..."
            value={txSearch}
            onChange={(e) => setTxSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-gray-900 shadow-2xs transition-colors"
          />
        </div>

        <button
          onClick={() => setShowFilters(true)}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-2xs shrink-0 ${
            activeFilterCount > 0
              ? 'bg-black text-white border-black'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-4.5 h-4.5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <FilterDrawer
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="Audit Log Filters"
        subtitle="Filter activity logs by keyword, type & branch"
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
                placeholder="Product, staff, action, or notes..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> Action Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'all', label: 'All Types' },
                { val: 'stock-in', label: 'Stock In' },
                { val: 'stock-out', label: 'Stock Out' },
                { val: 'sale', label: 'Sale' }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setTxTypeFilter(opt.val)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                    txTypeFilter === opt.val
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {user.role !== 'manager' && branches.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Branch
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-medium text-slate-800 text-xs focus:outline-none focus:border-black focus:bg-white cursor-pointer"
              >
                <option value="all">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </FilterDrawer>

      {/* Audit Logs Mobile Cards & Desktop Table */}
      <div className="p-4 sm:p-0">
        {filteredTxs.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs">No audit logs recorded matching search queries.</div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="grid grid-cols-1 gap-3 sm:hidden pb-4">
              {filteredTxs.map((tx) => {
                const isAdd = tx.type === 'stock-in';
                const isSub = tx.type === 'stock-out' || tx.type === 'sale';

                return (
                  <div key={tx.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(tx.created_at).toLocaleString()}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                        tx.type === 'stock-in'
                          ? 'bg-gray-100 text-gray-900'
                          : tx.type === 'sale'
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-gray-100 text-gray-900'
                      }`}>
                        {tx.type}
                      </span>
                    </div>

                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-900 text-xs">{tx.product_name}</h4>
                      <span className={`font-mono font-bold text-xs shrink-0 ${
                        isAdd ? 'text-gray-900' : isSub ? 'text-gray-900' : 'text-slate-600'
                      }`}>
                        {isAdd ? '+' : '-'}{tx.quantity} units
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px]">
                      <span className="text-slate-500">By: <strong className="text-slate-700">{tx.performed_by}</strong></span>
                      <span className="text-slate-500 italic truncate max-w-[180px]">{tx.notes}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 uppercase font-bold tracking-wider">
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Action</th>
                    <th className="p-4 text-center">Qty Shift</th>
                    <th className="p-4">Performed By</th>
                    <th className="p-4">Audit Description Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTxs.map((tx) => {
                    const isAdd = tx.type === 'stock-in';
                    const isSub = tx.type === 'stock-out' || tx.type === 'sale';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-slate-400 whitespace-nowrap font-mono text-[10px]">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td className="p-4 font-bold text-slate-900">{tx.product_name}</td>
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            tx.type === 'stock-in'
                              ? 'bg-gray-100 text-gray-900'
                              : tx.type === 'sale'
                                ? 'bg-gray-100 text-gray-900'
                                : 'bg-gray-100 text-gray-900'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`font-mono font-bold ${
                            isAdd ? 'text-gray-900' : isSub ? 'text-gray-900' : 'text-slate-600'
                          }`}>
                            {isAdd ? '+' : '-'}{tx.quantity} units
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-700">{tx.performed_by}</td>
                        <td className="p-4 text-slate-500 italic max-w-xs truncate">{tx.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
