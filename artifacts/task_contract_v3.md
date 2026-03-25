# Task Contract v3 — Comprehensive Audit Fix

## 1. Objective

Fix all 28 issues identified by the 6-agent comprehensive audit of Muhasib.ai. Issues span five categories: critical accounting logic (C1–C13), access control (H1–H7), data integrity (M1–M5), and frontend quality (F1–F3). Every fix must preserve existing passing tests (125/125) and maintain build stability.

## 2. Business Context

Muhasib.ai is a UAE-focused accounting platform targeting competitive parity with QuickBooks Online, Zoho Books, and Sage. The audit found that while the architecture is sound, critical gaps exist: monetary columns use float32 in the actual database, several modules create no journal entries (payroll, expense claims, depreciation, disposal), access controls are missing on multiple routes, and route registrations are incomplete. These gaps make the system unsuitable for production use — financial data could be silently corrupted, unauthorized users could access other companies' data, and the general ledger would be incomplete.

## 3. In-Scope Behavior

### Group A: Database Schema Integrity
- **C1**: Create migration 0022 that ALTERs ALL monetary columns from `real` to `numeric(15,2)` (or appropriate precision). Covers ~107 columns across ~22 tables.
- **C13**: Verify fiscalYears, creditNotes, creditNoteLines pgTable definitions exist in shared/schema.ts (scan confirmed they DO exist in worktree — validate they match migration DDL).

### Group B: Route Registration
- **C2**: Import and register `registerCreditNoteRoutes` in server/routes.ts.
- **C3**: Import and register `registerFiscalYearRoutes` in server/routes.ts.

### Group C: Missing Journal Entries (Accounting Completeness)
- **C5**: Payroll approval must create JE: Debit Salary Expense (5010) + allowance accounts, Credit Salaries Payable (2030). Add SALARY_EXPENSE and SALARIES_PAYABLE to ACCOUNT_CODES.
- **C8**: Asset disposal must create JE: Debit Cash/Bank (proceeds), Debit Accumulated Depreciation (1240), Credit Fixed Asset cost account, Debit/Credit Gain or Loss on Disposal. Add GAIN_ON_DISPOSAL and LOSS_ON_DISPOSAL to ACCOUNT_CODES if not in default COA — otherwise use existing "Other Income"/"Other Expense" codes.
- **C10**: Receipt posting must split VAT: Debit Expense (net amount), Debit VAT Receivable Input (1050) for vatAmount, Credit Payment Account (total).
- **C11**: Expense claim approval must create JE: Debit Expense per line item, Debit VAT Input (1050) if vatAmount > 0, Credit Accounts Payable (2010).

### Group D: Accounting Safety Guards
- **C4**: Bill approval must REJECT if any line item has null/missing account_id. Return 400 with clear error.
- **C6**: Invoice DELETE must reject if associated JE is posted. Invoice UPDATE must reject if associated JE is posted (only allow updating draft invoices).
- **C7**: Bill payment must FAIL (rollback) if AP account (2010) or Bank account (1020) is not found. Do not record payment without JE.
- **C9**: Depreciation must FAIL if Depreciation Expense (5100) or Accumulated Depreciation (1240) account is not found. Do not update asset without JE.
- **C12**: Fiscal year close must NOT use `line_order` column if it doesn't exist in journal_lines schema. Use the existing column ordering or remove the column reference.
- **M4**: Prevent hard deletion of posted journal entries, paid invoices, and posted receipts. Return 400 with reason.
- **M5**: Autonomous GL service — if entries are auto-posted (status='posted'), add fiscal year guard check before posting. Scan confirmed entries go to ai_gl_queue first (draft workflow preserved), but the accept/post path in ai-gl.routes.ts should include fiscal year guard.

