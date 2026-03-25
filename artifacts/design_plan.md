# Design Plan

## 1. Design Summary

Surgical fixes to 8 core files + additive integration of 18 recovered files + 3 new report endpoints + 14 new test files. No architectural changes. Every fix follows existing patterns — the changes are mechanical type corrections (`real` → `numeric`), wrapping existing sequential code in `db.transaction()`, replacing string lookups with code-based lookups via a new constant + storage method, and adding missing report endpoints using the same Express + asyncHandler + authMiddleware pattern. Module recovery is a file copy + registration. No new dependencies.

## 2. Affected Components

| Component | Change Type | Contract Ref |
|-----------|------------|-------------|
| `shared/schema.ts` | Modify ~107 `real()` → `numeric(15,2)`, add 15+ table defs | P1.1, P2.4 |
| `server/lib/account-codes.ts` | New file | P1.2 |
| `server/storage.ts` | Add 3 methods, modify 1 | P1.2, P1.8, P3.2 |
| `server/routes/invoices.routes.ts` | Replace lookups, wrap 2 operations in tx | P1.2, P1.4, P1.7 |
| `server/routes/receipts.routes.ts` | Wrap posting in tx | P1.5 |
| `server/routes/journal.routes.ts` | Wrap reversal in tx | P1.6 |
| `server/routes/dashboard.routes.ts` | Add net income to equity | P1.3 |
| `server/routes/reports.routes.ts` | Add 3 endpoints, fix cash flow | P1.9, P3.3, P3.4, P3.6 |
| `server/routes/exchange-rates.routes.ts` | New file | P3.5 |
| `server/routes.ts` | Register 12 new routes | P2.5, P3.5 |
| `server/services/scheduler.service.ts` | Modify: add recurring invoice cron | P3.1 |
| `server/routes/analytics.routes.ts` | Fix call site | P3.2 |
| 11 route files | Copy from worktree | P2.1 |
| 7 service files | Copy from worktree | P2.2 |
| 6 migration files | Copy from worktree | P2.3 |
| `vitest.config.ts` | New file | P4.1 |
| `tests/helpers.ts` | New file | P4.1 |
| 14 test files | New files | P4.2–P4.4 |

## 3. Existing Pattern Alignment

| Pattern | Current Usage | This Design |
|---------|--------------|-------------|
| Route handler | `app.get("/api/...", authMiddleware, asyncHandler(async (req, res) => {...}))` | Same |
| Access check | `storage.hasCompanyAccess(userId, companyId)` | Same |
| Storage method | Drizzle ORM in `DatabaseStorage` class | Same for new methods |
| Schema def | `pgTable("name", {...})` + `createInsertSchema()` | Same |
| Transaction | `db.transaction(async (tx: any) => {...})` | Same (used in storage.ts line 706 for bulk account creation) |
| Numeric column | Not yet used — but Drizzle 0.39.1 supports `numeric("col", { precision: 15, scale: 2 })` | Using this |
| Test pattern | `describe/it/expect` with Vitest | Same |
| Error logging | `console.error('[Module] error message:', details)` | Same |

## 4. Alternative Approaches Considered

### Alt 1: Use PostgreSQL SERIAL for entry numbers instead of SELECT FOR UPDATE
- Rejected: Would require schema migration to add a sequence column. `SELECT ... FOR UPDATE` on the existing `journal_entries` table achieves atomicity without schema change and aligns with the contract's minimal-change principle.

### Alt 2: Create a separate migration for the real→numeric change
- Rejected: The schema.ts file IS the migration source for Drizzle push. Changing the column types in schema.ts and running `drizzle-kit push` handles migration. No separate SQL migration file needed for this — it's a schema-level change.

### Alt 3: Use a custom Drizzle `mapWith` for numeric fields to auto-convert
- Rejected: Would require overriding Drizzle's built-in numeric handling. Simpler to use `String()` on writes and `Number()` on reads at the application layer, matching the pattern already used elsewhere in the codebase for type conversions.

