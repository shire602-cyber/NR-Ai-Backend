# Task Contract

## 1. Objective

Fix all critical accounting bugs and feature gaps in the Muhasib.ai backend, transforming it from a visually complete but accounting-broken prototype into a production-grade double-entry accounting system. This covers 4 phases: critical accounting fixes, module recovery, feature completion, and test infrastructure.

## 2. Business Context

A comprehensive audit of Muhasib.ai revealed that while the platform has 280+ endpoints and 75+ frontend pages, the core accounting engine has critical bugs that would produce incorrect financial statements in production. No real business can trust their books to software with float-precision money, silent journal entry failures, a broken balance sheet equation, and missing basic reports. These fixes are required before any customer deployment.

## 3. In-Scope Behavior

### Phase 1 — Critical Accounting Fixes

**P1.1 — Monetary Precision Migration**
- Migrate all monetary `real` (float32) fields in `shared/schema.ts` to `numeric(15,2)`
- 115 total `real()` occurrences exist; approximately 107 are monetary (amounts, prices, costs, totals, salaries, balances, debits, credits, subtotals, VAT amounts)
- Approximately 8 are non-monetary and must remain `real`: `aiConfidence`, `matchConfidence`, `confidenceLevel`, `value` in analytics events, `avgDuration`, `conversionRate`, `errorRate`, plus `vatRate` fields (percentage 0–1 decimal)
- All downstream code that reads/writes these fields must handle the type change (Drizzle returns `numeric` as strings)

**P1.2 — Account Code Resolution**
- Create `server/lib/account-codes.ts` with immutable `ACCOUNT_CODES` constant mapping logical names to account code strings (e.g., `ACCOUNTS_RECEIVABLE: "1020"`, `PRODUCT_SALES: "4010"`, `VAT_PAYABLE_OUTPUT: "2020"`)
- Add `getAccountByCode(companyId: string, code: string)` method to `IStorage` interface and `DatabaseStorage` class in `server/storage.ts`
- Replace all 4 string-based lookups in `invoices.routes.ts` (lines 165–167, 387) from `nameEn === 'Accounts Receivable'` etc. to `getAccountByCode(companyId, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)`
- Zero-VAT invoices (vatAmount === 0 OR no VAT account) must produce 2-line journal entries (AR debit, Revenue credit) instead of 3-line

**P1.3 — Balance Sheet Equation**
- In `dashboard.routes.ts` balance sheet endpoint (lines 199–270), calculate net income (sum of income accounts minus sum of expense accounts) and include it in the equity section as "Current Period Earnings"
- After fix: `totalAssets === totalLiabilities + totalEquity` must hold

**P1.4 — Transaction Safety: Invoice Creation**
- Wrap invoice creation + journal entry creation in `db.transaction()` in `invoices.routes.ts`
- All operations (create invoice, create journal entry, create journal lines) must use the transaction's `tx` parameter

**P1.5 — Transaction Safety: Receipt Posting**
- Wrap receipt posting + journal entry creation in `db.transaction()` in `receipts.routes.ts` (lines 136–260)
- Remove the TODO comment at line 195

**P1.6 — Transaction Safety: Journal Reversal**
- Wrap journal reversal + void in `db.transaction()` in `journal.routes.ts` (lines 278–345)
- All operations (create reversal entry, create reversed lines, mark original void) must be atomic

**P1.7 — Transaction Safety: Invoice Payment**
- Wrap invoice payment recording + journal entry in `db.transaction()` in `invoices.routes.ts`

**P1.8 — Entry Number Atomicity**
- Change `generateEntryNumber` in `storage.ts` (lines 940–957) to use `SELECT COUNT(*) FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`
- Add optional `tx` parameter so callers within transactions can pass the transaction object
- All callers in transaction-wrapped routes must pass `tx`

**P1.9 — Trial Balance Endpoint**
- Add `GET /api/reports/:companyId/trial-balance` in `reports.routes.ts`
- Returns per-account debit total, credit total for all posted journal entries
- Supports optional `startDate` and `endDate` query parameters
- Grand total debits must equal grand total credits

## Phase 2 — Module Integration

**P2.1 — Route File Recovery**
- Copy 11 route files from `.claude/worktrees/serene-stonebraker/server/routes/` to `server/routes/`:
  - `admin-health.routes.ts`, `ai-gl.routes.ts`, `anomaly.routes.ts`, `auto-reconcile.routes.ts`, `bill-pay.routes.ts`, `budgets.routes.ts`, `cashflow.routes.ts`, `expense-claims.routes.ts`, `fixed-assets.routes.ts`, `month-end.routes.ts`, `payroll.routes.ts`

