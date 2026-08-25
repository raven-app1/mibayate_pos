import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Users, Package, AlertTriangle, LogOut, Plus, Minus, Search, 
  Edit2, Trash2, Calendar, Clipboard, ShoppingCart, UserPlus, DollarSign,
  Briefcase, CheckCircle, RefreshCw, Layers, Shield, FileText, Building2, Store, MapPin,
  Database, Copy, Download, Printer, Tag, FileSpreadsheet, Upload, Award, Eye, Receipt, CreditCard,
  Menu, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Image, Sparkles, Globe, Phone, Mail, Check, Settings,
  ArrowUpRight, ArrowDownLeft, Wallet, Banknote, TrendingDown, PackagePlus, Key, SlidersHorizontal
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from 'recharts';
import { dbService, isSupabaseConfigured, DEFAULT_BUSINESS_PROFILE, formatEmailWithDefaultDomain } from '../lib/supabase';
import { Product, SaleWithItems, UserProfile, InventoryTransaction, SalesAnalytics, Branch, BusinessProfile, CashFlowEntry, CashFlowType, PaymentMethod, SaleDeleteRequest, UserRole } from '../types';
import { formatCurrency, formatDisplayEmail } from '../utils/format';
import { useToast } from '../utils/toast';
import { useBackDismiss, useBackTabHistory } from '../lib/backNavigation';
import { SUPABASE_SCHEMA_SQL } from '../data/schemaSql';
import BarcodePrintModal from './BarcodePrintModal';
import SingleLabelModal from './SingleLabelModal';
import LabelGeneratorTab from './LabelGeneratorTab';
import CsvImportModal from './CsvImportModal';
import SearchableCategorySelect from './SearchableCategorySelect';
import QuickRestockModal from './QuickRestockModal';
import SaleReportTab from './SaleReportTab';
import DeleteRequestsTab from './DeleteRequestsTab';
import ChangePasswordTab from './ChangePasswordTab';
import UiSizeModal from './UiSizeModal';
import { useUiScale } from '../lib/uiScale';
import { usePosStore } from '../store/usePosStore';
import { subscribeToDataChanges } from '../lib/realtimeSync';
import BranchesTab from './dashboard/BranchesTab';
import TransactionsTab from './dashboard/TransactionsTab';
import CashiersTab from './dashboard/CashiersTab';
import StaffPerformanceTab from './dashboard/StaffPerformanceTab';
import ProductsTab from './dashboard/ProductsTab';
import CashFlowTab from './dashboard/CashFlowTab';
import OverviewTab from './dashboard/OverviewTab';
import ProductModal from './modals/ProductModal';
import CashierModal from './modals/CashierModal';
import BranchModal from './modals/BranchModal';
import CashFlowModal from './modals/CashFlowModal';

interface OwnerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function OwnerDashboard({ user, onLogout }: OwnerDashboardProps) {
  const { toast } = useToast();
  // State for raw data
  const {
    products, setProducts,
    sales, setSales,
    cashiers, setCashiers,
    transactions, setTransactions,
    branches, setBranches,
    deleteRequests, setDeleteRequests,
    businessProfile: storeBusinessProfile, setBusinessProfile,
    cashFlowEntries, setCashFlowEntries,
    isLoading, loadData
  } = usePosStore();

