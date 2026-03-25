# Task Contract v2 — Remaining Gap Fixes

## 1. Objective

Close all remaining functional gaps in the Muhasib.ai accounting backend to achieve competitive parity with production-grade accounting software. This covers 7 gaps: credit notes, multi-currency transaction support, fiscal year management, vendor bill GL integration, inventory COGS tracking, fixed asset depreciation GL posting, and AI route account resolution hardening.

## 2. Business Context

The v1 contract fixed critical accounting bugs (float precision, broken balance sheet, missing transactions, fragile string lookups) and recovered 11 stranded modules. The platform now has correct double-entry fundamentals. However, several modules compute values without posting to the general ledger (bills, depreciation), key accounting constructs are missing entirely (credit notes, fiscal years), multi-currency support is half-built (exchange rates table exists but transactions ignore it), and the AI categorization still relies on nameEn string matching in places. These gaps prevent Muhasib.ai from being trusted as a primary accounting system for UAE businesses that deal in multiple currencies, issue credit notes, or need year-end close procedures.

## 3. In-Scope Behavior

### Gap 1 — Credit Notes

**G1.1 — Schema: `creditNotes` and `creditNoteLines` tables**
- Add `creditNotes` pgTable in `shared/schema.ts` with fields:
  - `id` (uuid, PK, auto-generated)
  - `companyId` (uuid, FK to companies, cascade delete)
  - `number` (text, not null) — auto-generated CN-YYYYMMDD-NNN
  - `customerId` (uuid, FK to customerContacts, nullable)
  - `customerName` (text, not null)
  - `customerTrn` (text, nullable)
  - `date` (timestamp, not null)
  - `currency` (text, default "AED")
  - `subtotal` (numeric(15,2), default "0")
  - `vatAmount` (numeric(15,2), default "0")
  - `total` (numeric(15,2), default "0")
  - `linkedInvoiceId` (uuid, FK to invoices, nullable) — the invoice this credit note is against
  - `reason` (text) — reason for credit
  - `status` (text, default "draft") — draft | posted | void
  - `journalEntryId` (uuid, FK to journalEntries, nullable)
  - `createdBy` (uuid, FK to users)
  - `createdAt` (timestamp, defaultNow)
- Add `creditNoteLines` pgTable:
  - `id` (uuid, PK)
  - `creditNoteId` (uuid, FK to creditNotes, cascade delete)
  - `description` (text, not null)
  - `quantity` (real, not null)
  - `unitPrice` (numeric(15,2), not null)
  - `vatRate` (real, default 0.05)
  - `vatSupplyType` (text, default "standard_rated")
- Add `createInsertSchema` for both tables
- Export types: `CreditNote`, `InsertCreditNote`, `CreditNoteLine`, `InsertCreditNoteLine`

**G1.2 — Migration: `0015_add_credit_notes.sql`**
- Create migration file in `migrations/` for both tables

**G1.3 — CRUD Endpoints: `server/routes/credit-notes.routes.ts`**
- `POST /api/companies/:companyId/credit-notes` — Create credit note with lines
- `GET /api/companies/:companyId/credit-notes` — List credit notes (filter by status, date range, customer)
- `GET /api/companies/:companyId/credit-notes/:id` — Get single credit note with lines
- `PUT /api/companies/:companyId/credit-notes/:id` — Update draft credit note
- `POST /api/companies/:companyId/credit-notes/:id/post` — Post credit note (triggers JE creation)
- `POST /api/companies/:companyId/credit-notes/:id/apply` — Apply credit note against an outstanding invoice (reduces invoice balance)
- All endpoints use `authMiddleware`, `requireCustomer`, `asyncHandler`, and `storage.hasCompanyAccess()`

**G1.4 — Auto-Generate Reversing Journal Entry on Post**
- When a credit note is posted, create a journal entry inside `db.transaction()`:
  - **Credit** Accounts Receivable (code 1040) for the total amount
  - **Debit** Product Sales / Service Revenue (code 4010) for the subtotal
  - **Debit** VAT Payable Output (code 2020) for the VAT amount (skip line if VAT is zero)
- Use `getAccountByCode()` with `ACCOUNT_CODES` — never use nameEn string matching
- Journal entry source: `"credit_note"`, sourceId: credit note ID
- Mark credit note status as `"posted"`, store `journalEntryId`

