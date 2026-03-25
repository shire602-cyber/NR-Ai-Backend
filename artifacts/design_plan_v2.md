# Design Plan v2 — 7 Gap Fixes

## Overview

This plan covers the simplest design for all 7 gaps that fits existing codebase patterns. Each decision is grounded in what already exists: Drizzle ORM for new routes, raw `pool.query()` for modified bill-pay/fixed-asset routes, `getAccountByCode()` + `ACCOUNT_CODES` for all GL account resolution, and `db.transaction()` / `pool.query('BEGIN')` for atomicity.

---

## Gap 1 — Credit Notes

### Schema Design

Two new tables in `shared/schema.ts`, placed after the invoice/invoiceLine tables (they follow the same pattern):

**`creditNotes`** — mirrors the `invoices` table structure:
- Standard fields: `id` (uuid PK), `companyId` (FK companies), `number` (text, auto-gen `CN-YYYYMMDD-NNN`), `date` (timestamp), `currency` (text, default "AED"), `subtotal`/`vatAmount`/`total` (numeric(15,2)), `status` (text, default "draft"), `createdBy` (FK users), `createdAt`
- Credit-note-specific: `customerId` (FK customerContacts, nullable), `customerName` (text), `customerTrn` (text, nullable), `linkedInvoiceId` (FK invoices, nullable), `reason` (text), `journalEntryId` (FK journalEntries, nullable)

**`creditNoteLines`** — mirrors `invoiceLines`:
- `id` (uuid PK), `creditNoteId` (FK creditNotes, cascade), `description`, `quantity` (real), `unitPrice` (numeric(15,2)), `vatRate` (real, default 0.05), `vatSupplyType` (text, default "standard_rated")

Both get `createInsertSchema` and type exports. This mirrors exactly what invoices/invoiceLines do.

### Linking to Invoices

- `linkedInvoiceId` is nullable — standalone credit notes are allowed (customer goodwill)
- The `/apply` endpoint takes `{ invoiceId, amount }` and validates:
  - Credit note is posted
  - Invoice belongs to same company
  - Amount does not exceed credit note remaining balance or invoice outstanding balance
- Application is tracked by creating a simple `creditNoteApplications` record (creditNoteId, invoiceId, amount, appliedAt) — BUT the contract does not specify a separate table for this. Simplest approach: store applications as a JSON field or just reduce the invoice total/status directly. Given the contract says "stores the application linkage for audit trail," the cleanest minimal approach is a lightweight join record. However, to avoid scope creep, we reduce the invoice outstanding balance inline and log the application on the credit note itself. We add a `appliedAmount` (numeric(15,2), default "0") field to `creditNotes` and an `appliedCreditNoteId` tracking field is unnecessary — the contract says "Partial credit note application" is out of scope. The apply endpoint simply:
  1. Validates amounts
  2. Updates creditNote `appliedAmount += amount`
  3. Reduces the invoice's total or records a payment-like adjustment

**Decision: Simplest approach** — Add `appliedAmount` (numeric(15,2), default "0") and `appliedToInvoiceId` (uuid, nullable) to `creditNotes`. The apply endpoint sets these fields and creates a receipt/payment-style adjustment to the invoice. No separate join table needed since the contract explicitly says "no split across multiple invoices in a single call."

### Reversing JE Logic

When posting a credit note, create a JE that is the exact inverse of an invoice JE:
- **Credit** Accounts Receivable (1040) for `total`
- **Debit** Product Sales (4010) for `subtotal`
- **Debit** VAT Payable Output (2020) for `vatAmount` (skip if zero)

This is the invoice JE with debits/credits swapped. Source: `"credit_note"`, sourceId: credit note ID. JE status is posted immediately.

The route file (`credit-notes.routes.ts`) follows the Drizzle ORM pattern from `invoices.routes.ts`:
- Import `db`, `storage`, `ACCOUNT_CODES`, schema tables
- Use `(db as any).transaction(async (tx: any) => { ... })`
- Use `storage.generateEntryNumber()` for JE number
- Use `storage.getAccountByCode()` for account resolution

### Multi-currency integration

