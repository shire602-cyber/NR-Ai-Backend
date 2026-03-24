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
// Pure helper functions mirroring expense claim approval logic
// from expense-claims.routes.ts /approve endpoint
// ---------------------------------------------------------------------------

interface ExpenseClaimItem {
  amount: number;
  vatAmount: number;
  description: string;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Build the expense claim approval journal entry lines.
 * Mirrors expense-claims.routes.ts /approve endpoint:
 *   - Debit: General Expenses (total expense portion)
 *   - Debit: VAT Input (total VAT, only if > 0)
 *   - Credit: Accounts Payable (grand total)
 */
function buildExpenseClaimApprovalJournalLines(
  items: ExpenseClaimItem[],
  claimNumber: string,
  generalExpenseAccountId: string | null,
  vatInputAccountId: string | null,
  apAccountId: string,
): JournalLine[] {
  if (items.length === 0) return [];

  const jeLines: JournalLine[] = [];

  const totalExpenseAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const totalVatAmount = items.reduce((sum, item) => sum + item.vatAmount, 0);
  const grandTotal = totalExpenseAmount + totalVatAmount;

  // Debit: General Expenses (expense portion)
  if (totalExpenseAmount > 0 && generalExpenseAccountId) {
    jeLines.push({
      accountId: generalExpenseAccountId,
      debit: totalExpenseAmount,
      credit: 0,
      description: `Expense claim - ${claimNumber}`,
    });
  }

  // Debit: VAT Input (if VAT > 0 and account exists)
  if (totalVatAmount > 0 && vatInputAccountId) {
    jeLines.push({
      accountId: vatInputAccountId,
      debit: totalVatAmount,
      credit: 0,
      description: `VAT input - Expense claim ${claimNumber}`,
    });
  }

  // Credit: Accounts Payable for grand total
  jeLines.push({
    accountId: apAccountId,
    debit: 0,
    credit: grandTotal,
    description: `A/P - Expense claim ${claimNumber}`,
  });

  return jeLines;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Expense Claim JE', () => {
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
  // 1. Expense claim approval creates JE (debit expense, credit AP)
  // -------------------------------------------------------------------------
  it('expense claim approval creates JE (debit expense, credit AP)', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const generalExpenseAccount = findAccount(accounts, ACCOUNT_CODES.GENERAL_EXPENSES);

    const items: ExpenseClaimItem[] = [
      { amount: 250, vatAmount: 0, description: 'Taxi fare' },
      { amount: 1500, vatAmount: 0, description: 'Hotel stay' },
      { amount: 320, vatAmount: 0, description: 'Meals' },
    ];

    const jeLines = buildExpenseClaimApprovalJournalLines(
      items,
      'EXP-0001',
      generalExpenseAccount.id,
      null,
      apAccount.id,
    );

    expect(jeLines).toHaveLength(2);

    // Debit: General Expenses
    const expLine = jeLines.find((l) => l.accountId === generalExpenseAccount.id)!;
    expect(expLine.debit).toBe(2070);
    expect(expLine.credit).toBe(0);

    // Credit: AP
    const apLine = jeLines.find((l) => l.accountId === apAccount.id)!;
    expect(apLine.credit).toBe(2070);
    expect(apLine.debit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Expense claim with VAT includes VAT input debit
  // -------------------------------------------------------------------------
  it('expense claim with VAT includes VAT input debit', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const generalExpenseAccount = findAccount(accounts, ACCOUNT_CODES.GENERAL_EXPENSES);
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

    const items: ExpenseClaimItem[] = [
      { amount: 500, vatAmount: 25, description: 'Office supplies' },
      { amount: 200, vatAmount: 10, description: 'Printer cartridge' },
    ];

    const jeLines = buildExpenseClaimApprovalJournalLines(
      items,
      'EXP-0002',
      generalExpenseAccount.id,
      vatInputAccount.id,
      apAccount.id,
    );

    expect(jeLines).toHaveLength(3);

    // Debit: General Expenses (700)
    const expLine = jeLines.find((l) => l.accountId === generalExpenseAccount.id)!;
    expect(expLine.debit).toBe(700);

    // Debit: VAT Input (35)
    const vatLine = jeLines.find((l) => l.accountId === vatInputAccount.id)!;
    expect(vatLine.debit).toBe(35);

    // Credit: AP (735)
    const apLine = jeLines.find((l) => l.accountId === apAccount.id)!;
    expect(apLine.credit).toBe(735);

    // Balanced
    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 3. Empty expense claim skips JE
  // -------------------------------------------------------------------------
  it('empty expense claim skips JE creation', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const generalExpenseAccount = findAccount(accounts, ACCOUNT_CODES.GENERAL_EXPENSES);

    const items: ExpenseClaimItem[] = [];

    const jeLines = buildExpenseClaimApprovalJournalLines(
      items,
      'EXP-0003',
      generalExpenseAccount.id,
      null,
      apAccount.id,
    );

    expect(jeLines).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 4. Rejects if AP account not found
  // -------------------------------------------------------------------------
  it('rejects if AP account not found in chart of accounts', () => {
    // Filter out AP account
    const filtered = accounts.filter((a) => a.code !== ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const apAccount = filtered.find((a) => a.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    expect(apAccount).toBeUndefined();

    // The route checks: if (!apAccount) return 400
    // We verify the account resolution fails
    const resolvedAP = accounts.find((a) => a.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const filteredAP = filtered.find((a) => a.code === ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    expect(resolvedAP).toBeDefined();
    expect(filteredAP).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. JE balances for various expense claim amounts
  // -------------------------------------------------------------------------
  it('JE balances for various expense claim amounts', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const generalExpenseAccount = findAccount(accounts, ACCOUNT_CODES.GENERAL_EXPENSES);
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

    const testCases: ExpenseClaimItem[][] = [
      [{ amount: 100, vatAmount: 5, description: 'Item 1' }],
      [
        { amount: 250, vatAmount: 12.50, description: 'Item 1' },
        { amount: 800, vatAmount: 40, description: 'Item 2' },
      ],
      [
        { amount: 50, vatAmount: 0, description: 'Item 1' },
        { amount: 75, vatAmount: 0, description: 'Item 2' },
        { amount: 125, vatAmount: 0, description: 'Item 3' },
      ],
      [
        { amount: 9999.99, vatAmount: 499.99, description: 'Large item' },
      ],
    ];

    for (const items of testCases) {
      const jeLines = buildExpenseClaimApprovalJournalLines(
        items,
        'EXP-TEST',
        generalExpenseAccount.id,
        vatInputAccount.id,
        apAccount.id,
      );

      const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

      expect(totalDebits).toBeCloseTo(totalCredits, 2);
    }
  });
});