### Alt 4: Refactor worktree routes from pool.query() to Drizzle before integration
- Rejected per contract: Out of scope. Routes are accepted as-is with their existing `pool.query()` pattern.

## 5. Chosen Design

### Phase 1 — Critical Accounting Fixes

**P1.1 Numeric Migration:**
- In `shared/schema.ts`, replace every monetary `real("column_name")` with `numeric("column_name", { precision: 15, scale: 2 })`.
- Change corresponding `.default(0)` to `.default("0")` (Drizzle requires string defaults for numeric).
- Leave these fields as `real`: `aiConfidence`, `matchConfidence`, `confidenceLevel`, `value` (in analyticsEvents), `avgDuration`, `conversionRate`, `errorRate`, and `vatRate` fields (percentage 0–1).
- In all route/storage code that reads numeric fields, wrap with `Number()`. In all code that writes, ensure values are compatible (Drizzle accepts both numbers and strings for numeric columns on insert).

**P1.2 Account Code Resolution:**
- New file `server/lib/account-codes.ts`:
  ```
  export const ACCOUNT_CODES = {
    ACCOUNTS_RECEIVABLE: "1020",
    PRODUCT_SALES: "4010",
    SERVICE_REVENUE: "4020",
    VAT_PAYABLE_OUTPUT: "2020",
    VAT_RECEIVABLE_INPUT: "2015",
    CASH: "1010",
    ACCOUNTS_PAYABLE: "2010",
  } as const;
  ```
  Codes derived from `defaultChartOfAccounts.ts` existing code assignments.
- New storage method `getAccountByCode(companyId, code)`: `db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.code, code))).limit(1)`
- In `invoices.routes.ts`, replace the 3 `accounts.find(a => a.nameEn === ...)` calls at lines 165–167 with individual `await storage.getAccountByCode(companyId, ACCOUNT_CODES.X)` calls. Same for line 387.
- Add guard: `if (!accountsReceivable || !salesRevenue) return res.status(500).json({ message: "Required accounts not found..." })` — explicit 500, not silent skip.

**P1.3 Balance Sheet Fix:**
- After computing equity array (line 256), calculate:
  - `incomeTotal` = sum of balances for accounts where `type === 'income'`
  - `expenseTotal` = sum of balances for accounts where `type === 'expense'`
  - `netIncome = incomeTotal - expenseTotal`
- Push `{ accountName: "Current Period Earnings", amount: netIncome }` into equity array.
- Add `netIncome` to `totalEquity`.

**P1.4–P1.7 Transaction Wrapping:**
- Pattern for all 4 sites:
  ```
  await db.transaction(async (tx: any) => {
    // Move all existing sequential operations inside
    // Replace storage.createX() calls with tx-aware versions
    // For now, since storage methods use the global db, pass tx where possible
  });
  ```
- Since `storage` methods use the module-level `db`, and we can't easily pass `tx` to every storage method without major refactor, the pragmatic approach is: use `tx.insert()` / `tx.update()` directly inside the transaction callback for the critical operations (create journal entry, create journal lines, update invoice/receipt status). This matches the existing transaction pattern at storage.ts line 706.

**P1.8 Entry Number Atomicity:**
- Change `generateEntryNumber(companyId, date, tx?)` to:
  - Use raw SQL via `tx` or `db`: `SELECT COUNT(*) FROM journal_entries WHERE company_id = $1 AND entry_number LIKE $2 FOR UPDATE`
  - The `FOR UPDATE` locks matching rows, preventing concurrent duplicate generation.
  - Optional `tx` parameter: if provided, use `tx.execute(sql...)`, else use `db.execute(sql...)`.

**P1.9 Trial Balance:**
- New endpoint in `reports.routes.ts`: `GET /api/reports/:companyId/trial-balance`
- Query: For each account, sum all debit and credit amounts from posted journal lines.
- Return: `{ accounts: [{ accountId, accountName, code, debitTotal, creditTotal }], grandTotalDebits, grandTotalCredits }`

### Phase 2 — Module Integration