Credit notes inherit the same multi-currency pattern as invoices (Gap 2). If `currency !== "AED"`, look up exchange rate, convert amounts to AED for JE, store originals on journal lines.

---

## Gap 2 — Multi-Currency in Transactions

### Where to Add Fields

**`journalEntries` table** — add two columns after `updatedAt`:
- `currency` (text, default "AED")
- `exchangeRate` (numeric(15,6), default "1")

**`journalLines` table** — add two columns after `description`:
- `originalAmount` (numeric(15,2), nullable) — amount in original currency
- `originalCurrency` (text, nullable)

### Conversion Approach: Convert at Transaction Time

**Decision: Convert at transaction time, not at reporting time.**

Rationale:
1. All existing reports and balance queries operate on journal line debit/credit fields. Converting at reporting time would require modifying every report query.
2. The GL always stays in base currency (AED). Original currency amounts are stored separately as reference data.
3. This matches standard accounting practice — book the transaction at the spot rate on the transaction date.
4. Out of scope: unrealized FX gains/losses and period-end revaluation.

### Conversion Flow (same pattern in invoices, receipts, credit notes)

```
if (currency !== "AED") {
  const rate = await storage.getExchangeRate(companyId, currency, date);
  if (!rate) return res.status(400).json({ message: `Exchange rate not found for ${currency} on ${date}` });
  // JE amounts = originalAmount * exchangeRate (converted to AED)
  // Store originalAmount + originalCurrency on each journal line
}
// If currency === "AED", rate is 1.0, skip lookup
```

### Exchange Rate Lookup Helper

Add to `IStorage` interface and `DatabaseStorage`:
```typescript
getExchangeRate(companyId: string, currency: string, date: Date): Promise<{ rate: string; effectiveDate: string } | null>
```

Implementation: query `exchangeRates` table for matching companyId + targetCurrency, where `effectiveDate <= date`, ordered by `effectiveDate DESC`, limit 1. Returns the most recent rate on or before the given date.

### Files Modified

- `shared/schema.ts` — add 4 fields to 2 tables
- `server/storage.ts` — add `getExchangeRate()` to interface + implementation
- `server/routes/invoices.routes.ts` — add currency conversion before JE creation (lines ~148-220)
- `server/routes/receipts.routes.ts` — add currency conversion before JE creation (lines ~211-259)
- Credit notes route (new file) — built with multi-currency from the start

---

## Gap 3 — Fiscal Years

### Schema

**`fiscalYears`** table in `shared/schema.ts`:
- `id` (uuid PK), `companyId` (FK companies, cascade), `name` (text), `startDate` (date), `endDate` (date), `status` (text, default "open"), `closedBy` (FK users, nullable), `closedAt` (timestamp, nullable), `closingEntryId` (FK journalEntries, nullable), `createdAt` (timestamp, defaultNow)

Uses `date` type (not `timestamp`) for startDate/endDate since fiscal years are date-based, not time-based. This matches the existing `exchangeRates.effectiveDate` pattern.

### Year-End Close Logic

The close endpoint in `fiscal-years.routes.ts` (Drizzle ORM pattern):

Inside `db.transaction()`:
1. Query all income accounts for the company — sum their posted journal line (credits - debits) for entries within the fiscal year date range = net income per account
2. Query all expense accounts — sum their posted journal line (debits - credits) for entries within the fiscal year date range = net expense per account
3. Net income = total income account balances - total expense account balances
4. Create closing JE:
   - For each income account with a non-zero balance: **Debit** that account for its net balance (zeros it out)
   - For each expense account with a non-zero balance: **Credit** that account for its net balance (zeros it out)
   - **Credit** Retained Earnings (3020) for net income (or **Debit** if net loss)
5. Post the JE immediately
6. Mark fiscal year closed

**Key query pattern**: Use Drizzle's `sql` template to join `journalLines` with `journalEntries` (for date filter + status = 'posted') and `accounts` (for type filter), grouped by accountId. This is a single query per account type (income, expense).

### Closed Year Protection (Guard)