**P2.2 — Service File Recovery**
- Copy 7 service files from `.claude/worktrees/serene-stonebraker/server/services/` to `server/services/`:
  - `ai-learning.service.ts`, `anomaly-detection.service.ts`, `auto-reconcile.service.ts`, `autonomous-gl.service.ts`, `cashflow-forecast.service.ts`, `month-end.service.ts`, `wps-sif.service.ts`

**P2.3 — Migration Recovery**
- Copy 6 migration files from `.claude/worktrees/serene-stonebraker/migrations/` to `migrations/`:
  - `0009_add_payroll.sql` through `0014_add_autonomous_gl.sql`
  - Renumber if needed to avoid conflicts (current last is 0008)

**P2.4 — Schema Definitions**
- Add `pgTable` definitions in `shared/schema.ts` for all new module tables: `employees`, `payrollRuns`, `payrollItems`, `vendorBills`, `billLineItems`, `billPayments`, `fixedAssets`, `budgetPlans`, `budgetLines`, `expenseClaims`, `expenseClaimItems`, `monthEndClose`, `autonomousGlRules`, `autonomousGlLogs`, `exchangeRates`
- Add corresponding `createInsertSchema` for each

**P2.5 — Route Registration**
- Register all 11 recovered routes in `server/routes.ts`

### Phase 3 — Feature Completion

**P3.1 — Recurring Invoice Scheduler**
- Add cron job in `server/services/scheduler.service.ts` that runs periodically
- Queries `getDueRecurringInvoices()` → generates invoices + journal entries in transaction → updates `nextRunDate`

**P3.2 — E-commerce Crash Fix**
- Add `getEcommerceIntegrationById(id)` to `IStorage` and `DatabaseStorage` in `storage.ts`
- Fix the call site in `analytics.routes.ts`

**P3.3 — General Ledger Endpoint**
- Add `GET /api/reports/:companyId/general-ledger` in `reports.routes.ts`
- Returns all accounts with their journal lines and running balances

**P3.4 — Statement of Changes in Equity Endpoint**
- Add `GET /api/reports/:companyId/equity-changes` in `reports.routes.ts`
- Returns opening equity, net income, distributions, closing equity

**P3.5 — Exchange Rates**
- Add `exchangeRates` table to `shared/schema.ts` (if not already covered by P2.4)
- Add `server/routes/exchange-rates.routes.ts` with full CRUD
- Register in `server/routes.ts`

**P3.6 — Cash Flow Report Fix**
- Fix cash flow report in `reports.routes.ts` to properly separate operating, investing, and financing activities based on account subtypes

### Phase 4 — Testing

**P4.1 — Test Infrastructure**
- Create `tests/helpers.ts` with `createTestContext()` and `cleanupTestContext()` for isolated test data
- Configure `vitest.config.ts` with globals enabled and setup file

**P4.2 — Core Accounting Tests (minimum 20 tests)**
- Journal entries: create, post, void, reverse, debit=credit validation
- Invoices: create with journal, 0% VAT 2-line journal, payment recording
- Receipts: post with journal, rollback on failure
- Trial balance: totals, debits=credits
- Balance sheet: A=L+E with net income
- Chart of accounts: default creation, code-based lookup

**P4.3 — Module Tests (minimum 10 tests)**
- Payroll: employee CRUD, payroll run
- Fixed assets: CRUD, depreciation
- Bill pay: CRUD, payment
- Expense claims: CRUD, approval workflow
- Recurring invoices: template creation, due detection, frequency calculation

**P4.4 — Integrity Tests (minimum 10 tests)**
- Monetary precision: 0.1 * 10 = 1.00, not 0.9999...
- Transaction atomicity: rollback on FK violation
- Concurrent entry numbers: no duplicates

## 4. Out-of-Scope / Non-Goals

- Frontend changes (this is backend-only)
- Live bank feed integration
- IFRS 9, IFRS 16, IAS 21 full implementation (multi-currency conversion beyond exchange rate storage)
- ESLint configuration
- npm audit vulnerability fixes
- Refactoring worktree routes from `pool.query()` to Drizzle ORM (accepted as-is)
- Performance index additions (separate task)
- i18n-extended.ts integration (frontend task)
- API documentation / OpenAPI spec
- Dark mode

## 5. Inputs

- Current codebase at `/Users/arahm/Desktop/NR-Ai-Backend-fix/.claude/worktrees/nervous-wozniak/`
- Stranded worktree at `/Users/arahm/Desktop/NR-Ai-Backend-fix/.claude/worktrees/serene-stonebraker/`
- Default chart of accounts in `server/defaultChartOfAccounts.ts`
- Existing 24 registered routes in `server/routes.ts`
- Existing 3 test files in `tests/`

## 6. Outputs

