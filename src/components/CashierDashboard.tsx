import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useBackDismiss, useBackTabHistory } from '../lib/backNavigation';
import { 
  Search, ShoppingCart, LogOut, RefreshCw, User, ShoppingBag, 
  Minus, Plus, Trash2, DollarSign, Smartphone, Check, 
  FileText, Tag, ArrowRight, Printer, AlertCircle, Sparkles, Filter, ChevronDown, Menu, X, History, Camera,
  SlidersHorizontal, FileSpreadsheet
} from 'lucide-react';
import { dbService, DEFAULT_BUSINESS_PROFILE } from '../lib/supabase';
import { subscribeToDataChanges } from '../lib/realtimeSync';
import { Product, SaleWithItems, UserProfile, BusinessProfile, SaleDeleteRequest } from '../types';
import { formatCurrency } from '../utils/format';
import { useToast } from '../utils/toast';
import { exportSalesReportToXlsx } from '../utils/excelExport';
import SearchableCategorySelect from './SearchableCategorySelect';
import BarcodeScannerModal from './BarcodeScannerModal';
import UiSizeModal from './UiSizeModal';
import CashierSalesHistory from './CashierSalesHistory';

interface CashierDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface HeldCart {
  id: string;
  customerName: string;
  items: CartItem[];
  discount: string;
  createdAt: string;
}

type MobileWalletType = 'kbzpay' | 'ayapay' | 'wavepay' | 'other';

const formatPaymentMethodLabel = (method: string): string => {
  switch (method) {
    case 'kbzpay': return 'KBZPay';
    case 'ayapay': return 'AYA Pay';
    case 'wavepay': return 'WavePay';
    case 'other': return 'Other';
    case 'cash': return 'Cash';
    case 'mobile': return 'Mobile';
    default: return (method || '').toUpperCase();
  }
};

const getQuickCashOptions = (total: number) => {
  if (total <= 0) return [];
  const options = new Set<number>();
  const denoms = [1000, 5000, 10000, 20000, 50000, 100000];
  for (const d of denoms) {
    if (d > total) options.add(d);
  }
  const next5k = Math.ceil(total / 5000) * 5000;
  if (next5k > total) options.add(next5k);
  const next10k = Math.ceil(total / 10000) * 10000;
  if (next10k > total) options.add(next10k);
  options.add(total);
  return Array.from(options).sort((a, b) => a - b).slice(0, 5);
};