A shared helper function:
```typescript
// server/lib/fiscal-year-guard.ts
export async function checkFiscalYearOpen(companyId: string, entryDate: Date): Promise<{ closed: boolean; fiscalYear?: { name: string; startDate: string; endDate: string } }>
```

This queries `fiscalYears` for the company where `status = 'closed'` and `startDate <= entryDate <= endDate`. If found, returns the fiscal year info for the error message.

**Where to add the guard** (called before any JE creation):
- `journal.routes.ts` — line ~88, before `db.transaction()`
- `invoices.routes.ts` — line ~158, before `db.transaction()`
- `receipts.routes.ts` — line ~212, before `db.transaction()`
- `credit-notes.routes.ts` — in the post endpoint, before JE creation
- `bill-pay.routes.ts` — in approve and payment endpoints, before JE creation
- `fixed-assets.routes.ts` — in run-depreciation, before the loop

For pool-based routes (bill-pay, fixed-assets), the guard uses a direct SQL query via pool since those files don't use Drizzle.

### Account Code Addition

Add `RETAINED_EARNINGS: "3020"` to `ACCOUNT_CODES`. The account already exists in `defaultChartOfAccounts.ts` (line 256).

---

## Gap 4 — Bills to GL

### Where to Add JE Creation in bill-pay.routes.ts

**Approve endpoint (line 355-389)**: Currently just updates status to 'approved'. Needs to also create AP journal entry.

The modification wraps the existing approve logic in a `pool.query('BEGIN')` / `COMMIT` / `ROLLBACK` transaction:

```
BEGIN
  -- Fiscal year guard (SQL query)
  -- Resolve accounts via storage.getAccountByCode()
  -- Get bill line items for expense account mapping
  -- Generate entry number via storage.generateEntryNumber()
  -- INSERT INTO journal_entries (source='vendor_bill', sourceId=bill.id)
  -- INSERT INTO journal_lines: Debit expense accounts (per line item)
  -- INSERT INTO journal_lines: Debit VAT Receivable Input (1050) for total VAT
  -- INSERT INTO journal_lines: Credit Accounts Payable (2010) for total
  -- UPDATE vendor_bills SET status='approved', journal_entry_id=...
COMMIT
```

**Key detail**: Bill line items have `account_id` field. For lines with an `account_id`, use that account. For lines without, use a default expense account. The `getAccountByCode()` is used for system accounts (AP, VAT Input); line-item expense accounts use the `account_id` from the line directly.

**Payment endpoint (line 392-473)**: Currently just records payment and updates amounts. Needs to also create payment JE.

```
BEGIN
  -- Fiscal year guard
  -- Resolve accounts: AP (2010), Bank (1020)
  -- Generate entry number
  -- INSERT INTO journal_entries (source='bill_payment', sourceId=payment.id)
  -- INSERT INTO journal_lines: Debit AP (2010) for payment amount
  -- INSERT INTO journal_lines: Credit Bank (1020) for payment amount
  -- INSERT INTO bill_payments (existing logic)
  -- UPDATE vendor_bills (existing logic)
COMMIT
```

**Pattern note**: These routes use `pool.query()`. Transactions use `pool.query('BEGIN')` then `pool.query('INSERT...')` then `pool.query('COMMIT')` with try/catch `pool.query('ROLLBACK')`. Account resolution still uses `storage.getAccountByCode()` (which uses Drizzle internally) — this works because it is a read-only query that does not participate in the pool transaction. The JE and journal line inserts use raw SQL via pool to stay consistent with the file's pattern.

### Account Codes

`ACCOUNTS_PAYABLE: "2010"` already exists in `ACCOUNT_CODES`. `VAT_RECEIVABLE_INPUT: "1050"` and `BANK_ACCOUNTS: "1020"` also already exist. No additions needed for this gap.

---

## Gap 5 — Inventory COGS

### Cost Calculation

**Decision: Use `product.costPrice` directly (weighted average is tracked at the product level, not per-movement FIFO layers).**

The contract says to add `costMethod` to companies but the actual COGS calculation for v2 is simple: `COGS = quantity * product.costPrice`. FIFO layer tracking is explicitly out of scope. The `costMethod` field is added for future use but the current implementation always uses the product's `costPrice`.

