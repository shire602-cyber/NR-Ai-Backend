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
// Pure helper functions mirroring receipt posting with VAT split
// from receipts.routes.ts /post endpoint
// ---------------------------------------------------------------------------

interface ReceiptPostingParams {
  netAmount: number;    // amount (excl. VAT)
  vatAmount: number;    // VAT component
  merchant: string;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Build receipt posting journal lines with VAT split.
 * Mirrors receipts.routes.ts /post endpoint:
 *   - Debit: Expense Account (net amount)
 *   - Debit: VAT Receivable Input (VAT amount, only if > 0)
 *   - Credit: Payment Account (total = net + VAT)
 */
function buildReceiptPostingJournalLines(
  params: ReceiptPostingParams,
  expenseAccountId: string,
  vatInputAccountId: string | null,
  paymentAccountId: string,
): JournalLine[] {
  const jeLines: JournalLine[] = [];
  const totalAmount = params.netAmount + params.vatAmount;

  // Debit: Expense Account (net amount)
  jeLines.push({
    accountId: expenseAccountId,
    debit: params.netAmount,
    credit: 0,
    description: `${params.merchant} - Expense`,
  });

  // Debit: VAT Receivable Input (if VAT > 0 and account exists)
  if (params.vatAmount > 0 && vatInputAccountId) {
    jeLines.push({
      accountId: vatInputAccountId,
      debit: params.vatAmount,
      credit: 0,
      description: `VAT input - ${params.merchant}`,
    });
  }

  // Credit: Payment Account (total)
  jeLines.push({
    accountId: paymentAccountId,
    debit: 0,
    credit: totalAmount,
    description: `Payment for ${params.merchant}`,
  });

  return jeLines;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Receipt VAT Split', () => {
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
  // 1. Receipt with VAT creates 3-line JE
  // -------------------------------------------------------------------------
  it('receipt with VAT creates 3-line JE (debit expense net, debit VAT input, credit payment total)', () => {
    const expenseAccount = findAccount(accounts, '5050'); // Office Supplies
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);

    const params: ReceiptPostingParams = {
      netAmount: 200,
      vatAmount: 10,
      merchant: 'Office Store LLC',
    };

    const jeLines = buildReceiptPostingJournalLines(
      params,
      expenseAccount.id,
      vatInputAccount.id,
      cashAccount.id,
    );

    expect(jeLines).toHaveLength(3);

    // Debit: Expense (net)
    const expLine = jeLines.find((l) => l.accountId === expenseAccount.id)!;
    expect(expLine.debit).toBe(200);
    expect(expLine.credit).toBe(0);

    // Debit: VAT Input
    const vatLine = jeLines.find((l) => l.accountId === vatInputAccount.id)!;
    expect(vatLine.debit).toBe(10);
    expect(vatLine.credit).toBe(0);

    // Credit: Cash (total)
    const cashLine = jeLines.find((l) => l.accountId === cashAccount.id)!;
    expect(cashLine.credit).toBe(210);
    expect(cashLine.debit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Receipt with zero VAT creates 2-line JE (no VAT line)
  // -------------------------------------------------------------------------
  it('receipt with zero VAT creates 2-line JE (no VAT line)', () => {
    const expenseAccount = findAccount(accounts, '5050');
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);

    const params: ReceiptPostingParams = {
      netAmount: 500,
      vatAmount: 0,
      merchant: 'Freelancer Payment',
    };

    const jeLines = buildReceiptPostingJournalLines(
      params,
      expenseAccount.id,
      vatInputAccount.id,
      bankAccount.id,
    );

    expect(jeLines).toHaveLength(2);

    // No VAT line
    const vatLine = jeLines.find((l) => l.accountId === vatInputAccount.id);
    expect(vatLine).toBeUndefined();

    // Debit: Expense
    const expLine = jeLines.find((l) => l.accountId === expenseAccount.id)!;
    expect(expLine.debit).toBe(500);

    // Credit: Bank
    const bankLine = jeLines.find((l) => l.accountId === bankAccount.id)!;
    expect(bankLine.credit).toBe(500);
  });

  // -------------------------------------------------------------------------
  // 3. VAT line uses account code 1050
  // -------------------------------------------------------------------------
  it('VAT line uses account code 1050', () => {
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

    // Confirm account code 1050 maps to VAT_RECEIVABLE_INPUT
    expect(ACCOUNT_CODES.VAT_RECEIVABLE_INPUT).toBe('1050');
    expect(vatInputAccount.code).toBe('1050');

    const expenseAccount = findAccount(accounts, '5050');
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);

    const params: ReceiptPostingParams = {
      netAmount: 1000,
      vatAmount: 50,
      merchant: 'Computer Shop',
    };

    const jeLines = buildReceiptPostingJournalLines(
      params,
      expenseAccount.id,
      vatInputAccount.id,
      cashAccount.id,
    );

    // The VAT debit line should use the 1050 account
    const vatLine = jeLines.find((l) => l.accountId === vatInputAccount.id)!;
    expect(vatLine).toBeDefined();
    expect(vatLine.debit).toBe(50);
  });

  // -------------------------------------------------------------------------
  // 4. JE always balances
  // -------------------------------------------------------------------------
  it('JE always balances (sum debits = sum credits)', () => {
    const expenseAccount = findAccount(accounts, '5050');
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);

    const testCases: ReceiptPostingParams[] = [
      { netAmount: 100, vatAmount: 5, merchant: 'Store A' },
      { netAmount: 500, vatAmount: 25, merchant: 'Store B' },
      { netAmount: 1.00, vatAmount: 0.05, merchant: 'Store C' },
      { netAmount: 9999, vatAmount: 499.95, merchant: 'Store D' },
      { netAmount: 300, vatAmount: 0, merchant: 'Store E' }, // zero VAT
    ];

    for (const params of testCases) {
      const jeLines = buildReceiptPostingJournalLines(
        params,
        expenseAccount.id,
        vatInputAccount.id,
        cashAccount.id,
      );

      const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

      expect(totalDebits).toBeCloseTo(totalCredits, 2);
    }
  });
});