export default function CashierDashboard({ user, onLogout }: CashierDashboardProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeldCartsModal, setShowHeldCartsModal] = useState(false);
  const [salesHistory, setSalesHistory] = useState<SaleWithItems[]>([]);
  const [deleteRequests, setDeleteRequests] = useState<SaleDeleteRequest[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<SaleWithItems | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isSubmittingDeleteRequest, setIsSubmittingDeleteRequest] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile'>('cash');
  const [mobileWallet, setMobileWallet] = useState<MobileWalletType>('kbzpay');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleWithItems | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUiSizeModal, setShowUiSizeModal] = useState(false);

  useBackDismiss(showLogoutConfirm, () => setShowLogoutConfirm(false));
  useBackDismiss(showCartModal, () => setShowCartModal(false));
  useBackDismiss(showHeldCartsModal, () => setShowHeldCartsModal(false));
  useBackDismiss(showReceipt, () => { setShowReceipt(false); setCompletedSale(null); });
  useBackDismiss(saleToDelete !== null, () => setSaleToDelete(null));

  const handleTabSwitch = (tab: 'pos' | 'history') => {
    if (tab === activeTab) return;
    if (tab === 'history') loadRecentSales();
    React.startTransition(() => setActiveTab(tab));
  };

  useBackTabHistory(activeTab, tab => {
    if (tab === 'history') loadRecentSales();
    React.startTransition(() => setActiveTab(tab));
  }, 'pos');

  const loadRecentSales = async (silent = false) => {
    if (!silent) setIsHistoryLoading(true);
    try {
      const [allSales, allDelReqs] = await Promise.all([
        dbService.sales.getAllWithItems(),
        dbService.saleDeleteRequests.getAll()
      ]);
      setSalesHistory(allSales.filter(s => s.cashier_id === user.id));
      setDeleteRequests(allDelReqs);
    } catch (err) {
      console.error('Failed to load sales history:', err);
    } finally {
      if (!silent) setIsHistoryLoading(false);
    }
  };

  const handleRequestDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleToDelete || isSubmittingDeleteRequest) return;
    setIsSubmittingDeleteRequest(true);
    try {
      await dbService.saleDeleteRequests.create({
        sale_id: saleToDelete.id,
        cashier_id: user.id,
        cashier_name: user.name,
        branch_id: user.branch_id,
        branch_name: user.branch_name,
        total_amount: saleToDelete.total_amount,
        reason: deleteReason
      });
      toast('Delete request sent to owner for approval.', 'success');
      setSaleToDelete(null);
      setDeleteReason('');
      await loadRecentSales();
    } catch (err: any) {
      toast(err.message || 'Failed to submit delete request.', 'error');
    } finally {
      setIsSubmittingDeleteRequest(false);
    }
  };

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const newHold: HeldCart = {
      id: 'draft-' + Date.now(),
      customerName: customerName || 'Walk-in Customer',
      items: [...cart],
      discount: discount,
      createdAt: new Date().toISOString(),
    };
    setHeldCarts(prev => [newHold, ...prev]);
    setCart([]);
    setDiscount('');
    setCustomerName('');
    setCustomerPhone('');
    setShowCartModal(false);
    toast('Cart put on hold.', 'success');
  };

  const handleRecallCart = (held: HeldCart) => {
    setCart(held.items);
    setDiscount(held.discount);
    setCustomerName(held.customerName === 'Walk-in Customer' ? '' : held.customerName);
    setHeldCarts(prev => prev.filter(c => c.id !== held.id));
    setShowHeldCartsModal(false);
  };

  const loadProducts = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [data, biz] = await Promise.all([
        dbService.products.getAll(user.branch_id || undefined),
        dbService.business.get()
      ]);
      setProducts(data);
      if (biz) setBusinessProfile(biz);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts(false);
    loadRecentSales(false);
    const unsubscribe = subscribeToDataChanges(async () => {
      await Promise.all([
        loadProducts(true),
        loadRecentSales(true)
      ]);
    });
    return unsubscribe;
  }, []);

  const addToCart = (product: Product) => {
    const isOutOfStock = product.use_stock !== false && (Number(product.stock) || 0) <= 0;
    if (isOutOfStock) {
      toast(`${product.name} is sold out (0 stock available).`, 'warning');
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const availableStock = Number(product.stock) || 0;
        if (product.use_stock !== false && existing.quantity >= availableStock) {
          toast(`Cannot add more than ${availableStock} units of ${product.name}`, 'warning');
          return prev;
        }
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const branchProducts = useMemo(() => {
    return products.map(p => {
      if (!user.branch_id) return p;
      let branchStock = 0;
      if (p.stocks && p.stocks.length > 0) {
        const uBranchId = user.branch_id.trim().toLowerCase();
        const uBranchName = user.branch_name ? user.branch_name.trim().toLowerCase() : '';
        const match = p.stocks.find(s => {
          if (!s.branch_id) return false;
          const sBranch = s.branch_id.trim().toLowerCase();
          return sBranch === uBranchId || (uBranchName && sBranch === uBranchName);
        });
        branchStock = match ? (Number(match.quantity) || 0) : 0;
      } else if (p.branch_id && p.branch_id.trim().toLowerCase() !== user.branch_id.trim().toLowerCase()) {
        branchStock = 0;
      } else {
        branchStock = Number(p.stock) || 0;
      }
      return {
        ...p,
        stock: branchStock,
        branch_id: user.branch_id,
        branch_name: user.branch_name
      };
    });
  }, [products, user.branch_id, user.branch_name]);

  const handleBarcodeScan = useCallback((barcode: string) => {
    const match = branchProducts.find(p =>
      p.barcode === barcode || p.sku === barcode
    );
    if (match) {
      const isOutOfStock = match.use_stock !== false && (Number(match.stock) || 0) <= 0;
      if (isOutOfStock) {
        toast(`${match.name} is sold out (0 stock available).`, 'warning');
        return;
      }
      addToCart(match);
      toast(`${match.name} added to cart`, 'success');
    } else {
      toast(`No product found for barcode: ${barcode}`, 'error');
    }
  }, [branchProducts, toast]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          const availableStock = Number(item.product.stock) || 0;
          if (item.product.use_stock !== false && newQty > availableStock) {
            toast(`Stock limit: ${availableStock} units available.`, 'warning');
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discountVal = parseFloat(discount) || 0;
  const taxRate = businessProfile.tax_rate || 0;
  const taxAmount = Number(((subtotal - discountVal) * taxRate / 100).toFixed(2));
  const totalDue = Math.max(0, subtotal - discountVal + taxAmount);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || isCheckingOut) return;
    setCheckoutError(null);
    setIsCheckingOut(true);
    try {
      const selectedPayment = paymentMethod === 'mobile' ? mobileWallet : 'cash';
      const sale = await dbService.sales.checkout(cart, selectedPayment, discountVal, user, { name: customerName, phone: customerPhone });
      setCompletedSale(sale);
      setShowReceipt(true);
      setCart([]);
      setDiscount('');
      setCustomerName('');
      setCustomerPhone('');
      setCashReceived('');
      setShowCartModal(false);
      await Promise.all([loadProducts(), loadRecentSales()]);
    } catch (err: any) {
      setCheckoutError(err.message || 'Checkout failed.');
    } finally {
      setIsCheckingOut(false);
    }
  };


  const isSearching = searchQuery.trim().length > 0;

  const categories = useMemo(() => ['All', ...Array.from(new Set(branchProducts.map(p => p.category)))], [branchProducts]);

  const availableBranchProducts = useMemo(() => {
    return branchProducts.filter(p => p.use_stock === false || (Number(p.stock) || 0) > 0);
  }, [branchProducts]);

  const categoryOptions = useMemo(() => {
    const sourceList = isSearching ? branchProducts : availableBranchProducts;
    const opts = [{ value: 'All', label: 'All Categories', count: sourceList.length }];
    categories.filter(c => c !== 'All').forEach(cat => {
      opts.push({ value: cat, label: cat, count: sourceList.filter(p => p.category === cat).length });
    });
    return opts;
  }, [categories, branchProducts, availableBranchProducts, isSearching]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return branchProducts.filter(p => {
      const isOutOfStock = p.use_stock !== false && (Number(p.stock) || 0) <= 0;

      // When not searching (default view or category browsing), hide sold-out items
      if (!isSearching && isOutOfStock) {
        return false;
      }

      const matchesSearch = !isSearching || (
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query))
      );

      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [branchProducts, searchQuery, isSearching, selectedCategory]);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const renderCartContent = (isDesktopSidebar = false) => (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto android-scroll px-4 py-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <ShoppingCart className="w-14 h-14 text-slate-300 mb-3" />
            <p className="text-xs font-semibold">Cart is empty</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Tap products to add them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map((item) => (
              <div key={item.product.id} className="android-card p-3 flex items-center gap-3">
                <div className="min-w-0 flex-grow">
                  <h5 className="font-bold text-[13px] text-slate-800 truncate">{item.product.name}</h5>
                  <span className="text-[11px] text-slate-400 font-mono">{formatCurrency(item.product.price)} each</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center border-2 border-slate-200 rounded-xl bg-white">
                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-l-xl cursor-pointer active-scale">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-3 font-mono text-sm font-bold text-slate-800 min-w-[28px] text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-r-xl cursor-pointer active-scale">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <button onClick={() => removeFromCart(item.product.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer active-scale">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="mt-4 space-y-4">
            {checkoutError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Customer Name</label>
                <input type="text" placeholder="Walk-in" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="android-input w-full py-2.5 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Phone</label>
                <input type="text" placeholder="Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="android-input w-full py-2.5 text-xs" />
              </div>
            </div>

            <div className="space-y-2 text-xs border-t border-b border-slate-100 py-3">
              <div className="flex justify-between items-center text-slate-500">
                <span>Subtotal</span>
                <span className="font-mono font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-slate-400" />
                  Discount
                </span>
                <input type="number" placeholder="0" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="android-input w-24 py-1.5 text-xs text-right font-mono font-bold" />
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between items-center text-slate-500">
                  <span>Tax ({taxRate}%)</span>
                  <span className="font-mono font-medium">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center font-bold text-slate-900 pt-2">
                <span className="text-sm">Total Due</span>
                <span className="font-mono text-gray-900 text-lg">{formatCurrency(totalDue)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">Payment Method</label>
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
                {(['cash', 'mobile'] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => { setPaymentMethod(method); setCashReceived(''); }}
                    className={`py-3 flex flex-col items-center justify-center rounded-xl transition-all text-xs font-bold cursor-pointer active-scale ${
                      paymentMethod === method ? 'bg-white text-gray-900 shadow-xs' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    {method === 'cash' ? <DollarSign className="w-5 h-5 mb-1" /> : <Smartphone className="w-5 h-5 mb-1" />}
                    <span className="capitalize">{method === 'mobile' ? 'Mobile Wallet' : 'Cash'}</span>
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'mobile' && (
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">Select Wallet</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'kbzpay', label: 'KBZPay' },
                    { id: 'ayapay', label: 'AYA Pay' },
                    { id: 'wavepay', label: 'WavePay' },
                    { id: 'other', label: 'Other' },
                  ].map((wallet) => (
                    <button
                      key={wallet.id}
                      type="button"
                      onClick={() => setMobileWallet(wallet.id as MobileWalletType)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center active-scale ${
                        mobileWallet === wallet.id
                          ? 'bg-black text-white shadow-2xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {wallet.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paymentMethod === 'cash' && totalDue > 0 && (
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-bold">Cash Received</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Ks</span>
                    <input type="number" placeholder="0" min={totalDue} value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="android-input w-32 pl-7 py-2 text-xs text-right font-mono font-bold" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {getQuickCashOptions(totalDue).map((amt) => (
                    <button key={amt} type="button" onClick={() => setCashReceived(amt.toString())} className="text-[10px] px-2.5 py-1.5 bg-white hover:bg-slate-100 active:scale-95 border border-slate-200 rounded-xl text-slate-700 font-bold font-mono transition-all cursor-pointer">
                      {formatCurrency(amt)}
                    </button>
                  ))}
                </div>
                {parseFloat(cashReceived) >= totalDue && (
                  <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-slate-200/60">
                    <span className="text-gray-900">Change</span>
                    <span className="font-mono text-gray-900 text-sm">{formatCurrency(parseFloat(cashReceived) - totalDue)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 safe-area-bottom bg-white shrink-0">
        <button onClick={handleCheckout} disabled={cart.length === 0 || isCheckingOut} className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-800 disabled:from-slate-300 disabled:to-slate-300 text-white rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-black/25 transition-all disabled:shadow-none disabled:cursor-not-allowed cursor-pointer active-scale">
          {isCheckingOut ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-5 h-5" />
              <span>Process Checkout ({formatCurrency(totalDue)})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200/80 shrink-0 safe-area-top z-30">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black text-white rounded-xl flex items-center justify-center font-black text-lg shadow-xs">
              {businessProfile.name ? businessProfile.name.charAt(0).toUpperCase() : 'M'}
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                {businessProfile.name || 'Mibayate POS'}
              </h1>
              <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse-soft inline-block" />
                {user.branch_name || 'Main Store'} • Cashier: <strong className="text-slate-800">{user.name}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTabSwitch(activeTab === 'pos' ? 'history' : 'pos')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors hidden sm:flex items-center gap-1.5 cursor-pointer"
            >
              {activeTab === 'pos' ? <History className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              <span>{activeTab === 'pos' ? 'Sales History' : 'POS Terminal'}</span>
            </button>
            <button 
              onClick={() => setShowUiSizeModal(true)} 
              className="p-2.5 text-slate-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all cursor-pointer"
              title="Adjust UI & Display size"
            >
              <SlidersHorizontal className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => { loadProducts(); }} 
              className="p-2.5 text-slate-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all cursor-pointer"
              title="Refresh inventory"
            >
              <RefreshCw className={`w-4.5 h-4.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => { if (confirm('Are you sure you want to log out?')) onLogout(); }}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer hidden sm:flex"
              title="Log out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
        {activeTab === 'pos' ? (
          <>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-3 sm:px-4 pt-3 pb-2 shrink-0">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute inset-y-0 left-0 pl-4 w-4.5 h-4.5 my-auto text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search products by name, SKU, or barcode..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-black/10 transition-all shadow-xs"
                    />
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <SearchableCategorySelect
                      options={categoryOptions}
                      value={selectedCategory}
                      onChange={(cat) => setSelectedCategory(cat)}
                      placeholder="All Categories"
                      allLabel="All Categories"
                      allowCreate={false}
                      className="flex-1 sm:w-56 shrink-0"
                    />

                    <button
                      onClick={() => setShowScanner(true)}
                      className="shrink-0 w-[42px] h-[42px] bg-black hover:bg-gray-800 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer active-scale shadow-xs"
                      title="Scan barcode with camera"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Product Grid */}
              <div className="flex-1 overflow-y-auto android-scroll px-3 sm:px-4 min-h-0">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-8 h-8 border-[3px] border-gray-900/20 border-t-gray-900 rounded-full animate-spin" />
                    <span className="text-slate-400 text-xs font-semibold mt-3">Loading inventory...</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16">
                    <ShoppingBag className="w-14 h-14 text-slate-200 mb-3" />
                    <p className="text-sm font-semibold">No items found</p>
                    <p className="text-xs text-slate-400 mt-1">Try a different search or category</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
                    {filteredProducts.map((prod) => {
                      const isOutOfStock = prod.use_stock !== false && (Number(prod.stock) || 0) <= 0;
                      const isLowStock = prod.use_stock !== false && (Number(prod.stock) || 0) <= (prod.min_stock_level ?? 5);
                      const inCartCount = cart.find(item => item.product.id === prod.id)?.quantity || 0;
                      return (
                        <button
                          key={prod.id}
                          onClick={() => addToCart(prod)}
                          disabled={isOutOfStock}
                          className={`android-card p-3 text-left flex flex-col justify-between relative overflow-hidden transition-all ${
                            isOutOfStock
                              ? 'opacity-40 cursor-not-allowed'
                              : 'cursor-pointer hover:border-slate-300 hover:shadow-md active:scale-[0.98]'
                          }`}
                        >
                          {inCartCount > 0 && (
                            <div className="absolute top-2 right-2 bg-black text-white font-black text-[10px] w-5.5 h-5.5 rounded-full flex items-center justify-center border-2 border-white shadow-xs z-10">
                              {inCartCount}
                            </div>
                          )}

                          {prod.image && (
                            <div className="w-full h-20 mb-2 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                              <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                            </div>
                          )}

                          <div className="space-y-1">
                            <span className="block font-extrabold text-slate-900 text-[13px] leading-snug line-clamp-2 pr-4">{prod.name}</span>
                            <span className="block font-mono text-[10px] text-slate-400">{prod.sku}</span>
                          </div>
                          
                          <div className="flex items-end justify-between mt-3 pt-2.5 border-t border-slate-100">
                            <span className="font-extrabold text-slate-900 text-sm font-mono">{formatCurrency(prod.price)}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isOutOfStock ? 'bg-red-100 text-red-700' : isLowStock ? 'bg-gray-100 text-gray-900' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {isOutOfStock ? 'Sold Out' : `${prod.stock} left`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* PERMANENT DESKTOP RIGHT CART SIDEBAR */}
            <aside className="hidden lg:flex lg:w-96 lg:flex-col lg:bg-white lg:border-l lg:border-slate-200 lg:shrink-0 z-20">
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-gray-900" />
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">Current Order</h4>
                    <p className="text-[10px] text-slate-500 font-semibold">{cartCount} items selected</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {cart.length > 0 && (
                    <button onClick={handleHoldCart} className="text-[11px] text-slate-600 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer">
                      Hold
                    </button>
                  )}
                  {heldCarts.length > 0 && (
                    <button onClick={() => setShowHeldCartsModal(true)} className="text-[11px] bg-black hover:bg-gray-800 text-white px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer">
                      Held ({heldCarts.length})
                    </button>
                  )}
                  {cart.length > 0 && (
                    <button onClick={() => setCart([])} className="text-[11px] text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg font-bold cursor-pointer">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {renderCartContent(true)}
            </aside>
          </>
        ) : (
          <CashierSalesHistory
            sales={salesHistory}
            deleteRequests={deleteRequests}
            isLoading={isHistoryLoading}
            onRefresh={() => loadRecentSales(false)}
            user={user}
            businessProfile={businessProfile}
            onRequestDelete={(sale) => {
              setSaleToDelete(sale);
              setDeleteReason('');
            }}
            onPrintReceipt={(sale) => {
              setCompletedSale(sale);
              setShowReceipt(true);
            }}
            onStartSelling={() => handleTabSwitch('pos')}
          />
        )}
      </div>

      {/* Floating Cart Bar (Hidden on Desktop) */}
      {activeTab === 'pos' && (
        <div className="shrink-0 px-3 pb-3 pt-1 safe-area-bottom bg-gradient-to-t from-slate-50 via-slate-50 to-transparent lg:hidden">
          <button
            onClick={() => setShowCartModal(true)}
            className="w-full flex items-center justify-between bg-black text-white font-bold px-5 py-3.5 rounded-2xl shadow-lg transition-all cursor-pointer active-scale"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-white text-gray-900 font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-gray-900 shadow-xs">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-sm">{cartCount > 0 ? `View Cart (${cartCount})` : 'Cart Empty'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono bg-white/20 px-3 py-1 rounded-lg">{formatCurrency(totalDue)}</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Bottom Navigation Bar (Hidden on Desktop) */}
      <nav className="bg-white border-t border-slate-200/80 shrink-0 safe-area-bottom z-40 lg:hidden">
        <div className="flex items-stretch h-16">
          <button
            onClick={() => handleTabSwitch('pos')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer nav-item-tap relative ${
              activeTab === 'pos' ? 'text-gray-900' : 'text-slate-500'
            }`}
          >
            {activeTab === 'pos' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-black rounded-full" />
            )}
            <ShoppingCart className="w-5 h-5" />
            <span className="text-[10px] font-bold">Terminal</span>
          </button>
          <button
            onClick={() => handleTabSwitch('history')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer nav-item-tap relative ${
              activeTab === 'history' ? 'text-gray-900' : 'text-slate-500'
            }`}
          >
            {activeTab === 'history' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-black rounded-full" />
            )}
            <History className="w-5 h-5" />
            <span className="text-[10px] font-bold">History</span>
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500 cursor-pointer nav-item-tap"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-bold">Logout</span>
          </button>
        </div>
      </nav>

      {/* Cart Bottom Sheet (Hidden on Desktop) */}
      {showCartModal && (
        <div className="bottom-sheet-overlay lg:hidden" onClick={() => setShowCartModal(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 pb-2">
              <div className="pull-indicator" />
            </div>
            
            <div className="px-4 pb-3 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-5 h-5 text-gray-900" />
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Active Cart</h4>
                  <p className="text-[10px] text-slate-500">{cartCount} items</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button onClick={handleHoldCart} className="text-[11px] text-slate-600 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer">
                    Hold
                  </button>
                )}
                {heldCarts.length > 0 && (
                  <button onClick={() => { setShowCartModal(false); setShowHeldCartsModal(true); }} className="text-[11px] bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer">
                    Hold ({heldCarts.length})
                  </button>
                )}
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="text-[11px] text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-xl font-bold cursor-pointer">
                    Clear
                  </button>
                )}
                <button onClick={() => setShowCartModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {renderCartContent(false)}
          </div>
        </div>
      )}

      {/* Held Carts Bottom Sheet */}
      {showHeldCartsModal && (
        <div className="bottom-sheet-overlay" onClick={() => setShowHeldCartsModal(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 pb-2">
              <div className="pull-indicator" />
            </div>
            <div className="px-4 pb-3 flex items-center justify-between border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-gray-500" />
                Held Carts ({heldCarts.length})
              </h4>
              <button onClick={() => setShowHeldCartsModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto android-scroll p-4 space-y-3">
              {heldCarts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No carts on hold.</p>
              ) : (
                heldCarts.map((held) => {
                  const heldSubtotal = held.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
                  const heldTotal = Math.max(0, heldSubtotal - (parseFloat(held.discount) || 0));
                  return (
                    <div key={held.id} className="android-card p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-800">{held.customerName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{new Date(held.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-2 mb-3">
                        {held.items.map(item => `${item.product.name} (x${item.quantity})`).join(', ')}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="font-mono text-sm font-bold text-slate-900">{formatCurrency(heldTotal)}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setHeldCarts(prev => prev.filter(c => c.id !== held.id))} className="text-[11px] text-red-500 hover:text-red-700 font-bold px-3 py-1.5 rounded-xl hover:bg-red-50 cursor-pointer active-scale">Discard</button>
                          <button onClick={() => handleRecallCart(held)} className="text-[11px] bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-800 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer active-scale">Recall</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receipt Bottom Sheet */}
      {showReceipt && completedSale && (
        <div className="bottom-sheet-overlay" onClick={() => { setShowReceipt(false); setCompletedSale(null); }}>
          <div className="bottom-sheet max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 pb-2">
              <div className="pull-indicator" />
            </div>
            <div className="bg-gradient-to-r from-gray-700 to-gray-700 text-white px-5 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gray-300" />
                <span className="font-bold text-sm">Sale Complete!</span>
              </div>
              <button onClick={() => { setShowReceipt(false); setCompletedSale(null); }} className="text-white/70 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto android-scroll p-4">
              <div className="bg-white p-5 border border-slate-200/80 shadow-premium rounded-2xl space-y-4 max-w-sm mx-auto">
                <div className="text-center space-y-1">
                  {businessProfile.logo_url ? (
                    <img src={businessProfile.logo_url} alt="Logo" className="w-14 h-14 object-contain mx-auto rounded-xl mb-1" />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-700 text-white font-black text-xl rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-black/20 mb-1">
                      {businessProfile.name ? businessProfile.name.charAt(0).toUpperCase() : 'M'}
                    </div>
                  )}
                  <h4 className="font-black text-sm tracking-tight uppercase text-slate-900">
                    {businessProfile.name || 'RETAIL SHOP'}
                  </h4>
                  {businessProfile.tagline && <p className="text-[10px] font-sans font-medium text-slate-500">{businessProfile.tagline}</p>}
                  <p className="text-[11px] font-bold text-gray-900 bg-gray-50/80 px-2.5 py-0.5 rounded-lg border border-gray-100 inline-block">
                    {completedSale.branch_name || user.branch_name || 'Main Store'}
                  </p>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-3 text-[11px] space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span>Receipt No:</span>
                    <span className="font-bold">{completedSale.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cashier:</span>
                    <span className="font-bold">{completedSale.cashier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span>{new Date(completedSale.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-3 space-y-2">
                  {completedSale.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-slate-700">
                      <div className="max-w-[180px] truncate">
                        <span>{item.product_name}</span>
                        <div className="text-[10px] text-slate-400">{item.quantity} x {formatCurrency(item.unit_price)}</div>
                      </div>
                      <span className="font-semibold font-mono">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-slate-300 pt-3 text-[11px] space-y-1.5">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency(completedSale.total_amount + completedSale.discount)}</span>
                  </div>
                  {completedSale.discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount</span>
                      <span className="font-mono">-{formatCurrency(completedSale.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-slate-900 text-sm border-t border-dotted border-slate-300 pt-2">
                    <span>TOTAL</span>
                    <span className="font-mono text-gray-900">{formatCurrency(completedSale.total_amount)}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-3 text-center space-y-2">
                  <p className="text-[10px] text-slate-400">Payment: <span className="font-bold uppercase text-slate-600">{formatPaymentMethodLabel(completedSale.payment_method)}</span></p>
                  <div className="mx-auto w-3/4 flex flex-col items-center">
                    <div className="h-6 bg-slate-900 w-full flex items-stretch gap-0.5 opacity-80 mt-1 rounded">
                      <div className="bg-slate-900 grow" /><div className="bg-white w-0.5" /><div className="bg-slate-900 w-1" /><div className="bg-white w-1" /><div className="bg-slate-900 w-0.5" /><div className="bg-white w-0.5" /><div className="bg-slate-900 w-2" /><div className="bg-white w-1" /><div className="bg-slate-900 w-1.5" /><div className="bg-white w-0.5" />
                    </div>
                    <span className="text-[9px] text-slate-400 tracking-widest font-sans mt-1">*{completedSale.id.substring(completedSale.id.length - 8).toUpperCase()}*</span>
                  </div>
                  <p className="text-[10px] text-slate-500 italic pt-1 font-sans font-medium">
                    &ldquo;{businessProfile.receipt_footer || 'Thank you for shopping with us!'}&rdquo;
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 safe-area-bottom bg-white">
              <button type="button" onClick={() => window.print()} className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-all cursor-pointer active-scale">
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button type="button" onClick={() => { setShowReceipt(false); setCompletedSale(null); }} className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-800 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-black/20 cursor-pointer active-scale">
                <Check className="w-4 h-4" />
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScan}
      />
      {saleToDelete && (
        <div className="bottom-sheet-overlay" onClick={() => setSaleToDelete(null)}>
          <div className="bottom-sheet max-w-lg mx-auto rounded-t-3xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 pb-2 sm:hidden">
              <div className="pull-indicator" />
            </div>
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 leading-tight">Request Sale Deletion</h4>
                  <p className="text-[11px] text-slate-500 font-medium">Submit void request for store owner review</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaleToDelete(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleRequestDeleteSubmit} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1 text-xs">
                <div className="flex justify-between font-bold text-slate-900">
                  <span className="font-mono">Receipt #{saleToDelete.id.slice(0, 8)}</span>
                  <span className="font-mono text-slate-950 font-black">{formatCurrency(saleToDelete.total_amount)}</span>
                </div>
                <p className="text-slate-500 text-[11px] font-medium">
                  {saleToDelete.items.length} items • {new Date(saleToDelete.created_at).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Quick Reason Preset
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Customer returned items',
                    'Wrong item rung up',
                    'Wrong payment method',
                    'Duplicate transaction',
                    'Customer canceled order'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDeleteReason(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        deleteReason === preset
                          ? 'bg-black text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Reason Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this receipt needs deletion/voiding..."
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-black focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSaleToDelete(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDeleteRequest || !deleteReason.trim()}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                >
                  {isSubmittingDeleteRequest ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="bottom-sheet-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 pb-2">
              <div className="pull-indicator" />
            </div>
            <div className="px-5 pb-6 space-y-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900">Log out?</h4>
                <p className="text-sm text-slate-500">You will be returned to the sign-in screen.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-all cursor-pointer active-scale"
                >
                  Cancel
                </button>
                <button
                  onClick={onLogout}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-2xl transition-all cursor-pointer active-scale"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UiSizeModal
        isOpen={showUiSizeModal}
        onClose={() => setShowUiSizeModal(false)}
      />
    </div>
  );
}
