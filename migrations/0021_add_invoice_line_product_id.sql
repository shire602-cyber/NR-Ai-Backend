-- Migration 0021: Add product_id to invoice_lines for COGS tracking
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
