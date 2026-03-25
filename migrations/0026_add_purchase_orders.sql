CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_name_ar TEXT,
  vendor_email TEXT,
  vendor_trn TEXT,
  date TIMESTAMP DEFAULT NOW() NOT NULL,
  expected_delivery TIMESTAMP,
  status TEXT DEFAULT 'draft' NOT NULL,
  subtotal NUMERIC(15,2) DEFAULT 0 NOT NULL,
  vat_amount NUMERIC(15,2) DEFAULT 0 NOT NULL,
  total NUMERIC(15,2) DEFAULT 0 NOT NULL,
  currency TEXT DEFAULT 'AED',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(15,4) DEFAULT 1 NOT NULL,
  unit_price NUMERIC(15,2) DEFAULT 0 NOT NULL,
  vat_rate NUMERIC(15,4) DEFAULT 0.05,
  amount NUMERIC(15,2) DEFAULT 0 NOT NULL,
  received_quantity NUMERIC(15,4) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_po_lines_po_id ON purchase_order_lines(purchase_order_id);
