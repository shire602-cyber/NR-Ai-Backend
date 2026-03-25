# Change Plan

## 1. Plan Summary

22 atomic steps executed in strict order across 4 phases. Phase 1 (Steps 1–9) fixes critical accounting bugs: account codes constant, storage methods, numeric precision migration, transaction wrapping, balance sheet equation, trial balance endpoint. Phase 2 (Steps 10–14) recovers stranded modules: file copy, schema definitions, migration recovery, route registration. Phase 3 (Steps 15–19) adds missing features: recurring scheduler, e-commerce fix, report endpoints, exchange rates, cash flow fix. Phase 4 (Steps 20–22) adds test infrastructure and 40+ test cases. Each step is independently verifiable via `npx tsc --noEmit` or `npm run build`.

## 2. Preconditions

- Working directory: `/Users/arahm/Desktop/NR-Ai-Backend-fix/.claude/worktrees/nervous-wozniak/`
- Worktree source: `/Users/arahm/Desktop/NR-Ai-Backend-fix/.claude/worktrees/serene-stonebraker/` exists with 11 route files, 7 service files, 6 migrations
- `npm install` has been run (node_modules present)
- Branch `claude/nervous-wozniak` is checked out

## 3. Ordered Change Steps

---

### Step 1 — Create account-codes constant

#### Goal
Establish immutable account code mappings used by all subsequent steps.

#### Files Touched
- `server/lib/account-codes.ts` (NEW)

#### Planned Changes
- Create `server/lib/` directory if it doesn't exist
- Create `account-codes.ts` exporting `ACCOUNT_CODES` constant with codes matching `defaultChartOfAccounts.ts`:
  - `ACCOUNTS_RECEIVABLE: "1040"` (not 1020 — verified from defaultChartOfAccounts.ts line 53)
  - `PRODUCT_SALES: "4010"`
  - `SERVICE_REVENUE: "4020"`
  - `VAT_PAYABLE_OUTPUT: "2020"`
  - `VAT_RECEIVABLE_INPUT: "1050"`
  - `CASH: "1010"`
  - `ACCOUNTS_PAYABLE: "2010"`

#### Why This Step Exists
P1.2 — eliminates fragile string-based account lookups. Must exist before invoice route changes.

#### Risks
None — new file, no existing code affected.

#### Validation
- File exists with correct export
- `npx tsc --noEmit` (should not add errors since nothing imports it yet)

#### Tests
None yet — tested via integration in Step 3.

#### Reversibility
Delete the file.

---

### Step 2 — Add getAccountByCode to storage

#### Goal
Add storage method for code-based account resolution.

#### Files Touched
- `server/storage.ts`

#### Planned Changes
- Add to `IStorage` interface: `getAccountByCode(companyId: string, code: string): Promise<Account | undefined>`
- Add to `DatabaseStorage` class: implementation using `db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.code, code))).limit(1)`, returning first result or undefined

#### Why This Step Exists
P1.2 — required by Step 3 (invoice route fix).

#### Risks
LOW — additive method, no existing code changed.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
Tested in Step 3 integration and Phase 4 chart-of-accounts tests.

#### Reversibility
Remove the method from interface and class.

---

### Step 3 — Fix invoice account resolution + transaction wrapping

#### Goal
Replace string-based account lookups and wrap invoice creation + payment in transactions.

#### Files Touched
- `server/routes/invoices.routes.ts`

#### Planned Changes
- Add imports: `ACCOUNT_CODES` from `../lib/account-codes`, `db` from `../db`, `journalEntries`, `journalLines`, `invoices as invoicesTable`, `invoiceLines as invoiceLinesTable` from `../../shared/schema`
- **Invoice creation (lines 108–220)**: Wrap the entire block from invoice insert through journal line creation in `await (db as any).transaction(async (tx: any) => { ... })`. Replace `storage.getAccountsByCompanyId()` + `.find(nameEn ===)` with 3 individual `storage.getAccountByCode()` calls for AR (1040), Revenue (4010), VAT (2020). Use `tx.insert()` for journal entry and lines. Add guard: if AR or Revenue not found, throw error (rolls back tx). Add conditional: only create VAT line if `vatAmount > 0 && vatPayable`.
- **Invoice payment (lines 338–430)**: Same pattern — wrap in `db.transaction()`, replace `accounts.find(nameEn === 'Accounts Receivable')` at line 387 with `storage.getAccountByCode(companyId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)`. Use `tx.insert()` for journal entry and lines.
- Pass `tx` to `storage.generateEntryNumber()` (after Step 8 modifies it to accept tx).

