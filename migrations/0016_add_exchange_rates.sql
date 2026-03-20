-- Exchange Rates table for multi-currency support

CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "base_currency" text NOT NULL DEFAULT 'AED',
  "target_currency" text NOT NULL,
  "rate" numeric(15,6) NOT NULL,
  "effective_date" date NOT NULL,
  "source" text DEFAULT 'manual',
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_company_id" ON "exchange_rates"("company_id");
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_currencies" ON "exchange_rates"("company_id", "base_currency", "target_currency");
CREATE INDEX IF NOT EXISTS "idx_exchange_rates_effective_date" ON "exchange_rates"("effective_date");
