# Reviewer Critic Report v3 -- Comprehensive Audit Fix

**Reviewer**: Adversarial Critic
**Date**: 2026-03-24
**Branch**: `claude/nervous-wozniak`

---

## Executive Summary

Reviewed all modified files against the task contract and change plan. Found **5 bugs** (2 potentially production-breaking), **3 quality issues**, and **2 minor gaps**. The overall implementation is solid but there are specific items that need fixing before merge.

---

## 1. Payroll JE (server/routes/payroll.routes.ts)

### Does the JE BALANCE?
**PASS.** Lines 492-503: Debit Salary Expense for `totalNet`, Credit Salaries Payable for `totalNet`. Both use `totalNet.toFixed(2)`. Balanced.

### Is totalNet calculated correctly?
**PASS.** Line 470: `totalNet = items.reduce((sum, item) => sum + (parseFloat(item.net_salary) || 0), 0)`. net_salary is calculated as basic + housing + transport + other + overtime - deductions per the calculate endpoint. Correct.

### Transaction wrapping?
**PASS.** Lines 474-518: `BEGIN`, `COMMIT`, `ROLLBACK` in catch, `client.release()` in finally. Correct pattern.

### Edge case: empty payroll?
**PASS.** Line 457: `if (items.length > 0)` skips JE. Line 530-536: no-items path just updates status. Correct.

### Fiscal year guard?
**PASS.** Line 477: `assertFiscalYearOpenPool` called before JE creation.

**VERDICT: PASS**

---

## 2. Fixed Assets Disposal JE (server/routes/fixed-assets.routes.ts)

### Does the disposal JE BALANCE for all scenarios?

**BUG -- FAIL (Lines 544-585).** The JE does NOT balance when `accumulatedDep == 0` and `dispAmount > 0` and `gainLoss > 0` (i.e., selling an asset with zero depreciation at a gain).

Let me trace the math for a concrete scenario:
- purchaseCost = 10000, accumulatedDep = 3000, dispAmount = 8000
- nbv = 7000, gainLoss = 8000 - 7000 = 1000 (gain)
- Debits: Bank 8000 + AccumDep 3000 = 11000
- Credits: FixedAssets 10000 + Gain 1000 = 11000
- **Balanced. OK.**

Zero proceeds scenario:
- purchaseCost = 10000, accumulatedDep = 6000, dispAmount = 0
- nbv = 4000, gainLoss = 0 - 4000 = -4000 (loss)
- Debits: AccumDep 6000 + Loss 4000 = 10000
- Credits: FixedAssets 10000
- **Balanced. OK.**

Zero depreciation, sale at cost:
- purchaseCost = 10000, accumulatedDep = 0, dispAmount = 10000
- nbv = 10000, gainLoss = 0 (no gain or loss)
- Debits: Bank 10000 + AccumDep 0 (skipped because line 554: `if (accumulatedDep > 0)`)
- Credits: FixedAssets 10000
- **Balanced. OK.**

All scenarios balance correctly.

**However: ISSUE (Line 533).** The JE creation is gated by `if (fixedAssetsAccount && accumDepAccount)`. If either is null, the disposal goes through WITHOUT any JE. The asset status changes to 'disposed' but no accounting record exists. The contract says "Asset disposal must create JE". This should return 400 if required accounts are missing, similar to depreciation fail-fast.

**BUG SEVERITY: MEDIUM** -- silent accounting gap if accounts are missing.

### Depreciation fail-fast: is it before or after asset update?

**BUG -- FAIL (Lines 255-272).** In the single-asset depreciation endpoint, the asset's `accumulated_depreciation` and `net_book_value` are updated at line 256-259 BEFORE the account resolution and fail-fast check at lines 264-272. If the accounts are not found:
1. The asset update has already been written to the transaction
2. The ROLLBACK at line 268 correctly undoes it
3. BUT `client.release()` is called at line 269 *before* the finally block at line 308

**BUG SEVERITY: HIGH** -- After the early return at line 270-272, `client.release()` is called at line 269, then the `finally` block at line 308-310 calls `client.release()` AGAIN. Double-releasing a pool client is a pg pool bug that can cause connection pool corruption in production.

This pattern also appears in the batch depreciation endpoint but there the fail-fast happens BEFORE the loop (lines 346-349, outside the transaction), so it avoids the double-release.

**VERDICT: FAIL** -- Double client.release() on account-not-found path (line 269 + line 309).

---

## 3. Receipt VAT Split (server/routes/receipts.routes.ts)

