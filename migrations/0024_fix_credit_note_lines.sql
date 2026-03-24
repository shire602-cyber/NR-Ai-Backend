-- Convert credit_note_lines quantity and vat_rate from real to numeric
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_note_lines' AND column_name = 'quantity' AND data_type = 'real') THEN
    ALTER TABLE credit_note_lines ALTER COLUMN quantity TYPE numeric(15,4);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_note_lines' AND column_name = 'vat_rate' AND data_type = 'real') THEN
    ALTER TABLE credit_note_lines ALTER COLUMN vat_rate TYPE numeric(15,4);
  END IF;
END $$;
