# Change Plan v3 — Comprehensive Audit Fix

## 1. Plan Summary

Execute 28 audit fixes in 12 ordered steps. Steps are grouped so that foundational changes (account codes, migrations) come first, then JE creation logic, then safety guards, then access control, then frontend. Each step is independently reversible and validates against specific acceptance criteria. Route registration (C2, C3) is already done — verified in routes.ts lines 58-59, 83-84.

## 2. Preconditions

- Branch `claude/nervous-wozniak` checked out in worktree
- 125 existing tests passing (`npm test`)
- Build succeeds (`npm run build`)
- All route files readable at known line numbers (verified by scan)

## 3. Ordered Change Steps

---

### Step 1: Add Missing Account Codes and Default COA Entries

#### Goal
Provide the account code constants needed by Steps 3–6 (JE creation). Must run first because subsequent steps import these.

#### Files Touched
- `server/lib/account-codes.ts`
- `server/defaultChartOfAccounts.ts`

#### Planned Changes

**account-codes.ts**: Add 5 new constants to the ACCOUNT_CODES object:
```
SALARY_EXPENSE: "5020",
SALARIES_PAYABLE: "2030",
FIXED_ASSETS: "1210",
GAIN_ON_DISPOSAL: "4050",
LOSS_ON_DISPOSAL: "5140",
```

**defaultChartOfAccounts.ts**: Add one new entry for code `5140` (Loss on Asset Disposal, type: expense). Codes 2030, 4050, 1210 already exist. Note: code 4050 is currently "Discounts Given" — reuse this code and add a separate `5140` for losses. Alternatively, add a dedicated disposal gain account. Since 4050 is taken, use `4060` for "Gain on Asset Disposal" (income) and `5140` for "Loss on Asset Disposal" (expense). Update ACCOUNT_CODES to match: `GAIN_ON_DISPOSAL: "4060"`.

Add to defaultChartOfAccounts.ts array:
```
{ code: "4060", nameEn: "Gain on Asset Disposal", nameAr: "أرباح التخلص من الأصول", type: "income" },
{ code: "5140", nameEn: "Loss on Asset Disposal", nameAr: "خسائر التخلص من الأصول", type: "expense" },
```

#### Why This Step Exists
All JE creation steps (3–6) need these constants to resolve accounts. Building the constants first prevents compilation errors.

#### Risks
None — additive only. No existing code references these new constants.

#### Validation
- File compiles without error
- Existing 125 tests still pass (constants are not used yet)

#### Tests
None needed for this step — constants are tested implicitly by the JE creation tests in later steps.

#### Reversibility
Remove the added lines.

---

### Step 2: Create Migrations (0022, 0023)

#### Goal
Fix the schema/DB mismatch (C1) and add missing constraints/indexes (M1, M2, M3).

#### Files Touched
- `migrations/0022_real_to_numeric.sql` (NEW)
- `migrations/0023_constraints_indexes.sql` (NEW)

#### Planned Changes

**0022_real_to_numeric.sql**: A single file containing ~107 DO blocks, each guarded by:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'TABLE_NAME' AND column_name = 'COLUMN_NAME'
    AND data_type = 'real') THEN
    ALTER TABLE TABLE_NAME ALTER COLUMN COLUMN_NAME TYPE numeric(PRECISION,SCALE)
      USING COLUMN_NAME::numeric(PRECISION,SCALE);
  END IF;
END $$;
```

Tables and columns (grouped by precision):

**numeric(15,2)** — monetary amounts:
- invoices: subtotal, vat_amount, total
- invoice_lines: unit_price
- journal_lines: debit, credit
- receipts: amount, vat_amount
- bank_transactions: amount
- budgets: budget_amount
- cash_flow_forecasts: predicted_inflow, predicted_outflow, predicted_balance
- corporate_tax_returns: total_revenue, total_expenses, total_deductions, taxable_income, exemption_threshold, tax_payable
- ecommerce_transactions: amount, platform_fees, net_amount
- engagements: monthly_fee
- financial_kpis: value, previous_value
- products: unit_price, cost_price
- inventory_movements: unit_cost
- referral_codes: referrer_reward_value, referee_reward_value, total_rewards_earned
- referrals: referrer_reward_amount, referee_reward_amount
- service_invoices: subtotal, vat_amount, total, paid_amount
- service_invoice_lines: unit_price, amount
- subscription_plans: price_monthly, price_yearly
- tax_return_archive: tax_amount
- vat_returns: ALL ~60 box fields, payment_amount, adjustment_amount
- credit_note_lines: (if table exists)

**numeric(15,4)** — rates, quantities, percentages:
- invoice_lines: quantity, vat_rate
- service_invoice_lines: quantity, vat_rate
- products: vat_rate
- financial_kpis: change_percent, benchmark
- corporate_tax_returns: tax_rate

**0023_constraints_indexes.sql**:
```sql
-- Deduplicate before constraints
DELETE FROM company_users a USING company_users b
WHERE a.id > b.id AND a.company_id = b.company_id AND a.user_id = b.user_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_company_users_company_user') THEN
    ALTER TABLE company_users ADD CONSTRAINT uq_company_users_company_user UNIQUE (company_id, user_id);
  END IF;
