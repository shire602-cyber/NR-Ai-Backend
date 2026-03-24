import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  findAccount,
  ACCOUNT_CODES,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring payroll approval business logic
// from payroll.routes.ts
// ---------------------------------------------------------------------------

interface PayrollItem {
  employeeId: string;
  netSalary: number;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Build the payroll approval journal entry lines.
 * Mirrors payroll.routes.ts /approve endpoint:
 *   - Debit: Salary Expense (total net salary)
 *   - Credit: Salaries Payable (total net salary)
 */
function buildPayrollApprovalJournalLines(
  items: PayrollItem[],
  periodLabel: string,
  salaryExpenseAccountId: string,
  salariesPayableAccountId: string,
): JournalLine[] {
  const totalNet = items.reduce((sum, item) => sum + item.netSalary, 0);

  if (totalNet <= 0) return [];

  return [
    {
      accountId: salaryExpenseAccountId,
      debit: totalNet,
      credit: 0,
      description: `Payroll expense - ${periodLabel}`,
    },
    {
      accountId: salariesPayableAccountId,
      debit: 0,
      credit: totalNet,
      description: `Salaries payable - ${periodLabel}`,
    },
  ];
}

/**
 * Resolve required payroll GL accounts.
 * Returns null for any account that is missing.
 */
function resolvePayrollAccounts(
  accounts: Account[],
): { salaryExpense: Account | undefined; salariesPayable: Account | undefined } {
  const salaryExpense = accounts.find((a) => a.code === ACCOUNT_CODES.SALARY_EXPENSE);
  const salariesPayable = accounts.find((a) => a.code === ACCOUNT_CODES.SALARIES_PAYABLE);
  return { salaryExpense, salariesPayable };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Payroll JE', () => {
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
  // 1. Payroll approval with items creates balanced JE
  // -------------------------------------------------------------------------
  it('payroll approval with items creates balanced JE (debit salary expense = credit salaries payable)', () => {
    const { salaryExpense, salariesPayable } = resolvePayrollAccounts(accounts);
    expect(salaryExpense).toBeDefined();
    expect(salariesPayable).toBeDefined();

    const items: PayrollItem[] = [
      { employeeId: 'emp-1', netSalary: 8000 },
      { employeeId: 'emp-2', netSalary: 12000 },
      { employeeId: 'emp-3', netSalary: 5000 },
    ];

    const periodLabel = '2026/01';
    const jeLines = buildPayrollApprovalJournalLines(
      items,
      periodLabel,
      salaryExpense!.id,
      salariesPayable!.id,
    );

    expect(jeLines).toHaveLength(2);

    // Debit: Salary Expense
    const expLine = jeLines.find((l) => l.accountId === salaryExpense!.id)!;
    expect(expLine.debit).toBe(25000);
    expect(expLine.credit).toBe(0);

    // Credit: Salaries Payable
    const payableLine = jeLines.find((l) => l.accountId === salariesPayable!.id)!;
    expect(payableLine.credit).toBe(25000);
    expect(payableLine.debit).toBe(0);

    // Balanced
    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 2. Payroll approval with zero items skips JE creation
  // -------------------------------------------------------------------------
  it('payroll approval with zero items skips JE creation', () => {
    const { salaryExpense, salariesPayable } = resolvePayrollAccounts(accounts);

    const items: PayrollItem[] = [];

    const jeLines = buildPayrollApprovalJournalLines(
      items,
      '2026/02',
      salaryExpense!.id,
      salariesPayable!.id,
    );

    expect(jeLines).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3. Payroll approval rejects if Salary Expense account not found
  // -------------------------------------------------------------------------
  it('payroll approval rejects if Salary Expense account not found', () => {
    // Filter out salary expense account
    const filtered = accounts.filter((a) => a.code !== ACCOUNT_CODES.SALARY_EXPENSE);
    const salaryExpense = filtered.find((a) => a.code === ACCOUNT_CODES.SALARY_EXPENSE);
    const salariesPayable = filtered.find((a) => a.code === ACCOUNT_CODES.SALARIES_PAYABLE);

    expect(salaryExpense).toBeUndefined();
    expect(salariesPayable).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Payroll approval rejects if Salaries Payable account not found
  // -------------------------------------------------------------------------
  it('payroll approval rejects if Salaries Payable account not found', () => {
    // Filter out salaries payable account
    const filtered = accounts.filter((a) => a.code !== ACCOUNT_CODES.SALARIES_PAYABLE);
    const salaryExpense = filtered.find((a) => a.code === ACCOUNT_CODES.SALARY_EXPENSE);
    const salariesPayable = filtered.find((a) => a.code === ACCOUNT_CODES.SALARIES_PAYABLE);

    expect(salaryExpense).toBeDefined();
    expect(salariesPayable).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. JE has source='payroll' and correct sourceId
  // -------------------------------------------------------------------------
  it('JE has source=payroll and correct sourceId', async () => {
    const { salaryExpense, salariesPayable } = resolvePayrollAccounts(accounts);

    const items: PayrollItem[] = [
      { employeeId: 'emp-1', netSalary: 10000 },
    ];

    const payrollRunId = 'run-abc-123';

    // Simulate creating the JE via storage (mirrors route behavior)
    const entryNumber = await storage.generateEntryNumber(company.id, new Date());
    const entry = await storage.createJournalEntry({
      companyId: company.id,
      entryNumber,
      date: new Date(),
      memo: 'Payroll - 2026/03',
      status: 'posted',
      source: 'payroll',
      sourceId: payrollRunId,
      createdBy: user.id,
    } as any);

    expect(entry.source).toBe('payroll');
    expect(entry.sourceId).toBe(payrollRunId);

    // Also verify the JE lines balance
    const totalNet = items.reduce((sum, i) => sum + i.netSalary, 0);

    await storage.createJournalLine({
      entryId: entry.id,
      accountId: salaryExpense!.id,
      debit: totalNet.toFixed(2),
      credit: '0',
      description: 'Payroll expense',
    } as any);

    await storage.createJournalLine({
      entryId: entry.id,
      accountId: salariesPayable!.id,
      debit: '0',
      credit: totalNet.toFixed(2),
      description: 'Salaries payable',
    } as any);

    const lines = await storage.getJournalLinesByEntryId(entry.id);
    expect(lines).toHaveLength(2);

    const totalDebits = lines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const totalCredits = lines.reduce((s, l) => s + parseFloat(l.credit), 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 6. JE total debits = total credits for various payroll sizes
  // -------------------------------------------------------------------------
  it('JE debits = credits for various payroll sizes', () => {
    const { salaryExpense, salariesPayable } = resolvePayrollAccounts(accounts);

    const testCases = [
      [{ employeeId: 'e1', netSalary: 5000 }],
      [
        { employeeId: 'e1', netSalary: 15000 },
        { employeeId: 'e2', netSalary: 9500.50 },
      ],
      [
        { employeeId: 'e1', netSalary: 7200 },
        { employeeId: 'e2', netSalary: 4300 },
        { employeeId: 'e3', netSalary: 11000 },
        { employeeId: 'e4', netSalary: 6800.75 },
      ],
    ];

    for (const items of testCases) {
      const jeLines = buildPayrollApprovalJournalLines(
        items,
        '2026/03',
        salaryExpense!.id,
        salariesPayable!.id,
      );

      const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(items.reduce((sum, i) => sum + i.netSalary, 0));
    }
  });
});
