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

/**
 * Balance sheet tests verify the fundamental accounting equation:
 *   Assets = Liabilities + Equity
 *
 * Current Period Earnings (Net Income) = Income - Expenses
 * This is included in the equity section of the balance sheet.
 */

describe('Balance Sheet', () => {
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

  it('Assets = Liabilities + Equity (the accounting equation)', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);
    const arAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const capitalAccount = findAccount(accounts, '3010'); // Owner's Capital
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);
    const rentExpense = findAccount(accounts, '5010');

    // Owner invests capital: debit Cash, credit Owner's Capital
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '50000.00' },
      { accountId: capitalAccount.id, credit: '50000.00' },
    ]);

    // Transfer to bank: debit Bank, credit Cash
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: bankAccount.id, debit: '30000.00' },
      { accountId: cashAccount.id, credit: '30000.00' },
    ]);

    // Credit sale: debit AR, credit Revenue
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: arAccount.id, debit: '15000.00' },
      { accountId: revenueAccount.id, credit: '15000.00' },
    ]);

    // Pay rent: debit Rent Expense, credit Bank
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: rentExpense.id, debit: '4000.00' },
      { accountId: bankAccount.id, credit: '4000.00' },
    ]);

    // Incur payable: debit Rent Expense, credit AP
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: rentExpense.id, debit: '2000.00' },
      { accountId: apAccount.id, credit: '2000.00' },
    ]);

    const balances = await storage.getAccountsWithBalances(company.id);

    // Calculate section totals
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const b of balances) {
      switch (b.account.type) {
        case 'asset':
          totalAssets += b.balance;
          break;
        case 'liability':
          totalLiabilities += b.balance;
          break;
        case 'equity':
          totalEquity += b.balance;
          break;
        case 'income':
          totalIncome += b.balance;
          break;
        case 'expense':
          totalExpenses += b.balance;
          break;
      }
    }

    // Current Period Earnings = Income - Expenses
    const currentPeriodEarnings = totalIncome - totalExpenses;

    // The accounting equation: Assets = Liabilities + Equity + Current Period Earnings
    // Cash: 50000 - 30000 = 20000
    // Bank: 30000 - 4000 = 26000
    // AR: 15000
    // Total Assets = 61000
    expect(totalAssets).toBe(61000);

    // AP: 2000
    expect(totalLiabilities).toBe(2000);

    // Capital: 50000
    expect(totalEquity).toBe(50000);

    // Revenue: 15000, Expenses: 6000, Net Income: 9000
    expect(currentPeriodEarnings).toBe(9000);

    // Assets = Liabilities + Equity + Net Income
    expect(totalAssets).toBe(totalLiabilities + totalEquity + currentPeriodEarnings);
  });

  it('Current Period Earnings is included in equity section', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);
    const salaryExpense = findAccount(accounts, '5020'); // Salaries & Wages

    // Revenue earned
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '20000.00' },
      { accountId: revenueAccount.id, credit: '20000.00' },
    ]);

    // Salary paid
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: salaryExpense.id, debit: '8000.00' },
      { accountId: cashAccount.id, credit: '8000.00' },
    ]);

    const balances = await storage.getAccountsWithBalances(company.id);

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const b of balances) {
      if (b.account.type === 'income') totalIncome += b.balance;
      if (b.account.type === 'expense') totalExpenses += b.balance;
    }

    const currentPeriodEarnings = totalIncome - totalExpenses;
    expect(currentPeriodEarnings).toBe(12000); // 20000 - 8000

    // This value would appear in the equity section of the balance sheet
    expect(currentPeriodEarnings).toBeGreaterThan(0);
  });

  it('correct classification of accounts by type', async () => {
    const balances = await storage.getAccountsWithBalances(company.id);

    const assetAccounts = balances.filter((b) => b.account.type === 'asset');
    const liabilityAccounts = balances.filter((b) => b.account.type === 'liability');
    const equityAccounts = balances.filter((b) => b.account.type === 'equity');
    const incomeAccounts = balances.filter((b) => b.account.type === 'income');
    const expenseAccounts = balances.filter((b) => b.account.type === 'expense');

    // Default chart should have accounts of each type
    expect(assetAccounts.length).toBeGreaterThan(0);
    expect(liabilityAccounts.length).toBeGreaterThan(0);
    expect(equityAccounts.length).toBeGreaterThan(0);
    expect(incomeAccounts.length).toBeGreaterThan(0);
    expect(expenseAccounts.length).toBeGreaterThan(0);

    // Verify specific well-known accounts are in the right category
    const cashBal = balances.find((b) => b.account.code === ACCOUNT_CODES.CASH);
    expect(cashBal!.account.type).toBe('asset');

    const apBal = balances.find((b) => b.account.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    expect(apBal!.account.type).toBe('liability');

    const capitalBal = balances.find((b) => b.account.code === '3010');
    expect(capitalBal!.account.type).toBe('equity');

    const revBal = balances.find((b) => b.account.code === ACCOUNT_CODES.SERVICE_REVENUE);
    expect(revBal!.account.type).toBe('income');

    const rentBal = balances.find((b) => b.account.code === '5010');
    expect(rentBal!.account.type).toBe('expense');
  });

  it('date-range filtering works correctly', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);

    // January entry
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '1000.00' },
      { accountId: revenueAccount.id, credit: '1000.00' },
    ], { date: new Date(2024, 0, 15) }); // Jan 15

    // March entry
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '2000.00' },
      { accountId: revenueAccount.id, credit: '2000.00' },
    ], { date: new Date(2024, 2, 15) }); // Mar 15

    // June entry
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '3000.00' },
      { accountId: revenueAccount.id, credit: '3000.00' },
    ], { date: new Date(2024, 5, 15) }); // Jun 15

    // Filter: only Q1 (Jan 1 - Mar 31)
    const q1Balances = await storage.getAccountsWithBalances(company.id, {
      start: new Date(2024, 0, 1),
      end: new Date(2024, 2, 31),
    });

    const q1Cash = q1Balances.find((b) => b.account.id === cashAccount.id)!;
    expect(q1Cash.debitTotal).toBe(3000); // 1000 + 2000, excludes June
    expect(q1Cash.balance).toBe(3000);

    // Full year
    const fullYearBalances = await storage.getAccountsWithBalances(company.id, {
      start: new Date(2024, 0, 1),
      end: new Date(2024, 11, 31),
    });

    const fullCash = fullYearBalances.find((b) => b.account.id === cashAccount.id)!;
    expect(fullCash.debitTotal).toBe(6000); // 1000 + 2000 + 3000
    expect(fullCash.balance).toBe(6000);
  });
});