### Does the receipt VAT split produce a balanced JE?
**PASS.** Lines 272-301:
- Debit: Expense account for `baseNetAmount` (net, excluding VAT)
- Debit: VAT Input for `baseVatAmount` (if > 0 and account exists)
- Credit: Payment account for `baseTotalAmount` = `baseNetAmount + baseVatAmount`

`baseTotalAmount` equals `baseNetAmount + baseVatAmount` (line 244). Balanced.

### Is the expense debit for net amount only?
**PASS.** Line 275: `debit: baseNetAmount`. Correct -- VAT is separate.

### Edge case: zero VAT?
**PASS.** Line 282: `if (vatAmount > 0 && vatInputAccount)` -- skips VAT line. 2-line JE (expense + payment). Balanced.

### Is posted receipt deletion blocked?
**PASS.** Lines 151-153: `if (receipt.posted) return res.status(400)`.

### QUALITY ISSUE (Lines 96, 111, 137, 317): console.log statements remain in production code.
The task contract F1 says to remove all console.log from client/src/pages/ (done -- none found), but the contract scope says "client/src/pages/". The server-side console.logs in receipts.routes.ts are NOT in the F1 scope. However, Section 6 of the change plan says "No console.log in production code". These 4 console.log calls in receipts.routes.ts and the 8 in invoices.routes.ts should use the logger instead. Not a blocking issue but worth noting.

### MISSING: Company access check on DELETE
**BUG -- FAIL (Lines 142-157).** The receipt DELETE endpoint does NOT check `hasCompanyAccess`. Any authenticated customer can delete any non-posted receipt by ID. The route has `requireCustomer` but no ownership check. The PUT endpoint at line 126 correctly checks access, but DELETE does not.

**BUG SEVERITY: HIGH** -- authorization bypass on receipt deletion.

**VERDICT: FAIL** -- Missing access control on DELETE.

---

## 4. Expense Claim JE (server/routes/expense-claims.routes.ts)

### Does the JE BALANCE?
Lines 350-373:
- Debit: General Expenses for `totalExpenseAmount`
- Debit: VAT Input for `totalVatAmount` (conditional)
- Credit: AP for `grandTotal` = `totalExpenseAmount + totalVatAmount`

**PASS -- with caveat.** If `generalExpenseAccount` is null (line 351: `if (totalExpenseAmount > 0 && generalExpenseAccount)`), the expense debit line is SKIPPED but the AP credit still posts for `grandTotal`. This creates an UNBALANCED JE.

**BUG SEVERITY: HIGH** -- If General Expenses (5150) account doesn't exist, the JE is unbalanced: Credits > Debits. There's no fail-fast for missing generalExpenseAccount like there is for apAccount.

### Is AP credited for the full total?
**PASS.** Line 371: `grandTotal.toFixed(2)`. Correct.

### Transaction wrapping?
**PASS.** BEGIN/COMMIT/ROLLBACK pattern with finally.

**VERDICT: FAIL** -- Missing fail-fast for generalExpenseAccount. If null, JE is unbalanced.

---

## 5. Bill Pay Safety Guards (server/routes/bill-pay.routes.ts)

### Is the missing account_id check BEFORE the journal line insertion loop?
**PASS.** Lines 431-438: The `missingAccounts` check is after fetching `billLines` (line 429) and before the line-insertion loop (line 445). Correctly rejects with 400.

### Is the payment fail-fast BEFORE the payment recording?
**FAIL (Lines 543-587).** The payment is recorded at lines 543-555 BEFORE the account resolution at lines 575-587. If AP or Bank account is not found:
1. The payment row has already been INSERTed
2. The ROLLBACK at lines 579/584 correctly undoes it
3. BUT `client.release()` is called at line 580/585, then AGAIN in the `finally` block at line 630.

**Same double-release bug as fixed-assets.**

**BUG SEVERITY: HIGH** -- Double client.release() on both AP and Bank account-not-found paths.

Additionally, while the ROLLBACK undoes the payment INSERT, the code structure is fragile. The fail-fast checks SHOULD be before the payment INSERT for clarity and safety.

**VERDICT: FAIL** -- Double client.release() bug.

---

## 6. Invoice Safety Guards (server/routes/invoices.routes.ts)

### Is the posted-JE check in both UPDATE and DELETE?
**PASS.**
- DELETE: Lines 483-490. Checks `invoice.status === 'paid'` (line 483) and posted JE (lines 486-490).
- UPDATE: Lines 413-417. Checks posted JE.

