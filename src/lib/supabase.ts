import { createClient } from '@supabase/supabase-js';
import { Branch, Product, ProductStock, Sale, SaleItem, SaleWithItems, UserProfile, InventoryTransaction, UserRole, BusinessProfile, CashFlowEntry, SaleDeleteRequest } from '../types';
import { notifyDataChanged } from './realtimeSync';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured =
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key' &&
  supabaseAnonKey !== 'your-publishable-key';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const DEFAULT_BRANCH_NAME = 'Main Store';
const DEFAULT_BRANCH_ID = 'branch-default';

const SKU_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SKU_LENGTH = 14;
const BARCODE_LENGTH = 6;
const BARCODE_MAX = 10 ** BARCODE_LENGTH - 1;

const randomSku = () => {
  let out = '';
  for (let i = 0; i < SKU_LENGTH; i++) {
    out += SKU_ALPHABET[Math.floor(Math.random() * SKU_ALPHABET.length)];
  }
  return out;
};

const normalizeSku = (value?: string | null) => (value || '').trim().toUpperCase();
const normalizeBarcode = (value?: string | null) => (value || '').trim();

export const checkBarcodeExistsInDb = async (barcode: string, branchIdOrExcludeId?: string | null, excludeId?: string): Promise<boolean> => {
  if (!supabase || !barcode) return false;
  const actualExcludeId = excludeId || (branchIdOrExcludeId && !branchIdOrExcludeId.startsWith('branch-') ? branchIdOrExcludeId : undefined);
  try {
    let query = supabase
      .from('products')
      .select('id')
      .eq('barcode', normalizeBarcode(barcode));
    if (actualExcludeId) {
      query = query.neq('id', actualExcludeId);
    }
    const { data, error } = await query.limit(1);
    if (error) throw error;
    return !!(data && data.length > 0);
  } catch (err) {
    console.warn('checkBarcodeExistsInDb lookup failed:', err);
    return false;
  }
};

export const checkSkuExistsInDb = async (sku: string, branchIdOrExcludeId?: string | null, excludeId?: string): Promise<boolean> => {
  if (!supabase || !sku) return false;
  const actualExcludeId = excludeId || (branchIdOrExcludeId && !branchIdOrExcludeId.startsWith('branch-') ? branchIdOrExcludeId : undefined);
  try {
    let query = supabase
      .from('products')
      .select('id')
      .ilike('sku', normalizeSku(sku));
    if (actualExcludeId) {
      query = query.neq('id', actualExcludeId);
    }
    const { data, error } = await query.limit(1);
    if (error) throw error;
    return !!(data && data.length > 0);
  } catch (err) {
    console.warn('checkSkuExistsInDb lookup failed:', err);
    return false;
  }
};
const collectProductCodes = async (excludeId?: string): Promise<{ skus: Set<string>; barcodes: Set<string> }> => {
  const skus = new Set<string>();
  const barcodes = new Set<string>();

  if (!supabase) return { skus, barcodes };

  try {
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku, barcode')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      data.forEach(row => {
        if (excludeId && row.id === excludeId) return;
        const sku = normalizeSku(row.sku);
        const barcode = normalizeBarcode(row.barcode);
        if (sku) skus.add(sku);
        if (barcode) barcodes.add(barcode);
      });

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }
  } catch (err) {
    console.warn('Product code lookup failed:', err);
  }

  return { skus, barcodes };
};

const generateUniqueBarcode = async (taken: Set<string>, excludeId?: string): Promise<string> => {
  let highest = 0;
  taken.forEach(code => {
    if (!/^\d+$/.test(code)) return;
    const value = parseInt(code, 10);
    if (value > highest && value <= BARCODE_MAX) highest = value;
  });

  let candidateNum = highest + 1;
  while (candidateNum <= BARCODE_MAX) {
    const candidateBarcode = String(candidateNum).padStart(BARCODE_LENGTH, '0');
    if (!taken.has(candidateBarcode)) {
      const existsInDb = await checkBarcodeExistsInDb(candidateBarcode, excludeId);
      if (!existsInDb) {
        taken.add(candidateBarcode);
        return candidateBarcode;
      }
      taken.add(candidateBarcode);
    }
    candidateNum++;
  }

  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const randomCandidate = Math.floor(100000 + Math.random() * 900000).toString();
    if (!taken.has(randomCandidate)) {
      const existsInDb = await checkBarcodeExistsInDb(randomCandidate, excludeId);
      if (!existsInDb) {
        taken.add(randomCandidate);
        return randomCandidate;
      }
      taken.add(randomCandidate);
    }
  }

  const fallbackBarcode = Date.now().toString().slice(-6);
  taken.add(fallbackBarcode);
  return fallbackBarcode;
};

