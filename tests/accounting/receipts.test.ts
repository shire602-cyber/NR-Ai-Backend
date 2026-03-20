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

describe('Receipts', () => {
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

  it('receipt posting creates journal entry', async () => {
    const expenseAccount = findAccount(accounts, '5050'); // Office Supplies
    const cashAccount = findAccount(accounts, ACCOUNT_CODES.CASH);
    const vatInputAccount = findAccount(accounts, ACCOUNT_CODES.VAT_RECEIVABLE_INPUT);

    // Create a receipt
    const receipt = await storage.createReceipt({
      companyId: company.id,
      merchant: 'Office Store LLC',
      date: '2024-06-15',
      amount: '200.00',
      vatAmount: '10.00',
      currency: 'AED',
      category: 'office_supplies',
      accountId: expenseAccount.id,
      paymentAccountId: cashAccount.id,
      posted: false,
      uploadedBy: user.id,
    } as any);

    expect(receipt.posted).toBe(false);
    expect(receipt.journalEntryId).toBeNull();

    // Simulate posting: create the journal entry for the receipt
    const receiptAmount = parseFloat(receipt.amount!);
    const receiptVat = parseFloat(receipt.vatAmount!);
    const totalPaid = receiptAmount + receiptVat;

    const { entry } = await createBalancedJournalEntry(
      storage,
      company.id,
      user.id,
      [
        // Debit expense account (net amount)
        { accountId: expenseAccount.id, debit: receiptAmount.toFixed(2) },
        // Debit VAT receivable (input VAT)
        { accountId: vatInputAccount.id, debit: receiptVat.toFixed(2) },
        // Credit cash (total paid)
        { accountId: cashAccount.id, credit: totalPaid.toFixed(2) },
      ],
      { source: 'receipt', memo: `Receipt: ${receipt.merchant}` },
    );

    // Update receipt as posted with the journal entry ID
    const postedReceipt = await storage.updateReceipt(receipt.id, {
      posted: true,
      journalEntryId: entry.id,
    });

    expect(postedReceipt.posted).toBe(true);
    expect(postedReceipt.journalEntryId).toBe(entry.id);

    // Verify the journal entry was created correctly
    const savedEntry = await storage.getJournalEntry(entry.id);
    expect(savedEntry).toBeDefined();
    expect(savedEntry!.source).toBe('receipt');

    const lines = await storage.getJournalLinesByEntryId(entry.id);
    expect(lines).toHaveLength(3);

    // Verify debits = credits
    const totalDebits = lines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const totalCredits = lines.reduce((s, l) => s + parseFloat(l.credit), 0);
    expect(totalDebits).toBeCloseTo(totalCredits, 2);
    expect(totalDebits).toBe(210); // 200 + 10
  });

  it('receipt amount + VAT = total', async () => {
    const testCases = [
      { amount: '100.00', vatAmount: '5.00', expectedTotal: 105 },
      { amount: '500.00', vatAmount: '25.00', expectedTotal: 525 },
      { amount: '1.00', vatAmount: '0.05', expectedTotal: 1.05 },
      { amount: '9999.00', vatAmount: '499.95', expectedTotal: 10498.95 },
    ];

    for (const tc of testCases) {
      const receipt = await storage.createReceipt({
        companyId: company.id,
        merchant: 'Test Merchant',
        date: '2024-01-01',
        amount: tc.amount,
        vatAmount: tc.vatAmount,
        currency: 'AED',
        posted: false,
        uploadedBy: user.id,
      } as any);

      const savedReceipt = await storage.getReceipt(receipt.id);
      const amount = parseFloat(savedReceipt!.amount!);
      const vatAmount = parseFloat(savedReceipt!.vatAmount!);
      const total = amount + vatAmount;

      expect(total).toBeCloseTo(tc.expectedTotal, 2);

      // VAT should be 5% of amount
      const expectedVat = parseFloat((amount * 0.05).toFixed(2));
      expect(vatAmount).toBe(expectedVat);
    }
  });

  it('posted receipt marks receipt as posted', async () => {
    const expenseAccount = findAccount(accounts, '5030'); // Utilities
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);

    // Create unposted receipt
    const receipt = await storage.createReceipt({
      companyId: company.id,
      merchant: 'DEWA',
      date: '2024-03-01',
      amount: '450.00',
      vatAmount: '22.50',
      currency: 'AED',
      category: 'utilities',
      accountId: expenseAccount.id,
      paymentAccountId: bankAccount.id,
      posted: false,
      uploadedBy: user.id,
    } as any);

    // Verify initial state
    expect(receipt.posted).toBe(false);
    expect(receipt.journalEntryId).toBeNull();

    // Get all receipts for company - should include the unposted one
    const allReceipts = await storage.getReceiptsByCompanyId(company.id);
    const unpostedReceipts = allReceipts.filter((r) => !r.posted);
    expect(unpostedReceipts.length).toBeGreaterThanOrEqual(1);

    // Post the receipt
    const updated = await storage.updateReceipt(receipt.id, {
      posted: true,
      journalEntryId: 'some-journal-entry-id',
    });

    expect(updated.posted).toBe(true);
    expect(updated.journalEntryId).toBe('some-journal-entry-id');

    // Verify the update persisted
    const fetched = await storage.getReceipt(receipt.id);
    expect(fetched!.posted).toBe(true);
    expect(fetched!.journalEntryId).toBe('some-journal-entry-id');

    // The unposted count should now be reduced
    const afterPostReceipts = await storage.getReceiptsByCompanyId(company.id);
    const stillUnposted = afterPostReceipts.filter((r) => !r.posted);
    expect(stillUnposted.length).toBe(unpostedReceipts.length - 1);
  });

  it('receipt links to expense and payment accounts correctly', async () => {
    const officeSupplies = findAccount(accounts, '5050');
    const bankAccount = findAccount(accounts, ACCOUNT_CODES.BANK_ACCOUNTS);

    const receipt = await storage.createReceipt({
      companyId: company.id,
      merchant: 'Staples',
      date: '2024-04-20',
      amount: '350.00',
      vatAmount: '17.50',
      currency: 'AED',
      category: 'office_supplies',
      accountId: officeSupplies.id,
      paymentAccountId: bankAccount.id,
      posted: false,
      uploadedBy: user.id,
    } as any);

    expect(receipt.accountId).toBe(officeSupplies.id);
    expect(receipt.paymentAccountId).toBe(bankAccount.id);

    // Verify the linked accounts exist and are of the right type
    const expenseAcct = await storage.getAccount(receipt.accountId!);
    expect(expenseAcct).toBeDefined();
    expect(expenseAcct!.type).toBe('expense');

    const paymentAcct = await storage.getAccount(receipt.paymentAccountId!);
    expect(paymentAcct).toBeDefined();
    expect(paymentAcct!.type).toBe('asset');
  });
});
