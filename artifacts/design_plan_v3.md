# Design Plan v3 — Comprehensive Audit Fix

## 1. Design Summary

Fix all 28 audit issues using the simplest possible approach for each: SQL migration for schema issues, inline guard checks for safety/access controls, and copy-paste of existing JE creation patterns for missing journal entries. No new abstractions, no new dependencies, no architectural changes. Each fix follows the exact pattern already used elsewhere in the codebase.

## 2. Affected Components

| Group | Files Modified | Files Created |
|-------|---------------|---------------|
| A: Schema | shared/schema.ts | migrations/0022_real_to_numeric.sql |
| B: Routes | server/routes.ts | — |
| C: JE Creation | payroll.routes.ts, fixed-assets.routes.ts, receipts.routes.ts, expense-claims.routes.ts | — |
| D: Safety Guards | bill-pay.routes.ts, invoices.routes.ts, fixed-assets.routes.ts, fiscal-years.routes.ts, journal.routes.ts, ai-gl.routes.ts | — |
| E: Access Control | dashboard.routes.ts, vat.routes.ts, corporate-tax.routes.ts, ai.routes.ts, receipts.routes.ts, portal.routes.ts | — |
| F: Constraints | shared/schema.ts | migrations/0023_constraints_indexes.sql |
| G: Frontend | not-found.tsx, Journal.tsx, Invoices.tsx, Dashboard.tsx, Receipts.tsx, ChartOfAccounts.tsx | — |
| Support | server/lib/account-codes.ts, server/defaultChartOfAccounts.ts | — |

## 3. Existing Pattern Alignment

Every fix uses an existing pattern already present in the codebase:

| Pattern | Existing Example | Reused For |
|---------|-----------------|------------|
| pool.connect() + BEGIN/COMMIT/ROLLBACK | bill-pay.routes.ts approval (line 385) | C5, C8, C11 |
| Drizzle tx.insert(journalEntries/Lines) | invoices.routes.ts (line 196-241) | C10 |
| `storage.getAccountByCode(companyId, ACCOUNT_CODES.X)` | invoices.routes.ts (line 173-178) | C5, C8, C10, C11 |
| `assertFiscalYearOpenPool(client, companyId, date)` | bill-pay.routes.ts (line 399) | C5, C8, C11 |
| `if (!hasAccess) return res.status(403)` | invoices.routes.ts GET (line 102) | H1-H7 |
| `authMiddleware, requireCustomer` on route | payroll.routes.ts (line 426) | H1, H5 |
| Hand-written SQL migration with IF EXISTS | migrations/0010-0021 pattern | C1, M1-M3 |

## 4. Alternative Approaches Considered

### Alt 1: Create a shared `createJournalEntry()` helper function
- Would deduplicate JE creation across payroll, disposal, expense-claims
- **Rejected**: Adds abstraction that doesn't exist in the codebase. Each module has slightly different JE shapes (different accounts, different line counts). Inline is clearer and matches existing patterns. Can refactor later if needed.

### Alt 2: Use Drizzle migrate() for schema changes
- Would use Drizzle's built-in migration system
- **Rejected**: Only migrations 0000-0001 are tracked by Drizzle journal. All later migrations (0002-0021) are hand-written SQL. Switching systems mid-stream creates confusion. Follow the existing hand-written SQL pattern.

### Alt 3: Add lineOrder column to journalLines schema for fiscal year close
- Would properly support line ordering in closing entries
- **Rejected**: Adding a column to the most critical accounting table for one use case (closing entries) is over-engineering. Instead, remove the `line_order` reference from fiscal-years.routes.ts — PostgreSQL preserves insertion order within a transaction, and the closing entry lines don't need explicit ordering.

### Alt 4: Soft-delete for all accounting records
- Would add `deletedAt` column and convert all deletes to soft-deletes
- **Rejected**: Too broad. The contract asks to prevent deletion of posted/paid records, not to implement soft-delete. A simple guard check (`if (entry.status === 'posted') return 400`) is sufficient and matches the existing pattern in journal.routes.ts DELETE.

## 5. Chosen Design

### Group A: Database Schema Integrity

**Migration 0022 — real to numeric conversion**

A single SQL migration file that ALTERs every monetary column. Structure:

