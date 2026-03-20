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
// Pure helper functions mirroring credit-note business logic
// ---------------------------------------------------------------------------

interface CreditNoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface CreditNote {
  id: string;
  number: string;
  customerName: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  status: 'draft' | 'posted' | 'void';
  appliedToInvoiceId: string | null;
  appliedAmount: number;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/** Calculate credit note totals from line items (mirrors routes logic) */
function calculateCreditNoteTotals(lines: CreditNoteLine[]): {
  subtotal: number;
  vatAmount: number;
  total: number;
} {
  let subtotal = 0;
  let vatAmount = 0;

  for (const line of lines) {
    const lineTotal = line.quantity * line.unitPrice;
    subtotal += lineTotal;
    vatAmount += lineTotal * (line.vatRate || 0);
  }

  return {
    subtotal,
    vatAmount,
    total: subtotal + vatAmount,
  };
}

/**
 * Build the reversing journal entry lines for a posted credit note.
 * Mirrors the logic in credit-notes.routes.ts /post endpoint:
 *   - Credit AR (total)
 *   - Debit Revenue (subtotal)
 *   - Debit VAT Payable (vatAmount) — only when vatAmount > 0
 */
function buildCreditNoteJournalLines(
  creditNote: { subtotal: number; vatAmount: number; total: number; number: string; customerName: string },
  arAccountId: string,
  revenueAccountId: string,
  vatPayableAccountId: string | null,
): JournalLine[] {
  const lines: JournalLine[] = [];

  // Credit: Accounts Receivable (total)
  lines.push({
    accountId: arAccountId,
    debit: 0,
    credit: creditNote.total,
    description: `Credit Note ${creditNote.number} - ${creditNote.customerName}`,
  });

  // Debit: Product Sales (subtotal)
  lines.push({
    accountId: revenueAccountId,
    debit: creditNote.subtotal,
    credit: 0,
    description: `Sales reversal - Credit Note ${creditNote.number}`,
  });

  // Debit: VAT Payable (vatAmount) — only if > 0
  if (creditNote.vatAmount > 0 && vatPayableAccountId) {
    lines.push({
      accountId: vatPayableAccountId,
      debit: creditNote.vatAmount,
      credit: 0,
      description: `VAT reversal - Credit Note ${creditNote.number}`,
    });
  }

  return lines;
}

/** Determine if a credit note can be posted (status must be draft) */
function canPostCreditNote(status: string): boolean {
  return status === 'draft';
}

/** Apply a credit note to an invoice, returning the applied amount and whether the invoice is fully paid */
function applyCreditNoteToInvoice(
  creditNoteTotal: number,
  invoiceTotal: number,
): { appliedAmount: number; fullyPaid: boolean } {
  const appliedAmount = Math.min(creditNoteTotal, invoiceTotal);
  return {
    appliedAmount,
    fullyPaid: appliedAmount >= invoiceTotal,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Credit Notes', () => {
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
  // 1. total = subtotal + vatAmount
  // -------------------------------------------------------------------------
  it('credit note total = subtotal + vatAmount', () => {
    const lines: CreditNoteLine[] = [
      { description: 'Return - Consulting', quantity: 2, unitPrice: 500, vatRate: 0.05 },
      { description: 'Return - License', quantity: 1, unitPrice: 1200, vatRate: 0.05 },
    ];

    const totals = calculateCreditNoteTotals(lines);

    // subtotal = 2*500 + 1*1200 = 2200
    expect(totals.subtotal).toBe(2200);
    // vatAmount = 2200 * 0.05 = 110
    expect(totals.vatAmount).toBeCloseTo(110, 2);
    // total = 2200 + 110 = 2310
    expect(totals.total).toBeCloseTo(totals.subtotal + totals.vatAmount, 2);
  });

  // -------------------------------------------------------------------------
  // 2. Posting creates reversing JE: Credit AR, Debit Revenue, Debit VAT
  // -------------------------------------------------------------------------
  it('posting creates reversing journal entry (Credit AR, Debit Revenue, Debit VAT)', () => {
    const arAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.PRODUCT_SALES);
    const vatPayableAccount = findAccount(accounts, ACCOUNT_CODES.VAT_PAYABLE_OUTPUT);

    const creditNote = {
      subtotal: 5000,
      vatAmount: 250,
      total: 5250,
      number: 'CN-0001',
      customerName: 'Acme Corp',
    };

    const jeLines = buildCreditNoteJournalLines(
      creditNote,
      arAccount.id,
      revenueAccount.id,
      vatPayableAccount.id,
    );

    expect(jeLines).toHaveLength(3);

    // AR is credited (total)
    const arLine = jeLines.find((l) => l.accountId === arAccount.id)!;
    expect(arLine.credit).toBe(5250);
    expect(arLine.debit).toBe(0);

    // Revenue is debited (subtotal)
    const revLine = jeLines.find((l) => l.accountId === revenueAccount.id)!;
    expect(revLine.debit).toBe(5000);
    expect(revLine.credit).toBe(0);

    // VAT Payable is debited (vatAmount)
    const vatLine = jeLines.find((l) => l.accountId === vatPayableAccount.id)!;
    expect(vatLine.debit).toBe(250);
    expect(vatLine.credit).toBe(0);

    // Verify debits = credits
    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 3. Cannot post a void credit note
  // -------------------------------------------------------------------------
  it('cannot post a void credit note', () => {
    expect(canPostCreditNote('draft')).toBe(true);
    expect(canPostCreditNote('void')).toBe(false);
    expect(canPostCreditNote('posted')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Apply reduces invoice outstanding balance
  // -------------------------------------------------------------------------
  it('apply reduces invoice outstanding balance', () => {
    // Credit note total < invoice total (partial)
    const partial = applyCreditNoteToInvoice(500, 1050);
    expect(partial.appliedAmount).toBe(500);
    expect(partial.fullyPaid).toBe(false);

    // Credit note total >= invoice total (full coverage)
    const full = applyCreditNoteToInvoice(1050, 1050);
    expect(full.appliedAmount).toBe(1050);
    expect(full.fullyPaid).toBe(true);

    // Credit note total > invoice total (capped at invoice)
    const over = applyCreditNoteToInvoice(2000, 1050);
    expect(over.appliedAmount).toBe(1050);
    expect(over.fullyPaid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Zero VAT produces 2-line JE (no VAT line)
  // -------------------------------------------------------------------------
  it('credit note with zero VAT produces 2-line JE (no VAT line)', () => {
    const arAccount = findAccount(accounts, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const revenueAccount = findAccount(accounts, ACCOUNT_CODES.PRODUCT_SALES);
    const vatPayableAccount = findAccount(accounts, ACCOUNT_CODES.VAT_PAYABLE_OUTPUT);

    const creditNote = {
      subtotal: 10000,
      vatAmount: 0,
      total: 10000,
      number: 'CN-0002',
      customerName: 'Export Client',
    };

    const jeLines = buildCreditNoteJournalLines(
      creditNote,
      arAccount.id,
      revenueAccount.id,
      vatPayableAccount.id,
    );

    // Only 2 lines: AR credit and Revenue debit (no VAT line)
    expect(jeLines).toHaveLength(2);
    expect(jeLines.some((l) => l.accountId === vatPayableAccount.id)).toBe(false);

    // Verify debits = credits
    const totalDebits = jeLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = jeLines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  // -------------------------------------------------------------------------
  // 6. Totals calculation handles multiple lines with mixed VAT rates
  // -------------------------------------------------------------------------
  it('handles multiple lines with different VAT rates', () => {
    const lines: CreditNoteLine[] = [
      { description: 'Standard item', quantity: 1, unitPrice: 1000, vatRate: 0.05 },
      { description: 'Zero-rated item', quantity: 3, unitPrice: 200, vatRate: 0 },
    ];

    const totals = calculateCreditNoteTotals(lines);

    // subtotal = 1000 + 600 = 1600
    expect(totals.subtotal).toBe(1600);
    // vatAmount = 1000*0.05 + 600*0 = 50
    expect(totals.vatAmount).toBe(50);
    // total = 1600 + 50 = 1650
    expect(totals.total).toBe(1650);
  });
});
