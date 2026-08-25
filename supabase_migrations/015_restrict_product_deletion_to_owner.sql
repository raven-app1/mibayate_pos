-- ============================================================
-- Mibayate POS — Migration 015: Restrict Product Deletion to Owner Only
-- Ensures only store owners (not managers or cashiers) can delete products and product_stock.
-- ============================================================

DROP POLICY IF EXISTS "Authorized users can delete products" ON public.products;
CREATE POLICY "Authorized users can delete products"
  ON public.products FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_is_owner()
  );

DROP POLICY IF EXISTS "Authorized users can delete product_stock" ON public.product_stock;
CREATE POLICY "Authorized users can delete product_stock"
  ON public.product_stock FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.current_user_is_owner()
  );
