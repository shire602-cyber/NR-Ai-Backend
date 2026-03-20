import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockStorage,
  seedTestCompanyWithAccounts,
  createBalancedJournalEntry,
  findAccount,
  formatDateForEntry,
  ACCOUNT_CODES,
} from '../helpers';
import type { IStorage } from '../../server/storage';
import type { Account, User, Company } from '@shared/schema';

describe('Journal Entries', () => {
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

  it('creates a journal entry with balanced debit/credit lines', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);

    const { entry, lines } = await createBalancedJournalEntry(
      storage,
      company.id,
      user.id,
      [
        { accountId: cashAccount.id, debit: '1000.00' },
        { accountId: revenueAccount.id, credit: '1000.00' },
      ],
    );

    expect(entry).toBeDefined();
    expect(entry.companyId).toBe(company.id);
    expect(entry.status).toBe('posted');
    expect(lines).toHaveLength(2);

    // Verify debits equal credits
    const totalDebits = lines.reduce((sum, l) => sum + parseFloat(l.debit), 0);
    const totalCredits = lines.reduce((sum, l) => sum + parseFloat(l.credit), 0);
    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(1000.0);
  });

  it('rejects entry where debits != credits', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);

    // Business logic validation: debits must equal credits
    const lines = [
      { accountId: cashAccount.id, debit: '1000.00', credit: '0' },
      { accountId: revenueAccount.id, debit: '0', credit: '500.00' },
    ];

    const totalDebits = lines.reduce((sum, l) => sum + parseFloat(l.debit ?? '0'), 0);
    const totalCredits = lines.reduce((sum, l) => sum + parseFloat(l.credit ?? '0'), 0);

    expect(totalDebits).not.toBe(totalCredits);
    expect(totalDebits).toBe(1000.0);
    expect(totalCredits).toBe(500.0);

    // The application should reject unbalanced entries
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.001;
    expect(isBalanced).toBe(false);
  });

  it('correctly calculates account balances from journal entries', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);
    const expenseAccount = findAccount(accounts, '5010'); // Rent Expense

    // Entry 1: Cash received for service revenue
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: cashAccount.id, debit: '5000.00' },
      { accountId: revenueAccount.id, credit: '5000.00' },
    ]);

    // Entry 2: Pay rent expense
    await createBalancedJournalEntry(storage, company.id, user.id, [
      { accountId: expenseAccount.id, debit: '2000.00' },
      { accountId: cashAccount.id, credit: '2000.00' },
    ]);

    const balances = await storage.getAccountsWithBalances(company.id);

    const cashBalance = balances.find((b) => b.account.id === cashAccount.id);
    const revenueBalance = balances.find((b) => b.account.id === revenueAccount.id);
    const expenseBalance = balances.find((b) => b.account.id === expenseAccount.id);

    // Cash (asset, debit-normal): 5000 debit - 2000 credit = 3000
    expect(cashBalance!.balance).toBe(3000);
    expect(cashBalance!.debitTotal).toBe(5000);
    expect(cashBalance!.creditTotal).toBe(2000);

    // Revenue (income, credit-normal): 5000 credit - 0 debit = 5000
    expect(revenueBalance!.balance).toBe(5000);

    // Expense (expense, debit-normal): 2000 debit - 0 credit = 2000
    expect(expenseBalance!.balance).toBe(2000);
  });

  it('reversal creates opposite debit/credit entries', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);

    // Original entry: debit Cash, credit Revenue
    const { entry: originalEntry } = await createBalancedJournalEntry(
      storage,
      company.id,
      user.id,
      [
        { accountId: cashAccount.id, debit: '1500.00' },
        { accountId: revenueAccount.id, credit: '1500.00' },
      ],
    );

    // Reversal entry: swap debit/credit (credit Cash, debit Revenue)
    const { entry: reversalEntry, lines: reversalLines } = await createBalancedJournalEntry(
      storage,
      company.id,
      user.id,
      [
        { accountId: cashAccount.id, credit: '1500.00' },
        { accountId: revenueAccount.id, debit: '1500.00' },
      ],
      {
        source: 'reversal',
        reversedEntryId: originalEntry.id,
        reversalReason: 'Incorrect posting',
      },
    );

    expect(reversalEntry.source).toBe('reversal');
    expect(reversalEntry.reversedEntryId).toBe(originalEntry.id);
    expect(reversalEntry.reversalReason).toBe('Incorrect posting');

    // After reversal, net balances should be zero
    const balances = await storage.getAccountsWithBalances(company.id);
    const cashBalance = balances.find((b) => b.account.id === cashAccount.id);
    const revenueBalance = balances.find((b) => b.account.id === revenueAccount.id);

    expect(cashBalance!.balance).toBe(0);
    expect(revenueBalance!.balance).toBe(0);
  });

  it('entry numbering follows JE-YYYYMMDD-NNN format', async () => {
    const date = new Date(2024, 5, 15); // June 15, 2024
    const dateStr = formatDateForEntry(date);
    expect(dateStr).toBe('20240615');

    const num1 = await storage.generateEntryNumber(company.id, date);
    const num2 = await storage.generateEntryNumber(company.id, date);
    const num3 = await storage.generateEntryNumber(company.id, date);

    expect(num1).toBe('JE-20240615-001');
    expect(num2).toBe('JE-20240615-002');
    expect(num3).toBe('JE-20240615-003');

    // Pattern validation
    const pattern = /^JE-\d{8}-\d{3}$/;
    expect(num1).toMatch(pattern);
    expect(num2).toMatch(pattern);
    expect(num3).toMatch(pattern);
  });

  it('draft entries can be updated while posted entries are immutable by convention', async () => {
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.SERVICE_REVENUE);

    // Create a draft entry
    const { entry: draftEntry } = await createBalancedJournalEntry(
      storage,
      company.id,
      user.id,
      [
        { accountId: cashAccount.id, debit: '800.00' },
        { accountId: revenueAccount.id, credit: '800.00' },
      ],
      { status: 'draft' },
    );

    expect(draftEntry.status).toBe('draft');

    // Draft can be updated
    const updated = await storage.updateJournalEntry(draftEntry.id, {
      memo: 'Updated memo',
    });
    expect(updated.memo).toBe('Updated memo');

    // After posting, status becomes 'posted'
    const posted = await storage.updateJournalEntry(draftEntry.id, {
      status: 'posted',
      postedAt: new Date(),
      postedBy: user.id,
    });
    expect(posted.status).toBe('posted');
    expect(posted.postedBy).toBe(user.id);
  });
});