### When to Create COGS JE

In `invoices.routes.ts`, inside the existing `db.transaction()` block, after the revenue recognition JE is created (line ~223):

```
for each invoice line:
  if line has a productId AND product.costPrice > 0:
    1. Look up product from DB
    2. cogsAmount = quantity * product.costPrice
    3. Create inventory movement (type: "sale", quantity: -quantity, unitCost: costPrice)
    4. Update product.currentStock -= quantity
    5. Create COGS JE:
       - Debit COGS (5130) for cogsAmount
       - Credit Inventory (1070) for cogsAmount
       - Source: "cogs", sourceId: invoice.id
```

**Key design question**: Should COGS be a separate JE or additional lines on the invoice JE?

**Decision: Separate JE.** Rationale:
1. The invoice JE has source `"invoice"` — mixing in COGS lines would confuse the source semantics
2. A separate JE with source `"cogs"` makes it easy to find/audit COGS entries
3. Matches the contract specification which says "Create COGS journal entry" (singular, separate)

### Invoice Line productId

The current `invoiceLines` table does not have a `productId` field. The invoice creation body may include a `productId` on line items. We need to check how invoice lines reference products.

Looking at the schema: `invoiceLines` has `description`, `quantity`, `unitPrice`, `vatRate`, `vatSupplyType` — no `productId`. The contract says "For each invoice line that references a product (need to add productId check)."

**Decision**: We do NOT add `productId` to the `invoiceLines` schema (that would require a migration and could break existing data). Instead, the invoice creation endpoint already receives line items from the request body. If a line item in the request body has a `productId` field, we use it to look up the product and create the COGS entry. The `productId` is passed through the API but not stored on the invoice line table. This is the simplest approach that avoids schema changes to an existing, populated table.

### Schema Changes

- `companies` table: add `costMethod` (text, default "weighted_average")
- `inventoryMovements` table: add `totalCost` (numeric(15,2), nullable)

### Account Code Additions

- `INVENTORY: "1070"` — account exists in defaultChartOfAccounts (line 86)
- `COGS: "5130"` — must be added to both `ACCOUNT_CODES` and `defaultChartOfAccounts.ts`

### Default Chart of Accounts Addition

Add between the existing 5120 (General and Admin Expenses) entry:
```
{ code: "5130", nameEn: "Cost of Goods Sold", nameAr: "تكلفة البضاعة المباعة", description: "Cost of inventory sold", type: "expense", subType: null, isVatAccount: false, vatType: null, isSystemAccount: true }
```

---

## Gap 6 — Depreciation to GL

### Where in fixed-assets.routes.ts to Add JE Creation

The `run-depreciation` endpoint (line 231-308) loops over active assets and updates their accumulated depreciation. Currently no transaction wrapping and no JE creation.

**Design**: Wrap the entire batch loop in `pool.query('BEGIN')` / `COMMIT` / `ROLLBACK`. For each non-skipped asset:

```
// Before the loop:
pool.query('BEGIN')
// Fiscal year guard for the depreciation date
// Resolve accounts once: Depreciation Expense (5100), Accumulated Depreciation (1240)

for each asset:
  // existing depreciation calculation (unchanged)
  if monthlyDepreciation <= 0: skip (existing logic)

  // Idempotency check: query for existing JE with source='depreciation', sourceId=asset.id
  // and memo containing the month/year. If found, skip.

  // UPDATE fixed_assets (existing logic, now inside transaction)

  // Generate entry number
  entryNumber = await storage.generateEntryNumber(companyId, depreciationDate, null)
  // Note: generateEntryNumber uses Drizzle tx param; for pool-based routes, pass null
  // and use a raw SQL alternative

  // INSERT INTO journal_entries
  // INSERT INTO journal_lines: Debit Depreciation Expense (5100)
  // INSERT INTO journal_lines: Credit Accumulated Depreciation (1240)

pool.query('COMMIT')
```

**Entry number generation challenge**: `storage.generateEntryNumber()` uses a Drizzle transaction parameter. In pool-based routes, we cannot pass the pool transaction context.

