-- Migration 0018: Add multi-currency fields to journal entries and lines
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AED';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,6) DEFAULT 1;

ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS original_amount NUMERIC(15,2);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS original_currency TEXT;