```
-- For each table/column pair:
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'TABLE' AND column_name = 'COL' AND data_type = 'real') THEN
    ALTER TABLE TABLE ALTER COLUMN COL TYPE numeric(15,2) USING COL::numeric(15,2);
  END IF;
END $$;
```

This is idempotent — if the column is already numeric, the IF guard skips it. Covers all ~107 columns across ~22 tables. Uses precision (15,2) for money, (15,4) for rates/quantities, (15,6) for exchange rates — matching schema.ts definitions.

**C13: Schema table validation** — The codebase scan confirmed fiscalYears, creditNotes, creditNoteLines already exist in schema.ts. No action needed — just verify column names match migration DDL.

### Group B: Route Registration

**C2 + C3**: Add two import lines and two registration calls in server/routes.ts, following the exact pattern of the adjacent routes (e.g., exchangeRateRoutes). Place them in the "Core Accounting" section after the existing route registrations.

The scan confirmed these imports already exist at lines 58-59 and registrations at lines 83-84. **If they're already there, this is already fixed.** Verify at implementation time.

### Group C: Missing Journal Entries

**C5 — Payroll Approval JE**

In payroll.routes.ts approval endpoint (after line 448), add JE creation using the pool.query pattern (matching the existing `query()` helper in that file):

1. Resolve accounts: `getAccountByCode(companyId, ACCOUNT_CODES.SALARY_EXPENSE)`, `getAccountByCode(companyId, ACCOUNT_CODES.SALARIES_PAYABLE)`
2. If accounts not found → return 400 with descriptive error
3. Call `assertFiscalYearOpen(companyId, approvalDate)`
4. Generate entry number via `storage.generateEntryNumber(companyId, date)`
5. INSERT journal_entries with source='payroll', sourceId=runId
6. For each payroll item: Debit Salary Expense for netSalary (aggregate all items into one debit line for simplicity)
7. Credit Salaries Payable for totalNet
8. Wrap in BEGIN/COMMIT/ROLLBACK

New account codes to add to ACCOUNT_CODES:
- `SALARY_EXPENSE: "5020"` (matches defaultChartOfAccounts "Salaries & Wages")
- `SALARIES_PAYABLE: "2030"` (matches defaultChartOfAccounts "Salaries Payable")

Also add "2030" to defaultChartOfAccounts.ts if not already present.

**C8 — Asset Disposal JE**

In fixed-assets.routes.ts disposal endpoint (after line 505), add JE creation using pool.connect() + BEGIN/COMMIT/ROLLBACK:

1. Resolve accounts: Cash/Bank (1020), Accumulated Depreciation (1240), plus a disposal gain/loss account
2. For gain/loss account: Add two new codes to defaultChartOfAccounts.ts:
   - `4050: "Gain on Asset Disposal"` (type: income)
   - `5140: "Loss on Asset Disposal"` (type: expense)
   Add to ACCOUNT_CODES: `GAIN_ON_DISPOSAL: "4050"`, `LOSS_ON_DISPOSAL: "5140"`
3. If disposal proceeds > 0: Debit Cash (proceeds amount)
4. Debit Accumulated Depreciation (accumulated amount)
5. Credit Fixed Asset cost account — need to know which asset account. Use the asset's category to determine the code, or use a general "Fixed Assets" account (1210). Add `FIXED_ASSETS: "1210"` to ACCOUNT_CODES.
6. If gain: Credit Gain on Disposal. If loss: Debit Loss on Disposal.
7. JE lines: Debits = Cash + AccumDep + (Loss if applicable). Credits = AssetCost + (Gain if applicable).
8. Wrap entire disposal (UPDATE + JE) in transaction.

**C10 — Receipt VAT Split**

In receipts.routes.ts posting endpoint (line 225-259), modify the existing JE creation (which already uses Drizzle transaction):

Current: 2 lines (Debit Expense for total, Credit Payment for total)
New: 2 or 3 lines:
- Debit Expense for `receipt.amount` (net, excluding VAT)
- If `receipt.vatAmount > 0`: Debit VAT Receivable Input (1050) for `receipt.vatAmount`
- Credit Payment Account for total (`receipt.amount + receipt.vatAmount`)

