-- ============================================================
-- Mibayate POS — Migration 013: Split Product Stock Table
-- Restructures multi-branch inventory:
-- 1. products: ONE row per product (shared attributes, no branch_id/stock)
-- 2. product_stock: One row per (product_id, branch_id) holding quantity
-- ============================================================

-- ── 1. Create product_stock table ───────────────────────────
CREATE TABLE IF NOT EXISTS public.product_stock (
    id          TEXT PRIMARY KEY,
    product_id  TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    branch_id   TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now()),
    CONSTRAINT product_stock_product_branch_key UNIQUE (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_product_id ON public.product_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_branch_id ON public.product_stock (branch_id);

-- ── 2. Data Migration: Deduplicate products & populate product_stock ──
DO $$
DECLARE
  v_has_branch_id BOOLEAN;
  v_has_stock BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'branch_id'
  ) INTO v_has_branch_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'
  ) INTO v_has_stock;

  IF v_has_branch_id OR v_has_stock THEN
    -- Build temporary mapping of all product rows to their canonical product row
    CREATE TEMP TABLE _product_mapping ON COMMIT DROP AS
    WITH grouped AS (
      SELECT 
        id,
        sku,
        barcode,
        branch_id,
        COALESCE(stock, 0) AS stock,
        created_at,
        COALESCE(NULLIF(upper(trim(sku)), ''), NULLIF(trim(barcode), ''), id) AS group_key
      FROM public.products
    ),
    canonical_choice AS (
      SELECT 
        id AS old_id,
        FIRST_VALUE(id) OVER (
          PARTITION BY group_key 
          ORDER BY 
            (stock > 0) DESC,
            created_at ASC NULLS LAST,
            id ASC
        ) AS canonical_id,
        branch_id,
        stock
      FROM grouped
    )
    SELECT old_id, canonical_id, branch_id, stock FROM canonical_choice;

    -- Populate product_stock from existing products
    INSERT INTO public.product_stock (id, product_id, branch_id, quantity, updated_at)
    SELECT 
      'pstock-' || md5(m.canonical_id || ':' || COALESCE(m.branch_id, b.default_branch_id)),
      m.canonical_id,
      COALESCE(m.branch_id, b.default_branch_id),
      SUM(m.stock)::INTEGER,
      timezone('Asia/Yangon', now())
    FROM _product_mapping m
    CROSS JOIN (
      SELECT COALESCE((SELECT id FROM public.branches ORDER BY created_at ASC LIMIT 1), 'branch-default') AS default_branch_id
    ) b
    WHERE COALESCE(m.branch_id, b.default_branch_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.branches br WHERE br.id = COALESCE(m.branch_id, b.default_branch_id))
    GROUP BY m.canonical_id, COALESCE(m.branch_id, b.default_branch_id)
    ON CONFLICT (product_id, branch_id) 
    DO UPDATE SET 
      quantity = public.product_stock.quantity + EXCLUDED.quantity,
      updated_at = EXCLUDED.updated_at;

    -- Ensure product_stock has a row for EVERY (canonical product x branch) pair
    INSERT INTO public.product_stock (id, product_id, branch_id, quantity, updated_at)
    SELECT 
      'pstock-' || md5(p.id || ':' || br.id),
      p.id,
      br.id,
      0,
      timezone('Asia/Yangon', now())
    FROM (SELECT DISTINCT canonical_id AS id FROM _product_mapping) p
    CROSS JOIN public.branches br
    ON CONFLICT (product_id, branch_id) DO NOTHING;

    -- Repoint sale_items FK to canonical product_id before deleting duplicates
    UPDATE public.sale_items s
    SET product_id = m.canonical_id
    FROM _product_mapping m
    WHERE s.product_id = m.old_id
      AND m.old_id <> m.canonical_id;

    -- Repoint inventory_transactions FK to canonical product_id before deleting duplicates
    UPDATE public.inventory_transactions t
    SET product_id = m.canonical_id
    FROM _product_mapping m
    WHERE t.product_id = m.old_id
      AND m.old_id <> m.canonical_id;

    -- Delete duplicate redundant rows from products
    DELETE FROM public.products
    WHERE id IN (
      SELECT old_id FROM _product_mapping WHERE old_id <> canonical_id
    );

  END IF;
END $$;

-- ── 3. Drop all existing RLS policies on products first ─────
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;
DROP POLICY IF EXISTS "Authorized users can insert products" ON public.products;
DROP POLICY IF EXISTS "Owners can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Owners can update products" ON public.products;
DROP POLICY IF EXISTS "Authorized users can delete products" ON public.products;
DROP POLICY IF EXISTS "Owners can delete products" ON public.products;

-- ── 4. Drop deprecated columns & indexes from products ──────
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_branch_id_fkey CASCADE;
DROP INDEX IF EXISTS public.products_sku_branch_unique_idx;
DROP INDEX IF EXISTS public.products_barcode_branch_unique_idx;
DROP INDEX IF EXISTS public.products_sku_unique_idx;
DROP INDEX IF EXISTS public.products_barcode_unique_idx;

ALTER TABLE public.products DROP COLUMN IF EXISTS branch_id CASCADE;
ALTER TABLE public.products DROP COLUMN IF EXISTS branch_name CASCADE;
ALTER TABLE public.products DROP COLUMN IF EXISTS stock CASCADE;

-- Global unique indexes on products
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx
  ON public.products (upper(sku))
  WHERE sku IS NOT NULL AND sku <> '';

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx
  ON public.products (barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

-- ── 5. Recreate clean RLS Policies for products & product_stock ──
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read products"
  ON public.products FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can insert products"
  ON public.products FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.current_user_is_manager_or_owner()
  );

CREATE POLICY "Authenticated users can update products"
  ON public.products FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can delete products"
  ON public.products FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_is_manager_or_owner()
  );

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read product_stock" ON public.product_stock;
CREATE POLICY "Authenticated users can read product_stock"
  ON public.product_stock FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authorized users can insert product_stock" ON public.product_stock;
CREATE POLICY "Authorized users can insert product_stock"
  ON public.product_stock FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.current_user_can_manage_product(branch_id)
  );

DROP POLICY IF EXISTS "Authorized users can update product_stock" ON public.product_stock;
CREATE POLICY "Authorized users can update product_stock"
  ON public.product_stock FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authorized users can delete product_stock" ON public.product_stock;
CREATE POLICY "Authorized users can delete product_stock"
  ON public.product_stock FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_manage_product(branch_id)
  );

-- ── 6. Update RPC deduct_product_stock ──────────────────────
CREATE OR REPLACE FUNCTION public.deduct_product_stock(p_product_id text, p_branch_id text, p_qty int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_stock
  SET quantity = GREATEST(0, quantity - p_qty),
      updated_at = timezone('Asia/Yangon', now())
  WHERE product_id = p_product_id AND branch_id = p_branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_product_stock(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_product_stock(text, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_product_stock(text, text, int) TO authenticated;

-- ── 7. Add product_stock to Realtime publication ─────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.product_stock;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