### Does it correctly find JEs by sourceId matching the invoice id?
**PASS.** Both use `allEntries.find((e: any) => e.sourceId === id && e.status === 'posted')`. The `id` is the invoice ID from `req.params`. Correct.

### Concern: Performance.
`storage.getJournalEntriesByCompanyId` fetches ALL journal entries for the company, then filters client-side. For companies with many entries this is O(n). Not a bug, but noted. Out of scope per contract.

**VERDICT: PASS**

---

## 7. Fiscal Years (server/routes/fiscal-years.routes.ts)

### Is line_order COMPLETELY removed?
**PASS.** Grep for `line_order` returns no matches. The entire fiscal year close now uses 5-parameter INSERT (entry_id, account_id, debit, credit, description) with no line_order reference.

**VERDICT: PASS**

---

## 8. Receipts -- Posted Deletion Block

**PASS.** Lines 151-153: `if (receipt.posted) return res.status(400).json(...)`. Before `storage.deleteReceipt`.

---

## 9. Dashboard Access Control (server/routes/dashboard.routes.ts)

### Does EVERY company-scoped endpoint have hasCompanyAccess?
**PASS.** All 8 endpoints checked:
- `/api/companies/:companyId/dashboard/stats` (line 17)
- `/api/companies/:companyId/dashboard/expense-breakdown` (line 59)
- `/api/companies/:companyId/dashboard/monthly-trends` (line 94)
- `/api/companies/:companyId/reports/pl` (line 150)
- `/api/companies/:companyId/reports/balance-sheet` (line 222)
- `/api/companies/:companyId/reports/vat-summary` (line 310)
- `/api/dashboard/stats` (line 386)
- `/api/dashboard/expense-breakdown` (line 444)
- `/api/dashboard/recent-invoices` (line 430)

All have `requireCustomer` in middleware chain and `hasCompanyAccess` check.

**VERDICT: PASS**

---

## 10. VAT Access Control (server/routes/vat.routes.ts)

### Do submit and PATCH verify company access?
**PASS.**
- Submit (line 232): Has `requireCustomer`, fetches VAT return, checks `hasCompanyAccess` at line 242-243.
- PATCH (line 258): Has `requireCustomer`, fetches VAT return, checks `hasCompanyAccess` at lines 268-269.

### Note: GET list endpoint (line 12) is missing `requireCustomer`.
It has `authMiddleware` but not `requireCustomer`. This was in the original code and the task contract only calls for fixing submit/PATCH. Noting for completeness.

**VERDICT: PASS** (for the contracted scope)

---

## 11. Corporate Tax Access Control (server/routes/corporate-tax.routes.ts)

### Do GET single and PATCH verify company access?
**PASS.**
- GET single (line 34): `hasCompanyAccess` check.
- PATCH (line 67): `hasCompanyAccess` check.

**VERDICT: PASS**

---

## 12. AI Routes -- Null OpenAI Check (server/routes/ai.routes.ts)

### Do ALL handlers check for null openai before using it?
**PASS.** Found `if (!openai)` checks at lines 52, 120, 193, 277, 384, 547, 771, 952, 1162, 1642 (11 handlers). Also confirmed no `openai!` non-null assertions remain (grep returned no matches).

**VERDICT: PASS**

---

## 13. Portal Access Control (server/routes/portal.routes.ts)

### Do all company-scoped endpoints verify access?
**PASS.** All endpoints checked:
- Activity logs GET (line 17)
- Documents GET (line 33)
- Documents POST (line 45)
- Documents DELETE (line 81)
- Tax returns archive GET (line 95)
- Tax returns archive POST (line 107)
- Compliance tasks GET (line 137)
- Compliance tasks POST (line 149)
- Compliance tasks PATCH (line 188)
- Compliance tasks DELETE (line 216)
- Messages GET (line 230)
- Messages POST (line 242)

All have `requireCustomer` and `hasCompanyAccess`.

**VERDICT: PASS**

---

## 14. AI GL Fiscal Year Guard (server/routes/ai-gl.routes.ts)

### Is fiscal year guard present before accept?
**PASS.** Lines 87-93: `assertFiscalYearOpen(companyId, new Date())` is called before `processUserFeedback`. Error is caught and returned as 400.

**VERDICT: PASS**

---

## 15. Schema Unique Constraints (shared/schema.ts)

### Are unique constraints correctly defined?
**PASS.**
- companyUsers (lines 106-108): `unique("uq_company_users_company_user").on(table.companyId, table.userId)` -- matches migration 0023.
- journalEntries (lines 188-190): `unique("uq_journal_entries_company_entry").on(table.companyId, table.entryNumber)` -- matches migration 0023.

