# Change Plan v2 — Ordered File-Level Implementation

## Overview

13 atomic implementation steps to close 7 functional gaps. Each step is independently buildable and testable. Migration numbering starts at 0017 (0015 and 0016 already exist in the repo). All file paths are relative to the worktree root.

---

## Step 1 — Account Codes (Foundation Constants)

**Goal**: Add 5 new constants to `ACCOUNT_CODES` so all subsequent steps can reference GL accounts by code.

**Files Touched**:
| File | Action |
|------|--------|
| `server/lib/account-codes.ts` | Modify |

**Planned Changes**:
- Add 5 new entries to the `ACCOUNT_CODES` object (lines 6-15):
  - `INVENTORY: "1070"`
  - `ACCUMULATED_DEPRECIATION: "1240"`
  - `RETAINED_EARNINGS: "3020"`
  - `DEPRECIATION_EXPENSE: "5100"`
  - `COGS: "5130"`
- Total constant count goes from 8 to 13
- Existing 8 constants (`CASH`, `BANK_ACCOUNTS`, `ACCOUNTS_RECEIVABLE`, `VAT_RECEIVABLE_INPUT`, `ACCOUNTS_PAYABLE`, `VAT_PAYABLE_OUTPUT`, `PRODUCT_SALES`, `SERVICE_REVENUE`) remain unchanged

**Risks**:
- None. Additive-only change to a constants file. No runtime behavior change until consumers reference the new constants.

**Validation**:
- `npx tsc --noEmit` passes
- Grep confirms all 13 constants present

**Reversibility**: Delete the 5 new lines.

---

## Step 2 — Default Chart of Accounts Addition (COGS 5130)

**Goal**: Add the COGS account entry to the default chart so new companies get it automatically. Existing companies with older charts will have the account created via `getAccountByCode` fallback or manual setup.

**Files Touched**:
| File | Action |
|------|--------|
| `server/defaultChartOfAccounts.ts` | Modify |

**Planned Changes**:
- Insert new entry after code "5120" (Bad Debt Expense, line 493) and before the closing `];` on line 494:
  ```
  {
    code: "5130",
    nameEn: "Cost of Goods Sold",
    nameAr: "تكلفة البضاعة المباعة",
    description: "Cost of inventory sold",
    type: "expense",
    subType: null,
    isVatAccount: false,
    vatType: null,
    isSystemAccount: true,
  },
  ```
- All other accounts (1070 Inventory, 1240 Accumulated Depreciation, 3020 Retained Earnings, 5100 Depreciation Expense) already exist in the file. Verified at lines 86, 134, 256, 462 respectively.

**Risks**:
- Existing companies that created their chart before this change will not have account 5130. The COGS JE creation (Step 8) must handle the case where `getAccountByCode()` returns `undefined` for COGS.

**Validation**:
- `npx tsc --noEmit` passes
- Verify entry at correct position (after 5120, before closing bracket)

**Reversibility**: Remove the inserted object.

---

## Step 3 — Schema Additions (All New Tables + Field Additions)

**Goal**: Define all new Drizzle ORM schema objects in `shared/schema.ts` in a single atomic step. This creates the TypeScript types that migrations and route code depend on.

**Files Touched**:
| File | Action |
|------|--------|
| `shared/schema.ts` (~2320 lines) | Modify |

**Planned Changes**:

**3a. Add fields to `journalEntries` (line 179, before closing `})`)**:
- `currency` (text, default "AED")
- `exchangeRate` (numeric(15,6), default "1")

**3b. Add fields to `journalLines` (line 205, after `bankTransactionId`)**:
- `originalAmount` (numeric(15,2), nullable)
- `originalCurrency` (text, nullable)

**3c. Add field to `companies` (after existing fields, ~line 69 area)**:
- `costMethod` (text, default "weighted_average")

**3d. Add field to `inventoryMovements` (line 366, after `notes`)**:
- `totalCost` (numeric(15,2), nullable)

**3e. Add new table `fiscalYears` (after exchangeRates block, ~line 2321)**:
- Fields: `id` (uuid PK), `companyId` (FK companies, cascade), `name` (text), `startDate` (date), `endDate` (date), `status` (text, default "open"), `closedBy` (FK users, nullable), `closedAt` (timestamp, nullable), `closingEntryId` (FK journalEntries, nullable), `createdAt` (timestamp, defaultNow)
- `createInsertSchema` + type exports (`FiscalYear`, `InsertFiscalYear`)

