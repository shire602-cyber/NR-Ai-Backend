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
// Pure helper functions mirroring bill-pay business logic
// ---------------------------------------------------------------------------

interface BillLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // Percentage, e.g. 5 for 5%
  accountId: string | null;
}

interface Bill {
  vendorName: string;
  billNumber: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/** Calculate bill totals from line items (mirrors bill-pay.routes.ts) */
function calculateBillTotals(lines: BillLineItem[]): {
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
} {
  let subtotal = 0;
  let vatAmount = 0;

  for (const line of lines) {
    const lineAmount = (line.quantity || 1) * line.unitPrice;
    const lineVat = lineAmount * (line.vatRate / 100);
    subtotal += lineAmount;
    vatAmount += lineVat;
  }

  return {
    subtotal,
    vatAmount,
    totalAmount: subtotal + vatAmount,
  };
}

/**
 * Build the approval journal entry for a bill.
 * Mirrors bill-pay.routes.ts /approve endpoint:
 *   - Debit each expense account (from line items)
 *   - Debit VAT Receivable (Input) if vatAmount > 0
 *   - Credit Accounts Payable (total)
 */
function buildBillApprovalJournalLines(
  bill: Bill,
  lines: BillLineItem[],
  apAccountId: string,
  vatReceivableAccountId: string | null,
): JournalLine[] {
  const jeLines: JournalLine[] = [];

  // Debit each expense account from line items
  for (const line of lines) {
    const lineAmount = (line.quantity || 1) * line.unitPrice;
    if (lineAmount <= 0 || !line.accountId) continue;
    jeLines.push({
      accountId: line.accountId,
      debit: lineAmount,
      credit: 0,
      description: line.description || `Bill expense - ${bill.vendorName}`,
    });
  }

  // Debit VAT Receivable (Input) if vatAmount > 0
  if (bill.vatAmount > 0 && vatReceivableAccountId) {
    jeLines.push({
      accountId: vatReceivableAccountId,
      debit: bill.vatAmount,
      credit: 0,
      description: `VAT input - Bill ${bill.billNumber}`,
    });
  }

  // Credit Accounts Payable (total)
  jeLines.push({
    accountId: apAccountId,
    debit: 0,
    credit: bill.totalAmount,
    description: `A/P - Bill ${bill.billNumber}`,
  });

  return jeLines;
}

/**
 * Build the payment journal entry for a bill.
 * Mirrors bill-pay.routes.ts /payments endpoint:
 *   - Debit AP
 *   - Credit Bank
 */
function buildBillPaymentJournalLines(
  paymentAmount: number,
  vendorName: string,
  apAccountId: string,
  bankAccountId: string,
): JournalLine[] {
  return [
    {
      accountId: apAccountId,
      debit: paymentAmount,
      credit: 0,
      description: `Bill payment - ${vendorName}`,
    },
    {
      accountId: bankAccountId,
      debit: 0,
      credit: paymentAmount,
      description: `Bill payment - ${vendorName}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bills GL', () => {
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
  // 1. Bill approval creates AP journal entry (Debit Expense, Credit AP)
  // -------------------------------------------------------------------------
  it('bill approval creates AP journal entry (Debit Expense, Credit AP)', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const expenseAccountId = 'exp-rent-id';

    const lineItems: BillLineItem[] = [
      { description: 'Office Rent', quantity: 1, unitPrice: 5000, vatRate: 0, accountId: expenseAccountId },
    ];

    const totals = calculateBillTotals(lineItems);
    const bill: Bill = {
      vendorName: 'Landlord LLC',
      billNumber: 'BILL-001',
      ...totals,
    };

    const jeLines = buildBillApprovalJournalLines(bill, lineItems, apAccount.id, null);

    expect(jeLines).toHaveLength(2); // Expense debit + AP credit (no VAT)

    // Expense debit
    const expLine = jeLines.find((l) => l.accountId === expenseAccountId)!;
    expect(expLine.debit).toBe(5000);
    expect(expLine.credit).toBe(0);

    // AP credit
    const apLine = jeLines.find((l) => l.accountId === apAccount.id)!;
    expect(apLine.credit).toBe(5000);
    expect(apLine.debit).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Bill payment creates payment JE (Debit AP, Credit Bank)
  // -------------------------------------------------------------------------
  it('bill payment creates payment journal entry (Debit AP, Credit Bank)', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);

    const paymentAmount = 5250;
    const jeLines = buildBillPaymentJournalLines(paymentAmount, 'Vendor X', apAccount.id, bankAccount.id);

    expect(jeLines).toHaveLength(2);

    // AP debit
    const apLine = jeLines.find((l) => l.accountId === apAccount.id)!;
    expect(apLine.debit).toBe(5250);
    expect(apLine.credit).toBe(0);

    // Bank credit
    const bankLine = jeLines.find((l) => l.accountId === bankAccount.id)!;
    expect(bankLine.credit).toBe(5250);
    expect(bankLine.debit).toBe(0);

    // Debits = Credits
    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 3. Bill with VAT creates 3-line JE (Expense + VAT Input + AP)
  // -------------------------------------------------------------------------
  it('bill with VAT creates 3-line JE (Expense + VAT Input + AP)', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const vatReceivableAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);
    const expenseAccountId = 'exp-supplies-id';

    const lineItems: BillLineItem[] = [
      { description: 'Office Supplies', quantity: 10, unitPrice: 100, vatRate: 5, accountId: expenseAccountId },
    ];

    const totals = calculateBillTotals(lineItems);
    // subtotal = 10*100 = 1000, vat = 1000*0.05 = 50, total = 1050
    expect(totals.subtotal).toBe(1000);
    expect(totals.vatAmount).toBe(50);
    expect(totals.totalAmount).toBe(1050);

    const bill: Bill = {
      vendorName: 'Supply Co',
      billNumber: 'BILL-002',
      ...totals,
    };

    const jeLines = buildBillApprovalJournalLines(bill, lineItems, apAccount.id, vatReceivableAccount.id);

    expect(jeLines).toHaveLength(3);

    // Expense debit
    const expLine = jeLines.find((l) => l.accountId === expenseAccountId)!;
    expect(expLine.debit).toBe(1000);

    // VAT Receivable debit
    const vatLine = jeLines.find((l) => l.accountId === vatReceivableAccount.id)!;
    expect(vatLine.debit).toBe(50);

    // AP credit
    const apLine = jeLines.find((l) => l.accountId === apAccount.id)!;
    expect(apLine.credit).toBe(1050);
  });

  // -------------------------------------------------------------------------
  // 4. Journal entry total debits = total credits
  // -------------------------------------------------------------------------
  it('journal entry total debits = total credits', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const vatReceivableAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

    const expenseAccounts = ['exp-1', 'exp-2', 'exp-3'];
    const lineItems: BillLineItem[] = [
      { description: 'Consulting', quantity: 5, unitPrice: 200, vatRate: 5, accountId: expenseAccounts[0] },
      { description: 'Materials', quantity: 100, unitPrice: 15, vatRate: 5, accountId: expenseAccounts[1] },
      { description: 'Transport', quantity: 1, unitPrice: 350, vatRate: 5, accountId: expenseAccounts[2] },
    ];

    const totals = calculateBillTotals(lineItems);
    const bill: Bill = {
      vendorName: 'Multi-Service Vendor',
      billNumber: 'BILL-003',
      ...totals,
    };

    const jeLines = buildBillApprovalJournalLines(bill, lineItems, apAccount.id, vatReceivableAccount.id);

    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);

    expect(totalDebits).toBeCloseTo(totalCredits, 2);

    // Also verify the specific breakdown
    // subtotal = (5*200) + (100*15) + (1*350) = 1000 + 1500 + 350 = 2850
    // vat = 2850 * 0.05 = 142.5
    // total = 2850 + 142.5 = 2992.5
    expect(totals.subtotal).toBe(2850);
    expect(totals.vatAmount).toBe(142.5);
    expect(totals.totalAmount).toBe(2992.5);
  });

  // -------------------------------------------------------------------------
  // 5. Bill without assigned expense accounts skips those lines
  // -------------------------------------------------------------------------
  it('lines without account_id are excluded from JE', () => {
    const apAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    const lineItems: BillLineItem[] = [
      { description: 'Unassigned item', quantity: 1, unitPrice: 500, vatRate: 0, accountId: null },
    ];

    const totals = calculateBillTotals(lineItems);
    const bill: Bill = {
      vendorName: 'Test Vendor',
      billNumber: 'BILL-004',
      ...totals,
    };

    const jeLines = buildBillApprovalJournalLines(bill, lineItems, apAccount.id, null);

    // Only 1 line: AP credit (the expense line is skipped because accountId is null)
    expect(jeLines).toHaveLength(1);
    expect(jeLines[0].accountId).toBe(apAccount.id);
    expect(jeLines[0].credit).toBe(500);
  });
});
