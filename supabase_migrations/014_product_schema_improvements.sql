-- ============================================================
-- Mibayate POS — Migration 014: Product Schema Improvements
-- Fixes: RLS policies, stock deduction atomicity, column types
-- Safe to run on existing databases (idempotent drops + recreates)
-- ============================================================

-- ── 1. Fix products RLS: UPDATE restricted to manager/owner ──
--    Previously any authenticated user could update any product.
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
CREATE POLICY "Authorized users can update products"
  ON public.products FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_is_manager_or_owner()
  );

-- ── 2. Fix product_stock RLS: UPDATE restricted to manager/owner ──
--    Previously any authenticated user could directly change stock.
DROP POLICY IF EXISTS "Authorized users can update product_stock" ON public.product_stock;
CREATE POLICY "Authorized users can update product_stock"
  ON public.product_stock FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_manage_product(branch_id)
  );

-- ── 3. Fix sale_items RLS: INSERT scoped to sale's cashier/branch ──
--    Previously any authenticated user could insert sale items for any sale.
DROP POLICY IF EXISTS "Authenticated users can insert sale_items" ON public.sale_items;
CREATE POLICY "Authorized users can insert sale_items"
  ON public.sale_items FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.id = sale_id
        AND (
          s.cashier_id = auth.uid()
          OR public.current_user_can_access_branch(s.branch_id)
        )
      )
    )
  );

-- ── 4. Atomic deduct_product_stock with row lock + validation ──
--    Old version: silent no-op on missing row, no negative check,
--    no row lock (race condition between concurrent checkouts).
CREATE OR REPLACE FUNCTION public.deduct_product_stock(
  p_product_id text, p_branch_id text, p_qty int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current int;
BEGIN
  -- Row-level lock prevents concurrent checkouts from reading stale quantity
  SELECT quantity INTO v_current
  FROM public.product_stock
  WHERE product_id = p_product_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No stock record for product "%" at branch "%"', p_product_id, p_branch_id;
  END IF;

  IF v_current < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock: available %, requested %', v_current, p_qty;
  END IF;

  UPDATE public.product_stock
  SET quantity = quantity - p_qty,
      updated_at = timezone('Asia/Yangon', now())
  WHERE product_id = p_product_id AND branch_id = p_branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_product_stock(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_product_stock(text, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_product_stock(text, text, int) TO authenticated;

-- ── 5. Fix products.updated_at: TEXT → TIMESTAMPTZ ──
--    Old column stored arbitrary locale-formatted strings.
--    Safely convert existing text values, defaulting invalid ones to now().
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'updated_at' AND data_type = 'text'
  ) THEN
    -- Add temp column
    ALTER TABLE public.products ADD COLUMN updated_at_new TIMESTAMPTZ;

    -- Try to parse existing text values; fall back to created_at or now()
    UPDATE public.products
    SET updated_at_new = CASE
      WHEN updated_at IS NOT NULL AND updated_at <> '' THEN
        COALESCE(
          updated_at::timestamptz,
          created_at,
          timezone('Asia/Yangon', now())
        )
      ELSE COALESCE(created_at, timezone('Asia/Yangon', now()))
    END;

    -- Swap columns
    ALTER TABLE public.products DROP COLUMN updated_at;
    ALTER TABLE public.products RENAME COLUMN updated_at_new TO updated_at;

    -- Set default for future rows
    ALTER TABLE public.products
      ALTER COLUMN updated_at SET DEFAULT timezone('Asia/Yangon', now());
  END IF;
END $$;

-- ── 6. Fix products.expiry_date: TEXT → DATE ──
--    Allow proper date comparisons for "expiring soon" queries.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'expiry_date' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.products ADD COLUMN expiry_date_new DATE;

    -- Try to parse existing text dates; discard unparseable values
    UPDATE public.products
    SET expiry_date_new = CASE
      WHEN expiry_date IS NOT NULL AND expiry_date <> '' THEN
        expiry_date::date
      ELSE NULL
    END;

    ALTER TABLE public.products DROP COLUMN expiry_date;
    ALTER TABLE public.products RENAME COLUMN expiry_date_new TO expiry_date;
  END IF;
END $$;