**Decision**: For pool-based routes that need entry numbers, we generate the entry number via a raw SQL query that mirrors what `generateEntryNumber()` does: select max entry number for that date prefix, increment. This stays consistent with the file's pool.query() pattern. Alternatively, call `storage.generateEntryNumber(companyId, date)` without a tx param — looking at the implementation, the tx param is optional and falls back to the default `db` connection. Since the pool transaction and Drizzle `db` share the same underlying connection pool, this is safe for entry number generation (the FOR UPDATE lock in generateEntryNumber handles concurrency). **We use the simpler approach: call `storage.generateEntryNumber(companyId, date)` without tx.**

### Account Code Additions

- `DEPRECIATION_EXPENSE: "5100"` — account exists in defaultChartOfAccounts (line 462)
- `ACCUMULATED_DEPRECIATION: "1240"` — account exists in defaultChartOfAccounts (line 134)

---

## Gap 7 — AI nameEn Fix

### Minimal Changes to ai.routes.ts

Three locations need fixing. All follow the same pattern: include account codes in the prompt, parse response for code first, fall back to nameEn.

**Location 1 — Expense Categorization (line ~67-68)**

Current:
```typescript
const accountList = expenseAccounts.map(acc =>
  `${acc.nameEn}${acc.nameAr ? ` (${acc.nameAr})` : ''}`
).join('\n');
```

Change to:
```typescript
const accountList = expenseAccounts.map(acc =>
  `${acc.code}: ${acc.nameEn}${acc.nameAr ? ` (${acc.nameAr})` : ''}`
).join('\n');
```

The AI prompt already asks for `accountCode` in the response (line 83-84). The parsing at line 101-104 already extracts `aiResponse.accountCode`. But there is no validation that the returned code matches a real account. Add after line 101:

```typescript
// Resolve by code first, nameEn as fallback
const matchedAccount = expenseAccounts.find(a => a.code === aiResponse.accountCode)
  || expenseAccounts.find(a => a.nameEn.toLowerCase() === aiResponse.accountName?.toLowerCase());
```

**Location 2 — Transaction Classification (line ~287-288)**

Current:
```typescript
const accountList = allAccounts.map(acc =>
  `${acc.nameEn} (${acc.type})${acc.nameAr ? ` - ${acc.nameAr}` : ''}`
).join('\n');
```

Change to:
```typescript
const accountList = allAccounts.map(acc =>
  `${acc.code}: ${acc.nameEn} (${acc.type})${acc.nameAr ? ` - ${acc.nameAr}` : ''}`
).join('\n');
```

Update the AI prompt to ask for account code in the response. Parse response for code first, nameEn as fallback.

**Location 3 — Receipt Account Suggestion (line ~1677-1692)**

Current prompt:
```
${expenseAccounts.map(a => `- ${a.nameEn}`).join('\n')}
Respond with just the account name, nothing else.
```

Change to:
```
${expenseAccounts.map(a => `- ${a.code}: ${a.nameEn}`).join('\n')}
Respond with just the account code, nothing else.
```

Current matching (line 1690-1692):
```typescript
const matchedAccount = expenseAccounts.find(a =>
  a.nameEn.toLowerCase() === suggestedName?.toLowerCase()
);
```

Change to:
```typescript
const suggestedCode = response.choices[0]?.message?.content?.trim();
const matchedAccount = expenseAccounts.find(a => a.code === suggestedCode)
  || expenseAccounts.find(a => a.nameEn.toLowerCase() === suggestedCode?.toLowerCase());
```

Log at warn level when code match fails and nameEn fallback is used.

---

## Summary of New Account Codes

| Constant | Code | Already in ACCOUNT_CODES? | Already in defaultChartOfAccounts? |
|----------|------|--------------------------|-----------------------------------|
| INVENTORY | 1070 | No — add | Yes (line 86) |
| ACCUMULATED_DEPRECIATION | 1240 | No — add | Yes (line 134) |
| RETAINED_EARNINGS | 3020 | No — add | Yes (line 256) |
| DEPRECIATION_EXPENSE | 5100 | No — add | Yes (line 462) |
| COGS | 5130 | No — add | No — add |

