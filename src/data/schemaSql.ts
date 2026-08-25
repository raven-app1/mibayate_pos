export const SUPABASE_SCHEMA_SQL = `-- ============================================================
-- Mibaya POS — Final Supabase Schema
-- Run this in Supabase SQL Editor to set up all tables, RLS,
-- and the auth trigger. Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

-- ── 0. Clean slate ────────────────────────────────────────────
DROP TABLE IF EXISTS public.sale_delete_requests CASCADE;
DROP TABLE IF EXISTS public.cash_flow CASCADE;
DROP TABLE IF EXISTS public.inventory_transactions CASCADE;
DROP TABLE IF EXISTS public.sale_items CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.product_stock CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;
DROP TABLE IF EXISTS public.business_settings CASCADE;

-- ── 1. Profiles ──────────────────────────────────────────────
CREATE TABLE public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('owner', 'cashier', 'manager')),
    branch_id   TEXT,
    branch_name TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

-- Helper function to check if current user is an owner.
-- SECURITY DEFINER so the query on profiles bypasses RLS and avoids recursion.
CREATE OR REPLACE FUNCTION public.current_user_is_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_product(target_branch_id text)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_user_branch text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, branch_id INTO v_role, v_user_branch
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role = 'owner' THEN
    RETURN true;
  ELSIF v_role = 'manager' THEN
    IF v_user_branch IS NULL OR v_user_branch = '' OR target_branch_id IS NULL OR target_branch_id = '' OR v_user_branch = target_branch_id THEN
      RETURN true;
    ELSE
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_access_branch(target_branch_id text)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_user_branch text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, branch_id INTO v_role, v_user_branch
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role = 'owner' THEN
    RETURN true;
  ELSIF v_role = 'manager' THEN
    IF v_user_branch IS NULL OR v_user_branch = '' OR target_branch_id IS NULL OR target_branch_id = '' OR v_user_branch = target_branch_id THEN
      RETURN true;
    ELSE
      RETURN false;
    END IF;
  ELSIF v_role = 'cashier' THEN
    IF v_user_branch IS NOT NULL AND v_user_branch <> '' AND target_branch_id IS NOT NULL AND target_branch_id <> '' THEN
      RETURN v_user_branch = target_branch_id;
    ELSE
      RETURN true;
    END IF;
  ELSE
    RETURN false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_can_access_branch(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_access_branch(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_branch(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_is_manager_or_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN v_role IN ('owner', 'manager');
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_is_manager_or_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_manager_or_owner() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_manager_or_owner() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      auth.uid() = id
      OR public.current_user_is_manager_or_owner()
    )
  );

CREATE POLICY "Authorized users can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      auth.uid() = id
      OR public.current_user_is_manager_or_owner()
    )
  );

CREATE POLICY "Authorized users can delete profiles"
  ON public.profiles FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_is_manager_or_owner()
  );

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role AND NOT public.current_user_is_owner() THEN
    RAISE EXCEPTION 'Unauthorized: Only owners can modify user roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'cashier')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Branches ──────────────────────────────────────────────
CREATE TABLE public.branches (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    address     TEXT NOT NULL,
    phone       TEXT NOT NULL,
    manager_id  UUID,
    manager_name TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read branches"
  ON public.branches FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Only owners can modify branches"
  ON public.branches FOR ALL
  USING (public.current_user_is_owner());

INSERT INTO public.branches (id, name, code, address, phone, is_active)
VALUES ('branch-default', 'Main Store', 'MAIN', 'Yangon, Myanmar', '+95 9 123 456 789', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_branch_id_fk FOREIGN KEY (branch_id) REFERENCES public.branches(id);
-- ── 3. Products ──────────────────────────────────────────────
CREATE TABLE public.products (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    sku             TEXT,
    barcode         TEXT,
    price           NUMERIC NOT NULL DEFAULT 0,
    cost            NUMERIC NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 5,
    category        TEXT DEFAULT 'General',
    image           TEXT,
    description     TEXT,
    use_stock       BOOLEAN DEFAULT true,
    unit_amount     NUMERIC DEFAULT 1,
    unit_name       TEXT DEFAULT 'pcs',
    price_variant   TEXT,
    expiry_date     TEXT,
    updated_at      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

-- SKU / barcode global unique indexes
CREATE UNIQUE INDEX products_sku_unique_idx
  ON public.products (upper(sku))
  WHERE sku IS NOT NULL AND sku <> '';

CREATE UNIQUE INDEX products_barcode_unique_idx
  ON public.products (barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read products"
  ON public.products FOR SELECT
  USING (true);

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

-- ── 3b. Product Stock ─────────────────────────────────────────
CREATE TABLE public.product_stock (
    id          TEXT PRIMARY KEY,
    product_id  TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    branch_id   TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now()),
    CONSTRAINT product_stock_product_branch_key UNIQUE (product_id, branch_id)
);

CREATE INDEX idx_product_stock_product_id ON public.product_stock (product_id);
CREATE INDEX idx_product_stock_branch_id ON public.product_stock (branch_id);

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product_stock"
  ON public.product_stock FOR SELECT
  USING (true);

CREATE POLICY "Authorized users can insert product_stock"
  ON public.product_stock FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.current_user_can_manage_product(branch_id)
  );

CREATE POLICY "Authorized users can update product_stock"
  ON public.product_stock FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can delete product_stock"
  ON public.product_stock FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_manage_product(branch_id)
  );

-- ── 4. Sales ─────────────────────────────────────────────────
CREATE TABLE public.sales (
    id              TEXT PRIMARY KEY,
    cashier_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cashier_name    TEXT NOT NULL,
    branch_id       TEXT REFERENCES public.branches(id),
    branch_name     TEXT,
    total_amount    NUMERIC NOT NULL,
    discount        NUMERIC NOT NULL DEFAULT 0,
    payment_method  TEXT NOT NULL,
    customer_name   TEXT,
    customer_phone  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can read sales"
  ON public.sales FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      cashier_id = auth.uid()
      OR public.current_user_can_access_branch(branch_id)
    )
  );

CREATE POLICY "Authorized users can insert sales"
  ON public.sales FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      cashier_id = auth.uid()
      OR public.current_user_can_access_branch(branch_id)
    )
  );

CREATE POLICY "Authorized users can update sales"
  ON public.sales FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_access_branch(branch_id)
  );

CREATE POLICY "Authorized users can delete sales (void)"
  ON public.sales FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_access_branch(branch_id)
  );

-- ── 5. Sale Items ────────────────────────────────────────────
CREATE TABLE public.sale_items (
    id          TEXT PRIMARY KEY,
    sale_id     TEXT REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id  TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity    INTEGER NOT NULL,
    unit_price  NUMERIC NOT NULL,
    unit_cost   NUMERIC NOT NULL,
    total       NUMERIC NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sale_items"
  ON public.sale_items FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert sale_items"
  ON public.sale_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can delete sale_items (void)"
  ON public.sale_items FOR DELETE
  USING (auth.role() = 'authenticated');

-- ── 6. Inventory Transactions ────────────────────────────────
CREATE TABLE public.inventory_transactions (
    id          TEXT PRIMARY KEY,
    product_id  TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    branch_id   TEXT NOT NULL REFERENCES public.branches(id),
    branch_name TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('stock-in', 'stock-out', 'sale', 'adjustment')),
    quantity    INTEGER NOT NULL,
    notes       TEXT,
    performed_by TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can read inventory_transactions"
  ON public.inventory_transactions FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.current_user_can_access_branch(branch_id)
      OR branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Authorized users can insert inventory_transactions"
  ON public.inventory_transactions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      public.current_user_can_access_branch(branch_id)
      OR branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ── 7. Business Settings ─────────────────────────────────────
CREATE TABLE public.business_settings (
    id              TEXT PRIMARY KEY DEFAULT 'main',
    name            TEXT NOT NULL DEFAULT 'RetailHub',
    tagline         TEXT DEFAULT 'Multi-branch Retail POS System',
    logo_url        TEXT DEFAULT '',
    phone           TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    address         TEXT DEFAULT '',
    tax_rate        NUMERIC DEFAULT 5,
    receipt_footer  TEXT DEFAULT 'Thank you for shopping with us! Please come again.',
    currency        TEXT DEFAULT 'Ks',
    updated_at      TIMESTAMPTZ DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read business_settings"
  ON public.business_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Only owners can update business_settings"
  ON public.business_settings FOR ALL
  USING (public.current_user_is_owner());

-- Insert default row so upsert works
INSERT INTO public.business_settings (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;

-- ── 8. Cash Flow Ledger ──────────────────────────────────────
CREATE TABLE public.cash_flow (
    id             TEXT PRIMARY KEY,
    type           TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category       TEXT NOT NULL DEFAULT 'Other',
    title          TEXT NOT NULL,
    amount         NUMERIC NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    branch_id      TEXT REFERENCES public.branches(id),
    branch_name    TEXT,
    notes          TEXT,
    performed_by   TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can read cash_flow"
  ON public.cash_flow FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.current_user_can_access_branch(branch_id)
      OR branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Authorized users can manage cash_flow"
  ON public.cash_flow FOR ALL
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_access_branch(branch_id)
  );

-- ── 9. Sale Delete Requests ──────────────────────────────────
CREATE TABLE public.sale_delete_requests (
    id               TEXT PRIMARY KEY,
    sale_id          TEXT REFERENCES public.sales(id) ON DELETE SET NULL,
    cashier_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cashier_name     TEXT NOT NULL,
    branch_id        TEXT REFERENCES public.branches(id),
    branch_name      TEXT,
    total_amount     NUMERIC NOT NULL,
    reason           TEXT,
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Yangon', now()),
    reviewed_at      TIMESTAMPTZ,
    reviewed_by      TEXT,
    rejection_reason TEXT
);

ALTER TABLE public.sale_delete_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sale_delete_requests"
  ON public.sale_delete_requests FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can insert sale_delete_requests"
  ON public.sale_delete_requests FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authorized users can manage sale_delete_requests"
  ON public.sale_delete_requests FOR ALL
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_can_access_branch(branch_id)
  );

CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_user_is_owner() THEN
    RAISE EXCEPTION 'Unauthorized: Only owners can delete user accounts';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO authenticated;

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

ALTER PUBLICATION supabase_realtime ADD TABLE public.product_stock;
`;