### Group E: Access Control
- **H1**: Add `requireCustomer` to ALL dashboard endpoints. Add `hasCompanyAccess()` check to: expense-breakdown, monthly-trends, P&L, balance sheet, VAT summary endpoints.
- **H2**: Add company access verification to VAT submit and PATCH endpoints. Look up the VAT return, get its companyId, call `hasCompanyAccess()`.
- **H3**: Add company access verification to corporate tax GET single and PATCH endpoints.
- **H4**: Replace `openai!` non-null assertions with null check that returns 503 `{ error: "AI service unavailable" }`.
- **H5**: Add `requireCustomer` to receipt POST create endpoint.
- **H6**: Add ownership verification to receipt PUT update — look up receipt, get companyId, call `hasCompanyAccess()`.
- **H7**: Add `hasCompanyAccess()` to portal document delete, compliance task CRUD endpoints.

### Group F: Data Integrity Constraints (Migration)
- **M1**: Add unique constraint on company_users(company_id, user_id) via migration.
- **M2**: Add unique constraint on invoices(company_id, number) and journal_entries(company_id, entry_number) via migration.
- **M3**: Add indexes via migration: journal_lines(entry_id), journal_lines(account_id), invoices(company_id, status), receipts(company_id), company_users(user_id).

### Group G: Frontend Fixes
- **F1**: Remove all console.log statements from client/src/pages/ production code (if any remain after prior fixes).
- **F2**: Replace hardcoded colors in not-found.tsx (bg-gray-50, text-gray-900, text-gray-600, text-red-500) with design tokens (bg-background, text-foreground, text-muted-foreground, text-destructive).
- **F3**: Add aria-labels to icon-only buttons across key pages: Journal (delete, reverse buttons), Invoices (delete, edit buttons), Dashboard (action cards), and any other icon-only interactive elements in ChartOfAccounts, Receipts.

## 4. Out-of-Scope / Non-Goals

- **No new features**: Only fix identified issues.
- **No frontend refactoring**: God-component decomposition (Receipts 1781 lines, etc.) is out of scope — it's a separate project.
- **No `any` type cleanup**: 316 occurrences — too broad, separate effort.
- **No N+1 query optimization**: getAccountsWithBalances() perf fix is out of scope.
- **No bank feed integration**: No Plaid/Open Banking.
- **No mobile app**: PWA improvements out of scope.
- **No IFRS modules**: Leases (IFRS 16), Impairment (IAS 36), Provisions (IAS 37), Intangibles (IAS 38) are future work.
- **No sub-account hierarchy**.
- **No animation/sidebar cleanup**.
- **Do not modify test infrastructure** (vitest config, setup files).

## 5. Inputs

- Existing codebase on branch `claude/nervous-wozniak`
- server/defaultChartOfAccounts.ts for valid account codes
- shared/schema.ts for table/column definitions
- migrations/0000–0021 for actual DB DDL
- All route files listed in Section 3

## 6. Outputs

- **Migration 0022**: ALTER all monetary `real` columns to `numeric` with appropriate precision
- **Migration 0023**: Add unique constraints (M1, M2) and indexes (M3)
- **Modified route files**: ~15 backend route files with fixes
- **Modified account-codes.ts**: New constants for salary, disposal, depreciation
- **Modified schema.ts**: Unique constraints added at Drizzle level
- **Modified frontend files**: not-found.tsx, plus aria-label additions
- **New/updated tests**: Tests for each new JE creation path, access control tests
- All 125+ existing tests still passing
- Build (`npm run build`) succeeds with no new errors

## 7. Constraints

- **Drizzle ORM 0.39.1**: `numeric()` returns strings; all arithmetic must use `Number()` wrapping
- **PostgreSQL**: ALTER COLUMN TYPE is safe for real→numeric conversion (no data loss for existing values within numeric range)
- **Express.js pattern**: All routes must use `authMiddleware` + `requireCustomer` + `asyncHandler` + `storage.hasCompanyAccess()`
- **Transaction pattern**: JE-creating operations must use `(db as any).transaction()` or `pool.connect()` + BEGIN/COMMIT/ROLLBACK
- **Account code resolution**: Must use `storage.getAccountByCode(companyId, ACCOUNT_CODES.X)` — never string matching on nameEn
- **Fiscal year guard**: All JE-creating endpoints must call `assertFiscalYearOpen()` or `assertFiscalYearOpenPool()` before creating entries
- **No breaking changes**: All existing API contracts preserved (same endpoints, same request/response shapes)
- **Migration safety**: All ALTER TABLE statements must use IF EXISTS guards where possible