  const businessProfile = storeBusinessProfile || DEFAULT_BUSINESS_PROFILE;

  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'cashiers' | 'staff-performance' | 'transactions' | 'branches' | 'settings' | 'cash-flow' | 'label-generator' | 'sale-report' | 'delete-requests' | 'change-password'>(user.role === 'manager' ? 'products' : 'overview');
  const [selectedSingleProduct, setSelectedSingleProduct] = useState<Product | null>(null);
  const [showSingleLabelModal, setShowSingleLabelModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTabChanging, setIsTabChanging] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUiSizeModal, setShowUiSizeModal] = useState(false);
  const { scale: uiScale, setScale: setUiScale, resetScale: resetUiScale, presets: uiPresets, minScale: minUiScale, maxScale: maxUiScale, stepScale: stepUiScale } = useUiScale();

  const [perfStartDate, setPerfStartDate] = useState('');
  const [perfEndDate, setPerfEndDate] = useState('');
  const [perfDatePreset, setPerfDatePreset] = useState<'all' | 'prev-month' | 'this-month' | 'custom'>('all');

  // Business Profile & Branding State
  const [businessForm, setBusinessForm] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);

  useEffect(() => {
    if (storeBusinessProfile) {
      setBusinessForm(storeBusinessProfile);
    }
  }, [storeBusinessProfile]);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessSuccessMsg, setBusinessSuccessMsg] = useState<string | null>(null);
  const [businessErrorMsg, setBusinessErrorMsg] = useState<string | null>(null);

  const [showCashFlowModal, setShowCashFlowModal] = useState(false);
  const [editingCashFlow, setEditingCashFlow] = useState<CashFlowEntry | null>(null);

  const handleTabSwitch = (tab: 'overview' | 'products' | 'cashiers' | 'staff-performance' | 'transactions' | 'branches' | 'settings' | 'cash-flow' | 'label-generator' | 'sale-report' | 'delete-requests' | 'change-password') => {
    setIsSidebarOpen(false);
    if (tab === activeTab) return;
    setIsTabChanging(true);
    setTimeout(() => {
      React.startTransition(() => {
        setActiveTab(tab);
        setTimeout(() => {
          setIsTabChanging(false);
        }, 60);
      });
    }, 80);
  };

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [showCashierModal, setShowCashierModal] = useState(false);
  const [editingCashier, setEditingCashier] = useState<UserProfile | null>(null);

  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [datePreset, setDatePreset] = useState('today');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  // Guards modal form submits (product/cashier/branch) against double-clicks
  const [isSubmitting, setIsSubmitting] = useState(false);
  // True while auto-generating a SKU / barcode for the new-product form
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    type: 'branch' | 'cashier' | 'product' | 'cash-flow';
    title: string;
    description: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // SQL Schema Modal State
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Barcode Printing Modal State
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeProductId, setBarcodeProductId] = useState<string | null>(null);

  // CSV Import Modal State
  const [showCsvModal, setShowCsvModal] = useState(false);

  // Quick Restock Modal State
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [isRestocking, setIsRestocking] = useState(false);

  // Cashier Sales History Modal State
  const [selectedCashierForHistory, setSelectedCashierForHistory] = useState<{ cashier: UserProfile; sales: SaleWithItems[] } | null>(null);

  const openBarcodePrintModal = (productId?: string) => {
    setBarcodeProductId(productId || null);
    setShowBarcodeModal(true);
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setShowProductModal(true);
  };

  const openNewCashierModal = () => {
    setEditingCashier(null);
    setShowCashierModal(true);
  };

  const startEditCashier = (cashier: UserProfile) => {
    setEditingCashier(cashier);
    setShowCashierModal(true);
  };

  const openNewBranchModal = () => {
    setEditingBranch(null);
    setShowBranchModal(true);
  };

  const handleExportCsv = () => {
    const sanitizeCsvCell = (val: any): string => {
      const str = val === null || val === undefined ? '' : String(val);
      const escaped = str.replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(escaped)) {
        return `"'${escaped}"`;
      }
      return `"${escaped}"`;
    };

    const formatBarcodeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).trim();
      if (!str) return '""';
      const escaped = str.replace(/"/g, '""');
      return `="""${escaped}"""`;
    };

    const formatIdCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).trim();
      if (!str) return '""';
      const escaped = str.replace(/"/g, '""');
      if (/^0\d+$/.test(str) || /^\d{10,}$/.test(str)) {
        return `="""${escaped}"""`;
      }
      if (/^[=+\-@\t\r]/.test(escaped)) {
        return `"'${escaped}"`;
      }
      return `"${escaped}"`;
    };

    const headers = [
      'ID', 'Name', 'Image', 'Description', 'Category', 'Use Stock',
      'Purchased Price', 'Unit Amount', 'Unit Price', 'Unit Name',
      'Stock', 'Price Variant', 'Expiry Date', 'Updated Date', 'Barcode'
    ];

    const rows = products.map(p => [
      formatIdCell(p.id || p.sku || ''),
      sanitizeCsvCell(p.name || ''),
      sanitizeCsvCell(p.image || 'null'),
      sanitizeCsvCell(p.description || ''),
      sanitizeCsvCell(p.category || ''),
      sanitizeCsvCell(p.use_stock !== false ? 'true' : 'false'),
      p.cost || 0,
      p.unit_amount || 1,
      p.price || 0,
      sanitizeCsvCell(p.unit_name || 'ခု'),
      p.stock || 0,
      sanitizeCsvCell(p.price_variant || ''),
      sanitizeCsvCell(p.expiry_date || ''),
      sanitizeCsvCell(p.updated_at || new Date().toLocaleString()),
      formatBarcodeCell(p.barcode || '')
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCsvSuccess = async (importedItems: Partial<Product>[], branchId: string, branchName: string) => {
    await dbService.products.bulkImport(importedItems, user.name, branchId, branchName);
    await loadData();
    toast(`Successfully imported ${importedItems.length} products!`, 'success');
  };

  const openQuickRestock = (prod: Product) => {
    setRestockProduct(prod);
  };

  const handleQuickRestock = async (productId: string, quantity: number, modalBranchId?: string) => {
    if (isRestocking) return;
    setIsRestocking(true);
    try {
      let targetBranchId = modalBranchId;
      if (!targetBranchId) {
        targetBranchId = selectedBranchId !== 'all' ? selectedBranchId : (user.role === 'manager' && user.branch_id ? user.branch_id : undefined);
      }
      const targetBranchName = targetBranchId ? branches.find(b => b.id === targetBranchId)?.name : undefined;
      await dbService.products.restock(productId, quantity, user.name, targetBranchId, targetBranchName);
      await loadData();
      setRestockProduct(null);
      setIsRestocking(false);
      toast(`Stock added: +${quantity}.`, 'success');
    } catch (err: any) {
      setIsRestocking(false);
      throw err;
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    const blob = new Blob([SUPABASE_SCHEMA_SQL], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supabase_schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };



  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      setBusinessErrorMsg('Image file is too large (max 3MB). Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setBusinessForm(prev => ({ ...prev, logo_url: result }));
      setBusinessErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (businessSaving) return;
    if (!businessForm.name.trim()) {
      setBusinessErrorMsg('Business name cannot be empty.');
      return;
    }

    setBusinessSaving(true);
    setBusinessErrorMsg(null);
    setBusinessSuccessMsg(null);

    try {
      const updated = await dbService.business.update(businessForm);
      setBusinessProfile(updated);
      setBusinessSuccessMsg('Business name and logo updated successfully!');
      setTimeout(() => setBusinessSuccessMsg(null), 4000);
    } catch (err: any) {
      setBusinessErrorMsg(err?.message || 'Failed to save business settings.');
    } finally {
      setBusinessSaving(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const unsubscribe = subscribeToDataChanges(() => {
      loadData(true);
    });
    return unsubscribe;
  }, []);

  // Auto-align manager's selectedBranchId to canonical branch ID when branches load
  useEffect(() => {
    if (user.role === 'manager' && user.branch_id && branches.length > 0) {
      const canonical = branches.find(b => 
        b.id.toLowerCase() === user.branch_id?.toLowerCase() ||
        b.code.toLowerCase() === user.branch_id?.toLowerCase() ||
        b.name.toLowerCase() === user.branch_id?.toLowerCase()
      );
      if (canonical && selectedBranchId !== canonical.id) {
        setSelectedBranchId(canonical.id);
      }
    }
  }, [user.branch_id, user.role, branches, selectedBranchId]);

  // Filter sales/products by selectedBranchId
  const displaySales = useMemo(() => {
    return selectedBranchId === 'all' 
      ? sales 
      : sales.filter(s => s.branch_id === selectedBranchId);
  }, [sales, selectedBranchId]);

  const displayProducts = useMemo(() => {
    if (selectedBranchId === 'all') {
      return products.map(p => {
        const total = p.stocks && p.stocks.length > 0
          ? p.stocks.reduce((sum: number, s) => sum + (Number(s.quantity) || 0), 0)
          : (Number(p.stock) || 0);
        return {
          ...p,
          stock: total
        };
      });
    }

    const targetBranch = branches.find(b => 
      b.id.toLowerCase() === selectedBranchId.toLowerCase() ||
      b.code.toLowerCase() === selectedBranchId.toLowerCase() ||
      b.name.toLowerCase() === selectedBranchId.toLowerCase()
    );
    const branchName = targetBranch?.name;
    const branchId = targetBranch?.id || selectedBranchId;

    return products.map(p => {
      let branchStock = 0;
      if (p.stocks && p.stocks.length > 0) {
        const match = p.stocks.find(s => {
          if (!s.branch_id) return false;
          const sBranch = s.branch_id.trim().toLowerCase();
          const selBranch = selectedBranchId.trim().toLowerCase();
          if (sBranch === selBranch) return true;
          if (targetBranch) {
            return sBranch === targetBranch.id.toLowerCase() ||
                   sBranch === targetBranch.code.toLowerCase() ||
                   sBranch === targetBranch.name.toLowerCase();
          }
          return false;
        });
        branchStock = match ? (Number(match.quantity) || 0) : 0;
      } else {
        branchStock = Number(p.stock) || 0;
      }
      return {
        ...p,
        stock: branchStock,
        branch_id: branchId,
        branch_name: branchName
      };
    });
  }, [products, selectedBranchId, branches]);

  const displayCashiers = useMemo(() => {
    return selectedBranchId === 'all'
      ? cashiers
      : cashiers.filter(c => c.branch_id === selectedBranchId);
  }, [cashiers, selectedBranchId]);

  const displayCashFlow = useMemo(() => {
    return selectedBranchId === 'all'
      ? cashFlowEntries
      : cashFlowEntries.filter(c => !c.branch_id || c.branch_id === selectedBranchId);
  }, [cashFlowEntries, selectedBranchId]);

  const openNewCashFlowModal = () => {
    setEditingCashFlow(null);
    setShowCashFlowModal(true);
  };

  const startEditCashFlow = (entry: CashFlowEntry) => {
    setEditingCashFlow(entry);
    setShowCashFlowModal(true);
  };

  const triggerDeleteCashFlow = (entry: CashFlowEntry) => {
    setDeleteConfirm({
      id: entry.id,
      type: 'cash-flow',
      title: 'Delete Cash Flow Entry?',
      description: `Are you sure you want to delete "${entry.title}" (${entry.type === 'income' ? 'income' : 'expense'}) worth ${formatCurrency(entry.amount)}? This action cannot be undone.`
    });
    setDeleteError(null);
  };

  const handlePerfMonthPreset = (preset: 'all' | 'prev-month' | 'this-month') => {
    setPerfDatePreset(preset);
    if (preset === 'all') {
      setPerfStartDate('');
      setPerfEndDate('');
      return;
    }
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    if (preset === 'prev-month') {
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const formatISO = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    setPerfStartDate(formatISO(firstDay));
    setPerfEndDate(formatISO(lastDay));
  };

  const filteredSalesForPerformance = useMemo(() => {
    return displaySales.filter(s => {
      if (!s.created_at) return true;
      const saleDate = new Date(s.created_at);
      if (perfStartDate) {
        const start = new Date(`${perfStartDate}T00:00:00`);
        if (saleDate < start) return false;
      }
      if (perfEndDate) {
        const end = new Date(`${perfEndDate}T23:59:59.999`);
        if (saleDate > end) return false;
      }
      return true;
    });
  }, [displaySales, perfStartDate, perfEndDate]);

  const cashierPerformanceList = useMemo(() => {
    return displayCashiers.filter(c => c.role !== 'manager').map(cashier => {
      const cashierSales = filteredSalesForPerformance.filter(s => 
        (s.cashier_id && s.cashier_id === cashier.id) ||
        (s.cashier_name && s.cashier_name.trim().toLowerCase() === cashier.name.trim().toLowerCase())
      );

      const totalRevenue = cashierSales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalTransactions = cashierSales.length;
      const totalItemsSold = cashierSales.reduce((sum, s) => {
        return sum + (s.items ? s.items.reduce((iSum, item) => iSum + (item.quantity || 0), 0) : 0);
      }, 0);
      const sortedSales = [...cashierSales].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const lastActive = sortedSales.length > 0 ? sortedSales[0].created_at : null;

      return {
        cashier,
        totalRevenue,
        totalTransactions,
        totalItemsSold,
        lastActive,
        sales: sortedSales
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [displayCashiers, filteredSalesForPerformance]);

  const topCashierPerf = cashierPerformanceList.length > 0 ? cashierPerformanceList[0] : null;
  const maxCashierRevenue = topCashierPerf && topCashierPerf.totalRevenue > 0 ? topCashierPerf.totalRevenue : 1;
  const totalCashierSalesVolume = cashierPerformanceList.reduce((acc, c) => acc + c.totalRevenue, 0);
  const totalCashierTxCount = cashierPerformanceList.reduce((acc, c) => acc + c.totalTransactions, 0);

  const startEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setShowProductModal(true);
  };

  const triggerDeleteProduct = (id: string, name: string) => {
    setDeleteConfirm({
      id,
      type: 'product',
      title: 'Delete Product?',
      description: `Are you sure you want to delete "${name}"? Historical sales and stock audit logs for this item will be safely preserved.`
    });
    setDeleteError(null);
  };

  const triggerDeleteCashier = (id: string, name: string) => {
    setDeleteConfirm({
      id,
      type: 'cashier',
      title: 'Revoke Cashier Access?',
      description: `Are you sure you want to revoke staff access for "${name}"? Past sales transactions recorded by this cashier will remain intact.`
    });
    setDeleteError(null);
  };

  const triggerDeleteBranch = (id: string, name: string) => {
    setDeleteConfirm({
      id,
      type: 'branch',
      title: 'Delete Branch Outlet?',
      description: `Are you sure you want to delete branch outlet "${name}"? Cashiers and products currently assigned to this branch will become unassigned and need to be reassigned.`
    });
    setDeleteError(null);
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirm || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (deleteConfirm.type === 'branch') {
        await dbService.branches.delete(deleteConfirm.id);
      } else if (deleteConfirm.type === 'cashier') {
        await dbService.auth.deleteCashier(deleteConfirm.id);
      } else if (deleteConfirm.type === 'product') {
        await dbService.products.delete(deleteConfirm.id);
      } else if (deleteConfirm.type === 'cash-flow') {
        await dbService.cashFlow.delete(deleteConfirm.id);
      }
      await loadData();
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error('Delete execution error:', err);
      setDeleteError(err.message || 'Failed to complete deletion. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setShowBranchModal(true);
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    try {
      await dbService.branches.update(branch.id, { is_active: !branch.is_active });
      await loadData();
      toast(`Branch ${branch.name} ${branch.is_active ? 'deactivated' : 'activated'}.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to update branch status.', 'error');
    }
  };

  // Unique categories for filters
  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(displayProducts.map(p => p.category)))];
  }, [displayProducts]);

  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const mainTabs = user.role === 'manager' 
    ? (['products', 'cash-flow'] as const)
    : (['overview', 'products', 'cashiers', 'cash-flow', 'branches'] as const);
  const moreTabs = user.role === 'manager'
    ? (['staff-performance', 'label-generator', 'sale-report', 'delete-requests', 'change-password'] as const)
    : (['staff-performance', 'transactions', 'settings', 'label-generator', 'sale-report', 'delete-requests', 'change-password'] as const);
  const pendingDeleteCount = useMemo(() => Array.isArray(deleteRequests) ? deleteRequests.filter(r => r && r.status === 'pending').length : 0, [deleteRequests]);

  // Back button: each surface pops in the reverse order it was opened, so a
  // delete confirmation raised from inside a modal closes before that modal.
  useBackDismiss(showMoreMenu, () => setShowMoreMenu(false));
  useBackDismiss(showLogoutConfirm, () => setShowLogoutConfirm(false));
  useBackDismiss(showProductModal, () => setShowProductModal(false));
  useBackDismiss(showCashierModal, () => setShowCashierModal(false));
  useBackDismiss(showBranchModal, () => setShowBranchModal(false));
  useBackDismiss(showBarcodeModal, () => setShowBarcodeModal(false));
  useBackDismiss(showSqlModal, () => setShowSqlModal(false));
  useBackDismiss(showCsvModal, () => setShowCsvModal(false));
  useBackDismiss(restockProduct !== null, () => setRestockProduct(null));
  useBackDismiss(showCashFlowModal, () => setShowCashFlowModal(false));
  useBackDismiss(selectedCashierForHistory !== null, () => setSelectedCashierForHistory(null));
  useBackDismiss(deleteConfirm !== null, () => setDeleteConfirm(null));

  // Back retraces visited tabs and stops at Overview.
  useBackTabHistory(activeTab, setActiveTab, 'overview');

  return (
    <div className="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100/80 flex flex-col lg:flex-row overflow-hidden">

      {/* DESKTOP LEFT SIDEBAR NAVIGATION */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200 z-30 overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-center space-x-3">
          {businessProfile.logo_url ? (
            <img
              src={businessProfile.logo_url}
              alt="Logo"
              className="w-10 h-10 rounded-xl object-cover border border-slate-200 p-0.5 shadow-xs shrink-0"
            />
          ) : (
            <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black text-xl shadow-xs shrink-0">
              {businessProfile.name ? businessProfile.name.charAt(0).toUpperCase() : 'M'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-slate-900 text-sm truncate">{businessProfile.name || 'MiBayate POS'}</h2>
            <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isSupabaseConfigured ? 'bg-black' : 'bg-slate-400'} animate-pulse-soft`} />
              {isSupabaseConfigured ? 'Cloud Connected' : 'Offline Mode'}
            </p>
          </div>
        </div>

        <div className="p-3 space-y-5 flex-1">
          <div>
            <p className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Main Menu</p>
            <div className="space-y-1">
              {user.role === 'owner' && (
                <button onClick={() => handleTabSwitch('overview')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'overview' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <TrendingUp className="w-4 h-4" /><span>Dashboard</span>
                </button>
              )}
              <button onClick={() => handleTabSwitch('products')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'products' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Package className="w-4 h-4" /><span>Products Catalog</span>
              </button>
              {user.role === 'owner' && (
                <button onClick={() => handleTabSwitch('cashiers')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'cashiers' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <Users className="w-4 h-4" /><span>Staff & Cashiers</span>
                </button>
              )}
              <button onClick={() => handleTabSwitch('cash-flow')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'cash-flow' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Wallet className="w-4 h-4" /><span>Cash Flow</span>
              </button>
              {user.role === 'owner' && (
                <button onClick={() => handleTabSwitch('branches')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'branches' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <Building2 className="w-4 h-4" /><span>Stores & Branches</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Management</p>
            <div className="space-y-1">
              <button onClick={() => handleTabSwitch('delete-requests')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'delete-requests' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <div className="flex items-center gap-3">
                  <Trash2 className="w-4 h-4 text-slate-500" /><span>Delete Requests</span>
                </div>
                {pendingDeleteCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white">
                    {pendingDeleteCount}
                  </span>
                )}
              </button>
              <button onClick={() => handleTabSwitch('staff-performance')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'staff-performance' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Award className="w-4 h-4" /><span>Staff Performance</span>
              </button>
              {user.role === 'owner' && (
                <button onClick={() => handleTabSwitch('transactions')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'transactions' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <Clipboard className="w-4 h-4" /><span>Audit Logs & History</span>
                </button>
              )}
              <button onClick={() => handleTabSwitch('sale-report')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'sale-report' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Receipt className="w-4 h-4" /><span>Sale Report</span>
              </button>
              {user.role === 'owner' && (
                <button onClick={() => handleTabSwitch('settings')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <Store className="w-4 h-4" /><span>Business & Branding</span>
                </button>
              )}
              <button onClick={() => handleTabSwitch('label-generator')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'label-generator' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Printer className="w-4 h-4" /><span>Label Generator</span>
              </button>
              <button onClick={() => handleTabSwitch('change-password')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'change-password' ? 'bg-black text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Key className="w-4 h-4" /><span>Change Password</span>
              </button>
              <button onClick={() => setShowUiSizeModal(true)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  <span>Display & UI Size</span>
                </div>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                  {Math.round(uiScale * 100)}%
                </span>
              </button>
            </div>
          </div>

        </div>

        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-900 truncate">{user.name}</p>
            <p className="text-[10px] font-bold text-slate-400 capitalize">{user.role}</p>
          </div>
          <button onClick={() => setShowLogoutConfirm(true)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="lg:hidden bg-white border-b border-slate-200/80 shrink-0 safe-area-top z-30">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              {businessProfile.logo_url ? (
                <img
                  src={businessProfile.logo_url}
                  alt="Logo"
                  className="w-9 h-9 rounded-xl object-cover bg-white border border-slate-200 p-0.5 shadow-xs shrink-0"
                />
              ) : (
                <div className="w-9 h-9 bg-black text-white rounded-xl flex items-center justify-center font-black text-lg shadow-md shrink-0">
                  {businessProfile.name ? businessProfile.name.charAt(0).toUpperCase() : 'M'}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 truncate">
                  {activeTab === 'overview'
                    ? 'Dashboard'
                    : activeTab === 'cashiers'
                    ? 'Staff'
                    : activeTab === 'delete-requests'
                    ? 'Delete Requests'
                    : activeTab === 'staff-performance'
                    ? 'Staff Performance'
                    : activeTab === 'settings'
                    ? 'Branding'
                    : activeTab === 'transactions'
                    ? 'Audit Logs'
                    : activeTab === 'cash-flow'
                    ? 'Cash Flow'
                    : activeTab === 'label-generator'
                    ? 'Label Designer'
                    : activeTab === 'sale-report'
                    ? 'Sale Report'
                    : activeTab === 'change-password'
                    ? 'Change Password'
                    : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </h1>
                <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${isSupabaseConfigured ? 'bg-black' : 'bg-slate-400'} animate-pulse-soft`} />
                  {isSupabaseConfigured ? 'Cloud Connected' : 'Offline Mode'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUiSizeModal(true)}
                className="p-2 text-slate-500 hover:text-gray-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                title="Display & UI Size"
              >
                <SlidersHorizontal className="w-4.5 h-4.5" />
              </button>
              {activeTab === 'products' && (
                <button onClick={openNewProductModal} className="p-2 bg-black hover:bg-gray-800 text-white rounded-xl shadow-xs transition-all cursor-pointer">
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
              {activeTab === 'cashiers' && (
                <button onClick={openNewCashierModal} className="p-2 bg-black hover:bg-gray-800 text-white rounded-xl shadow-xs transition-all cursor-pointer">
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
              {activeTab === 'branches' && (
                <button onClick={openNewBranchModal} className="p-2 bg-black hover:bg-gray-800 text-white rounded-xl shadow-xs transition-all cursor-pointer">
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
              {activeTab === 'cash-flow' && (
                <button onClick={openNewCashFlowModal} className="p-2 bg-black hover:bg-gray-800 text-white rounded-xl shadow-xs transition-all cursor-pointer">
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Desktop Header Top Bar (Hidden on Mobile) */}
        <header className="hidden lg:flex items-center justify-between px-6 h-16 bg-white border-b border-slate-200 shrink-0 z-20">
          <div>
            <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'overview'
                ? 'Overview Analytics'
                : activeTab === 'products'
                ? 'Products Inventory'
                : activeTab === 'cashiers'
                ? 'Staff & Cashier Accounts'
                : activeTab === 'delete-requests'
                ? 'Sales Delete Requests'
                : activeTab === 'staff-performance'
                ? 'Staff Performance & Metrics'
                : activeTab === 'settings'
                ? 'Business Identity & Branding'
                : activeTab === 'transactions'
                ? 'Audit Logs & Transactions'
                : activeTab === 'cash-flow'
                ? 'Cash Flow Ledger'
                : activeTab === 'label-generator'
                ? 'Label Generator & Layout Designer'
                : activeTab === 'sale-report'
                ? 'Sale Report'
                : activeTab === 'change-password'
                ? 'Change Account Password'
                : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Managing {businessProfile.name || 'Retail POS System'}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowUiSizeModal(true)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Adjust Display & UI Scale"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>UI Size ({Math.round(uiScale * 100)}%)</span>
            </button>

            {branches.length > 0 && user.role !== 'manager' && (
              <select
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-gray-900 cursor-pointer"
              >
                <option value="all">All Store Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {activeTab === 'products' && (
              <button onClick={openNewProductModal} className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /><span>Add Product</span>
              </button>
            )}
            {activeTab === 'cashiers' && (
              <button onClick={openNewCashierModal} className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /><span>Add Staff Member</span>
              </button>
            )}
            {activeTab === 'branches' && (
              <button onClick={openNewBranchModal} className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /><span>Add Store Branch</span>
              </button>
            )}
            {activeTab === 'cash-flow' && (
              <button onClick={openNewCashFlowModal} className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /><span>Add Entry</span>
              </button>
            )}
          </div>
        </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Content Body */}
        <div className="p-3 sm:p-6 md:p-8 flex-1 overflow-y-auto android-scroll">
          {isLoading || isTabChanging ? (
            <div className="space-y-6 animate-pulse">
              {/* Skeleton Header */}
              <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-5 w-48 bg-slate-200 rounded-lg" />
                  <div className="h-3 w-64 bg-slate-100 rounded-md" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-9 w-28 bg-slate-200 rounded-xl" />
                  <div className="h-9 w-32 bg-gray-200/60 rounded-xl" />
                </div>
              </div>

              {/* Skeleton Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
                    <div className="h-3 w-20 bg-slate-200 rounded" />
                    <div className="h-6 w-28 bg-slate-200 rounded-md" />
                  </div>
                ))}
              </div>

              {/* Skeleton Table / Cards List */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="bg-slate-50/80 p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                  <div className="h-4 w-16 bg-slate-200 rounded" />
                </div>
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-xl shrink-0" />
                        <div className="space-y-2">
                          <div className="h-4 w-40 bg-slate-200 rounded" />
                          <div className="h-3 w-24 bg-slate-100 rounded" />
                        </div>
                      </div>
                      <div className="h-4 w-20 bg-slate-200 rounded" />
                      <div className="h-6 w-24 bg-slate-100 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
            {/* OVERVIEW ANALYTICS TAB */}
            {activeTab === 'overview' && (
              <OverviewTab 
                displaySales={displaySales}
                displayProducts={displayProducts}
                products={products}
                cashierPerformanceList={cashierPerformanceList}
                maxCashierRevenue={maxCashierRevenue}
                setActiveTab={setActiveTab}
              />
            )}

            {/* CASH FLOW MANAGEMENT TAB */}
            {activeTab === 'cash-flow' && (
              <CashFlowTab 
                user={user}
                branches={branches}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                cashFlowEntries={displayCashFlow}
                displaySales={displaySales}
                openNewCashFlowModal={openNewCashFlowModal}
                startEditCashFlow={startEditCashFlow}
                triggerDeleteCashFlow={triggerDeleteCashFlow}
              />
            )}

            {/* PRODUCT CATALOG & STOCK CONTROLLER */}
            {activeTab === 'products' && (
              <ProductsTab
                user={user}
                branches={branches}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                displayProducts={displayProducts}
                categories={categories}
                setShowCsvModal={setShowCsvModal}
                handleExportCsv={handleExportCsv}
                openBarcodeModal={(prod) => { setSelectedSingleProduct(prod); setShowSingleLabelModal(true); }}
                startEditProduct={startEditProduct}
                openQuickRestock={openQuickRestock}
                triggerDeleteProduct={triggerDeleteProduct}
              />
            )}

            {/* CASHIER ACCOUNTS MANAGEMENT TAB */}
            {activeTab === 'cashiers' && (
              <CashiersTab 
                user={user}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                startEditCashier={startEditCashier}
                triggerDeleteCashier={triggerDeleteCashier}
                openNewCashierModal={openNewCashierModal}
              />
            )}

            {activeTab === 'staff-performance' && (
              <StaffPerformanceTab 
                user={user}
                branches={branches}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                perfDatePreset={perfDatePreset}
                perfStartDate={perfStartDate}
                perfEndDate={perfEndDate}
                setPerfStartDate={setPerfStartDate}
                setPerfEndDate={setPerfEndDate}
                setPerfDatePreset={setPerfDatePreset}
                handlePerfMonthPreset={handlePerfMonthPreset}
                cashierPerformanceList={cashierPerformanceList}
                topCashierPerf={topCashierPerf}
                totalCashierSalesVolume={totalCashierSalesVolume}
                totalCashierTxCount={totalCashierTxCount}
                setSelectedCashierForHistory={setSelectedCashierForHistory}
                startEditCashier={startEditCashier}
                sales={sales}
                cashiers={cashiers}
              />
            )}

            {/* SYSTEM AUDIT & TRANSACTION LOGS */}
            {activeTab === 'transactions' && (
              <TransactionsTab 
                user={user}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
              />
            )}
            {/* BRANCH OUTLETS TAB */}
            {activeTab === 'branches' && (
              <BranchesTab 
                openNewBranchModal={openNewBranchModal}
                startEditBranch={startEditBranch}
                triggerDeleteBranch={triggerDeleteBranch}
              />
            )}

            {/* LABEL GENERATOR & DESIGNER TAB */}
            {activeTab === 'label-generator' && (
              <LabelGeneratorTab
                products={products}
                currencySymbol={businessProfile.currency || 'Ks'}
                businessName={businessProfile.name}
              />
            )}

            {/* SALE REPORT TAB */}
            {activeTab === 'sale-report' && (
              <SaleReportTab
                sales={displaySales}
                branches={branches}
                cashiers={displayCashiers}
                currency={businessProfile.currency || 'Ks'}
              />
            )}

            {/* CHANGE PASSWORD TAB */}
            {activeTab === 'change-password' && (
              <ChangePasswordTab user={user} />
            )}

            {/* BUSINESS PROFILE & BRANDING SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-slate-900 via-gray-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/20 text-gray-300 text-xs font-bold border border-gray-400/30">
                      <Store className="w-3.5 h-3.5" />
                      <span>Store Identity & Branding</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">Business Profile & Logo Management</h3>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                      Manage your business name, logo, contact details, currency symbol, and custom receipt notes. Changes reflect instantly on POS receipts and navigation headers.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setBusinessForm(businessProfile);
                      setBusinessSuccessMsg(null);
                      setBusinessErrorMsg(null);
                    }}
                    className="self-start md:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                    <span>Reset Changes</span>
                  </button>
                </div>

                {/* Notifications */}
                {businessSuccessMsg && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-xs font-bold flex items-center gap-2 shadow-xs animate-fade-in">
                    <CheckCircle className="w-5 h-5 text-gray-900 shrink-0" />
                    <span>{businessSuccessMsg}</span>
                  </div>
                )}

                {businessErrorMsg && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold flex items-center gap-2 shadow-xs animate-fade-in">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <span>{businessErrorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleBusinessSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Form Settings */}
                  <div className="lg:col-span-7 space-y-6">
                    {/* Card 1: Store Name & Logo */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5">
                      <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-gray-900" />
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm">Business Identity & Branding</h4>
                          <p className="text-[11px] text-slate-400">Set your store's display name, slogan, and logo image</p>
                        </div>
                      </div>

                      {/* Business Name Field */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Business Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={businessForm.name}
                          onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })}
                          placeholder="e.g. RetailHub Supermart"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 focus:outline-none focus:border-gray-900 focus:bg-white transition-all"
                        />
                      </div>

                      {/* Tagline / Subtitle */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Store Tagline / Slogan
                        </label>
                        <input
                          type="text"
                          value={businessForm.tagline || ''}
                          onChange={(e) => setBusinessForm({ ...businessForm, tagline: e.target.value })}
                          placeholder="e.g. Quality Everyday Groceries & Mart"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-900 focus:outline-none focus:border-gray-900 focus:bg-white transition-all"
                        />
                      </div>

                      {/* Business Logo Section */}
                      <div className="space-y-3 pt-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Business Logo
                        </label>

                        <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                          {/* Logo Preview */}
                          <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative group">
                            {businessForm.logo_url ? (
                              <img
                                src={businessForm.logo_url}
                                alt="Logo Preview"
                                className="w-full h-full object-cover p-1"
                              />
                            ) : (
                              <div className="flex flex-col items-center text-slate-400">
                                <Image className="w-7 h-7 mb-0.5" />
                                <span className="text-[9px] font-bold">No Logo</span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                              {/* Upload File Button */}
                              <label className="px-3.5 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload Image File</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoFileUpload}
                                  className="hidden"
                                />
                              </label>

                              {businessForm.logo_url && (
                                <button
                                  type="button"
                                  onClick={() => setBusinessForm({ ...businessForm, logo_url: '' })}
                                  className="px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-slate-200 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove Logo</span>
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Supported formats: PNG, JPG, WEBP, SVG (Max size: 3MB).
                            </p>
                          </div>
                        </div>

                        {/* Image URL Direct Input */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Or paste Image Web URL:
                          </label>
                          <input
                            type="url"
                            value={businessForm.logo_url || ''}
                            onChange={(e) => setBusinessForm({ ...businessForm, logo_url: e.target.value })}
                            placeholder="https://example.com/logo.png"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-gray-900 focus:bg-white"
                          />
                        </div>

                        {/* Preset Sample Vector Logos (Monochrome Black & White) */}
                        <div className="pt-2">
                          <label className="block text-[11px] font-bold text-slate-600 mb-2">
                            Quick Sample Vector Logos (Black & White Theme):
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {[
                              {
                                label: 'Retail Store',
                                desc: 'Storefront',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="%2309090b"/><path d="M25 40 L50 25 L75 40 V75 H25 Z M35 75 V52 H65 V75" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="42" y="58" width="16" height="17" fill="white" rx="2"/></svg>`
                              },
                              {
                                label: 'Smart Barcode',
                                desc: 'Scanner POS',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="96" height="96" x="2" y="2" rx="24" fill="white" stroke="%2309090b" stroke-width="4"/><path d="M25 30 V70 M34 30 V70 M40 30 V70 M52 30 V70 M60 30 V70 M68 30 V70 M75 30 V70" stroke="%2309090b" stroke-width="5" stroke-linecap="round"/><path d="M20 50 H80" stroke="%2309090b" stroke-width="4" stroke-dasharray="4 4"/></svg>`
                              },
                              {
                                label: 'Shopping Bag',
                                desc: 'Boutique',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="%2309090b"/><path d="M30 40 H70 L75 80 H25 Z" fill="none" stroke="white" stroke-width="6" stroke-linejoin="round"/><path d="M40 40 V30 C40 24.5 44.5 20 50 20 C55.5 20 60 24.5 60 30 V40" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>`
                              },
                              {
                                label: 'MB Badge',
                                desc: 'Minimal Crest',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="96" height="96" x="2" y="2" rx="24" fill="%2309090b"/><text x="50" y="66" font-family="sans-serif" font-weight="900" font-size="42" text-anchor="middle" fill="white" letter-spacing="-2">MB</text><circle cx="50" cy="50" r="42" fill="none" stroke="white" stroke-width="3" stroke-dasharray="8 6"/></svg>`
                              },
                              {
                                label: 'Price Tag',
                                desc: 'Discount & Sale',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="96" height="96" x="2" y="2" rx="24" fill="white" stroke="%2309090b" stroke-width="4"/><path d="M30 55 L55 30 H75 V50 L50 75 Z" fill="%2309090b" stroke="%2309090b" stroke-width="4" stroke-linejoin="round"/><circle cx="65" cy="40" r="4" fill="white"/></svg>`
                              },
                              {
                                label: 'Crown Luxury',
                                desc: 'Premium Store',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="%2309090b"/><path d="M25 70 L20 35 L38 52 L50 25 L62 52 L80 35 L75 70 Z" fill="white" stroke="white" stroke-width="4" stroke-linejoin="round"/><rect x="25" y="74" width="50" height="6" fill="white" rx="3"/></svg>`
                              },
                              {
                                label: 'Fast Cart',
                                desc: 'Supermarket',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="96" height="96" x="2" y="2" rx="24" fill="white" stroke="%2309090b" stroke-width="4"/><path d="M22 30 H32 L42 62 H72 L78 38 H35" fill="none" stroke="%2309090b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="45" cy="74" r="6" fill="%2309090b"/><circle cx="68" cy="74" r="6" fill="%2309090b"/></svg>`
                              },
                              {
                                label: 'Eco Shop',
                                desc: 'Organic Mart',
                                svg: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="%2309090b"/><path d="M50 20 C30 20 25 45 50 75 C75 45 70 20 50 20 Z" fill="none" stroke="white" stroke-width="6" stroke-linejoin="round"/><path d="M50 20 V75" stroke="white" stroke-width="4"/></svg>`
                              }
                            ].map((preset, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setBusinessForm({ ...businessForm, logo_url: preset.svg })}
                                className="p-2 border border-slate-200 hover:border-black bg-white rounded-xl flex items-center gap-2.5 text-left transition-all cursor-pointer group hover:shadow-xs"
                              >
                                <img src={preset.svg} alt={preset.label} className="w-9 h-9 rounded-lg object-contain shrink-0 group-hover:scale-105 transition-transform" />
                                <div className="min-w-0 flex-1">
                                  <span className="block text-[10px] font-extrabold text-slate-900 truncate leading-tight">{preset.label}</span>
                                  <span className="block text-[9px] font-medium text-slate-400 truncate">{preset.desc}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Contact & Receipt Options */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
                      <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-gray-900" />
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm">Receipt & Contact Details</h4>
                          <p className="text-[11px] text-slate-400">Configure store contact information and receipt details</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Phone Number
                          </label>
                          <input
                            type="text"
                            value={businessForm.phone || ''}
                            onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })}
                            placeholder="+95 9 123 456 789"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-900 focus:outline-none focus:border-gray-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={businessForm.email || ''}
                            onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })}
                            placeholder="info@yourshop.com"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-900 focus:outline-none focus:border-gray-900"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Store Address
                        </label>
                        <input
                          type="text"
                          value={businessForm.address || ''}
                          onChange={(e) => setBusinessForm({ ...businessForm, address: e.target.value })}
                          placeholder="No. 123 Main Road, Yangon, Myanmar"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-900 focus:outline-none focus:border-gray-900"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Currency Symbol / Text
                          </label>
                          <input
                            type="text"
                            value={businessForm.currency || 'Ks'}
                            onChange={(e) => setBusinessForm({ ...businessForm, currency: e.target.value })}
                            placeholder="Ks, $, MMK"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 focus:outline-none focus:border-gray-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Default Tax Rate (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={businessForm.tax_rate ?? 5}
                            onChange={(e) => setBusinessForm({ ...businessForm, tax_rate: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 focus:outline-none focus:border-gray-900"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Printed Receipt Footer Note
                        </label>
                        <textarea
                          rows={2}
                          value={businessForm.receipt_footer || ''}
                          onChange={(e) => setBusinessForm({ ...businessForm, receipt_footer: e.target.value })}
                          placeholder="Thank you for shopping with us! Please come again."
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-900 focus:outline-none focus:border-gray-900 resize-none"
                        />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5">
                      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-5 h-5 text-gray-900" />
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-sm">Display & UI Scale</h4>
                            <p className="text-[11px] text-slate-400">Adjust UI scaling, font sizes, and layout density</p>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-extrabold px-2.5 py-0.5 bg-black text-white rounded-full">
                          {Math.round(uiScale * 100)}%
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                            Preset Scale Options
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {uiPresets.map((preset) => {
                              const isActive = Math.abs(uiScale - preset.value) < 0.01;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => setUiScale(preset.value)}
                                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                    isActive
                                      ? 'bg-black text-white border-black shadow-xs'
                                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-extrabold">{preset.label}</span>
                                    {isActive && <Check className="w-3.5 h-3.5" />}
                                  </div>
                                  <span className={`text-[10px] font-mono mt-1 ${isActive ? 'text-gray-300' : 'text-slate-500'}`}>
                                    {Math.round(preset.value * 100)}%
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                              Custom Scale Slider
                            </label>
                            <span className="text-[10px] font-medium text-slate-500">
                              Range: {Math.round(minUiScale * 100)}% – {Math.round(maxUiScale * 100)}%
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const next = Math.round((uiScale - stepUiScale) * 100) / 100;
                                if (next >= minUiScale) setUiScale(next);
                              }}
                              disabled={uiScale <= minUiScale}
                              className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs active-scale"
                              title="Decrease scale"
                            >
                              <Minus className="w-4 h-4" />
                            </button>

                            <input
                              type="range"
                              min={minUiScale}
                              max={maxUiScale}
                              step={stepUiScale}
                              value={uiScale}
                              onChange={(e) => setUiScale(parseFloat(e.target.value))}
                              className="flex-1 accent-black cursor-pointer"
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const next = Math.round((uiScale + stepUiScale) * 100) / 100;
                                if (next <= maxUiScale) setUiScale(next);
                              }}
                              disabled={uiScale >= maxUiScale}
                              className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs active-scale"
                              title="Increase scale"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <p className="text-[11px] text-slate-500 font-medium">
                            Saved automatically in local storage on this device.
                          </p>
                          <button
                            type="button"
                            onClick={resetUiScale}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active-scale"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reset (100%)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={businessSaving}
                        className="w-full sm:w-auto px-6 py-3 bg-black hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {businessSaving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Saving Changes...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Save Business Profile & Logo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Real-Time Live Receipts & Header Preview */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Live Receipt Card */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4 sticky top-24">
                      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-gray-900" />
                          <h4 className="font-extrabold text-slate-900 text-xs">Live Receipt Preview</h4>
                        </div>
                        <span className="px-2 py-0.5 bg-gray-50 text-gray-900 font-bold text-[9px] rounded-full uppercase">
                          Real-Time POS
                        </span>
                      </div>

                      {/* Mock Thermal Receipt Box */}
                      <div className="bg-slate-100 p-4 rounded-xl font-mono text-[11px] text-slate-800 leading-relaxed shadow-inner border border-slate-200">
                        <div className="bg-white p-4 border border-slate-200 rounded-md space-y-3 shadow-2xs relative">
                          {/* Top Logo & Header */}
                          <div className="text-center space-y-1">
                            {businessForm.logo_url ? (
                              <img
                                src={businessForm.logo_url}
                                alt="Logo Preview"
                                className="w-12 h-12 object-contain mx-auto rounded-lg mb-1"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-black text-white font-black text-lg rounded-xl flex items-center justify-center mx-auto shadow-xs mb-1">
                                {businessForm.name ? businessForm.name.charAt(0).toUpperCase() : 'R'}
                              </div>
                            )}

                            <h4 className="font-black text-xs uppercase text-slate-900 tracking-tight">
                              {businessForm.name || 'Your Business Name'}
                            </h4>

                            {businessForm.tagline && (
                              <p className="text-[9px] font-sans text-slate-500 font-medium">
                                {businessForm.tagline}
                              </p>
                            )}

                            {businessForm.address && (
                              <p className="text-[9px] text-slate-400 leading-tight">
                                📍 {businessForm.address}
                              </p>
                            )}

                            {businessForm.phone && (
                              <p className="text-[9px] text-slate-400">
                                📞 {businessForm.phone}
                              </p>
                            )}
                          </div>

                          {/* Order Metadata */}
                          <div className="border-t border-dashed border-slate-300 pt-2 text-[9px] space-y-0.5 text-slate-500">
                            <div className="flex justify-between">
                              <span>Receipt #:</span>
                              <span className="font-bold text-slate-700">RCP-2026-8819</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Date:</span>
                              <span>{new Date().toLocaleDateString()}</span>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                            <div className="flex justify-between font-bold text-slate-900 text-[9px]">
                              <span>Sample Item</span>
                              <span>Amount</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-700">
                              <span>1x Premium Product A</span>
                              <span>12,000 {businessForm.currency || 'Ks'}</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-700">
                              <span>2x Essential Goods B</span>
                              <span>8,000 {businessForm.currency || 'Ks'}</span>
                            </div>
                          </div>

                          {/* Total */}
                          <div className="border-t border-dashed border-slate-300 pt-2 text-[9px] space-y-1">
                            <div className="flex justify-between text-slate-500">
                              <span>Subtotal:</span>
                              <span>20,000 {businessForm.currency || 'Ks'}</span>
                            </div>
                            <div className="flex justify-between font-black text-slate-900 text-xs pt-1 border-t border-dotted border-slate-300">
                              <span>TOTAL DUE:</span>
                              <span className="text-gray-900">20,000 {businessForm.currency || 'Ks'}</span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-dashed border-slate-300 pt-2 text-center">
                            <p className="text-[9px] text-slate-500 italic">
                              "{businessForm.receipt_footer || 'Thank you for shopping with us!'}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Database Setup Card */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-gray-900" />
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-xs">Supabase Database Setup</h4>
                            <p className="text-[10px] text-slate-400">Run this SQL in your Supabase SQL Editor</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isSupabaseConfigured ? 'bg-gray-50 text-gray-900' : 'bg-gray-50 text-gray-900'}`}>
                          {isSupabaseConfigured ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>

                      <button
                        onClick={handleCopySql}
                        className={`w-full px-4 py-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-sm ${
                          copiedSql
                            ? 'bg-black text-white'
                            : 'bg-black hover:bg-gray-800 text-white'
                        }`}
                      >
                        {copiedSql ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedSql ? 'Copied to Clipboard!' : '1-Tap Copy Full SQL Schema'}</span>
                      </button>

                      <button
                        onClick={handleDownloadSql}
                        className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .sql File</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
            {activeTab === 'delete-requests' && (
              <DeleteRequestsTab
                user={user}
                branches={branches}
                selectedBranchId={selectedBranchId}
                onDataChanged={loadData}
              />
            )}
          </div>
        )}
        </div>
      </main>

      {/* PRODUCT ADD/EDIT MODAL DIALOG */}
      {showProductModal && (
        <ProductModal
          user={user}
          editingProduct={editingProduct}
          products={products}
          branches={branches}
          categories={categories}
          onClose={() => {
            setShowProductModal(false);
            setEditingProduct(null);
          }}
          onSuccess={(savedProduct) => {
            if (savedProduct) {
              setProducts(
                editingProduct
                  ? products.map(p => (p.id === savedProduct.id ? savedProduct : p))
                  : [savedProduct, ...products.filter(p => p.id !== savedProduct.id)]
              );
              if (user.role !== 'manager' && savedProduct.branch_id && selectedBranchId !== 'all' && selectedBranchId !== savedProduct.branch_id) {
                setSelectedBranchId('all');
              }
            }
            loadData(true);
          }}
        />
      )}

      {/* REGISTER CASHIER MODAL DIALOG */}
      {showCashierModal && (
        <CashierModal
          editingCashier={editingCashier}
          branches={branches}
          onClose={() => {
            setShowCashierModal(false);
            setEditingCashier(null);
          }}
          onSuccess={() => {
            loadData();
            toast(editingCashier ? 'Staff credentials updated successfully!' : 'Cashier registered successfully!', 'success');
          }}
        />
      )}

      {/* REGISTER / EDIT BRANCH MODAL DIALOG */}
      {showBranchModal && (
        <BranchModal
          editingBranch={editingBranch}
          onClose={() => {
            setShowBranchModal(false);
            setEditingBranch(null);
          }}
          onSuccess={() => {
            loadData();
            toast(editingBranch ? 'Branch updated successfully!' : 'Branch created successfully!', 'success');
          }}
        />
      )}

      {/* SUPABASE SQL SCHEMA MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-premium-xl border border-slate-100 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-black rounded-xl text-white shadow-xs">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Supabase Database Setup SQL</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Run this script in Supabase Dashboard SQL Editor</p>
                </div>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-gray-50/80 border border-gray-100 rounded-xl space-y-1.5 text-gray-900">
                <p className="font-bold text-xs flex items-center gap-1.5 text-gray-900">
                  <Shield className="w-4 h-4 text-gray-900 shrink-0" />
                  <span>How to apply to Supabase:</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-gray-900 font-medium leading-relaxed pl-1">
                  <li>Tap <strong>1-Tap Copy SQL</strong> or <strong>Download SQL File</strong> below.</li>
                  <li>Open your <strong>Supabase Dashboard</strong> in browser: <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-bold text-gray-900">supabase.com/dashboard</a></li>
                  <li>Navigate to your project &apos;s <strong>SQL Editor</strong> tab (left sidebar icon with `&gt;_`).</li>
                  <li>Paste this SQL code and tap <strong>Run</strong> (or press Ctrl/Cmd+Enter).</li>
                </ol>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SQL Schema Code</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopySql}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                      copiedSql
                        ? 'bg-black text-white'
                        : 'bg-black hover:bg-gray-800 text-white'
                    }`}
                  >
                    {copiedSql ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied!' : '1-Tap Copy SQL'}</span>
                  </button>
                  <button
                    onClick={handleDownloadSql}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-[10px] font-mono overflow-x-auto max-h-60 leading-relaxed select-all">
                  <code>{SUPABASE_SCHEMA_SQL}</code>
                </pre>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARCODE PRINTING MODAL */}
      <BarcodePrintModal
        isOpen={showBarcodeModal}
        onClose={() => setShowBarcodeModal(false)}
        products={products}
        selectedProductId={barcodeProductId}
        currencySymbol={businessProfile.currency || 'Ks'}
        businessName={businessProfile.name}
      />

      {/* SINGLE ITEM LABEL PREVIEW MODAL */}
      <SingleLabelModal
        isOpen={showSingleLabelModal}
        onClose={() => setShowSingleLabelModal(false)}
        product={selectedSingleProduct}
        currencySymbol={businessProfile.currency || 'Ks'}
        businessName={businessProfile.name}
        onOpenDesigner={() => handleTabSwitch('label-generator')}
      />

      {/* CASH FLOW ADD / EDIT ENTRY MODAL */}
      {showCashFlowModal && (
        <CashFlowModal
          user={user}
          editingCashFlow={editingCashFlow}
          branches={branches}
          onClose={() => {
            setShowCashFlowModal(false);
            setEditingCashFlow(null);
          }}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* DELETE CONFIRMATION DIALOG MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-premium-xl border border-slate-100 max-w-sm w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-red-50 rounded-xl text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">{deleteConfirm.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{deleteConfirm.description}</p>
              </div>
            </div>

            {deleteError && (
              <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASHIER SALES RECEIPTS HISTORY MODAL */}
      {selectedCashierForHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-premium-xl border border-slate-100 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-900 font-extrabold flex items-center justify-center text-sm">
                  {selectedCashierForHistory.cashier.name ? selectedCashierForHistory.cashier.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'C'}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Sales History — {selectedCashierForHistory.cashier.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {formatDisplayEmail(selectedCashierForHistory.cashier.email)} • {selectedCashierForHistory.sales.length} Total Receipts Handled
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCashierForHistory(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Sales list */}
            <div className="p-5 overflow-y-auto space-y-3.5 flex-1 bg-slate-50/30">
              {selectedCashierForHistory.sales.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No sales receipts logged by this cashier yet.
                </div>
              ) : (
                selectedCashierForHistory.sales.map((sale) => (
                  <div key={sale.id} className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-gray-900 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          {sale.id}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                          sale.payment_method === 'cash' ? 'bg-gray-50 text-gray-900 border-gray-200' :
                          sale.payment_method === 'card' ? 'bg-gray-50 text-gray-900 border-gray-200' :
                          'bg-gray-50 text-gray-900 border-gray-200'
                        }`}>
                          {sale.payment_method}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(sale.created_at).toLocaleString()}
                      </span>
                    </div>

                    {/* Receipt Items Preview */}
                    <div className="space-y-1 text-xs">
                      {sale.items && sale.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-slate-700 text-[11px]">
                          <span>{item.quantity}x {item.product_name}</span>
                          <span className="font-mono font-semibold">{formatCurrency(item.total)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">
                        {sale.customer_name ? `Customer: ${sale.customer_name}` : 'Walk-in Customer'}
                      </span>
                      <span className="font-black text-slate-900 text-sm">
                        Total: {formatCurrency(sale.total_amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">
                Grand Total: {formatCurrency(selectedCashierForHistory.sales.reduce((sum, s) => sum + s.total_amount, 0))}
              </span>
              <button
                onClick={() => setSelectedCashierForHistory(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onImportSuccess={handleImportCsvSuccess}
        branches={branches}
        defaultBranchId={user.branch_id || ''}
        defaultBranchName={user.branch_name || ''}
      />

      <QuickRestockModal
        product={restockProduct}
        isOpen={restockProduct !== null}
        onClose={() => setRestockProduct(null)}
        onRestock={handleQuickRestock}
        branches={branches}
        requireBranchSelection={selectedBranchId === 'all' && user.role !== 'manager'}
        defaultBranchId={selectedBranchId !== 'all' ? selectedBranchId : ''}
      />

      {/* Bottom Navigation Bar - Android Material Design (Hidden on Desktop) */}
      <nav className="bg-white border-t border-slate-200/80 shrink-0 safe-area-bottom z-40 lg:hidden">
        <div className="flex items-stretch h-16">
          {mainTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabSwitch(tab)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer nav-item-tap relative ${
                activeTab === tab ? 'text-gray-900' : 'text-slate-500'
              }`}
            >
              {activeTab === tab && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-black rounded-full" />
              )}
              {tab === 'overview' && <TrendingUp className="w-5 h-5" />}
              {tab === 'products' && <Package className="w-5 h-5" />}
              {tab === 'cashiers' && <Users className="w-5 h-5" />}
              {tab === 'cash-flow' && <Wallet className="w-5 h-5" />}
              {tab === 'branches' && <Building2 className="w-5 h-5" />}
              <span className="text-[10px] font-bold capitalize">
                {tab === 'overview' ? 'Home' : tab === 'products' ? 'Products' : tab === 'cashiers' ? 'Staff' : tab === 'cash-flow' ? 'Cash Flow' : 'Stores'}
              </span>
            </button>
          ))}
          <button
            onClick={() => setShowMoreMenu(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer nav-item-tap relative ${
              moreTabs.includes(activeTab as any) ? 'text-gray-900' : 'text-slate-500'
            }`}
          >
            {moreTabs.includes(activeTab as any) && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-black rounded-full" />
            )}
            <Settings className="w-5 h-5" />
            <span className="text-[10px] font-bold">More</span>
          </button>
        </div>
      </nav>

      {/* More Menu Bottom Sheet (Hidden on Desktop) */}
      {showMoreMenu && (
        <div className="bottom-sheet-overlay lg:hidden" onClick={() => setShowMoreMenu(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pt-3 pb-2">
              <div className="pull-indicator" />
            </div>
            <div className="px-4 pb-3 flex items-center justify-between border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-900">More Options</h4>
              <button onClick={() => setShowMoreMenu(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-1">
              <button
                onClick={() => { handleTabSwitch('staff-performance'); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                  activeTab === 'staff-performance' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Award className="w-5 h-5 text-gray-500" />
                <span>Staff Performance</span>
              </button>
              {user.role === 'owner' && (
                <button
                  onClick={() => { handleTabSwitch('transactions'); setShowMoreMenu(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                    activeTab === 'transactions' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Clipboard className="w-5 h-5 text-gray-500" />
                  <span>Audit Logs & History</span>
                </button>
              )}
              <button
                onClick={() => { handleTabSwitch('delete-requests'); setShowMoreMenu(false); }}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                  activeTab === 'delete-requests' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5 text-gray-500" />
                  <span>Delete Requests</span>
                </div>
                {pendingDeleteCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white">
                    {pendingDeleteCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => { handleTabSwitch('sale-report'); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                  activeTab === 'sale-report' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Receipt className="w-5 h-5 text-gray-500" />
                <span>Sale Report</span>
              </button>
              {user.role === 'owner' && (
                <button
                  onClick={() => { handleTabSwitch('settings'); setShowMoreMenu(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                    activeTab === 'settings' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Store className="w-5 h-5 text-gray-500" />
                  <span>Business & Branding</span>
                </button>
              )}

              <button
                onClick={() => { handleTabSwitch('label-generator'); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                  activeTab === 'label-generator' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Printer className="w-5 h-5 text-gray-500" />
                <span>Label Generator & Printer</span>
              </button>

              <button
                onClick={() => { handleTabSwitch('change-password'); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer active-scale ${
                  activeTab === 'change-password' ? 'bg-gray-50 text-gray-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Key className="w-5 h-5 text-gray-500" />
                <span>Change Password</span>
              </button>

              <button
                onClick={() => { setShowMoreMenu(false); setShowUiSizeModal(true); }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer active-scale"
              >
                <div className="flex items-center gap-3">
                  <SlidersHorizontal className="w-5 h-5 text-gray-500" />
                  <span>Display & UI Size</span>
                </div>
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                  {Math.round(uiScale * 100)}%
                </span>
              </button>

              <div className="border-t border-slate-100 my-2" />

              <button
                onClick={() => { setShowMoreMenu(false); setShowLogoutConfirm(true); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all cursor-pointer active-scale"
              >
                <LogOut className="w-5 h-5" />
                <span>Log Out</span>
              </button>
            </div>
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
    </div>
  );
}
