-- Migration 0023: Add unique constraints and performance indexes.
-- All operations are idempotent.

-- Deduplicate company_users
DELETE FROM company_users a USING company_users b
WHERE a.id > b.id AND a.company_id = b.company_id AND a.user_id = b.user_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_company_users_company_user') THEN
    ALTER TABLE company_users ADD CONSTRAINT uq_company_users_company_user UNIQUE (company_id, user_id);
  END IF;
END $$;

-- Deduplicate journal_entries
DELETE FROM journal_entries a USING journal_entries b
WHERE a.id > b.id AND a.company_id = b.company_id
  AND a.entry_number = b.entry_number AND a.entry_number IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_journal_entries_company_entry') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT uq_journal_entries_company_entry UNIQUE (company_id, entry_number);
  END IF;
END $$;

-- Deduplicate invoices by number
DELETE FROM invoices a USING invoices b
WHERE a.id > b.id AND a.company_id = b.company_id
  AND a.number = b.number AND a.number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_number
  ON invoices (company_id, number) WHERE number IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_receipts_company_id ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON company_users(user_id);