- Modified `shared/schema.ts` with `numeric(15,2)` monetary fields + new table definitions
- New `server/lib/account-codes.ts`
- Modified `server/storage.ts` with `getAccountByCode()`, `getEcommerceIntegrationById()`, atomic `generateEntryNumber()`
- Modified `server/routes/invoices.routes.ts` with code-based lookups + transactions
- Modified `server/routes/receipts.routes.ts` with transaction wrapping
- Modified `server/routes/journal.routes.ts` with transaction wrapping
- Modified `server/routes/dashboard.routes.ts` with balance sheet equation fix
- Modified `server/routes/reports.routes.ts` with trial balance, general ledger, equity changes, cash flow fix
- New `server/routes/exchange-rates.routes.ts`
- 11 recovered route files in `server/routes/`
- 7 recovered service files in `server/services/`
- 6 recovered migration files in `migrations/`
- Modified `server/routes.ts` with all new route registrations
- 14+ new test files in `tests/` with 40+ test cases
- `vitest.config.ts` and `tests/helpers.ts`
- Zero TypeScript errors (`npx tsc --noEmit`)
- Successful build (`npm run build`)

## 7. Constraints

- **No new dependencies** — Use only existing packages (drizzle-orm, vitest, node-cron, etc.)
- **Backward compatible** — Existing API contracts must not break; new endpoints are additive
- **PostgreSQL only** — All SQL must work on PostgreSQL (Neon + standard pg)
- **Company isolation** — Every new endpoint must check `hasCompanyAccess()`
- **Auth middleware** — Every new protected endpoint must use `authMiddleware`
- **Drizzle ORM** — New storage methods must use Drizzle, not raw SQL (exception: recovered worktree routes that already use `pool.query()` are accepted as-is)
- **`db` is typed as `any`** — Due to dynamic Neon/pg import pattern in db.ts; transaction callbacks need `(tx: any)`

## 8. Invariants

- **Accounting equation**: Assets = Liabilities + Equity (including net income in equity)
- **Double-entry balance**: Every journal entry's total debits === total credits
- **Journal immutability**: Posted entries cannot be modified, only reversed
- **Company isolation**: No cross-company data access
- **Entry number uniqueness**: No duplicate entry numbers within a company
- **Monetary precision**: All monetary values stored as `numeric(15,2)`, never float
- **Transaction atomicity**: All multi-step accounting operations are atomic (all succeed or all fail)

## 9. Edge Cases

- Zero-VAT invoice → 2-line journal entry (no VAT line)
- Missing chart of accounts → 500 error with clear message (not silent failure)
- Receipt posting failure mid-transaction → full rollback, receipt stays unposted
- Concurrent entry number generation → no duplicates (FOR UPDATE lock)
- `numeric` columns returned as strings by Drizzle → `Number()` wrapping on reads, `String()` on writes
- Default values for `numeric` columns must be string literals (`.default("0")` not `.default(0)`)
- Inactive recurring invoice templates → excluded from auto-generation
- System accounts → protected from deletion
- Company with no journal entries → trial balance returns empty with zero totals
- Balance sheet with only void entries → shows zeros

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `numeric` migration causes TypeScript errors across codebase | HIGH | HIGH | Systematically fix all read/write sites; Drizzle returns strings for numeric |
| Worktree route files have incompatible imports | MEDIUM | MEDIUM | Verify imports after copy; fix as needed |
| `db.transaction()` callback typing issues | MEDIUM | LOW | Use `(tx: any)` pattern consistent with existing codebase |
| Test setup fails without DATABASE_URL | HIGH | MEDIUM | Design tests to work with real DB; document prerequisite |
| Recovered migrations conflict with existing schema | LOW | HIGH | Verify table names don't conflict; renumber if needed |

## 11. Acceptance Criteria

### Phase 1 — Critical Fixes
- **AC-1.1**: All monetary `real` fields in schema.ts are `numeric(15,2)`. Only non-monetary fields (aiConfidence, matchConfidence, confidenceLevel, analytics value, avgDuration, conversionRate, errorRate) remain `real`.
- **AC-1.2**: `server/lib/account-codes.ts` exists with `ACCOUNT_CODES` constant. `invoices.routes.ts` uses `getAccountByCode()` — zero instances of `nameEn ===` for account lookup.
- **AC-1.3**: Zero-VAT invoices produce exactly 2 journal lines (no VAT line).
- **AC-1.4**: Balance sheet endpoint includes net income in equity. `totalAssets === totalLiabilities + totalEquity` holds.
- **AC-1.5**: Invoice creation + journal entry wrapped in `db.transaction()`.
- **AC-1.6**: Receipt posting + journal entry wrapped in `db.transaction()`.
- **AC-1.7**: Journal reversal + void wrapped in `db.transaction()`.
- **AC-1.8**: Invoice payment + journal entry wrapped in `db.transaction()`.
- **AC-1.9**: `generateEntryNumber` uses `SELECT ... FOR UPDATE` and accepts optional `tx` parameter.
- **AC-1.10**: `GET /api/reports/:companyId/trial-balance` returns per-account debit/credit totals. Grand total debits === credits.
- **AC-1.11**: `npm run build` succeeds with zero errors.