END $$;

-- Journal entries unique (deduplicate first)
DELETE FROM journal_entries a USING journal_entries b
WHERE a.id > b.id AND a.company_id = b.company_id
  AND a.entry_number = b.entry_number AND a.entry_number IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_journal_entries_company_entry') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT uq_journal_entries_company_entry UNIQUE (company_id, entry_number);
  END IF;
END $$;

-- Invoices unique on number (partial index — number can be null for drafts)
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
```

#### Why This Step Exists
C1 fixes the most critical data integrity issue (float money). M1-M3 prevent duplicate data and speed up core queries. Migrations are independent of code changes — they can be applied before or after deployment.

#### Risks
- ALTER TYPE on large tables acquires exclusive lock. Mitigated by IF EXISTS guards (idempotent).
- Deduplication DELETEs may remove rows. Mitigated by keeping the oldest (smallest id).
- If invoice `number` column doesn't exist, the partial index will fail — guard with IF EXISTS.

#### Validation
- Migration files have valid SQL syntax
- Idempotent — running twice doesn't error

#### Tests
No code tests — these are SQL migrations. Validated by running on a test database.

#### Reversibility
- 0022: Cannot easily reverse (numeric→real loses precision), but this is the desired direction
- 0023: `ALTER TABLE DROP CONSTRAINT`, `DROP INDEX`

---

### Step 3: Payroll Approval — Add Journal Entry (C5)

#### Goal
Create a salary expense JE when a payroll run is approved.

#### Files Touched
- `server/routes/payroll.routes.ts`

#### Planned Changes

In the approval endpoint (around line 448), AFTER the current status update logic, add:

1. Import at top of file: `import { ACCOUNT_CODES } from '../lib/account-codes';` and `import { assertFiscalYearOpen } from '../lib/fiscal-year-guard';`
2. Fetch payroll items for this run: `SELECT * FROM payroll_items WHERE payroll_run_id = $1`
3. If items.length === 0, skip JE creation (edge case: empty payroll)
4. Resolve accounts: `storage.getAccountByCode(companyId, ACCOUNT_CODES.SALARY_EXPENSE)` and `storage.getAccountByCode(companyId, ACCOUNT_CODES.SALARIES_PAYABLE)`
5. If either not found, return 400 with descriptive error
6. Call `assertFiscalYearOpen(companyId, approvalDate)` (wrapped in try/catch — if fiscal_years table has no rows, skip guard)
7. Generate entry number: `storage.generateEntryNumber(companyId, new Date())`
8. Wrap in transaction (use the existing `query()` helper with `(db as any).$client`):
   - BEGIN
   - INSERT journal_entries with source='payroll', sourceId=runId, status='posted'
   - Calculate totalNet = sum of all payroll items' netSalary
   - INSERT journal_lines: Debit Salary Expense for totalNet
   - INSERT journal_lines: Credit Salaries Payable for totalNet
   - UPDATE payroll_runs status (existing code, moved inside transaction)
   - UPDATE payroll_items status (existing code, moved inside transaction)
   - COMMIT

#### Why This Step Exists
Payroll is the largest expense for many companies. Without JE creation, salary costs never hit the GL — the P&L and balance sheet are wrong.

#### Risks
Account may not exist in company's CoA → mitigated by returning 400.

#### Validation
- Build passes
- Existing tests pass

#### Tests
New test: `tests/accounting/payroll-je.test.ts` — mock storage, verify JE has correct debits/credits, verify rejects when accounts missing, verify skips JE on empty payroll.

#### Reversibility
Remove the added JE creation block.

---

### Step 4: Asset Disposal — Add Journal Entry (C8) + Depreciation Fail-Fast (C9)

#### Goal
Create a disposal derecognition JE. Make depreciation fail if required accounts are missing.

#### Files Touched
- `server/routes/fixed-assets.routes.ts`

#### Planned Changes

**C8 — Disposal JE** (after line 505, the asset UPDATE):

1. Import ACCOUNT_CODES, assertFiscalYearOpen, storage at top
2. Wrap the entire disposal in pool.connect() + BEGIN/COMMIT/ROLLBACK
3. Resolve accounts: BANK_ACCOUNTS (1020), ACCUMULATED_DEPRECIATION (1240), FIXED_ASSETS (1210), GAIN_ON_DISPOSAL (4060) or LOSS_ON_DISPOSAL (5140)
4. Generate entry number
5. INSERT journal_entries with source='disposal', sourceId=assetId, status='posted'
6. INSERT journal_lines:
   - If disposal proceeds > 0: Debit Bank (proceeds)
   - Debit Accumulated Depreciation (asset's current accumulated_depreciation)
   - Credit Fixed Assets (asset's purchase_cost)
   - If gainLoss > 0: Credit Gain on Disposal (gain amount)
   - If gainLoss < 0: Debit Loss on Disposal (abs(loss) amount)
7. Move the asset UPDATE inside the transaction (before COMMIT)

Balance check: Cash + AccumDep + Loss = AssetCost + Gain. Since gainLoss = proceeds - NBV, and NBV = cost - accumDep: proceeds + accumDep + max(0,-gainLoss) = cost + max(0,gainLoss). This balances.

**C9 — Depreciation fail-fast** (in both single and batch depreciation endpoints):

Before the JE INSERT in the depreciation code, after accounts are resolved:
```
if (!depExpenseAccount || !accumDepAccount) {
  await client.query('ROLLBACK');
  return res.status(400).json({
    error: `Required accounts not found. Please ensure your chart of accounts includes Depreciation Expense (5100) and Accumulated Depreciation (1240).`
  });
}
```
Move the asset accumulated_depreciation/net_book_value UPDATE to AFTER the JE INSERT (inside transaction).

#### Why This Step Exists
Without disposal JEs, asset derecognition never hits the GL. Without fail-fast on depreciation, assets can show depreciation in the register but not in the ledger.

#### Risks
Company may not have disposal accounts → 400 with helpful message.

#### Validation
- Build passes
- Existing tests pass

#### Tests
New test: `tests/accounting/disposal-je.test.ts` — gain scenario, loss scenario, zero proceeds. Update existing `tests/accounting/depreciation-gl.test.ts` to add test for account-not-found returning 400.

#### Reversibility
Remove the added blocks.

---

### Step 5: Receipt Posting — Split VAT (C10) + Auth Fixes (H5, H6)

#### Goal
Separate VAT into its own journal line. Add requireCustomer to POST. Add ownership check to PUT.

#### Files Touched
- `server/routes/receipts.routes.ts`

#### Planned Changes

**C10 — VAT Split** (in the posting endpoint, lines ~242-259):

Replace the single expense debit line with:
```
// Debit: Expense Account (net amount, excluding VAT)
const baseAmount = Number(receipt.amount) || 0;
const baseVatAmount = Number(receipt.vatAmount) || 0;