**3f. Add new tables `creditNotes` + `creditNoteLines` (after fiscalYears)**:
- `creditNotes`: `id`, `companyId`, `number`, `customerId`, `customerName`, `customerTrn`, `date`, `currency`, `subtotal`, `vatAmount`, `total`, `linkedInvoiceId`, `reason`, `status`, `journalEntryId`, `appliedAmount`, `appliedToInvoiceId`, `createdBy`, `createdAt`
- `creditNoteLines`: `id`, `creditNoteId`, `description`, `quantity`, `unitPrice`, `vatRate`, `vatSupplyType`
- `createInsertSchema` + type exports for both

**3g. Update `insertJournalEntrySchema` and `insertJournalLineSchema`** — No changes needed; the `omit` patterns only exclude `id`/`createdAt`/`updatedAt`, and the new fields have defaults so they are optional in inserts.

**Risks**:
- Adding fields to existing tables with defaults means existing queries are unaffected (new columns are nullable or have defaults).
- The `insertJournalEntrySchema` auto-includes the new fields as optional (they have defaults), which is correct.
- Schema file is large (2320 lines); careful placement to avoid syntax errors.

**Validation**:
- `npx tsc --noEmit` passes
- All new types (`FiscalYear`, `InsertFiscalYear`, `CreditNote`, `InsertCreditNote`, `CreditNoteLine`, `InsertCreditNoteLine`) are importable

**Reversibility**: Remove the added fields and table definitions.

---

## Step 4 — Migration Files (Match Schema)

**Goal**: Create 4 SQL migration files that bring the PostgreSQL database schema in sync with the Drizzle schema changes from Step 3.

**Files Touched**:
| File | Action |
|------|--------|
| `migrations/0017_add_fiscal_years.sql` | Create |
| `migrations/0018_add_multi_currency_fields.sql` | Create |
| `migrations/0019_add_credit_notes.sql` | Create |
| `migrations/0020_add_cost_method.sql` | Create |

**Note**: Migration numbering adjusted because `0015_add_autonomous_gl.sql` and `0016_add_exchange_rates.sql` already exist.

**Planned Changes**:

**0017_add_fiscal_years.sql**:
```sql
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
```

**0018_add_multi_currency_fields.sql**:
```sql
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AED';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,6) DEFAULT 1;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS original_amount NUMERIC(15,2);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS original_currency TEXT;
```

**0019_add_credit_notes.sql**:
```sql
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
```

**0020_add_cost_method.sql**:
```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cost_method TEXT DEFAULT 'weighted_average';
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2);
```

