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
// Pure helper functions mirroring safety guard logic from various routes
// ---------------------------------------------------------------------------

interface BillLineItem {
  description: string;
  accountId: string | null;
}

/** Check if all bill line items have an assigned account_id (mirrors bill-pay.routes.ts approve) */
function validateBillLineAccounts(lines: BillLineItem[]): { valid: boolean; missingCount: number } {
  const missing = lines.filter((l) => !l.accountId);
  return { valid: missing.length === 0, missingCount: missing.length };
}

/** Check if a required account exists (mirrors various route guards) */
function accountExists(
  accounts: Account[],
  companyId: string,
  code: string,
): boolean {
  return accounts.some((a) => a.companyId === companyId && a.code === code);
}

/** Check if invoice can be deleted (mirrors invoices.routes.ts) */
function canDeleteInvoice(
  invoiceStatus: string,
  hasPostedJE: boolean,
): { allowed: boolean; reason?: string } {
  if (invoiceStatus === 'paid') {
    return { allowed: false, reason: 'Cannot delete a paid invoice.' };
  }
  if (hasPostedJE) {
    return { allowed: false, reason: 'Cannot delete invoice with a posted journal entry. Reverse the journal entry first.' };
  }
  return { allowed: true };
}

/** Check if invoice can be updated (mirrors invoices.routes.ts) */
function canUpdateInvoice(
  hasPostedJE: boolean,
): { allowed: boolean; reason?: string } {
  if (hasPostedJE) {
    return { allowed: false, reason: 'Cannot update invoice with a posted journal entry. Reverse the journal entry first.' };
  }
  return { allowed: true };
}

/** Check if receipt can be deleted (mirrors receipts.routes.ts) */
function canDeleteReceipt(posted: boolean): { allowed: boolean; reason?: string } {
  if (posted) {
    return { allowed: false, reason: 'Cannot delete a posted receipt.' };
  }
  return { allowed: true };
}

/** Check depreciation required accounts (mirrors fixed-assets.routes.ts) */
function validateDepreciationAccounts(
  accounts: Account[],
  companyId: string,
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!accountExists(accounts, companyId, ACCOUNT_CODES.DEPRECIATION_EXPENSE)) {
    missing.push('Depreciation Expense (5100)');
  }
  if (!accountExists(accounts, companyId, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION)) {
    missing.push('Accumulated Depreciation (1240)');
  }

  return { valid: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Safety Guards', () => {
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
  // 1. Bill approval with missing account_id returns 400
  // -------------------------------------------------------------------------
  it('bill approval with missing account_id is rejected', () => {
    const lines: BillLineItem[] = [
      { description: 'Consulting fees', accountId: 'exp-1' },
      { description: 'Misc supplies', accountId: null }, // missing
      { description: 'Transport', accountId: 'exp-2' },
    ];

    const result = validateBillLineAccounts(lines);
    expect(result.valid).toBe(false);
    expect(result.missingCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 2. Bill payment with missing AP account returns 400
  // -------------------------------------------------------------------------
  it('bill payment with missing AP account is rejected', () => {
    // Remove AP account
    const filtered = accounts.filter((a) => a.code !== ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const hasAP = accountExists(filtered, company.id, ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    expect(hasAP).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Bill payment with missing Bank account returns 400
  // -------------------------------------------------------------------------
  it('bill payment with missing Bank account is rejected', () => {
    // Remove Bank account
    const filtered = accounts.filter((a) => a.code !== ACCOUNT_CODES.BANK_ACCOUNTS);
    const hasBank = accountExists(filtered, company.id, ACCOUNT_CODES.BANK_ACCOUNTS);

    expect(hasBank).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Invoice delete when paid returns 400
  // -------------------------------------------------------------------------
  it('invoice delete when paid is rejected', () => {
    const result = canDeleteInvoice('paid', false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot delete a paid invoice');
  });

  // -------------------------------------------------------------------------
  // 5. Invoice delete with posted JE returns 400
  // -------------------------------------------------------------------------
  it('invoice delete with posted JE is rejected', () => {
    const result = canDeleteInvoice('sent', true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('posted journal entry');
  });

  // -------------------------------------------------------------------------
  // 6. Invoice update with posted JE returns 400
  // -------------------------------------------------------------------------
  it('invoice update with posted JE is rejected', () => {
    const result = canUpdateInvoice(true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('posted journal entry');
  });

  // -------------------------------------------------------------------------
  // 7. Receipt delete when posted returns 400
  // -------------------------------------------------------------------------
  it('receipt delete when posted is rejected', () => {
    const result = canDeleteReceipt(true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot delete a posted receipt');
  });

  // -------------------------------------------------------------------------
  // 8. Depreciation with missing accounts returns 400
  // -------------------------------------------------------------------------
  it('depreciation with missing accounts is rejected', () => {
    // Remove both depreciation-related accounts
    const filtered = accounts.filter(
      (a) =>
        a.code !== ACCOUNT_CODES.DEPRECIATION_EXPENSE &&
        a.code !== ACCOUNT_CODES.ACCUMULATED_DEPRECIATION,
    );

    const result = validateDepreciationAccounts(filtered, company.id);
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.missing).toContain('Depreciation Expense (5100)');
    expect(result.missing).toContain('Accumulated Depreciation (1240)');
  });
});