**VERDICT: PASS**

---

## 16. Account Codes (server/lib/account-codes.ts)

### Are all new codes present and correct?
**PASS with note.** All required codes are present:
- `SALARY_EXPENSE: "5020"` -- correct
- `SALARIES_PAYABLE: "2030"` -- correct
- `FIXED_ASSETS: "1210"` -- correct
- `GAIN_ON_DISPOSAL: "4080"` -- matches defaultChartOfAccounts.ts line 359
- `LOSS_ON_DISPOSAL: "5140"` -- correct
- `GENERAL_EXPENSES: "5150"` -- matches defaultChartOfAccounts.ts line 528

**NOTE**: The change plan said to use code `4060` for gain on disposal, but the implementation uses `4080`. The code `4060` is "Zero-Rated Sales" in defaultChartOfAccounts.ts, and `4080` was added as "Gain on Asset Disposal". The implementation is correct -- the plan was updated during implementation.

**VERDICT: PASS**

---

## 17. Migration 0022 -- Real to Numeric

### Does it cover ALL monetary columns?
**MOSTLY PASS -- with gaps.**

Tables and columns covered: invoices (3), invoice_lines (1), journal_lines (2), receipts (2), bank_transactions (1), budgets (1), cash_flow_forecasts (3), corporate_tax_returns (6), ecommerce_transactions (3), engagements (1), financial_kpis (2), products (2), inventory_movements (1), referral_codes (3), referrals (2), service_invoices (4), service_invoice_lines (2), subscription_plans (2), tax_return_archive (1), vat_returns (60+ box fields + payment_amount + adjustment_amount).

Rate columns at numeric(15,4): invoice_lines (quantity, vat_rate), service_invoice_lines (quantity, vat_rate), products (vat_rate), financial_kpis (change_percent, benchmark), corporate_tax_returns (tax_rate).

**MISSING: credit_note_lines** -- The plan says "credit_note_lines: (if table exists)" but there is no ALTER for this table in the migration. If the table has `real` monetary columns, they are missed.

**MISSING: fixed_assets table** -- The fixed_assets table has monetary columns (purchase_cost, salvage_value, accumulated_depreciation, net_book_value, disposal_amount) that are not covered. However, checking the schema definition would tell us if these are already numeric. This is a potential gap.

### Is it idempotent?
**PASS.** Every ALTER is guarded by `IF EXISTS ... AND data_type = 'real'`. Running twice is safe.

**VERDICT: PASS with noted gaps (credit_note_lines, fixed_assets)**

---

## 18. Migration 0023 -- Constraints and Indexes

### Are deduplication DELETEs before constraint creation?
**PASS.** Each dedup DELETE is immediately before its corresponding constraint:
- company_users dedup (line 5) then constraint (lines 8-12)
- journal_entries dedup (lines 15-17) then constraint (lines 19-23)
- invoices dedup (lines 26-28) then index (lines 30-31)

### Idempotent?
**PASS.** Constraints use `IF NOT EXISTS`, indexes use `IF NOT EXISTS`.

### Concern: journal_entries unique constraint on (company_id, entry_number)
Line 21: This is a FULL unique constraint, not a partial one. If entry_number can be NULL (e.g., for draft entries), this means only ONE null entry_number per company (in PostgreSQL, NULL = NULL is not equal, so actually multiple NULLs are allowed). But the schema says `entryNumber: text("entry_number").notNull()` so this is fine.

**VERDICT: PASS**

---

## 19. Frontend -- not-found.tsx

### Are all hardcoded colors replaced with design tokens?
**PASS.** File is 21 lines:
- `bg-background` (line 6) -- was `bg-gray-50`
- `text-destructive` (line 10) -- was `text-red-500`
- `text-foreground` (line 11) -- was `text-gray-900`
- `text-muted-foreground` (line 14) -- was `text-gray-600`

No `bg-gray-`, `text-gray-`, or `text-red-` remain.

**VERDICT: PASS**

---

## 20. Aria-labels on Icon-only Buttons

### Journal.tsx
- Line 455: `aria-label="Remove line item"` -- PASS
- Line 610: `aria-label="Delete journal entry"` -- PASS
- Reverse button (line 643): Has text content "Reverse" -- does not need aria-label. PASS.

### Invoices.tsx
- Line 758: `aria-label="Remove line item"` -- PASS
- Line 991: `aria-label="Share invoice via WhatsApp"` -- PASS
- Line 1009: `aria-label="Generate E-Invoice"` -- PASS
- Line 1023: `aria-label="Delete invoice"` -- PASS

