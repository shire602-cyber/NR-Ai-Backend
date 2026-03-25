DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bill_line_items' AND column_name = 'quantity' AND numeric_precision = 10) THEN
    ALTER TABLE bill_line_items ALTER COLUMN quantity TYPE numeric(15,4);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bill_line_items' AND column_name = 'vat_rate' AND numeric_precision = 5) THEN
    ALTER TABLE bill_line_items ALTER COLUMN vat_rate TYPE numeric(15,4);
  END IF;
END $$;