Total additions to `ACCOUNT_CODES`: 5 new constants.
Total additions to `defaultChartOfAccounts.ts`: 1 new entry (COGS 5130).

(ACCOUNTS_PAYABLE 2010, VAT_RECEIVABLE_INPUT 1050, BANK_ACCOUNTS 1020 already exist in ACCOUNT_CODES.)

---

## Migration Files

| File | Content |
|------|---------|
| `0015_add_credit_notes.sql` | CREATE TABLE credit_notes, credit_note_lines |
| `0016_add_multi_currency_fields.sql` | ALTER TABLE journal_entries ADD currency, exchange_rate; ALTER TABLE journal_lines ADD original_amount, original_currency |
| `0017_add_fiscal_years.sql` | CREATE TABLE fiscal_years |
| `0018_add_cost_method.sql` | ALTER TABLE companies ADD cost_method; ALTER TABLE inventory_movements ADD total_cost |

---

## Implementation Order

```
G7 (AI fix)          — independent, minimal risk, 3 small edits
    |
G3 (Fiscal Years)    — schema + routes + guard helper (needed by all JE-creating gaps)
    |
G2 (Multi-Currency)  — schema + storage helper + invoice/receipt modifications
    |
    +--- G4 (Bills to GL)       — pool-based, adds JE to approve + payment
    +--- G6 (Depreciation GL)   — pool-based, adds JE to run-depreciation
    |
G5 (Inventory COGS)  — modifies invoices.routes.ts (coordinate with G2 changes)
    |
G1 (Credit Notes)    — new route file, depends on G2 (multi-currency) + G3 (fiscal year guard)
```

---

## File Change Summary

### New Files (4)
- `server/routes/credit-notes.routes.ts` — Drizzle ORM pattern
- `server/routes/fiscal-years.routes.ts` — Drizzle ORM pattern
- `server/lib/fiscal-year-guard.ts` — shared helper for closed year check
- `migrations/0015_add_credit_notes.sql`, `0016_add_multi_currency_fields.sql`, `0017_add_fiscal_years.sql`, `0018_add_cost_method.sql`

### Modified Files (11)
- `shared/schema.ts` — 3 new tables (creditNotes, creditNoteLines, fiscalYears), 4 table modifications (journalEntries +2 cols, journalLines +2 cols, companies +1 col, inventoryMovements +1 col)
- `server/lib/account-codes.ts` — 5 new constants
- `server/defaultChartOfAccounts.ts` — 1 new entry (COGS 5130)
- `server/storage.ts` — add `getExchangeRate()` to interface + implementation
- `server/routes.ts` — 2 new route registrations
- `server/routes/invoices.routes.ts` — multi-currency conversion + COGS JE
- `server/routes/receipts.routes.ts` — multi-currency conversion
- `server/routes/bill-pay.routes.ts` — AP JE on approve, payment JE on payment
- `server/routes/fixed-assets.routes.ts` — depreciation JE + batch transaction
- `server/routes/journal.routes.ts` — closed fiscal year guard
- `server/routes/ai.routes.ts` — code-based account resolution (3 locations)

---

## Key Design Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Convert currency at transaction time | All reports read JE debit/credit in AED; no report changes needed |
| 2 | Separate COGS JE per invoice (not extra lines on invoice JE) | Clean source tracking; matches contract spec |
| 3 | No productId column added to invoiceLines | Avoid migration on populated table; use request body productId |
| 4 | Credit note apply via fields on creditNotes (no join table) | Contract says no split across multiple invoices; simplest approach |
| 5 | Fiscal year guard as shared helper function | Called from 6+ locations; DRY |
| 6 | Pool-based routes use pool.query('BEGIN/COMMIT/ROLLBACK') | Consistent with existing bill-pay/fixed-assets patterns |
| 7 | generateEntryNumber() called without tx in pool routes | Optional param; falls back to default db; FOR UPDATE lock handles concurrency |
| 8 | AI fix: code as primary, nameEn as fallback | Graceful degradation if AI returns name instead of code |

---

## Readiness Decision

# READY FOR CHANGE PLAN
