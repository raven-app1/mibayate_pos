import React, { useState, useMemo } from 'react';
import { Search, FileSpreadsheet, Download, Package, ChevronDown, Printer, Edit2, PackagePlus, Trash2, ChevronLeft, ChevronRight, Filter, Building2, Layers, Camera } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { UserProfile, Branch, Product } from '../../types';
import SearchableCategorySelect from '../SearchableCategorySelect';
import FilterDrawer from '../FilterDrawer';
import BarcodeScannerModal from '../BarcodeScannerModal';
import { useToast } from '../../utils/toast';

interface ProductsTabProps {
  user: UserProfile;
  branches: Branch[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  displayProducts: Product[];
  categories: string[];
  setShowCsvModal: (show: boolean) => void;
  handleExportCsv: () => void;
  openBarcodeModal: (product: Product) => void;
  startEditProduct: (product: Product) => void;
  openQuickRestock: (product: Product) => void;
  triggerDeleteProduct: (id: string, name: string) => void;
}

const PRODUCTS_PER_PAGE = 20;

export default function ProductsTab({
  user,
  branches,
  selectedBranchId,
  setSelectedBranchId,
  displayProducts,
  categories,
  setShowCsvModal,
  handleExportCsv,
  openBarcodeModal,
  startEditProduct,
  openQuickRestock,
  triggerDeleteProduct
}: ProductsTabProps) {
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [productPage, setProductPage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { toast } = useToast();
  const isOwner = user.role === 'owner';

  const handleBarcodeScan = (scannedCode: string) => {
    const raw = (scannedCode || '').trim();
    if (!raw) return;
    const match = displayProducts.find(p =>
      (p.barcode && p.barcode.trim().toLowerCase() === raw.toLowerCase()) ||
      (p.sku && p.sku.trim().toLowerCase() === raw.toLowerCase())
    );
    if (match) {
      setShowScanner(false);
      openQuickRestock(match);
      toast(`Found ${match.name} for restock.`, 'success');
    } else {
      toast(`No product found for barcode: ${scannedCode}`, 'error');
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = productSearch.trim().toLowerCase();
      if (val) {
        const match = displayProducts.find(p =>
          (p.barcode && p.barcode.trim().toLowerCase() === val) ||
          (p.sku && p.sku.trim().toLowerCase() === val)
        );
        if (match) {
          e.preventDefault();
          openQuickRestock(match);
          setProductSearch('');
          setProductPage(1);
          toast(`Found ${match.name} for restock.`, 'success');
        }
      }
    }
  };
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (productSearch.trim()) count++;
    if (categoryFilter !== 'All') count++;
    if (stockFilter !== 'All') count++;
    if (selectedBranchId !== 'all') count++;
    return count;
  }, [productSearch, categoryFilter, stockFilter, selectedBranchId]);

  const resetFilters = () => {
    setProductSearch('');
    setCategoryFilter('All');
    setStockFilter('All');
    if (user.role !== 'manager') {
      setSelectedBranchId('all');
    }
    setProductPage(1);
  };

  const filteredProducts = useMemo(() => {
    const query = (productSearch || '').trim().toLowerCase();
    const list = displayProducts.filter(p => {
      if (!p) return false;
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const category = p.category || '';

      const matchesSearch = !query ||
                            name.includes(query) || 
                            sku.includes(query) ||
                            barcode.includes(query);
      const matchesCategory = categoryFilter === 'All' || category === categoryFilter;
      
      let matchesStock = true;
      const isTracked = p.use_stock !== false && (p.use_stock as unknown) !== 'false';
      const pStock = Number(p.stock) || 0;
      const pMinStock = Number(p.min_stock_level) || 0;
      if (stockFilter === 'Low Stock') {
        matchesStock = isTracked && pStock <= pMinStock && pStock > 0;
      } else if (stockFilter === 'Out of Stock') {
        matchesStock = isTracked && pStock <= 0;
      }
      return matchesSearch && matchesCategory && matchesStock;
    });

    return [...list].sort((a, b) => {
      const isTrackedA = a.use_stock !== false && (a.use_stock as unknown) !== 'false';
      const isTrackedB = b.use_stock !== false && (b.use_stock as unknown) !== 'false';
      const aOutOfStock = isTrackedA && (Number(a.stock) || 0) <= 0;
      const bOutOfStock = isTrackedB && (Number(b.stock) || 0) <= 0;

      if (aOutOfStock !== bOutOfStock) {
        return aOutOfStock ? 1 : -1;
      }
      const cmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      return cmp !== 0 ? cmp : (a.name || '').localeCompare(b.name || '');
    });
  }, [displayProducts, productSearch, categoryFilter, stockFilter]);