await tx.insert(journalLines).values({
  entryId: entry.id,
  accountId: expenseAccount.id,
  debit: String(baseAmount * exchangeRate),
  credit: "0",
  description: `${receipt.merchant || 'Expense'} - ${receipt.category || 'General'}`,
});

// Debit: VAT Input (1050) if VAT > 0
if (baseVatAmount > 0) {
  const vatInputAccount = await storage.getAccountByCode(receipt.companyId, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);
  if (vatInputAccount) {
    await tx.insert(journalLines).values({
      entryId: entry.id,
      accountId: vatInputAccount.id,
      debit: String(baseVatAmount * exchangeRate),
      credit: "0",
      description: 'Input VAT',
    });
  }
}

// Credit: Payment Account (total = amount + vat)
// ... (existing credit line, keep using baseTotalAmount)
```

**H5 — requireCustomer on POST**: If not already present (scan showed it IS present at line 83 with `requireCustomer`), verify. If missing, add to middleware chain.

**H6 — Ownership on PUT**: In the PUT update endpoint, after fetching the receipt, add:
```
const hasAccess = await storage.hasCompanyAccess(req.user!.id, receipt.companyId);
if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
```

#### Why This Step Exists
Without VAT splitting, input VAT is invisible in the GL — the VAT return calculations from journal data would be wrong.

#### Risks
If VAT Input account (1050) doesn't exist, the VAT line is skipped (graceful). This matches the invoice pattern.

#### Validation
- Build passes
- Existing tests pass

#### Tests
Update `tests/accounting/receipts.test.ts`: add test for 3-line JE with VAT, test for 2-line JE without VAT.

#### Reversibility
Revert the debit line change.

---

### Step 6: Expense Claim Approval — Add Journal Entry (C11)

#### Goal
Create an expense JE when a claim is approved.

#### Files Touched
- `server/routes/expense-claims.routes.ts`

#### Planned Changes

In the approval endpoint (after the status UPDATE at line 303), add:

1. Import ACCOUNT_CODES, assertFiscalYearOpen, pool, storage
2. Fetch expense claim items: `SELECT * FROM expense_claim_items WHERE expense_claim_id = $1`
3. If items.length === 0, skip JE creation
4. Resolve AP account (2010), VAT Input (1050)
5. If AP not found, return 400
6. Calculate totals: totalExpense = sum of items' amount, totalVat = sum of items' vatAmount, grandTotal = totalExpense + totalVat
7. assertFiscalYearOpen (try/catch, skip if no fiscal years)
8. Generate entry number
9. BEGIN transaction:
   - INSERT journal_entries with source='expense_claim', sourceId=claimId, status='posted'
   - INSERT journal_lines: Debit "General Expense" (use a default expense account, e.g., 5060 "Office Expenses" or similar) for totalExpense. Since expense_claim_items don't have an account_id field, use a single aggregate expense debit.
   - If totalVat > 0 and VAT Input account exists: INSERT journal_lines: Debit VAT Input for totalVat
   - INSERT journal_lines: Credit AP for grandTotal
   - Move the existing status UPDATE inside the transaction
   - COMMIT

Check schema: if expense_claim_items has `account_id` or `category` field, use it for per-line debits. If not, use a single aggregate line.

#### Why This Step Exists
Expense claims represent real costs. Without JEs, approved expenses are invisible to the GL.

#### Risks
No per-item account resolution if schema lacks account_id. Mitigated by using a single aggregate expense line.

#### Validation
- Build passes
- Existing tests pass

#### Tests
New test: `tests/accounting/expense-claim-je.test.ts` — verify JE balance, verify skips empty claims, verify rejects if AP missing.

#### Reversibility
Remove the added block.

---

### Step 7: Accounting Safety Guards (C4, C6, C7, C12, M4)

#### Goal
Add all safety guards that prevent data corruption: reject unbalanced bills, protect invoices with posted JEs, fail bill payments without accounts, remove line_order bug, prevent hard deletion of posted/paid records.

#### Files Touched
- `server/routes/bill-pay.routes.ts` (C4, C7)
- `server/routes/invoices.routes.ts` (C6, M4)
- `server/routes/receipts.routes.ts` (M4 — prevent deleting posted receipts)
- `server/routes/fiscal-years.routes.ts` (C12)
- `server/routes/journal.routes.ts` (M4 — verify existing guard)

#### Planned Changes

**C4 — bill-pay.routes.ts** (before line 435, the line item loop):
```
const missingAccounts = billLines.filter((l: any) => !l.account_id);
if (missingAccounts.length > 0) {
  await client.query('ROLLBACK');
  client.release();
  return res.status(400).json({
    error: `${missingAccounts.length} line item(s) have no account assigned. All lines must have an account before approval.`
  });
}
```

**C7 — bill-pay.routes.ts** (payment endpoint, after account resolution at ~line 565):
Change from logging a warning to hard failure:
```
if (!apAccount) {
  await client.query('ROLLBACK');
  client.release();
  return res.status(400).json({ error: 'Accounts Payable account (2010) not found. Add it to your chart of accounts.' });
}
if (!bankAccount) {
  await client.query('ROLLBACK');
  client.release();
  return res.status(400).json({ error: 'Bank account (1020) not found. Add it to your chart of accounts.' });
}
```

**C6 — invoices.routes.ts DELETE** (before `storage.deleteInvoice`):
```
// Check for posted JE or paid status
if (invoice.status === 'paid') {
  return res.status(400).json({ error: 'Cannot delete a paid invoice.' });
}
const entries = await storage.getJournalEntriesByCompanyId(invoice.companyId);
const postedJE = entries.find((e: any) => e.sourceId === id && e.status === 'posted');
if (postedJE) {
  return res.status(400).json({ error: 'Cannot delete invoice with a posted journal entry. Reverse the journal entry first.' });
}
```

**C6 — invoices.routes.ts UPDATE** (before the transaction):
```
const entries = await storage.getJournalEntriesByCompanyId(invoice.companyId);
const postedJE = entries.find((e: any) => e.sourceId === id && e.status === 'posted');
if (postedJE) {
  return res.status(400).json({ error: 'Cannot update invoice with a posted journal entry. Reverse the journal entry first.' });
}
```

**M4 — invoices.routes.ts DELETE**: Already covered by the paid-status check above.

**M4 — receipts.routes.ts DELETE**: In the delete endpoint, after fetching receipt:
```
if (receipt.posted) {
  return res.status(400).json({ error: 'Cannot delete a posted receipt.' });
}
```

**M4 — journal.routes.ts DELETE**: Verify existing guard. Scan showed it already checks `if (entry.status === 'posted')` at line 401. Confirmed — no change needed.

**C12 — fiscal-years.routes.ts**: Remove `line_order` from ALL journal_lines INSERT statements (6 occurrences in lines 199-245):
- Remove `, line_order` from column lists
- Remove the `$6` parameter and `lineOrder++` argument
- Remove the `let lineOrder = 1;` declaration

#### Why This Step Exists
These guards prevent the most dangerous accounting errors: unbalanced entries, orphaned JEs, shadow accounting, and deletion of audit-trail records.

#### Risks
Invoice UPDATE/DELETE rejection may surprise users who currently delete paid invoices. This is correct accounting behavior.

#### Validation
- Build passes
- Existing tests pass
- Manually trace: fiscal-years.routes no longer references line_order

#### Tests
New tests in `tests/accounting/safety-guards.test.ts`:
- Bill approval with missing account_id returns 400
- Bill payment with missing AP returns 400
- Invoice delete with posted JE returns 400
- Invoice delete when paid returns 400
- Invoice update with posted JE returns 400
- Receipt delete when posted returns 400

#### Reversibility
Remove the added guard blocks.

---

### Step 8: Autonomous GL Fiscal Year Guard (M5)

#### Goal
Add fiscal year guard to the AI GL accept/post path.

#### Files Touched
- `server/routes/ai-gl.routes.ts`

#### Planned Changes

At the top of the accept handler (line ~80), before `processUserFeedback()`:
```
import { assertFiscalYearOpen } from '../lib/fiscal-year-guard';

