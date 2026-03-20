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

describe('Trial Balance', () => {
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

  it('total debits equals total credits across all accounts', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);
    const rentExpense = findAccount(accounts, '5010');
    const arAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);

    // Entry 1: Cash sale
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '10000.00' },
      { accountId: revenueAccount.id, credit: '10000.00' },
    ]);

    // Entry 2: Pay rent from bank
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: rentExpense.id, debit: '3000.00' },
      { accountId: bankAccount.id, credit: '3000.00' },
    ]);

    // Entry 3: Credit sale (on account)
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: arAccount.id, debit: '5000.00' },
      { accountId: revenueAccount.id, credit: '5000.00' },
    ]);

    const balances = await storage.getAccountsWithBalances(company.id);

    // Trial balance: sum of all debitTotals must equal sum of all creditTotals
    const totalDebits = balances.reduce((sum, b) => sum + b.debitTotal, 0);
    const totalCredits = balances.reduce((sum, b) => sum + b.creditTotal, 0);

    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(18000); // 10000 + 3000 + 5000
  });

  it('correct per-account debit/credit totals', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    // Cash received: debit cash, credit revenue
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '7500.00' },
      { accountId: revenueAccount.id, credit: '7500.00' },
    ]);

    // Pay supplier: debit AP, credit cash
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: apAccount.id, debit: '2000.00' },
      { accountId: cashAccount.id, credit: '2000.00' },
    ]);

    const balances = await storage.getAccountsWithBalances(company.id);

    const cashBal = balances.find((b) => b.account.id === cashAccount.id)!;
    expect(cashBal.debitTotal).toBe(7500);
    expect(cashBal.creditTotal).toBe(2000);
    // Asset (debit-normal): balance = 7500 - 2000 = 5500
    expect(cashBal.balance).toBe(5500);

    const revBal = balances.find((b) => b.account.id === revenueAccount.id)!;
    expect(revBal.debitTotal).toBe(0);
    expect(revBal.creditTotal).toBe(7500);
    // Income (credit-normal): balance = 7500 - 0 = 7500
    expect(revBal.balance).toBe(7500);

    const apBal = balances.find((b) => b.account.id === apAccount.id)!;
    expect(apBal.debitTotal).toBe(2000);
    expect(apBal.creditTotal).toBe(0);
    // Liability (credit-normal): balance = 0 - 2000 = -2000
    expect(apBal.balance).toBe(-2000);
  });

  it('only includes posted entries (not draft/void)', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);

    // Posted entry - should be included
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '1000.00' },
      { accountId: revenueAccount.id, credit: '1000.00' },
    ], { status: 'posted' });

    // Draft entry - should NOT be included in balances
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '9999.00' },
      { accountId: revenueAccount.id, credit: '9999.00' },
    ], { status: 'draft' });

    // Void entry - should NOT be included in balances
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '5555.00' },
      { accountId: revenueAccount.id, credit: '5555.00' },
    ], { status: 'void' });

    const balances = await storage.getAccountsWithBalances(company.id);

    const cashBal = balances.find((b) => b.account.id === cashAccount.id)!;
    // Only the posted entry (1000) should count
    expect(cashBal.debitTotal).toBe(1000);
    expect(cashBal.balance).toBe(1000);

    const revBal = balances.find((b) => b.account.id === revenueAccount.id)!;
    expect(revBal.creditTotal).toBe(1000);
    expect(revBal.balance).toBe(1000);
  });

  it('empty company returns zero totals', async () => {
    // No journal entries created - fresh company
    const balances = await storage.getAccountsWithBalances(company.id);

    // All accounts should exist but have zero balances
    expect(balances.length).toBeGreaterThan(0);

    const totalDebits = balances.reduce((sum, b) => sum + b.debitTotal, 0);
    const totalCredits = balances.reduce((sum, b) => sum + b.creditTotal, 0);

    expect(totalDebits).toBe(0);
    expect(totalCredits).toBe(0);

    // Every individual account balance should be zero
    for (const b of balances) {
      expect(b.balance).toBe(0);
      expect(b.debitTotal).toBe(0);
      expect(b.creditTotal).toBe(0);
    }
  });
});