The VAT_RECEIVABLE_INPUT code "1050" already exists in ACCOUNT_CODES. Resolve via `storage.getAccountByCode()`. If VAT account not found and vatAmount > 0, log warning but continue (matching the existing graceful pattern for optional VAT lines in invoices.routes.ts).

**C11 — Expense Claim Approval JE**

In expense-claims.routes.ts approval endpoint (after line 303), add JE creation using pool.connect() + BEGIN/COMMIT/ROLLBACK:

1. Fetch expense claim items for this claim
2. Resolve AP account (2010), VAT Input (1050)
3. For each line item with amount > 0: Debit the expense account. Need an account_id on expense_claim_items — if it doesn't exist, use a general "Office Expenses" account (5060 or similar). Check schema.
4. If any item has vatAmount > 0: Debit VAT Input (1050)
5. Credit AP (2010) for totalAmount
6. Wrap in transaction with fiscal year guard

### Group D: Accounting Safety Guards

**C4 — Bill Approval: Reject Missing account_id**

In bill-pay.routes.ts, before the line-item loop (before line 435), add:
```
const missingAccount = lines.filter(l => !l.account_id);
if (missingAccount.length > 0) {
  await client.query('ROLLBACK');
  return res.status(400).json({ error: 'All bill line items must have an account assigned before approval' });
}
```

**C6 — Invoice Delete/Update: Check Posted JE**

In invoices.routes.ts:
- DELETE endpoint (line 461): Before `storage.deleteInvoice()`, query for associated JE:
  ```
  const entries = await storage.getJournalEntriesByCompanyId(invoice.companyId);
  const postedJE = entries.find(e => e.sourceId === id && e.status === 'posted');
  if (postedJE) return res.status(400).json({ error: 'Cannot delete invoice with posted journal entry. Reverse the journal entry first.' });
  ```
  Also check if invoice status is 'paid': `if (invoice.status === 'paid') return 400`.

- UPDATE endpoint (line 396): Same check — if any associated JE is posted, reject update.

**C7 — Bill Payment: Fail if Accounts Missing**

In bill-pay.routes.ts payment endpoint (line 565-566), change from graceful degradation to hard failure:
```
if (!apAccount) {
  await client.query('ROLLBACK');
  return res.status(400).json({ error: 'Accounts Payable account (2010) not found. Please add it to your chart of accounts.' });
}
if (!bankAccount) {
  await client.query('ROLLBACK');
  return res.status(400).json({ error: 'Bank account (1020) not found. Please add it to your chart of accounts.' });
}
```

**C9 — Depreciation: Fail if Accounts Missing**

In fixed-assets.routes.ts depreciation endpoints, before the JE creation, add:
```
if (!depExpenseAccount) {
  await client.query('ROLLBACK');
  return res.status(400).json({ error: 'Depreciation Expense account (5100) not found. Please add it to your chart of accounts.' });
}
if (!accumDepAccount) {
  await client.query('ROLLBACK');
  return res.status(400).json({ error: 'Accumulated Depreciation account (1240) not found. Please add it to your chart of accounts.' });
}
```
Move the asset UPDATE to AFTER the JE creation succeeds (inside the same transaction).

**C12 — Fiscal Year Close: Remove line_order**

In fiscal-years.routes.ts, remove `line_order` from all INSERT INTO journal_lines statements (lines 199, 207, 216, 224, 235, 243). Change from:
```sql
INSERT INTO journal_lines (entry_id, account_id, debit, credit, description, line_order)
VALUES ($1, $2, $3, $4, $5, $6)
```
To:
```sql
INSERT INTO journal_lines (entry_id, account_id, debit, credit, description)
VALUES ($1, $2, $3, $4, $5)
```
Remove the `lineOrder++` variable.

**M4 — Prevent Hard Deletion of Posted/Paid Records**

- journal.routes.ts DELETE: Already checks `if (entry.status === 'posted')` — verify and confirm.
- invoices.routes.ts DELETE: Add `if (invoice.status === 'paid') return 400`.
- receipts.routes.ts DELETE: Add `if (receipt.posted) return 400`.

**M5 — Autonomous GL: Add Fiscal Year Guard**

In ai-gl.routes.ts accept endpoint, before the call to `processUserFeedback()`, add:
```
await assertFiscalYearOpen(companyId, new Date());
```
Import `assertFiscalYearOpen` from `../lib/fiscal-year-guard`.

