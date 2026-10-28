import { create } from 'zustand';
import { dbService } from '../lib/supabase';
import { Product, SaleWithItems, UserProfile, InventoryTransaction, Branch, BusinessProfile, CashFlowEntry, SaleDeleteRequest } from '../types';

interface PosStore {
  products: Product[];
  sales: SaleWithItems[];
  cashiers: UserProfile[];
  transactions: InventoryTransaction[];
  branches: Branch[];
  deleteRequests: SaleDeleteRequest[];
  businessProfile: BusinessProfile | null;
  cashFlowEntries: CashFlowEntry[];
  isLoading: boolean;
  loadError: string | null;
  
  setProducts: (products: Product[]) => void;
  setSales: (sales: SaleWithItems[]) => void;
  setCashiers: (cashiers: UserProfile[]) => void;
  setTransactions: (transactions: InventoryTransaction[]) => void;
  setBranches: (branches: Branch[]) => void;
  setDeleteRequests: (requests: SaleDeleteRequest[]) => void;
  setBusinessProfile: (profile: BusinessProfile) => void;
  setCashFlowEntries: (entries: CashFlowEntry[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  
  loadData: (silent?: boolean) => Promise<void>;
}

let activeFetchPromise: Promise<void> | null = null;

export const usePosStore = create<PosStore>((set) => ({
  products: [],
  sales: [],
  cashiers: [],
  transactions: [],
  branches: [],
  deleteRequests: [],
  businessProfile: null,
  cashFlowEntries: [],
  isLoading: true,
  loadError: null,
  
  setProducts: (products) => set({ products }),
  setSales: (sales) => set({ sales }),
  setCashiers: (cashiers) => set({ cashiers }),
  setTransactions: (transactions) => set({ transactions }),
  setBranches: (branches) => set({ branches }),
  setDeleteRequests: (deleteRequests) => set({ deleteRequests }),
  setBusinessProfile: (businessProfile) => set({ businessProfile }),
  setCashFlowEntries: (cashFlowEntries) => set({ cashFlowEntries }),
  setIsLoading: (isLoading) => set({ isLoading }),
  
  loadData: async (silent = false) => {
    if (activeFetchPromise) {
      await activeFetchPromise;
    }

    if (!silent) {
      set({ isLoading: true });
    }

    const run = (async () => {
      try {
        const [products, sales, cashiers, transactions, branches, businessProfile, cashFlowEntries, deleteRequests] =
          await Promise.allSettled([
            dbService.products.getAll(),
            dbService.sales.getAllWithItems(),
            dbService.auth.getCashiers(),
            dbService.transactions.getAll(),
            dbService.branches.getAll(),
            dbService.business.get(),
            dbService.cashFlow.getAll(),
            dbService.saleDeleteRequests.getAll()
          ]);

        const failed: string[] = [];
        const patch: Partial<PosStore> = {};

        if (products.status === 'fulfilled') patch.products = products.value;
        else failed.push('products');

        if (sales.status === 'fulfilled') patch.sales = sales.value;
        else failed.push('sales');

        if (cashiers.status === 'fulfilled') patch.cashiers = cashiers.value;
        else failed.push('staff');

        if (transactions.status === 'fulfilled') patch.transactions = transactions.value;
        else failed.push('inventory history');

        if (branches.status === 'fulfilled') patch.branches = branches.value;
        else failed.push('branches');

        if (businessProfile.status === 'fulfilled') patch.businessProfile = businessProfile.value || null;
        else failed.push('business profile');

        if (cashFlowEntries.status === 'fulfilled') patch.cashFlowEntries = cashFlowEntries.value;
        else failed.push('cash flow');

        if (deleteRequests.status === 'fulfilled') patch.deleteRequests = deleteRequests.value;
        else failed.push('delete requests');

        patch.loadError = failed.length > 0
          ? `Could not load ${failed.join(', ')}. Check your connection and try again.`
          : null;

        set(patch);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        set({ loadError: 'Could not load dashboard data. Check your connection and try again.' });
      } finally {
        if (!silent) {
          set({ isLoading: false });
        }
        activeFetchPromise = null;
      }
    })();

    activeFetchPromise = run;
    return run;
  }
}));