#### Why This Step Exists
P1.2 (account resolution), P1.4 (invoice tx), P1.7 (payment tx).

#### Risks
MEDIUM — largest single change. Must preserve all existing response shapes.

#### Validation
- `npx tsc --noEmit` passes
- Zero instances of `nameEn ===` remain in this file

#### Tests
Covered by Phase 4: invoices.test.ts.

#### Reversibility
Revert the file from git.

---

### Step 4 — Wrap receipt posting in transaction

#### Goal
Make receipt posting atomic.

#### Files Touched
- `server/routes/receipts.routes.ts`

#### Planned Changes
- Add imports: `db` from `../db`, schema tables
- Wrap lines 195–256 (from entry creation through receipt update) in `await (db as any).transaction(async (tx: any) => { ... })`
- Use `tx.insert()` for journal entry and lines, `tx.update()` for receipt
- Remove the 6-line TODO comment at lines 195–200
- Pass `tx` to `storage.generateEntryNumber()` (anticipating Step 8)

#### Why This Step Exists
P1.5 — receipt posting must be atomic.

#### Risks
LOW — straightforward wrapping of existing sequential code.

#### Validation
- `npx tsc --noEmit` passes
- No TODO comment remains about transaction wrapping

#### Tests
Covered by Phase 4: receipts.test.ts, transaction-atomicity.test.ts.

#### Reversibility
Revert the file from git.

---

### Step 5 — Wrap journal reversal in transaction

#### Goal
Make journal reversal + void atomic.

#### Files Touched
- `server/routes/journal.routes.ts`

#### Planned Changes
- Add imports: `db` from `../db`, schema tables
- Wrap lines 300–336 (from entry number generation through void update) in `await (db as any).transaction(async (tx: any) => { ... })`
- Use `tx.insert()` for reversal entry and lines, `tx.update()` for voiding original
- Pass `tx` to `storage.generateEntryNumber()`

#### Why This Step Exists
P1.6 — journal reversal must be atomic.

#### Risks
LOW — straightforward wrapping.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
Covered by Phase 4: journal-entries.test.ts.

#### Reversibility
Revert the file from git.

---

### Step 6 — Fix balance sheet equation

#### Goal
Include net income in equity so A = L + E holds.

#### Files Touched
- `server/routes/dashboard.routes.ts`

#### Planned Changes
- After line 256 (equity array computed), add:
  - Calculate `incomeTotal` = sum of `balances.get(a.id)` for accounts where `a.type === 'income'`
  - Calculate `expenseTotal` = sum of `balances.get(a.id)` for accounts where `a.type === 'expense'`
  - `netIncome = incomeTotal - expenseTotal`
  - Push `{ accountName: "Current Period Earnings", amount: netIncome }` into `equity` array
- Modify `totalEquity` calculation to include netIncome (it already sums equity array, so the push handles it automatically — verify)

#### Why This Step Exists
P1.3 — the fundamental accounting equation must hold.

#### Risks
LOW — additive calculation, no existing logic removed.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
Covered by Phase 4: balance-sheet.test.ts.

#### Reversibility
Remove the 6 added lines.

---

### Step 7 — Add trial balance endpoint

#### Goal
Add the missing trial balance report.

#### Files Touched
- `server/routes/reports.routes.ts`

#### Planned Changes
- Add new endpoint `GET /api/reports/:companyId/trial-balance` at the top of the function (before cash-flow)
- Implementation: get all accounts for company, get all posted journal entries, for each entry get lines, accumulate per-account debit/credit totals. Return `{ accounts: [{accountId, accountName, accountCode, debitTotal, creditTotal}], grandTotalDebits, grandTotalCredits }`.
- Support optional `startDate` and `endDate` query params for date filtering.
- Use existing `authMiddleware` + `hasCompanyAccess()` pattern.