  const totalProductPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE) || 1;
  const safeProductPage = Math.min(Math.max(1, productPage), totalProductPages);

  const paginatedProducts = useMemo(() => {
    const startIndex = (safeProductPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [filteredProducts, safeProductPage]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full max-w-full min-w-0">
      <div className="p-3.5 sm:p-5 border-b border-slate-200/90 bg-gradient-to-b from-white to-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 left-0 pl-3 w-4 h-4 my-auto text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Name, SKU, or Barcode..."
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }}
              onKeyDown={handleSearchKeyDown}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-gray-900 shadow-2xs transition-colors"
            />
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="shrink-0 p-2 bg-black hover:bg-gray-800 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Scan barcode to restock"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowFilterDrawer(true)}
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

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={() => setShowCsvModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 font-bold text-[11px] sm:text-xs rounded-xl border border-gray-200/80 transition-all cursor-pointer active:scale-95"
            title="Import inventory items from CSV file"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-900 shrink-0" />
            <span className="truncate">Import CSV</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] sm:text-xs rounded-xl border border-slate-200 transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Export current inventory list to CSV"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />
            <span className="truncate">Export CSV</span>
          </button>
        </div>
      </div>

      {/* HORIZONTAL OUTLET / BRANCH SWITCHER */}
      {branches.length > 0 && (
        <div className="px-3.5 sm:px-5 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-slate-400" /> Outlet:
          </span>
          <button
            onClick={() => { setSelectedBranchId('all'); setProductPage(1); }}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
              selectedBranchId === 'all'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            🏢 All Outlets (Total Stock)
          </button>
          {branches.map(b => {
            const isSelected = selectedBranchId === b.id || 
              (Boolean(selectedBranchId) && Boolean(b.code) && selectedBranchId.toLowerCase() === b.code.toLowerCase()) || 
              (Boolean(selectedBranchId) && Boolean(b.name) && selectedBranchId.toLowerCase() === b.name.toLowerCase());
            return (
              <button
                key={b.id}
                onClick={() => { setSelectedBranchId(b.id); setProductPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                📍 {b.name} <span className="text-[10px] opacity-70 font-mono">({b.code})</span>
              </button>
            );
          })}
        </div>
      )}

      <FilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        title="Product Filters"
        subtitle="Filter inventory by branch, category & stock"
        activeCount={activeFilterCount}
        onReset={resetFilters}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Search Keyword</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Product name, SKU, barcode..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }}
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-black focus:bg-white"
              />
            </div>
          </div>

          {branches.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Branch
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => { setSelectedBranchId(e.target.value); setProductPage(1); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-medium text-slate-800 text-xs focus:outline-none focus:border-black focus:bg-white cursor-pointer"
              >
                <option value="all">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Category
            </label>
            <SearchableCategorySelect
              options={categories.map(cat => ({
                value: cat,
                label: cat,
                count: cat === 'All' ? displayProducts.length : displayProducts.filter(p => p.category === cat).length
              }))}
              value={categoryFilter}
              onChange={(val) => { setCategoryFilter(val); setProductPage(1); }}
              className="w-full"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-slate-400" /> Stock Status
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { val: 'All', label: 'All Stock Levels' },
                { val: 'Low Stock', label: 'Low Stock Warnings' },
                { val: 'Out of Stock', label: 'Out of Stock Only' }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => { setStockFilter(opt.val); setProductPage(1); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-left flex items-center justify-between ${
                    stockFilter === opt.val
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </FilterDrawer>

      {/* Product Table & Mobile Cards */}
      <div className="p-0">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <Package className="w-8 h-8 text-slate-300" />
            <span>No inventory products found matching your search.</span>
            <button
              onClick={() => setShowCsvModal(true)}
              className="mt-2 text-gray-900 font-bold hover:underline flex items-center gap-1"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import CSV Items</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="grid grid-cols-1 gap-3 sm:hidden p-4">
              {paginatedProducts.map((prod) => {
                const isTracked = prod.use_stock !== false && (prod.use_stock as unknown) !== 'false';
                const isLowStock = isTracked && (Number(prod.stock) || 0) <= (prod.min_stock_level ?? 5);
                const isOutOfStock = isTracked && (Number(prod.stock) || 0) <= 0;
                return (
                  <div 
                    key={prod.id} 
                    onClick={() => setExpandedProductId(expandedProductId === prod.id ? null : prod.id)}
                    className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3 cursor-pointer transition-all duration-300 active:scale-[0.98]"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-950 text-xs">{prod.name}</h4>
                        {prod.barcode && <p className="text-[9px] text-slate-400 font-mono">BC: {prod.barcode}</p>}
                      </div>
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] font-semibold text-slate-600 shrink-0">
                        {prod.category}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100">
                      <div>
                        <p className="text-[8px] text-slate-400 uppercase font-bold">Purchased Price</p>
                        <p className="font-mono text-[11px] text-slate-600 font-medium">{formatCurrency(prod.cost)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-400 uppercase font-bold">Unit Price</p>
                        <p className="font-mono text-[11px] text-slate-900 font-bold">{formatCurrency(prod.price)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-400 uppercase font-bold">Stock</p>
                        {(() => {
                          const totalStockAcrossAll = prod.stocks && prod.stocks.length > 0
                            ? prod.stocks.reduce((sum: number, s) => sum + (Number(s.quantity) || 0), 0)
                            : (Number(prod.stock) || 0);

                          const otherBranchesWithStock = prod.stocks?.filter(s => {
                            const qty = Number(s.quantity) || 0;
                            return qty > 0 && s.branch_id !== selectedBranchId;
                          }) || [];

                          return (
                            <div>
                              <span className={`inline-block font-mono text-[10px] font-bold ${
                                !isTracked
                                  ? 'text-slate-600'
                                  : isOutOfStock 
                                    ? (otherBranchesWithStock.length > 0 ? 'text-amber-700' : 'text-red-600') 
                                    : isLowStock 
                                      ? 'text-gray-900' 
                                      : 'text-gray-900'
                              }`}>
                                {!isTracked ? 'Untracked' : `${prod.stock} ${prod.unit_name || 'ခု'}`}
                              </span>
                              {selectedBranchId !== 'all' && otherBranchesWithStock.length > 0 && (
                                <p className="text-[8px] text-slate-500 font-medium leading-tight mt-0.5">
                                  ({totalStockAcrossAll} in other outlets)
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <div className="text-[9px] font-medium">
                        {!isTracked ? (
                          <span className="text-slate-500 font-semibold">Untracked</span>
                        ) : isOutOfStock ? (
                          <span className="text-red-600 font-bold">Reorder Immediately</span>
                        ) : isLowStock ? (
                          <span className="text-gray-900">Low (≤{prod.min_stock_level})</span>
                        ) : (
                          <span className="text-gray-900">Stock OK</span>
                        )}
                      </div>
                      <div className={`text-slate-400 transition-transform duration-300 ${expandedProductId === prod.id ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>

                    <div className={`grid ${isOwner ? 'grid-cols-2' : 'grid-cols-3'} gap-2 overflow-hidden transition-all duration-300 ease-in-out ${expandedProductId === prod.id ? 'max-h-40 opacity-100 mt-3 pt-3 border-t border-slate-100' : 'max-h-0 opacity-0 mt-0 pt-0 border-transparent'}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openBarcodeModal(prod); }}
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[10px] font-bold w-full"
                        title="Print Barcode Label"
                      >
                        <Printer className="w-3.5 h-3.5 text-gray-900" />
                        <span>Barcode</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditProduct(prod); }}
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[10px] font-bold w-full"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openQuickRestock(prod); }}
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[10px] font-bold w-full"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        <span>Restock</span>
                      </button>
                      {isOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); triggerDeleteProduct(prod.id, prod.name); }}
                          className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[10px] font-bold w-full"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Spreadsheet Table View */}
            <div className="hidden sm:block w-full max-w-full overflow-x-auto border-t border-slate-200">
              <table className="w-full text-left text-xs border-collapse font-sans min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider sticky top-0 z-10">
                    <th className="p-2.5 border-r border-slate-200 w-52 min-w-[180px] max-w-[240px]">Name</th>
                    <th className="p-2.5 border-r border-slate-200 w-44 min-w-[150px] max-w-[200px]">Description</th>
                    <th className="p-2.5 border-r border-slate-200 w-28 min-w-[100px]">Category</th>
                    <th className="p-2.5 border-r border-slate-200 w-32 text-right">Purchased Price</th>
                    <th className="p-2.5 border-r border-slate-200 w-24 text-center">Unit Amount</th>
                    <th className="p-2.5 border-r border-slate-200 w-32 text-right">Unit Price</th>
                    <th className="p-2.5 border-r border-slate-200 w-24 text-center">Unit Name</th>
                    <th className="p-2.5 border-r border-slate-200 w-20 text-center">Stock</th>
                    <th className="p-2.5 border-r border-slate-200 w-28">Price Variant</th>
                    <th className="p-2.5 border-r border-slate-200 w-28">Expiry Date</th>
                    <th className="p-2.5 border-r border-slate-200 w-32">Barcode</th>
                    <th className="p-2.5 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedProducts.map((prod) => {
                    const isTracked = prod.use_stock !== false && (prod.use_stock as unknown) !== 'false';
                    const isLowStock = isTracked && (Number(prod.stock) || 0) <= (prod.min_stock_level ?? 5);
                    const isOutOfStock = isTracked && (Number(prod.stock) || 0) <= 0;
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50 transition-colors">
                        {/* Name */}
                        <td className="p-2.5 font-bold text-slate-900 border-r border-slate-100 truncate max-w-[240px]" title={prod.name}>
                          {prod.name}
                        </td>

                        {/* Description */}
                        <td className="p-3 text-slate-600 border-r border-slate-100 truncate max-w-[160px]" title={prod.description}>
                          {prod.description || '-'}
                        </td>

                        {/* Category */}
                        <td className="p-3 border-r border-slate-100 font-semibold text-slate-700">
                          <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px]">
                            {prod.category}
                          </span>
                        </td>

                        {/* Purchased Price */}
                        <td className="p-3 text-right font-mono text-slate-600 border-r border-slate-100 font-medium">
                          {prod.cost ? prod.cost.toLocaleString() : '0'}
                        </td>

                        {/* Unit Amount */}
                        <td className="p-3 text-center font-mono text-slate-700 border-r border-slate-100">
                          {prod.unit_amount || 1}
                        </td>

                        {/* Unit Price */}
                        <td className="p-3 text-right font-mono font-bold text-slate-900 border-r border-slate-100">
                          {prod.price ? prod.price.toLocaleString() : '0'}
                        </td>

                        {/* Unit Name */}
                        <td className="p-3 text-center font-bold text-gray-900 border-r border-slate-100">
                          {prod.unit_name || 'ခု'}
                        </td>

                        {/* Stock */}
                        <td className="p-3 text-center border-r border-slate-100">
                          {(() => {
                            const totalStockAcrossAll = prod.stocks && prod.stocks.length > 0
                              ? prod.stocks.reduce((sum: number, s) => sum + (Number(s.quantity) || 0), 0)
                              : (Number(prod.stock) || 0);

                            const otherBranchesWithStock = prod.stocks?.filter(s => {
                              const qty = Number(s.quantity) || 0;
                              return qty > 0 && s.branch_id !== selectedBranchId;
                            }) || [];

                            return (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                                  !isTracked
                                    ? 'bg-slate-100 text-slate-600'
                                    : isOutOfStock 
                                      ? (otherBranchesWithStock.length > 0 ? 'bg-amber-100 text-amber-900 font-bold' : 'bg-red-100 text-red-800') 
                                      : isLowStock 
                                        ? 'bg-amber-100 text-amber-900' 
                                        : 'bg-gray-100 text-gray-900'
                                }`}>
                                  {!isTracked ? 'Untracked' : `${prod.stock} ${prod.unit_name || 'pcs'}`}
                                </span>
                                {selectedBranchId !== 'all' && otherBranchesWithStock.length > 0 && (
                                  <span 
                                    className="text-[9px] text-slate-500 font-semibold cursor-help"
                                    title={otherBranchesWithStock.map(s => {
                                      const bName = branches.find(b => b.id === s.branch_id)?.name || s.branch_id;
                                      return `${bName}: ${s.quantity} ${prod.unit_name || 'pcs'}`;
                                    }).join('\n')}
                                  >
                                    ({totalStockAcrossAll} total in other outlets)
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        {/* Price Variant */}
                        <td className="p-3 text-slate-500 border-r border-slate-100">
                          {prod.price_variant || '-'}
                        </td>

                        {/* Expiry Date */}
                        <td className="p-3 text-slate-500 border-r border-slate-100">
                          {prod.expiry_date || '-'}
                        </td>

                        {/* Barcode */}
                        <td className="p-3 font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                          {prod.barcode || '-'}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => openBarcodeModal(prod)}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded transition-colors cursor-pointer"
                              title="Print Barcode Label"
                            >
                              <Printer className="w-3.5 h-3.5 text-gray-900" />
                            </button>
                            <button
                              onClick={() => startEditProduct(prod)}
                              className="p-1.5 hover:bg-gray-50 text-gray-900 hover:text-gray-900 rounded transition-colors cursor-pointer"
                              title="Edit Details & Adjust Stock"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openQuickRestock(prod)}
                              className="p-1.5 hover:bg-gray-50 text-gray-900 hover:text-gray-900 rounded transition-colors cursor-pointer"
                              title="Quick Restock"
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                            </button>
                            {isOwner && (
                              <button
                                onClick={() => triggerDeleteProduct(prod.id, prod.name)}
                                className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-800 rounded transition-colors cursor-pointer"
                                title="Delete Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            {filteredProducts.length > 0 && (
              <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="text-slate-500 font-medium text-center sm:text-left">
                  Showing <span className="font-bold text-slate-800">{((safeProductPage - 1) * PRODUCTS_PER_PAGE) + 1}</span> to <span className="font-bold text-slate-800">{Math.min(safeProductPage * PRODUCTS_PER_PAGE, filteredProducts.length)}</span> of <span className="font-bold text-slate-800">{filteredProducts.length}</span> products
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={safeProductPage === 1}
                    onClick={() => setProductPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Prev</span>
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: totalProductPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalProductPages || Math.abs(p - safeProductPage) <= 1)
                      .reduce<(number | string)[]>((acc, page, idx, arr) => {
                        if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                          acc.push('...');
                        }
                        acc.push(page);
                        return acc;
                      }, [])
                      .map((item, idx) => (
                        typeof item === 'number' ? (
                          <button
                            key={idx}
                            onClick={() => setProductPage(item)}
                            className={`w-8 h-8 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                              safeProductPage === item
                                ? 'bg-black text-white shadow-xs'
                                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                            }`}
                          >
                            {item}
                          </button>
                        ) : (
                          <span key={idx} className="px-1 text-slate-400 font-bold">...</span>
                        )
                      ))
                    }
                  </div>

                  <button
                    disabled={safeProductPage >= totalProductPages}
                    onClick={() => setProductPage(p => Math.min(totalProductPages, p + 1))}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScan}
      />
    </div>
  );
}