### Group E: Access Control

All access control fixes follow the identical pattern:

```typescript
// For routes with companyId in path:
const hasAccess = await storage.hasCompanyAccess(req.user!.id, companyId);
if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

// For routes with entity ID (need to look up entity first):
const entity = await storage.getEntity(id);
if (!entity) return res.status(404).json({ error: 'Not found' });
const hasAccess = await storage.hasCompanyAccess(req.user!.id, entity.companyId);
if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
```

**H1 — Dashboard**: Add `requireCustomer` to middleware chain. Add `hasCompanyAccess()` check at top of each company-scoped handler (6 endpoints).

**H2 — VAT**: In submit and PATCH endpoints, fetch VAT return first, extract companyId, check access.

**H3 — Corporate Tax**: In GET single and PATCH, fetch tax return first (already done in PATCH), extract companyId, check access.

**H4 — AI**: Replace all `openai!` with null guard:
```typescript
if (!openai) {
  return res.status(503).json({ error: 'AI service unavailable — OPENAI_API_KEY not configured' });
}
```
Add this check at the top of every handler that uses the openai client.

**H5 — Receipts POST**: Add `requireCustomer` to the POST create route middleware chain.

**H6 — Receipts PUT**: Fetch receipt, extract companyId, check `hasCompanyAccess()`.

**H7 — Portal**: Add `hasCompanyAccess()` to all company-scoped endpoints that lack it (documents GET/POST/DELETE, tax-returns-archive, compliance-tasks, messages).

### Group F: Data Integrity Constraints

**Migration 0023 — constraints and indexes**

```sql
-- M1: Unique on company_users
-- First deduplicate (keep oldest row per company+user pair)
DELETE FROM company_users a USING company_users b
WHERE a.id > b.id AND a.company_id = b.company_id AND a.user_id = b.user_id;
ALTER TABLE company_users ADD CONSTRAINT uq_company_users_company_user
  UNIQUE (company_id, user_id);

-- M2: Unique on invoice numbers (partial — where number IS NOT NULL)
-- Deduplicate first
DELETE FROM invoices a USING invoices b
WHERE a.id > b.id AND a.company_id = b.company_id
  AND a.number = b.number AND a.number IS NOT NULL;
ALTER TABLE invoices ADD CONSTRAINT uq_invoices_company_number
  UNIQUE (company_id, number) WHERE number IS NOT NULL;
-- Note: This is a partial unique index, not a constraint. Use CREATE UNIQUE INDEX.

DELETE FROM journal_entries a USING journal_entries b
WHERE a.id > b.id AND a.company_id = b.company_id
  AND a.entry_number = b.entry_number AND a.entry_number IS NOT NULL;
ALTER TABLE journal_entries ADD CONSTRAINT uq_journal_entries_company_entry_number
  UNIQUE (company_id, entry_number);

-- M3: Indexes
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_receipts_company_id ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON company_users(user_id);
```

**Schema.ts updates**: Add `unique()` constraints to companyUsers and journalEntries at the Drizzle level to match.

### Group G: Frontend Fixes

**F1 — Console.log removal**: Scan confirmed no console.logs in client/src/pages/ (already clean). Verify at implementation time — if found, remove.

**F2 — not-found.tsx design tokens**: Replace:
- `bg-gray-50` → `bg-background`
- `text-gray-900` → `text-foreground`
- `text-gray-600` → `text-muted-foreground`
- `text-red-500` → `text-destructive`

**F3 — aria-labels**: Add `aria-label` to icon-only buttons. Target the highest-impact pages:
- Journal.tsx: Delete button (`aria-label="Delete journal entry"`), Reverse button (`aria-label="Reverse journal entry"`)
- Invoices.tsx: Delete, Edit, Download, Share buttons
- Dashboard.tsx: Action card links
- Receipts.tsx: Delete, Post buttons
- ChartOfAccounts.tsx: Edit, Archive buttons

Pattern: Find `<Button variant="ghost" size="icon">` or similar icon-only buttons and add `aria-label="descriptive action"`.

## 6. Data Flow / Control Flow Impact

### New JE Creation Flows

