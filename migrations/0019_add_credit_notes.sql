-- Migration 0019: Add credit_notes and credit_note_lines tables
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  customer_id UUID REFERENCES customer_contacts(id),
  customer_name TEXT NOT NULL,
  customer_trn TEXT,
  date TIMESTAMP NOT NULL,
  currency TEXT DEFAULT 'AED',
  subtotal NUMERIC(15,2) DEFAULT 0,
  vat_amount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  linked_invoice_id UUID REFERENCES invoices(id),
  reason TEXT,
  status TEXT DEFAULT 'draft',
  journal_entry_id UUID REFERENCES journal_entries(id),
  applied_amount NUMERIC(15,2) DEFAULT 0,
  applied_to_invoice_id UUID,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  vat_rate REAL DEFAULT 0.05,
  vat_supply_type TEXT DEFAULT 'standard_rated'
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_company_id ON credit_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_linked_invoice ON credit_notes(linked_invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note ON credit_note_lines(credit_note_id);