- **File copy**: cp 11 routes, 7 services, 6 migrations from serene-stonebraker to nervous-wozniak.
- **Migration renumbering**: serene-stonebraker migrations start at 0009. nervous-wozniak's last is 0008. No conflict — copy as-is. But rename to match pattern: `0010_add_payroll.sql`, `0011_add_bill_pay.sql`, etc. (shift by 1 to leave 0009 as a gap for the numeric migration if needed).
- **Schema defs**: Add `pgTable` definitions for all module tables, using `numeric(15,2)` for monetary fields from the start.
- **Route registration**: Add `registerXxxRoutes(app)` calls in `server/routes.ts` for all 11 recovered + 1 new (exchange-rates).

### Phase 3 — Feature Completion

- **Scheduler**: Add `generateRecurringInvoices()` function in scheduler.service.ts, called by cron. Uses `storage.getDueRecurringInvoices()` → for each, create invoice + journal in transaction → update `nextRunDate`.
- **E-commerce fix**: Add `getEcommerceIntegrationById(id)` to storage (simple `db.select().from(ecommerceIntegrations).where(eq(id))`). Fix call in analytics.routes.ts.
- **General Ledger**: New endpoint returning all accounts with their journal lines, sorted by date, with running balance per account.
- **Equity Changes**: New endpoint returning opening equity (start of period), net income, and closing equity.
- **Exchange Rates**: New CRUD route file following existing pattern.
- **Cash Flow Fix**: In existing cash-flow endpoint, classify accounts by subtype: operating (income/expense), investing (fixed assets), financing (equity/long-term liability).

### Phase 4 — Testing

- `vitest.config.ts`: Point to `tests/setup.ts`, enable globals.
- `tests/helpers.ts`: `createTestContext(prefix)` creates a user + company + default chart of accounts via storage. `cleanupTestContext(ctx)` deletes them.
- 14 test files organized as: `tests/accounting/` (6), `tests/integrity/` (3), `tests/modules/` (5). Each uses `createTestContext` in `beforeAll`, `cleanupTestContext` in `afterAll`.

## 6. Data Flow / Control Flow Impact

**Invoice Creation (after fix):**
```
Request → authMiddleware → asyncHandler →
  validate input →
  db.transaction(async (tx) => {
    tx.insert(invoices) →
    tx.insert(invoiceLines) →
    getAccountByCode(companyId, "1020") →  // AR
    getAccountByCode(companyId, "4010") →  // Revenue
    getAccountByCode(companyId, "2020") →  // VAT (optional)
    generateEntryNumber(companyId, date, tx) →  // FOR UPDATE lock
    tx.insert(journalEntries) →
    tx.insert(journalLines) x 2-3
  }) →
  res.json(invoice)
```

**Balance Sheet (after fix):**
```
Request → get accounts → get entries → calculate balances per account →
  assets = accounts.filter(type=asset).map(balance) →
  liabilities = accounts.filter(type=liability).map(balance) →
  equity = accounts.filter(type=equity).map(balance) →
  netIncome = sum(income balances) - sum(expense balances) →
  equity.push("Current Period Earnings": netIncome) →
  totalEquity = sum(equity) →
  res.json({ assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity })
```

## 7. Invariants Preserved

| Invariant | Protection Mechanism |
|-----------|---------------------|
| A = L + E | Net income added to equity in balance sheet |
| Debits = Credits | Existing validation at journal creation (unchanged) |
| Journal immutability | Existing posted/void guards (unchanged) |
| Company isolation | All new endpoints use `hasCompanyAccess()` |
| Entry number uniqueness | `FOR UPDATE` lock in `generateEntryNumber` |
| Monetary precision | `numeric(15,2)` eliminates float drift |
| Atomicity | `db.transaction()` on all multi-step operations |

## 8. Failure Modes

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Missing account for invoice journal | Return 500 with "Required account not found in chart of accounts for company {companyId}" | Admin creates missing accounts |
| Transaction rollback on invoice creation | Invoice + journal both rolled back. Client retries. | Automatic |
| Entry number lock contention | Second request waits for first to commit. No duplicate. | Automatic (PostgreSQL lock release on tx commit) |
| `numeric` field receives non-numeric string | PostgreSQL rejects insert with error. Caught by asyncHandler, returns 500. | Fix input data |
| Worktree files have broken imports | Build fails. Fix imports during integration step. | Manual fix |
| Test DB not available | Tests skip or fail with clear "DATABASE_URL required" message | Set env var |