#### Why This Step Exists
P1.9 — trial balance is a fundamental accounting report.

#### Risks
LOW — additive endpoint.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
Covered by Phase 4: trial-balance.test.ts.

#### Reversibility
Remove the endpoint code block.

---

### Step 8 — Fix entry number atomicity

#### Goal
Prevent duplicate entry numbers under concurrent access.

#### Files Touched
- `server/storage.ts`

#### Planned Changes
- Modify `generateEntryNumber` signature to accept optional third parameter: `tx?: any`
- Replace the current implementation (lines 940–957) with:
  - Use `sql` tagged template from drizzle-orm
  - Execute `SELECT COUNT(*) as count FROM journal_entries WHERE company_id = ${companyId} AND entry_number LIKE ${prefix + '%'} FOR UPDATE` using `tx?.execute(...)` or `db.execute(...)` depending on whether tx is provided
  - Extract count from result, compute next number
  - Return formatted entry number

#### Why This Step Exists
P1.8 — prevents race condition on concurrent entry number generation.

#### Risks
LOW — the `FOR UPDATE` clause requires being inside a transaction to be meaningful; callers in Steps 3–5 already provide `tx`.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
Covered by Phase 4: concurrent-entry-numbers.test.ts.

#### Reversibility
Revert the method to its original implementation.

---

### Step 9 — Migrate monetary fields to numeric

#### Goal
Eliminate floating-point precision errors in all monetary fields.

#### Files Touched
- `shared/schema.ts`
- All route files that read/write monetary fields (cascading type fixes)

#### Planned Changes
- **schema.ts**: Add `import { numeric } from 'drizzle-orm/pg-core'` (if not already imported). For each monetary `real("column_name")` occurrence, replace with `numeric("column_name", { precision: 15, scale: 2 })`. Change corresponding `.default(0)` to `.default("0")`. Leave these as `real`: `aiConfidence`, `matchConfidence`, `confidenceLevel`, `value` in analyticsEvents, `avgDuration`, `conversionRate`, `errorRate`, vatRate fields.
- **Route/storage files**: Where numeric values are read from DB results and used in arithmetic or comparisons, wrap with `Number()`. Where values are written, ensure compatibility (Drizzle accepts both numbers and strings for numeric inserts). Fix any TypeScript errors that arise from the type change.

#### Why This Step Exists
P1.1 — the single most critical accounting bug. Placed after transaction/logic fixes so those steps work with the simpler `real` type first, then this step handles the type migration and cascading fixes in one pass.

#### Risks
HIGH — this will cause the most TypeScript errors. Must systematically fix all read/write sites. Run `npx tsc --noEmit` iteratively until zero errors.

#### Validation
- `npx tsc --noEmit` returns 0 errors
- `npm run build` succeeds
- `grep -c 'real(' shared/schema.ts` returns ~8 (only non-monetary fields)

#### Tests
Covered by Phase 4: monetary-precision.test.ts.

#### Reversibility
Revert shared/schema.ts and all cascading type fixes from git.

---

### Step 10 — Copy route files from worktree

#### Goal
Recover 11 route modules from the stranded worktree.

#### Files Touched
- `server/routes/admin-health.routes.ts` (NEW — copied)
- `server/routes/ai-gl.routes.ts` (NEW — copied)
- `server/routes/anomaly.routes.ts` (NEW — copied)
- `server/routes/auto-reconcile.routes.ts` (NEW — copied)
- `server/routes/bill-pay.routes.ts` (NEW — copied)
- `server/routes/budgets.routes.ts` (NEW — copied)
- `server/routes/cashflow.routes.ts` (NEW — copied)
- `server/routes/expense-claims.routes.ts` (NEW — copied)
- `server/routes/fixed-assets.routes.ts` (NEW — copied)
- `server/routes/month-end.routes.ts` (NEW — copied)
- `server/routes/payroll.routes.ts` (NEW — copied)