**G1.5 — Apply Credit Against Invoice**
- The apply endpoint accepts `{ invoiceId, amount }`
- Validates: credit note is posted, invoice belongs to same company, amount does not exceed credit note remaining balance or invoice outstanding balance
- Reduces the invoice's outstanding balance (creates a payment-like record or adjusts the invoice directly)
- Stores the application linkage for audit trail

**G1.6 — Route Registration**
- Register `registerCreditNoteRoutes` in `server/routes.ts` under Core Accounting section

### Gap 2 — Multi-Currency in Transactions

**G2.1 — Schema: Add currency fields to `journalEntries`**
- Add to `journalEntries` table in `shared/schema.ts`:
  - `currency` (text, default "AED") — the transaction currency
  - `exchangeRate` (numeric(15,6), default "1") — rate to convert to base currency (AED)
- Add to `journalLines` table:
  - `originalAmount` (numeric(15,2), nullable) — amount in original currency (debit or credit)
  - `originalCurrency` (text, nullable) — currency code for the original amount

**G2.2 — Migration: `0016_add_multi_currency_fields.sql`**
- ALTER TABLE journal_entries ADD currency, exchange_rate
- ALTER TABLE journal_lines ADD original_amount, original_currency

**G2.3 — Invoice Foreign Currency Support**
- In `invoices.routes.ts`, when creating an invoice:
  - If `invoice.currency !== "AED"`, look up the exchange rate from `exchangeRates` table for the invoice date (latest rate on or before that date)
  - If no rate found, return 400 error: "Exchange rate not found for {currency} on {date}"
  - Journal entry amounts = original amounts * exchange rate (converted to AED)
  - Store original currency amounts on journal lines (`originalAmount`, `originalCurrency`)
  - Journal entry gets `currency` and `exchangeRate` fields set

**G2.4 — Receipt Foreign Currency Support**
- In `receipts.routes.ts`, when posting a receipt:
  - Same pattern as invoices: look up exchange rate, convert to base currency for JE, store original currency amounts

**G2.5 — Credit Note Foreign Currency Support**
- Credit notes (from G1) must also support multi-currency using the same pattern

**G2.6 — Exchange Rate Lookup Helper**
- Add `getExchangeRate(companyId: string, currency: string, date: Date)` method to `IStorage` and `DatabaseStorage`
- Returns the most recent rate on or before the given date for the given currency pair
- Returns `null` if no rate exists (caller handles the error)

### Gap 3 — Fiscal Year Management

**G3.1 — Schema: `fiscalYears` table**
- Add `fiscalYears` pgTable in `shared/schema.ts`:
  - `id` (uuid, PK)
  - `companyId` (uuid, FK to companies, cascade delete)
  - `name` (text, not null) — e.g., "FY 2025"
  - `startDate` (date, not null)
  - `endDate` (date, not null)
  - `status` (text, default "open") — open | closed
  - `closedBy` (uuid, FK to users, nullable)
  - `closedAt` (timestamp, nullable)
  - `closingEntryId` (uuid, FK to journalEntries, nullable) — the year-end closing JE
  - `createdAt` (timestamp, defaultNow)
- Add `createInsertSchema`, export types

**G3.2 — Migration: `0017_add_fiscal_years.sql`**
- CREATE TABLE for fiscal_years

**G3.3 — CRUD + Year-End Close Endpoints: `server/routes/fiscal-years.routes.ts`**
- `POST /api/companies/:companyId/fiscal-years` — Create fiscal year
- `GET /api/companies/:companyId/fiscal-years` — List fiscal years
- `GET /api/companies/:companyId/fiscal-years/:id` — Get single fiscal year
- `POST /api/companies/:companyId/fiscal-years/:id/close` — Year-end close

**G3.4 — Year-End Close Logic**
- Inside `db.transaction()`:
  1. Query all income accounts: sum their posted journal line credits minus debits = net income per account
  2. Query all expense accounts: sum their posted journal line debits minus credits = net expense per account
  3. Calculate total net income = total income - total expenses
  4. Create closing journal entry:
     - **Debit** each income account for its net balance (zeros it out)
     - **Credit** each expense account for its net balance (zeros it out)
     - **Credit** Retained Earnings (code 3020) for the net income (or debit if net loss)
  5. Post the journal entry immediately (status = "posted")
  6. Mark fiscal year status = "closed", store closedBy, closedAt, closingEntryId
  7. Journal entry source: `"year_end_close"`, memo: "Year-end closing entry for FY {name}"

