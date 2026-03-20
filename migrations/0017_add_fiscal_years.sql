-- Migration 0017: Add fiscal_years table for year-end close support
CREATE TABLE IF NOT EXISTS fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMP,
  closing_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fiscal_years_company_id ON fiscal_years(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_years_status ON fiscal_years(company_id, status);
CREATE INDEX IF NOT EXISTS idx_fiscal_years_dates ON fiscal_years(company_id, start_date, end_date);
