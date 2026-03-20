import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  createBalancedJournalEntry,
  findAccount,
  ACCOUNT_CODES,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring fiscal-year business logic
// ---------------------------------------------------------------------------

interface AccountBalance {
  accountId: string;
  accountName: string;
  accountCode: string;
  type: 'income' | 'expense';
  /** Positive balance: income = credits - debits; expense = debits - credits */
  balance: number;
}

interface ClosingJournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
}

/**
 * Build the year-end closing journal entry lines.
 * Mirrors fiscal-years.routes.ts /close endpoint:
 *   - Debit each income account (to zero the credit-normal balance)
 *   - Credit each expense account (to zero the debit-normal balance)
 *   - Net difference to Retained Earnings
 */
function buildClosingEntryLines(
  incomeAccounts: AccountBalance[],
  expenseAccounts: AccountBalance[],
  retainedEarningsAccountId: string,
): ClosingJournalLine[] {
  const lines: ClosingJournalLine[] = [];

  const totalIncome = incomeAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.balance, 0);
  const netIncome = totalIncome - totalExpenses;

  // Debit each income account to zero it out
  for (const income of incomeAccounts) {
    const amount = Math.abs(income.balance);
    if (amount === 0) continue;
    lines.push({
      accountId: income.accountId,
      debit: amount,
      credit: 0,
      description: `Close ${income.accountName} (${income.accountCode})`,
    });
  }

  // Credit each expense account to zero it out
  for (const expense of expenseAccounts) {
    const amount = Math.abs(expense.balance);
    if (amount === 0) continue;
    lines.push({
      accountId: expense.accountId,
      debit: 0,
      credit: amount,
      description: `Close ${expense.accountName} (${expense.accountCode})`,
    });
  }

  // Net difference to Retained Earnings
  if (netIncome !== 0) {
    const reAmount = Math.abs(netIncome);
    lines.push({
      accountId: retainedEarningsAccountId,
      debit: netIncome < 0 ? reAmount : 0,  // Debit if loss
      credit: netIncome > 0 ? reAmount : 0,  // Credit if profit
      description: 'Net income transferred to Retained Earnings',
    });
  }

  return lines;
}

/**
 * Guard: check whether a date falls within a closed fiscal year.
 * Returns true if the entry should be BLOCKED.
 */
function isDateInClosedFiscalYear(
  date: Date | string,
  fiscalYears: FiscalYear[],
): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateStr = d.toISOString().slice(0, 10);

  return fiscalYears.some(
    (fy) =>
      fy.status === 'closed' &&
      dateStr >= fy.startDate &&
      dateStr <= fy.endDate,
  );
}

/**
 * Backward compatibility: if no fiscal years exist, entries are always allowed.
 */