**G3.5 — Closed Year Protection**
- Add a guard in journal entry creation (in `journal.routes.ts` and any route that creates JEs):
  - Before creating a JE, check if the entry date falls within a closed fiscal year for that company
  - If it does, return 400: "Cannot create journal entries in closed fiscal year {name} ({startDate} - {endDate})"
- This guard must also apply to: invoice creation, receipt posting, credit note posting, bill approval, depreciation run

**G3.6 — Route Registration**
- Register `registerFiscalYearRoutes` in `server/routes.ts`

**G3.7 — Account Code Addition**
- Add `RETAINED_EARNINGS: "3020"` to `ACCOUNT_CODES` in `server/lib/account-codes.ts`

### Gap 4 — Bills to GL Integration

**G4.1 — Auto-Generate AP Journal Entry on Bill Approval**
- In `bill-pay.routes.ts`, in the approve bill endpoint (or create if no approval flow):
  - Inside `db.transaction()`:
    1. Resolve accounts: Accounts Payable (2010), expense account (from bill line's accountId, or fallback to a default expense account)
    2. Create journal entry with source `"vendor_bill"`, sourceId = bill ID
    3. Journal lines:
       - **Debit** Expense account(s) for each line item's net amount
       - **Debit** VAT Receivable Input (1050) for the VAT amount (if > 0)
       - **Credit** Accounts Payable (2010) for the total amount
    4. Post the journal entry
    5. Update bill status to "approved"

**G4.2 — Auto-Generate Payment Journal Entry on Bill Payment**
- In `bill-pay.routes.ts`, in the record payment endpoint:
  - Inside `db.transaction()`:
    1. Resolve accounts: Accounts Payable (2010), Bank/Cash (from payment method or default 1020)
    2. Create journal entry with source `"bill_payment"`, sourceId = bill payment ID
    3. Journal lines:
       - **Debit** Accounts Payable (2010) for the payment amount
       - **Credit** Bank Accounts (1020) for the payment amount
    4. Post the journal entry
    5. Update bill amountPaid, and if fully paid set status to "paid"

**G4.3 — Account Code Additions**
- Add to `ACCOUNT_CODES` in `server/lib/account-codes.ts`:
  - `ACCOUNTS_PAYABLE: "2010"` (already maps to existing chart entry)
  - `VAT_RECEIVABLE_INPUT: "1050"` (already exists in ACCOUNT_CODES)
  - `BANK_ACCOUNTS: "1020"` (already exists in ACCOUNT_CODES)

### Gap 5 — Inventory COGS

**G5.1 — Schema: Add `costMethod` to companies**
- Add `costMethod` field to `companies` table in `shared/schema.ts`:
  - `costMethod` (text, default "weighted_average") — "fifo" | "weighted_average"

**G5.2 — Migration: `0018_add_cost_method.sql`**
- ALTER TABLE companies ADD cost_method

**G5.3 — Schema: Add `costPerUnit` to `inventoryMovements`**
- The `unitCost` field already exists on `inventoryMovements` — confirm it is populated on purchase movements
- Add `totalCost` field (numeric(15,2), nullable) to `inventoryMovements` for tracking total cost of the movement

**G5.4 — Auto-Generate COGS Journal Entry on Invoice with Products**
- In `invoices.routes.ts`, after creating the invoice JE:
  - For each invoice line that references a product (need to add `productId` check):
    1. Look up the product's `costPrice`
    2. Calculate COGS = quantity * costPrice
    3. Create inventory movement (type: "sale", quantity: negative, unitCost: costPrice)
    4. Update product's `currentStock`
    5. Create COGS journal entry inside the same transaction:
       - **Debit** COGS account for the total cost
       - **Credit** Inventory account (1070) for the total cost
    6. Journal entry source: `"cogs"`, sourceId = invoice ID

**G5.5 — Account Code Additions**
- Add to `ACCOUNT_CODES`:
  - `INVENTORY: "1070"`
  - `COGS: "5130"` — new account code (must also be added to `defaultChartOfAccounts.ts`)

**G5.6 — Default Chart of Accounts Addition**
- Add to `server/defaultChartOfAccounts.ts`:
  - `{ code: "5130", nameEn: "Cost of Goods Sold", nameAr: "تكلفة البضاعة المباعة", description: "Cost of inventory sold", type: "expense", subType: null, isVatAccount: false, vatType: null, isSystemAccount: true }`

### Gap 6 — Fixed Asset Depreciation to GL

**G6.1 — Auto-Generate Depreciation Journal Entry**
- In `fixed-assets.routes.ts`, in the `run-depreciation` endpoint (line 231):
  - After calculating and updating each asset's accumulated depreciation:
    1. Resolve accounts: Depreciation Expense (5100), Accumulated Depreciation (1240)
    2. Create journal entry inside a transaction (wrap the entire batch in `db.transaction()`):
       - **Debit** Depreciation Expense (5100) for the monthly depreciation amount
       - **Credit** Accumulated Depreciation (1240) for the same amount
    3. Journal entry source: `"depreciation"`, sourceId = asset ID
    4. Memo: "Depreciation for {assetName} - {month}/{year}"
    5. Post the journal entry immediately

**G6.2 — Account Code Additions**
- Add to `ACCOUNT_CODES`:
  - `DEPRECIATION_EXPENSE: "5100"`
  - `ACCUMULATED_DEPRECIATION: "1240"`

**G6.3 — Batch Depreciation Transaction Safety**
- The entire `run-depreciation` loop must be wrapped in `db.transaction()`:
  - All asset updates and all JE creations happen atomically
  - If any asset fails, the entire batch rolls back
  - Since fixed-assets.routes.ts uses `pool.query()`, the transaction must use `pool` or be migrated to use the Drizzle `db.transaction()` pattern. Preferred approach: use `pool.query('BEGIN')` / `pool.query('COMMIT')` / `pool.query('ROLLBACK')` pattern consistent with the existing file's style.

### Gap 7 — AI Routes Account Resolution Hardening

**G7.1 — Replace nameEn String Matching in AI Categorization Response Parsing**
- In `ai.routes.ts`, around line 1688-1692 (the receipt account suggestion endpoint):
  - Currently: AI returns an account name string, code does `expenseAccounts.find(a => a.nameEn.toLowerCase() === suggestedName?.toLowerCase())`
  - Fix: Change the AI prompt to return the account code (not name). Parse the response as a code. Look up by `account.code === suggestedCode`. Fall back to nameEn match if code match fails.
  - Update the prompt at line 1677-1680 to include account codes: `"- {code}: {nameEn}"` format instead of just `"- {nameEn}"`

**G7.2 — AI Expense Categorization Prompt Fix**
- In `ai.routes.ts`, around line 67-68 (the expense categorization endpoint):
  - Currently: account list shows only nameEn
  - Fix: Include account code in the prompt: `"${acc.code}: ${acc.nameEn}"` format
  - Parse response to extract code first, nameEn as fallback

**G7.3 — AI Transaction Classification Prompt Fix**
- In `ai.routes.ts`, around line 287-288 (the transaction classification endpoint):
  - Currently: account list shows `"${acc.nameEn} (${acc.type})"`
  - Fix: Include account code: `"${acc.code}: ${acc.nameEn} (${acc.type})"` format
  - Parse response to extract code first, nameEn as fallback

## 4. Out-of-Scope / Non-Goals

- Frontend changes (backend-only scope)
- Full IFRS 21 (IAS 21) multi-currency translation of financial statements
- Unrealized foreign exchange gain/loss calculation
- Inventory valuation reports (FIFO layer tracking beyond cost tracking)
- Multi-company consolidation
- Credit note PDF generation (separate task)
- Migrating `fixed-assets.routes.ts` or `bill-pay.routes.ts` from `pool.query()` to Drizzle ORM (accepted as-is)
- Fiscal year auto-detection / auto-creation
- Partial credit note application (apply full or specific amount only — no split across multiple invoices in a single call)
- API documentation / OpenAPI spec

## 5. Inputs

- Current codebase at `/Users/arahm/Desktop/NR-Ai-Backend-fix/.claude/worktrees/nervous-wozniak/`
- Existing `server/lib/account-codes.ts` with 8 constants
- Existing `server/defaultChartOfAccounts.ts` with accounts 1010-5120
- Existing `shared/schema.ts` with 65+ pgTable definitions
- Existing `server/routes.ts` with 37 registered route modules
- Existing invoice JE creation pattern in `invoices.routes.ts` (code-based lookup + db.transaction)
- Existing bill-pay routes using `pool.query()` raw SQL pattern
- Existing fixed-assets routes using `pool.query()` raw SQL pattern
- Existing exchange rates table and CRUD endpoints

## 6. Outputs

- Modified `shared/schema.ts` with:
  - `creditNotes` and `creditNoteLines` tables
  - `fiscalYears` table
  - `currency` and `exchangeRate` fields on `journalEntries`
  - `originalAmount` and `originalCurrency` fields on `journalLines`
  - `costMethod` field on `companies`
  - `totalCost` field on `inventoryMovements`
- New `server/routes/credit-notes.routes.ts` (6 endpoints)
- New `server/routes/fiscal-years.routes.ts` (4 endpoints)
- Modified `server/routes/invoices.routes.ts` (multi-currency conversion, COGS JE)
- Modified `server/routes/receipts.routes.ts` (multi-currency conversion)
- Modified `server/routes/bill-pay.routes.ts` (AP journal entries on approval, payment JE on payment)
- Modified `server/routes/fixed-assets.routes.ts` (depreciation JE posting, transaction safety)
- Modified `server/routes/journal.routes.ts` (closed fiscal year guard)
- Modified `server/routes/ai.routes.ts` (code-based account resolution in 3 endpoints)
- Modified `server/lib/account-codes.ts` with 7 new constants
- Modified `server/defaultChartOfAccounts.ts` with COGS account
- Modified `server/storage.ts` with `getExchangeRate()` method
- New `migrations/0015_add_credit_notes.sql`
- New `migrations/0016_add_multi_currency_fields.sql`
- New `migrations/0017_add_fiscal_years.sql`
- New `migrations/0018_add_cost_method.sql`
- Modified `server/routes.ts` with 2 new route registrations
- Zero TypeScript errors (`npx tsc --noEmit`)
- Successful build (`npm run build`)

## 7. Constraints

- **No new dependencies** — Use only existing packages (drizzle-orm, pg, zod, etc.)
- **Backward compatible** — All existing API contracts must not break; new fields have defaults; new endpoints are additive
- **PostgreSQL only** — All SQL must work on PostgreSQL (Neon + standard pg)
- **Company isolation** — Every new endpoint must check `hasCompanyAccess()`
- **Auth middleware** — Every new protected endpoint must use `authMiddleware`
- **Drizzle ORM for new routes** — New route files (credit-notes, fiscal-years) must use Drizzle ORM via the `storage` layer, not raw SQL
- **Raw SQL for modified worktree routes** — `bill-pay.routes.ts` and `fixed-assets.routes.ts` already use `pool.query()`; additions must use the same `pool` pattern for consistency within those files
- **`db` is typed as `any`** — Transaction callbacks use `(tx: any)` pattern
- **Account resolution** — All new code that needs GL accounts must use `getAccountByCode()` with `ACCOUNT_CODES` constants; never use nameEn string matching
- **Monetary precision** — All new monetary fields must be `numeric(15,2)`, never `real` or `float`
- **Exchange rates** — Use `numeric(15,6)` for exchange rate fields (consistent with existing `exchangeRates` table)

## 8. Invariants

All invariants from v1 contract remain in force, plus:

- **Credit note reversal correctness**: A posted credit note's JE must mirror the invoice JE pattern with debits and credits swapped (Credit AR, Debit Revenue, Debit VAT)
- **Multi-currency base currency consistency**: All journal line debit/credit values are always in base currency (AED); original currency amounts are stored separately for reference
- **Fiscal year non-overlap**: No two fiscal years for the same company may have overlapping date ranges
- **Fiscal year immutability**: Once a fiscal year is closed, no new journal entries can be created with dates within that fiscal year's range
- **Bill GL completeness**: Every approved bill has a corresponding AP journal entry; every bill payment has a corresponding payment journal entry
- **Depreciation GL completeness**: Every non-zero depreciation amount has a corresponding journal entry
- **COGS tracking**: Every invoiced product item creates a COGS journal entry and an inventory movement
- **AI account resolution**: AI account suggestions must use account code as primary identifier; nameEn is fallback only

## 9. Edge Cases

- **Credit note for zero-VAT invoice** — Reversing JE has 2 lines (Credit AR, Debit Revenue), no VAT line
- **Credit note exceeds invoice balance** — Return 400 error; credit note total cannot exceed linked invoice's outstanding amount
- **Credit note without linked invoice** — Allowed (standalone credit for customer goodwill); JE still created
- **Foreign currency invoice with no exchange rate** — Return 400 with clear message; do not fall back to rate 1.0
- **Exchange rate for AED to AED** — Skip lookup; rate is always 1.0
- **Fiscal year close with no income/expense activity** — Create a zero-amount closing entry (debit/credit Retained Earnings for 0); still mark year as closed
- **Fiscal year close when already closed** — Return 400: "Fiscal year is already closed"
- **Journal entry date exactly on fiscal year boundary** — Use inclusive range: startDate <= entryDate <= endDate
- **Bill with no line items** — Treat as a single-line bill; debit a default expense account
- **Bill payment exceeding remaining balance** — Return 400 error
- **Bill payment when bill has no AP journal entry** — Return 400: "Bill must be approved before payment"
- **Depreciation run for fully depreciated asset** — Skip asset, include in response with `skipped: true`
- **Depreciation run for month already processed** — Idempotency: check if depreciation JE already exists for that asset+month; skip if so
- **COGS for service-only invoice (no products)** — No COGS entry generated; only service revenue JE
- **COGS when product has zero costPrice** — Skip COGS entry for that line item (zero cost means no inventory impact)
- **AI returns unrecognizable account code** — Fall back to nameEn match; if both fail, return no suggestion (not an error)
- **Closed fiscal year guard on credit note posting** — Must also check fiscal year before posting

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Adding columns to journalEntries/journalLines breaks existing queries | MEDIUM | HIGH | New columns are nullable with defaults; existing code unaffected |
| Bill-pay routes use pool.query; adding transactions requires careful SQL | MEDIUM | MEDIUM | Use pool-based BEGIN/COMMIT/ROLLBACK; test thoroughly |
| Fiscal year close on large dataset is slow | LOW | MEDIUM | Close is a one-time operation; acceptable to be slower |
| AI prompt changes cause regressions in categorization quality | MEDIUM | LOW | Add code as structured data; keep nameEn in prompt for AI context |
| COGS JE on invoice creation adds latency | LOW | LOW | Single extra insert per product line; negligible overhead |
| Exchange rate lookup returns stale rate | MEDIUM | MEDIUM | Use most-recent-on-or-before-date logic; warn if rate is >30 days old |
| Migration ordering conflicts with future work | LOW | MEDIUM | Use sequential numbering 0015-0018; verify no gaps |

## 11. Acceptance Criteria

### Gap 1 — Credit Notes
- **AC-1.1**: `creditNotes` and `creditNoteLines` tables exist in `shared/schema.ts` with all specified fields.
- **AC-1.2**: `POST /api/companies/:companyId/credit-notes` creates a credit note with lines.
- **AC-1.3**: `POST .../credit-notes/:id/post` creates a reversing JE: Credit AR, Debit Revenue, Debit VAT (or 2-line if zero VAT). JE uses `getAccountByCode()`.
- **AC-1.4**: `POST .../credit-notes/:id/apply` reduces the linked invoice's outstanding balance. Returns 400 if amount exceeds either credit note remaining or invoice outstanding.
- **AC-1.5**: Credit note creation + JE is wrapped in `db.transaction()`.
- **AC-1.6**: Route registered in `server/routes.ts`.

### Gap 2 — Multi-Currency in Transactions
- **AC-2.1**: `journalEntries` has `currency` and `exchangeRate` fields. `journalLines` has `originalAmount` and `originalCurrency`.
- **AC-2.2**: Invoice creation in non-AED currency auto-converts to AED using exchange rate lookup. JE amounts are in AED. Original amounts stored on journal lines.
- **AC-2.3**: Receipt posting in non-AED currency auto-converts to AED.
- **AC-2.4**: `getExchangeRate()` exists in storage layer and returns most recent rate on or before date.
- **AC-2.5**: Foreign currency invoice without exchange rate returns 400 (not a silent fallback).

### Gap 3 — Fiscal Year Management
- **AC-3.1**: `fiscalYears` table exists in `shared/schema.ts` with all specified fields.
- **AC-3.2**: Year-end close endpoint creates closing JE that zeros out all income/expense accounts into Retained Earnings (code 3020).
- **AC-3.3**: After close: fiscal year status = "closed", closingEntryId populated.
- **AC-3.4**: Attempting to create a JE with a date in a closed fiscal year returns 400 error.
- **AC-3.5**: Closed year guard applies to: manual JE creation, invoice creation, receipt posting, credit note posting, bill approval, depreciation run.
- **AC-3.6**: Route registered in `server/routes.ts`.

### Gap 4 — Bills to GL Integration
- **AC-4.1**: Approving a vendor bill creates an AP journal entry: Debit Expense/VAT Input, Credit AP.
- **AC-4.2**: Recording a bill payment creates a payment JE: Debit AP, Credit Bank.
- **AC-4.3**: Both operations are wrapped in transactions.
- **AC-4.4**: All account lookups use `ACCOUNT_CODES` constants.

### Gap 5 — Inventory COGS
- **AC-5.1**: `companies` table has `costMethod` field (default "weighted_average").
- **AC-5.2**: Creating an invoice with product items generates a COGS JE: Debit COGS, Credit Inventory.
- **AC-5.3**: COGS account (5130) exists in `defaultChartOfAccounts.ts` and `ACCOUNT_CODES`.
- **AC-5.4**: Inventory movement of type "sale" is created with correct quantity and cost.
- **AC-5.5**: Service-only invoices do not generate COGS entries.

### Gap 6 — Fixed Asset Depreciation to GL
- **AC-6.1**: Running depreciation creates a JE per asset: Debit Depreciation Expense (5100), Credit Accumulated Depreciation (1240).
- **AC-6.2**: `DEPRECIATION_EXPENSE` and `ACCUMULATED_DEPRECIATION` exist in `ACCOUNT_CODES`.
- **AC-6.3**: The entire depreciation batch is wrapped in a transaction (all succeed or all rollback).
- **AC-6.4**: Fully depreciated assets are skipped (no JE created, reported as skipped).

### Gap 7 — AI Routes Account Resolution
- **AC-7.1**: AI expense categorization prompt includes account codes in format `"code: nameEn"`.
- **AC-7.2**: AI receipt suggestion prompt includes account codes; response parsed for code first, nameEn as fallback.
- **AC-7.3**: AI transaction classification prompt includes account codes.
- **AC-7.4**: No `nameEn ===` or `nameEn.toLowerCase() ===` as the primary match in any AI response parsing. Code match is primary; nameEn is fallback.

### Build Integrity
- **AC-8.1**: `npx tsc --noEmit` produces zero errors.
- **AC-8.2**: `npm run build` succeeds.

## 12. Observability Requirements

- All new JE creation failures must log with `console.error` including operation name, companyId, source, and error details
- Closed fiscal year guard rejections must log at `warn` level with companyId, entry date, and fiscal year name
- Exchange rate lookup misses must log at `warn` level with companyId, currency, and date
- Bill approval/payment GL posting must log success at `info` level with companyId, billId, and JE entryNumber
- Depreciation GL posting must log per-asset at `info` level
- AI account code parsing failures (fallback to nameEn) must log at `warn` level

## 13. Dependency Order

The 7 gaps have the following implementation dependencies:

1. **Gap 7 (AI routes)** — Independent. Can be done first or in parallel.
2. **Gap 3 (Fiscal Years)** — Must be done before or alongside gaps that create JEs, since the closed-year guard must be added to all JE-creating routes.
3. **Gap 2 (Multi-Currency)** — Must be done before Gap 1 (credit notes need multi-currency support) and before Gap 4/5 (bills and COGS could also be multi-currency, but initial scope is AED-only for those).
4. **Gap 4 (Bills to GL)** — Independent of most gaps, but must include fiscal year guard from Gap 3.
5. **Gap 6 (Depreciation to GL)** — Independent of most gaps, but must include fiscal year guard from Gap 3.
6. **Gap 5 (Inventory COGS)** — Depends on invoice route modification; coordinate with Gap 2 changes to invoices.routes.ts.
7. **Gap 1 (Credit Notes)** — Depends on Gap 2 (multi-currency) and Gap 3 (fiscal year guard).

Recommended implementation order: G7 -> G3 -> G2 -> G4 + G6 (parallel) -> G5 -> G1

## 14. Open Questions

None — all requirements are fully specified based on the codebase audit and gap analysis.

## 15. Codebase Context Snapshot

### Files to Create
| File | Purpose |
|------|---------|
| `server/routes/credit-notes.routes.ts` | Credit note CRUD + post + apply endpoints |
| `server/routes/fiscal-years.routes.ts` | Fiscal year CRUD + year-end close endpoint |
| `migrations/0015_add_credit_notes.sql` | creditNotes + creditNoteLines tables |
| `migrations/0016_add_multi_currency_fields.sql` | currency/exchangeRate on JE, originalAmount on JL |
| `migrations/0017_add_fiscal_years.sql` | fiscalYears table |
| `migrations/0018_add_cost_method.sql` | costMethod on companies, totalCost on inventoryMovements |

### Files to Modify
| File | Changes |
|------|---------|
| `shared/schema.ts` | Add 3 new tables, modify 4 existing tables |
| `server/lib/account-codes.ts` | Add 7 new constants (RETAINED_EARNINGS, ACCOUNTS_PAYABLE, INVENTORY, COGS, DEPRECIATION_EXPENSE, ACCUMULATED_DEPRECIATION — some already exist, verify and add missing) |
| `server/defaultChartOfAccounts.ts` | Add COGS account entry (code 5130) |
| `server/storage.ts` | Add `getExchangeRate()` method |
| `server/routes.ts` | Register 2 new routes (credit-notes, fiscal-years) |
| `server/routes/invoices.routes.ts` | Multi-currency conversion, COGS JE on product invoices |
| `server/routes/receipts.routes.ts` | Multi-currency conversion |
| `server/routes/bill-pay.routes.ts` | AP JE on approval, payment JE on payment |
| `server/routes/fixed-assets.routes.ts` | Depreciation JE posting, transaction wrapping |
| `server/routes/journal.routes.ts` | Closed fiscal year guard |
| `server/routes/ai.routes.ts` | Code-based account resolution in 3 endpoints |

### Existing Patterns to Follow
- New Drizzle routes: Express Router + `asyncHandler` + `authMiddleware` + `storage.hasCompanyAccess()` + `db.transaction()`
- New pool.query routes: Same middleware pattern but use `pool.query('BEGIN')` / `COMMIT` / `ROLLBACK` for transactions
- Account resolution: `getAccountByCode(companyId, ACCOUNT_CODES.XXX)` — never nameEn
- Journal entry creation: `storage.createJournalEntry()` + `storage.createJournalLine()` (or raw SQL equivalent in pool-based routes)
- Schema: `pgTable()` + `createInsertSchema()` + type exports

### Account Codes Reference (Current + New)
| Constant | Code | Account Name | Status |
|----------|------|-------------|--------|
| `CASH` | 1010 | Cash on Hand | Exists |
| `BANK_ACCOUNTS` | 1020 | Bank Accounts | Exists |
| `ACCOUNTS_RECEIVABLE` | 1040 | Accounts Receivable | Exists |
| `VAT_RECEIVABLE_INPUT` | 1050 | VAT Receivable (Input VAT) | Exists |
| `INVENTORY` | 1070 | Inventory | **New** |
| `ACCUMULATED_DEPRECIATION` | 1240 | Accumulated Depreciation | **New** |
| `ACCOUNTS_PAYABLE` | 2010 | Accounts Payable | **New** |
| `VAT_PAYABLE_OUTPUT` | 2020 | VAT Payable (Output VAT) | Exists |
| `RETAINED_EARNINGS` | 3020 | Retained Earnings | **New** |
| `PRODUCT_SALES` | 4010 | Product Sales | Exists |
| `SERVICE_REVENUE` | 4020 | Service Revenue | Exists |
| `DEPRECIATION_EXPENSE` | 5100 | Depreciation Expense | **New** |
| `COGS` | 5130 | Cost of Goods Sold | **New** (also add to defaultChartOfAccounts) |

## 16. Contract Version

**v2.0** — 2026-03-21
Supersedes: v1.0 (2026-03-20) — v1 items are assumed complete; this contract covers remaining gaps only.

## 17. Readiness Decision

# READY FOR DESIGN