## 8. Invariants

1. Every financial event MUST create a balanced journal entry (total debits = total credits)
2. Posted journal entries MUST NOT be editable or deletable (only reversible)
3. Balance sheet equation MUST hold: Assets = Liabilities + Equity
4. Trial balance MUST sum to zero (total debits = total credits across all accounts)
5. Every company-scoped endpoint MUST verify the authenticated user has access to that company
6. Monetary values MUST be stored as `numeric` in PostgreSQL, not `real`
7. All multi-step database operations MUST be wrapped in transactions
8. Account resolution MUST use code constants, not string matching

## 9. Edge Cases

- **C1**: Tables that don't exist yet in some environments — ALTER must use IF EXISTS
- **C4**: Bill with zero line items — should reject approval with "no line items"
- **C5**: Payroll with zero employees — should succeed with empty JE (no lines) or skip JE
- **C7**: Company has no bank account (1020) or AP account (2010) set up — fail with descriptive error telling user to create the account first
- **C8**: Asset disposal with zero proceeds — still need JE for derecognition
- **C10**: Receipt with zero VAT — should NOT create a VAT journal line (only expense + payment)
- **C11**: Expense claim with zero items — should skip JE creation
- **M1**: Existing duplicate company_users rows — migration must handle by deduplicating first
- **M2**: Existing duplicate invoice numbers — migration must handle gracefully (add unique constraint only if no violations, or fix duplicates first)
- **H4**: AI routes with null OpenAI client — ALL AI endpoints must return 503, not just categorize

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration 0022 alters 107 columns — could be slow on large tables | Downtime during migration | Test on staging first; columns are typically small |
| Unique constraints fail if duplicate data exists | Migration fails | Add conflict resolution (DELETE duplicates keeping newest) before constraint |
| New JE paths may reference accounts that don't exist in some companies | Runtime 500 errors | Return 400 with "Please add [account name] to your chart of accounts" |
| Access control additions break existing client-side calls | Frontend shows 403 errors | Frontend already sends auth tokens; requireCustomer should already be satisfied for logged-in users |
| Fiscal year guard on new JE paths may block operations if no fiscal year is open | Operations blocked | Make fiscal year guard optional (only check if fiscal_years table has rows for this company) |

## 11. Acceptance Criteria

### Database Schema (C1, C13)
1. Migration 0022 exists and converts ALL monetary `real` columns to `numeric` with appropriate precision
2. Running `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='journal_lines'` shows `debit` and `credit` as `numeric`, not `real`
3. fiscalYears, creditNotes, creditNoteLines tables have matching pgTable definitions in schema.ts and migration DDL

### Route Registration (C2, C3)
4. `GET /api/credit-notes/:companyId` returns 200 (not 404) for authenticated users
5. `GET /api/fiscal-years/:companyId` returns 200 (not 404) for authenticated users

### Journal Entry Creation (C5, C8, C10, C11)
6. Approving a payroll run creates a posted JE with Debit Salary Expense + allowances, Credit Salaries Payable
7. Disposing a fixed asset creates a posted JE with proper derecognition entries
8. Posting a receipt with VAT creates a JE with separate Expense debit and VAT Input (1050) debit
9. Approving an expense claim creates a JE with Debit Expense lines, Credit AP

### Accounting Safety (C4, C6, C7, C9, C12, M4, M5)
10. Approving a bill where any line lacks account_id returns 400
11. Deleting an invoice with a posted JE returns 400
12. Updating an invoice with a posted JE returns 400
13. Recording a bill payment when AP or Bank account missing returns 400 (no partial recording)
14. Running depreciation when expense/accumulated accounts missing returns 400
15. Fiscal year close does not reference `line_order` column
16. Deleting a posted journal entry returns 400
17. Deleting a paid invoice returns 400

