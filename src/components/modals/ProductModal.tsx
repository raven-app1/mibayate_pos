import React, { useState, useEffect, useRef } from 'react';
import { Package, AlertTriangle, CheckCircle, Tag, RefreshCw, DollarSign, Layers } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Product, Branch, UserProfile } from '../../types';
import { dbService } from '../../lib/supabase';
import { useToast } from '../../utils/toast';
import SearchableCategorySelect from '../SearchableCategorySelect';

const productSchema = z.object({
  name: z.string().min(1, 'Product Name is required'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  price_variant: z.string().optional(),
  description: z.string().optional(),
  cost: z.number().min(0, 'Cost must be 0 or greater').default(0),
  price: z.number().min(0, 'Price must be 0 or greater').default(0),
  unit_amount: z.number().min(0.01, 'Unit amount must be greater than 0').default(1),
  unit_name: z.string().optional(),
  use_stock: z.boolean().default(true),
  stock: z.number().min(0, 'Stock cannot be negative').default(0),
  min_stock_level: z.number().min(0, 'Min stock cannot be negative').default(5),
  expiry_date: z.string().optional(),
  branch_id: z.string().optional()
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductModalProps {
  user: UserProfile;
  editingProduct: Product | null;
  products: Product[];
  branches: Branch[];
  categories: string[];
  onClose: () => void;
  onSuccess: (savedProduct?: Product) => void;
}

export default function ProductModal({
  user,
  editingProduct,
  products,
  branches,
  categories,
  onClose,
  onSuccess
}: ProductModalProps) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);
  const [isProductNameFocused, setIsProductNameFocused] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: editingProduct?.name || '',
      sku: editingProduct?.sku || '',
      barcode: editingProduct?.barcode || '',
      category: editingProduct?.category || 'General',
      price_variant: editingProduct?.price_variant || 'Standard',
      description: editingProduct?.description || '',
      cost: editingProduct?.cost ?? 0,
      price: editingProduct?.price ?? 0,
      unit_amount: editingProduct?.unit_amount ?? 1,
      unit_name: editingProduct?.unit_name || 'pcs',
      use_stock: editingProduct?.use_stock !== false,
      stock: editingProduct?.stock ?? 0,
      min_stock_level: editingProduct?.min_stock_level ?? 5,
      expiry_date: editingProduct?.expiry_date || '',
      branch_id: editingProduct?.branch_id || (user.role === 'manager' && user.branch_id ? user.branch_id : '')
    }
  });

  const formValues = watch();

  useEffect(() => {
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstError = errors[errorKeys[0] as keyof ProductFormData]?.message;
      setFormError(firstError || 'Please fix the errors in the form.');
    } else {
      setFormError(null);
    }
  }, [errors]);

  useEffect(() => {
    if (!editingProduct && !formValues.sku) {
      void fillGeneratedCodes();
    }
  }, [editingProduct]);

  useEffect(() => {
    if (editingProduct && editingProduct.stocks && formValues.branch_id) {
      const match = editingProduct.stocks.find(s => s.branch_id === formValues.branch_id);
      if (match) {
        setValue('stock', match.quantity);
      }
    }
  }, [formValues.branch_id, editingProduct, setValue]);
  const fillGeneratedCodes = async () => {
    setIsGeneratingCodes(true);
    try {
      const { sku, barcode } = await dbService.products.generateCodes();
      setValue('sku', sku, { shouldValidate: true });
      setValue('barcode', barcode || '', { shouldValidate: true });
    } catch (err: any) {
      setFormError(err.message || 'Could not generate SKU / barcode.');
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  const onSubmit = async (data: ProductFormData) => {
    setFormError(null);
    setFormSuccess(null);
    setIsSubmitting(true);

    try {
      const targetBranchId = user.role === 'manager'
        ? (editingProduct?.branch_id || user.branch_id || null)
        : (data.branch_id || null);
      const selectedBranch = branches.find(b => b.id === targetBranchId);
      
      const payload = {
        name: data.name.trim(),
        sku: (data.sku || '').trim().toUpperCase(),
        barcode: (data.barcode || '').trim(),
        description: (data.description || '').trim(),
        category: (data.category || 'General').trim(),
        use_stock: data.use_stock,
        price: Number(data.price) || 0,
        cost: Number(data.cost) || 0,
        unit_amount: Number(data.unit_amount) || 1,
        unit_name: (data.unit_name || 'pcs').trim(),
        stock: Number(data.stock) || 0,
        min_stock_level: Number(data.min_stock_level) || 5,
        price_variant: (data.price_variant || 'Standard').trim(),
        expiry_date: data.expiry_date || null,
        branch_id: targetBranchId,
        branch_name: selectedBranch ? selectedBranch.name : null
      };

      let savedProduct: Product;
      if (editingProduct) {
        savedProduct = await dbService.products.update(editingProduct.id, payload, user.name);
        toast('Product updated successfully!', 'success');
      } else {
        savedProduct = await dbService.products.create(payload, user.name);
        toast('Product created successfully!', 'success');
      }

      onSuccess(savedProduct);
      onClose();
    } catch (err: any) {
      console.error('Error saving product:', err);
      const msg = err?.message || '';
      if (
        err?.code === '42501' ||
        /row-level security|permission denied|violates.*policy/i.test(msg)
      ) {
        const permErr = editingProduct
          ? 'Unable to update product. Please check your permissions and try again.'
          : 'Unable to create product. Please check your permissions and try again.';
        setFormError(permErr);
        toast(permErr, 'error');
      } else {
        const finalMsg = msg || 'Failed to save product';
        setFormError(finalMsg);
        toast(finalMsg, 'error');
      }
      setIsSubmitting(false);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const onError = (formErrors: any) => {
    const errorKeys = Object.keys(formErrors);
    if (errorKeys.length > 0) {
      const firstError = formErrors[errorKeys[0]]?.message || 'Please fill in all required fields.';
      setFormError(firstError);
      toast(firstError, 'error');
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-premium-xl border border-slate-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
          <h3 className="font-extrabold text-slate-900 flex items-center space-x-2 text-sm sm:text-base">
            <Package className="w-5 h-5 text-gray-900" />
            <span>{editingProduct ? 'Edit Product Schema Details' : 'Register New Product'}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit, onError)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.defaultPrevented) e.preventDefault(); }} className="flex flex-col flex-1 overflow-hidden min-h-0 text-xs">
          <div ref={scrollRef} className="p-5 overflow-y-auto space-y-5 flex-1">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 flex items-start space-x-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-900 flex items-start space-x-1.5">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
                <span>{formSuccess}</span>
              </div>
            )}

            {/* SECTION 1: BASIC INFORMATION */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-gray-900 font-bold text-[11px] uppercase tracking-wider border-b border-slate-100 pb-1">
                <Tag className="w-3.5 h-3.5 text-gray-900" />
                <span>1. Product Identification & Metadata</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 relative">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Product Name *</label>
                  <input
                    type="text"
                    {...register('name')}
                    onFocus={() => setIsProductNameFocused(true)}
                    onBlur={(e) => {
                      register('name').onBlur(e);
                      setTimeout(() => setIsProductNameFocused(false), 200);
                    }}
                    placeholder="e.g. Organic Whole Milk 1L"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-medium"
                  />
                  {isProductNameFocused && formValues.name.length >= 2 && (
                    (() => {
                      const matchingProducts = products.filter(p => p.name.toLowerCase().includes(formValues.name.toLowerCase()) && p.id !== editingProduct?.id).slice(0, 5);
                      if (matchingProducts.length > 0) {
                        return (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Similar Existing Products
                            </div>
                            {matchingProducts.map(p => (
                              <div key={p.id} className="px-3 py-2 text-xs font-medium text-slate-700 flex items-center justify-between border-b border-slate-50 last:border-0">
                                <span>{p.name}</span>
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.sku}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}
                </div>

                <div>
                  <label className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    <span>SKU Identifier *</span>
                    {!editingProduct && (
                      <span className="text-gray-500 normal-case tracking-normal font-semibold">Auto-generated</span>
                    )}
                  </label>
                  <input
                    type="text"
                    {...register('sku')}
                    readOnly={!!editingProduct || isGeneratingCodes}
                    placeholder="MILK-ORG-1L"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 read-only:opacity-75 font-mono font-bold text-gray-900 uppercase"
                  />
                </div>

                <div>
                  <label className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    <span>Barcode Number</span>
                    {!editingProduct && (
                      <span className="text-gray-500 normal-case tracking-normal font-semibold">Sequential</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      {...register('barcode')}
                      readOnly={isGeneratingCodes}
                      placeholder="e.g. 000123"
                      className="flex-1 min-w-0 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-mono"
                    />
                    {!editingProduct && (
                      <button
                        type="button"
                        onClick={fillGeneratedCodes}
                        disabled={isGeneratingCodes}
                        title="Generate a fresh SKU and the next available barcode"
                        className="p-2.5 shrink-0 text-slate-500 hover:text-gray-900 hover:bg-gray-50 border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-4 h-4 ${isGeneratingCodes ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Category *</label>
                  <SearchableCategorySelect
                    options={categories.filter(cat => cat !== 'All').map(cat => ({ value: cat, label: cat }))}
                    value={formValues.category}
                    onChange={(value) => setValue('category', value, { shouldValidate: true })}
                    placeholder="Select or create category..."
                    allowCreate
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Price Variant Tag</label>
                  <input
                    type="text"
                    {...register('price_variant')}
                    placeholder="Standard, Retail, Wholesale, VIP"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Product Description</label>
                  <textarea
                    rows={2}
                    {...register('description')}
                    placeholder="Provide additional details, brand notes, or specs..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-medium resize-none"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: PRICING & UNITS */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-gray-900 font-bold text-[11px] uppercase tracking-wider border-b border-slate-100 pb-1">
                <DollarSign className="w-3.5 h-3.5 text-gray-900" />
                <span>2. Pricing & Packaging Unit Specifications</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Purchased Cost (Ks) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('cost', { valueAsNumber: true })}
                    placeholder="0.00"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-bold text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Unit Sale Price (Ks) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('price', { valueAsNumber: true })}
                    placeholder="0.00"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-black text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Unit Quantity Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    {...register('unit_amount', { valueAsNumber: true })}
                    placeholder="1"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Unit Packaging Name</label>
                  <input
                    type="text"
                    {...register('unit_name')}
                    placeholder="pcs, box, kg, bottle, pack"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-bold"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: INVENTORY TRACKING & OUTLET */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <div className="flex items-center gap-1.5 text-gray-900 font-bold text-[11px] uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-gray-900" />
                  <span>3. Inventory Stock Control & Store Outlet</span>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('use_stock')}
                    className="w-4 h-4 rounded text-gray-900 focus:ring-black/20 border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700">Track Stock Inventory</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Current Stock Count *</label>
                  <input
                    type="number"
                    min="0"
                    readOnly={!formValues.use_stock}
                    {...register('stock', { valueAsNumber: true })}
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 read-only:opacity-50 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Min Alert Stock Level</label>
                  <input
                    type="number"
                    min="1"
                    {...register('min_stock_level', { valueAsNumber: true })}
                    placeholder="5"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Product Expiry Date</label>
                  <input
                    type="date"
                    {...register('expiry_date')}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-medium"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Branch Outlet Assignment {user.role === 'manager' && <span className="text-slate-400 font-normal lowercase">(assigned branch)</span>}
                  </label>
                  <select
                    {...register('branch_id')}
                    disabled={user.role === 'manager'}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-gray-900 font-medium disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {user.role !== 'manager' && (
                      <option value="">🏢 Global Inventory / All Store Outlets</option>
                    )}
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        📍 {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* PINNED MODAL FOOTER */}
          <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3 shrink-0">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isGeneratingCodes}
              className="px-5 py-2.5 bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Package className="w-3.5 h-3.5" />
                  <span>{editingProduct ? 'Save Changes' : 'Create Product'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