## 9. Security Considerations

- **No new auth surfaces** — all new endpoints use existing `authMiddleware` + `hasCompanyAccess()`
- **No SQL injection** — all new queries use Drizzle ORM parameterized queries or `sql` tagged templates
- **Account codes are constants** — not user-input, no injection risk
- **Transaction wrapping** prevents partial state that could be exploited
- **No new secrets or env vars required**

## 10. Performance Considerations

- **`SELECT ... FOR UPDATE`** adds a row-level lock on entry number generation. Under normal load (< 10 concurrent requests per company per second), contention is negligible. Lock is held only for the duration of the transaction (milliseconds).
- **`numeric(15,2)`** is slightly slower than `real` for arithmetic but the difference is unmeasurable at this scale. Correctness > speed for accounting.
- **Trial balance endpoint** queries all posted journal lines per company. For < 10K entries this is fast. For 100K+ entries, would need pagination (out of scope per contract).
- **No new indexes added** (out of scope per contract).

## 11. Test Strategy

| Category | Files | Count | Tests |
|----------|-------|-------|-------|
| Accounting core | `journal-entries.test.ts`, `invoices.test.ts`, `receipts.test.ts`, `trial-balance.test.ts`, `balance-sheet.test.ts`, `chart-of-accounts.test.ts` | 6 | ~22 |
| Integrity | `monetary-precision.test.ts`, `transaction-atomicity.test.ts`, `concurrent-entry-numbers.test.ts` | 3 | ~8 |
| Modules | `payroll.test.ts`, `fixed-assets.test.ts`, `bill-pay.test.ts`, `expense-claims.test.ts`, `recurring-invoices.test.ts` | 5 | ~15 |
| **Total** | **14 files** | | **~45 tests** |

All tests use real database via `createTestContext` / `cleanupTestContext`. Tests that verify atomicity trigger FK violations inside transactions to confirm rollback. Monetary precision tests verify `0.1 * 10 === 1.00` at the database level.

## 12. Rollout / Migration / Rollback

- **Schema migration**: `numeric` change in schema.ts is applied via Drizzle push. Reversible by changing back to `real` and pushing again.
- **New tables**: Added via recovered SQL migrations (0010–0015). Reversible via `DROP TABLE`.
- **No data migration needed**: Existing `real` data is automatically cast to `numeric` by PostgreSQL `ALTER COLUMN ... TYPE numeric(15,2)`.
- **Rollback**: Revert the commit. All changes are additive except the `real` → `numeric` type change, which can be reverted with `ALTER COLUMN ... TYPE real`.

## 13. File Touch Forecast

### Modified (8 files)
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes/invoices.routes.ts`
- `server/routes/receipts.routes.ts`
- `server/routes/journal.routes.ts`
- `server/routes/dashboard.routes.ts`
- `server/routes/reports.routes.ts`
- `server/routes.ts`
- `server/services/scheduler.service.ts`
- `server/routes/analytics.routes.ts`

### New (18+ files)
- `server/lib/account-codes.ts`
- `server/routes/exchange-rates.routes.ts`
- `vitest.config.ts`
- `tests/helpers.ts`
- 14 test files in `tests/accounting/`, `tests/integrity/`, `tests/modules/`

### Copied from worktree (24 files)
- 11 route files → `server/routes/`
- 7 service files → `server/services/`
- 6 migration files → `migrations/`

### Intentionally untouched
- `server/db.ts` (no changes to DB connection)
- `server/middleware/` (existing auth/error handling unchanged)
- `server/defaultChartOfAccounts.ts` (account codes already assigned)
- `package.json` (no new dependencies)
- All frontend files

## 14. Design Decision

# READY FOR CHANGE PLAN