### Access Control (H1–H7)
18. Dashboard company-scoped endpoints return 403 for users without company access
19. VAT PATCH returns 403 for users without access to the VAT return's company
20. Corporate tax GET single returns 403 for users without company access
21. AI categorize endpoint returns 503 (not TypeError) when OPENAI_API_KEY is unset
22. Receipt POST requires requireCustomer middleware
23. Receipt PUT verifies company ownership
24. Portal document delete verifies company ownership

### Data Integrity (M1, M2, M3)
25. company_users(company_id, user_id) has a unique constraint
26. journal_entries(company_id, entry_number) has a unique constraint
27. invoices(company_id, number) has a unique constraint (where number is not null)
28. journal_lines has indexes on entry_id and account_id

### Frontend (F1, F2, F3)
29. No console.log calls exist in client/src/pages/ production code
30. not-found.tsx uses design tokens (bg-background, text-foreground, etc.), not hardcoded grays
31. Icon-only buttons in Journal, Invoices, Dashboard have aria-label attributes

### Regression
32. All 125 existing tests still pass
33. `npm run build` succeeds with no new TypeScript errors beyond pre-existing baseline

## 12. Observability Requirements

- All new JE creation paths must log: `console.log(`[module] Created JE ${entryNumber} for ${source}`)` in development
- Access control rejections must return descriptive error messages (not just 403)
- Migration 0022 must be idempotent (can run multiple times without error — use IF/WHEN guards)

## 13. Open Questions

None — all requirements are grounded in audit findings and codebase scan.

## 14. Codebase Context Snapshot

### Affected Modules and Files
| Category | Files |
|----------|-------|
| Schema | shared/schema.ts |
| Migrations | migrations/0022_*.sql (new), migrations/0023_*.sql (new) |
| Route Registration | server/routes.ts |
| Account Codes | server/lib/account-codes.ts |
| Default COA | server/defaultChartOfAccounts.ts |
| Bill Pay | server/routes/bill-pay.routes.ts |
| Payroll | server/routes/payroll.routes.ts |
| Fixed Assets | server/routes/fixed-assets.routes.ts |
| Receipts | server/routes/receipts.routes.ts |
| Expense Claims | server/routes/expense-claims.routes.ts |
| Invoices | server/routes/invoices.routes.ts |
| Fiscal Years | server/routes/fiscal-years.routes.ts |
| Dashboard | server/routes/dashboard.routes.ts |
| VAT | server/routes/vat.routes.ts |
| Corporate Tax | server/routes/corporate-tax.routes.ts |
| AI | server/routes/ai.routes.ts |
| Portal | server/routes/portal.routes.ts |
| Autonomous GL | server/routes/ai-gl.routes.ts |
| Frontend | client/src/pages/not-found.tsx, Journal.tsx, Invoices.tsx, Dashboard.tsx |

### Existing Patterns
- **Auth**: `authMiddleware` + `requireCustomer` + `asyncHandler` on all protected routes
- **Access**: `await storage.hasCompanyAccess(req.user!.id, companyId)` → 403 if false
- **JE Creation**: `(db as any).transaction(async (tx) => { ... })` for Drizzle, or `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` for raw SQL
- **Account Resolution**: `storage.getAccountByCode(companyId, ACCOUNT_CODES.X)`
- **Fiscal Guard**: `assertFiscalYearOpen(companyId, date)` or `assertFiscalYearOpenPool(client, companyId, date)`

### Pre-existing Tech Debt
- 316 `any` type occurrences in frontend (not in scope)
- God components in frontend (not in scope)
- N+1 queries in getAccountsWithBalances (not in scope)
- Drizzle migration journal only tracks 0000-0001; later migrations are hand-written SQL

### Test Coverage Baseline
- 22 test files, 125 tests, all passing
- Coverage thresholds: 40% branches, 50% statements/functions/lines
- Tests are pure unit tests with mocked storage — no DB integration tests

### Dependency State
- drizzle-orm: ^0.39.1
- vitest: ^3.0.0
- express: ^4.21.2
- pg: ^8.20.0
- TypeScript strict mode (tsconfig.json)

## 15. Contract Version

**v3** — 2026-03-24

## 16. Readiness Decision

**READY FOR DESIGN**