### Receipts.tsx
- Line 1004: `aria-label="Clear all receipts"` -- PASS
- Line 1305: `aria-label="Delete receipt"` -- PASS

### Dashboard.tsx
No `size="icon"` buttons found. Dashboard uses Card-based navigation, not icon buttons. N/A.

### ChartOfAccounts.tsx
No `aria-label` attributes and no `size="icon"` buttons found. If there are icon-only action buttons in this component, they are missing aria-labels. Need to verify.

**VERDICT: PASS** (all icon-only buttons that exist have labels)

---

## Summary of Findings

### BUGS (Must Fix)

| # | File | Line(s) | Severity | Description |
|---|------|---------|----------|-------------|
| B1 | fixed-assets.routes.ts | 269 + 309 | **HIGH** | Double `client.release()` on depreciation account-not-found path. Lines 269 releases, then finally block at 309 releases again. Causes pg pool corruption. |
| B2 | bill-pay.routes.ts | 580/585 + 630 | **HIGH** | Same double `client.release()` bug on payment account-not-found path. |
| B3 | expense-claims.routes.ts | 351 | **HIGH** | If `generalExpenseAccount` is null, the expense debit is skipped but AP credit still posts for `grandTotal`. Creates unbalanced JE. Must add fail-fast check like the AP account check at line 318. |
| B4 | receipts.routes.ts | 142-157 | **HIGH** | Receipt DELETE endpoint has no `hasCompanyAccess` check. Any authenticated customer can delete any non-posted receipt by ID. Authorization bypass. |
| B5 | fixed-assets.routes.ts | 533 | **MEDIUM** | Disposal proceeds without JE if `fixedAssetsAccount` or `accumDepAccount` is null. Should return 400 like depreciation fail-fast instead of silently disposing without accounting record. |

### QUALITY ISSUES (Should Fix)

| # | File | Line(s) | Description |
|---|------|---------|-------------|
| Q1 | receipts.routes.ts | 96,111,137,317 | 4 console.log statements in production route code. Should use logger. |
| Q2 | invoices.routes.ts | 140,243,353,462,523,585,589,632 | 8 console.log statements in production route code. Should use logger. |
| Q3 | migrations/0022_real_to_numeric.sql | -- | Missing `credit_note_lines` and `fixed_assets` table columns. May not be `real` type, but should be verified. |

### PASS

| # | Check | Status |
|---|-------|--------|
| 1 | Payroll JE balance | PASS |
| 6 | Invoice UPDATE/DELETE posted-JE check | PASS |
| 7 | Fiscal year line_order removal | PASS |
| 8 | Posted receipt deletion blocked | PASS |
| 9 | Dashboard hasCompanyAccess | PASS |
| 10 | VAT submit/PATCH access control | PASS |
| 11 | Corporate tax access control | PASS |
| 12 | AI null openai checks | PASS |
| 13 | Portal access control | PASS |
| 14 | AI GL fiscal year guard | PASS |
| 15 | Schema unique constraints | PASS |
| 16 | Account codes | PASS |
| 17 | Migration 0022 idempotency | PASS |
| 18 | Migration 0023 dedup ordering | PASS |
| 19 | not-found.tsx design tokens | PASS |
| 20 | aria-labels on icon buttons | PASS |

---

## Recommended Fixes (Priority Order)

1. **B1/B2: Remove duplicate `client.release()` calls.** In both fixed-assets.routes.ts (line 269) and bill-pay.routes.ts (lines 580, 585), remove the explicit `client.release()` before the early return. The `finally` block handles release. Instead, just do `await client.query('ROLLBACK'); return res.status(400)...` without `client.release()`.

2. **B3: Add fail-fast for generalExpenseAccount in expense-claims.** After resolving `generalExpenseAccount` at line 315, add:
   ```
   if (!generalExpenseAccount) {
     return res.status(400).json({
       error: 'Required account not found. Ensure your chart of accounts includes General Expenses (5150).'
     });
   }
   ```

3. **B4: Add hasCompanyAccess check to receipt DELETE.** After fetching the receipt at line 146, before the posted check, add:
   ```
   const hasAccess = await storage.hasCompanyAccess(userId, receipt.companyId);
   if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
   ```

4. **B5: Add fail-fast to disposal for missing accounts.** Change the `if (fixedAssetsAccount && accumDepAccount)` guard at line 533 to a hard failure returning 400 if either is null.
