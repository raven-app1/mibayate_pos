-- ============================================================
-- Mibayate POS — Migration 017: Label Templates table
-- Creates the public.label_templates table to store custom
-- barcode label designer settings as reusable templates.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.label_templates (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT DEFAULT '',
    is_default     BOOLEAN DEFAULT false,
    config         JSONB NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT timezone('Asia/Yangon', now()),
    updated_at     TIMESTAMPTZ DEFAULT timezone('Asia/Yangon', now())
);

ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read label_templates" ON public.label_templates;
CREATE POLICY "Authenticated users can read label_templates"
  ON public.label_templates FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage label_templates" ON public.label_templates;
CREATE POLICY "Authenticated users can manage label_templates"
  ON public.label_templates FOR ALL
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_label_templates_is_default ON public.label_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_label_templates_created_at ON public.label_templates(created_at);