const generateUniqueSku = async (taken: Set<string>, excludeId?: string): Promise<string> => {
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const sku = randomSku();
    if (!taken.has(sku)) {
      const existsInDb = await checkSkuExistsInDb(sku, excludeId);
      if (!existsInDb) {
        taken.add(sku);
        return sku;
      }
      taken.add(sku);
    }
  }

  const fallbackSku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  taken.add(fallbackSku);
  return fallbackSku;
};

const CURRENT_USER_KEY = 'retail_shop_current_user';
const MOCK_BUSINESS_KEY = 'retail_shop_business_profile';

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  name: 'RetailHub',
  tagline: 'Multi-branch Retail POS System',
  logo_url: '',
  phone: '+95 9 123 456 789',
  email: 'info@retailhub.com',
  address: 'Yangon, Myanmar',
  tax_rate: 5,
  receipt_footer: 'Thank you for shopping with us! Please come again.',
  currency: 'Ks'
};

export const formatEmailWithDefaultDomain = (input: string): string => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed}@pos.com`;
};

export const dbService = {
  auth: {
    async login(email: string, arg2?: string | UserRole, arg3?: string): Promise<UserProfile> {
      let role: UserRole | undefined = undefined;
      let password: string | undefined = undefined;

      if (arg2 === 'owner' || arg2 === 'cashier') {
        role = arg2 as UserRole;
        password = arg3;
      } else {
        password = arg2;
        role = arg3 as UserRole | undefined;
      }

      const cleanEmail = formatEmailWithDefaultDomain(email);

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }

      if (!password) {
        throw new Error('Password is required.');
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (authError) throw authError;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (error) throw error;

      let profile = data;
      if (!profile) {
        const determinedRole: UserRole = role || (cleanEmail.includes('owner') ? 'owner' : cleanEmail.includes('manager') ? 'manager' : 'cashier');
        profile = {
          id: authData.user?.id || generateId(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          role: determinedRole,
          created_at: new Date().toISOString()
        };
        await supabase.from('profiles').insert(profile).select().maybeSingle();
      }

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(profile));
      return profile as UserProfile;
    },

    async getCurrentUser(): Promise<UserProfile | null> {
      const userStr = localStorage.getItem(CURRENT_USER_KEY);

      if (!isSupabaseConfigured || !supabase) {
        return null;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', session.user.email)
            .maybeSingle();
          if (profile) {
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(profile));
            return profile as UserProfile;
          }
          if (userStr) return JSON.parse(userStr);
          return null;
        }

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData.session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', refreshData.session.user.email)
            .maybeSingle();
          if (profile) {
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(profile));
            return profile as UserProfile;
          }
          if (userStr) return JSON.parse(userStr);
          return null;
        }

        localStorage.removeItem(CURRENT_USER_KEY);
        return null;
      } catch {
        return userStr ? JSON.parse(userStr) : null;
      }
    },

    async changePassword(newPassword: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },

    async logout(): Promise<void> {
      localStorage.removeItem(CURRENT_USER_KEY);
      if (supabase) {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.warn('Supabase signOut failed:', err);
        }
      }
    },

    async getCashiers(): Promise<UserProfile[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['cashier', 'manager']);
      if (error) throw error;
      return data || [];
    },

    async addCashier(
      email: string,
      name: string,
      password?: string,
      branch_id?: string,
      branch_name?: string,
      role: UserRole = 'cashier'
    ): Promise<UserProfile> {
      if (!supabase) throw new Error('Supabase not configured.');
      const staffPassword = password && password.trim() ? password : null;
      if (!staffPassword) {
        throw new Error('Password is required for creating a cashier account.');
      }

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: formatEmailWithDefaultDomain(email),
        password: staffPassword,
      });

      if (authError) throw authError;

      if (!authData.user?.id) {
        throw new Error('User creation returned no ID from Supabase Auth.');
      }

      const newCashier: UserProfile = {
        id: authData.user.id,
        email: formatEmailWithDefaultDomain(email),
        name,
        role,
        branch_id,
        branch_name,
        created_at: new Date().toISOString()
      };

      let profileRes = await tempClient
        .from('profiles')
        .upsert(newCashier)
        .select()
        .single();

      if (profileRes.error) {
        profileRes = await supabase
          .from('profiles')
          .upsert(newCashier)
          .select()
          .single();
      }

      if (profileRes.error) throw profileRes.error;

      notifyDataChanged('profiles');
      return profileRes.data || newCashier;
    },

    async updateCashier(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { password, ...profileUpdates } = updates;
      const { data, error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('profiles');
      return data;
    },

    async deleteCashier(id: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      try {
        await supabase.from('sales').update({ cashier_id: null }).eq('cashier_id', id);
      } catch (e) {
        console.warn('Could not unlink sales cashier_id before delete:', e);
      }
      try {
        await supabase.from('sale_delete_requests').update({ cashier_id: null }).eq('cashier_id', id);
      } catch (e) {
        console.warn('Could not unlink sale_delete_requests cashier_id before delete:', e);
      }

      const { error } = await supabase.rpc('delete_user_account', { target_user_id: id });
      if (error) {
        const fallbackRes = await supabase.from('profiles').delete().eq('id', id);
        if (fallbackRes.error) throw fallbackRes.error;
      }
      notifyDataChanged('profiles');
    }
  },

  branches: {
    async getAll(): Promise<Branch[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async create(branchData: Omit<Branch, 'id' | 'created_at'>): Promise<Branch> {
      if (!supabase) throw new Error('Supabase not configured.');
      const newBranch: Branch = {
        ...branchData,
        id: 'branch-' + generateId(),
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('branches')
        .insert(newBranch)
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('branches');
      return data;
    },

    async update(id: string, updates: Partial<Omit<Branch, 'id' | 'created_at'>>): Promise<Branch> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('branches');
      return data;
    },

    async delete(id: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      await supabase.from('profiles').update({ branch_id: null, branch_name: null }).eq('branch_id', id);
      await supabase.from('product_stock').delete().eq('branch_id', id);
      await supabase.from('sales').update({ branch_id: null, branch_name: null }).eq('branch_id', id);
      await supabase.from('inventory_transactions').update({ branch_id: null, branch_name: null }).eq('branch_id', id);
      await supabase.from('cash_flow').update({ branch_id: null, branch_name: null }).eq('branch_id', id);
      const { error } = await supabase.from('branches').delete().eq('id', id);
      if (error) throw error;
      notifyDataChanged('branches');
      notifyDataChanged('product_stock');
      notifyDataChanged('products');
    }
  },

  productStocks: {
    async getAll(): Promise<ProductStock[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('product_stock')
        .select('*');
      if (error) throw error;
      return data || [];
    },

    async getByBranch(branchId: string): Promise<ProductStock[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('product_stock')
        .select('*')
        .eq('branch_id', branchId);
      if (error) throw error;
      return data || [];
    },

    async setStock(productId: string, branchId: string, quantity: number): Promise<ProductStock> {
      if (!supabase) throw new Error('Supabase not configured.');
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('product_stock')
        .upsert(
          {
            id: `pstock-${productId}-${branchId}`,
            product_id: productId,
            branch_id: branchId,
            quantity: Math.max(0, quantity),
            updated_at: now
          },
          { onConflict: 'product_id,branch_id' }
        )
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('product_stock');
      notifyDataChanged('products');
      return data;
    }
  },

  products: {
    async getAll(selectedBranchId?: string): Promise<Product[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const [{ data: products, error: prodErr }, { data: stocks, error: stockErr }] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('product_stock')
          .select('*')
      ]);

      if (prodErr) throw prodErr;
      if (stockErr) throw stockErr;

      const stocksByProduct = new Map<string, ProductStock[]>();
      (stocks || []).forEach(st => {
        const list = stocksByProduct.get(st.product_id) || [];
        list.push(st);
        stocksByProduct.set(st.product_id, list);
      });

      return (products || []).map(p => {
        const prodStocks = stocksByProduct.get(p.id) || [];
        let stock = 0;
        let branchId: string | undefined = undefined;

        if (selectedBranchId && selectedBranchId !== 'all') {
          const match = prodStocks.find(s => s.branch_id === selectedBranchId);
          stock = match ? match.quantity : 0;
          branchId = selectedBranchId;
        } else {
          // Cross-branch total stock: SUM(quantity) from product_stock
          stock = prodStocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
        }

        return {
          ...p,
          stock,
          branch_id: branchId,
          stocks: prodStocks
        };
      });
    },

    async getById(id: string, branchId?: string): Promise<Product | null> {
      if (!supabase) throw new Error('Supabase not configured.');
      const [{ data: prod, error: prodErr }, { data: stocks, error: stockErr }] = await Promise.all([
        supabase.from('products').select('*').eq('id', id).maybeSingle(),
        supabase.from('product_stock').select('*').eq('product_id', id)
      ]);
      if (prodErr) throw prodErr;
      if (!prod) return null;

      const prodStocks: ProductStock[] = stocks || [];
      let stock = 0;
      if (branchId && branchId !== 'all') {
        const match = prodStocks.find(s => s.branch_id === branchId);
        stock = match ? match.quantity : 0;
      } else {
        stock = prodStocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
      }

      return {
        ...prod,
        stock,
        branch_id: branchId,
        stocks: prodStocks
      };
    },

    async generateCodes(): Promise<{ sku: string; barcode: string }> {
      const { skus, barcodes } = await collectProductCodes();
      const sku = await generateUniqueSku(skus);
      const barcode = await generateUniqueBarcode(barcodes);
      return { sku, barcode };
    },

    async create(prod: Omit<Product, 'id' | 'created_at'>, performedBy: string): Promise<Product> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { skus, barcodes } = await collectProductCodes();
      const requestedSku = normalizeSku(prod.sku);
      const requestedBarcode = normalizeBarcode(prod.barcode);

      if (requestedSku) {
        if (await checkSkuExistsInDb(requestedSku)) {
          throw new Error(`SKU "${requestedSku}" is already used by another product.`);
        }
      }
      if (requestedBarcode) {
        if (await checkBarcodeExistsInDb(requestedBarcode)) {
          throw new Error(`Barcode "${requestedBarcode}" is already used by another product.`);
        }
      }

      const finalSku = requestedSku || (await generateUniqueSku(skus));
      const finalBarcode = requestedBarcode || (await generateUniqueBarcode(barcodes));

      const { data: allBranches } = await supabase
        .from('branches')
        .select('*')
        .order('name', { ascending: true });

      const branchesList = (allBranches && allBranches.length > 0)
        ? allBranches
        : [{ id: DEFAULT_BRANCH_ID, name: DEFAULT_BRANCH_NAME }];

      const targetBranchId = prod.branch_id || branchesList[0]?.id || DEFAULT_BRANCH_ID;
      let targetBranchName = prod.branch_name || null;
      if (!targetBranchName) {
        const found = branchesList.find(b => b.id === targetBranchId);
        if (found) targetBranchName = found.name;
      }

      const productId = generateId();
      const now = new Date().toISOString();
      const initialStockQty = Math.max(0, Number(prod.stock) || 0);

      // Insert ONE row into products (no branch_id, no stock column)
      const catalogProduct = {
        id: productId,
        name: prod.name,
        sku: finalSku,
        barcode: finalBarcode,
        price: Number(prod.price) || 0,
        cost: Number(prod.cost) || 0,
        min_stock_level: Number(prod.min_stock_level) || 5,
        category: prod.category || 'General',
        image: prod.image || null,
        description: prod.description || '',
        use_stock: prod.use_stock !== false,
        unit_amount: Number(prod.unit_amount) || 1,
        unit_name: prod.unit_name || 'pcs',
        price_variant: prod.price_variant || 'Standard',
        expiry_date: prod.expiry_date || null,
        updated_at: prod.updated_at || now,
        created_at: now
      };

      const { data: insertedProduct, error: prodErr } = await supabase
        .from('products')
        .insert(catalogProduct)
        .select()
        .single();

      if (prodErr) {
        console.error('Database error in products.create:', prodErr);
        if (
          (prodErr as any).code === '23505' ||
          /duplicate key value violates unique constraint/i.test(prodErr.message || '')
        ) {
          if (/barcode/i.test(prodErr.message || '')) {
            throw new Error(`Barcode "${finalBarcode}" already exists in the database.`);
          }
          if (/sku/i.test(prodErr.message || '')) {
            throw new Error(`SKU "${finalSku}" already exists in the database.`);
          }
          throw new Error('A product with this SKU or Barcode already exists in the database.');
        }
        if (
          (prodErr as any).code === '42501' ||
          /row-level security|violates.*policy|permission denied/i.test(prodErr.message || '')
        ) {
          throw new Error('Unable to create product. Please check your permissions and try again.');
        }
        throw prodErr;
      }

      // Insert one row per branch into product_stock (quantity 0 except the branch it was added from)
      const stockRows: ProductStock[] = branchesList.map(branch => ({
        id: `pstock-${productId}-${branch.id}`,
        product_id: productId,
        branch_id: branch.id,
        quantity: branch.id === targetBranchId ? initialStockQty : 0,
        updated_at: now
      }));

      const { error: stockErr } = await supabase
        .from('product_stock')
        .insert(stockRows);

      if (stockErr) {
        console.warn('product_stock insert error on product create:', stockErr);
      }

      if (initialStockQty > 0 && prod.use_stock !== false) {
        try {
          await supabase.from('inventory_transactions').insert({
            id: generateId(),
            product_id: productId,
            product_name: catalogProduct.name,
            branch_id: targetBranchId,
            branch_name: targetBranchName || DEFAULT_BRANCH_NAME,
            type: 'stock-in',
            quantity: initialStockQty,
            notes: 'Initial stock load on product creation',
            performed_by: performedBy,
            created_at: now
          });
        } catch (txErr) {
          console.warn('inventory_transactions insert failed (non-fatal):', txErr);
        }
      }

      notifyDataChanged('products');
      notifyDataChanged('product_stock');

      return {
        ...insertedProduct,
        stock: initialStockQty,
        branch_id: targetBranchId,
        branch_name: targetBranchName || undefined,
        stocks: stockRows
      };
    },

    async update(id: string, updates: Partial<Omit<Product, 'id' | 'created_at'>>, performedBy: string): Promise<Product> {
      if (!supabase) throw new Error('Supabase not configured.');

      const { data: current, error: fetchErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const { data: currentStocks } = await supabase
        .from('product_stock')
        .select('*')
        .eq('product_id', id);

      if (updates.sku !== undefined || updates.barcode !== undefined) {
        const nextSku = normalizeSku(updates.sku);
        const nextBarcode = normalizeBarcode(updates.barcode);
        if (nextSku && (await checkSkuExistsInDb(nextSku, undefined, id))) {
          throw new Error(`SKU "${nextSku}" is already used by another product.`);
        }
        if (nextBarcode && (await checkBarcodeExistsInDb(nextBarcode, undefined, id))) {
          throw new Error(`Barcode "${nextBarcode}" is already used by another product.`);
        }
      }
      const rawUpdates = updates as Record<string, unknown>;
      const { stock: updateStock, branch_id: updateBranchId, branch_name: updateBranchName, stocks: updateStocks, ...catalogUpdates } = rawUpdates;

      if (Object.keys(catalogUpdates).length > 0) {
        const { error } = await supabase
          .from('products')
          .update(catalogUpdates)
          .eq('id', id);
        if (error) {
          console.error('Database error in products.update:', error);
          if (
            (error as any).code === '23505' ||
            /duplicate key value violates unique constraint/i.test(error.message || '')
          ) {
            if (/barcode/i.test(error.message || '')) {
              throw new Error('Barcode already exists in the database. Please enter a different barcode.');
            }
            if (/sku/i.test(error.message || '')) {
              throw new Error('SKU already exists in the database. Please enter a different SKU.');
            }
            throw new Error('A product with this SKU or Barcode already exists in the database.');
          }
          if (
            (error as any).code === '42501' ||
            /row-level security|violates.*policy|permission denied/i.test(error.message || '')
          ) {
            throw new Error('Unable to update product. Please check your permissions and try again.');
          }
          throw error;
        }
      }

      if (updateStock !== undefined) {
        const targetBranchId = updateBranchId || (currentStocks && currentStocks[0]?.branch_id) || DEFAULT_BRANCH_ID;
        const currentBranchStock = (currentStocks || []).find(s => s.branch_id === targetBranchId);
        const oldQty = currentBranchStock ? currentBranchStock.quantity : 0;
        const newQty = Math.max(0, Number(updateStock) || 0);

        if (newQty !== oldQty) {
          const now = new Date().toISOString();
          await supabase
            .from('product_stock')
            .upsert({
              id: currentBranchStock?.id || `pstock-${id}-${targetBranchId}`,
              product_id: id,
              branch_id: targetBranchId,
              quantity: newQty,
              updated_at: now
            }, { onConflict: 'product_id,branch_id' });

          const diff = newQty - oldQty;
          try {
            await supabase.from('inventory_transactions').insert({
              id: generateId(),
              product_id: id,
              product_name: catalogUpdates.name || current.name,
              branch_id: targetBranchId,
              branch_name: updateBranchName || DEFAULT_BRANCH_NAME,
              type: diff > 0 ? 'stock-in' : 'stock-out',
              quantity: Math.abs(diff),
              notes: `Stock adjusted manually. Old stock: ${oldQty}, New stock: ${newQty}`,
              performed_by: performedBy,
              created_at: now
            });
          } catch (txErr) {
            console.warn('inventory_transactions insert failed (non-fatal):', txErr);
          }
        }
      }

      notifyDataChanged('products');
      notifyDataChanged('product_stock');

      const targetBranchStr = typeof updateBranchId === 'string' ? updateBranchId : undefined;
      const updatedProd = await dbService.products.getById(id, targetBranchStr);
      return updatedProd || { ...current, ...updates };
    },

    async restock(id: string, quantity: number, performedBy: string, branchId?: string, branchName?: string): Promise<Product> {
      if (!supabase) throw new Error('Supabase not configured.');
      if (!quantity || quantity <= 0) {
        throw new Error('Restock quantity must be a positive number.');
      }

      const { data: current, error: fetchErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const { data: allBranches } = await supabase.from('branches').select('*');
      const targetBranchId = branchId || (allBranches && allBranches[0]?.id) || DEFAULT_BRANCH_ID;
      const targetBranchName = branchName || allBranches?.find(b => b.id === targetBranchId)?.name || DEFAULT_BRANCH_NAME;

      const { data: currentStockRow } = await supabase
        .from('product_stock')
        .select('*')
        .eq('product_id', id)
        .eq('branch_id', targetBranchId)
        .maybeSingle();

      const oldStock = currentStockRow ? currentStockRow.quantity : 0;
      const newStock = oldStock + quantity;
      const now = new Date().toISOString();

      const { error: stockErr } = await supabase
        .from('product_stock')
        .upsert({
          id: currentStockRow?.id || `pstock-${id}-${targetBranchId}`,
          product_id: id,
          branch_id: targetBranchId,
          quantity: newStock,
          updated_at: now
        }, { onConflict: 'product_id,branch_id' });

      if (stockErr) {
        console.error('Database error in products.restock:', stockErr);
        if (
          (stockErr as any).code === '42501' ||
          /row-level security|violates.*policy|permission denied/i.test(stockErr.message || '')
        ) {
          throw new Error('Unable to update product stock. Please check your permissions and try again.');
        }
        throw stockErr;
      }

      try {
        await supabase.from('inventory_transactions').insert({
          id: generateId(),
          product_id: id,
          product_name: current.name,
          branch_id: targetBranchId,
          branch_name: targetBranchName,
          type: 'stock-in',
          quantity,
          notes: `Restocked +${quantity}. Old stock: ${oldStock}, New stock: ${newStock}`,
          performed_by: performedBy,
          created_at: now
        });
      } catch (txErr) {
        console.warn('inventory_transactions insert failed (non-fatal):', txErr);
      }

      notifyDataChanged('products');
      notifyDataChanged('product_stock');

      return (await dbService.products.getById(id, targetBranchId)) || { ...current, stock: newStock };
    },

    async bulkImport(importedItems: Partial<Product>[], performedBy: string, branchId?: string, branchName?: string): Promise<number> {
      if (!supabase) throw new Error('Supabase not configured.');

      const { data: allBranches } = await supabase.from('branches').select('*');
      const branchesList = (allBranches && allBranches.length > 0)
        ? allBranches
        : [{ id: DEFAULT_BRANCH_ID, name: DEFAULT_BRANCH_NAME }];

      const targetBranchId = branchId || branchesList[0]?.id || DEFAULT_BRANCH_ID;
      const targetBranchName = branchName || branchesList.find(b => b.id === targetBranchId)?.name || DEFAULT_BRANCH_NAME;

      const { skus: usedSkus, barcodes: usedBarcodes } = await collectProductCodes();
      const usedIds = new Set<string>();

      const upsertProducts: any[] = [];
      const stockRowsToInsert: ProductStock[] = [];
      const txRowsToInsert: any[] = [];
      const now = new Date().toISOString();

      for (const item of importedItems) {
        let idKey = item.id || generateId();
        while (usedIds.has(idKey)) {
          idKey = generateId();
        }

        const candidateBarcode = normalizeBarcode(item.barcode);
        let barcode = candidateBarcode;
        if (!barcode || usedBarcodes.has(barcode) || (await checkBarcodeExistsInDb(barcode))) {
          barcode = await generateUniqueBarcode(usedBarcodes);
        }

        const candidateSku = normalizeSku(item.sku || idKey);
        let sku = candidateSku;
        if (!sku || usedSkus.has(sku) || (await checkSkuExistsInDb(sku))) {
          sku = await generateUniqueSku(usedSkus);
        }

        usedIds.add(idKey);
        usedBarcodes.add(normalizeBarcode(barcode));
        usedSkus.add(sku);

        const stockQty = typeof item.stock === 'number' ? Math.max(0, item.stock) : 0;

        upsertProducts.push({
          id: idKey,
          sku,
          name: item.name || 'Unnamed Product',
          barcode,
          price: typeof item.price === 'number' ? item.price : 0,
          cost: typeof item.cost === 'number' ? item.cost : 0,
          min_stock_level: item.min_stock_level || 5,
          category: item.category || 'General',
          image: item.image || null,
          description: item.description || '',
          use_stock: item.use_stock !== undefined ? item.use_stock : true,
          unit_amount: item.unit_amount || 1,
          unit_name: item.unit_name || 'ခု',
          price_variant: item.price_variant || '',
          expiry_date: item.expiry_date || '',
          updated_at: item.updated_at || new Date().toLocaleString(),
          created_at: item.created_at || now,
        });

        branchesList.forEach(branch => {
          stockRowsToInsert.push({
            id: `pstock-${idKey}-${branch.id}`,
            product_id: idKey,
            branch_id: branch.id,
            quantity: branch.id === targetBranchId ? stockQty : 0,
            updated_at: now
          });
        });

        if (stockQty > 0) {
          txRowsToInsert.push({
            id: generateId(),
            product_id: idKey,
            product_name: item.name || 'Unnamed Product',
            branch_id: targetBranchId,
            branch_name: targetBranchName,
            type: 'stock-in',
            quantity: stockQty,
            notes: 'Initial stock from CSV import',
            performed_by: performedBy,
            created_at: now
          });
        }
      }

      const { error: prodErr } = await supabase.from('products').upsert(upsertProducts);
      if (prodErr) {
        console.error('Database error in products.bulkImport:', prodErr);
        if (
          (prodErr as any).code === '42501' ||
          /row-level security|violates.*policy|permission denied/i.test(prodErr.message || '')
        ) {
          throw new Error('Unable to import products. Please check your permissions and try again.');
        }
        throw new Error(prodErr.message || 'Failed to import products to database.');
      }

      if (stockRowsToInsert.length > 0) {
        const { error: stockErr } = await supabase
          .from('product_stock')
          .upsert(stockRowsToInsert, { onConflict: 'product_id,branch_id' });
        if (stockErr) {
          console.warn('product_stock upsert error during bulk import:', stockErr);
        }
      }

      if (txRowsToInsert.length > 0) {
        try {
          await supabase.from('inventory_transactions').insert(txRowsToInsert);
        } catch (txErr) {
          console.warn('inventory_transactions bulk insert warning:', txErr);
        }
      }

      notifyDataChanged('products');
      notifyDataChanged('product_stock');
      return importedItems.length;
    },

    async delete(id: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      await supabase.from('inventory_transactions').update({ product_id: null }).eq('product_id', id);
      await supabase.from('sale_items').update({ product_id: null }).eq('product_id', id);
      await supabase.from('product_stock').delete().eq('product_id', id);
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        console.error('Database error in products.delete:', error);
        if (
          (error as any).code === '42501' ||
          /row-level security|violates.*policy|permission denied/i.test(error.message || '')
        ) {
          throw new Error('Unable to delete product. Please check your permissions and try again.');
        }
        throw error;
      }
      notifyDataChanged('products');
      notifyDataChanged('product_stock');
    }
  },

  sales: {
    async getAllWithItems(): Promise<SaleWithItems[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });
      if (salesErr) throw salesErr;

      const { data: items, error: itemsErr } = await supabase
        .from('sale_items')
        .select('*');
      if (itemsErr) throw itemsErr;

      return (sales || []).map(sale => ({
        ...sale,
        items: (items || []).filter(item => item.sale_id === sale.id)
      }));
    },

    async checkout(
      cart: { product: Product; quantity: number }[],
      paymentMethod: Sale['payment_method'],
      discount: number,
      cashier: UserProfile,
      customer?: { name?: string; phone?: string }
    ): Promise<SaleWithItems> {
      if (!supabase) throw new Error('Supabase not configured.');
      if (cart.length === 0) throw new Error('Cannot checkout an empty shopping cart');

      const saleId = 'sale-' + generateId();
      const now = new Date().toISOString();
      const branchId = cashier.branch_id || DEFAULT_BRANCH_ID;
      const branchName = cashier.branch_name || DEFAULT_BRANCH_NAME;

      const rawTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const totalAmount = Number(Math.max(0, rawTotal - discount).toFixed(2));

      const newSale: Sale = {
        id: saleId,
        cashier_id: cashier.id,
        cashier_name: cashier.name,
        branch_id: branchId,
        branch_name: branchName,
        total_amount: totalAmount,
        discount: discount,
        payment_method: paymentMethod,
        customer_name: customer?.name || undefined,
        customer_phone: customer?.phone || undefined,
        created_at: now
      };

      const saleItems: SaleItem[] = cart.map((item, idx) => ({
        id: `sitem-${generateId()}-${idx}`,
        sale_id: saleId,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        unit_cost: item.product.cost,
        total: Number((item.product.price * item.quantity).toFixed(2))
      }));

      const { error: saleErr } = await supabase.from('sales').insert(newSale);
      if (saleErr) throw saleErr;

      const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems);
      if (itemsErr) throw itemsErr;

      // Decrement product_stock.quantity for this specific branch
      for (const item of cart) {
        if (item.product.use_stock !== false) {
          const { error: rpcErr } = await supabase.rpc('deduct_product_stock', {
            p_product_id: item.product.id,
            p_branch_id: branchId,
            p_qty: item.quantity
          });

          if (rpcErr) {
            const { data: stockRow } = await supabase
              .from('product_stock')
              .select('id, quantity')
              .eq('product_id', item.product.id)
              .eq('branch_id', branchId)
              .maybeSingle();

            const currentQty = stockRow ? stockRow.quantity : item.product.stock || 0;
            const newQty = Math.max(0, currentQty - item.quantity);

            await supabase
              .from('product_stock')
              .upsert({
                id: stockRow?.id || `pstock-${item.product.id}-${branchId}`,
                product_id: item.product.id,
                branch_id: branchId,
                quantity: newQty,
                updated_at: now
              }, { onConflict: 'product_id,branch_id' });
          }
        }

        const { error: txErr } = await supabase.from('inventory_transactions').insert({
          id: generateId(),
          product_id: item.product.id,
          product_name: item.product.name,
          branch_id: branchId,
          branch_name: branchName,
          type: 'sale',
          quantity: item.quantity,
          notes: `Sold at POS to ${customer?.name || 'Walk-in Customer'}`,
          performed_by: cashier.name,
          created_at: now
        });
        if (txErr) console.warn('inventory_transactions insert warning:', txErr);
      }

      notifyDataChanged('sales');
      notifyDataChanged('product_stock');
      notifyDataChanged('products');
      return { ...newSale, items: saleItems };
    }
  },

  cashFlow: {
    async getAll(): Promise<CashFlowEntry[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async create(entry: Omit<CashFlowEntry, 'id' | 'created_at'>, performedBy: string): Promise<CashFlowEntry> {
      if (!supabase) throw new Error('Supabase not configured.');
      const newEntry: CashFlowEntry = {
        ...entry,
        amount: Number(Number(entry.amount).toFixed(2)),
        performed_by: performedBy,
        id: 'cf-' + generateId(),
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('cash_flow')
        .insert(newEntry)
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('cash_flow');
      return data;
    },

    async update(id: string, updates: Partial<Omit<CashFlowEntry, 'id' | 'created_at'>>): Promise<CashFlowEntry> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('cash_flow')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('cash_flow');
      return data;
    },

    async delete(id: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { error } = await supabase.from('cash_flow').delete().eq('id', id);
      if (error) throw error;
      notifyDataChanged('cash_flow');
    }
  },

  transactions: {
    async getAll(): Promise<InventoryTransaction[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  },

  business: {
    async get(): Promise<BusinessProfile> {
      if (supabase) {
        try {
          const { data } = await supabase
            .from('business_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
          if (data) return { ...DEFAULT_BUSINESS_PROFILE, ...data };
        } catch (err) {
          console.warn('business.get failed, using local cache:', err);
        }
      }
      const stored = localStorage.getItem(MOCK_BUSINESS_KEY);
      if (stored) {
        try {
          return { ...DEFAULT_BUSINESS_PROFILE, ...JSON.parse(stored) };
        } catch {
          return DEFAULT_BUSINESS_PROFILE;
        }
      }
      return DEFAULT_BUSINESS_PROFILE;
    },

    async update(data: Partial<BusinessProfile>): Promise<BusinessProfile> {
      const current = await this.get();
      const updated: BusinessProfile = {
        ...current,
        ...data,
        updated_at: new Date().toISOString()
      };

      localStorage.setItem(MOCK_BUSINESS_KEY, JSON.stringify(updated));

      if (supabase) {
        try {
          await supabase.from('business_settings').upsert({ id: 'main', ...updated });
        } catch (err) {
          console.warn('business.update Supabase write failed (local cache saved):', err);
        }
      }

      notifyDataChanged('business_settings');
      return updated;
    }
  },

  saleDeleteRequests: {
    async getAll(): Promise<SaleDeleteRequest[]> {
      if (!supabase) throw new Error('Supabase not configured.');
      const { data, error } = await supabase
        .from('sale_delete_requests')
        .select('*')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async create(requestData: Omit<SaleDeleteRequest, 'id' | 'requested_at' | 'status'>): Promise<SaleDeleteRequest> {
      if (!supabase) throw new Error('Supabase not configured.');
      const newReq: SaleDeleteRequest = {
        ...requestData,
        id: 'delreq-' + generateId(),
        status: 'pending',
        requested_at: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('sale_delete_requests')
        .insert(newReq)
        .select()
        .single();
      if (error) throw error;
      notifyDataChanged('sale_delete_requests');
      return data;
    },

    async approve(requestId: string, reviewedBy: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      const now = new Date().toISOString();

      const { data: req, error: reqErr } = await supabase
        .from('sale_delete_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      if (reqErr) throw reqErr;
      if (!req) throw new Error('Delete request not found');

      const allSales = await dbService.sales.getAllWithItems();
      const targetSale = allSales.find(s => s.id === req.sale_id);
      if (targetSale && targetSale.items && targetSale.items.length > 0) {
        const saleBranchId = targetSale.branch_id || req.branch_id || DEFAULT_BRANCH_ID;
        const saleBranchName = targetSale.branch_name || req.branch_name || DEFAULT_BRANCH_NAME;

        for (const item of targetSale.items) {
          if (item.product_id) {
            await dbService.products.restock(item.product_id, item.quantity, reviewedBy, saleBranchId, saleBranchName);
          }
        }
      }

      await supabase
        .from('sale_delete_requests')
        .update({ status: 'approved', reviewed_at: now, reviewed_by: reviewedBy })
        .eq('id', requestId);

      if (req.sale_id) {
        await supabase.from('sales').delete().eq('id', req.sale_id);
      }
      notifyDataChanged('sale_delete_requests');
    },

    async reject(requestId: string, reviewedBy: string, rejectionReason?: string): Promise<void> {
      if (!supabase) throw new Error('Supabase not configured.');
      const now = new Date().toISOString();
      await supabase
        .from('sale_delete_requests')
        .update({ status: 'rejected', reviewed_at: now, reviewed_by: reviewedBy, rejection_reason: rejectionReason || '' })
        .eq('id', requestId);
      notifyDataChanged('sale_delete_requests');
    }
  },

  sync: {
    async syncOfflineData(): Promise<{ syncedCount: number; success: boolean; message: string }> {
      return { syncedCount: 0, success: true, message: 'App is running in online-only mode.' };
    }
  }
};