// Inside handler:
try {
  await assertFiscalYearOpen(companyId, new Date());
} catch (err: any) {
  if (err.statusCode === 400) {
    return res.status(400).json({ error: err.message });
  }
}
```

#### Why This Step Exists
AI-accepted entries should respect the same fiscal year rules as manual entries.

#### Risks
If assertFiscalYearOpen throws for unexpected reasons, the try/catch handles it.

#### Validation
- Build passes
- Existing tests pass

#### Tests
Add to existing `tests/accounting/fiscal-years.test.ts`: AI GL accept respects fiscal year guard.

#### Reversibility
Remove the guard.

---

### Step 9: Access Control Fixes (H1, H2, H3, H4, H7)

#### Goal
Add missing authentication/authorization checks to all under-protected routes.

#### Files Touched
- `server/routes/dashboard.routes.ts` (H1)
- `server/routes/vat.routes.ts` (H2)
- `server/routes/corporate-tax.routes.ts` (H3)
- `server/routes/ai.routes.ts` (H4)
- `server/routes/portal.routes.ts` (H7)

#### Planned Changes

**H1 — dashboard.routes.ts**: For every company-scoped endpoint (`/api/companies/:companyId/...`):
1. Add `requireCustomer` to middleware chain if missing
2. Add at top of handler:
```
const hasAccess = await storage.hasCompanyAccess(req.user!.id, companyId);
if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
```
Apply to: stats, expense-breakdown, monthly-trends, P&L, balance-sheet, VAT summary (6 handlers).

**H2 — vat.routes.ts**: In submit (POST /vat-returns/:id/submit) and PATCH endpoints:
1. Fetch the VAT return first: `const vatReturn = await storage.getVatReturn(id);`
2. Check access: `const hasAccess = await storage.hasCompanyAccess(userId, vatReturn.companyId);`
3. If not, return 403.
4. Add `requireCustomer` to middleware chain.

**H3 — corporate-tax.routes.ts**: In GET single and PATCH:
1. After fetching the tax return, extract `companyId`
2. Add `const hasAccess = await storage.hasCompanyAccess(req.user!.id, taxReturn.companyId);`
3. If not, return 403.

**H4 — ai.routes.ts**: Find every handler that uses the `openai` variable. At the top of each handler, add:
```
if (!openai) {
  return res.status(503).json({ error: 'AI service unavailable — OPENAI_API_KEY not configured' });
}
```
Remove all `openai!` non-null assertions (replace with just `openai.`).

**H7 — portal.routes.ts**: For every company-scoped endpoint that lacks `hasCompanyAccess()`:
1. Extract companyId from params
2. Add: `const hasAccess = await storage.hasCompanyAccess(req.user!.id, companyId); if (!hasAccess) return res.status(403).json({ error: 'Access denied' });`
Apply to: documents GET/POST/DELETE, tax-returns-archive, compliance-tasks CRUD, messages.

For entity-ID endpoints (DELETE document, PATCH/DELETE compliance task): fetch entity first, extract companyId, check access.

#### Why This Step Exists
These routes allow any authenticated user to access any company's data. This is a serious authorization vulnerability.

#### Risks
Users accessing their own data will not be affected — hasCompanyAccess returns true for legitimate access. Only cross-company access is blocked.

#### Validation
- Build passes
- Existing tests pass

#### Tests
New test: `tests/security/access-control.test.ts` — verify 403 returns for dashboard, VAT, corporate tax, portal endpoints when user lacks company access. Verify AI returns 503 when openai is null.

#### Reversibility
Remove the added guard blocks.

---

### Step 10: Schema.ts — Add Unique Constraints at Drizzle Level

#### Goal
Make schema.ts match the constraints added by migration 0023.

#### Files Touched
- `shared/schema.ts`

#### Planned Changes

**companyUsers table** (~line 100): Add unique constraint:
```
// Change from:
export const companyUsers = pgTable("company_users", { ... });
// To:
export const companyUsers = pgTable("company_users", { ... }, (table) => ({
  companyUserUnique: unique("uq_company_users_company_user").on(table.companyId, table.userId),
}));
```

**journalEntries table** (~line 162): The entryNumber field exists. Add unique constraint:
```
// Add table config callback:
}, (table) => ({
  companyEntryUnique: unique("uq_journal_entries_company_entry").on(table.companyId, table.entryNumber),
}));
```

Note: Check if these tables already have a third argument function. If so, add the constraint inside the existing function.

#### Why This Step Exists
Schema.ts should reflect the actual DB constraints for type safety and documentation.

#### Risks
If the Drizzle schema constraint syntax doesn't match the migration constraint name, Drizzle push may try to create a duplicate. Using the exact same constraint name prevents this.

#### Validation
- Build passes
- Existing tests pass

#### Tests
Add to `tests/integrity/schema-validation.test.ts`: verify companyUsers and journalEntries schema definitions.

#### Reversibility
Remove the constraint callback arguments.

---

### Step 11: Frontend Fixes (F1, F2, F3)

#### Goal
Remove console.logs, fix design tokens, add aria-labels.

#### Files Touched
- `client/src/pages/not-found.tsx` (F2)
- `client/src/pages/Journal.tsx` (F3)
- `client/src/pages/Invoices.tsx` (F3)
- `client/src/pages/Dashboard.tsx` (F3)
- `client/src/pages/Receipts.tsx` (F3)
- `client/src/pages/ChartOfAccounts.tsx` (F3)

#### Planned Changes

**F1 — Console.log**: Scan showed none in client/src/pages/. Run `grep -r 'console.log' client/src/pages/` at implementation time. If any found, remove them.

**F2 — not-found.tsx**: Replace:
- `bg-gray-50` → `bg-background`
- `text-gray-900` → `text-foreground`
- `text-gray-600` → `text-muted-foreground`
- `text-red-500` → `text-destructive`

**F3 — aria-labels**: In each page, find `<Button variant="ghost" size="icon">` or `<Button variant="ghost" size="sm">` with only an icon child (Trash2, Pencil, Download, Share2, etc.) and add `aria-label="Descriptive action"`:

- Journal.tsx: `<Button ... aria-label="Delete journal entry">`, `<Button ... aria-label="Reverse journal entry">`, `<Button ... aria-label="View journal entry">`
- Invoices.tsx: `<Button ... aria-label="Edit invoice">`, `<Button ... aria-label="Delete invoice">`, `<Button ... aria-label="Download invoice">`, `<Button ... aria-label="Share invoice">`
- Dashboard.tsx: Action card elements — add `aria-label` to clickable Card elements
- Receipts.tsx: `<Button ... aria-label="Delete receipt">`, `<Button ... aria-label="Post receipt">`
- ChartOfAccounts.tsx: `<Button ... aria-label="Edit account">`, `<Button ... aria-label="Archive account">`

#### Why This Step Exists
Accessibility and design consistency. Zero aria-labels means screen readers can't identify interactive elements.

#### Risks
None — additive only. No logic changes.

#### Validation
- Build passes
- Grep for `bg-gray-` in not-found.tsx returns empty
- Grep for `aria-label` in Journal.tsx returns results

#### Tests
Visual inspection only. Frontend aria-labels are not unit-testable.

#### Reversibility
Revert the text changes.

---

### Step 12: Run Full Test Suite + Build Verification

#### Goal
Verify all changes are stable.

#### Files Touched
None — read only.

#### Planned Changes
1. Run `npm test` — all 125+ tests must pass
2. Run `npm run build` — must succeed
3. Verify no new TypeScript errors beyond pre-existing baseline

#### Why This Step Exists
Regression gate before handoff to Test Author.

#### Risks
None.

#### Validation
Exit code 0 for both commands.

#### Tests
This IS the test step.

#### Reversibility
N/A.

---

## 4. Files Not To Touch

- `vitest.config.ts` — test infrastructure
- `tests/setup.ts` — test infrastructure
- `tests/helpers.ts` — test infrastructure
- `server/storage.ts` — no changes needed, existing methods sufficient
- `server/middleware/` — existing middleware sufficient
- `server/services/` — no service file changes needed (autonomous-gl.service.ts is called from ai-gl.routes.ts which we do modify)
- Any frontend component refactoring (god-component decomposition out of scope)
- `package.json` — no new dependencies

## 5. Dependency Policy

**No new dependencies.** All changes use existing libraries (drizzle-orm, pg, express). No new npm packages.

## 6. Implementation Guardrails

- No speculative refactor — only fix the 28 identified issues
- No rename churn — keep existing variable/function names
- No unrelated cleanup — don't fix other issues noticed during implementation
- No behavior changes beyond acceptance criteria
- No skipping failure paths — every new JE path must handle account-not-found
- No TODO markers — all work must be complete in each step
- No console.log in production code — use existing logging patterns
- All new SQL must use parameterized queries ($1, $2...)
- All new JEs must have balanced debits and credits
- All transactions must have ROLLBACK in catch/error paths

## 7. Completion Criteria

All of the following must be true:
1. Migrations 0022 and 0023 exist with valid idempotent SQL
2. Credit-notes and fiscal-years routes are registered (already done — verified)
3. Payroll approval creates balanced JE
4. Asset disposal creates balanced JE
5. Receipt posting splits VAT into separate journal line
6. Expense claim approval creates balanced JE
7. Bill approval rejects missing account_id lines
8. Invoice update/delete rejects when JE is posted
9. Bill payment fails when accounts are missing
10. Depreciation fails when accounts are missing
11. Fiscal year close doesn't reference line_order
12. Posted/paid records cannot be hard-deleted
13. AI GL accept respects fiscal year guard
14. All dashboard, VAT, corporate-tax, portal endpoints have access control
15. AI routes return 503 when OpenAI is unavailable
16. Schema.ts has unique constraints on companyUsers and journalEntries
17. Frontend not-found.tsx uses design tokens
18. Icon-only buttons have aria-labels
19. All 125+ existing tests pass
20. Build succeeds

## 8. Planning Decision

**READY FOR IMPLEMENTATION**