### Phase 2 — Module Integration
- **AC-2.1**: 11 route files from serene-stonebraker exist in `server/routes/`.
- **AC-2.2**: 7 service files from serene-stonebraker exist in `server/services/`.
- **AC-2.3**: 6 migration files (0009–0014 or renumbered equivalents) exist in `migrations/`.
- **AC-2.4**: All new module tables have `pgTable` definitions in `shared/schema.ts`.
- **AC-2.5**: All 11 recovered routes are registered in `server/routes.ts`.
- **AC-2.6**: `npm run build` succeeds after integration.

### Phase 3 — Feature Completion
- **AC-3.1**: Recurring invoice scheduler generates invoices from due templates.
- **AC-3.2**: `getEcommerceIntegrationById` exists in storage.ts and is called correctly.
- **AC-3.3**: `GET /api/reports/:companyId/general-ledger` returns account entries with running balances.
- **AC-3.4**: `GET /api/reports/:companyId/equity-changes` returns equity movement summary.
- **AC-3.5**: `server/routes/exchange-rates.routes.ts` has CRUD endpoints and is registered.
- **AC-3.6**: Cash flow report separates operating, investing, and financing activities.
- **AC-3.7**: `npm run build` succeeds after all features added.

### Phase 4 — Testing
- **AC-4.1**: `npm test` runs successfully (vitest configured with globals).
- **AC-4.2**: At least 40 test cases exist across 10+ test files.
- **AC-4.3**: Tests cover: journal entries, invoices, receipts, trial balance, balance sheet, chart of accounts, monetary precision, transaction atomicity, entry numbers, payroll, fixed assets, bill pay, expense claims, recurring invoices.
- **AC-4.4**: `npx tsc --noEmit` produces zero errors.

## 12. Observability Requirements

- All accounting operation failures must log with `console.error` including operation name, companyId, and error details
- Transaction rollbacks must be logged
- Missing account lookups must return 500 with descriptive error message (not silent failure)
- Entry number generation lock contention should be visible in logs

## 13. Open Questions

None — all requirements are fully specified based on the audit findings and codebase scan.

## 14. Codebase Context Snapshot

### Affected Modules and Files
| File | Lines | Status | Changes Needed |
|------|-------|--------|---------------|
| `shared/schema.ts` | ~2700 | 115 `real()` fields | Migrate ~107 to `numeric(15,2)`, add 15+ new tables |
| `server/storage.ts` | ~2800 | Core data layer | Add `getAccountByCode`, `getEcommerceIntegrationById`, fix `generateEntryNumber` |
| `server/routes/invoices.routes.ts` | ~647 | 4 string lookups | Replace with code-based, wrap in transactions |
| `server/routes/receipts.routes.ts` | ~261 | TODO at line 195 | Wrap posting in transaction |
| `server/routes/journal.routes.ts` | ~385 | No transaction | Wrap reversal in transaction |
| `server/routes/dashboard.routes.ts` | ~418 | Balance sheet broken | Add net income to equity |
| `server/routes/reports.routes.ts` | ~271 | 3 endpoints only | Add trial balance, GL, equity changes, fix cash flow |
| `server/routes.ts` | ~120 | 24 routes registered | Add 12 new registrations |

### Existing Patterns
- Routes: Express Router + `asyncHandler` wrapper + `authMiddleware` + `storage.hasCompanyAccess()`
- Storage: Drizzle ORM queries in `DatabaseStorage` class implementing `IStorage` interface
- Schema: `pgTable()` + `createInsertSchema()` from drizzle-zod
- Tests: Vitest with `describe/it/expect` pattern
- Worktree routes (to be recovered): Use `pool.query()` raw SQL pattern instead of Drizzle

### Pre-existing Tech Debt
- `db` export typed as `any` (dynamic Neon/pg import)
- No ESLint config (lint script non-functional)
- 17 npm audit vulnerabilities (1 critical, 4 high)
- Large files: storage.ts ~2800 lines, ai.routes.ts ~1700 lines
- `as any` used in 30+ places throughout codebase

### Current Test Coverage Baseline
- 3 test files: `tests/setup.ts`, `tests/unit/env.test.ts`, `tests/unit/middleware.test.ts`
- No accounting logic tests
- No integration tests

### Relevant Dependency State
- `drizzle-orm`: 0.39.1 (supports `numeric` with precision/scale)
- `vitest`: 3.0.0
- `express`: 4.21.2
- `pg`: 8.20.0
- `node-cron`: 4.2.1
- `zod`: 3.24.2

## 15. Contract Version

**v1.0** — 2026-03-20

## 16. Readiness Decision

# READY FOR DESIGN
