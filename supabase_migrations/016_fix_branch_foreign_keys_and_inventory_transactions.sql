-- ============================================================
-- Mibayate POS — Migration 016: Fix branch foreign keys & inventory transactions
-- Fixes:
-- 1. inventory_transactions.branch_id and branch_name made nullable.
-- 2. Repoints all foreign keys referencing public.branches(id) with
--    ON DELETE SET NULL ON UPDATE CASCADE (or ON DELETE CASCADE for product_stock).
-- 3. Adds UPDATE and DELETE RLS policies on inventory_transactions.
-- ============================================================

-- ── 1. Make branch columns nullable on inventory_transactions ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'inventory_transactions' 
      AND column_name = 'branch_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.inventory_transactions ALTER COLUMN branch_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'inventory_transactions' 
      AND column_name = 'branch_name'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.inventory_transactions ALTER COLUMN branch_name DROP NOT NULL;
  END IF;
END $$;

-- ── 2. Helper function to repoint branch foreign keys ──
CREATE OR REPLACE FUNCTION public.repoint_branch_fks(_tbl text, _on_delete text DEFAULT 'SET NULL')
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  tbl_real text;
  r RECORD;
  fk_col text;
BEGIN
  SELECT t.oid::regclass::text INTO tbl_real
  FROM pg_class t
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE t.relname ILIKE _tbl AND n.nspname = 'public'
  ORDER BY (t.relname = _tbl) DESC, t.relname
  LIMIT 1;

  IF tbl_real IS NULL THEN
    RAISE NOTICE 'Table "%" not found, skipping', _tbl;
    RETURN;
  END IF;

  -- Drop every FK on this table that points to public.branches
  FOR r IN
    SELECT c.conname AS cn, a.attname AS colname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = tbl_real::regclass
      AND c.confrelid = 'public.branches'::regclass
  LOOP
    EXECUTE 'ALTER TABLE ' || tbl_real || ' DROP CONSTRAINT ' || quote_ident(r.cn);
    RAISE NOTICE 'Dropped branch FK % on %', r.cn, tbl_real;
    fk_col := r.colname;
  END LOOP;

  -- Re-add standard branch FK constraint
  IF fk_col IS NULL THEN
    fk_col := 'branch_id';
  END IF;

  -- Ensure column exists before adding constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = _tbl AND column_name = fk_col
  ) THEN
    EXECUTE 'ALTER TABLE ' || tbl_real ||
            ' ADD CONSTRAINT ' || quote_ident(_tbl || '_' || fk_col || '_fkey') ||
            ' FOREIGN KEY (' || quote_ident(fk_col) || ') REFERENCES public.branches(id)' ||
            ' ON DELETE ' || _on_delete || ' ON UPDATE CASCADE';
    RAISE NOTICE 'Added branch FK on %.% (ON DELETE %, ON UPDATE CASCADE)', tbl_real, fk_col, _on_delete;
  END IF;
END;
$fn$;

SELECT public.repoint_branch_fks('inventory_transactions', 'SET NULL');
SELECT public.repoint_branch_fks('profiles', 'SET NULL');
SELECT public.repoint_branch_fks('sales', 'SET NULL');
SELECT public.repoint_branch_fks('cash_flow', 'SET NULL');
SELECT public.repoint_branch_fks('sale_delete_requests', 'SET NULL');
SELECT public.repoint_branch_fks('product_stock', 'CASCADE');

DROP FUNCTION public.repoint_branch_fks(text, text);

-- ── 3. RLS Policies on inventory_transactions ──
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can update inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized users can update inventory_transactions"
  ON public.inventory_transactions FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      public.current_user_can_manage_product(branch_id)
      OR public.current_user_is_owner()
    )
  );

DROP POLICY IF EXISTS "Authorized users can delete inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized users can delete inventory_transactions"
  ON public.inventory_transactions FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_is_owner()
  );