```
Payroll Approval → resolve accounts → fiscal year guard → BEGIN → INSERT journal_entries → INSERT journal_lines (debit salary, credit payable) → UPDATE payroll_run status → COMMIT

Asset Disposal → resolve accounts → fiscal year guard → BEGIN → INSERT journal_entries → INSERT journal_lines (debit cash, debit accum dep, credit asset, +/- gain/loss) → UPDATE fixed_asset status → COMMIT

Receipt Posting → resolve accounts → [existing tx] → INSERT journal_entries → INSERT journal_lines (debit expense NET, debit VAT input IF > 0, credit payment) → UPDATE receipt posted → [existing commit]

Expense Claim Approval → resolve accounts → fiscal year guard → BEGIN → INSERT journal_entries → INSERT journal_lines (debit expense per item, debit VAT input, credit AP) → UPDATE claim status → COMMIT
```

### Access Control Flow (added to existing)

```
Request → authMiddleware → requireCustomer → asyncHandler →
  [NEW] hasCompanyAccess(userId, companyId) → 403 if false →
  existing handler logic
```

## 7. Invariants Preserved

| Invariant | How Protected |
|-----------|--------------|
| Debits = Credits | Each new JE creation calculates total debit and total credit from the same source values. Payroll: debit = totalNet = credit. Disposal: debit (cash + accum) = credit (asset cost) ± gain/loss. |
| Posted entries immutable | Existing guard in journal.routes.ts. New invoice guard prevents update/delete when JE is posted. |
| A = L + E | New JE paths create balanced entries, preserving equation. |
| Trial balance = 0 | Follows from balanced entries. |
| Access control | Every company-scoped endpoint now checks hasCompanyAccess(). |
| Monetary precision | Migration 0022 converts all real→numeric. |
| Transaction atomicity | All new JE paths wrapped in DB transactions. |

## 8. Failure Modes

| Failure | Handling |
|---------|----------|
| Account not found during JE creation | Return 400 with "Please add [account name] to your chart of accounts". Transaction rolled back. |
| Fiscal year closed | `assertFiscalYearOpen()` throws with 400. Transaction rolled back. |
| Duplicate constraint violation on migration | Deduplication DELETE runs before constraint creation. |
| Migration on table that doesn't exist | IF EXISTS guards on every ALTER. |
| OpenAI client null | Return 503 immediately, no crash. |
| Payroll run with 0 items | Skip JE creation (no lines to post), still mark as approved. |
| Expense claim with 0 items | Skip JE creation, still mark as approved. |
| Asset disposal with 0 proceeds | Still create derecognition JE (no cash debit line, but accum dep + asset cost lines). |
| Receipt with 0 VAT | Create 2-line JE (expense + payment only), skip VAT line. |

## 9. Security Considerations

- **Access control**: All fixes add checks that were missing. No new attack surface introduced.
- **SQL injection**: All new queries use parameterized queries (pool.query with $1,$2 placeholders or Drizzle ORM). No string concatenation.
- **Input validation**: Bill approval rejects invalid data (missing account_id). Invoice operations reject invalid state transitions.
- **AI service**: Null check prevents TypeError crash, returns clean 503.

## 10. Performance Considerations

- **Migration 0022**: ALTER COLUMN TYPE on ~22 tables. Each ALTER acquires ACCESS EXCLUSIVE lock. On small/medium tables (typical for SMB accounting), this takes milliseconds. On very large tables (100K+ rows), could take seconds. Acceptable for a one-time migration.
- **New indexes (M3)**: CREATE INDEX is concurrent-safe with IF NOT EXISTS. Improves read performance for the most common queries.
- **New JE creation**: Adds 1 additional INSERT per payroll/disposal/expense-claim operation. Negligible overhead.
- **Access control checks**: Adds 1 additional SELECT per request (hasCompanyAccess). Already used on most routes — consistent overhead.

## 11. Test Strategy

### New Unit Tests (mock storage, no DB)