function shouldBlockEntry(
  date: Date | string,
  fiscalYears: FiscalYear[],
): boolean {
  if (fiscalYears.length === 0) return false;
  return isDateInClosedFiscalYear(date, fiscalYears);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Fiscal Years', () => {
  let storage: IStorage;
  let user: User;
  let company: Company;
  let accounts: Account[];

  beforeEach(async () => {
    storage = createMockStorage();
    const seed = await seedTestCompanyWithAccounts(storage);
    user = seed.user;
    company = seed.company;
    accounts = seed.accounts;
  });

  // -------------------------------------------------------------------------
  // 1. Year-end close zeros income accounts
  // -------------------------------------------------------------------------
  it('year-end close zeros income accounts', () => {
    const retainedEarnings = findAccount(accounts, ACCOUNT_CODES.RETAINED_EARNINGS);

    const incomeAccounts: AccountBalance[] = [
      { accountId: 'inc-1', accountName: 'Product Sales', accountCode: '4010', type: 'income', balance: 50000 },
      { accountId: 'inc-2', accountName: 'Service Revenue', accountCode: '4020', type: 'income', balance: 30000 },
    ];
    const expenseAccounts: AccountBalance[] = [];

    const closingLines = buildClosingEntryLines(incomeAccounts, expenseAccounts, retainedEarnings.id);

    // Each income account should be debited by its balance to zero it out
    const incLine1 = closingLines.find((l) => l.accountId === 'inc-1')!;
    expect(incLine1.debit).toBe(50000);
    expect(incLine1.credit).toBe(0);

    const incLine2 = closingLines.find((l) => l.accountId === 'inc-2')!;
    expect(incLine2.debit).toBe(30000);
    expect(incLine2.credit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Year-end close zeros expense accounts
  // -------------------------------------------------------------------------
  it('year-end close zeros expense accounts', () => {
    const retainedEarnings = findAccount(accounts, ACCOUNT_CODES.RETAINED_EARNINGS);

    const incomeAccounts: AccountBalance[] = [];
    const expenseAccounts: AccountBalance[] = [
      { accountId: 'exp-1', accountName: 'Rent', accountCode: '5010', type: 'expense', balance: 24000 },
      { accountId: 'exp-2', accountName: 'Salaries', accountCode: '5020', type: 'expense', balance: 60000 },
    ];

    const closingLines = buildClosingEntryLines(incomeAccounts, expenseAccounts, retainedEarnings.id);

    // Each expense account should be credited by its balance to zero it out
    const expLine1 = closingLines.find((l) => l.accountId === 'exp-1')!;
    expect(expLine1.credit).toBe(24000);
    expect(expLine1.debit).toBe(0);

    const expLine2 = closingLines.find((l) => l.accountId === 'exp-2')!;
    expect(expLine2.credit).toBe(60000);
    expect(expLine2.debit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Net profit goes to Retained Earnings
  // -------------------------------------------------------------------------
  it('net profit goes to Retained Earnings', () => {
    const retainedEarnings = findAccount(accounts, ACCOUNT_CODES.RETAINED_EARNINGS);

    const incomeAccounts: AccountBalance[] = [
      { accountId: 'inc-1', accountName: 'Sales', accountCode: '4010', type: 'income', balance: 100000 },
    ];
    const expenseAccounts: AccountBalance[] = [
      { accountId: 'exp-1', accountName: 'Expenses', accountCode: '5010', type: 'expense', balance: 70000 },
    ];

    const closingLines = buildClosingEntryLines(incomeAccounts, expenseAccounts, retainedEarnings.id);

    // Net income = 100000 - 70000 = 30000 (profit)
    const reLine = closingLines.find((l) => l.accountId === retainedEarnings.id)!;
    expect(reLine).toBeDefined();
    expect(reLine.credit).toBe(30000); // Profit credits Retained Earnings
    expect(reLine.debit).toBe(0);

    // Also test net loss scenario
    const lossExpenses: AccountBalance[] = [
      { accountId: 'exp-1', accountName: 'Expenses', accountCode: '5010', type: 'expense', balance: 120000 },
    ];
    const lossClosingLines = buildClosingEntryLines(incomeAccounts, lossExpenses, retainedEarnings.id);

    // Net income = 100000 - 120000 = -20000 (loss)
    const lossReLine = lossClosingLines.find((l) => l.accountId === retainedEarnings.id)!;
    expect(lossReLine.debit).toBe(20000); // Loss debits Retained Earnings
    expect(lossReLine.credit).toBe(0);

    // Verify debits = credits for both scenarios
    const totalDebits = closingLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = closingLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);

    const lossTotalDebits = lossClosingLines.reduce((sum, l) => sum + l.debit, 0);
    const lossTotalCredits = lossClosingLines.reduce((sum, l) => sum + l.credit, 0);
    expect(lossTotalDebits).toBe(lossTotalCredits);
  });

  // -------------------------------------------------------------------------
  // 4. Closed fiscal year blocks new entries (guard function)
  // -------------------------------------------------------------------------
  it('closed fiscal year blocks new entries', () => {
    const fiscalYears: FiscalYear[] = [
      { id: 'fy-1', name: 'FY 2024', startDate: '2024-01-01', endDate: '2024-12-31', status: 'closed' },
      { id: 'fy-2', name: 'FY 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'open' },
    ];

    // Date in closed FY 2024 should be blocked
    expect(shouldBlockEntry('2024-06-15', fiscalYears)).toBe(true);
    expect(shouldBlockEntry('2024-01-01', fiscalYears)).toBe(true);
    expect(shouldBlockEntry('2024-12-31', fiscalYears)).toBe(true);

    // Date in open FY 2025 should be allowed
    expect(shouldBlockEntry('2025-06-15', fiscalYears)).toBe(false);

    // Date outside any fiscal year should be allowed
    expect(shouldBlockEntry('2023-12-31', fiscalYears)).toBe(false);
    expect(shouldBlockEntry('2026-01-01', fiscalYears)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5. No fiscal years = entries always allowed (backward compat)
  // -------------------------------------------------------------------------
  it('no fiscal years = entries always allowed (backward compat)', () => {
    const noFiscalYears: FiscalYear[] = [];

    expect(shouldBlockEntry('2024-06-15', noFiscalYears)).toBe(false);
    expect(shouldBlockEntry('2020-01-01', noFiscalYears)).toBe(false);
    expect(shouldBlockEntry(new Date(), noFiscalYears)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Closing entry debits = credits (balanced)
  // -------------------------------------------------------------------------
  it('closing entry debits = credits for a realistic scenario', () => {
    const retainedEarnings = findAccount(accounts, ACCOUNT_CODES.RETAINED_EARNINGS);

    const incomeAccounts: AccountBalance[] = [
      { accountId: 'inc-1', accountName: 'Product Sales', accountCode: '4010', type: 'income', balance: 250000 },
      { accountId: 'inc-2', accountName: 'Service Revenue', accountCode: '4020', type: 'income', balance: 75000 },
    ];
    const expenseAccounts: AccountBalance[] = [
      { accountId: 'exp-1', accountName: 'Rent', accountCode: '5010', type: 'expense', balance: 48000 },
      { accountId: 'exp-2', accountName: 'Salaries', accountCode: '5020', type: 'expense', balance: 180000 },
      { accountId: 'exp-3', accountName: 'Utilities', accountCode: '5030', type: 'expense', balance: 12000 },
    ];

    const closingLines = buildClosingEntryLines(incomeAccounts, expenseAccounts, retainedEarnings.id);

    const totalDebits = closingLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = closingLines.reduce((sum, l) => sum + l.credit, 0);

    // Net income = (250000 + 75000) - (48000 + 180000 + 12000) = 325000 - 240000 = 85000
    expect(totalDebits).toBe(totalCredits);

    // Verify RE line
    const reLine = closingLines.find((l) => l.accountId === retainedEarnings.id)!;
    expect(reLine.credit).toBe(85000);
  });
});
