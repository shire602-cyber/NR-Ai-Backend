-- E-Invoice Transmissions: tracks ASP / Peppol submission history
CREATE TABLE IF NOT EXISTS "einvoice_transmissions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"       uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "invoice_id"       uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "transmission_id"  text,
  "status"           text NOT NULL DEFAULT 'pending',
  "asp_provider"     text,
  "recipient_id"     text,
  "xml_hash"         text,
  "error_message"    text,
  "raw_response"     text,
  "submitted_at"     timestamp DEFAULT now() NOT NULL,
  "delivered_at"     timestamp,
  "created_by"       uuid REFERENCES "users"("id")
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_einvoice_tx_company"  ON "einvoice_transmissions" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_einvoice_tx_invoice"  ON "einvoice_transmissions" ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_einvoice_tx_status"   ON "einvoice_transmissions" ("status");