| Test | What it validates |
|------|-------------------|
| Payroll approval JE | Debit salary = Credit payable; rejects if accounts missing |
| Disposal JE | Correct debit/credit for gain and loss scenarios; zero proceeds case |
| Receipt VAT split | 3-line JE when VAT > 0; 2-line JE when VAT = 0 |
| Expense claim JE | Debit per line item + VAT; Credit AP for total |
| Bill approval: missing account_id | Returns 400 |
| Invoice delete: posted JE | Returns 400 |
| Invoice update: posted JE | Returns 400 |
| Invoice delete: paid status | Returns 400 |
| Bill payment: missing accounts | Returns 400, no partial recording |
| Depreciation: missing accounts | Returns 400, no asset update |
| AI: no API key | Returns 503 |
| Dashboard: no company access | Returns 403 |
| VAT PATCH: no company access | Returns 403 |
| Receipt POST: requireCustomer | Middleware present |

### Existing Tests
All 125 existing tests must continue to pass unchanged.

## 12. Rollout / Migration / Rollback

**Migration order matters**:
1. Run migration 0022 (real→numeric) FIRST — this is the foundation
2. Run migration 0023 (constraints + indexes) SECOND — deduplicates then adds constraints
3. Deploy code changes — new guards, JE creation, access controls

**Rollback**:
- Code changes are all additive guards — removing them restores previous behavior
- Migration 0022 is not reversible (numeric→real would lose precision), but this is desired
- Migration 0023 constraints can be dropped if needed (`ALTER TABLE DROP CONSTRAINT`)

**Zero-downtime**: Code changes are backward-compatible. New access controls may return 403 where 200 was returned before, but this is a security fix, not a breaking change.

## 13. File Touch Forecast

### Files to EDIT (19 backend + 6 frontend = 25)

| File | Changes |
|------|---------|
| server/routes.ts | C2, C3: verify/add credit-notes and fiscal-years registration |
| server/lib/account-codes.ts | Add SALARY_EXPENSE, SALARIES_PAYABLE, GAIN_ON_DISPOSAL, LOSS_ON_DISPOSAL, FIXED_ASSETS |
| server/defaultChartOfAccounts.ts | Add accounts 2030, 4050, 5140 if missing |
| server/routes/payroll.routes.ts | C5: JE on approval |
| server/routes/fixed-assets.routes.ts | C8: disposal JE, C9: depreciation fail-fast |
| server/routes/receipts.routes.ts | C10: VAT split, H5: requireCustomer, H6: ownership check |
| server/routes/expense-claims.routes.ts | C11: JE on approval |
| server/routes/bill-pay.routes.ts | C4: reject missing account_id, C7: fail if accounts missing |
| server/routes/invoices.routes.ts | C6: reject delete/update with posted JE, M4: reject paid delete |
| server/routes/journal.routes.ts | M4: verify posted deletion guard exists |
| server/routes/fiscal-years.routes.ts | C12: remove line_order column reference |
| server/routes/dashboard.routes.ts | H1: requireCustomer + hasCompanyAccess |
| server/routes/vat.routes.ts | H2: access control on submit/PATCH |
| server/routes/corporate-tax.routes.ts | H3: access control on GET/PATCH |
| server/routes/ai.routes.ts | H4: null guard for openai |
| server/routes/portal.routes.ts | H7: hasCompanyAccess on all endpoints |
| server/routes/ai-gl.routes.ts | M5: fiscal year guard on accept |
| shared/schema.ts | M1: unique on companyUsers, M2: unique on journalEntries |
| client/src/pages/not-found.tsx | F2: design tokens |
| client/src/pages/Journal.tsx | F3: aria-labels |
| client/src/pages/Invoices.tsx | F3: aria-labels |
| client/src/pages/Dashboard.tsx | F3: aria-labels |
| client/src/pages/Receipts.tsx | F3: aria-labels |
| client/src/pages/ChartOfAccounts.tsx | F3: aria-labels |

### Files to CREATE (2)

| File | Purpose |
|------|---------|
| migrations/0022_real_to_numeric.sql | C1: ALTER all monetary real→numeric |
| migrations/0023_constraints_indexes.sql | M1, M2, M3: unique constraints + indexes |

### Files INTENTIONALLY NOT TOUCHED

- vitest.config.ts (out of scope)
- tests/setup.ts (out of scope)
- server/storage.ts (no changes needed — existing methods sufficient)
- server/middleware/ (existing middleware sufficient)
- Any frontend god-component refactoring (out of scope)

## 14. Design Decision

**READY FOR CHANGE PLAN**