#### Planned Changes
- `cp` each file from `../../serene-stonebraker/server/routes/` to `server/routes/`
- Verify imports resolve (these routes use `pool` from `../db` — confirm it's exported)

#### Why This Step Exists
P2.1 — recover the 11 modules that were stranded.

#### Risks
MEDIUM — imports may reference things not available in this worktree. Fix as needed.

#### Validation
- All 11 files exist in `server/routes/`
- `npx tsc --noEmit` (may have errors until schema defs added in Step 12)

#### Tests
Functional validation deferred to Phase 4 module tests.

#### Reversibility
Delete the 11 copied files.

---

### Step 11 — Copy service files from worktree

#### Goal
Recover 7 service modules from the stranded worktree.

#### Files Touched
- `server/services/ai-learning.service.ts` (NEW — copied)
- `server/services/anomaly-detection.service.ts` (NEW — copied)
- `server/services/auto-reconcile.service.ts` (NEW — copied)
- `server/services/autonomous-gl.service.ts` (NEW — copied)
- `server/services/cashflow-forecast.service.ts` (NEW — copied)
- `server/services/month-end.service.ts` (NEW — copied)
- `server/services/wps-sif.service.ts` (NEW — copied)

#### Planned Changes
- `cp` each file from `../../serene-stonebraker/server/services/` to `server/services/`

#### Why This Step Exists
P2.2 — recover service files that route files depend on.

#### Risks
LOW — these are self-contained service modules.

#### Validation
- All 7 files exist in `server/services/`

#### Tests
Deferred to Phase 4.

#### Reversibility
Delete the 7 copied files.

---

### Step 12 — Add schema definitions for new modules

#### Goal
Define Drizzle schema tables for all recovered module tables.

#### Files Touched
- `shared/schema.ts`

#### Planned Changes
- Add `pgTable` definitions for: `employees`, `payrollRuns`, `payrollItems`, `vendorBills`, `billLineItems`, `billPayments`, `fixedAssets`, `budgetPlans`, `budgetLines`, `expenseClaims`, `expenseClaimItems`, `monthEndClose`, `autonomousGlRules`, `autonomousGlLogs`, `exchangeRates`
- All monetary fields use `numeric(15,2)` (consistent with Step 9)
- Add `createInsertSchema()` and type exports for each table
- Column names must match the SQL migration files (0009–0014)

#### Why This Step Exists
P2.4 — Drizzle ORM needs schema definitions to type-check queries against these tables.

#### Risks
MEDIUM — column names must exactly match migration SQL. Cross-reference with migration files.

#### Validation
- `npx tsc --noEmit` passes (or moves closer to zero errors)

#### Tests
Deferred to Phase 4.

#### Reversibility
Remove the added table definitions.

---

### Step 13 — Copy migration files from worktree

#### Goal
Recover 6 SQL migration files.

#### Files Touched
- `migrations/0010_add_payroll.sql` (NEW — copied and renumbered from 0009)
- `migrations/0011_add_bill_pay.sql` (NEW — from 0010)
- `migrations/0012_add_fixed_assets.sql` (NEW — from 0011)
- `migrations/0013_add_budgets.sql` (NEW — from 0012)
- `migrations/0014_add_expense_claims.sql` (NEW — from 0013)
- `migrations/0015_add_autonomous_gl.sql` (NEW — from 0014)

#### Planned Changes
- Copy each migration file, renumbering from 0009→0010, 0010→0011, etc. (shift +1 to leave gap for potential numeric migration)
- Keep SQL content unchanged

#### Why This Step Exists
P2.3 — these define the database tables that the recovered routes depend on.

#### Risks
LOW — SQL files are additive (CREATE TABLE IF NOT EXISTS).

#### Validation
- 6 new files exist in `migrations/` numbered 0010–0015
- Files contain valid SQL

#### Tests
N/A — SQL files are applied at deployment time.

#### Reversibility
Delete the 6 files.

---

### Step 14 — Register all recovered routes

#### Goal
Wire all recovered and new routes into the Express app.

#### Files Touched
- `server/routes.ts`

#### Planned Changes
- Add imports for 11 recovered route modules: `registerPayrollRoutes`, `registerFixedAssetsRoutes`, `registerBillPayRoutes`, `registerExpenseClaimsRoutes`, `registerBudgetRoutes`, `registerMonthEndRoutes`, `registerCashflowRoutes`, `registerAnomalyRoutes`, `registerAutoReconcileRoutes`, `registerAIGLRoutes`, `registerAdminHealthRoutes`
- Add registration calls in appropriate sections
- Also add import + registration for `registerExchangeRateRoutes` (created in Step 17)

#### Why This Step Exists
P2.5 — routes must be registered to be reachable.

#### Risks
MEDIUM — import names must match exact export names from each route file. Verify after copy.

#### Validation
- `npx tsc --noEmit` passes
- `npm run build` succeeds

#### Tests
Deferred to Phase 4.

#### Reversibility
Remove the added imports and registration calls.

---

### Step 15 — Add recurring invoice generation to scheduler

#### Goal
Auto-generate invoices from due recurring templates.

#### Files Touched
- `server/services/scheduler.service.ts`

#### Planned Changes
- Add `generateRecurringInvoices()` function that:
  - Calls `storage.getDueRecurringInvoices()` to get active templates with `nextRunDate <= now`
  - For each template: parse `linesJson`, create invoice + journal entry in `db.transaction()`, update `nextRunDate` based on frequency
- Add cron schedule (e.g., `cron.schedule('5 * * * *', ...)`) to call `generateRecurringInvoices()`
- Frequency calculation: weekly (+7 days), monthly (+1 month), quarterly (+3 months), yearly (+1 year)

#### Why This Step Exists
P3.1 — recurring invoice automation.

#### Risks
LOW — additive function. Cron only runs if scheduler is started.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
Covered by Phase 4: recurring-invoices.test.ts.

#### Reversibility
Remove the added function and cron schedule.

---

### Step 16 — Fix e-commerce crash

#### Goal
Add missing storage method that causes runtime crash.

#### Files Touched
- `server/storage.ts`
- `server/routes/analytics.routes.ts`

#### Planned Changes
- Add `getEcommerceIntegrationById(id: string)` to `IStorage` and `DatabaseStorage`: `db.select().from(ecommerceIntegrations).where(eq(ecommerceIntegrations.id, id)).limit(1)`, return first or undefined
- In `analytics.routes.ts`, find the call to `storage.getEcommerceIntegration(id)` and replace with `storage.getEcommerceIntegrationById(id)`

#### Why This Step Exists
P3.2 — fixes runtime crash when viewing e-commerce analytics.

#### Risks
LOW — additive storage method + one-line call site fix.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
N/A — e-commerce integration requires external setup.

#### Reversibility
Remove the method and revert call site.

---

### Step 17 — Add report endpoints (GL, equity changes) + exchange rates

#### Goal
Add 3 missing report endpoints and exchange rate CRUD.

#### Files Touched
- `server/routes/reports.routes.ts`
- `server/routes/exchange-rates.routes.ts` (NEW)

#### Planned Changes
- **reports.routes.ts**: Add 2 new endpoints:
  - `GET /api/reports/:companyId/general-ledger` — returns all accounts with journal lines and running balances, supports date range filter
  - `GET /api/reports/:companyId/equity-changes` — returns opening equity, net income (income − expense), distributions, closing equity for a period
- **exchange-rates.routes.ts** (NEW): CRUD endpoints:
  - `GET /api/companies/:companyId/exchange-rates` — list rates
  - `POST /api/companies/:companyId/exchange-rates` — create rate
  - `PUT /api/companies/:companyId/exchange-rates/:id` — update rate
  - `DELETE /api/companies/:companyId/exchange-rates/:id` — delete rate
  - All with `authMiddleware` + `hasCompanyAccess()`

#### Why This Step Exists
P3.3, P3.4, P3.5 — fill critical report and feature gaps.

#### Risks
LOW — additive endpoints.

#### Validation
- `npx tsc --noEmit` passes

#### Tests
N/A for GL/equity — tested via inspection. Exchange rate CRUD is straightforward.

#### Reversibility
Remove added endpoints/file.

---

### Step 18 — Fix cash flow report

#### Goal
Separate cash flow into operating, investing, and financing activities.

#### Files Touched
- `server/routes/reports.routes.ts`

#### Planned Changes
- In the existing cash-flow endpoint, classify account-level cash flows by type:
  - Operating: income and expense accounts (types 'income', 'expense')
  - Investing: fixed asset accounts (subtype containing 'fixed' or account codes 1210–1240)
  - Financing: equity and long-term liability accounts (types 'equity', codes 2210+)
- Return `{ operating: { inflows, outflows, net }, investing: { ... }, financing: { ... }, netCashFlow }`

#### Why This Step Exists
P3.6 — IAS 7 requires 3-section cash flow statement.

#### Risks
LOW — modifies return shape of existing endpoint. Frontend may need adjustment (out of scope).

#### Validation
- `npx tsc --noEmit` passes

#### Tests
N/A — report structure verified by inspection.

#### Reversibility
Revert the cash-flow endpoint changes.

---

### Step 19 — Add exchange rate storage methods + register route

#### Goal
Wire exchange rate CRUD into storage and route registration.

#### Files Touched
- `server/storage.ts`
- `server/routes.ts` (if not already done in Step 14)

#### Planned Changes
- Add to storage: `getExchangeRatesByCompanyId`, `getExchangeRate`, `createExchangeRate`, `updateExchangeRate`, `deleteExchangeRate`
- Ensure exchange-rates route is registered in routes.ts (may already be done in Step 14)

#### Why This Step Exists
P3.5 — exchange rate persistence layer.

#### Risks
LOW — additive methods.

#### Validation
- `npx tsc --noEmit` passes
- `npm run build` succeeds

#### Tests
N/A — CRUD methods are straightforward.

#### Reversibility
Remove the added methods.

---

### Step 20 — Create test infrastructure

#### Goal
Set up Vitest configuration and test helpers.

#### Files Touched
- `vitest.config.ts` (NEW)
- `tests/helpers.ts` (NEW)

#### Planned Changes
- **vitest.config.ts**: Configure with `globals: true`, `setupFiles: ['./tests/setup.ts']`, `include: ['tests/**/*.test.ts']`, `testTimeout: 30000`
- **tests/helpers.ts**: Export `TestContext` type, `createTestContext(prefix: string)` that creates user + company + default accounts via storage, and `cleanupTestContext(ctx)` that deletes them. Also re-export `storage` and `db` for test use.

#### Why This Step Exists
P4.1 — test infrastructure must exist before test files.

#### Risks
LOW — new files only.

#### Validation
- `npx tsc --noEmit` passes
- `npm test` runs (may have 0 test files found initially)

#### Tests
Self-validating — this IS the test infrastructure.

#### Reversibility
Delete both files.

---

### Step 21 — Write core accounting and integrity tests

#### Goal
Create test files for critical accounting logic and data integrity.

#### Files Touched (all NEW)
- `tests/accounting/journal-entries.test.ts` (~5 tests)
- `tests/accounting/invoices.test.ts` (~4 tests)
- `tests/accounting/receipts.test.ts` (~3 tests)
- `tests/accounting/trial-balance.test.ts` (~3 tests)
- `tests/accounting/balance-sheet.test.ts` (~3 tests)
- `tests/accounting/chart-of-accounts.test.ts` (~3 tests)
- `tests/integrity/monetary-precision.test.ts` (~3 tests)
- `tests/integrity/transaction-atomicity.test.ts` (~2 tests)
- `tests/integrity/concurrent-entry-numbers.test.ts` (~1 test)

#### Planned Changes
- Each file: `import { createTestContext, cleanupTestContext, storage } from '../helpers'`
- `beforeAll`: create test context. `afterAll`: cleanup.
- Tests use `storage.*` methods directly (integration-style, not HTTP-level).
- Key assertions:
  - Journal: debit=credit, posted immutability, void lifecycle, reversal creates mirror entry
  - Invoices: 3-line journal for VAT invoice, 2-line for 0% VAT, payment clears AR
  - Receipts: posting creates journal, rollback on failure
  - Trial balance: grand totals equal, per-account correct
  - Balance sheet: A = L + E with net income
  - Chart of accounts: code-based lookup returns correct account
  - Precision: `0.1 * 10 === 1.00` at DB level, `333.33 * 3 === 999.99`
  - Atomicity: FK violation inside tx rolls back all changes
  - Entry numbers: concurrent calls produce unique numbers

#### Why This Step Exists
P4.2, P4.4 — core accounting must be tested.

#### Risks
MEDIUM — tests require DATABASE_URL. Integration tests may fail in CI without DB.

#### Validation
- `npm test` — unit tests pass, integration tests at least compile

#### Tests
Self-validating.

#### Reversibility
Delete the 9 test files.

---

### Step 22 — Write module tests

#### Goal
Create test files for recovered modules.

#### Files Touched (all NEW)
- `tests/modules/payroll.test.ts` (~3 tests)
- `tests/modules/fixed-assets.test.ts` (~3 tests)
- `tests/modules/bill-pay.test.ts` (~3 tests)
- `tests/modules/expense-claims.test.ts` (~4 tests)
- `tests/modules/recurring-invoices.test.ts` (~3 tests)

#### Planned Changes
- Module tests use raw SQL via `db.execute(sql\`...\`)` since these modules use `pool.query()` pattern
- Test CRUD operations: create, read, update for each module
- Recurring invoices: test template creation, due detection, frequency calculation

#### Why This Step Exists
P4.3 — module functionality must be verified.

#### Risks
MEDIUM — raw SQL tests depend on migration tables existing. Some tests may need to be structured as unit tests for frequency calculation logic.

#### Validation
- `npm test` runs all tests
- At least 40 total `it()` blocks across all test files
- `npx tsc --noEmit` returns 0 errors

#### Tests
Self-validating.

#### Reversibility
Delete the 5 test files.

---

## 4. Files Not To Touch

- `server/db.ts` — no changes to database connection
- `server/middleware/auth.ts` — existing auth unchanged
- `server/middleware/errorHandler.ts` — existing error handling unchanged
- `server/defaultChartOfAccounts.ts` — account definitions unchanged
- `package.json` — no new dependencies
- `client/` — no frontend changes
- `server/routes/admin.routes.ts` — unrelated, 993 lines, do not touch
- `server/routes/ai.routes.ts` — unrelated, ~1700 lines, do not touch

## 5. Dependency Policy

**No new dependencies allowed.** All implementation uses existing packages:
- `drizzle-orm` 0.39.1 (numeric type support, sql tagged templates, transactions)
- `vitest` 3.0.0 (test framework)
- `node-cron` 4.2.1 (scheduler)
- `zod` 3.24.2 (schema validation)

## 6. Implementation Guardrails

- No speculative refactoring — only changes required by acceptance criteria
- No rename churn — existing variable/function names preserved unless broken
- No unrelated cleanup — pre-existing tech debt (as any, large files) left untouched
- No behavior changes beyond acceptance criteria — existing API response shapes preserved
- No TODO markers — all work must be complete
- No skipping failure paths — every transaction must have error handling
- Worktree routes accepted as-is — do not refactor pool.query() to Drizzle
- All `numeric` field reads must be wrapped with `Number()`, writes with `String()` where needed
- All `numeric` defaults must be string literals: `.default("0")` not `.default(0)`

## 7. Completion Criteria

All of the following must be true:
1. `npx tsc --noEmit` returns 0 errors
2. `npm run build` succeeds (produces dist/index.js)
3. `npm test` runs successfully (vitest finds and executes tests)
4. Zero instances of `nameEn ===` for account lookup in invoices.routes.ts
5. Zero instances of monetary `real(` in schema.ts (only ~8 non-monetary remain)
6. All 4 transaction sites wrapped in `db.transaction()`
7. `generateEntryNumber` uses `FOR UPDATE` and accepts `tx` parameter
8. Balance sheet includes "Current Period Earnings" in equity
9. Trial balance endpoint exists and returns debit/credit totals
10. 11 recovered route files + 7 service files + 6 migrations present
11. All recovered routes registered in routes.ts
12. At least 40 test cases across 14 test files
13. Exchange rates CRUD endpoint exists and is registered

## 8. Planning Decision

# READY FOR IMPLEMENTATION