**Risks**:
- `IF NOT EXISTS` / `IF NOT EXISTS` guards protect against re-runs.
- Column additions with defaults do not require table rewrites in PostgreSQL.
- Foreign key to `customer_contacts` assumes the table name in the DB is `customer_contacts` (confirm with schema's `pgTable("customer_contacts", ...)`).

**Validation**:
- Files parse as valid SQL
- Migrations can be applied to a fresh database (`npx drizzle-kit push` or manual application)
- `npx tsc --noEmit` still passes (migrations are not TypeScript)

**Reversibility**: Delete the migration files. For applied databases: `DROP TABLE` / `ALTER TABLE DROP COLUMN` SQL.

---

## Step 5 — Fiscal Years (Table + Routes + Guard)

**Goal**: Implement fiscal year CRUD, year-end close logic, and a shared guard that prevents JE creation in closed fiscal years. This guard is consumed by all subsequent JE-creating steps.

**Files Touched**:
| File | Action |
|------|--------|
| `server/lib/fiscal-year-guard.ts` | Create |
| `server/routes/fiscal-years.routes.ts` | Create |

**Planned Changes**:

**5a. `server/lib/fiscal-year-guard.ts`** (shared helper):
- Export `checkFiscalYearOpen(companyId: string, entryDate: Date | string): Promise<void>`
- Queries `fiscalYears` table for `status = 'closed'` AND `startDate <= entryDate <= endDate`
- If found, throws or returns error info: `"Cannot create journal entries in closed fiscal year {name} ({startDate} - {endDate})"`
- Uses Drizzle `db` for the query (imported from `../db`)
- Also export a pool-based variant `checkFiscalYearOpenPool(pool: any, companyId: string, entryDate: Date | string): Promise<void>` for use in `bill-pay.routes.ts` and `fixed-assets.routes.ts`

**5b. `server/routes/fiscal-years.routes.ts`**:
- 4 endpoints following the Drizzle ORM pattern (like `invoices.routes.ts`):
  1. `POST /api/companies/:companyId/fiscal-years` — Create fiscal year (validate non-overlap)
  2. `GET /api/companies/:companyId/fiscal-years` — List fiscal years
  3. `GET /api/companies/:companyId/fiscal-years/:id` — Get single
  4. `POST /api/companies/:companyId/fiscal-years/:id/close` — Year-end close
- All endpoints use `authMiddleware`, `requireCustomer`, `asyncHandler`, `storage.hasCompanyAccess()`
- Year-end close logic inside `(db as any).transaction(async (tx: any) => { ... })`:
  1. Sum income account balances (credits - debits) for entries within the fiscal year date range
  2. Sum expense account balances (debits - credits) for entries within the fiscal year date range
  3. Create closing JE: Debit each income account, Credit each expense account, Credit/Debit Retained Earnings (3020) for net
  4. Use `storage.getAccountByCode(companyId, ACCOUNT_CODES.RETAINED_EARNINGS)` for retained earnings
  5. Use `storage.generateEntryNumber(companyId, date, tx)` for entry number
  6. Post JE immediately, mark fiscal year closed
- Edge cases: already closed returns 400; no activity creates zero-amount closing entry

**Risks**:
- Year-end close query must correctly aggregate only entries within the fiscal year date range AND only posted entries. The SQL join between `journalLines`, `journalEntries` (for date/status filter), and `accounts` (for type filter) must be carefully constructed.
- Non-overlap validation: must check both company-scoped and inclusive date ranges.
- The guard adds a DB query to every JE-creating path. Impact is minimal (indexed query on companyId + date range).

**Validation**:
- `npx tsc --noEmit` passes
- Create a fiscal year via API, verify it appears in list
- Close a fiscal year, verify closing JE is created
- Attempt to create a JE in the closed period, verify 400 response

**Reversibility**: Delete the two new files.

---

## Step 6 — Multi-Currency (Fields + Conversion Logic + Storage Helper)

**Goal**: Enable foreign-currency transactions by adding the exchange rate lookup helper to storage and modifying invoice/receipt JE creation to convert to base currency.

**Files Touched**:
| File | Action |
|------|--------|
| `server/storage.ts` (~2814 lines) | Modify |
| `server/routes/invoices.routes.ts` (664 lines) | Modify |
| `server/routes/receipts.routes.ts` (264 lines) | Modify |

**Planned Changes**:

**6a. `server/storage.ts`** — Add `getExchangeRateForDate()`:
- Add to `IStorage` interface (after line 555, the existing `deleteExchangeRate` method):
  ```typescript
  getExchangeRateForDate(companyId: string, currency: string, date: Date): Promise<{ rate: string; effectiveDate: string } | null>;
  ```
- Add implementation to `DatabaseStorage` class (after line 2810):
  - Query `exchangeRates` where `companyId` matches AND `targetCurrency` matches AND `effectiveDate <= date`
  - Order by `effectiveDate DESC`, limit 1
  - Return `{ rate, effectiveDate }` or `null`

**6b. `server/routes/invoices.routes.ts`** — Multi-currency in JE creation:
- At line ~157 (inside the POST create invoice handler, before the `db.transaction`):
  - Add currency/exchange rate resolution:
    - If `invoiceData.currency && invoiceData.currency !== "AED"`: call `storage.getExchangeRateForDate()`; if null, return 400
    - Compute AED amounts: `aedSubtotal = subtotal * rate`, `aedVatAmount = vatAmount * rate`, `aedTotal = total * rate`
  - Inside the transaction (lines 181-221), when creating JE:
    - Set `currency` and `exchangeRate` on the journal entry
    - Use AED amounts for `debit`/`credit` on journal lines
    - Set `originalAmount` and `originalCurrency` on each journal line
  - If currency is AED, skip lookup, rate = 1, no originalAmount fields needed
- Add fiscal year guard call before the transaction (from Step 5):
  - `await checkFiscalYearOpen(companyId, invoiceDate);`

**6c. `server/routes/receipts.routes.ts`** — Multi-currency in JE creation:
- At line ~211 (inside the POST receipt handler, before `db.transaction`):
  - If receipt has a non-AED currency, look up exchange rate, convert amounts
  - Inside transaction: set currency/exchangeRate on JE, originalAmount/originalCurrency on journal lines
- Add fiscal year guard call before the transaction:
  - `await checkFiscalYearOpen(receipt.companyId, entryDate);`

**Risks**:
- Existing invoices/receipts in AED are unaffected (currency defaults to "AED", rate defaults to 1).
- The exchange rate lookup adds one DB query per non-AED transaction. Negligible overhead.
- Must ensure `numeric` multiplication is done in JavaScript as `Number(rate) * Number(amount)` and results are formatted to 2 decimal places for monetary values.
- Receipt route does not currently have a `currency` field on receipts. Need to check if it exists in the schema or if it must come from the request body. The conversion is conditional on the currency being non-AED.

**Validation**:
- `npx tsc --noEmit` passes
- Create an AED invoice, verify JE is identical to before (no regression)
- Create a non-AED invoice with an exchange rate in the DB, verify JE amounts are in AED with original amounts stored
- Create a non-AED invoice without an exchange rate, verify 400 response

**Reversibility**: Revert the changes in the 3 files. The schema fields (Step 3) and migration (Step 4) remain but are unused.

---

## Step 7 — Bills to GL (JE on Approve + Payment)

**Goal**: Make bill approval create an AP journal entry and bill payment create a payment journal entry, so the general ledger reflects vendor obligations.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes/bill-pay.routes.ts` (575 lines) | Modify |

**Planned Changes**:

**7a. Approve endpoint (lines 356-389)**:
- Import `ACCOUNT_CODES` from `../lib/account-codes`
- Import `checkFiscalYearOpenPool` from `../lib/fiscal-year-guard`
- Replace the simple UPDATE at lines 380-385 with a transactional block:
  ```
  pool.query('BEGIN')
  try {
    // Fiscal year guard
    await checkFiscalYearOpenPool(pool, bill.company_id, new Date());

    // Resolve accounts
    const apAccount = await storage.getAccountByCode(bill.company_id, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const vatInputAccount = await storage.getAccountByCode(bill.company_id, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

    // Get bill line items for expense accounts
    const linesResult = await pool.query('SELECT * FROM bill_line_items WHERE bill_id = $1', [id]);

    // Generate entry number
    const entryNumber = await storage.generateEntryNumber(bill.company_id, new Date());

    // INSERT journal_entries (source='vendor_bill', sourceId=bill.id)
    // INSERT journal_lines: Debit expense account(s), Debit VAT Input, Credit AP
    // UPDATE vendor_bills SET status='approved', journal_entry_id=...

    pool.query('COMMIT')
  } catch (e) {
    pool.query('ROLLBACK')
    throw e;
  }
  ```
- Bill line items with `account_id` use that account for the debit. Lines without default to the first expense account or a general expense.
- VAT is debited to VAT Receivable Input (1050) if `vat_amount > 0`.
- AP is credited for the bill total.

**7b. Payment endpoint (lines 392-473)**:
- Wrap the existing INSERT + UPDATE in a transaction:
  ```
  pool.query('BEGIN')
  try {
    // Fiscal year guard
    await checkFiscalYearOpenPool(pool, bill.company_id, paymentDate);

    // Verify bill is approved (has AP JE)
    if (bill.status !== 'approved' && bill.status !== 'partially_paid') {
      return 400: "Bill must be approved before payment"
    }

    // Resolve accounts: AP (2010), Bank (1020)
    // Generate entry number
    // INSERT journal_entries (source='bill_payment')
    // INSERT journal_lines: Debit AP, Credit Bank
    // INSERT bill_payments (existing logic)
    // UPDATE vendor_bills (existing logic)

    pool.query('COMMIT')
  } catch (e) {
    pool.query('ROLLBACK')
    throw e;
  }
  ```

**Risks**:
- `bill-pay.routes.ts` uses raw `pool.query()`. The JE inserts must also use `pool.query()` for consistency. Account resolution uses `storage.getAccountByCode()` which is a read-only Drizzle query outside the pool transaction -- this is safe.
- The `pool.query('BEGIN')` creates a transaction on a single connection from the pool. Must ensure the same client is used for all queries in the transaction. **Critical**: `pool.query()` does NOT guarantee the same connection across calls. Must use `const client = await pool.connect()` then `client.query('BEGIN')` ... `client.query('COMMIT')` ... `client.release()`. This pattern must replace the current approach.
- Bill line items table name must match the actual DB table (`bill_line_items`).

**Validation**:
- `npx tsc --noEmit` passes
- Approve a bill, verify JE created with correct accounts (Debit Expense, Debit VAT Input, Credit AP)
- Record payment, verify payment JE (Debit AP, Credit Bank)
- Attempt to approve/pay against a closed fiscal year, verify 400

**Reversibility**: Revert `bill-pay.routes.ts` to its pre-modification state.

---

## Step 8 — Fixed Asset Depreciation to GL (JE on Depreciation Run)

**Goal**: Make the `run-depreciation` endpoint create a journal entry for each depreciated asset, wrapped in a single transaction for batch atomicity.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes/fixed-assets.routes.ts` (420 lines) | Modify |

**Planned Changes**:
- At line 231 (the `run-depreciation` handler):
  - Import `ACCOUNT_CODES` from `../lib/account-codes`
  - Import `checkFiscalYearOpenPool` from `../lib/fiscal-year-guard`
  - Wrap the entire depreciation loop (lines 245-299) in a pool transaction:
    ```
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fiscal year guard for depreciation date
      const depDate = new Date(year, month - 1, 1);
      await checkFiscalYearOpenPool(pool, companyId, depDate);

      // Resolve accounts ONCE before the loop
      const depExpenseAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.DEPRECIATION_EXPENSE);
      const accDepAccount = await storage.getAccountByCode(companyId, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

      for (const asset of assetsResult.rows) {
        // ...existing depreciation calculation (unchanged)...

        if (monthlyDepreciation <= 0) { skip; continue; }

        // Idempotency: check if JE already exists for this asset+month
        const existingJE = await client.query(
          "SELECT id FROM journal_entries WHERE source = 'depreciation' AND source_id = $1 AND memo LIKE $2",
          [asset.id, `%${month}/${year}%`]
        );
        if (existingJE.rows.length > 0) { skip as already processed; continue; }

        // UPDATE fixed_assets (existing, now via client.query)
        // Generate entry number
        const entryNumber = await storage.generateEntryNumber(companyId, depDate);
        // INSERT journal_entries (source='depreciation', sourceId=asset.id)
        // INSERT journal_lines: Debit Depreciation Expense (5100)
        // INSERT journal_lines: Credit Accumulated Depreciation (1240)
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    ```
  - Memo format: `"Depreciation for {assetName} - {month}/{year}"`
  - JE is posted immediately (status = 'posted')
  - Log per-asset at info level

**Risks**:
- Same pool connection concern as Step 7: must use `pool.connect()` to get a dedicated client for the transaction.
- `storage.generateEntryNumber()` without tx uses default `db` connection. The entry number generation is outside the pool transaction scope. This is acceptable because `generateEntryNumber` uses `FOR UPDATE` locking internally, which prevents duplicates.
- Large asset sets could create many JEs in one transaction. Acceptable for depreciation batches (typically dozens, not thousands).
- Idempotency check uses memo LIKE pattern. Must ensure memo format is consistent.

**Validation**:
- `npx tsc --noEmit` passes
- Run depreciation, verify JE created per asset with correct accounts
- Run depreciation again for same month, verify idempotency (no duplicate JEs)
- Fully depreciated assets are skipped with `skipped: true`
- Verify entire batch rolls back if one asset fails

**Reversibility**: Revert `fixed-assets.routes.ts` to its pre-modification state.

---

## Step 9 — Inventory COGS (JE on Product Invoice)

**Goal**: When an invoice includes product line items, automatically create a COGS journal entry and inventory movement.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes/invoices.routes.ts` (664 lines) | Modify |

**Planned Changes**:
- Inside the existing `db.transaction()` block (lines 158-225), after the revenue JE creation (after line 221):
  - For each invoice line from the request body that has a `productId`:
    1. Look up product via `tx.select().from(products).where(eq(products.id, line.productId))`
    2. If product exists AND `product.costPrice > 0`:
       - Calculate `cogsAmount = line.quantity * Number(product.costPrice)`
       - Resolve COGS account: `storage.getAccountByCode(companyId, ACCOUNT_CODES.COGS)`
       - Resolve Inventory account: `storage.getAccountByCode(companyId, ACCOUNT_CODES.INVENTORY)`
       - If both accounts exist:
         - Generate new entry number for COGS JE
         - Create COGS JE (source: `"cogs"`, sourceId: invoice.id)
         - Debit COGS (5130) for cogsAmount
         - Credit Inventory (1070) for cogsAmount
       - Create inventory movement (type: "sale", quantity: -line.quantity, unitCost: product.costPrice, totalCost: cogsAmount)
       - Update product `currentStock -= line.quantity`
  - Service-only invoices (no productId on any line) skip COGS entirely
  - Lines with `costPrice = 0` skip COGS for that line

**Risks**:
- The `productId` is passed in the request body but NOT stored on `invoiceLines` table (design decision from plan). If a product is deleted later, the COGS association is tracked only via the JE source linkage.
- Must import `products` and `inventoryMovements` tables from schema.
- The transaction now does more work (product lookup + COGS JE + inventory movement per product line). Latency increase is minimal for typical invoice sizes (1-10 lines).
- If COGS or Inventory accounts do not exist for the company (older chart), COGS JE is silently skipped (logged at warn level).

**Validation**:
- `npx tsc --noEmit` passes
- Create an invoice with product lines (productId + costPrice > 0), verify COGS JE created
- Create a service-only invoice, verify no COGS JE
- Create an invoice with a zero-costPrice product, verify no COGS for that line
- Verify inventory movement created with correct quantities and costs
- Verify product currentStock decremented

**Reversibility**: Revert `invoices.routes.ts` COGS-related additions.

---

## Step 10 — Credit Notes (New Table + Routes + Reversing JE)

**Goal**: Implement full credit note lifecycle: create, list, get, update, post (with reversing JE), and apply against invoices.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes/credit-notes.routes.ts` | Create |

**Planned Changes**:
- New route file following the Drizzle ORM pattern from `invoices.routes.ts`:
  - Export `registerCreditNoteRoutes(app: Express)`
  - Import: `db`, `storage`, `ACCOUNT_CODES`, `checkFiscalYearOpen`, schema tables (`creditNotes`, `creditNoteLines`, `journalEntries`, `journalLines`, `invoices`)
  - 6 endpoints:
    1. **POST `/api/companies/:companyId/credit-notes`** — Create draft credit note with lines. Auto-generate number: `CN-YYYYMMDD-NNN`. Validate lines total matches computed subtotal/vat/total.
    2. **GET `/api/companies/:companyId/credit-notes`** — List with optional filters (status, date range, customer). Return with line items.
    3. **GET `/api/companies/:companyId/credit-notes/:id`** — Get single with lines.
    4. **PUT `/api/companies/:companyId/credit-notes/:id`** — Update draft only. Return 400 if status is not "draft".
    5. **POST `/api/companies/:companyId/credit-notes/:id/post`** — Post credit note:
       - Validate status is "draft"
       - Fiscal year guard: `await checkFiscalYearOpen(companyId, creditNote.date)`
       - Multi-currency: if `currency !== "AED"`, look up exchange rate, convert amounts
       - Inside `(db as any).transaction(async (tx: any) => { ... })`:
         - Resolve accounts: AR (1040), Product Sales (4010), VAT Output (2020)
         - Generate entry number
         - Create JE (source: `"credit_note"`, sourceId: creditNote.id)
         - **Credit** AR for total (AED)
         - **Debit** Product Sales for subtotal (AED)
         - **Debit** VAT Output for vatAmount (AED) — skip if zero
         - Set originalAmount/originalCurrency on lines if multi-currency
         - Update credit note: status = "posted", journalEntryId = entry.id
    6. **POST `/api/companies/:companyId/credit-notes/:id/apply`** — Apply against invoice:
       - Validate: credit note is posted, invoiceId provided, amount provided
       - Validate: invoice belongs to same company
       - Validate: amount does not exceed credit note remaining (`total - appliedAmount`) or invoice outstanding
       - Update credit note: `appliedAmount += amount`, `appliedToInvoiceId = invoiceId`
       - Reduce invoice balance (update invoice total or create an adjustment)
  - All endpoints use `authMiddleware`, `requireCustomer`, `asyncHandler`, `storage.hasCompanyAccess()`

**Risks**:
- Credit note number generation (CN-YYYYMMDD-NNN) needs a sequence or max-query similar to `generateEntryNumber`. Simplest approach: query max CN number for that date prefix and increment.
- The apply endpoint modifies the invoice. Must ensure the invoice update does not break invoice JE integrity (the invoice JE remains unchanged; only the invoice's outstanding/paid status changes).
- Multi-currency integration must match the pattern from Step 6 exactly.

**Validation**:
- `npx tsc --noEmit` passes
- Create a credit note, verify draft status
- Post a credit note, verify reversing JE (Credit AR, Debit Revenue, Debit VAT)
- Post a zero-VAT credit note, verify 2-line JE (no VAT line)
- Apply credit note against invoice, verify balances
- Attempt to apply more than remaining, verify 400
- Post credit note in closed fiscal year, verify 400

**Reversibility**: Delete `credit-notes.routes.ts`.

---

## Step 11 — AI nameEn Fix

**Goal**: Harden AI account resolution to use account codes as primary identifier, with nameEn as fallback.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes/ai.routes.ts` (1741 lines) | Modify |

**Planned Changes**:

**11a. Location 1 — Expense Categorization (line 67-68)**:
- Change account list format to include codes:
  ```typescript
  const accountList = expenseAccounts.map(acc =>
    `${acc.code}: ${acc.nameEn}${acc.nameAr ? ` (${acc.nameAr})` : ''}`
  ).join('\n');
  ```
- At line 101-108, add code-first resolution:
  ```typescript
  const aiResponse = JSON.parse(completion.choices[0].message.content || '{}');
  const matchedAccount = expenseAccounts.find(a => a.code === aiResponse.accountCode)
    || expenseAccounts.find(a => a.nameEn.toLowerCase() === aiResponse.accountName?.toLowerCase());
  if (!matchedAccount && aiResponse.accountCode) {
    console.warn('[AI] Code match failed, nameEn fallback used:', aiResponse.accountCode);
  }
  ```

**11b. Location 2 — Transaction Classification (line 287-289)**:
- Change account list format:
  ```typescript
  const accountList = allAccounts.map(acc =>
    `${acc.code}: ${acc.nameEn} (${acc.type})${acc.nameAr ? ` - ${acc.nameAr}` : ''}`
  ).join('\n');
  ```
- Update the AI prompt to ask for account code in the response
- Parse response for code first, nameEn as fallback

**11c. Location 3 — Receipt Account Suggestion (lines 1677-1692)**:
- Change prompt to include codes:
  ```typescript
  ${expenseAccounts.map(a => `- ${a.code}: ${a.nameEn}`).join('\n')}
  Respond with just the account code, nothing else.
  ```
- Change matching at lines 1689-1692:
  ```typescript
  const suggestedCode = response.choices[0]?.message?.content?.trim();
  const matchedAccount = expenseAccounts.find(a => a.code === suggestedCode)
    || expenseAccounts.find(a => a.nameEn.toLowerCase() === suggestedCode?.toLowerCase());
  if (matchedAccount && matchedAccount.code !== suggestedCode) {
    console.warn('[AI] Receipt suggestion: code match failed, fell back to nameEn:', suggestedCode);
  }
  ```

**Risks**:
- AI model might still return nameEn instead of code. The fallback to nameEn ensures no regression.
- Prompt changes could slightly alter AI categorization behavior. The change is additive (more info in prompt), so categorization should improve or stay the same.
- Must not break the existing response format — the changes only affect how the account list is presented to the AI and how the response is parsed.

**Validation**:
- `npx tsc --noEmit` passes
- All 3 AI endpoints still return valid responses
- No `nameEn ===` as primary match (only as fallback after code match)

**Reversibility**: Revert the 3 locations in `ai.routes.ts`.

---

## Step 12 — Route Registration

**Goal**: Register the 2 new route modules (credit-notes, fiscal-years) in the Express app.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes.ts` (123 lines) | Modify |

**Planned Changes**:
- Add imports at the top (after line 57, the `registerExchangeRateRoutes` import):
  ```typescript
  import { registerFiscalYearRoutes } from './routes/fiscal-years.routes';
  import { registerCreditNoteRoutes } from './routes/credit-notes.routes';
  ```
- Add registrations in the Core Accounting section (after line 80, `registerExchangeRateRoutes(app)`):
  ```typescript
  registerFiscalYearRoutes(app);
  registerCreditNoteRoutes(app);
  ```

**Risks**:
- None. Additive change. Existing routes are unaffected.
- Route collision: new routes use unique paths (`/api/companies/:companyId/fiscal-years`, `/api/companies/:companyId/credit-notes`) that do not conflict with existing routes.

**Validation**:
- `npx tsc --noEmit` passes
- Server starts without errors
- New endpoints are reachable

**Reversibility**: Remove the 2 import lines and 2 registration lines.

---

## Step 13 — Fiscal Year Guard Integration in Journal Routes

**Goal**: Add the closed fiscal year guard to the manual journal entry creation endpoint.

**Files Touched**:
| File | Action |
|------|--------|
| `server/routes/journal.routes.ts` (406 lines) | Modify |

**Planned Changes**:
- Import `checkFiscalYearOpen` from `../lib/fiscal-year-guard`
- At line 82 (after `entryDate` is computed, before `const isPosting`):
  ```typescript
  // Check if entry date falls within a closed fiscal year
  await checkFiscalYearOpen(companyId, entryDate);
  ```
- This single line addition protects manual JE creation. The guard for invoice/receipt/credit-note/bill/depreciation paths was already added in their respective steps (6, 7, 8, 10).

**Risks**:
- The guard is async and throws/returns a 400 on failure. The `asyncHandler` wrapper will catch and forward the error to the client.
- Minimal latency addition (single indexed query).

**Validation**:
- `npx tsc --noEmit` passes
- Create a manual JE with a date in a closed fiscal year, verify 400
- Create a manual JE with a date in an open or no fiscal year, verify success

**Reversibility**: Remove the import and the single guard call.

---

## Step 14 — Validation (tsc + build + test)

**Goal**: Final verification that the entire codebase compiles, builds, and passes tests.

**Files Touched**: None (read-only validation step).

**Planned Changes**:
- Run `npx tsc --noEmit` — expect zero errors
- Run `npm run build` — expect successful build
- Run `npm test` (if test suite exists) — expect all tests pass
- Review all `console.error`, `console.warn`, `log.info` calls in new/modified code for correct log levels per observability requirements

**Risks**:
- TypeScript errors from schema changes propagating to unmodified files that import the changed types. Mitigated by: all new fields have defaults (are optional in inserts), all new tables are new exports (no existing code references them).
- Build failures from circular imports or missing exports. Mitigated by: following existing import patterns.

**Validation**:
- Zero TypeScript errors
- Successful production build
- All acceptance criteria from the task contract can be manually verified

**Reversibility**: N/A (read-only step).

---

## Dependency Graph

```
Step 1 (Account Codes)
  |
Step 2 (Default CoA)
  |
Step 3 (Schema)
  |
Step 4 (Migrations)
  |
Step 5 (Fiscal Years + Guard)
  |
Step 6 (Multi-Currency + FY Guard in invoices/receipts)
  |
  +--- Step 7 (Bills to GL + FY Guard)
  +--- Step 8 (Depreciation to GL + FY Guard)
  |
Step 9 (COGS in invoices)  [depends on Step 6 for invoices.routes.ts changes]
  |
Step 10 (Credit Notes)     [depends on Step 5 guard + Step 6 multi-currency]
  |
Step 11 (AI nameEn fix)    [independent, placed here for ordering clarity]
  |
Step 12 (Route Registration) [depends on Steps 5 + 10 for route files to exist]
  |
Step 13 (Journal Guard)    [depends on Step 5 for guard to exist]
  |
Step 14 (Validation)       [depends on all above]
```

---

## Complete File Manifest

### Files to Create (7)
| # | File | Created In Step |
|---|------|----------------|
| 1 | `server/lib/fiscal-year-guard.ts` | Step 5 |
| 2 | `server/routes/fiscal-years.routes.ts` | Step 5 |
| 3 | `server/routes/credit-notes.routes.ts` | Step 10 |
| 4 | `migrations/0017_add_fiscal_years.sql` | Step 4 |
| 5 | `migrations/0018_add_multi_currency_fields.sql` | Step 4 |
| 6 | `migrations/0019_add_credit_notes.sql` | Step 4 |
| 7 | `migrations/0020_add_cost_method.sql` | Step 4 |

### Files to Modify (11)
| # | File | Modified In Step(s) |
|---|------|---------------------|
| 1 | `server/lib/account-codes.ts` | Step 1 |
| 2 | `server/defaultChartOfAccounts.ts` | Step 2 |
| 3 | `shared/schema.ts` | Step 3 |
| 4 | `server/storage.ts` | Step 6 |
| 5 | `server/routes/invoices.routes.ts` | Steps 6, 9 |
| 6 | `server/routes/receipts.routes.ts` | Step 6 |
| 7 | `server/routes/bill-pay.routes.ts` | Step 7 |
| 8 | `server/routes/fixed-assets.routes.ts` | Step 8 |
| 9 | `server/routes/ai.routes.ts` | Step 11 |
| 10 | `server/routes.ts` | Step 12 |
| 11 | `server/routes/journal.routes.ts` | Step 13 |

### Total: 7 new files + 11 modified files = 18 file operations

---

## Critical Implementation Notes

1. **Pool transaction pattern**: Steps 7 and 8 modify `pool.query()`-based routes. Must use `const client = await pool.connect()` then `client.query()` for all statements within a transaction. Do NOT use bare `pool.query()` within a transaction -- it may acquire a different connection.

2. **Migration numbering**: Starts at 0017, not 0015 as originally planned in the task contract. The repo already has `0015_add_autonomous_gl.sql` and `0016_add_exchange_rates.sql`.

3. **invoices.routes.ts double-modification**: This file is modified in Step 6 (multi-currency) and Step 9 (COGS). Step 9 must build on top of Step 6's changes, not replace them.

4. **Account resolution pattern**: Every new JE creation must use `storage.getAccountByCode(companyId, ACCOUNT_CODES.XXX)`. Check for undefined return and handle gracefully (500 error for required system accounts, skip for optional accounts like COGS).

5. **Fiscal year guard placement**: The guard must be called BEFORE `db.transaction()` or `pool.query('BEGIN')`, not inside. This prevents starting a transaction that will be immediately rolled back.

---

## Readiness Decision

# READY FOR IMPLEMENTATION
